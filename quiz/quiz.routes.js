// =====================================================
// 🚀 StudentHub Quiz System – FINAL PRODUCTION VERSION
// =====================================================
// FEATURES
// ✅ quiz list with counts
// ✅ random question order
// ✅ negative marking
// ✅ analytics (accuracy + time)
// ✅ history
// ✅ leaderboard (DB based)
// ✅ rank
// ✅ answer review
// ✅ wrong-only practice
// ✅ shareable result
// =====================================================

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const auth = require("../middleware/auth");

const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const QuizAttempt = require("../models/QuizAttempt");


// =====================================================
// 🔧 HELPER — shuffle
// =====================================================
function shuffle(arr) {
  return arr.sort(() => Math.random() - 0.5);
}


// =====================================================
// 🔥 LIST ALL QUIZZES
// GET /api/quiz
// =====================================================
router.get("/", auth, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ isActive: true })
      .select("_id title topic language createdAt")
      .sort({ createdAt: -1 });

    const result = await Promise.all(
      quizzes.map(async (q) => ({
        id: q._id,
        title: q.title,
        topic: q.topic,
        language: q.language,
        totalQuestions: await Question.countDocuments({ quizId: q._id }),
        createdAt: q.createdAt,
      }))
    );

    res.json({ quizzes: result });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load quizzes" });
  }
});


// =====================================================
// 🔥 QUIZ HISTORY
// =====================================================
router.get("/history", auth, async (req, res) => {
  try {
    const attempts = await QuizAttempt.find({
      userId: req.user.id
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ attempts });

  } catch (err) {
    res.status(500).json({ error: "History failed" });
  }
});


// =====================================================
// 🔥 GET QUIZ (randomized)
// =====================================================
router.get("/:quizId", auth, async (req, res) => {
  try {
    const { quizId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz || !quiz.isActive) {
      return res.status(404).json({ error: "Quiz not available" });
    }

    let questions = await Question.find({ quizId })
      .select("-correctAnswer");

    questions = shuffle(questions);

    res.json({
      id: quiz._id,
      title: quiz.title,
      topic: quiz.topic,
      language: quiz.language,
      totalQuestions: questions.length,
      questions,
    });

  } catch (err) {
    res.status(500).json({ error: "Load failed" });
  }
});


// =====================================================
// 🔥 SUBMIT QUIZ
// =====================================================
router.post("/:quizId/submit", auth, async (req, res) => {
  try {
    const { answers, startedAt } = req.body;
    const { quizId } = req.params;

    if (!answers) {
      return res.status(400).json({ error: "Answers missing" });
    }

    const quiz = await Quiz.findById(quizId);
    const questions = await Question.find({ quizId });

    let correct = 0;
    let wrong = 0;

    const difficultyStats = { easy: 0, medium: 0, hard: 0 };

    questions.forEach(q => {
      const userAnswer = answers[q._id];

      if (!userAnswer) return;

      if (userAnswer === q.correctAnswer) {
        correct++;
        difficultyStats[q.difficulty || "medium"]++;
      } else {
        wrong++;
      }
    });

    const total = questions.length;

    // ⭐ negative marking
    let score = (correct * 1) - (wrong * 0.25);

    if (score < 0) score = 0; // ⭐ FIX

    const accuracy = total
      ? +((correct / total) * 100).toFixed(1)
      : 0;

    const timeTaken = startedAt
      ? Math.floor((Date.now() - new Date(startedAt)) / 1000)
      : 0;

    // =================================================
    // SAVE ATTEMPT (FULL DATA)
    // =================================================
    const attempt = await QuizAttempt.create({
      userId: req.user.id,
      quizId,
      answers,
      totalQuestions: total,
      correct,
      wrong,
      score,
      accuracy,
      difficultyStats,
      timeTaken,
      createdAt: new Date()
    });

    // =================================================
    // CALCULATE RANK
    // =================================================
    const betterScores = await QuizAttempt.countDocuments({
      quizId,
      score: { $gt: score }
    });

    const rank = betterScores + 1;

    res.json({
      attemptId: attempt._id,
      totalQuestions: total,
      correct,
      wrong,
      score,
      accuracy,
      timeTaken,
      difficultyStats,
      rank
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Submit failed" });
  }
});


// =====================================================
// 🔥 LEADERBOARD (REAL DB)
// =====================================================
router.get("/:quizId/leaderboard", auth, async (req, res) => {
  try {
    const list = await QuizAttempt.find({ quizId: req.params.quizId })
      .sort({ score: -1 })
      .limit(10)
      .populate("userId", "username");

    res.json({ leaderboard: list });

  } catch (err) {
    res.status(500).json({ error: "Leaderboard failed" });
  }
});


// =====================================================
// 🔥 ATTEMPT DETAILS (for review page)
// =====================================================
router.get("/attempt/:attemptId", auth, async (req, res) => {
  try {
    const attempt = await QuizAttempt.findById(req.params.attemptId);

    if (!attempt) {
      return res.status(404).json({ error: "Not found" });
    }

    const questions = await Question.find({
      quizId: attempt.quizId
    });

    res.json({ attempt, questions });

  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
});


// =====================================================
// 🔥 WRONG ONLY PRACTICE
// =====================================================
router.get("/practice/:attemptId", auth, async (req, res) => {
  try {
    const attempt = await QuizAttempt.findById(req.params.attemptId);

    const questions = await Question.find({
      _id: { $in: Object.keys(attempt.answers) }
    });

    const wrong = questions.filter(
      q => attempt.answers[q._id] !== q.correctAnswer
    );

    res.json({ questions: wrong });

  } catch (err) {
    res.status(500).json({ error: "Practice failed" });
  }
});


module.exports = router;
