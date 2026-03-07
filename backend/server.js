// server.js
// ===========================
// 1. ENV + DEPENDENCIES 
// ===========================
import dotenv from "dotenv";
dotenv.config(); // Load ONCE, only here
if (process.env.BACKEND_URL && !process.env.BACKEND_URL.startsWith("https://")) {
  console.error("❌ BACKEND_URL must be HTTPS for Veriff");
  process.exit(1);
}

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import axios from "axios";
// Check-in scheduler removed - vehicle marketplace does not use property check-in logic



import authRoutes from "./routes/authRoutes.js";
import adminKycRoutes from "./routes/adminKycRoutes.js";
import reservationRoutes from "./routes/reservationRoutes.js";
import availabilityRoutes from "./routes/availabilityRoutes.js";
import { startBlockchainListener } from "./utils/eventListener.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import unitsRouter from "./routes/Units.js";
import rentalRoutes from "./routes/rentalRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import pendingUserRoutes from "./routes/pendinguser.js";
import userRoutes from "./routes/userRoutes.js";
import mpesaRoutes from "./routes/mpesaRoutes.js";
//import testATRoutes from "./routes/testAt.js"
import diditRoutes from "./routes/diditRoutes.js";
import paystackRoutes from "./routes/paystackRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js"; // ✅ NEW - Contains all webhooks
import reviewRoutes from "./routes/reviewRoutes.js";

// check-in notifier removed (access code / property check-in logic removed)

// ✅ Recreate __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===========================
// 2. APP SETUP
// ===========================
const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "https://alina906vibes.netlify.app", // Legacy
  "https://alina-beta.netlify.app", // Legacy
  "https://alina-test.netlify.app", // Legacy
  "https://meraki-auto.netlify.app", // Meraki Auto production
  process.env.FRONTEND_URL,            // Override via env if needed
  "http://localhost:3000",
  "http://localhost:5000",
  "http://localhost:8080",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:8080",
].filter(Boolean); // Remove undefined if FRONTEND_URL is not set

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

// ===============================
// CRITICAL: RAW BODY FOR PAYSTACK WEBHOOK
// Must come BEFORE bodyParser.json()
// ===============================
app.use("/api/webhooks/paystack", express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ===============================
// REGULAR BODY PARSERS
// ===============================
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "../frontend")));

// ===========================
// 3. ROUTES
// ===========================
app.use("/api/calendar", calendarRoutes);
app.use("/vehicles", unitsRouter);
app.use("/api/vehicles", unitsRouter);
app.use("/api/rentals", rentalRoutes);
app.use("/api/book", bookingRoutes);
app.use("/api/pending-users", pendingUserRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments/mpesa", mpesaRoutes);
//app.use("/api/test-at", testATRoutes);
app.use("/api/payments/paystack", paystackRoutes); // Paystack payment initialization
// ✅ WEBHOOKS - Contains M-Pesa, Visa, and Paystack webhooks
app.use("/api/webhooks", webhookRoutes);
// Access & security routes for access codes removed
app.use("/api/reviews", reviewRoutes);

// ✅ Ensure uploads directory exists
const uploadPath = path.join(__dirname, "uploads/kyc");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log("📁 Created upload directory:", uploadPath);
}

// ✅ Serve uploaded KYC files
app.use("/uploads/kyc", express.static(uploadPath));
// ✅ Serve rental images (for units)
const imgPath = path.join(__dirname, "public/img");
app.use("/img", express.static(imgPath));
console.log("🖼️ Serving images from:", imgPath);

// ===========================
// 3B. OTHER ROUTES
// ===========================
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminKycRoutes);
app.use("/api/reserve", reservationRoutes);
// app.use("/api/payments", paymentRoutes); // ❌ REMOVED - webhooks now in webhookRoutes
app.use("/api/availability", availabilityRoutes);
app.use("/api/kyc/didit", diditRoutes);

// Test route
app.get("/api/test", (req, res) => {
  res.send("✅ API is working!");
});

// ===========================
// 3C. DARAJA (M-PESA) TEST ENDPOINTS
// ===========================
app.get("/api/mpesa/token", async (req, res) => {
  try {
    const auth = Buffer.from(
      `${process.env.DARAJA_CONSUMER_KEY}:${process.env.DARAJA_CONSUMER_SECRET}`
    ).toString("base64");

    const response = await axios.get(
      `${process.env.DARAJA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    res.json({ access_token: response.data.access_token });
  } catch (err) {
    console.error("Token Error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

app.get(/\.html$/, (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", req.path));
});

// ===========================
// 4. DATABASE CONNECTION + SERVER START
// ===========================
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/meraki_auto")
  .then(() => {
    console.log("✅ MongoDB connected");

    // Start blockchain listener AFTER DB is connected
    console.log("🔗 Starting blockchain event listener...");
    startBlockchainListener();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📍 Webhooks available at:`);
      console.log(`   - POST /api/webhooks/mpesa`);
      console.log(`   - POST /api/webhooks/visa`);
      console.log(`   - POST /api/webhooks/paystack`);
    });
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));
