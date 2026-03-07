import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Booking from "../models/Booking.js";

// Recreate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load ABI
const abiPath = path.join(__dirname, "../abi/RentalC906VibesV10.json");
const abiFile = JSON.parse(fs.readFileSync(abiPath, "utf-8"));
const abi = abiFile.abi;

// ===========================
// CONFIGURATION
// ===========================
const CONTRACT_ADDRESS = "0x8C76Ab368431464c697A0bD4a7E97b0017A0c6B4";
const RPC_HTTP = process.env.RPC_URL || "https://rpc-amoy.polygon.technology";
const RPC_WSS = process.env.WS_URL || "wss://rpc-amoy.polygon.technology";
const PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;

// ===========================
// STATE
// ===========================
let provider;
let wallet;
let contract;
let reconnectTimer = null;
let healthCheckTimer = null;
let isInitialized = false;

// ===========================
// INITIALIZATION FUNCTION
// ===========================
function initProvider(useWebSocket = true) {
  try {
    if (isInitialized) {
      console.log("⚠️ Provider already initialized, skipping...");
      return;
    }

    if (useWebSocket) {
      console.log("🔌 Connecting via WebSocketProvider...");
      provider = new ethers.WebSocketProvider(RPC_WSS);
    } else {
      console.log("🌐 Falling back to JsonRpcProvider (polling)...");
      provider = new ethers.JsonRpcProvider(RPC_HTTP);
    }

    wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

    setupListeners();
    isInitialized = true;
    console.log("✅ Blockchain listener initialized successfully");
  } catch (err) {
    console.error("❌ Provider init error:", err);
    isInitialized = false;
  }
}

// ===========================
// EVENT HANDLERS
// ===========================

/**
 * Handle PaymentReceived event
 * Event signature: PaymentReceived(bytes32 indexed backendBookingId, address indexed renter, uint256 amount, uint256 timestamp)
 */
async function handlePaymentReceived(
  backendBookingId,
  renter,
  amount,
  timestamp,
  event
) {
  try {
    console.log("💰 PaymentReceived event:", { 
      backendBookingId: backendBookingId.toString(), 
      renter, 
      amount: ethers.formatEther(amount),
      txHash: event.log.transactionHash
    });

    // Check if already synced
    const exists = await Booking.findOne({ 
      blockchainTx: event.log.transactionHash 
    });
    
    if (exists) {
      console.log("ℹ️ Payment already synced, skipping...");
      return;
    }

    // Create booking record
    const bookingData = {
      blockchainBookingId: backendBookingId, // bytes32 as string
      walletAddress: renter.toLowerCase(),
      totalPrice: Number(ethers.formatEther(amount)),
      paymentMethod: "crypto",
      paymentStatus: "confirmed",
      blockchainTx: event.log.transactionHash,
      // You'll need to populate these from your frontend/backend:
      // unitId, userId, startDate, endDate, nights
    };

    await Booking.create(bookingData);

    console.log("✅ Payment synced to database:", event.log.transactionHash);
  } catch (err) {
    console.error("❌ PaymentReceived handler error:", err);
    console.error("Error details:", err.message);
  }
}

/**
 * Handle PaymentRefunded event
 * Event signature: PaymentRefunded(bytes32 indexed backendBookingId, address indexed renter, uint256 amountRefunded, uint256 remainingBalance, uint256 timestamp)
 */
async function handlePaymentRefunded(
  backendBookingId,
  renter,
  amountRefunded,
  remainingBalance,
  timestamp,
  event
) {
  try {
    console.log("💸 PaymentRefunded event:", { 
      backendBookingId: backendBookingId.toString(), 
      renter,
      amountRefunded: ethers.formatEther(amountRefunded),
      remainingBalance: ethers.formatEther(remainingBalance)
    });

    const booking = await Booking.findOneAndUpdate(
      { blockchainBookingId: backendBookingId },
      { 
        paymentStatus: "refunded",
        refundedAt: new Date(),
        refundTxHash: event.log.transactionHash
      },
      { new: true }
    );

    if (booking) {
      console.log("✅ Refund recorded in database:", booking._id);
    } else {
      console.log("⚠️ No booking found for refund event");
    }
  } catch (err) {
    console.error("❌ PaymentRefunded handler error:", err);
  }
}

/**
 * Handle MaticPerUSDUpdated event (optional - for tracking rate changes)
 * Event signature: MaticPerUSDUpdated(uint256 oldRate, uint256 newRate)
 */
async function handleMaticPerUSDUpdated(oldRate, newRate, event) {
  try {
    console.log("📊 MaticPerUSD updated:", {
      oldRate: ethers.formatEther(oldRate),
      newRate: ethers.formatEther(newRate)
    });
    // You could store this in a separate collection if needed
  } catch (err) {
    console.error("❌ MaticPerUSDUpdated handler error:", err);
  }
}

// ===========================
// SETUP LISTENERS
// ===========================
function setupListeners() {
  contract.removeAllListeners();

  // Subscribe to actual contract events
  contract.on("PaymentReceived", handlePaymentReceived);
  contract.on("PaymentRefunded", handlePaymentRefunded);
  contract.on("MaticPerUSDUpdated", handleMaticPerUSDUpdated);

  console.log("🎧 Listening for contract events:");
  console.log("   - PaymentReceived");
  console.log("   - PaymentRefunded");
  console.log("   - MaticPerUSDUpdated");

  startHealthCheck();
}

/**
 * Periodically checks if provider is still connected.
 * If disconnected, reinitializes it automatically.
 */
function startHealthCheck() {
  if (healthCheckTimer) clearInterval(healthCheckTimer);

  healthCheckTimer = setInterval(async () => {
    try {
      await provider.getBlockNumber(); // ping the chain
    } catch (err) {
      console.error("⚠️ Provider disconnected — reconnecting...");
      clearInterval(healthCheckTimer);
      isInitialized = false;
      reconnect(true);
    }
  }, 15000); // check every 15s
}

function reconnect(useWebSocket) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => initProvider(useWebSocket), 5000);
}

export function startBlockchainListener() {
  if (isInitialized) {
    console.log("⚠️ Blockchain listener already running");
    return;
  }
  console.log("🔗 Starting blockchain event listener...");
  initProvider(true);
}

