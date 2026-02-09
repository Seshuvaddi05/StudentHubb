const mongoose = require("mongoose");


// ==========================================
// REVIEW SUB DOCUMENT
// ==========================================
const ReviewSchema = new mongoose.Schema({
  questionText: String,
  userAnswer: String,
  correctAnswer: String
}, { _id: false });


// ==========================================
// MAIN ATTEMPT SCHEMA
// ==========================================
const QuizAttemptSchema = new mongoose.Schema({

  // ================= USER =================
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  // ================= QUIZ =================
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
    index: true
  },


  // ================= RESULT =================
  totalQuestions: {
    type: Number,
    default: 0
  },

  correct: {
    type: Number,
    default: 0
  },

  wrong: {
    type: Number,
    default: 0
  },

  score: {
    type: Number,
    default: 0,
    index: true
  },

  accuracy: {
    type: Number,
    default: 0
  },

  // ⭐⭐⭐ STORES FULL REVIEW IN DB (FINAL)
  review: {
    type: [ReviewSchema],
    default: []
  },


  // ================= TIMING =================
  startedAt: Date,

  submittedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  timeTaken: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true
});


// ==========================================
// INDEXES (FAST QUERIES)
// ==========================================

// leaderboard optimized
QuizAttemptSchema.index(
  { quizId: 1, score: -1, timeTaken: 1, submittedAt: 1 }
);

// history optimized
QuizAttemptSchema.index(
  { userId: 1, submittedAt: -1 }
);


module.exports = mongoose.model("QuizAttempt", QuizAttemptSchema);
