// backend/models/PendingUser.js
import mongoose from "mongoose";

const pendingUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    // Email verification fields
    emailToken: {
      type: String,
      required: true,
      index: true,
    },
    tokenExpiresAt: {
      type: Date,
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifiedAt: { type: Date },

    // Temporary token for continuing registration (optional)
    registrationToken: { type: String },
    registrationTokenExpiresAt: { type: Date },

    // KYC section — only becomes required after email verification
    kyc: {
      idDocumentUrl: { type: String },
      selfieUrl: { type: String },
      status: {
        type: String,
        enum: ["none", "submitted", "approved", "rejected"],
        default: "none",
      },
      submittedAt: { type: Date },
    },
  },
  { timestamps: true }
);

export default mongoose.model("PendingUser", pendingUserSchema);
