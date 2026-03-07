/*Routes/bookingRoutes.js*/
import express from "express";
import Booking from "../models/Booking.js";
import Vehicle from "../models/Vehicle.js";
import MpesaPendingBooking from "../models/MpesaPendingBooking.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ================= HELPERS ================= */
const isValidKenyanPhone = (phone) => /^\+254[17]\d{8}$/.test(phone);

const allowedPaymentMethods = ["mpesa", "visa", "crypto"];

const calculateNights = (start, end) => Math.ceil((end - start) / (1000 * 60 * 60 * 24));

/* ================= CREATE BOOKING ================= */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { 
      vehicleId, 
      startDate, 
      endDate, 
      paymentMethod, 
      totalPrice, 
      renterPhone,
      paymentType
    } = req.body;
    const userId = req.user.id;

    if (!vehicleId || !startDate || !endDate || !paymentMethod || !renterPhone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!allowedPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({ error: "Unsupported payment method" });
    }

    if (!isValidKenyanPhone(renterPhone)) {
      return res.status(400).json({ error: "Invalid phone number format. Use +2547XXXXXXXX" });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start) || isNaN(end) || start >= end) {
      return res.status(400).json({ error: "Invalid rental dates" });
    }

const conflict = await Booking.findOne({
  vehicleId,
  $or: [
    { paymentStatus: "confirmed" },
    { depositPaid: true }
  ],
  $and: [
    { startDate: { $lt: end } }, 
    { endDate: { $gt: start } }
  ],
  cancelledAt: null
});

