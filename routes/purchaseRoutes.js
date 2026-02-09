// routes/purchaseRoutes.js
const express = require("express");
const Purchase = require("../models/Purchase");
const Ebook = require("../models/Ebook");
const protect = require("./middleware/auth")


const router = express.Router();

// POST /api/purchases
// Call this after payment success
router.post("/", protect, async (req, res) => {
  try {
    const { ebookId, amountPaid, paymentId } = req.body;

    const ebook = await Ebook.findById(ebookId);
    if (!ebook) return res.status(404).json({ message: "Ebook not found" });

    const purchase = await Purchase.create({
      user: req.user._id,
      ebook: ebookId,
      amountPaid,
      paymentId,
      status: "SUCCESS",
    });

    res.status(201).json({ message: "Purchase stored", purchase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/purchases/my-library
router.get("/my-library", protect, async (req, res) => {
  try {
    const purchases = await Purchase.find({ user: req.user._id, status: "SUCCESS" })
      .populate("ebook");

    res.json({
      user: req.user,
      ebooks: purchases.map((p) => p.ebook),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
