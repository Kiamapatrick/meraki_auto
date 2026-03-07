// backend/routes/diditRoutes.js
import express from "express";
import { startDiditKyc, diditWebhook } from "../controllers/diditController.js";
import { verifyToken } from "../controllers/authController.js";
const router = express.Router();

const frontendUrl = process.env.FRONTEND_URL;


// ===========================
// Start Didit KYC Session (Protected)
// ===========================
router.post("/start", verifyToken, startDiditKyc);

// ===========================
// Didit Webhook (KYC Result) - POST
// ===========================
router.post(
  "/webhook",
  express.json(), // Didit uses JSON, not raw signatures
  diditWebhook
);

// ===========================
// Didit Webhook GET - User Redirect After Verification
// ===========================
// In diditRoutes.js
router.get("/webhook", (req, res) => {
  const { referenceId, vendor_data } = req.query;
  
  // Try to get user ID from either parameter
  const userId = referenceId || vendor_data;
  
  res.redirect(
    `${frontendUrl}/kyc-callback.html?uid=${userId || ''}`
  );
});


export default router;
