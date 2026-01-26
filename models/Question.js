const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
    index: true
  },

  questionText: {
    type: String,
    required: true,
    trim: true
  },

  options: {
    type: [String],
    validate: [arr => arr.length === 4, "Exactly 4 options required"]
  },

  correctAnswer: {
    type: String,
    required: true,
    select: false // 🔒 hidden by default
  },

  marks: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("Question", questionSchema);
