// routes/adminQuizQuestions.js
// ADMIN ONLY – manual question management

const express = require("express");
const router = express.Router();

const Question = require("../models/Question");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/adminOnly");


// =====================================
// ADD question
// POST /api/admin/quizzes/:quizId/questions
// =====================================
router.post(
  "/admin/quizzes/:quizId/questions",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const { questionText, options, correctAnswer, marks } = req.body;

      if (!questionText || !Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({
          success: false,
          message: "Invalid question format",
        });
      }

      const question = await Question.create({
        quizId: req.params.quizId,
        questionText,
        options,
        correctAnswer,
        marks: marks || 1,
      });

      res.json({ success: true, question });
    } catch (err) {
      console.error("[ADD QUESTION ERROR]", err);
      res.status(500).json({ success: false });
    }
  }
);


// =====================================
// GET questions
// GET /api/admin/quizzes/:quizId/questions
// =====================================
router.get(
  "/admin/quizzes/:quizId/questions",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const questions = await Question.find({
        quizId: req.params.quizId,
      });

      res.json({ success: true, questions });
    } catch (err) {
      console.error("[GET QUESTIONS ERROR]", err);
      res.status(500).json({ success: false });
    }
  }
);


// =====================================
// DELETE question
// DELETE /api/admin/questions/:id
// =====================================
router.delete(
  "/admin/questions/:id",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      await Question.findByIdAndDelete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[DELETE QUESTION ERROR]", err);
      res.status(500).json({ success: false });
    }
  }
);

module.exports = router;
