const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";


// ======================================================
// ✅ Generate token WITH username
// ======================================================
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      username: user.name,   // ⭐ CRITICAL FIX
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};


// ======================================================
// ✅ REGISTER
// ======================================================
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already registered" });

    const user = await User.create({ name, email, password });

    const token = generateToken(user);

    // ⭐ store token in cookie
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax"
    });

    res.status(201).json({
      ok: true,
      user: {
        id: user._id,
        username: user.name,
        email: user.email
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// ======================================================
// ✅ LOGIN
// ======================================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await user.matchPassword(password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = generateToken(user);

    // ⭐ store token in cookie
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax"
    });

    res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.name,
        email: user.email
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
