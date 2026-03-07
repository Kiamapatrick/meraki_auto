// listener/bookingListener.js
import { ethers } from "ethers";
import Booking from "../models/Booking.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const abiPath = path.join(__dirname, "../config/contractABI.json");
const CONTRACT_ABI = JSON.parse(fs.readFileSync(abiPath, "utf8"));


dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, provider);

export const startBookingListener = () => {
  console.log("📡 Booking event listener started...");

  // 1️⃣ On BookingConfirmed (ETH bookings)
  contract.on("BookingConfirmed", async (tenant, bookingId, startDate, endDate, method) => {
    console.log(`✅ New booking confirmed [#${bookingId}]`);
    await Booking.findOneAndUpdate(
      { bookingId: Number(bookingId) },
      {
        tenant,
        startDate: Number(startDate),
        endDate: Number(endDate),
        paymentMethod: method,
        active: true,
      },
      { upsert: true }
    );
  });

  // 2️⃣ On OffchainBookingRecorded (M-Pesa / Visa)
  contract.on("OffchainBookingRecorded", async (tenant, bookingId, startDate, endDate, amount, method) => {
    console.log(`✅ Offchain booking recorded [#${bookingId}]`);
    await Booking.findOneAndUpdate(
      { bookingId: Number(bookingId) },
      {
        tenant,
        startDate: Number(startDate),
        endDate: Number(endDate),
        paymentMethod: method,
        deposit: amount.toString(),
        active: true,
      },
      { upsert: true }
    );
  });

  // 3️⃣ On BookingCancelled
  contract.on("BookingCancelled", async (tenant, bookingId) => {
    console.log(`⚠️ Booking cancelled [#${bookingId}]`);
    await Booking.findOneAndUpdate(
      { bookingId: Number(bookingId) },
      { active: false }
    );
  });
};
