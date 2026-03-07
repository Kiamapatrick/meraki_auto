// backend/controllers/authController.js
import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { Resend } from "resend";
import User from "../models/user.js";
import multer from "multer";
import path from "path";
import PendingUser from "../models/PendingUser.js";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatesDir = path.join(__dirname, "..", "templates");

const loadTemplate = (filename, replacements) => {
  let html = fs.readFileSync(path.join(templatesDir, filename), "utf-8");
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
};

// ================================
// RESEND CONFIGURATION
// ================================
const resend = new Resend(process.env.RESEND_API_KEY);

// ================================
// VERIFF CONFIGURATION
// ================================
const VERIFF_API_KEY = process.env.VERIFF_API_KEY; // Your Veriff API key
const VERIFF_API_SECRET = process.env.VERIFF_API_SECRET; // Your Veriff API secret
const VERIFF_BASE_URL = process.env.VERIFF_BASE_URL || "https://stationapi.veriff.com"; // Use sandbox for testing

// ================================
// 1. Multer storage configuration
// ================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/kyc/");
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    // FIX: Use req.userId instead of req.params.userId
    const userId = req.userId || 'unknown'; // Fallback for safety
    cb(null, `${userId}-${file.fieldname}-${Date.now()}${ext}`);
  },
});

export const upload = multer({ storage });

// ================================
// 2. Upload controller (Legacy - keeping for backward compatibility)
// ================================
export const uploadKyc = async (req, res) => {
  try {
    const { documentType } = req.body;
    const selfieFile = req.files["selfie"]?.[0];
    const documentFile = req.files["document"]?.[0];

    if (!selfieFile || !documentFile) {
      return res.status(400).json({ error: "Both selfie and document are required." });
    }

    const selfieUrl = `/uploads/kyc/${selfieFile.filename}`;
    const documentUrl = `/uploads/kyc/${documentFile.filename}`;

    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      {
        "kyc.documentType": documentType,
        "kyc.selfieUrl": selfieUrl,
        "kyc.documentUrl": documentUrl,
        "kyc.status": "submitted",
        "kyc.uploadedAt": new Date(),
      },
      { new: true }
    );

    res.json({
      message: "KYC uploaded successfully",
      kyc: updatedUser.kyc,
    });
  } catch (err) {
    console.error("KYC upload error:", err);
    res.status(500).json({ error: "Failed to upload KYC files" });
  }
};

// -----------------------------
// Signup - create pending user and send email verification
// -----------------------------
export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existing = await PendingUser.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered or pending verification." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const emailToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

    const pendingUser = new PendingUser({
      name,
      email,
      passwordHash,
      emailToken,
      tokenExpiresAt,
    });

    await pendingUser.save();

    const verifyUrl = `${process.env.BACKEND_URL}/api/auth/verifyEmail?token=${emailToken}`;

    const html = loadTemplate("verify-email.html", {
      USER_NAME: name,
      VERIFY_URL: verifyUrl,
    });

    await resend.emails.send({
      from: "Meraki Auto <admin@noventraadvisoryglobal.com>",
      to: email,
      subject: "Verify your Meraki Auto account",
      html,
    });

    console.log(`📧 Verify email using: ${verifyUrl}`);

    res.status(201).json({
      message: "Registration started. Please check your email to verify your account.",
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Signup failed", error: error.message });
  }
};

// -----------------------------
// Verify email - match PendingUser by emailToken
// -----------------------------
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send("Missing token");

    const pending = await PendingUser.findOne({
      emailToken: token,
      tokenExpiresAt: { $gt: new Date() },
    });

    if (!pending) return res.status(404).send("No pending signup found or token expired");

    const existingUser = await User.findOne({ email: pending.email });
    if (existingUser) {
      await PendingUser.deleteOne({ _id: pending._id });
      return res.status(400).send("Email already verified or registered.");
    }

    const newUser = await User.create({
      name: pending.name,
      email: pending.email,
      password: pending.passwordHash,
      emailVerified: true,
      kyc: { status: "pending" },
    });

    await PendingUser.deleteOne({ _id: pending._id });

    const authToken = jwt.sign(
      { id: newUser._id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Redirect to KYC start page with auth token
    const kycUrl = `${process.env.FRONTEND_URL.replace(/\/$/, "")}/kyc-start.html?token=${authToken}&uid=${newUser._id}`;
    res.redirect(kycUrl);

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).send("This email is already registered.");
    }

    console.error("Email verify error:", err);
    res.status(500).send("Verification failed. Please try again later.");
  }
};

