// backend/controllers/diditController.js
import axios from "axios";
import crypto from "node:crypto";
import User from "../models/user.js";
import { sendKycApprovedEmail, sendKycRejectedEmail } from "./authController.js";

// ================================
// DIDIT CONFIGURATION
// ================================
const DIDIT_API_KEY = process.env.DIDIT_API_KEY;
const DIDIT_WEBHOOK_SECRET = process.env.DIDIT_WEBHOOK_SECRET;
const DIDIT_BASE_URL = process.env.DIDIT_BASE_URL || "https://verification.didit.me";
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID;

// ================================
// Start Didit KYC Session
// ================================
export const startDiditKyc = async (req, res) => {
  try {
    const userId = req.userId; // From JWT middleware

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already verified
    if (user.kyc?.status === "approved") {
      return res.status(400).json({ error: "KYC already verified" });
    }

    // Check if WORKFLOW_ID is configured
    if (!DIDIT_WORKFLOW_ID) {
      console.error("❌ DIDIT_WORKFLOW_ID not configured in .env");
      return res.status(500).json({
        error: "Didit workflow not configured. Please add DIDIT_WORKFLOW_ID to your .env file"
      });
    }

    // Extract workflow ID from URL if full URL was provided
    let workflowId = DIDIT_WORKFLOW_ID;
    if (workflowId.includes('verify.didit.me/verify/')) {
      workflowId = workflowId.split('/verify/')[1];
      console.log(`🔧 Extracted workflow ID from URL: ${workflowId}`);
    }

    // Prepare Didit session request
    const payload = {
      workflow_id: workflowId,
      vendor_data: userId.toString(),
      callback: `${process.env.BACKEND_URL}/api/kyc/didit/webhook`,
    };

    console.log("🔐 Creating Didit session");
    console.log("📝 Payload:", JSON.stringify(payload, null, 2));
    console.log("🔑 Using API Key:", DIDIT_API_KEY?.substring(0, 10) + "...");

    // Try different API endpoints
    const attempts = [
      {
        name: "POST /v2/session with x-api-key (no trailing slash)",
        config: {
          url: `${DIDIT_BASE_URL}/v2/session`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': DIDIT_API_KEY,
          },
          data: payload,
        }
      },
      {
        name: "POST /v2/session/ with x-api-key",
        config: {
          url: `${DIDIT_BASE_URL}/v2/session/`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': DIDIT_API_KEY,
          },
          data: payload,
        }
      }
    ];

    let lastError;

    for (const attempt of attempts) {
      console.log(`\n🔄 Trying: ${attempt.name}`);
      console.log(`   URL: ${attempt.config.url}`);

      try {
        const response = await axios(attempt.config);
        const data = response.data;

        console.log("✅ SUCCESS! Session created");
        console.log("✅ Response:", JSON.stringify(data, null, 2));

        // Store session ID in user record
        await User.findByIdAndUpdate(userId, {
          "kyc.diditSessionId": data.session_id || data.id,
          "kyc.status": "in_progress",
        });

        console.log(`✅ Didit session created for user ${userId}`);

        // Return the Didit verification URL to frontend
        return res.json({
          success: true,
          sessionUrl: data.url || data.verification_url || data.verificationUrl,
          sessionId: data.session_id || data.id,
        });

      } catch (err) {
        lastError = err;
        console.log(`❌ ${attempt.name} failed:`);
        console.log(`   Status: ${err.response?.status}`);
        console.log(`   Error:`, JSON.stringify(err.response?.data, null, 2));
      }
    }

    // All attempts failed
    console.error("\n❌ All session creation attempts failed");
    console.error("❌ Last error:", lastError.response?.data || lastError.message);

    return res.status(400).json({
      error: "Didit session creation failed",
      details: lastError.response?.data || null,
      hint: "Please verify your DIDIT_API_KEY and DIDIT_WORKFLOW_ID in your Didit dashboard",
    });

  } catch (err) {
    console.error("❌ Start Didit KYC error:", err.response?.data || err.message);

    return res.status(400).json({
      error: "Didit session creation failed",
      details: err.response?.data || null,
    });
  }
};

// ================================
// Didit Webhook Handler
// ================================
export const diditWebhook = async (req, res) => {
  try {
    // Get raw body (captured by express.raw middleware)
    let rawBody;
    let payload;

    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString("utf8");
      payload = JSON.parse(rawBody);
    } else {
      console.warn("⚠️ Webhook received parsed body instead of raw");
      payload = req.body;
      rawBody = JSON.stringify(payload);
    }

    console.log("📥 Didit webhook received:", JSON.stringify(payload, null, 2));

    // Verify webhook signature
    const signature = req.headers["x-didit-signature"] || req.headers["x-signature"];

    if (signature && DIDIT_WEBHOOK_SECRET) {
      const calculatedSignature = crypto
        .createHmac("sha256", DIDIT_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex")
        .toLowerCase();

      console.log("🔐 Received signature:", signature);
      console.log("🔐 Calculated signature:", calculatedSignature);

      if (signature.toLowerCase() !== calculatedSignature) {
        console.error("❌ Invalid Didit webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }

      console.log("✅ Webhook signature verified");
    } else {
      console.warn("⚠️ No signature verification (missing signature or secret)");
    }

    // Extract data from webhook
    const sessionId = payload.session_id || payload.id;
    const status = payload.status;
    const vendorData = payload.vendor_data || payload.vendorData;

    if (!vendorData) {
      console.error("❌ No vendor_data (userId) in webhook");
      return res.status(400).json({ error: "Missing user ID" });
    }

    // ✅ FIX: Map Didit status to our KYC status (case-insensitive)
    let kycStatus = "pending";
    const statusLower = (status || "").toLowerCase();

    console.log(`🔍 Processing status: "${status}" (normalized: "${statusLower}")`);

    if (statusLower === "approved") {
      kycStatus = "approved";
      console.log("✅ Status mapped to: approved");
    } else if (statusLower === "declined" || statusLower === "rejected") {
      kycStatus = "rejected";
      console.log("⛔ Status mapped to: rejected");
    } else if (statusLower === "in progress" || statusLower === "in_progress") {
      kycStatus = "in_progress";
      console.log("🔄 Status mapped to: in_progress");
    } else if (statusLower === "not started" || statusLower === "not_started") {
      kycStatus = "pending";
      console.log("⏳ Status mapped to: pending");
    } else {
      console.warn(`⚠️ Unknown status: "${status}" - defaulting to pending`);
      kycStatus = "pending";
    }

    // Update user's KYC status
    const updatedUser = await User.findByIdAndUpdate(
      vendorData,
      {
        "kyc.status": kycStatus,
        "kyc.diditSessionId": sessionId,
        "kyc.reviewedAt": new Date(),
      },
      { new: true }
    );

    if (!updatedUser) {
      console.error(`❌ User ${vendorData} not found for webhook update`);
      return res.status(404).json({ error: "User not found" });
    }

    console.log(`✅ Didit webhook processed: User ${vendorData} → ${kycStatus}`);

    // Send email notification for final decisions
    if (kycStatus === "approved") {
      await sendKycApprovedEmail(updatedUser);
    } else if (kycStatus === "rejected") {
      await sendKycRejectedEmail(updatedUser);
    }

    // Send success response to Didit
    res.status(200).json({ success: true });

  } catch (err) {
    console.error("❌ Didit webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};
