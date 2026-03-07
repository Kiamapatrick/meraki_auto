import express from "express";
import Vehicle from "../models/Vehicle.js";

const router = express.Router();

// GET all vehicles
router.get("/", async (req, res) => {
  try {
    const query = {};
    if (req.query.category != null && String(req.query.category).trim() !== "") {
      query.category = String(req.query.category).trim();
    }

    const vehicles = await Vehicle.find(query);
    res.json(vehicles);
  } catch (err) {
    console.error("Error fetching vehicles:", err);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

// GET single vehicle
router.get("/:id", async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json(vehicle);
  } catch (err) {
    console.error("Error fetching vehicle:", err);
    res.status(500).json({ error: "Failed to fetch vehicle" });
  }
});

// ✅ POST create new vehicle
router.post("/", async (req, res) => {
  try {
    const {
      name,
      description,
      image,
      dailyPrice,
      deposit,
      ownerId,
      location,
      city,
      area,
      country,
      latitude,
      longitude,
      isComingSoon,
      category,
      features,
      transmission,
      fuelType,
    } = req.body;

    if (!name || dailyPrice == null || deposit == null || !ownerId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const parsedFeatures = Array.isArray(features)
      ? features.map(f => f.trim()).filter(Boolean)
      : typeof features === "string"
        ? features.split(",").map(f => f.trim()).filter(Boolean)
        : [];

    const vehicle = new Vehicle({
      name,
      description,
      image,
      dailyPrice,
      deposit,
      ownerId,
      location,
      city: city?.trim() || undefined,
      area: area?.trim() || undefined,
      country: country?.trim() || "Kenya",
      latitude: latitude != null ? Number(latitude) : undefined,
      longitude: longitude != null ? Number(longitude) : undefined,
      isComingSoon: Boolean(isComingSoon),
      category: category || "everyday",
      features: parsedFeatures,
      transmission: transmission?.trim() || undefined,
      fuelType: fuelType?.trim() || undefined,
    });

    await vehicle.save();
    res.status(201).json(vehicle);
  } catch (err) {
    console.error("Error creating vehicle:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ PUT update vehicle
router.put("/:id", async (req, res) => {
  try {
    const updates = { ...req.body };

    if ("features" in updates) {
      updates.features = Array.isArray(updates.features)
        ? updates.features.map(f => f.trim()).filter(Boolean)
        : typeof updates.features === "string"
          ? updates.features.split(",").map(f => f.trim()).filter(Boolean)
          : [];
    }
    if (updates.city !== undefined) updates.city = updates.city?.trim() || null;
    if (updates.area !== undefined) updates.area = updates.area?.trim() || null;
    if (updates.country !== undefined) updates.country = updates.country?.trim() || "Kenya";
    if (updates.latitude !== undefined) updates.latitude = updates.latitude != null ? Number(updates.latitude) : null;
    if (updates.longitude !== undefined) updates.longitude = updates.longitude != null ? Number(updates.longitude) : null;
    if (updates.isComingSoon !== undefined) updates.isComingSoon = Boolean(updates.isComingSoon);

    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    res.json(vehicle);
  } catch (err) {
    console.error("Error updating vehicle:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ DELETE vehicle
router.delete("/:id", async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    res.json({ message: "Vehicle deleted successfully" });
  } catch (err) {
    console.error("Error deleting vehicle:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

export default router;

