// controllers/paystackController.js
import axios from "axios";
import crypto from "crypto";
import Booking from "../models/Booking.js";

// ===============================
// PAYSTACK CREDENTIALS
// ===============================
const PAYSTACK_CONFIG = {
  secretKey: process.env.PAYSTACK_SECRET_KEY,
  publicKey: process.env.PAYSTACK_PUBLIC_KEY,
  webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET,
  baseUrl: "https://api.paystack.co"
};

// ===============================
// VALIDATE CONFIG ON STARTUP
// ===============================
function validateConfig() {
  console.log("🔍 Checking Paystack configuration...");
  
  const missing = [];
  if (!PAYSTACK_CONFIG.secretKey) missing.push("PAYSTACK_SECRET_KEY");
  if (!PAYSTACK_CONFIG.publicKey) missing.push("PAYSTACK_PUBLIC_KEY");
  if (!PAYSTACK_CONFIG.webhookSecret) missing.push("PAYSTACK_WEBHOOK_SECRET");
  
  if (missing.length > 0) {
    console.error("❌ MISSING PAYSTACK CONFIG:", missing.join(", "));
    return false;
  }
  
  console.log("✅ Paystack config validated");
  return true;
}

validateConfig();

// (access-code helper removed)

// ===============================
// INITIALIZE PAYSTACK PAYMENT (FIXED)
// ===============================
export async function initPaystackPayment(req, res) {
  try {
    console.log("\n📥 Paystack initialize request received");

    if (!validateConfig()) {
      console.error("❌ Paystack not configured properly");
      return res.status(500).json({
        success: false,
        error: "Paystack is not properly configured. Please contact support."
      });
    }

    const { backendBookingId, amount, type, email, vehicleId, startDate, endDate, totalPrice } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?._id;

    // Validation
    if (!userId) {
      console.error("❌ No user ID found in request");
      return res.status(401).json({
        success: false,
        error: "User not authenticated"
      });
    }

    if (!backendBookingId || !amount || !type) {
      console.error("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["backendBookingId", "amount", "type"]
      });
    }

    if (!["deposit", "balance"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment type. Must be 'deposit' or 'balance'"
      });
    }

    console.log("📝 Request details:", { backendBookingId, amount, type, userId });

    // ===============================
    // TRY TO FIND EXISTING BOOKING
    // ===============================
    let booking = await Booking.findOne({ bookingId: backendBookingId, userId }).populate("vehicleId", "name");

// Replace lines 53-118 with this improved logic:

// ===============================
// IF DEPOSIT PAYMENT & NO BOOKING EXISTS: CREATE IT
// ===============================
if (!booking && type === "deposit") {
  console.log("📝 No existing booking found - creating new booking for deposit");

  // Validate required fields for new booking
    if (!vehicleId || !startDate || !endDate || !totalPrice) {
    console.error("❌ Missing fields for booking creation");
    return res.status(400).json({
      success: false,
        error: "Missing required fields for new booking",
        required: ["vehicleId", "startDate", "endDate", "totalPrice"]
    });
  }

  // Calculate nights
  const start = new Date(startDate);
  const end = new Date(endDate);
  const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  // ✅ VALIDATE dates before creation
  if (nights < 1) {
    return res.status(400).json({
      success: false,
      error: "Invalid dates - minimum 1 night required"
    });
  }

  // ✅ CHECK for duplicate bookings
  const existingBooking = await Booking.findOne({
    bookingId: backendBookingId
  });

  if (existingBooking) {
    console.warn("⚠️ Booking already exists:", backendBookingId);
    booking = existingBooking;
  } else {
    // Create new booking in pending state
    try {
      booking = await Booking.create({
        bookingId: backendBookingId,
        vehicleId,
        userId,
        startDate: start,
        endDate: end,
        totalPrice,
        nights,
        paymentMethod: "visa", // Paystack = Visa/Card
        paymentStatus: "pending",
        
        // Deposit fields (not paid yet)
        depositPaid: false,
        depositAmount: amount,
        depositTxHash: null,
        depositPaidAt: null,
        
        // Balance fields
        balancePaid: false,
        balanceAmount: totalPrice - amount,
        balanceTxHash: null,
        balancePaidAt: null,
        
        // Guest phone (optional for Paystack)
        guestPhone: req.body.guestPhone || `+254700000000`
      });

      console.log("✅ Created new booking:", booking.bookingId);
      
      // Populate vehicleId for later use
      await booking.populate("vehicleId", "name");
      
    } catch (createError) {
      console.error("❌ Booking creation failed:", createError);
      return res.status(500).json({
        success: false,
        error: "Failed to create booking",
        details: process.env.NODE_ENV === "development" ? createError.message : undefined
      });
    }
  }
}

