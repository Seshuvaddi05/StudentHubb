// models/WithdrawalRequest.js
const mongoose = require("mongoose");

const WithdrawalRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amountCoins: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // admin
    },
    processedAt: Date,
    rejectReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("WithdrawalRequest", WithdrawalRequestSchema);
