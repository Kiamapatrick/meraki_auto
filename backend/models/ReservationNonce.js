import mongoose from "mongoose";

const reservationNonceSchema = new mongoose.Schema({
  nonce: { type: String, unique: true, required: true },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
});

export default mongoose.model("ReservationNonce", reservationNonceSchema);
