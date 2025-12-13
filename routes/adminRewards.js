// routes/adminRewards.js
// Admin-only actions for reviewing PDFs, approving coins, and handling withdrawals.

const express = require("express");
const PdfSubmission = require("../models/PdfSubmission");
const WithdrawalRequest = require("../models/WithdrawalRequest");
const User = require("../models/User");
const { addNotification } = require("../utils/notifications");

const router = express.Router();

// ------------------------------------------------------------
// ADMIN AUTH (IMPORTANT FIX)
// ------------------------------------------------------------
// You tried importing requireAdmin from auth.js but it doesn't exist.
// This is the correct working admin guard used by server.js login:
//
// To call admin APIs, send header:
//   x-admin-secret: YOUR_ADMIN_SECRET
//
// No crashing, no undefined middleware.
const ADMIN_SECRET = process.env.ADMIN_SECRET || "changeme123";

function requireAdmin(req, res, next) {
  const incoming =
    req.headers["x-admin-secret"] ||
    req.query.adminSecret ||
    req.headers["admin"];

  if (!incoming || incoming !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, message: "Admin access denied." });
  }
  next();
}

// ------------------------------------------------------------
// GET /api/admin/submissions   ?status=pending|approved|rejected
// ------------------------------------------------------------
router.get("/admin/submissions", requireAdmin, async (req, res) => {
  try {
    const { status = "pending" } = req.query;

    const submissions = await PdfSubmission.find(
      status ? { status } : {}
    )
      .populate("userId", "email name")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ ok: true, submissions });
  } catch (err) {
    console.error("Error loading submissions:", err);
    res.status(500).json({ ok: false, message: "Server error." });
  }
});

// ------------------------------------------------------------
// POST /api/admin/submissions/:id/approve
// body: { coinsAwarded }
// ------------------------------------------------------------
router.post("/admin/submissions/:id/approve", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let { coinsAwarded } = req.body;
    coinsAwarded = Number(coinsAwarded) || 0;

    const submission = await PdfSubmission.findById(id);
    if (!submission)
      return res.status(404).json({ ok: false, message: "Submission not found." });

    if (submission.status !== "pending")
      return res.status(400).json({
        ok: false,
        message: "This submission is already reviewed.",
      });

    const user = await User.findById(submission.userId);
    if (!user)
      return res.status(404).json({ ok: false, message: "User not found." });

    // Update submission
    submission.status = "approved";
    submission.reviewedAt = new Date();
    submission.coinsAwarded = coinsAwarded;
    await submission.save();

    // Update user wallet
    if (coinsAwarded > 0) {
      user.walletCoins += coinsAwarded;
      await user.save();
    }

    // Send notification
    const msg =
      coinsAwarded > 0
        ? `Great news! Your PDF "${submission.title}" was selected and you earned ${coinsAwarded} coins.`
        : `Your PDF "${submission.title}" was selected and added to our collection.`;

    await addNotification(user._id, msg, "success");

    res.json({ ok: true, submission, walletCoins: user.walletCoins });
  } catch (err) {
    console.error("Error approving submission:", err);
    res.status(500).json({ ok: false, message: "Server error." });
  }
});

// ------------------------------------------------------------
// POST /api/admin/submissions/:id/reject
// body: { reason }
// ------------------------------------------------------------
router.post("/admin/submissions/:id/reject", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const submission = await PdfSubmission.findById(id);
    if (!submission)
      return res.status(404).json({ ok: false, message: "Submission not found." });

    if (submission.status !== "pending")
      return res.status(400).json({
        ok: false,
        message: "This submission is already reviewed.",
      });

    submission.status = "rejected";
    submission.reviewedAt = new Date();
    submission.rejectReason =
      reason || "PDF already exists or does not meet content quality.";
    await submission.save();

    const user = await User.findById(submission.userId);
    if (user) {
      await addNotification(
        user._id,
        reason ||
          `Your PDF "${submission.title}" was rejected as it is similar to existing content. Try submitting a different PDF.`,
        "warning"
      );
    }

    res.json({ ok: true, submission });
  } catch (err) {
    console.error("Error rejecting submission:", err);
    res.status(500).json({ ok: false, message: "Server error." });
  }
});

// ------------------------------------------------------------
// GET /api/admin/withdrawals
// ------------------------------------------------------------
router.get("/admin/withdrawals", requireAdmin, async (req, res) => {
  try {
    const { status = "pending" } = req.query;

    const requests = await WithdrawalRequest.find({ status })
      .populate("userId", "email name walletCoins")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ ok: true, requests });
  } catch (err) {
    console.error("Error loading withdrawals:", err);
    res.status(500).json({ ok: false, message: "Server error." });
  }
});

// ------------------------------------------------------------
// POST /api/admin/withdrawals/:id/approve
// ------------------------------------------------------------
router.post(
  "/admin/withdrawals/:id/approve",
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const request = await WithdrawalRequest.findById(id);

      if (!request)
        return res.status(404).json({ ok: false, message: "Request not found." });

      if (request.status !== "pending")
        return res.status(400).json({
          ok: false,
          message: "Request already processed.",
        });

      request.status = "approved";
      request.processedAt = new Date();
      await request.save();

      await addNotification(
        request.userId,
        `Your withdrawal of ${request.amountCoins} coins has been approved.`,
        "success"
      );

      res.json({ ok: true, request });
    } catch (err) {
      console.error("Error approving withdrawal:", err);
      res.status(500).json({ ok: false, message: "Server error." });
    }
  }
);

// ------------------------------------------------------------
// POST /api/admin/withdrawals/:id/reject
// Refund coins + notify user
// ------------------------------------------------------------
router.post(
  "/admin/withdrawals/:id/reject",
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const request = await WithdrawalRequest.findById(id);
      if (!request)
        return res.status(404).json({ ok: false, message: "Request not found." });

      if (request.status !== "pending")
        return res.status(400).json({
          ok: false,
          message: "Request already processed.",
        });

      const user = await User.findById(request.userId);
      if (!user)
        return res.status(404).json({ ok: false, message: "User not found." });

      // Refund coins
      user.walletCoins += request.amountCoins;
      await user.save();

      request.status = "rejected";
      request.processedAt = new Date();
      request.rejectReason =
        reason || "Withdrawal could not be processed at this time.";
      await request.save();

      await addNotification(
        user._id,
        `Your withdrawal request of ${request.amountCoins} coins was rejected. Coins refunded back to your wallet.`,
        "warning"
      );

      res.json({ ok: true, request, walletCoins: user.walletCoins });
    } catch (err) {
      console.error("Error rejecting withdrawal:", err);
      res.status(500).json({ ok: false, message: "Server error." });
    }
  }
);

module.exports = router;
