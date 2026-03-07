// seeds/VehicleSeed.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Vehicle from "../models/Vehicle.js";
import User from "../models/User.js";

dotenv.config();

const seedVehicles = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to database...");

    // Ensure test owner exists
    let owner = await User.findOne({ email: "testowner@meraki.com" });

    if (!owner) {
      owner = await User.create({
        name: "Test Vehicle Owner",
        email: "testowner@meraki.com",
        password: "Test123456",
        role: "owner",
        isVerified: true,
      });

      console.log("Created test owner");
    }

    // 🚨 Clear entire vehicles collection
    await Vehicle.deleteMany({});
    console.log("Old vehicles deleted...");

    const vehicles = [

      // ================= PREMIUM =================
      {
        name: "Mercedes-Benz S-Class",
        description: "Executive luxury sedan with refined comfort.",
        image: "img/premium1.jpg",
        dailyPrice: 25000,
        deposit: 60000,
        location: "Westlands, Nairobi",
        city: "Nairobi",
        area: "Westlands",
        latitude: -1.2685,
        longitude: 36.8110,
        category: "premium",
        features: ["Leather Seats", "Sunroof", "Premium Sound"],
        transmission: "Automatic",
        fuelType: "Petrol",
        status: "approved",
      },
      {
        name: "Range Rover Sport",
        description: "Luxury SUV built for presence and comfort.",
        image: "img/premium2.jpg",
        dailyPrice: 28000,
        deposit: 70000,
        location: "Karen, Nairobi",
        city: "Nairobi",
        area: "Karen",
        latitude: -1.3200,
        longitude: 36.7200,
        category: "premium",
        features: ["4x4", "Panoramic Roof"],
        transmission: "Automatic",
        fuelType: "Diesel",
        status: "approved",
      },

      // ================= EVERYDAY =================
      {
        name: "Toyota Corolla 2019",
        description: "Reliable and fuel efficient daily driver.",
        image: "img/everyday1.jpg",
        dailyPrice: 4500,
        deposit: 15000,
        location: "Kilimani, Nairobi",
        city: "Nairobi",
        area: "Kilimani",
        latitude: -1.2926,
        longitude: 36.7846,
        category: "everyday",
        features: ["AC", "Bluetooth"],
        transmission: "Automatic",
        fuelType: "Petrol",
        status: "approved",
      },
      {
        name: "Mazda Demio",
        description: "Compact and perfect for city mobility.",
        image: "img/everyday2.jpg",
        dailyPrice: 4000,
        deposit: 12000,
        location: "Ngong Road, Nairobi",
        city: "Nairobi",
        area: "Ngong Road",
        latitude: -1.3000,
        longitude: 36.7800,
        category: "everyday",
        features: ["AC"],
        transmission: "Automatic",
        fuelType: "Petrol",
        status: "approved",
      },

      // ================= ENTHUSIAST =================
      {
        name: "Subaru WRX STI",
        description: "Performance-focused turbocharged sedan.",
        image: "img/enthusiast1.jpg",
        dailyPrice: 15000,
        deposit: 40000,
        location: "Runda, Nairobi",
        city: "Nairobi",
        area: "Runda",
        latitude: -1.2100,
        longitude: 36.7900,
        category: "enthusiast",
        features: ["Turbo", "Sport Mode"],
        transmission: "Manual",
        fuelType: "Petrol",
        status: "approved",
      },
      {
        name: "Ford Mustang GT",
        description: "Iconic American muscle experience.",
        image: "img/enthusiast2.jpg",
        dailyPrice: 18000,
        deposit: 50000,
        location: "Lavington, Nairobi",
        city: "Nairobi",
        area: "Lavington",
        latitude: -1.2833,
        longitude: 36.7500,
        category: "enthusiast",
        features: ["V8 Engine", "Sport Exhaust"],
        transmission: "Automatic",
        fuelType: "Petrol",
        status: "approved",
      },

      // ================= UTILITY =================
      {
        name: "Toyota Hilux",
        description: "Rugged pickup for work and adventure.",
        image: "img/utility1.jpg",
        dailyPrice: 9000,
        deposit: 25000,
        location: "Industrial Area, Nairobi",
        city: "Nairobi",
        area: "Industrial Area",
        latitude: -1.3100,
        longitude: 36.8500,
        category: "utility",
        features: ["4x4", "Large Cargo Bed"],
        transmission: "Manual",
        fuelType: "Diesel",
        status: "approved",
      },
      {
        name: "Mitsubishi Pajero",
        description: "Adventure-ready SUV.",
        image: "img/utility2.jpg",
        dailyPrice: 11000,
        deposit: 30000,
        location: "Upper Hill, Nairobi",
        city: "Nairobi",
        area: "Upper Hill",
        latitude: -1.3000,
        longitude: 36.8100,
        category: "utility",
        features: ["4WD", "Roof Rack"],
        transmission: "Automatic",
        fuelType: "Diesel",
        status: "approved",
      },

      // ================= MOTORBIKES =================
      {
        name: "Yamaha R6",
        description: "Sport bike built for thrill.",
        image: "img/motorbike1.jpg",
        dailyPrice: 6000,
        deposit: 15000,
        location: "CBD, Nairobi",
        city: "Nairobi",
        area: "CBD",
        latitude: -1.286389,
        longitude: 36.817223,
        category: "motorbike",
        features: ["Sport Mode"],
        transmission: "Manual",
        fuelType: "Petrol",
        status: "approved",
      },
      {
        name: "Honda CB500",
        description: "Balanced performance and comfort.",
        image: "img/motorbike2.jpg",
        dailyPrice: 5000,
        deposit: 12000,
        location: "Parklands, Nairobi",
        city: "Nairobi",
        area: "Parklands",
        latitude: -1.2600,
        longitude: 36.8200,
        category: "motorbike",
        features: ["ABS"],
        transmission: "Manual",
        fuelType: "Petrol",
        status: "approved",
      },

      // ================= MATATU =================
      {
        name: "Nissan Matatu 14-Seater",
        description: "Ideal for local group transport.",
        image: "img/matatu1.jpg",
        dailyPrice: 12000,
        deposit: 30000,
        location: "Eastleigh, Nairobi",
        city: "Nairobi",
        area: "Eastleigh",
        latitude: -1.2700,
        longitude: 36.8500,
        category: "public",
        features: ["14 Seater"],
        transmission: "Manual",
        fuelType: "Diesel",
        status: "approved",
      },
      {
        name: "Toyota Hiace Matatu",
        description: "Reliable and spacious matatu.",
        image: "img/matatu2.jpg",
        dailyPrice: 13000,
        deposit: 32000,
        location: "South B, Nairobi",
        city: "Nairobi",
        area: "South B",
        latitude: -1.3200,
        longitude: 36.8400,
        category: "public",
        features: ["15 Seater"],
        transmission: "Manual",
        fuelType: "Diesel",
        status: "approved",
      },

      // ================= BUS =================
      {
        name: "Isuzu 33-Seater Bus",
        description: "Comfortable group transport solution.",
        image: "img/bus1.jpg",
        dailyPrice: 20000,
        deposit: 50000,
        location: "Embakasi, Nairobi",
        city: "Nairobi",
        area: "Embakasi",
        latitude: -1.3200,
        longitude: 36.9000,
        category: "public",
        features: ["33 Seater", "AC"],
        transmission: "Manual",
        fuelType: "Diesel",
        status: "approved",
      },
      {
        name: "Scania Luxury Bus",
        description: "Premium large capacity transport.",
        image: "img/bus2.jpg",
        dailyPrice: 30000,
        deposit: 70000,
        location: "Thika Road, Nairobi",
        city: "Nairobi",
        area: "Thika Road",
        latitude: -1.2400,
        longitude: 36.8800,
        category: "public",
        features: ["Luxury Seats", "AC"],
        transmission: "Automatic",
        fuelType: "Diesel",
        status: "approved",
      },
    ];

    const vehiclesWithOwner = vehicles.map(vehicle => ({
      ...vehicle,
      ownerId: owner._id,
    }));

    await Vehicle.insertMany(vehiclesWithOwner);

    console.log("🔥 Database reset and reseeded successfully!");
    process.exit(0);

  } catch (error) {
    console.error("Seed error:", error);
    process.exit(1);
  }
};

seedVehicles();