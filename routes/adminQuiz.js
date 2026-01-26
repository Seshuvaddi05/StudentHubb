// =====================================================
// StudentHub — Admin Quiz Routes (FINAL)
// Added: DELETE quiz support
// =====================================================

const express = require("express");
const router = express.Router();

// ===============================
// CONTROLLER
// ===============================
const adminQuizController = require("../quiz/admin.quiz.controller");


// =====================================================
// 🔹 GENERATE QUIZ (AI)
// POST /api/admin/quiz/generate
// =====================================================
router.post(
  "/generate",
  adminQuizController.generateAndSaveQuiz
);


// =====================================================
// 🔹 GET ALL QUIZZES
// GET /api/admin/quiz/all
// =====================================================
router.get(
  "/all",
  adminQuizController.getAllQuizzes
);


// =====================================================
// 🔹 TOGGLE ACTIVE / DISABLE
// PUT /api/admin/quiz/:id/toggle
// =====================================================
router.put(
  "/:id/toggle",
  adminQuizController.toggleQuizStatus
);


// =====================================================
// 🔴 DELETE QUIZ (NEW ⭐)
// DELETE /api/admin/quiz/:id
// =====================================================
router.delete(
  "/:id",
  adminQuizController.deleteQuiz
);


module.exports = router;
