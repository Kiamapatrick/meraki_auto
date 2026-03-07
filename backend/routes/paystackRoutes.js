// routes/paystackRoutes.js 
import express from "express";
import { initPaystackPayment } from "../controllers/paystackController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

console.log("🔧 Paystack routes module loaded");

// Test route to verify router is working
router.get("/test", (req, res) => {
  res.json({ 
    status: "✅ Paystack routes are working",
    timestamp: new Date().toISOString()
  });
});

// ===============================
// INITIALIZE PAYSTACK PAYMENT
// ===============================
router.post("/init", authMiddleware, (req, res, next) => {
  console.log("📥 POST /init hit - Auth middleware passed");
  console.log("User:", req.user);
  console.log("Body:", req.body);
  next();
}, initPaystackPayment);

// Catch-all for unmatched routes under /api/payments/paystack
router.use((req, res) => {
  console.log(`❌ Unmatched Paystack route: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: "Paystack route not found",
    availableRoutes: [
      "GET /api/payments/paystack/test",
      "POST /api/payments/paystack/init"
    ]
  });
});

export default router;