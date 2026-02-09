const mongoose = require("mongoose");

const QuizSchema = new mongoose.Schema({

  // ==========================================
  // BASIC INFO
  // ==========================================
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },

  description: {
    type: String,
    default: ""
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
    ],
    index: true
  },


  // ==========================================
  // QUIZ TYPE
  // ==========================================
  type: {
    type: String,
    enum: ["ai", "manual"],
    default: "manual",
    required: true,
    index: true
  },


  // ==========================================
  // AI ONLY
  // ==========================================
  language: {
    type: String,
    trim: true,
    default: undefined
  },


  // ==========================================
  // ⭐ EXAM SETTINGS (NEW – PRO FEATURES)
  // ==========================================

  timeLimit: {
    type: Number,          // seconds
    default: 0            // 0 = unlimited
  },

  shuffleQuestions: {
    type: Boolean,
    default: true
  },

  shuffleOptions: {
    type: Boolean,
    default: true
  },

  negativeMarks: {
    type: Number,
    default: 0
  },

  passPercentage: {
    type: Number,
    default: 40
  },

  maxAttempts: {
    type: Number,
    default: 0   // 0 = unlimited
  },

  questionCount: {
    type: Number,
    default: 0   // 0 = all questions, else random N
  },


  // ==========================================
  // PERFORMANCE CACHE
  // ==========================================
  totalQuestions: {
    type: Number,
    default: 0,
    min: 0
  },


  // ==========================================
  // ANALYTICS (FAST DASHBOARD)
  // ==========================================
  attemptsCount: {
    type: Number,
    default: 0
  },

  avgScore: {
    type: Number,
    default: 0
  },


  // ==========================================
  // VISIBILITY
  // ==========================================
  visibility: {
    type: String,
    enum: ["public", "private"],
    default: "public",
    index: true
  },


  // ==========================================
  // OWNER
  // ==========================================
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },


  // ==========================================
  // STATUS
  // ==========================================
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }

}, {
  timestamps: true
});


// ==========================================
// PRO INDEXES
// ==========================================

QuizSchema.index({ topic: 1, isActive: 1 });
QuizSchema.index({ type: 1, isActive: 1 });
QuizSchema.index({ visibility: 1, isActive: 1 });
QuizSchema.index({ createdAt: -1 });


// ==========================================
// SAFE CLEANUP
// ==========================================
QuizSchema.pre("save", function () {
  if (this.type !== "ai") {
    this.language = undefined;
  }
});


module.exports = mongoose.model("Quiz", QuizSchema);