// -----------------------------
// Login - allow only if emailVerified === true
// -----------------------------
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Missing email or password" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.emailVerified)
      return res.status(400).json({ message: "Please verify your email first" });

    const hash = user.passwordHash || user.password;
    if (!hash) {
      return res.status(500).json({ message: "Password not set for this account. Please reset your password." });
    }

    const isMatch = await bcrypt.compare(password, hash);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      message: "Login successful",
      token,
      name: user.name,
      role: user.role,
      kycStatus: user.kyc?.status || "pending",
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
};

// ================================
// JWT verification middleware
// ================================
export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // Attach verified user ID to request
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ================================
// Authenticated user profile (/api/auth/me)
// ================================
export const getMe = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await User.findById(req.userId).select(
      "name email role kyc twoFactorEnabled createdAt"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      kycStatus: user.kyc?.status || "pending",
      twoFactorEnabled: !!user.twoFactorEnabled,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error("getMe error:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
};

// ================================
// Profile (GET/PUT /api/auth/profile)
// ================================
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("name email kyc role createdAt twoFactorEnabled");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        kycStatus: user.kyc?.status || "pending",
        twoFactorEnabled: !!user.twoFactorEnabled,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error("getProfile error:", err);
    return res.status(500).json({ error: "Failed to load profile" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (name) user.name = name;
    if (email && email !== user.email) {
      const existing = await User.findOne({ email, _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({ error: "Email already in use" });
      }
      user.email = email.toLowerCase();
    }

    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      token,
    });
  } catch (err) {
    console.error("updateProfile error:", err);
    return res.status(500).json({ error: "Failed to update profile" });
  }
};

// ================================
// Change Password
// ================================
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return res.status(400).json({ error: "New password must be different from current password" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({ error: "Failed to change password" });
  }
};

// ================================
// Forgot Password — send reset email
// ================================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Always return a generic message to prevent email enumeration
    const genericMsg = "If an account with that email exists, a password reset link has been sent.";

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.json({ message: genericMsg });
    }

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Store the hashed version in DB (so even a DB leak can't be used)
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Build the reset URL (raw token goes in the email)
    const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
    const resetUrl = `${frontendUrl}/reset-password.html?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    const html = loadTemplate("reset-password.html", {
      USER_NAME: user.name,
      RESET_URL: resetUrl,
    });

    await resend.emails.send({
      from: "Meraki Auto <admin@noventraadvisoryglobal.com>",
      to: user.email,
      subject: "Reset your Meraki Auto password",
      html,
    });

    console.log(`📧 Password reset email sent to ${user.email}`);
    console.log(`🔗 Reset URL: ${resetUrl}`);

    return res.json({ message: genericMsg });
  } catch (err) {
    console.error("forgotPassword error:", err);
    return res.status(500).json({ error: "Failed to process password reset request" });
  }
};

// ================================
// Reset Password — validate token & update password
// ================================
export const resetPassword = async (req, res) => {
  try {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return res.status(400).json({ error: "Email, token, and new password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Hash the incoming token to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      email: email.toLowerCase(),
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token. Please request a new one." });
    }

    // Update password
    user.password = await bcrypt.hash(password, 10);

    // Invalidate the token
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    console.log(`✅ Password reset successful for ${user.email}`);

    return res.json({ message: "Password reset successful. You can now sign in with your new password." });
  } catch (err) {
    console.error("resetPassword error:", err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
};

// ================================
// Two-Factor Authentication (TOTP)
// ================================
export const enableTwoFactor = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const secret = authenticator.generateSecret();
    const label = encodeURIComponent(user.email || "user");
    const issuer = encodeURIComponent("Meraki Auto");
    const otpauth = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&digits=6`;

    user.twoFactorSecret = secret;
    user.twoFactorEnabled = false;
    await user.save();

    const qrCode = await QRCode.toDataURL(otpauth);

    return res.json({
      qrCode,
      secret,
    });
  } catch (err) {
    console.error("enableTwoFactor error:", err);
    return res.status(500).json({ error: "Failed to start 2FA setup" });
  }
};

