import express from "express";
import PendingUser from "../models/PendingUser.js";

const router = express.Router();

// GET /api/pending-users — return pending KYC
router.get("/pending", async (req, res) => {
  try {
    const pending = await PendingUser.find({ "kyc.status": "submitted" });
    res.json(pending);
  } catch (err) {
    console.error("Error fetching pending KYC:", err);
    res.status(500).json({ error: "Failed to fetch pending KYC" });
  }
});

export default router;
