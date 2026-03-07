// controllers/mpesaController.js
import axios from "axios";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import MpesaPendingBooking from "../models/MpesaPendingBooking.js";

// ===============================
// M-PESA CREDENTIALS
// ===============================
const MPESA_CONFIG = {
  consumerKey: process.env.DARAJA_CONSUMER_KEY || process.env.MPESA_CONSUMER_KEY,
  consumerSecret: process.env.DARAJA_CONSUMER_SECRET || process.env.MPESA_CONSUMER_SECRET,
  shortCode: process.env.DARAJA_SHORTCODE || process.env.MPESA_SHORTCODE,
  passkey: process.env.DARAJA_PASSKEY || process.env.MPESA_PASSKEY,
  callbackUrl: process.env.MPESA_CALLBACK_URL || process.env.APP_BASE_URL + "/api/payments/mpesa/callback",
  apiUrl: process.env.DARAJA_BASE_URL || "https://sandbox.safaricom.co.ke"
};

const FIXED_DEPOSIT_AMOUNT = 5;

// ===============================
// VALIDATE CONFIG ON STARTUP
// ===============================
function validateConfig() {
  console.log("🔍 Checking M-Pesa configuration...");
  
  const missing = [];
  if (!MPESA_CONFIG.consumerKey) missing.push("DARAJA_CONSUMER_KEY");
  if (!MPESA_CONFIG.consumerSecret) missing.push("DARAJA_CONSUMER_SECRET");
  if (!MPESA_CONFIG.shortCode) missing.push("DARAJA_SHORTCODE");
  if (!MPESA_CONFIG.passkey) missing.push("DARAJA_PASSKEY");
  
  if (missing.length > 0) {
    console.error("❌ MISSING M-PESA CONFIG:", missing.join(", "));
    return false;
  }
  
  console.log("✅ M-Pesa config validated:", {
    shortCode: MPESA_CONFIG.shortCode,
    apiUrl: MPESA_CONFIG.apiUrl,
    callbackUrl: MPESA_CONFIG.callbackUrl,
    consumerKeyLength: MPESA_CONFIG.consumerKey?.length,
    passkeyLength: MPESA_CONFIG.passkey?.length
  });
  
  return true;
}

validateConfig();

// ===============================
// GET ACCESS TOKEN
// ===============================
async function getAccessToken() {
  try {
    if (!MPESA_CONFIG.consumerKey || !MPESA_CONFIG.consumerSecret) {
      throw new Error("M-Pesa credentials not configured");
    }

    const auth = Buffer.from(
      `${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`
    ).toString("base64");

    console.log("🔑 Requesting M-Pesa token...");

    const response = await axios.get(
      `${MPESA_CONFIG.apiUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`
        },
        timeout: 15000
      }
    );

    console.log("✅ M-Pesa token obtained successfully");
    return response.data.access_token;
    
  } catch (error) {
    console.error("❌ M-Pesa auth error:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: `${MPESA_CONFIG.apiUrl}/oauth/v1/generate`
    });
    throw new Error(`M-Pesa authentication failed: ${error.response?.data?.errorMessage || error.message}`);
  }
}

// ===============================
// GENERATE TIMESTAMP
// ===============================
function generateTimestamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// ===============================
// GENERATE PASSWORD
// ===============================
function generatePassword(timestamp) {
  const data = `${MPESA_CONFIG.shortCode}${MPESA_CONFIG.passkey}${timestamp}`;
  return Buffer.from(data).toString("base64");
}

// ===============================
// FORMAT PHONE NUMBER
// ===============================
function formatPhoneNumber(phone) {
  let formatted = phone.replace(/\D/g, "");

  if (formatted.startsWith("254")) {
    formatted = formatted.slice(0, 12);
  } else if (formatted.startsWith("0")) {
    formatted = "254" + formatted.slice(1);
  } else if (formatted.startsWith("7") || formatted.startsWith("1")) {
    formatted = "254" + formatted;
  } else {
    throw new Error("Invalid phone number format");
  }

  if (!/^254[17]\d{8}$/.test(formatted)) {
    throw new Error("Invalid phone number format after normalization");
  }

  return formatted;
}