if (conflict) {
  const conflictEnd = new Date(conflict.endDate);
  const newStart = new Date(start);
  
  conflictEnd.setHours(0, 0, 0, 0);
  newStart.setHours(0, 0, 0, 0);
  
  const isBackToBack = conflictEnd.getTime() === newStart.getTime();
  
  if (!isBackToBack) {
    return res.status(409).json({ error: "These dates are already booked for this vehicle." });
  }
  
  console.log(`✅ Back-to-back rental allowed`);
}

    const nights = calculateNights(start, end);
    const calculatedTotalPrice = totalPrice || vehicle.dailyPrice * nights;

    if (paymentMethod === "mpesa" && paymentType === "DEPOSIT") {
      const depositAmount = Math.round(calculatedTotalPrice * 0.20);
      const balanceAmount = calculatedTotalPrice - depositAmount;

      const existingPending = await MpesaPendingBooking.findOne({
        userId,
        vehicleId,
        status: "pending"
      });

      if (existingPending) {
        return res.status(409).json({
          error: "You already have a pending M-Pesa payment for this vehicle. Please complete or cancel it first."
        });
      }

      const bookingId = `mpesa_${Date.now()}_${vehicleId}`;

      const pendingBooking = await MpesaPendingBooking.create({
        bookingId,
        originalBookingId: bookingId, // ADD THIS
        vehicleId,
        userId,
        startDate: start,
        endDate: end,
        totalPrice: calculatedTotalPrice,
        nights,
        renterPhone,
        status: "pending",
        paymentType: "DEPOSIT",
        depositAmount,
        balanceAmount,
        depositPaid: false,
        balancePaid: false
      });

      return res.status(201).json({
        success: true,
        bookingId: pendingBooking.bookingId,
        message: "M-Pesa deposit booking initiated. Please complete payment via M-Pesa.",
        pending: true,
        depositAmount,
        balanceAmount
      });
    }

    const booking = await Booking.create({
      vehicleId,
      userId,
      startDate,
      endDate,
      totalPrice: calculatedTotalPrice,
      paymentMethod,
      renterPhone,
      paymentStatus: "confirmed",
      nights,
      depositPaid: true,
      depositAmount: calculatedTotalPrice,
      depositPaidAt: new Date(),
      balancePaid: true,
      balanceAmount: 0,
      balancePaidAt: new Date()
    });

    res.status(201).json({ success: true, booking, message: "Rental booking created successfully." });

  } catch (err) {
    console.error("❌ Booking creation failed:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

/* ================= M-PESA INITIATE ================= */
router.post("/mpesa/initiate", authMiddleware, async (req, res) => {
  try {
    const {
      vehicleId,
      startDate,
      endDate,
      totalPrice,
      renterPhone,
      paymentType
    } = req.body;
    const userId = req.user.id;

    if (!vehicleId || !startDate || !endDate || !renterPhone) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["vehicleId", "startDate", "endDate", "renterPhone"]
      });
    }

    if (!isValidKenyanPhone(renterPhone)) {
      return res.status(400).json({ error: "Invalid phone number format. Use +2547XXXXXXXX" });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start) || isNaN(end) || start >= end) {
      return res.status(400).json({ error: "Invalid rental dates" });
    }

const conflict = await Booking.findOne({
  vehicleId,
  $or: [
    { paymentStatus: "confirmed" },
    { depositPaid: true }
  ],
  $and: [
    { startDate: { $lt: end } }, 
    { endDate: { $gt: start } }
  ],
  cancelledAt: null
});

if (conflict) {
  const conflictEnd = new Date(conflict.endDate);
  const newStart = new Date(start);
  
  conflictEnd.setHours(0, 0, 0, 0);
  newStart.setHours(0, 0, 0, 0);
  
  const isBackToBack = conflictEnd.getTime() === newStart.getTime();
  
  if (!isBackToBack) {
    return res.status(409).json({ error: "These dates are already booked for this vehicle." });
  }
  
  console.log(`✅ Back-to-back rental allowed`);
}

    const nights = calculateNights(start, end);
    const calculatedTotalPrice = totalPrice || vehicle.dailyPrice * nights;

    const existingPending = await MpesaPendingBooking.findOne({
      userId,
      vehicleId,
      status: "pending"
    });

    if (existingPending) {
      return res.status(409).json({
        error: "You already have a pending M-Pesa payment for this vehicle. Please complete or cancel it first."
      });
    }

    const isFullPayment = paymentType === "FULL";
    const depositAmount = isFullPayment ? calculatedTotalPrice : Math.round(calculatedTotalPrice * 0.20);
    const balanceAmount = isFullPayment ? 0 : calculatedTotalPrice - depositAmount;

    const bookingId = `mpesa_${Date.now()}_${vehicleId}`;

    const pendingBooking = await MpesaPendingBooking.create({
      bookingId,
      vehicleId,
      userId,
      startDate: start,
      endDate: end,
      totalPrice: calculatedTotalPrice,
      nights,
      renterPhone,
      status: "pending",
      paymentType: isFullPayment ? "FULL" : "DEPOSIT",
      depositAmount,
      balanceAmount,
      depositPaid: false,
      balancePaid: false
    });

    console.log(`✅ M-Pesa pending booking created: ${bookingId}`);

    res.status(201).json({
      success: true,
      bookingId: pendingBooking.bookingId,
      message: isFullPayment
        ? "M-Pesa full payment initiated. Please complete payment."
        : "M-Pesa deposit initiated. Balance due at rental start.",
      depositAmount,
      balanceAmount,
      totalPrice: calculatedTotalPrice
    });

  } catch (err) {
    console.error("❌ M-Pesa initiate failed:", err);
    res.status(500).json({ error: "Failed to initiate M-Pesa payment" });
  }
});

