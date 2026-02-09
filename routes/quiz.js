// =====================================================
// StudentHub — PUBLIC QUIZ ROUTES (PRODUCTION FINAL)
// Stable • Fast • Secure • Scalable
// =====================================================

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const auth = require("../middleware/auth");

const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const QuizAttempt = require("../models/QuizAttempt");


// =====================================================
// 🔧 TRUE Fisher–Yates Shuffle (no bias)
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
// 🔥 Fetch questions (force include correctAnswer)
// Used internally only
// =====================================================
async function fetchQuestions(quizId) {
  const qs = await Question.find({ quizId })
    .select("+correctAnswer")
    .lean();

  return qs.map(q => ({
    ...q,
    _id: String(q._id)
  }));
}



// =====================================================
// 🔥 LEADERBOARD (FIXED for native Mongo users collection)
// GET /api/quiz/leaderboard?quizId=xxx
// =====================================================
router.get("/leaderboard", auth, async (req, res) => {
  try {
    const { quizId } = req.query;

    if (!quizId)
      return res.status(400).json({ error: "quizId required" });

    const attempts = await QuizAttempt.find({ quizId })
      .sort({ score: -1, timeTaken: 1, submittedAt: 1 })
      .limit(10)
      .lean();

    const db = req.app.locals.db;

    const leaderboard = await Promise.all(
      attempts.map(async (a, i) => {
        let user = null;

        try {
          user = await db.collection("users").findOne({
            _id: new mongoose.Types.ObjectId(a.userId)
          });
        } catch { }

        return {
          rank: i + 1,
          user: user?.name || "User",
          score: a.score
        };
      })
    );

    res.json({ leaderboard });

  } catch (err) {
    console.error("[LEADERBOARD ERROR]", err);
    res.status(500).json({ error: "Leaderboard failed" });
  }
});



// =====================================================
// 🔥 LIST ACTIVE QUIZZES
// GET /api/quiz
// =====================================================
router.get("/", auth, async (req, res) => {
  try {

    const quizzes = await Quiz.find({ isActive: true })
      .select("_id title topic language createdAt type")
      .sort({ createdAt: -1 })
      .lean();

    // fast aggregate count
    const counts = await Question.aggregate([
      { $group: { _id: "$quizId", count: { $sum: 1 } } }
    ]);

    const map = {};
    counts.forEach(c => map[String(c._id)] = c.count);

    const result = quizzes.map(q => ({
      id: String(q._id),
      title: q.title,
      topic: q.topic,
      type: q.type,
      language: q.type === "ai" ? q.language : null,
      totalQuestions: map[String(q._id)] || 0,
      timeLimit: q.timeLimit,
      negativeMarks: q.negativeMarks,
      maxAttempts: q.maxAttempts
    }));

    res.json({ quizzes: result });

  } catch (err) {
    console.error("[QUIZ LIST ERROR]", err);
    res.status(500).json({ error: "Load failed" });
  }
});


