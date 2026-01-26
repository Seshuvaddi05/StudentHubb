const mongoose = require("mongoose");

const QuizAttemptSchema = new mongoose.Schema(
  {
    // ===============================
    // USER
    // ===============================
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // ===============================
    // ⭐ CRITICAL (FIX FOR LEADERBOARD)
    // ===============================
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true
    },


    // ===============================
    // QUIZ META
    // ===============================
    topic: {
      type: String,
      default: null
    },

    language: {
      type: String,
      default: null
    },


    // ===============================
    // RESULT STATS
    // ===============================
    totalQuestions: {
      type: Number,
      required: true,
      min: 0
    },

    correct: {
      type: Number,
      default: 0,
      min: 0
    },

    wrong: {
      type: Number,
      default: 0,
      min: 0
    },

    score: {
      type: Number,
      default: 0,
      min: 0,
      index: true
    },

    // ⭐ store once (faster charts)
    accuracy: {
      type: Number,
      default: 0
    },


    // ===============================
    // DIFFICULTY BREAKDOWN
    // ===============================
    difficultyStats: {
      easy: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      hard: { type: Number, default: 0 }
    },


    // ===============================
    // TIMING
    // ===============================
    startedAt: {
      type: Date,
      default: Date.now
    },

    submittedAt: {
      type: Date,
      default: Date.now
    },

    // ⭐ store directly for analytics
    timeTaken: {
      type: Number, // seconds
      default: 0
    }
  },
  {
    timestamps: true
  }
);


// ===============================
// ⚡ INDEXES (FAST QUERIES)
// ===============================

// user history
QuizAttemptSchema.index({ userId: 1, createdAt: -1 });

// leaderboard (VERY IMPORTANT)
QuizAttemptSchema.index({ quizId: 1, score: -1 });

// topic filtering
QuizAttemptSchema.index({ topic: 1 });

// latest attempts
QuizAttemptSchema.index({ submittedAt: -1 });


// ===============================
module.exports = mongoose.model("QuizAttempt", QuizAttemptSchema);