/* ================= M-PESA CALLBACK ================= */
router.post("/mpesa/callback", async (req, res) => {
  try {
    console.log("📥 M-Pesa callback received:", JSON.stringify(req.body, null, 2));

    const { Body } = req.body;
    if (!Body || !Body.stkCallback) {
      console.warn("⚠️ Invalid callback structure");
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } = Body.stkCallback;

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

    if (ResultCode === 0) {
      console.log("✅ M-Pesa payment successful");

      const isBalancePayment = pendingBooking.paymentType === "BALANCE";
      const isFullPayment = pendingBooking.paymentType === "FULL";

      if (isBalancePayment) {
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

        pendingBooking.status = "confirmed";
        pendingBooking.bookingDbId = booking._id;
        pendingBooking.mpesaReceiptNumber = mpesaReceiptNumber;
        pendingBooking.amountPaid = amountPaid;
        pendingBooking.transactionDate = transactionDate ? new Date(transactionDate) : new Date();
        pendingBooking.balancePaid = true;
        await pendingBooking.save();

      } else {
        let booking = await Booking.findOne({ bookingId: pendingBooking.bookingId });

        if (booking) {
          console.warn("⚠️ Booking already exists, marking as duplicate");
          pendingBooking.status = "duplicate";
          pendingBooking.bookingDbId = booking._id;
          await pendingBooking.save();
          return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
        }

        console.log("🛠 Creating new Booking from M-Pesa payment");

        booking = await Booking.create({
          bookingId: pendingBooking.bookingId,
          vehicleId: pendingBooking.vehicleId._id,
          userId: pendingBooking.userId,
          startDate: pendingBooking.startDate,
          endDate: pendingBooking.endDate,
          totalPrice: pendingBooking.totalPrice,
          paymentMethod: "mpesa",
          mpesaReceiptNumber,
          paymentStatus: isFullPayment ? "confirmed" : "pending",
          nights: pendingBooking.nights,
          renterPhone: pendingBooking.renterPhone,

          depositPaid: true,
          depositAmount: pendingBooking.depositAmount,
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
      }

    } else {
      console.error("❌ M-Pesa payment failed:", ResultDesc);
      pendingBooking.status = ResultCode === 1032 ? "cancelled" : "failed";
      await pendingBooking.save();
    }

    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  } catch (err) {
    console.error("❌ M-Pesa callback error:", err);
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
});

/* ================= M-PESA CONFIRM BALANCE ================= */
router.post("/mpesa/confirm-balance", authMiddleware, async (req, res) => {
  try {
    const { bookingId, renterPhone } = req.body;
    const userId = req.user.id;

    if (!bookingId) {
      return res.status(400).json({
        error: "Missing bookingId"
      });
    }

    const booking = await Booking.findOne({
      bookingId,
      userId,
      depositPaid: true,
      balancePaid: false
    }).populate("vehicleId", "name");

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found or balance already paid"
      });
    }

    if (booking.balancePaid === true) {
      return res.status(400).json({
        error: "Balance has already been paid for this booking"
      });
    }

    if (!booking.balanceAmount || booking.balanceAmount <= 0) {
      return res.status(400).json({
        error: "No balance amount due for this booking"
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rentalStartDate = new Date(booking.startDate);
    rentalStartDate.setHours(0, 0, 0, 0);

if (today > rentalStartDate) {
  return res.status(400).json({
    error: "Balance payment window has expired"
  });
}


    const existingPendingBalance = await MpesaPendingBooking.findOne({
      originalBookingId: bookingId,
      paymentType: "BALANCE",
      status: "pending"
    });

    if (existingPendingBalance) {
      return res.status(409).json({
        error: "A balance payment is already pending. Please complete it first."
      });
    }

    const balanceBookingId = `${bookingId}_balance_${Date.now()}`;

    const pendingBalance = await MpesaPendingBooking.create({
      bookingId: balanceBookingId,
      vehicleId: booking.vehicleId._id,
      userId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      totalPrice: booking.balanceAmount,
      nights: booking.nights,
      renterPhone: renterPhone || booking.renterPhone,
      status: "pending",
      paymentType: "BALANCE",
      originalBookingId: bookingId,
      balancePayment: true,
      depositPaid: true,
      depositAmount: booking.depositAmount,
      balancePaid: false,
      balanceAmount: booking.balanceAmount
    });

    console.log(`✅ M-Pesa balance payment initiated: ${balanceBookingId}`);

    res.json({
      success: true,
      bookingId: balanceBookingId,
      message: "Balance payment initiated. Please complete payment via M-Pesa.",
      balanceAmount: booking.balanceAmount
    });

  } catch (err) {
    console.error("❌ M-Pesa balance confirmation failed:", err);
    res.status(500).json({ error: "Failed to initiate balance payment" });
  }
});

/* ================= CONFIRM CRYPTO ================= */
router.post("/confirm-crypto", authMiddleware, async (req, res) => {
  try {
    const {
      bookingId,
      vehicleId,
      startDate,
      endDate,
      depositTxHash,
      balanceTxHash,
      walletAddress,
      renterPhone,
      totalPrice,
      paymentType,
      depositAmount,
      balanceAmount,
      fullAmount,
      nights
    } = req.body;

    const userId = req.user.id;

    if (!bookingId || !vehicleId || !startDate || !endDate || !depositTxHash || !renterPhone) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["bookingId", "vehicleId", "startDate", "endDate", "depositTxHash", "renterPhone"]
      });
    }

    if (!isValidKenyanPhone(renterPhone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    const existingBooking = await Booking.findOne({
      $or: [
        { bookingId },
        { blockchainBookingId: bookingId },
        { depositTxHash }
      ]
    });

    if (existingBooking) {
      return res.status(409).json({ error: "Booking already exists with this ID" });
    }

    const vehicle = await Unit.findById(vehicleId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const start = new Date(startDate);
    const end = new Date(endDate);

const conflict = await Booking.findOne({
  vehicleId,
  $or: [
    { paymentStatus: "confirmed" },
    { depositPaid: true }
  ],
  $and: [
    { startDate: { $lt: end } }, 
    { endDate: { $gt: start } }
  ],
  cancelledAt: null
});

if (conflict) {
  const conflictEnd = new Date(conflict.endDate);
  const newStart = new Date(start);
  
  conflictEnd.setHours(0, 0, 0, 0);
  newStart.setHours(0, 0, 0, 0);
  
  const isBackToBack = conflictEnd.getTime() === newStart.getTime();
  
  if (!isBackToBack) {
    return res.status(409).json({ error: "These dates are already booked for this vehicle." });
  }
  
  console.log(`✅ Back-to-back rental allowed`);
}

    const calculatedNights = nights || calculateNights(start, end);

    let paymentStatus;
    let depositPaid;
    let balancePaid;

    if (paymentType === 'FULL') {
      paymentStatus = 'confirmed';
      depositPaid = true;
      balancePaid = true;
    } else {
      paymentStatus = 'pending';
      depositPaid = true;
      balancePaid = false;
    }

    const booking = await Booking.create({
      bookingId,
      blockchainBookingId: bookingId,
      vehicleId,
      userId,
      startDate,
      endDate,
      totalPrice: fullAmount || totalPrice || (vehicle.dailyPrice * calculatedNights),
      paymentMethod: "crypto",
      paymentStatus,

      depositPaid,
      depositAmount: depositAmount || 5,
      depositTxHash,
      depositPaidAt: new Date(),

      balancePaid,
      balanceAmount: balancePaid ? 0 : (balanceAmount || (fullAmount - depositAmount)),
      balanceTxHash: balanceTxHash || null,
      balancePaidAt: balancePaid ? new Date() : null,

      walletAddress: walletAddress?.toLowerCase(),
      blockchainTx: depositTxHash,
      renterPhone,
      // access-code removed
      nights: calculatedNights
    });
    res.status(201).json({ success: true, booking, message: balancePaid ? "Rental confirmed." : "Deposit confirmed. Balance payment required at rental start.", requiresBalance: !balancePaid });

  } catch (err) {
    console.error("❌ Crypto confirmation failed:", err);
    res.status(500).json({ error: "Crypto confirmation failed" });
  }
});

/* ================= CONFIRM BALANCE PAYMENT ================= */
router.post("/confirm-balance", authMiddleware, async (req, res) => {
  try {
    const { bookingId, vehicleId, balanceTxHash, walletAddress, renterPhone } = req.body;
    const userId = req.user.id;

    if (!bookingId || !balanceTxHash) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["bookingId", "balanceTxHash"]
      });
    }

    const booking = await Booking.findOne({
      $or: [
        { bookingId },
        { blockchainBookingId: bookingId }
      ],
      userId,
      depositPaid: true,
      balancePaid: false
    }).populate("vehicleId", "name");

    if (!booking) {
      return res.status(404).json({
        error: "Booking not found or balance already paid"
      });
    }

    booking.balancePaid = true;
    booking.balanceTxHash = balanceTxHash;
    booking.balancePaidAt = new Date();
    booking.paymentStatus = "confirmed";

    await booking.save();

    console.log(`✅ Balance paid for rental ${bookingId}`);

    res.json({
      success: true,
      booking: {
        id: booking._id,
        bookingId: booking.bookingId || booking.blockchainBookingId,
        depositTxHash: booking.depositTxHash,
        balanceTxHash: booking.balanceTxHash,
        totalPaid: booking.depositAmount + booking.balanceAmount,
        paymentStatus: booking.paymentStatus
      },
      message: "Balance payment confirmed."
    });

  } catch (err) {
    console.error("❌ Balance payment confirmation failed:", err);
    res.status(500).json({ error: "Balance payment confirmation failed" });
  }
});

