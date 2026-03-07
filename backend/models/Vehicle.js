import mongoose from "mongoose";

const VehicleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String, trim: true },
    dailyPrice: { type: Number, required: true, min: 0 },
    deposit: { type: Number, required: true, min: 0 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    location: { type: String, trim: true },

    // Location (for map & curated rentals)
    city: { type: String, trim: true },
    area: { type: String, trim: true },
    country: { type: String, default: "Kenya", trim: true },
    latitude: { type: Number },
    longitude: { type: Number },

    // Vehicle-specific fields
category: { 
  type: String, 
  enum: [
    "premium",
    "everyday",
    "enthusiast",
    "utility",
    "motorbike",
    "public",
    
  ],
  default: "everyday",
  trim: true 
},
    features: {
      type: [String],
      default: [],
    },
    transmission: { type: String, trim: true },
    fuelType: { type: String, trim: true },

    // Admin approval flow
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    isComingSoon: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Vehicle", VehicleSchema);