// =====================================================
// 🔥 QUIZ HISTORY (ULTRA PRO MAX FINAL)
// GET /api/quiz/history
// =====================================================
router.get("/history", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // ===============================
    // FETCH ATTEMPTS (latest first)
    // ===============================
    const attempts = await QuizAttempt.find({ userId })
      .sort({ submittedAt: -1 })
      .lean();

    if (!attempts.length) {
      return res.json({
        attempts: [],
        stats: {
          streak: 0,
          recent: [],
          ranks: {}
        }
      });
    }

    // ===============================
    // FETCH QUIZ TITLES (1 query)
    // ===============================
    const quizIds = [...new Set(attempts.map(a => String(a.quizId)))];

    const quizzes = await Quiz.find({
      _id: { $in: quizIds }
    })
      .select("title")
      .lean();

    const quizMap = {};
    quizzes.forEach(q => {
      quizMap[String(q._id)] = q.title;
    });

    // ===============================
    // FORMAT ATTEMPTS
    // ===============================
    const formatted = attempts.map(a => ({
      id: String(a._id),
      quizId: {
        id: String(a.quizId),
        title: quizMap[String(a.quizId)] || "Quiz"
      },
      score: a.score,
      total: a.totalQuestions,
      accuracy: a.accuracy,
      createdAt: a.submittedAt
    }));


    // =====================================================
    // 🔥 NEW: STREAK CALCULATION
    // =====================================================
    const days = new Set(
      attempts.map(a =>
        new Date(a.submittedAt).toDateString()
      )
    );

    let streak = 0;
    let current = new Date();

    while (days.has(current.toDateString())) {
      streak++;
      current.setDate(current.getDate() - 1);
    }


    // =====================================================
    // 🔥 NEW: CONTINUE LAST 3
    // =====================================================
    const recent = formatted.slice(0, 3);


    // =====================================================
    // 🔥 NEW: RANK PER QUIZ
    // =====================================================
    const ranks = {};

    for (const a of attempts) {

      const better = await QuizAttempt.countDocuments({
        quizId: a.quizId,
        $or: [
          { score: { $gt: a.score } },
          {
            score: a.score,
            timeTaken: { $lt: a.timeTaken }
          }
        ]
      });

      const rank = better + 1;

      const qid = String(a.quizId);

      // store best rank only
      if (!ranks[qid] || rank < ranks[qid]) {
        ranks[qid] = rank;
      }
    }


    // =====================================================
    // FINAL RESPONSE
    // =====================================================
    res.json({
      attempts: formatted,
      stats: {
        streak,
        recent,
        ranks
      }
    });

  } catch (err) {
    console.error("[HISTORY ERROR]", err);
    res.status(500).json({
      attempts: [],
      stats: {
        streak: 0,
        recent: [],
        ranks: {}
      }
    });
  }
});


// =====================================================
// 🔥 DELETE ATTEMPT
// DELETE /api/quiz/attempt/:id
// =====================================================
router.delete("/attempt/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid id" });

    await QuizAttempt.deleteOne({
      _id: id,
      userId: req.user.id
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE ATTEMPT ERROR]", err);
    res.status(500).json({ error: "Delete failed" });
  }
});


router.get("/attempt/:id", auth, async (req, res) => {
  const attempt = await QuizAttempt.findById(req.params.id).lean();
  if (!attempt) return res.status(404).json({});

  const better = await QuizAttempt.countDocuments({
    quizId: attempt.quizId,
    $or: [
      { score: { $gt: attempt.score } },
      {
        score: attempt.score,
        timeTaken: { $lt: attempt.timeTaken }
      }
    ]
  });

  attempt.rank = better + 1;

  res.json(attempt);
});



// =====================================================
// 🔥 LOAD QUIZ (hide answers + freeze order in session)
// GET /api/quiz/:quizId
// =====================================================
router.get("/:quizId", auth, async (req, res) => {
  try {

    const { quizId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quizId))
      return res.status(400).json({ error: "Invalid id" });

    const quiz = await Quiz.findById(quizId).lean();

    if (!quiz || !quiz.isActive)
      return res.status(404).json({ error: "Quiz not found" });

    let questions = await fetchQuestions(quizId);


    // =================================================
    // ⭐ RANDOM QUESTION COUNT
    // =================================================
    if (quiz.questionCount && quiz.questionCount < questions.length) {
      questions = shuffle(questions).slice(0, quiz.questionCount);
    }


    // =================================================
    // ⭐ SHUFFLE QUESTIONS
    // =================================================
    if (quiz.shuffleQuestions) {
      questions = shuffle(questions);
    }


    // =================================================
    // ⭐ SHUFFLE OPTIONS (CRITICAL)
    // =================================================
    if (quiz.shuffleOptions) {
      questions = questions.map(q => {

        const opts = shuffle(q.options);

        const correctIndex = opts.indexOf(
          q.options[q.correctAnswer]
        );

        return {
          ...q,
          options: opts,
          correctAnswer: correctIndex
        };
      });
    }


    // =================================================
    // ⭐⭐⭐ FINAL CRITICAL FIX ⭐⭐⭐
    // Freeze exact order in session
    // =================================================

    // clear previous quiz
    delete req.session.quizQuestions;

    // store fresh copy
    req.session.quizQuestions = questions;

    // ensure session saved
    await new Promise(resolve => req.session.save(resolve));


    // =================================================
    // HIDE ANSWERS FOR CLIENT
    // =================================================
    const safeQuestions = questions.map(q => ({
      ...q,
      correctAnswer: undefined
    }));


    // =================================================
    // SEND RESPONSE
    // =================================================
    res.json({
      id: String(quiz._id),
      title: quiz.title,
      topic: quiz.topic,
      type: quiz.type,
      totalQuestions: safeQuestions.length,
      timeLimit: quiz.timeLimit,
      questions: safeQuestions
    });

  } catch (err) {
    console.error("[LOAD QUIZ ERROR]", err);
    res.status(500).json({ error: "Failed" });
  }
});



