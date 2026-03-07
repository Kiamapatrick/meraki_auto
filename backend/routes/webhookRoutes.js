// ===============================
// routes/webhookRoutes.js - ALL Payment Webhooks
// M-Pesa, Visa, and Paystack
// ===============================
import express from "express";
import Booking from "../models/Booking.js";
import MpesaPendingBooking from "../models/MpesaPendingBooking.js";
import User from "../models/user.js";
import { handlePaystackWebhook } from "../controllers/paystackController.js";

const router = express.Router();

// ===============================
// CONFIGURATION
// ===============================
const FIXED_DEPOSIT_AMOUNT = 5;
const PENDING_BOOKING_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// ===============================
// HELPER FUNCTIONS
// ===============================

// (access-code generation removed)

/**
 * Calculate nights from dates
 */
function calculateNights(startDate, endDate) {
  return Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24));
}

/**
 * Validate payment amounts
 */
function validatePaymentAmounts(depositAmount, balanceAmount, totalAmount) {
  if (typeof depositAmount !== 'number' || typeof balanceAmount !== 'number') {
    return { valid: false, error: 'Payment amounts must be numbers' };
  }
  
  if (depositAmount < 0 || balanceAmount < 0) {
    return { valid: false, error: 'Payment amounts cannot be negative' };
  }
  
  if (Math.abs((depositAmount + balanceAmount) - totalAmount) > 0.01) {
    return { valid: false, error: 'Payment amounts do not match total' };
  }
  
  return { valid: true };
}

/**
 * KYC Helper - Check if user has approved KYC
 */
const checkKYC = (user, phase) => {
  if ((phase === "BALANCE" || phase === "FULL") && user?.kyc?.status !== "approved") {
    const err = new Error(
      "KYC not approved. Complete identity verification before paying balance."
    );
    err.status = 403;
    throw err;
  }
};

/**
 * Check for duplicate bookings
 */
async function checkDuplicateBooking(vehicleId, userId, startDate, endDate, paymentPhase, originalBookingId = null) {
  const query = {
    vehicleId,
    userId,
    startDate,
    endDate,
    paymentStatus: { $nin: ['cancelled', 'failed'] }
  };
  
  // For balance payments, exclude the original booking
  if (paymentPhase === 'BALANCE' && originalBookingId) {
    query.bookingId = { $ne: originalBookingId };
  }
  
  const existing = await Booking.findOne(query);
  
  if (existing) {
    if (paymentPhase === 'DEPOSIT' && existing.depositPaid) {
      return { duplicate: true, booking: existing };
    }
    if (paymentPhase === 'BALANCE' && existing.balancePaid) {
      return { duplicate: true, booking: existing };
    }
  }
  
  return { duplicate: false };
}

/**
 * Find original booking for balance payment
 */
async function findOriginalBooking(originalBookingId, userId, paymentMethod) {
  const booking = await Booking.findOne({
    bookingId: originalBookingId,
    userId,
    paymentMethod,
    depositPaid: true,
    balancePaid: false
  });
  
  return booking;
}

/**
 * Create new booking (deposit or full payment)
 */
async function createNewBooking(data) {
  const {
    bookingId,
    vehicleId,
    userId,
    startDate,
    endDate,
    nights,
    totalAmount,
    depositAmount,
    balanceAmount,
    paymentMethod,
    txId,
    paymentPhase,
    renter,
    renterPhone
  } = data;
  
  const isFullPayment = paymentPhase === 'FULL';
  
  const booking = await Booking.create({
    bookingId,
    vehicleId,
    userId: userId || renter,
    startDate,
    endDate,
    totalPrice: totalAmount,
    nights,
    paymentMethod,
    
    // Deposit fields
    depositPaid: true,
    depositAmount: isFullPayment ? totalAmount : depositAmount,
    depositTxHash: txId,
    depositPaidAt: new Date(),
    
    // Balance fields
    balancePaid: isFullPayment,
    balanceAmount: isFullPayment ? 0 : balanceAmount,
    balanceTxHash: isFullPayment ? txId : null,
    balancePaidAt: isFullPayment ? new Date() : null,
    
    // Status
    paymentStatus: isFullPayment ? 'confirmed' : 'pending',
    
    // Metadata
    renterPhone: renterPhone || null
  });
  
  return booking;
}

