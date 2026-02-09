const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
{
  // ==========================================
  // RELATION
  // ==========================================
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quiz",
    required: true,
    index: true
  },


  // ==========================================
  // QUESTION TEXT
  // ==========================================
  questionText: {
    type: String,
    required: true,
    trim: true
  },


  // ==========================================
  // OPTIONS (ALWAYS 4 — CLEANED + UNIQUE)
  // ==========================================
  options: {
    type: [String],
    required: true,
    validate: {
      validator(arr) {
        if (!Array.isArray(arr) || arr.length !== 4) return false;

        const cleaned = arr.map(o => o.trim());
        const unique = new Set(cleaned);

        return unique.size === 4;
      },
      message: "Options must contain 4 unique values"
    },
    set: arr => arr.map(o => o.trim())
  },


  // ==========================================
  // CORRECT OPTION INDEX
  // ==========================================
  correctAnswer: {
    type: Number,
    required: true,
    min: 0,
    max: 3,
    select: false   // ⭐ IMPORTANT (hide from frontend automatically)
  },


  // ==========================================
  // MARKING SYSTEM (ADVANCED)
  // ==========================================
  marks: {
    type: Number,
    default: 1,
    min: 1
  },

  negativeMarks: {
    type: Number,
    default: 0
  },


  // ==========================================
  // QUESTION METADATA (PRO FEATURES)
  // ==========================================
  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    default: "medium",
    index: true
  },

  tags: {
    type: [String],        // e.g. ["math", "algebra"]
    default: [],
    index: true
  },

  explanation: {
    type: String,
    default: ""           // ⭐ used in review page
  },

  type: {
    type: String,
    enum: ["mcq"],
    default: "mcq"
  },


  // ==========================================
  // FLAGS
  // ==========================================
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }

},
{
  timestamps: true
});


// ==========================================
// PRO INDEXES (FAST QUERIES)
// ==========================================

// load questions fast per quiz
questionSchema.index({ quizId: 1, isActive: 1 });

// difficulty filters
questionSchema.index({ quizId: 1, difficulty: 1 });

// tags search
questionSchema.index({ tags: 1 });


// ==========================================
// EXPORT
// ==========================================
module.exports = mongoose.model("Question", questionSchema);