// =====================================================
// 🔥 SUBMIT QUIZ (PRODUCTION SAFE)
// Supports BOTH index + text answers
// Negative marking
// Review safe
// =====================================================
router.post("/:quizId/submit", auth, async (req, res) => {
  try {

    const { quizId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quizId))
      return res.status(400).json({ error: "Invalid id" });

    // ✅ FIX: fetch quiz FIRST
    const quiz = await Quiz.findById(quizId);

    if (!quiz || !quiz.isActive)
      return res.status(404).json({ error: "Quiz not found" });

    const questions = req.session.quizQuestions;

    // ⭐ ATTEMPT LIMIT
    if (quiz.maxAttempts > 0) {
      const count = await QuizAttempt.countDocuments({
        quizId,
        userId: req.user.id
      });

      if (count >= quiz.maxAttempts) {
        return res.status(403).json({
          error: "Max attempts reached"
        });
      }
    }


    const answers = req.body.answers || {};
    const timeTaken = Number(req.body.timeTaken) || 0;

    let correct = 0;
    let wrong = 0;

    const review = [];

    questions.forEach(q => {

      const userAns = answers[q._id] ?? null;

      const correctIndex = q.correctAnswer;
      const correctValue = q.options[correctIndex];

      let userIndex = -1;

      if (typeof userAns === "number") {
        userIndex = userAns;
      } else {
        userIndex = q.options.indexOf(userAns);
      }

      const ok =
        userIndex !== -1 &&
        userIndex === correctIndex;

      if (userAns !== null) {
        ok ? correct++ : wrong++;
      }

      // ⭐ FIX HERE
      let userAnswerText = "";
      if (userIndex !== -1) {
        userAnswerText = q.options[userIndex];
      }

      review.push({
        questionText: q.questionText,
        userAnswer: userAnswerText,
        correctAnswer: correctValue
      });

    });

    const total = questions.length;

    const negative = quiz.negativeMarks || 0;
    const score = Math.max(correct - wrong * negative, 0);

    const accuracy = total
      ? Number(((correct / total) * 100).toFixed(1))
      : 0;


    // ⭐ Save attempt
    let saved;

    if (QuizAttempt.saveBestAttempt) {
      saved = await QuizAttempt.saveBestAttempt({
        userId: req.user.id,
        quizId,
        totalQuestions: total,
        correct,
        wrong,
        score,
        accuracy,
        timeTaken,
        submittedAt: new Date(),
        review
      });
    } else {
      saved = await QuizAttempt.create({
        userId: req.user.id,
        quizId,
        totalQuestions: total,
        correct,
        wrong,
        score,
        accuracy,
        timeTaken,
        submittedAt: new Date(),
        review
      });
    }

    // ⭐ UPDATE QUIZ ANALYTICS
    await Quiz.updateOne(
      { _id: quizId },
      {
        $inc: { attemptsCount: 1 }
      }
    );



    // =====================================================
    // 🔥 CALCULATE RANK (NEW)
    // =====================================================

    const betterCount = await QuizAttempt.countDocuments({
      quizId,
      $or: [
        { score: { $gt: score } },
        {
          score,
          timeTaken: { $lt: timeTaken }
        }
      ]
    });

    const rank = betterCount + 1;


    res.json({
      attemptId: saved._id,
      quizId,
      totalQuestions: total,
      correct,
      wrong,
      score,
      accuracy,
      timeTaken,
      review,
      rank   // ⭐ NEW
    });


  } catch (err) {
    console.error("[SUBMIT ERROR]", err);
    res.status(500).json({ error: "Submit failed" });
  }
});



// =====================================================
module.exports = router;