// ===============================
// IF STILL NO BOOKING FOUND: ERROR
// ===============================
if (!booking) {
  console.error("❌ Booking not found and could not be created:", backendBookingId);
  return res.status(404).json({
    success: false,
    error: "Booking not found. Please try again."
  });
}
    console.log("✅ Booking found:", {
      bookingId: booking.bookingId,
      depositPaid: booking.depositPaid,
      balancePaid: booking.balancePaid
    });

    // ===============================
    // VALIDATE PAYMENT TYPE AGAINST BOOKING STATE
    // ===============================
    if (type === "deposit" && booking.depositPaid) {
      return res.status(400).json({
        success: false,
        error: "Deposit already paid for this booking"
      });
    }

    if (type === "balance") {
      if (!booking.depositPaid) {
        return res.status(400).json({
          success: false,
          error: "Deposit must be paid before balance payment"
        });
      }
      if (booking.balancePaid) {
        return res.status(400).json({
          success: false,
          error: "Balance already paid for this booking"
        });
      }
    }

    // ===============================
    // VALIDATE AMOUNT
    // ===============================
    const expectedAmount = type === "deposit" ? booking.depositAmount : booking.balanceAmount;
    if (Math.abs(amount - expectedAmount) > 0.01) {
      console.error("❌ Amount mismatch:", { expected: expectedAmount, received: amount });
      return res.status(400).json({
        success: false,
        error: `Amount mismatch. Expected ${expectedAmount}, received ${amount}`
      });
    }

    // ===============================
    // CONVERT TO KOBO (PAYSTACK USES SMALLEST UNIT)
    // ===============================
    const amountInKobo = Math.round(amount * 100);

    // ===============================
    // PREPARE PAYSTACK PAYLOAD
    // ===============================
    const paystackPayload = {
      email: email || req.user.email || `user${userId}@alina906vibes.com`,
      amount: amountInKobo,
      currency: "KES",
      metadata: {
        backendBookingId,
        type,
        userId: userId.toString(),
        vehicleName: booking.vehicleId?.name || "Vehicle",
        custom_fields: [
          {
            display_name: "Booking ID",
            variable_name: "booking_id",
            value: backendBookingId
          },
          {
            display_name: "Payment Type",
            variable_name: "payment_type",
            value: type
          }
        ]
      },
      callback_url: `${process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:8080'}/booking.html?id=${booking.vehicleId._id}&bookingId=${backendBookingId}`    };

    console.log("📤 Initializing Paystack transaction:", {
      email: paystackPayload.email,
      amount: amount,
      amountInKobo,
      type,
      bookingId: backendBookingId
    });

    // ===============================
    // INITIALIZE PAYSTACK TRANSACTION
    // ===============================
    let paystackResponse;
    try {
      paystackResponse = await axios.post(
        `${PAYSTACK_CONFIG.baseUrl}/transaction/initialize`,
        paystackPayload,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_CONFIG.secretKey}`,
            "Content-Type": "application/json"
          },
          timeout: 30000
        }
      );

      console.log("✅ Paystack initialization successful");

    } catch (paystackError) {
      console.error("❌ Paystack initialization failed:", {
        message: paystackError.message,
        status: paystackError.response?.status,
        data: paystackError.response?.data
      });

      return res.status(500).json({
        success: false,
        error: "Failed to initialize Paystack payment",
        details: paystackError.response?.data?.message || paystackError.message
      });
    }

 const { authorization_url, access_code, reference } = paystackResponse.data.data;

// ✅ Store reference in booking immediately
booking.paystackDepositRef = reference;
await booking.save();

// ✅ Build callback URL with real reference
const callbackUrl = `${process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'http://localhost:8080'}/booking.html?id=${booking.vehicleId._id}&reference=${reference}&bookingId=${backendBookingId}`;

console.log("✅ Paystack payment initialized successfully");
console.log("📝 Reference:", reference);
console.log("🔗 Callback URL:", callbackUrl);

return res.json({
  success: true,
  authorization_url,
  access_code,
  reference,
  callbackUrl, // ✅ Send to frontend
  amount,
  type,
  message: `Paystack ${type} payment initialized. Redirect user to authorization URL.`
});

  } catch (error) {
    console.error("❌ Paystack initialize error:", {
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
// VERIFY PAYSTACK SIGNATURE
// ===============================
function verifyPaystackSignature(payload, signature) {
  const hash = crypto
    .createHmac("sha512", PAYSTACK_CONFIG.webhookSecret)
    .update(JSON.stringify(payload))
    .digest("hex");
  
  return hash === signature;
}

// ===============================
// HANDLE PAYSTACK WEBHOOK
// ===============================
export async function handlePaystackWebhook(req, res) {
  console.log("🔥 PAYSTACK WEBHOOK HIT AT", new Date().toISOString());

  try {
    // Verify signature
    const signature = req.headers["x-paystack-signature"];
    
    if (!signature) {
      console.error("❌ No Paystack signature header");
      return res.status(400).json({ error: "No signature header" });
    }

    const isValid = verifyPaystackSignature(req.body, signature);
    
    if (!isValid) {
      console.error("❌ Invalid Paystack signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    console.log("✅ Paystack signature verified");

    const { event, data } = req.body;

    console.log("📨 Webhook event:", event);
    console.log("📦 Webhook data:", JSON.stringify(data, null, 2));

    // Only process successful charges
    if (event !== "charge.success") {
      console.log(`⚠️ Ignoring event type: ${event}`);
      return res.status(200).json({ received: true });
    }

    const { reference, status, metadata } = data;

    if (status !== "success") {
      console.log(`⚠️ Payment status is ${status}, not success`);
      return res.status(200).json({ received: true });
    }

    // Extract metadata
    const { backendBookingId, type } = metadata || {};

    if (!backendBookingId || !type) {
      console.error("❌ Missing metadata in webhook:", { backendBookingId, type });
      return res.status(200).json({ received: true });
    }

    console.log("📝 Processing payment:", { backendBookingId, type, reference });

    // Find the booking
    const booking = await Booking.findOne({ bookingId: backendBookingId });

    if (!booking) {
      console.error("❌ Booking not found:", backendBookingId);
      return res.status(200).json({ received: true });
    }


    // Update booking based on payment type
    if (type === "deposit") {
      console.log("💰 Processing DEPOSIT payment");

      booking.depositPaid = true;
      booking.depositTxHash = reference;
      booking.depositPaidAt = new Date();
      booking.paystackDepositRef = reference;
      booking.paymentMethod = "visa";

      // If no balance required, confirm immediately
      if (booking.balanceAmount === 0 || !booking.balanceAmount) {
        booking.balancePaid = true;
        booking.paymentStatus = "confirmed";
      }

      await booking.save();

      console.log("✅ Deposit payment processed:", {
        bookingId: booking.bookingId,
        depositPaid: booking.depositPaid,
        reference
      });

    } else if (type === "balance") {
      console.log("💳 Processing BALANCE payment");

      booking.balancePaid = true;
      booking.balanceTxHash = reference;
      booking.balancePaidAt = new Date();
      booking.paystackBalanceRef = reference;
      booking.paymentStatus = "confirmed";

      await booking.save();

      console.log("✅ Balance payment processed:", { bookingId: booking.bookingId, balancePaid: booking.balancePaid, reference });
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("❌ Webhook processing error:", {
      message: error.message,
      stack: error.stack
    });
    return res.status(200).json({ received: true });
  }
}