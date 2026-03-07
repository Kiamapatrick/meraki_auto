// routes/mpesaRoutes.js
import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { 
  initiateMpesaPayment, 
  darajaCallback, 
  checkPaymentStatus, 
  initiateBalancePayment 
} from "../controllers/mpesaController.js";

const router = express.Router();

// Initial deposit/full payment
router.post("/initiate", authMiddleware, initiateMpesaPayment);

// Safaricom callback (no auth needed)
router.post("/callback", darajaCallback);

// Check payment status
router.get("/status/:bookingId", authMiddleware, checkPaymentStatus);

// ✅ FIXED: Balance payment route (matches frontend call)
router.post("/balance", authMiddleware, initiateBalancePayment);

export default router;