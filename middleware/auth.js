// middleware/auth.js
// Shared authentication middleware for protected routes

const jwt = require("jsonwebtoken");

// MUST match the same secret used in server.js
const JWT_SECRET = process.env.JWT_SECRET || "changeme_jwt_secret";

module.exports = function auth(req, res, next) {
  try {
    let token = null;

    // 1️⃣ Primary: Cookie-based auth (your website flow)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // 2️⃣ Fallback: Authorization header (Postman / API testing)
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        token = parts[1];
      }
    }

    // ❌ No token → not authenticated
    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Not authenticated",
      });
    }

    // 🔐 Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // ✅ Attach user to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username
    };

    next();
  } catch (err) {
    console.error("[AUTH] Invalid or expired token:", err.message);
    return res.status(401).json({
      ok: false,
      message: "Not authenticated",
    });
  }
};
