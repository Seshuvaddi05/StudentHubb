const mongoose = require("mongoose");

const QuizSchema = new mongoose.Schema(
  {
    // BASIC INFO
    title: {
      type: String,
      required: true,
      trim: true
    },

    topic: {
      type: String,
      required: true,
      enum: [
        "quantitative",
        "reasoning",
        "gk",
        "current_affairs",
        "programming"
      ]
    },

    language: {
      type: String,
      default: null,
      trim: true
    },

    createdBy: {
      type: String,
      default: "admin"
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

QuizSchema.index({ topic: 1, isActive: 1 });
QuizSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Quiz", QuizSchema);
