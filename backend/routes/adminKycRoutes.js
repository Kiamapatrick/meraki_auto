import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/user.js";
import Booking from "../models/Booking.js";
import { verifyToken, verifyAdmin } from "../middleware/authMiddleware.js";
import {
  sendKycApprovedEmail,
  sendKycRejectedEmail,
} from "../controllers/authController.js";

const router = express.Router();

/** ===============================
 *  1. One-time Admin Setup
 *  =============================== */
router.post("/setup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Admin already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new User({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      emailVerified: true,
      kyc: { status: "approved" },
    });

    await admin.save();
    res.status(201).json({ message: "Admin created successfully", admin });
  } catch (err) {
    console.error("Admin setup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/** ===============================
 *  2. Admin KYC Management
 *  =============================== */

// List all users with submitted KYC
router.get("/kyc/submissions", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const submissions = await User.find({ "kyc.status": "submitted" });
    res.json({ success: true, submissions });
  } catch (err) {
    console.error("List KYC error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Approve KYC
router.post(
  "/kyc/approve/:userId",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      user.kyc.status = "approved";
      await user.save();

      // Send KYC approved email
      await sendKycApprovedEmail(user);

      res.json({ success: true, message: "KYC approved" });
    } catch (err) {
      console.error("Approve KYC error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// Reject KYC
router.post(
  "/kyc/reject/:userId",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      user.kyc.status = "rejected";
      await user.save();

      // Send KYC rejected email
      await sendKycRejectedEmail(user);

      res.json({ success: true, message: "KYC rejected" });
    } catch (err) {
      console.error("Reject KYC error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/** ===============================
 *  3. Admin Dashboard Overview
 *  ===============================
 * GET /api/admin/dashboard/overview
 * Returns:
 * - Total bookings
 * - Bookings created today
 * - Active bookings
 * - Pending payments
 * - Total revenue
 * - Pending KYC verifications
 * - Recent 5 bookings
 * - Recent 5 payments (derived from bookings)
 * - Recent 5 registered users
 */
router.get(
  "/dashboard/overview",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      // 1) Core counts
      const [
        totalBookings,
        bookingsCreatedToday,
        pendingKycVerifications,
        recentBookingsRaw,
        recentUsersRaw,
        recentPaymentsRaw,
        revenueAgg,
        pendingPayments,
        activeBookings,
      ] = await Promise.all([
        Booking.countDocuments({}),
        Booking.countDocuments({ createdAt: { $gte: startOfToday } }),
        User.countDocuments({ "kyc.status": "submitted" }),

        Booking.find({})
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("vehicleId", "name")
          .populate("userId", "name email")
          .lean(),

        User.find({})
          .sort({ createdAt: -1 })
          .limit(5)
          .select("name email role createdAt emailVerified kyc")
          .lean(),

        Booking.find({
          $or: [
            { depositPaid: true },
            { balancePaid: true },
            { depositPaidAt: { $ne: null } },
            { balancePaidAt: { $ne: null } },
            { paymentStatus: { $in: ["confirmed", "completed"] } },
          ],
        })
          .sort({ updatedAt: -1, createdAt: -1 })
          .limit(20)
          .populate("vehicleId", "name")
          .populate("userId", "name email")
          .lean(),

        // Revenue = settled amount from paid phases to avoid overcounting full totals
        Booking.aggregate([
          {
            $project: {
              settledAmount: {
                $add: [
                  {
                    $cond: [
                      { $eq: ["$depositPaid", true] },
                      { $ifNull: ["$depositAmount", 0] },
                      0,
                    ],
                  },
                  {
                    $cond: [
                      { $eq: ["$balancePaid", true] },
                      { $ifNull: ["$balanceAmount", 0] },
                      0,
                    ],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$settledAmount" },
            },
          },
        ]),

        // Pending payments = booking still pending and not fully paid
        Booking.countDocuments({
          $or: [
            { paymentStatus: "pending" },
            { paymentStatus: { $exists: false } },
          ],
          balancePaid: { $ne: true },
        }),

        // Active bookings = current date between startDate and endDate and not cancelled
        Booking.countDocuments({
          paymentStatus: { $ne: "cancelled" },
          startDate: { $lte: now },
          endDate: { $gte: now },
        }),
      ]);

      const totalRevenue = revenueAgg?.[0]?.totalRevenue ?? 0;

      // 2) Recent bookings mapped
      const recentBookings = recentBookingsRaw.map((b) => ({
        id: b._id,
        bookingId: b.bookingId || b.blockchainBookingId || null,
        unit: b.vehicleId
          ? {
              id: b.vehicleId._id || null,
              name: b.vehicleId.name || "Unknown Unit",
            }
          : null,
        user: b.userId
          ? {
              id: b.userId._id || null,
              name: b.userId.name || "Unknown User",
              email: b.userId.email || null,
            }
          : null,
        startDate: b.startDate,
        endDate: b.endDate,
        totalPrice: b.totalPrice ?? 0,
        paymentMethod: b.paymentMethod || null,
        paymentStatus: b.paymentStatus || "pending",
        depositPaid: !!b.depositPaid,
        balancePaid: !!b.balancePaid,
        createdAt: b.createdAt,
      }));

      // 3) Recent payments (derived from the latest payment-relevant bookings)
      const paymentEvents = [];
      for (const b of recentPaymentsRaw) {
        if (b.depositPaidAt || b.depositPaid) {
          paymentEvents.push({
            id: `${b._id}-deposit`,
            bookingId: b.bookingId || b.blockchainBookingId || null,
            type: "deposit",
            amount:
              typeof b.depositAmount === "number"
                ? b.depositAmount
                : typeof b.totalPrice === "number"
                ? b.totalPrice
                : 0,
            method: b.paymentMethod || null,
            status: b.depositPaid ? "paid" : "pending",
            paidAt: b.depositPaidAt || b.updatedAt || b.createdAt,
            user: b.userId
              ? {
                  id: b.userId._id || null,
                  name: b.userId.name || "Unknown User",
                  email: b.userId.email || null,
                }
              : null,
            unit: b.vehicleId
              ? {
                  id: b.vehicleId._id || null,
                  name: b.vehicleId.name || "Unknown Unit",
                }
              : null,
          });
        }

        if (b.balancePaidAt || b.balancePaid) {
          paymentEvents.push({
            id: `${b._id}-balance`,
            bookingId: b.bookingId || b.blockchainBookingId || null,
            type: "balance",
            amount:
              typeof b.balanceAmount === "number"
                ? b.balanceAmount
                : typeof b.totalPrice === "number"
                ? b.totalPrice
                : 0,
            method: b.paymentMethod || null,
            status: b.balancePaid ? "paid" : "pending",
            paidAt: b.balancePaidAt || b.updatedAt || b.createdAt,
            user: b.userId
              ? {
                  id: b.userId._id || null,
                  name: b.userId.name || "Unknown User",
                  email: b.userId.email || null,
                }
              : null,
            unit: b.vehicleId
              ? {
                  id: b.vehicleId._id || null,
                  name: b.vehicleId.name || "Unknown Unit",
                }
              : null,
          });
        }
      }

      const recentPayments = paymentEvents
        .sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0))
        .slice(0, 5);

      // 4) Recent users mapped
      const recentUsers = recentUsersRaw.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        emailVerified: !!u.emailVerified,
        kycStatus: u.kyc?.status || "pending",
        createdAt: u.createdAt,
      }));

      return res.json({
        success: true,
        generatedAt: new Date(),
        metrics: {
          totalBookings,
          bookingsCreatedToday,
          activeBookings,
          pendingPayments,
          totalRevenue,
          pendingKycVerifications,
        },
        recent: {
          bookings: recentBookings,
          payments: recentPayments,
          users: recentUsers,
        },
      });
    } catch (err) {
      console.error("Admin dashboard overview error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to load admin dashboard overview",
      });
    }
  }
);

export default router;
