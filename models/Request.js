const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
  {
    // --------------------
    // User details
    // --------------------
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    // --------------------
    // Request details
    // --------------------
    materialType: {
      type: String,
      required: true,
      enum: ["ebook", "questionPaper"],
    },

    examSubject: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    details: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    // --------------------
    // Admin handling
    // --------------------
    status: {
      type: String,
      enum: ["pending", "completed", "rejected"],
      default: "pending",
      index: true,
    },

    adminNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  {
    timestamps: true, // creates createdAt & updatedAt automatically
  }
);

// --------------------
// Helpful indexes
// --------------------
requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.model("Request", requestSchema);
