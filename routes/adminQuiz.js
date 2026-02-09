// =====================================================
// StudentHub — Admin Quiz Routes (PRODUCTION FINAL)
// Supports: AI + Manual quizzes
// Crash-safe + secure + scalable
// =====================================================

const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");

const adminQuizController = require("../quiz/admin.quiz.controller");


// =====================================================
// 🔒 SAFE WRAPPER
// =====================================================
function safe(fn, name = "handler") {
  return async (req, res, next) => {
    try {
      if (typeof fn !== "function") {
        console.error(`❌ Missing controller: ${name}`);
        return res.status(500).json({
          error: `Server misconfiguration: ${name} not implemented`
        });
      }
      await fn(req, res, next);
    } catch (err) {
      console.error(`❌ ${name} failed:`, err);
      next(err);
    }
  };
}


// =====================================================
// 🔹 GENERATE QUIZ (AI)
// =====================================================
router.post(
  "/generate",
  auth,
  adminOnly,
  safe(adminQuizController.generateAndSaveQuiz, "generateAndSaveQuiz")
);


// =====================================================
// 🔹 CREATE MANUAL QUIZ
// =====================================================
router.post(
  "/create",
  auth,
  adminOnly,
  safe(adminQuizController.createManualQuiz, "createManualQuiz")
);


// =====================================================
// 🔹 ADD QUESTIONS
// =====================================================
router.post(
  "/:id/questions",
  auth,
  adminOnly,
  safe(adminQuizController.addQuestionsToQuiz, "addQuestionsToQuiz")
);


// =====================================================
// ⭐ NEW → GET QUESTIONS OF QUIZ  (CRITICAL)
// =====================================================
router.get(
  "/:id/questions",
  auth,
  adminOnly,
  safe(adminQuizController.getQuestionsOfQuiz, "getQuestionsOfQuiz")
);


// =====================================================
// ⭐ NEW → DELETE SINGLE QUESTION  (CRITICAL)
// =====================================================
router.delete(
  "/question/:id",
  auth,
  adminOnly,
  safe(adminQuizController.deleteQuestion, "deleteQuestion")
);


// =====================================================
// 🔹 GET ALL QUIZZES
// =====================================================
router.get(
  "/all",
  auth,
  adminOnly,
  safe(adminQuizController.getAllQuizzes, "getAllQuizzes")
);


// =====================================================
// 🔹 TOGGLE ACTIVE
// =====================================================
router.put(
  "/:id/toggle",
  auth,
  adminOnly,
  safe(adminQuizController.toggleQuizStatus, "toggleQuizStatus")
);


// =====================================================
// 🔴 DELETE QUIZ
// =====================================================
router.delete(
  "/:id",
  auth,
  adminOnly,
  safe(adminQuizController.deleteQuiz, "deleteQuiz")
);


module.exports = router;
