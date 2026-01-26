const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

/**
 * ADMIN LOGIN
 * Uses ADMIN_EMAIL + ADMIN_SECRET from .env
 * Uses SAME token structure as normal users
 * (so existing auth + adminOnly middleware works)
 */
router.post("/login", (req, res) => {
  try {
    const { email, secret } = req.body || {};

    // 1️⃣ Validate input
    if (!email || !secret) {
      return res.status(400).json({
        ok: false,
        error: "Email and secret are required",
      });
    }

    // 2️⃣ Validate admin credentials
    if (
      email !== process.env.ADMIN_EMAIL ||
      secret !== process.env.ADMIN_SECRET
    ) {
      return res.status(401).json({
        ok: false,
        error: "Invalid admin credentials",
      });
    }

    // 3️⃣ Create JWT (MATCHES user token structure)
    const token = jwt.sign(
      {
        id: "admin",
        email: process.env.ADMIN_EMAIL,
        name: "Admin",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 4️⃣ Set auth cookie (VERY IMPORTANT FLAGS)
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/", // 🔥 REQUIRED so admin pages can read it
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      ok: true,
      message: "Admin logged in successfully",
    });
  } catch (err) {
    console.error("[ADMIN LOGIN ERROR]", err);
    return res.status(500).json({
      ok: false,
      error: "Server error during admin login",
    });
  }
});

module.exports = router;
