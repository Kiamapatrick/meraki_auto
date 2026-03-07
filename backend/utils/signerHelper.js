import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const domain = {
  name: "RentalC906VibesV10",
  version: "1",
  chainId: 80002, // change for your network
  verifyingContract: process.env.CONTRACT_ADDRESS,
};

const types = {
  Reservation: [
    { name: "unitId", type: "uint256" },
    { name: "renter", type: "address" },
    { name: "startDay", type: "uint256" },
    { name: "nights", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "expiry", type: "uint256" },
  ],
};

const signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY);

export async function signReservation(payload) {
  const signature = await signer.signTypedData(domain, types, payload);
  return { signature, signer: signer.address };
}
