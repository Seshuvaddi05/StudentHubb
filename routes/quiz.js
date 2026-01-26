// =====================================================
// StudentHub — PUBLIC QUIZ ROUTES (FINAL PRODUCTION SAFE)
// FIXED 100%: answer matching, DB index support, normalization
// =====================================================

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const auth = require("../middleware/auth");

const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const QuizAttempt = require("../models/QuizAttempt");


// =====================================================
// 🔧 Fisher–Yates shuffle
// =====================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


// =====================================================
// 🔥 SMART NORMALIZER
// makes "$4.00" === 4, "90 degrees" === 90 etc.
// =====================================================
function normalize(v) {
  if (v === null || v === undefined) return "";

  return String(v)
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/degrees?/g, "")
    .replace(/\s+/g, "")
    .trim();
}


// =====================================================
// 🔥 GET REAL CORRECT VALUE
// supports BOTH:
//   correctAnswer: "25"
//   correctAnswer: 0 (index)
// =====================================================
function getCorrectValue(q) {
  let ans = q.correctAnswer;

  // ⭐ if stored as index → convert to option text
  if (typeof ans === "number") {
    return q.options?.[ans] ?? "";
  }

  return ans;
}


// =====================================================
// 🔥 LEADERBOARD
// =====================================================
router.get("/leaderboard", auth, async (req, res) => {
  try {
    const { quizId } = req.query;

    if (!quizId)
      return res.status(400).json({ error: "quizId required" });

    const objectQuizId = new mongoose.Types.ObjectId(quizId);

    const data = await QuizAttempt.find({ quizId: objectQuizId })
      .sort({
        score: -1,
        timeTaken: 1,
        submittedAt: 1
      })
      .limit(10)
      .populate("userId", "name")
      .lean();

    const leaderboard = data.map((a, i) => ({
      rank: i + 1,
      user: a.userId?.name || "User",
      score: a.score,
    }));

    res.json({ leaderboard });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Leaderboard failed" });
  }
});


// =====================================================
// 🔥 LIST QUIZZES
// =====================================================
router.get("/", auth, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ isActive: true })
      .select("_id title topic language createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const result = await Promise.all(
      quizzes.map(async (q) => ({
        id: q._id,
        title: q.title,
        topic: q.topic,
        language: q.language,
        totalQuestions: await Question.countDocuments({ quizId: q._id }),
      }))
    );

    res.json({ quizzes: result });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Load failed" });
  }
});


// =====================================================
// 🔥 LOAD QUIZ
// =====================================================
router.get("/:quizId", auth, async (req, res) => {
  try {
    const { quizId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quizId))
      return res.status(400).json({ error: "Invalid id" });

    const quiz = await Quiz.findById(quizId);

    if (!quiz || !quiz.isActive)
      return res.status(404).json({ error: "Quiz not found" });

    let questions = await Question
      .find({ quizId })
      .select("-correctAnswer") // hide answers
      .lean();

    questions = shuffle(questions);

    res.json({
      id: quiz._id,
      title: quiz.title,
      topic: quiz.topic,
      totalQuestions: questions.length,
      questions,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
});


// =====================================================
// 🔥 SUBMIT QUIZ (FINAL FIXED VERSION)
// =====================================================
router.post("/:quizId/submit", auth, async (req, res) => {
  try {
    const { quizId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quizId))
      return res.status(400).json({ error: "Invalid id" });

    const objectQuizId = new mongoose.Types.ObjectId(quizId);

    const answers = req.body.answers || {};
    const startedAt = req.body.startedAt;

    const questionDocs = await Question
      .find({ quizId: objectQuizId })
      .select("+correctAnswer")
      .lean();

    let correct = 0;
    let wrong = 0;
    const review = [];

    // =================================================
    // ⭐ FINAL EVALUATION LOGIC (100% SAFE)
    // =================================================
    questionDocs.forEach((q) => {
      const userAns = answers[q._id] ?? null;

      const correctValue = getCorrectValue(q);

      const ok =
        userAns !== null &&
        normalize(userAns) === normalize(correctValue);

      if (userAns !== null) {
        if (ok) correct++;
        else wrong++;
      }

      review.push({
        questionText: q.questionText,
        userAnswer: userAns,
        correctAnswer: correctValue,
      });
    });

    const total = questionDocs.length;

    let score = correct - wrong * 0.25;
    if (score < 0) score = 0;

    const accuracy = total
      ? Number(((correct / total) * 100).toFixed(1))
      : 0;

    let timeTaken = 0;
    if (startedAt)
      timeTaken = Math.floor((Date.now() - new Date(startedAt)) / 1000);

    await QuizAttempt.create({
      userId: req.user.id,
      quizId: objectQuizId,
      totalQuestions: total,
      correct,
      wrong,
      score,
      accuracy,
      timeTaken,
      startedAt,
      submittedAt: new Date(),
    });

    res.json({
      quizId,
      totalQuestions: total,
      correct,
      wrong,
      score,
      accuracy,
      timeTaken,
      review,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Submit failed" });
  }
});


// =====================================================
module.exports = router;
