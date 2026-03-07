import express from "express";
import Review from "../models/Review.js";
import User from "../models/user.js";
import { verifyToken } from "../controllers/authController.js";

const router = express.Router();

// ================================
// GET /api/reviews/:vehicleId
// Public — returns all reviews for a unit + average
// ================================
router.get("/:vehicleId", async (req, res) => {
    try {
        const reviews = await Review.find({ vehicleId: req.params.vehicleId })
            .sort({ createdAt: -1 })
            .lean();

        // Calculate average rating
        const count = reviews.length;
        const average =
            count > 0
                ? +(reviews.reduce((sum, r) => sum + r.rating, 0) / count).toFixed(1)
                : 0;

        res.json({ success: true, reviews, average, count });
    } catch (err) {
        console.error("Get reviews error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ================================
// POST /api/reviews/:vehicleId
// Protected — create a review (one per user per unit)
// ================================
router.post("/:vehicleId", verifyToken, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const userId = req.userId;

        if (!rating || rating < 1 || rating > 5) {
            return res
                .status(400)
                .json({ success: false, message: "Rating must be between 1 and 5" });
        }

        // Get user name
        const user = await User.findById(userId).select("name");
        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }

        // Check for existing review
        const existing = await Review.findOne({
            vehicleId: req.params.vehicleId,
            userId,
        });

        if (existing) {
            return res
                .status(409)
                .json({ success: false, message: "You have already reviewed this unit" });
        }

        const review = await Review.create({
            vehicleId: req.params.vehicleId,
            userId,
            userName: user.name,
            rating: Math.round(rating),
            comment: (comment || "").trim().slice(0, 500),
        });

        res.status(201).json({ success: true, review });
    } catch (err) {
        // Handle duplicate key error (race condition)
        if (err.code === 11000) {
            return res
                .status(409)
                .json({ success: false, message: "You have already reviewed this unit" });
        }
        console.error("Create review error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;
