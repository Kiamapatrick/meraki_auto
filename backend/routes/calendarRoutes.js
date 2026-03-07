// routes/calendarRoutes.js
import express from "express";
import Booking from "../models/Booking.js";

const router = express.Router();

/**
 * GET /api/calendar/:vehicleId
 * Returns booking date ranges for a given unit.
 * Includes:
 * - Fully paid bookings (paymentStatus: "confirmed")
 * - Deposit-only bookings (depositPaid: true)
 */
router.get("/:vehicleId", async (req, res) => {
  try {
    const { vehicleId } = req.params;
    console.log(`[calendarRoutes] Fetching calendar for unit ${vehicleId}`);

    // Fetch bookings that are either fully confirmed or have a deposit paid
    const bookings = await Booking.find({
      vehicleId,
      $or: [
        { paymentStatus: "confirmed" },
        { depositPaid: true }
      ]
    }).lean();

    console.log(`[calendarRoutes] Found ${bookings.length} relevant bookings`);

    // Format data for frontend calendar
    const bookedDates = bookings.map(b => ({
      startDate: b.startDate,
      endDate: b.endDate,
      status: b.paymentStatus || (b.depositPaid ? "deposit" : "pending"),
      depositPaid: b.depositPaid || false,
      balancePaid: b.balancePaid || false
    }));

    res.json({
      vehicleId,
      bookings: bookedDates
    });
  } catch (error) {
    console.error("[calendarRoutes] Error fetching calendar:", error);
    res.status(500).json({ error: "Failed to fetch calendar data" });
  }
});

export default router;
