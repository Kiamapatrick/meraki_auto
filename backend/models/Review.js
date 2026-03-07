import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
    {
        vehicleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vehicle",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        userName: {
            type: String,
            required: true,
            trim: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: String,
            trim: true,
            maxlength: 500,
        },
    },
    { timestamps: true }
);

// One review per user per vehicle
ReviewSchema.index({ vehicleId: 1, userId: 1 }, { unique: true });

export default mongoose.model("Review", ReviewSchema);
