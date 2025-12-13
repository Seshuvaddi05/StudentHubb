// models/PdfSubmission.js
const mongoose = require("mongoose");

const PdfSubmissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    fileUrl: { type: String, required: true }, // path/URL where you stored the PDF

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
    coinsAwarded: { type: Number, default: 0 },
    rejectReason: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PdfSubmission", PdfSubmissionSchema);
