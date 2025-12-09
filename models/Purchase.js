// models/Purchase.js
const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ebook: { type: mongoose.Schema.Types.ObjectId, ref: "Ebook", required: true },
    amountPaid: { type: Number, required: true },
    paymentId: { type: String }, // Razorpay/Stripe txn id or dummy id
    status: { type: String, enum: ["SUCCESS", "FAILED"], default: "SUCCESS" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Purchase", purchaseSchema);
