// models/ReadLater.js
const mongoose = require("mongoose");

const ReadLaterSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Material",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Do not allow duplicates (same user + same material)
ReadLaterSchema.index({ userId: 1, materialId: 1 }, { unique: true });

module.exports = mongoose.model("ReadLater", ReadLaterSchema);
