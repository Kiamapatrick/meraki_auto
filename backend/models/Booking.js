// models/Booking.js
import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },

  // Access codes (for rental delivery/pickup verification)
  // (access-code fields removed during vehicle-marketplace cleanup)

  // Pricing & nights
  totalPrice: { type: Number, required: true },
  nights: { type: Number, default: 1 },

  // Payment info
  paymentMethod: { type: String, enum: ["mpesa", "visa", "crypto"], default: null },
  paymentStatus: { type: String, enum: ["pending", "confirmed", "cancelled", "refunded", "completed"], default: "pending" },

  // Booking IDs
  bookingId: { type: String, unique: true, sparse: true, default: null },

  // M-Pesa
  merchantRequestId: { type: String, default: null },
  checkoutRequestId: { type: String, default: null },
  mpesaReceiptNumber: { type: String, default: null },
  renterPhone: { type: String, required: true, index: true },

  // Crypto
  blockchainBookingId: { type: String, default: null },
  blockchainTx: { type: String, default: null },
  walletAddress: { type: String, lowercase: true, default: null },

  // Paystack (NEW)
  paystackDepositRef: { type: String, default: null },
  paystackBalanceRef: { type: String, default: null },

  // Refund / cancellation
  cancelledAt: { type: Date, default: null },
  refundedAt: { type: Date, default: null },
  refundTxHash: { type: String, default: null },

  // Two-phase payments
  depositPaid: { type: Boolean, default: false },
  depositAmount: { type: Number, default: 0 },
  depositTxHash: { type: String, default: null },
  depositPaidAt: { type: Date, default: null },

  balancePaid: { type: Boolean, default: false },
  balanceAmount: { type: Number, default: 0 },
  balanceTxHash: { type: String, default: null },
  balancePaidAt: { type: Date, default: null },

}, { timestamps: true });

// ===============================
// Indexes
// ===============================
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ vehicleId: 1, startDate: 1, endDate: 1 });
bookingSchema.index({ walletAddress: 1 });
bookingSchema.index({ blockchainBookingId: 1 }, { unique: true, sparse: true });
bookingSchema.index({ depositTxHash: 1 });
bookingSchema.index({ userId: 1, depositPaid: 1, balancePaid: 1 });
bookingSchema.index({ paystackDepositRef: 1 });
bookingSchema.index({ paystackBalanceRef: 1 });

// ===============================
// Virtuals
// ===============================
bookingSchema.virtual("calculatedNights").get(function () {
  if (!this.startDate || !this.endDate) return 0;
  const diff = new Date(this.endDate) - new Date(this.startDate);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ===============================
// Pre-save hook to auto-calculate nights
// ===============================
bookingSchema.pre("save", function (next) {
  if (this.startDate && this.endDate && !this.nights) {
    const diff = new Date(this.endDate) - new Date(this.startDate);
    this.nights = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
  next();
});

const Booking = mongoose.model("Booking", bookingSchema);
export default Booking;