// ===============================
// INITIATE M-PESA PAYMENT (DEPOSIT OR FULL)
// ===============================
export async function initiateMpesaPayment(req, res) {
  try {
    console.log("\n📥 M-Pesa initiate request received");
    console.log("User:", req.user);
    console.log("Body:", req.body);

    if (!validateConfig()) {
      console.error("❌ M-Pesa not configured properly");
      return res.status(500).json({
        success: false,
        error: "M-Pesa is not properly configured. Please contact support."
      });
    }

    const { 
      vehicleId, 
      startDate, 
      endDate, 
      totalPrice,
      paymentType,
      fullAmount,
      renterPhone 
    } = req.body;
    
    const userId = req.user?.id || req.user?.userId || req.user?._id;

    if (!userId) {
      console.error("❌ No user ID found in request");
      return res.status(401).json({
        success: false,
        error: "User not authenticated"
      });
    }

    if (!vehicleId || !startDate || !endDate || !renterPhone) {
      console.error("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["vehicleId", "startDate", "endDate", "renterPhone"]
      });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      console.error("❌ Vehicle not found:", vehicleId);
      return res.status(404).json({
        success: false,
        error: "Vehicle not found"
      });
    }

    console.log("✅ Vehicle found:", vehicle.name || vehicle._id);

    const start = new Date(startDate);
    const end = new Date(endDate);

const conflict = await Booking.findOne({
  vehicleId,
  $or: [
    { paymentStatus: "confirmed" },
    { depositPaid: true }
  ],
  $and: [
    { startDate: { $lt: end } },   // STRICT <
    { endDate: { $gt: start } }    // STRICT >
  ]
});

if (conflict) {
  console.error("❌ Dates conflict with existing rental");
  return res.status(409).json({
    success: false,
    error: "These dates are already booked for this vehicle"
  });
}


    const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    if (nights < 1) {
      return res.status(400).json({
        success: false,
        error: "Minimum 1 night required"
      });
    }

    const isFullPayment = paymentType === 'FULL';
    const calculatedTotal = fullAmount || totalPrice;
    const amountToCharge = isFullPayment ? calculatedTotal : FIXED_DEPOSIT_AMOUNT;
    const calculatedBalance = isFullPayment ? 0 : (calculatedTotal - FIXED_DEPOSIT_AMOUNT);

    console.log("✅ Booking validation passed:", { 
      nights, 
      paymentType,
      amountToCharge,
      fixedDeposit: FIXED_DEPOSIT_AMOUNT,
      balanceAmount: calculatedBalance
    });

    let formattedPhone;
    try {
      formattedPhone = formatPhoneNumber(renterPhone);
    } catch (phoneError) {
      console.error("❌ Phone formatting error:", phoneError.message);
      return res.status(400).json({
        success: false,
        error: "Invalid phone number. Use format: 0712345678 or 254712345678"
      });
    }

    console.log("✅ Phone formatted correctly:", formattedPhone);

    const existingPending = await MpesaPendingBooking.findOne({
      userId,
      vehicleId,
      status: "pending"
    });

    if (existingPending) {
      console.error("❌ Duplicate pending payment detected");
      return res.status(409).json({
        success: false,
        error: "You already have a pending payment for this vehicle. Please complete or cancel it first."
      });
    }

    const bookingId = `mpesa_${Date.now()}_${vehicleId}`;

    const pendingBooking = await MpesaPendingBooking.create({
      bookingId,
      vehicleId,
      userId,
      startDate: start,
      endDate: end,
      totalPrice: calculatedTotal,
      nights,
      renterPhone: formattedPhone,
      status: "pending",
      paymentType: paymentType || 'DEPOSIT',
      depositAmount: FIXED_DEPOSIT_AMOUNT,
      balanceAmount: calculatedBalance,
      depositPaid: false,
      balancePaid: false
    });

    console.log("✅ Pending booking created:", bookingId);

    let accessToken;
    try {
      accessToken = await getAccessToken();
    } catch (tokenError) {
      console.error("❌ Failed to get access token:", tokenError.message);
      await MpesaPendingBooking.findByIdAndDelete(pendingBooking._id);
      return res.status(500).json({
        success: false,
        error: "Failed to authenticate with M-Pesa",
        details: tokenError.message
      });
    }

    const timestamp = generateTimestamp();
    const password = generatePassword(timestamp);

    const stkPushPayload = {
      BusinessShortCode: MPESA_CONFIG.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amountToCharge),
      PartyA: formattedPhone,
      PartyB: MPESA_CONFIG.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: MPESA_CONFIG.callbackUrl,
      AccountReference: bookingId,
      TransactionDesc: `Booking ${isFullPayment ? 'Full' : 'Deposit'} ${bookingId.slice(-8)}`
    };

    console.log("📤 Sending STK Push:", {
      phone: formattedPhone,
      amount: stkPushPayload.Amount,
      type: isFullPayment ? 'FULL' : 'DEPOSIT',
      bookingId,
      callback: MPESA_CONFIG.callbackUrl
    });

    let stkResponse;
    try {
      stkResponse = await axios.post(
        `${MPESA_CONFIG.apiUrl}/mpesa/stkpush/v1/processrequest`,
        stkPushPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          timeout: 30000
        }
      );

      console.log("✅ STK Push successful:", stkResponse.data);

    } catch (stkError) {
      console.error("❌ STK Push failed:", {
        message: stkError.message,
        status: stkError.response?.status,
        data: stkError.response?.data
      });

      await MpesaPendingBooking.findByIdAndDelete(pendingBooking._id);

      return res.status(500).json({
        success: false,
        error: "Failed to send payment request",
        details: stkError.response?.data?.errorMessage || stkError.message
      });
    }

    pendingBooking.CheckoutRequestID = stkResponse.data.CheckoutRequestID;
    pendingBooking.MerchantRequestID = stkResponse.data.MerchantRequestID;
    await pendingBooking.save();

    console.log("✅ M-Pesa payment initiated successfully\n");

    return res.json({
      success: true,
      bookingId,
      CheckoutRequestID: stkResponse.data.CheckoutRequestID,
      message: isFullPayment 
        ? "STK Push sent for full payment. Please check your phone and enter M-Pesa PIN"
        : `STK Push sent for deposit (KES ${FIXED_DEPOSIT_AMOUNT}). Balance due before check-in. Please check your phone and enter M-Pesa PIN`
    });

  } catch (error) {
    console.error("❌ M-Pesa initiate error:", {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

// ===============================
// M-PESA CALLBACK (FROM SAFARICOM)
// ===============================
export async function darajaCallback(req, res) {
  console.log("🔥 CALLBACK HIT AT", new Date().toISOString());

  try {
    console.log("\n🚨 M-Pesa callback received");
    console.log(JSON.stringify(req.body, null, 2));

    const { Body } = req.body;
    if (!Body || !Body.stkCallback) {
      console.warn("⚠️ Invalid callback structure");
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } = Body.stkCallback;

    console.log("Callback data:", { ResultCode, ResultDesc, CheckoutRequestID });

    const pendingBooking = await MpesaPendingBooking.findOne({ CheckoutRequestID }).populate("vehicleId");

    if (!pendingBooking) {
      console.warn("⚠️ No pending booking found for CheckoutRequestID:", CheckoutRequestID);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    console.log("📝 Found pending booking:", pendingBooking.bookingId, "Type:", pendingBooking.paymentType);

    let mpesaReceiptNumber = null;
    let amountPaid = null;
    let transactionDate = null;

    if (CallbackMetadata && CallbackMetadata.Item) {
      CallbackMetadata.Item.forEach(item => {
        if (item.Name === "MpesaReceiptNumber") mpesaReceiptNumber = item.Value;
        if (item.Name === "Amount") amountPaid = item.Value;
        if (item.Name === "TransactionDate") transactionDate = item.Value;
      });
    }

    console.log("Payment details:", { mpesaReceiptNumber, amountPaid, transactionDate });

    const isBalancePayment = pendingBooking.paymentType === 'BALANCE';
    const isFullPayment = pendingBooking.paymentType === 'FULL';

    if (ResultCode === 0) {
      console.log("✅ Payment successful");

      if (isBalancePayment) {
        console.log("💰 Processing BALANCE payment");
        
        const booking = await Booking.findOne({ 
          bookingId: pendingBooking.originalBookingId 
        });

        if (!booking) {
          console.error("❌ Original booking not found for balance payment");
          pendingBooking.status = "failed";
          await pendingBooking.save();
          return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        if (booking.balancePaid === true) {
          console.warn("⚠️ Balance already paid, marking as duplicate");
          pendingBooking.status = "duplicate";
          await pendingBooking.save();
          return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        booking.balancePaid = true;
        booking.balanceTxHash = mpesaReceiptNumber;
        booking.balancePaidAt = new Date();
        booking.paymentStatus = "confirmed";

        await booking.save();

        console.log("✅ Booking updated with balance payment:", { bookingId: booking.bookingId, balancePaid: booking.balancePaid });

        pendingBooking.status = "confirmed";
        pendingBooking.bookingDbId = booking._id;
        pendingBooking.mpesaReceiptNumber = mpesaReceiptNumber;
        pendingBooking.amountPaid = amountPaid;
        pendingBooking.transactionDate = transactionDate ? new Date(transactionDate) : new Date();
        pendingBooking.balancePaid = true;
        await pendingBooking.save();

        console.log("✅ Pending balance linked to booking:", booking._id);

      } else {
        console.log(isFullPayment ? "💳 Processing FULL payment" : "💰 Processing DEPOSIT payment");

        let booking = await Booking.findOne({ bookingId: pendingBooking.bookingId });

        if (booking) {
          console.warn("⚠️ Booking already exists, marking as duplicate");
          pendingBooking.status = "duplicate";
          pendingBooking.bookingDbId = booking._id;
          await pendingBooking.save();
          return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        console.log("🛠 Creating new Booking record");

        booking = await Booking.create({
          vehicleId: pendingBooking.vehicleId._id,
          userId: pendingBooking.userId,
          startDate: pendingBooking.startDate,
          endDate: pendingBooking.endDate,
          totalPrice: pendingBooking.totalPrice,
          paymentMethod: "mpesa",
          mpesaReceiptNumber,
          paymentStatus: isFullPayment ? "confirmed" : "pending",
          nights: pendingBooking.nights,
          bookingId: pendingBooking.bookingId,
          renterPhone: pendingBooking.renterPhone,

          depositPaid: true,
          depositAmount: isFullPayment ? pendingBooking.totalPrice : FIXED_DEPOSIT_AMOUNT,
          depositTxHash: mpesaReceiptNumber,
          depositPaidAt: new Date(),

          balancePaid: isFullPayment,
          balanceAmount: pendingBooking.balanceAmount || 0,
          balanceTxHash: isFullPayment ? mpesaReceiptNumber : null,
          balancePaidAt: isFullPayment ? new Date() : null,

          // access-code removed
        });
        console.log("✅ Booking created:", { bookingId: booking.bookingId, paymentStatus: booking.paymentStatus, depositPaid: booking.depositPaid, balancePaid: booking.balancePaid });

        pendingBooking.status = "confirmed";
        pendingBooking.bookingDbId = booking._id;
        pendingBooking.mpesaReceiptNumber = mpesaReceiptNumber;
        pendingBooking.amountPaid = amountPaid;
        pendingBooking.transactionDate = transactionDate ? new Date(transactionDate) : new Date();
        pendingBooking.depositPaid = true;
        await pendingBooking.save();

        console.log("✅ Pending booking linked to booking:", booking._id);
      }

    } else {
      console.error("❌ Payment failed:", ResultDesc);
      pendingBooking.status = ResultCode === 1032 ? "cancelled" : "failed";
      await pendingBooking.save();
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  } catch (error) {
    console.error("❌ Callback error:", error);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}

// ===============================
// INITIATE BALANCE PAYMENT
// ===============================
export async function initiateBalancePayment(req, res) {
  try {
    console.log("\n📥 M-Pesa balance payment request received");
    console.log("Request body:", req.body);
    console.log("User:", req.user);
    
    const { bookingId, renterPhone } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?._id;

    // Validation
    if (!userId) {
      console.error("❌ User not authenticated");
      return res.status(401).json({
        success: false,
        error: "User not authenticated"
      });
    }

    if (!bookingId) {
      console.error("❌ Missing bookingId");
      return res.status(400).json({
        success: false,
        error: "Missing bookingId"
      });
    }

    // Find the original booking
    const booking = await Booking.findOne({
      bookingId,
      userId,
      depositPaid: true,
      balancePaid: false
    }).populate("vehicleId");

    if (!booking) {
      console.error("❌ Booking not found or ineligible for balance payment");
      return res.status(404).json({
        success: false,
        error: "Booking not found or balance already paid"
      });
    }

    console.log("✅ Found booking:", {
      bookingId: booking.bookingId,
      depositPaid: booking.depositPaid,
      balancePaid: booking.balancePaid,
      balanceAmount: booking.balanceAmount
    });

    // Validate balance amount
    if (!booking.balanceAmount || booking.balanceAmount <= 0) {
      console.error("❌ No balance due");
      return res.status(400).json({
        success: false,
        error: "No balance amount due for this booking"
      });
    }

    // Format phone number
    let formattedPhone;
    try {
      formattedPhone = formatPhoneNumber(renterPhone || booking.renterPhone);
      console.log("✅ Phone formatted:", formattedPhone);
    } catch (phoneError) {
      console.error("❌ Phone formatting error:", phoneError.message);
      return res.status(400).json({
        success: false,
        error: "Invalid phone number format. Use: 0712345678 or 254712345678"
      });
    }

    // Check for duplicate pending balance payment
    const existingPending = await MpesaPendingBooking.findOne({
      originalBookingId: bookingId,
      paymentType: "BALANCE",
      status: "pending"
    });

    if (existingPending) {
      console.error("❌ Duplicate balance payment pending");
      return res.status(409).json({
        success: false,
        error: "Balance payment already pending. Please complete it first."
      });
    }

    // Get M-Pesa access token
    let accessToken;
    try {
      accessToken = await getAccessToken();
      console.log("✅ M-Pesa token obtained");
    } catch (tokenError) {
      console.error("❌ Token error:", tokenError.message);
      return res.status(500).json({
        success: false,
        error: "Failed to authenticate with M-Pesa",
        details: tokenError.message
      });
    }

    // Create balance booking ID
    const balanceBookingId = `${bookingId}_balance_${Date.now()}`;
    console.log("📝 Balance booking ID:", balanceBookingId);

    // Create pending balance payment record
    const pendingBalance = await MpesaPendingBooking.create({
      bookingId: balanceBookingId,
      vehicleId: booking.vehicleId._id,
      userId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalPrice: booking.balanceAmount,
      nights: booking.nights,
      renterPhone: formattedPhone,
      status: "pending",
      paymentType: "BALANCE",
      originalBookingId: bookingId,
      balancePayment: true,
      depositPaid: true,
      depositAmount: booking.depositAmount,
      balancePaid: false,
      balanceAmount: booking.balanceAmount
    });

    console.log("✅ Pending balance record created");

    // Generate STK Push payload
    const timestamp = generateTimestamp();
    const password = generatePassword(timestamp);

    const stkPushPayload = {
      BusinessShortCode: MPESA_CONFIG.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(booking.balanceAmount),
      PartyA: formattedPhone,
      PartyB: MPESA_CONFIG.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: MPESA_CONFIG.callbackUrl,
      AccountReference: balanceBookingId,
      TransactionDesc: `Balance Payment ${bookingId.slice(-8)}`
    };

    console.log("📤 Sending STK Push for balance:", {
      phone: formattedPhone,
      amount: stkPushPayload.Amount,
      bookingId: balanceBookingId,
      callbackUrl: MPESA_CONFIG.callbackUrl
    });

    // Send STK Push
    let stkResponse;
    try {
      stkResponse = await axios.post(
        `${MPESA_CONFIG.apiUrl}/mpesa/stkpush/v1/processrequest`,
        stkPushPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          timeout: 30000
        }
      );

      console.log("✅ STK Push response:", stkResponse.data);

    } catch (stkError) {
      console.error("❌ STK Push failed:", {
        message: stkError.message,
        status: stkError.response?.status,
        data: stkError.response?.data
      });

      // Delete pending record on failure
      await MpesaPendingBooking.findByIdAndDelete(pendingBalance._id);

      return res.status(500).json({
        success: false,
        error: "Failed to send balance payment request",
        details: stkError.response?.data?.errorMessage || stkError.message
      });
    }

    // Save STK Push details
    pendingBalance.CheckoutRequestID = stkResponse.data.CheckoutRequestID;
    pendingBalance.MerchantRequestID = stkResponse.data.MerchantRequestID;
    await pendingBalance.save();

    console.log("✅ Balance payment STK Push sent successfully\n");

    return res.json({
      success: true,
      bookingId: balanceBookingId,
      CheckoutRequestID: stkResponse.data.CheckoutRequestID,
      message: `Balance payment STK Push sent (KES ${booking.balanceAmount}). Please check your phone.`
    });

  } catch (error) {
    console.error("❌ Balance payment initiation error:", {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: "Failed to initiate balance payment",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

// ===============================
// CHECK PAYMENT STATUS
// ===============================
export async function checkPaymentStatus(req, res) {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id || req.user?.userId || req.user?._id;

    console.log("📊 Status check:", { bookingId, userId });

    const pendingBooking = await MpesaPendingBooking.findOne({ bookingId, userId });

    if (!pendingBooking) {
      console.log("❌ Pending booking not found");
      return res.status(404).json({ success: false, error: "Booking not found" });
    }

    console.log("Found pending booking, status:", pendingBooking.status);

    if (pendingBooking.status === "confirmed" && pendingBooking.bookingDbId) {
      const booking = await Booking.findById(pendingBooking.bookingDbId).populate("vehicleId", "name image dailyPrice");

      if (!booking) {
        return res.status(404).json({ success: false, error: "Booking record not found" });
      }

      return res.json({ success: true, booking: { _id: booking._id, bookingId: booking.bookingId, vehicleId: booking.vehicleId, startDate: booking.startDate, endDate: booking.endDate, totalPrice: booking.totalPrice, paymentStatus: booking.paymentStatus, depositPaid: booking.depositPaid, balancePaid: booking.balancePaid, depositAmount: booking.depositAmount, balanceAmount: booking.balanceAmount, nights: booking.nights } });
    }

    return res.json({
      success: false,
      status: pendingBooking.status,
      booking: {
        bookingId: pendingBooking.bookingId,
        paymentStatus: pendingBooking.status,
        totalPrice: pendingBooking.totalPrice,
        depositPaid: pendingBooking.depositPaid || false,
        balancePaid: false
      }
    });

  } catch (error) {
    console.error("❌ checkPaymentStatus error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to check payment status",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}