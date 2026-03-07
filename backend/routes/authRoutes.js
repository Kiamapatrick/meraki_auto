// backend/routes/authRoutes.js
import express from "express";
import {
  signup,
  login,
  verifyEmail,
  startVeriffKyc,
  veriffWebhook,
  veriffWebhookGet,
  checkKycStatus,
  verifyToken,
  uploadKyc,
  upload,
  getMe,
  getProfile,
  updateProfile,
  changePassword,
  enableTwoFactor,
  verifyTwoFactor,
  disableTwoFactor,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

const router = express.Router();

// ===========================
// Auth Routes
// ===========================
router.post("/signup", signup);
router.get("/verifyEmail", verifyEmail);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// ===========================
// Current authenticated user
// ===========================
router.get("/me", verifyToken, getMe);

// Profile (dashboard/account page)
router.get("/profile", verifyToken, getProfile);
router.put("/profile", verifyToken, updateProfile);

// Change password (support both PUT and POST for different frontends)
router.put("/change-password", verifyToken, changePassword);
router.post("/change-password", verifyToken, changePassword);

// Two-factor authentication (TOTP)
router.post("/enable-2fa", verifyToken, enableTwoFactor);
router.post("/verify-2fa", verifyToken, verifyTwoFactor);
router.post("/disable-2fa", verifyToken, disableTwoFactor);

// ===========================
// NEW: Start Veriff KYC Session
// ===========================
router.post("/start-kyc", verifyToken, startVeriffKyc); 

// ===========================
// NEW: Check KYC Status
// ===========================
router.get("/kyc-status", verifyToken, checkKycStatus); 

// ===========================
// KYC Upload Route (Legacy)
// ===========================
router.post(
  "/kyc-upload",  // ✅ Remove :userId parameter
  verifyToken,
  upload.fields([
    { name: "selfie", maxCount: 1 },
    { name: "document", maxCount: 1 },
  ]),
  uploadKyc
);

// ===========================
// Veriff Webhook (KYC Result) Route
// ===========================
router.post("/webhook/veriff", veriffWebhook);
router.post(
  "/webhook/veriff",
  express.raw({ type: "application/json" }),
  veriffWebhook
);

 
// ===========================
// Test Helper
// ===========================
router.get("/test", (req, res) => res.send("Auth routes working ✅"));
router.get("/kyc-status/:userId", verifyToken, checkKycStatus);

export default router;