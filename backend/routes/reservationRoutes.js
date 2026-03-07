// routes/reservationRoutes.js
import express from "express";
import crypto from "crypto";
import ReservationNonce from "../models/ReservationNonce.js";
import Booking from "../models/Booking.js";
import { signReservation } from "../utils/signerHelper.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { vehicleId, renter, startDay, nights } = req.body;

    if (!vehicleId || !startDay || !nights || !renter)
      return res.status(400).json({ error: "Missing fields" });

    // check if date is already booked
    const conflict = await Booking.findOne({
      vehicleId,
      startDay: { $lte: startDay + nights - 1 },
      $expr: { $gte: [{ $add: ["$startDay", "$nights"] }, startDay] },
      status: "confirmed",
    });

    if (conflict) {
      return res.status(400).json({ error: "Dates already booked" });
    }

    const nonce = "0x" + crypto.randomBytes(16).toString("hex");
    const expiry = Math.floor(Date.now() / 1000) + 600; // 10 min expiry

    await ReservationNonce.create({
      nonce,
      used: false,
      expiresAt: new Date(Date.now() + 600000),
    });

    const payload = { vehicleId, renter, startDay, nights, nonce, expiry };
    const { signature, signer } = await signReservation(payload);

    return res.json({ payload, signature, signer });
  } catch (err) {
    console.error("Reservation signing error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
