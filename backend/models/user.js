// backend/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["renter", "owner", "admin"],
      default: "renter"
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    kyc: {
      status: {
        type: String,
        enum: [
          "pending",
          "in_progress",
          "submitted",
          "verified",
          "approved",
          "rejected",
          "resubmission_required",
        ],
        default: "pending",
      },
      veriffSessionId: {
        type: String,
        default: null,
      },
      veriffCode: {
        type: Number,
        default: null,
      },
      uploadedAt: {
        type: Date,
        default: null,
      },
      reviewedAt: {
        type: Date,
        default: null,
      },
      // Legacy fields (keeping for backward compatibility)
      documentType: {
        type: String,
        default: null,
      },
      selfieUrl: {
        type: String,
        default: null,
      },
      documentUrl: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

export default User;