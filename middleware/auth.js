// middleware/auth.js
// Shared auth middleware for routes (userRewards, adminRewards, etc.)

const jwt = require("jsonwebtoken");

// Same secret as in server.js
const JWT_SECRET = process.env.JWT_SECRET || "changeme_jwt_secret";

function requireAuth(req, res, next) {
  try {
    // 1) Try cookie (main flow from your site)
    let token = req.cookies && req.cookies.token;

    // 2) Fallback to Authorization: Bearer <token> (useful for Postman)
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({ ok: false, message: "Not authenticated" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request so routes can use it
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };

    return next();
  } catch (err) {
    console.error("[auth middleware] error verifying token:", err.message);
    return res.status(401).json({ ok: false, message: "Not authenticated" });
  }
}

module.exports = requireAuth;