/**
 * Update booking with balance payment
 */
async function updateBookingWithBalance(booking, txId) {
  booking.balancePaid = true;
  booking.balanceTxHash = txId;
  booking.balancePaidAt = new Date();
  booking.paymentStatus = 'confirmed';
  await booking.save();
  return booking;
}

/**
 * Clean up stale pending bookings
 */
async function cleanupStalePendingBookings() {
  try {
    const cutoffTime = new Date(Date.now() - PENDING_BOOKING_TIMEOUT);
    
    const result = await MpesaPendingBooking.updateMany(
      {
        status: 'pending',
        createdAt: { $lt: cutoffTime }
      },
      {
        $set: { status: 'timeout' }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`🧹 Cleaned up ${result.modifiedCount} stale pending bookings`);
    }
  } catch (err) {
    console.error('❌ Cleanup failed:', err);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupStalePendingBookings, 5 * 60 * 1000);

// ===============================
// M-PESA WEBHOOK (Two-phase)
// ===============================
router.post("/mpesa", async (req, res) => {
  try {
    console.log('📥 M-Pesa webhook received:', req.body);
    
    const { 
      vehicleId, 
      startDate, 
      endDate, 
      depositAmount, 
      balanceAmount, 
      totalAmount,
      txId, 
      renter, 
      userId,
      paymentPhase,
      originalBookingId,
      renterPhone,
      startDay,
      nights
    } = req.body;

    // Validate required fields
    if (!vehicleId || (!startDate && !startDay) || !txId || !paymentPhase) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields",
        required: ['vehicleId', 'startDate or startDay', 'txId', 'paymentPhase']
      });
    }
    
    if (!userId && !renter) {
      console.error('❌ Missing user identifier');
      return res.status(400).json({ 
        success: false,
        error: "Missing userId or renter"
      });
    }

    const finalUserId = userId || renter;
    
    // Get user and check KYC
    const user = await User.findOne({ 
      $or: [
        { _id: finalUserId },
        { email: finalUserId }
      ]
    });
    
    if (!user) {
      console.error('❌ User not found');
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    // Check KYC for balance/full payments
    try {
      checkKYC(user, paymentPhase);
    } catch (err) {
      console.error('❌ KYC check failed:', err.message);
      return res.status(err.status || 403).json({ 
        success: false,
        error: err.message 
      });
    }

    const calculatedNights = nights || calculateNights(startDate, endDate);
    const isFullPayment = paymentPhase === 'FULL';
    const isBalancePayment = paymentPhase === 'BALANCE';

    // Validate payment amounts
    if (!isBalancePayment) {
      const validation = validatePaymentAmounts(
        depositAmount || 0,
        balanceAmount || 0,
        totalAmount || (depositAmount + balanceAmount)
      );
      
      if (!validation.valid) {
        console.error('❌ Invalid payment amounts:', validation.error);
        return res.status(400).json({ 
          success: false,
          error: validation.error 
        });
      }
    }

    // Handle BALANCE payment
    if (isBalancePayment) {
      if (!originalBookingId) {
        console.error('❌ Missing originalBookingId for balance payment');
        return res.status(400).json({ 
          success: false,
          error: "originalBookingId required for balance payment"
        });
      }

      // Find original booking
      const originalBooking = await findOriginalBooking(
        originalBookingId,
        user._id,
        'mpesa'
      );

      if (!originalBooking) {
        console.error('❌ Original booking not found or invalid');
        return res.status(404).json({ 
          success: false,
          error: "Original booking not found or already paid"
        });
      }

      // Check if balance already paid
      if (originalBooking.balancePaid) {
        console.warn('⚠️ Balance already paid for booking:', originalBookingId);
        return res.status(409).json({ success: false, error: "Balance already paid for this booking", booking: { bookingId: originalBooking.bookingId } });
      }

      // Update with balance payment
      const updatedBooking = await updateBookingWithBalance(originalBooking, txId);

      console.log('✅ Balance payment processed:', { bookingId: updatedBooking.bookingId });

      return res.json({ success: true, ok: true, bookingId: updatedBooking.bookingId, status: updatedBooking.paymentStatus, depositPaid: updatedBooking.depositPaid, balancePaid: updatedBooking.balancePaid, message: "Balance payment confirmed" });
    }

    // Handle DEPOSIT or FULL payment
    // Check for duplicates
    const duplicateCheck = await checkDuplicateBooking(
      vehicleId,
      user._id,
      startDate,
      endDate,
      paymentPhase
    );

    if (duplicateCheck.duplicate) {
      console.warn('⚠️ Duplicate booking detected');
      return res.status(409).json({ 
        success: false,
        error: "Booking already exists for these dates",
        booking: {
          bookingId: duplicateCheck.booking.bookingId,
          status: duplicateCheck.booking.paymentStatus
        }
      });
    }

    // Generate unique booking ID
    const bookingId = `mpesa_${Date.now()}_${vehicleId}`;

    // Create new booking
    const booking = await createNewBooking({
      bookingId,
      vehicleId,
      userId: user._id,
      startDate,
      endDate,
      nights: calculatedNights,
      totalAmount: totalAmount || (depositAmount + balanceAmount),
      depositAmount: depositAmount || FIXED_DEPOSIT_AMOUNT,
      balanceAmount: balanceAmount || 0,
      paymentMethod: 'mpesa',
      txId,
      paymentPhase,
      renter: user._id,
      renterPhone
    });

    console.log('✅ M-Pesa booking created:', { bookingId: booking.bookingId, status: booking.paymentStatus, depositPaid: booking.depositPaid, balancePaid: booking.balancePaid });

    res.json({ success: true, ok: true, bookingId: booking.bookingId, status: booking.paymentStatus, depositPaid: booking.depositPaid, balancePaid: booking.balancePaid, message: isFullPayment ? "Full payment confirmed" : "Deposit confirmed - balance due at check-in" });

  } catch (err) {
    console.error('❌ M-Pesa webhook error:', err);
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ===============================
// VISA WEBHOOK (Two-phase)
// ===============================
router.post("/visa", async (req, res) => {
  try {
    console.log('📥 Visa webhook received:', req.body);
    
    const { 
      vehicleId, 
      startDate, 
      endDate, 
      depositAmount, 
      balanceAmount, 
      totalAmount,
      txId, 
      renter, 
      userId,
      paymentPhase,
      originalBookingId,
      renterPhone,
      startDay,
      nights
    } = req.body;

    // Validate required fields
    if (!vehicleId || (!startDate && !startDay) || !txId || !paymentPhase) {
      console.error('❌ Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: "Missing required fields",
        required: ['vehicleId', 'startDate or startDay', 'txId', 'paymentPhase']
      });
    }
    
    if (!userId && !renter) {
      console.error('❌ Missing user identifier');
      return res.status(400).json({ 
        success: false,
        error: "Missing userId or renter"
      });
    }

    const finalUserId = userId || renter;
    
    // Get user and check KYC
    const user = await User.findOne({ 
      $or: [
        { _id: finalUserId },
        { email: finalUserId }
      ]
    });
    
    if (!user) {
      console.error('❌ User not found');
      return res.status(404).json({ 
        success: false,
        error: "User not found" 
      });
    }

    // Check KYC for balance/full payments
    try {
      checkKYC(user, paymentPhase);
    } catch (err) {
      console.error('❌ KYC check failed:', err.message);
      return res.status(err.status || 403).json({ 
        success: false,
        error: err.message 
      });
    }

    const calculatedNights = nights || calculateNights(startDate, endDate);
    const isFullPayment = paymentPhase === 'FULL';
    const isBalancePayment = paymentPhase === 'BALANCE';

    // Validate payment amounts
    if (!isBalancePayment) {
      const validation = validatePaymentAmounts(
        depositAmount || 0,
        balanceAmount || 0,
        totalAmount || (depositAmount + balanceAmount)
      );
      
      if (!validation.valid) {
        console.error('❌ Invalid payment amounts:', validation.error);
        return res.status(400).json({ 
          success: false,
          error: validation.error 
        });
      }
    }

    // Handle BALANCE payment
    if (isBalancePayment) {
      if (!originalBookingId) {
        console.error('❌ Missing originalBookingId for balance payment');
        return res.status(400).json({ 
          success: false,
          error: "originalBookingId required for balance payment"
        });
      }

      // Find original booking
      const originalBooking = await findOriginalBooking(
        originalBookingId,
        user._id,
        'visa'
      );

      if (!originalBooking) {
        console.error('❌ Original booking not found or invalid');
        return res.status(404).json({ 
          success: false,
          error: "Original booking not found or already paid"
        });
      }

      // Check if balance already paid
      if (originalBooking.balancePaid) {
        console.warn('⚠️ Balance already paid for booking:', originalBookingId);
        return res.status(409).json({ success: false, error: "Balance already paid for this booking", booking: { bookingId: originalBooking.bookingId } });
      }

      // Update with balance payment
      const updatedBooking = await updateBookingWithBalance(originalBooking, txId);

      console.log('✅ Balance payment processed:', { bookingId: updatedBooking.bookingId });

      return res.json({ success: true, ok: true, bookingId: updatedBooking.bookingId, status: updatedBooking.paymentStatus, depositPaid: updatedBooking.depositPaid, balancePaid: updatedBooking.balancePaid, message: "Balance payment confirmed" });
    }

    // Handle DEPOSIT or FULL payment
    // Check for duplicates
    const duplicateCheck = await checkDuplicateBooking(
      vehicleId,
      user._id,
      startDate,
      endDate,
      paymentPhase
    );

    if (duplicateCheck.duplicate) {
      console.warn('⚠️ Duplicate booking detected');
      return res.status(409).json({ 
        success: false,
        error: "Booking already exists for these dates",
        booking: {
          bookingId: duplicateCheck.booking.bookingId,
          status: duplicateCheck.booking.paymentStatus
        }
      });
    }

    // Generate unique booking ID
    const bookingId = `visa_${Date.now()}_${vehicleId}`;

    // Create new booking
    const booking = await createNewBooking({
      bookingId,
      vehicleId,
      userId: user._id,
      startDate,
      endDate,
      nights: calculatedNights,
      totalAmount: totalAmount || (depositAmount + balanceAmount),
      depositAmount: depositAmount || FIXED_DEPOSIT_AMOUNT,
      balanceAmount: balanceAmount || 0,
      paymentMethod: 'visa',
      txId,
      paymentPhase,
      renter: user._id,
      renterPhone
    });

    console.log('✅ Visa booking created:', { bookingId: booking.bookingId, status: booking.paymentStatus, depositPaid: booking.depositPaid, balancePaid: booking.balancePaid });

    res.json({ success: true, ok: true, bookingId: booking.bookingId, status: booking.paymentStatus, depositPaid: booking.depositPaid, balancePaid: booking.balancePaid, message: isFullPayment ? "Full payment confirmed" : "Deposit confirmed - balance due at check-in" });

  } catch (err) {
    console.error('❌ Visa webhook error:', err);
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ===============================
// PAYSTACK WEBHOOK
// ===============================
// Note: This route requires raw body middleware
// Set up in app.js/server.js BEFORE bodyParser.json()
router.post("/paystack", handlePaystackWebhook);

export default router;
