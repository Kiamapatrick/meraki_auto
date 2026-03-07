import express from "express";
import Vehicle from "../models/Vehicle.js";

const router = express.Router();

/**
 * GET /api/rentals
 * Curated vehicle rental listings for map & UI. Only returns vehicles with location data.
 * Query: ?city=Nairobi  ?area=Karen  (dynamic; any present filter is applied)
 * Response: title, city, area, country, latitude, longitude, price, mainImage, isComingSoon, category
 * Does not expose private fields (ownerId, deposit, description, etc.).
 */
router.get("/", async (req, res) => {
  try {
    const query = {};

    // Dynamic filters from query string
    if (req.query.city != null && String(req.query.city).trim() !== "") {
      query.city = new RegExp("^" + String(req.query.city).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
    }
    if (req.query.area != null && String(req.query.area).trim() !== "") {
      query.area = new RegExp("^" + String(req.query.area).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
    }

    const vehicles = await Vehicle.find(query)
      .select("name city area country latitude longitude dailyPrice image isComingSoon category _id")
      .lean();

    const rentals = vehicles.map((v) => ({
      id: v._id,
      title: v.name,
      city: v.city ?? null,
      area: v.area ?? null,
      country: v.country ?? "Kenya",
      latitude: v.latitude,
      longitude: v.longitude,
      price: v.dailyPrice,
      mainImage: v.image ?? null,
      isComingSoon: Boolean(v.isComingSoon),
      category: v.category ?? "everyday",
    }));

    res.json(rentals);
  } catch (err) {
    console.error("Error fetching vehicle rentals:", err);
    res.status(500).json({ error: "Failed to fetch vehicle rentals" });
  }
});

/**
 * GET /api/rentals/:id
 * Single vehicle rental by ID. Returns true latitude and longitude (no modification).
 */
router.get("/:id", async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .select("name city area country latitude longitude dailyPrice image isComingSoon category _id")
      .lean();
    if (!vehicle) return res.status(404).json({ error: "Vehicle rental not found" });
    res.json({
      id: vehicle._id,
      title: vehicle.name,
      city: vehicle.city ?? null,
      area: vehicle.area ?? null,
      country: vehicle.country ?? "Kenya",
      latitude: vehicle.latitude,
      longitude: vehicle.longitude,
      price: vehicle.dailyPrice,
      mainImage: vehicle.image ?? null,
      isComingSoon: Boolean(vehicle.isComingSoon),
      category: vehicle.category ?? "everyday",
    });
  } catch (err) {
    console.error("Error fetching vehicle rental:", err);
    res.status(500).json({ error: "Failed to fetch vehicle rental" });
  }
});

export default router;