/* ================= GET BOOKINGS ================= */

router.get("/my", authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find({
      userId: req.user.id
    })
      .populate("vehicleId", "name image dailyPrice")
      .sort({ createdAt: -1 })
      .lean();

    const bookingsWithStatus = bookings.map((b) => ({
      ...b,
      // Frontend (my_booking.js + dashboard.js) expects the populated unit under `unitId`
      // Keep `vehicleId` as-is for other consumers.
      unitId: b.vehicleId,
      bookingId: b.bookingId || b.blockchainBookingId,
      depositPaid: b.depositPaid || false,
      balancePaid: b.balancePaid || false,
      depositAmount: b.depositAmount || 0,
      balanceAmount: b.balanceAmount || 0,
    }));

    res.json({
      success: true,
      bookings: bookingsWithStatus
    });
  } catch (err) {
    console.error("❌ Fetch user bookings failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/cancel/:id", authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.id });
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const hoursUntilStart = (new Date(booking.startDate) - new Date()) / (1000 * 60 * 60);
    if (hoursUntilStart < 24) {
      return res.status(400).json({ error: "Cannot cancel less than 24 hours before rental start" });
    }

    booking.paymentStatus = "cancelled";
    booking.cancelledAt = new Date();
    await booking.save();

    let refundNote = "";
    if (booking.paymentMethod === "crypto") {
      if (booking.balancePaid) {
        refundNote = `Balance of $${booking.balanceAmount} will be refunded. Deposit of $${booking.depositAmount} is non-refundable.`;
        console.log(`🔄 Crypto balance refund needed for booking: ${booking._id}`);
      } else if (booking.depositPaid) {
        refundNote = `Deposit of $${booking.depositAmount} is non-refundable.`;
      }
    }

    res.json({
      success: true,
      message: "Rental cancelled successfully",
      refundNote: refundNote || "Refund will be processed to your original payment method"
    });

  } catch (err) {
    console.error("❌ Cancel booking failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/vehicle/:vehicleId", async (req, res) => {
  try {
    const bookings = await Booking.find({
      vehicleId: req.params.vehicleId,
      $or: [
        { paymentStatus: "confirmed" },
        { depositPaid: true }
      ],
      cancelledAt: null
    });
    res.json({
      success: true,
      bookings
    });
  } catch (err) {
    console.error("❌ Failed to fetch bookings:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/crypto/:bookingId", authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      $or: [
        { _id: req.params.bookingId },
        { bookingId: req.params.bookingId },
        { blockchainBookingId: req.params.bookingId }
      ],
      userId: req.user.id,
      paymentMethod: "crypto"
    }).populate("vehicleId", "name");

    if (!booking) return res.status(404).json({ error: "Crypto booking not found" });

    res.json({
      success: true,
      booking: {
        id: booking._id,
        bookingId: booking.bookingId || booking.blockchainBookingId,
        depositTxHash: booking.depositTxHash,
        balanceTxHash: booking.balanceTxHash,
        walletAddress: booking.walletAddress,
        vehicle: booking.vehicleId,
        startDate: booking.startDate,
        endDate: booking.endDate,
        totalPrice: booking.totalPrice,
        depositPaid: booking.depositPaid,
        balancePaid: booking.balancePaid,
        depositAmount: booking.depositAmount,
        balanceAmount: booking.balanceAmount,
        status: booking.paymentStatus
      }
    });
  } catch (err) {
    console.error("❌ Failed to fetch crypto booking:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
