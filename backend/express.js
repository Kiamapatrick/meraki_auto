import express from "express";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Root route
app.get("/", (req, res) => res.send("Daraja API ready 🚀"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