export const verifyTwoFactor = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    const user = await User.findById(req.userId);
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: "2FA is not in setup state" });
    }

    const isValid = authenticator.verify({ token, secret: user.twoFactorSecret });
    if (!isValid) {
      return res.status(400).json({ error: "Invalid 2FA code" });
    }

    user.twoFactorEnabled = true;
    await user.save();

    return res.json({ message: "Two-factor authentication enabled" });
  } catch (err) {
    console.error("verifyTwoFactor error:", err);
    return res.status(500).json({ error: "Failed to verify 2FA code" });
  }
};

export const disableTwoFactor = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Password is incorrect" });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await user.save();

    return res.json({ message: "Two-factor authentication disabled" });
  } catch (err) {
    console.error("disableTwoFactor error:", err);
    return res.status(500).json({ error: "Failed to disable 2FA" });
  }
};

// ================================
// Start Veriff KYC Session
// ================================
export const startVeriffKyc = async (req, res) => {
  try {
    // FIX: Get userId from verified JWT, not request body
    const userId = req.userId; // Set by verifyToken middleware

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // ... rest of function stays the same

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if already verified
    if (user.kyc?.status === "approved") {
      return res.status(400).json({ error: "KYC already verified" });
    }

    // Prepare Veriff session creation payload
    const payload = {
      verification: {
        callback: `${process.env.BACKEND_URL}/api/auth/webhook/veriff`,
        person: {
          firstName: user.name.split(" ")[0] || user.name,
          lastName: user.name.split(" ").slice(1).join(" ") || "",
        },
        vendorData: userId.toString(), // This will be sent back in webhook
      },
    };

    // Generate HMAC signature for Veriff API
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", VERIFF_API_SECRET)
      .update(payloadString)
      .digest("hex")
      .toLowerCase(); // ADD: Ensure lowercase hex

    console.log("🔐 Request payload:", payloadString);
    console.log("🔐 Generated signature:", signature);

    // Call Veriff API to create session
    const response = await axios.post(`${VERIFF_BASE_URL}/v1/sessions`, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-CLIENT": VERIFF_API_KEY,
        "X-HMAC-SIGNATURE": signature,
      },
    });

    const data = response.data;

    // Store session ID in user record
    await User.findByIdAndUpdate(userId, {
      "kyc.veriffSessionId": data.verification.id,
      "kyc.status": "in_progress",
    });

    console.log(`✅ Veriff session created for user ${userId}: ${data.verification.id}`);

    // Return the Veriff URL to frontend
    res.json({
      success: true,
      sessionUrl: data.verification.url,
      sessionId: data.verification.id,
    });

  } catch (err) {
    console.error("❌ Start Veriff KYC error:", err.response?.data || err.message);

    return res.status(400).json({
      error: "Veriff session creation failed",
      veriff: err.response?.data || null,
    });
  }
};

// ================================
// Check KYC Status (for polling)
// ================================
export const checkKycStatus = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).select('kyc');
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      kycStatus: user.kyc?.status || "pending",
      veriffSessionId: user.kyc?.veriffSessionId,
      reviewedAt: user.kyc?.reviewedAt,
    });
  } catch (err) {
    console.error("Check KYC status error:", err);
    res.status(500).json({ error: "Failed to check KYC status" });
  }
};
// ================================
// KYC EMAIL HELPERS
// ================================

export const sendKycApprovedEmail = async (user) => {
  try {
    const html = loadTemplate("kyc-approved.html", {
      USER_NAME: user.name,
      FRONTEND_URL: (process.env.FRONTEND_URL || "").replace(/\/$/, ""),
    });

    await resend.emails.send({
      from: "Meraki Auto <admin@noventraadvisoryglobal.com>",
      to: user.email,
      subject: "Your KYC has been approved",
      html,
    });

    console.log(`📧 KYC approval email sent to ${user.email}`);
  } catch (err) {
    console.error("❌ Failed to send KYC approved email:", err.message);
  }
};

