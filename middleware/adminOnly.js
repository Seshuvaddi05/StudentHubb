module.exports = function adminOnly(req, res, next) {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: "Admin access only" });
    }

    next();
  } catch (err) {
    console.error("[ADMIN ONLY ERROR]", err);
    res.status(500).json({ error: "Admin check failed" });
  }
};
