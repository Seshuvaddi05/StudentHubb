const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    // User who made the payment
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Purchased PDF / material
    pdfId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // Razorpay fields
    razorpayOrderId: {
      type: String,
      required: true,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },

    razorpaySignature: {
      type: String,
      default: null,
    },

    // Amount in INR (not paise)
    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    // 🔑 FIXED ENUM (IMPORTANT)
    status: {
      type: String,
      enum: ["created", "success", "failed"], // ✅ success added
      default: "created",
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
