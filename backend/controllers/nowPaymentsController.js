// controllers/nowPaymentsController.js
import axios from "axios";
import crypto from "crypto";
import Booking from "../models/Booking.js";

// ===============================
// NOWPAYMENTS CONFIGURATION
// ===============================
const NOWPAYMENTS_CONFIG = {
  apiKey: process.env.NOWPAYMENTS_API_KEY,
  ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET,
  sandbox: process.env.NOWPAYMENTS_SANDBOX === "true",
  baseUrl: process.env.NOWPAYMENTS_SANDBOX === "true" 
    ? "https://api-sandbox.nowpayments.io" 
    : "https://api.nowpayments.io",
  payCurrency: process.env.NOWPAYMENTS_PAY_CURRENCY || "usdttrc20",
  minKes: parseFloat(process.env.NOWPAYMENTS_MIN_KES) || 500,
  kesToUsdFallback: parseFloat(process.env.KES_TO_USD_FALLBACK) || 0.00769,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:8080",
  backendUrl: process.env.BACKEND_URL || "http://localhost:5000"
};

// ===============================
// VALIDATE CONFIG ON STARTUP
// ===============================
function validateConfig() {
  console.log("🔍 Checking NowPayments configuration...");
  
  const missing = [];
  if (!NOWPAYMENTS_CONFIG.apiKey) missing.push("NOWPAYMENTS_API_KEY");
  if (!NOWPAYMENTS_CONFIG.ipnSecret) missing.push("NOWPAYMENTS_IPN_SECRET");
  
  if (missing.length > 0) {
    console.error("❌ MISSING NOWPAYMENTS CONFIG:", missing.join(", "));
    return false;
  }
  
  console.log("✅ NowPayments config validated:", {
    sandbox: NOWPAYMENTS_CONFIG.sandbox,
    baseUrl: NOWPAYMENTS_CONFIG.baseUrl,
    payCurrency: NOWPAYMENTS_CONFIG.payCurrency,
    minKes: NOWPAYMENTS_CONFIG.minKes,
    kesToUsdFallback: NOWPAYMENTS_CONFIG.kesToUsdFallback
  });
  
  return true;
}

validateConfig();

// ===============================
// GET LIVE EXCHANGE RATE (KES -> USD)
// ===============================
async function getKesToUsdRate() {
  try {
    // Try multiple free APIs
    const apis = [
      "https://api.exchangerate-api.com/v4/latest/KES",
      "https://open.er-api.com/v6/latest/KES",
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/kes.json"
    ];
    
    for (const apiUrl of apis) {
      try {
        const response = await axios.get(apiUrl, { timeout: 5000 });
        let rate;
        
        if (apiUrl.includes("exchangerate-api") || apiUrl.includes("er-api")) {
          rate = response.data.rates?.USD;
        } else {
          rate = response.data?.kes?.usd;
        }
        
        if (rate && rate > 0) {
          console.log(`✅ Got KES/USD rate from ${apiUrl}: ${rate}`);
          return rate;
        }
      } catch (e) {
        console.warn(`⚠️ Failed to get rate from ${apiUrl}:`, e.message);
      }
    }
  } catch (error) {
    console.warn("⚠️ All exchange rate APIs failed, using fallback");
  }
  
  console.log(`📊 Using fallback KES/USD rate: ${NOWPAYMENTS_CONFIG.kesToUsdFallback}`);
  return NOWPAYMENTS_CONFIG.kesToUsdFallback;
}

// ===============================
// CONVERT KES TO USD
// ===============================
async function convertKesToUsd(kesAmount) {
  const rate = await getKesToUsdRate();
  const usdAmount = kesAmount * rate;
  console.log(`💱 Converted KES ${kesAmount} → USD ${usdAmount.toFixed(2)} (rate: ${rate})`);
  return usdAmount;
}

// ===============================
// VALIDATE MINIMUM AMOUNT
// ===============================
function validateMinAmount(kesAmount) {
  if (kesAmount < NOWPAYMENTS_CONFIG.minKes) {
    throw new Error(`Amount KES ${kesAmount} is below minimum KES ${NOWPAYMENTS_CONFIG.minKes} for NowPayments`);
  }
  return true;
}

