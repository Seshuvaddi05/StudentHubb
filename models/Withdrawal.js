// models/Withdrawal.js
const mongoose = require("mongoose");

/* ================================
   WITHDRAWAL SCHEMA
   Stores user withdrawal requests
===================================*/
const withdrawalSchema = new mongoose.Schema(
  {
    // User who requested withdrawal
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Amount requested in coins
    amountCoins: {
      type: Number,
      required: true,
      min: 1,
    },

    // User UPI ID
    upiId: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    // Optional note from user
    note: {
      type: String,
      default: "",
      maxlength: 500,
    },

    // Withdrawal status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "paid"],
      default: "pending",
      index: true,
    },

    // Admin message (optional)
    adminRemark: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true, // createdAt & updatedAt
  }
);

module.exports = mongoose.model("Withdrawal", withdrawalSchema);