export const sendKycRejectedEmail = async (user) => {
  try {
    const html = loadTemplate("kyc-rejected.html", {
      USER_NAME: user.name,
      FRONTEND_URL: (process.env.FRONTEND_URL || "").replace(/\/$/, ""),
    });

    await resend.emails.send({
      from: "Meraki Auto <admin@noventraadvisoryglobal.com>",
      to: user.email,
      subject: "Your KYC was not approved",
      html,
    });

    console.log(`📧 KYC rejection email sent to ${user.email}`);
  } catch (err) {
    console.error("❌ Failed to send KYC rejected email:", err.message);
  }
};
// ================================
// Veriff Webhook Handler
// ================================
export const veriffWebhook = async (req, res) => {
  try {
    // FIX: Get raw body (captured by express.raw middleware)
    let rawBody;
    let payload;

    if (Buffer.isBuffer(req.body)) {
      // Raw body from express.raw()
      rawBody = req.body.toString('utf8');
      payload = JSON.parse(rawBody);
    } else {
      // Fallback if middleware didn't capture raw body
      console.warn("⚠️ Webhook received parsed body instead of raw - signature verification may fail");
      payload = req.body;
      rawBody = JSON.stringify(payload);
    }

    console.log("📥 Veriff webhook received:", JSON.stringify(payload, null, 2));

    // Verify webhook signature using raw body
    const signature = req.headers["x-hmac-signature"] || req.headers["x-signature"];

    if (signature && VERIFF_API_SECRET) {
      const calculatedSignature = crypto
        .createHmac("sha256", VERIFF_API_SECRET)
        .update(rawBody) // FIX: Use raw body string, not re-stringified object
        .digest("hex")
        .toLowerCase(); // FIX: Ensure lowercase

      console.log("🔐 Received signature:", signature);
      console.log("🔐 Calculated signature:", calculatedSignature);

      if (signature.toLowerCase() !== calculatedSignature) {
        console.error("❌ Invalid Veriff webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }

      console.log("✅ Webhook signature verified");
    } else {
      console.warn("⚠️ No signature verification (missing signature or secret)");
    }

    // Handle different webhook formats
    let sessionId, status, code, userId;

    // Format 1: payload.verification (decision webhooks)
    if (payload.verification) {
      const verification = payload.verification;
      sessionId = verification.id;
      status = verification.status;
      code = verification.code;
      userId = verification.vendorData;
    }
    // Format 2: Top-level fields (event webhooks)
    else if (payload.id) {
      sessionId = payload.id;
      status = payload.status;
      code = payload.code;
      userId = payload.vendorData;
    }
    // Format 3: Unknown format
    else {
      console.error("❌ Unknown webhook format:", payload);
      return res.status(400).json({ error: "Unknown webhook format" });
    }

    if (!userId) {
      console.error("❌ No userId in webhook");
      return res.status(400).json({ error: "Missing user ID" });
    }

    // Map Veriff status to our KYC status
    let kycStatus = "pending";

    if (code === 9001) {
      kycStatus = "approved";
    } else if (code === 9102 || code === 9103) {
      kycStatus = "rejected";
    } else if (code === 9104) {
      kycStatus = "resubmission_required";
    }

    // Update user's KYC status
    // Find user first (so we can compare status)
    const user = await User.findById(userId);

    if (!user) {
      console.error(`❌ User ${userId} not found for webhook update`);
      return res.status(404).json({ error: "User not found" });
    }

    const oldStatus = user.kyc?.status;

    // If status did not change, do nothing (prevents duplicate emails)
    if (oldStatus === kycStatus) {
      console.log(`ℹ️ Status unchanged for user ${userId}, skipping email`);
      return res.status(200).json({ success: true });
    }

    // Update user
    // Ensure kyc object exists
    if (!user.kyc) {
      user.kyc = {};
    }

    user.kyc.status = kycStatus;
    user.kyc.veriffSessionId = sessionId;
    user.kyc.veriffCode = code;
    user.kyc.reviewedAt = new Date();
    await user.save();

    console.log(`✅ Veriff webhook processed: User ${userId} → ${kycStatus} (code: ${code})`);

    // Send email only for final decisions
    if (kycStatus === "approved") {
      await sendKycApprovedEmail(user);
    }

    if (kycStatus === "rejected") {
      await sendKycRejectedEmail(user);
    }

    // Always return success
    return res.status(200).json({ success: true });


  } catch (err) {
    console.error("❌ Veriff webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

// ================================
// Handle GET requests to webhook URL (User redirect)
// ================================
export const veriffWebhookGet = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, "");
  // Redirect works for both Veriff and Didit completion
  return res.redirect(`${frontendUrl}/kyc-callback.html`);
};
