import jwt from "jsonwebtoken";
import User from "../models/user.js";

// ✅ Both exports for backward compatibility
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ message: "Unauthorized" });

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    console.error("Token verification error:", err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// ✅ Alias for routes using different naming
export const authMiddleware = verifyToken;

// ✅ Admin check
export const verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ message: "Admin access required" });
  next();
};