// ===============================
// CREATE NOWPAYMENTS INVOICE
// ===============================
export async function createNowPaymentsInvoice(req, res) {
  try {
    console.log("\n📥 NowPayments create invoice request received");
    console.log("User:", req.user);
    console.log("Body:", req.body);

    if (!validateConfig()) {
      console.error("❌ NowPayments not configured properly");
      return res.status(500).json({
        success: false,
        error: "NowPayments is not properly configured. Please contact support."
      });
    }

    const { 
      unitId, 
      startDate, 
      endDate, 
      guestPhone,
      amount, 
      paymentType, 
      backendBookingId 
    } = req.body;
    
    const userId = req.user?.id || req.user?.userId || req.user?._id;

    if (!userId) {
      console.error("❌ No user ID found in request");
      return res.status(401).json({
        success: false,
        error: "User not authenticated"
      });
    }

    if (!unitId || !startDate || !endDate || !amount || !paymentType) {
      console.error("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["unitId", "startDate", "endDate", "amount", "paymentType"]
      });
    }

    if (!["deposit", "balance"].includes(paymentType)) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment type. Must be 'deposit' or 'balance'"
      });
    }

    // Validate minimum amount
    try {
      validateMinAmount(amount);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    console.log("📝 Request details:", { unitId, startDate, endDate, amount, paymentType, userId, backendBookingId });

    // Convert KES to USD
    const usdAmount = await convertKesToUsd(amount);

    // ===============================
    // FIND OR CREATE BOOKING
    // ===============================
    let booking = null;
    
    if (backendBookingId) {
      booking = await Booking.findOne({ bookingId: backendBookingId, userId }).populate("unitId", "name");
      console.log("🔍 Searching for existing booking:", { backendBookingId, found: !!booking });
    }

    // If deposit payment & no booking exists: create it
    if (!booking && paymentType === "deposit") {
      console.log("📝 No existing booking found - creating new booking for deposit");

      const start = new Date(startDate);
      const end = new Date(endDate);
      const nights = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

      if (nights < 1) {
        return res.status(400).json({
          success: false,
          error: "Invalid dates - minimum 1 night required"
        });
      }

      // Check for duplicate bookings
      const existingBooking = await Booking.findOne({ bookingId: backendBookingId });
      if (existingBooking) {
        console.warn("⚠️ Booking already exists:", backendBookingId);
        booking = existingBooking;
      } else {
        try {
          booking = await Booking.create({
            bookingId: backendBookingId,
            unitId,
            userId,
            startDate: start,
            endDate: end,
            totalPrice: amount + (paymentType === 'deposit' ? 0 : 0), // Will be updated
            nights,
            paymentMethod: "nowpayments",
            paymentStatus: "pending",
            
            depositPaid: false,
            depositAmount: amount,
            depositTxHash: null,
            depositPaidAt: null,
            
            balancePaid: false,
            balanceAmount: 0,
            balanceTxHash: null,
            balancePaidAt: null,
            
            guestPhone: guestPhone || `+254700000000`
          });

          console.log("✅ Created new booking:", booking.bookingId);
          await booking.populate("unitId", "name");
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
    if (paymentType === "deposit" && booking.depositPaid) {
      return res.status(400).json({
        success: false,
        error: "Deposit already paid for this booking"
      });
    }

    if (paymentType === "balance") {
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

    // Validate amount matches booking
    const expectedAmount = paymentType === "deposit" ? booking.depositAmount : booking.balanceAmount;
    if (expectedAmount && Math.abs(amount - expectedAmount) > 0.01) {
      console.error("❌ Amount mismatch:", { expected: expectedAmount, received: amount });
      return res.status(400).json({
        success: false,
        error: `Amount mismatch. Expected ${expectedAmount}, received ${amount}`
      });
    }

    // ===============================
    // CREATE NOWPAYMENTS INVOICE
    // ===============================
    const orderId = `${booking.bookingId}_${paymentType}_${Date.now()}`;
    const ipnCallbackUrl = `${NOWPAYMENTS_CONFIG.backendUrl}/api/payments/nowpayments/ipn`;

    const invoicePayload = {
      price_amount: parseFloat(usdAmount.toFixed(2)),
      price_currency: "usd",
      pay_currency: NOWPAYMENTS_CONFIG.payCurrency,
      order_id: orderId,
      order_description: `${paymentType === 'deposit' ? 'Deposit' : 'Balance'} payment for booking ${booking.bookingId}`,
      ipn_callback_url: ipnCallbackUrl,
      success_url: `${NOWPAYMENTS_CONFIG.frontendUrl}/booking.html?id=${booking.unitId._id}&bookingId=${booking.bookingId}&payment=success`,
      cancel_url: `${NOWPAYMENTS_CONFIG.frontendUrl}/booking.html?id=${booking.unitId._id}&bookingId=${booking.bookingId}&payment=cancel`,
      is_fee_paid_by_user: true
    };

    console.log("📤 Creating NowPayments invoice:", {
      price_amount: invoicePayload.price_amount,
      price_currency: invoicePayload.price_currency,
      pay_currency: invoicePayload.pay_currency,
      order_id: invoicePayload.order_id,
      ipn_callback_url: invoicePayload.ipn_callback_url
    });

    let invoiceResponse;
    try {
      invoiceResponse = await axios.post(
        `${NOWPAYMENTS_CONFIG.baseUrl}/v1/invoice`,
        invoicePayload,
        {
          headers: {
            "x-api-key": NOWPAYMENTS_CONFIG.apiKey,
            "Content-Type": "application/json"
          },
          timeout: 30000
        }
      );

      console.log("✅ NowPayments invoice created successfully");

    } catch (invoiceError) {
      console.error("❌ NowPayments invoice creation failed:", {
        message: invoiceError.message,
        status: invoiceError.response?.status,
        data: invoiceError.response?.data
      });

      return res.status(500).json({
        success: false,
        error: "Failed to create NowPayments invoice",
        details: invoiceError.response?.data?.message || invoiceError.message
      });
    }

    const { invoice_id, invoice_url, pay_amount, pay_currency, pay_address } = invoiceResponse.data;

    // Store invoice details in booking
    if (paymentType === "deposit") {
      booking.nowInvoiceId = invoice_id;
      booking.nowInvoiceUrl = invoice_url;
      booking.nowPaymentStatus = "waiting";
    } else {
      // For balance, we could store separately or append
      booking.nowInvoiceId = invoice_id;
      booking.nowInvoiceUrl = invoice_url;
      booking.nowPaymentStatus = "waiting";
    }
    
    booking.walletAddress = pay_address;
    booking.cryptoAmount = pay_amount;
    booking.cryptoCurrency = pay_currency;
    booking.paymentNetwork = NOWPAYMENTS_CONFIG.payCurrency;
    
    await booking.save();

    console.log("✅ Booking updated with NowPayments invoice:", {
      bookingId: booking.bookingId,
      invoiceId: invoice_id,
      invoiceUrl: invoice_url
    });

    return res.json({
      success: true,
      invoiceId: invoice_id,
      invoiceUrl: invoice_url,
      payAmount: pay_amount,
      payCurrency: pay_currency,
      payAddress: pay_address,
      amount: amount,
      usdAmount: usdAmount,
      type: paymentType,
      message: `NowPayments ${paymentType} invoice created. Redirect user to invoice URL.`
    });

  } catch (error) {
    console.error("❌ NowPayments create invoice error:", {
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
// VERIFY NOWPAYMENTS IPN SIGNATURE
// ===============================
function verifyNowPaymentsSignature(payload, signature) {
  // NowPayments uses HMAC-SHA512 with sorted keys
  const sortedPayload = Object.keys(payload)
    .sort()
    .reduce((obj, key) => {
      obj[key] = payload[key];
      return obj;
    }, {});
  
  const jsonString = JSON.stringify(sortedPayload);
  const hash = crypto
    .createHmac("sha512", NOWPAYMENTS_CONFIG.ipnSecret)
    .update(jsonString)
    .digest("hex");
  
  return hash === signature;
}

// ===============================
// HANDLE NOWPAYMENTS IPN (INSTANT PAYMENT NOTIFICATION)
// ===============================
export async function handleIPN(req, res) {
  console.log("🔥 NOWPAYMENTS IPN HIT AT", new Date().toISOString());

  try {
    // Verify signature
    const signature = req.headers["x-nowpayments-sig"] || req.headers["x-nowpayments-signature"];
    
    if (!signature) {
      console.error("❌ No NowPayments signature header");
      return res.status(400).json({ error: "No signature header" });
    }

    const isValid = verifyNowPaymentsSignature(req.body, signature);
    
    if (!isValid) {
      console.error("❌ Invalid NowPayments signature");
      console.log("Received signature:", signature);
      console.log("Expected signature for:", JSON.stringify(req.body));
      return res.status(400).json({ error: "Invalid signature" });
    }

    console.log("✅ NowPayments signature verified");

    const { 
      payment_id, 
      payment_status, 
      order_id, 
      pay_amount, 
      pay_currency, 
      pay_address,
      price_amount,
      price_currency,
      actually_paid,
      actually_paid_currency,
      order_description
    } = req.body;

    console.log("📨 IPN data:", {
      payment_id,
      payment_status,
      order_id,
      pay_amount,
      pay_currency,
      price_amount,
      price_currency
    });

    // Extract booking ID and payment type from order_id
    // Format: bookingId_type_timestamp
    const orderParts = order_id.split("_");
    const type = orderParts[orderParts.length - 2]; // 'deposit' or 'balance'
    const bookingId = orderParts.slice(0, -2).join("_");

    if (!bookingId || !type) {
      console.error("❌ Invalid order_id format:", order_id);
      return res.status(200).json({ received: true }); // Acknowledge to prevent retries
    }

    console.log("📝 Processing payment:", { bookingId, type, payment_id, payment_status });

    // Only process successful/confirmed payments
    const successStatuses = ["finished", "confirmed", "completed"];
    if (!successStatuses.includes(payment_status)) {
      console.log(`⚠️ Payment status is ${payment_status}, not processing`);
      
      // Update booking with pending/failed status
      const booking = await Booking.findOne({ bookingId });
      if (booking) {
        booking.nowPaymentStatus = payment_status;
        await booking.save();
      }
      return res.status(200).json({ received: true });
    }

    // Find the booking
    const booking = await Booking.findOne({ bookingId });

    if (!booking) {
      console.error("❌ Booking not found:", bookingId);
      return res.status(200).json({ received: true });
    }

    // Update booking based on payment type
    if (type === "deposit") {
      console.log("💰 Processing DEPOSIT payment");

      booking.depositPaid = true;
      booking.depositTxHash = payment_id;
      booking.depositPaidAt = new Date();
      booking.nowInvoiceId = payment_id;
      booking.nowPaymentStatus = payment_status;
      booking.walletAddress = pay_address;
      booking.cryptoAmount = pay_amount;
      booking.cryptoCurrency = pay_currency;
      booking.paymentNetwork = NOWPAYMENTS_CONFIG.payCurrency;
      booking.paymentMethod = "nowpayments";

      // If no balance required, confirm immediately
      if (!booking.balanceAmount || booking.balanceAmount === 0) {
        booking.balancePaid = true;
        booking.balanceTxHash = payment_id;
        booking.balancePaidAt = new Date();
        booking.paymentStatus = "confirmed";
      }

      await booking.save();

      console.log("✅ Deposit payment processed:", {
        bookingId: booking.bookingId,
        depositPaid: booking.depositPaid,
        payment_id
      });

    } else if (type === "balance") {
      console.log("💳 Processing BALANCE payment");

      booking.balancePaid = true;
      booking.balanceTxHash = payment_id;
      booking.balancePaidAt = new Date();
      booking.nowInvoiceId = payment_id;
      booking.nowPaymentStatus = payment_status;
      booking.walletAddress = pay_address;
      booking.cryptoAmount = pay_amount;
      booking.cryptoCurrency = pay_currency;
      booking.paymentNetwork = NOWPAYMENTS_CONFIG.payCurrency;
      booking.paymentStatus = "confirmed";

      await booking.save();

      console.log("✅ Balance payment processed:", { bookingId: booking.bookingId, balancePaid: booking.balancePaid, payment_id });
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("❌ IPN processing error:", {
      message: error.message,
      stack: error.stack
    });
    // Always return 200 to NowPayments to prevent retries on our errors
    return res.status(200).json({ received: true });
  }
}

// ===============================
// GET INVOICE STATUS
// ===============================
export async function getInvoiceStatus(req, res) {
  try {
    const { invoiceId } = req.params;

    if (!validateConfig()) {
      return res.status(500).json({
        success: false,
        error: "NowPayments not configured"
      });
    }

    const response = await axios.get(
      `${NOWPAYMENTS_CONFIG.baseUrl}/v1/invoice/${invoiceId}`,
      {
        headers: {
          "x-api-key": NOWPAYMENTS_CONFIG.apiKey
        },
        timeout: 15000
      }
    );

    return res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("❌ Get invoice status error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get invoice status",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

// ===============================
// GET AVAILABLE CURRENCIES
// ===============================
export async function getAvailableCurrencies(req, res) {
  try {
    if (!validateConfig()) {
      return res.status(500).json({
        success: false,
        error: "NowPayments not configured"
      });
    }

    const response = await axios.get(
      `${NOWPAYMENTS_CONFIG.baseUrl}/v1/currencies`,
      {
        headers: {
          "x-api-key": NOWPAYMENTS_CONFIG.apiKey
        },
        timeout: 15000
      }
    );

    return res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("❌ Get currencies error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get currencies",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

// ===============================
// ESTIMATE PRICE
// ===============================
export async function estimatePrice(req, res) {
  try {
    const { amount, currencyFrom, currencyTo } = req.query;

    if (!amount || !currencyFrom || !currencyTo) {
      return res.status(400).json({
        success: false,
        error: "Missing required query params: amount, currencyFrom, currencyTo"
      });
    }

    if (!validateConfig()) {
      return res.status(500).json({
        success: false,
        error: "NowPayments not configured"
      });
    }

    const response = await axios.get(
      `${NOWPAYMENTS_CONFIG.baseUrl}/v1/estimate`,
      {
        headers: {
          "x-api-key": NOWPAYMENTS_CONFIG.apiKey
        },
        params: {
          amount: parseFloat(amount),
          currency_from: currencyFrom,
          currency_to: currencyTo
        },
        timeout: 15000
      }
    );

    return res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("❌ Estimate price error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to estimate price",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}