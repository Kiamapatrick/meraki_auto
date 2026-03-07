// models/Reservation.js
import mongoose from "mongoose";

const ReservationSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  paymentMethod: { type: String, enum: ["crypto", "mpesa", "visa"], required: true },
  totalPrice: Number,
  status: { type: String, default: "confirmed" },
});

export default mongoose.model("Reservation", ReservationSchema);
