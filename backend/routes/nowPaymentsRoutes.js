// routes/nowPaymentsRoutes.js
import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { 
  createNowPaymentsInvoice, 
  handleIPN, 
  getInvoiceStatus, 
  getAvailableCurrencies, 
  estimatePrice 
} from "../controllers/nowPaymentsController.js";

const router = express.Router();

console.log("🔧 NowPayments routes module loaded");

// ===============================
// TEST ROUTE
// ===============================
router.get("/test", (req, res) => {
  res.json({ 
    status: "✅ NowPayments routes are working",
    timestamp: new Date().toISOString()
  });
});

// ===============================
// CREATE INVOICE (Deposit or Balance)
// ===============================
router.post("/create", authMiddleware, (req, res, next) => {
  console.log("📥 POST /create hit - Auth middleware passed");
  console.log("User:", req.user);
  console.log("Body:", req.body);
  next();
}, createNowPaymentsInvoice);

// ===============================
// GET INVOICE STATUS
// ===============================
router.get("/status/:invoiceId", authMiddleware, getInvoiceStatus);

// ===============================
// GET AVAILABLE CURRENCIES
// ===============================
router.get("/currencies", authMiddleware, getAvailableCurrencies);

// ===============================
// ESTIMATE PRICE
// ===============================
router.get("/estimate", authMiddleware, estimatePrice);

// ===============================
// IPN WEBHOOK (No auth - called by NowPayments)
// ===============================
router.post("/ipn", handleIPN);

// ===============================
// CATCH-ALL
// ===============================
router.use((req, res) => {
  console.log(`❌ Unmatched NowPayments route: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: "NowPayments route not found",
    availableRoutes: [
      "GET /api/payments/nowpayments/test",
      "POST /api/payments/nowpayments/create",
      "GET /api/payments/nowpayments/status/:invoiceId",
      "GET /api/payments/nowpayments/currencies",
      "GET /api/payments/nowpayments/estimate",
      "POST /api/payments/nowpayments/ipn"
    ]
  });
});

export default router;