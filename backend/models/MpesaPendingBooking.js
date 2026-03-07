import mongoose from "mongoose";

const mpesaPendingBookingSchema = new mongoose.Schema({
  bookingId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  vehicleId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Vehicle", 
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  totalPrice: { type: Number, required: true },
  nights: { type: Number, required: true },
  renterPhone: { type: String, required: true },
  
  // M-Pesa specific fields
  CheckoutRequestID: { type: String },
  MerchantRequestID: { type: String },
  mpesaReceiptNumber: { type: String },
  
  status: { 
    type: String, 
    enum: ["pending", "confirmed", "cancelled", "failed", "timeout"],
    default: "pending" 
  },
  
  // Reference to actual booking once created
  bookingDbId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Booking" 
  },
  
  // Payment details
  amountPaid: { type: Number },
  transactionDate: { type: Date },

  // ===============================
  // TWO-PHASE PAYMENT FIELDS
  // ===============================
  paymentType: { 
    type: String, 
    enum: ["DEPOSIT", "FULL", "BALANCE"], 
    default: "DEPOSIT" 
  },
  depositAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  depositPaid: { type: Boolean, default: false },
  balancePaid: { type: Boolean, default: false },
  originalBookingId: { type: String }, // Reference to main booking for balance payments
  balancePayment: { type: Boolean, default: false }, // Marks a pending record as balance-only

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  
  // Auto-expire after 10 minutes if not confirmed
  expiresAt: { 
    type: Date, 
    default: () => new Date(Date.now() + 10 * 60 * 1000) 
  }
}, {
  timestamps: true
});

// Indexes
mpesaPendingBookingSchema.index({ CheckoutRequestID: 1 });
mpesaPendingBookingSchema.index({ status: 1 });
mpesaPendingBookingSchema.index({ userId: 1 });
mpesaPendingBookingSchema.index({ createdAt: 1 });

// TTL index - auto-delete expired pending bookings
mpesaPendingBookingSchema.index(
  { expiresAt: 1 }, 
  { expireAfterSeconds: 0 }
);

export default mongoose.model("MpesaPendingBooking", mpesaPendingBookingSchema);
