/*Routes/availabiltyRoutes.js*/
import express from "express";
import Booking from "../models/Booking.js";

const router = express.Router();

router.get("/:vehicleId", async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const bookings = await Booking.find({ vehicleId, status: "confirmed" });

    const days = [];
    bookings.forEach((b) => {
      for (let d = 0; d < b.nights; d++) {
        days.push(b.startDay + d);
      }
    });

    res.json({ bookedDays: days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load availability" });
  }
});

export default router;
