// ==================================================
// StudentHub — ADMIN QUIZ CONTROLLER (FINAL HARDENED)
// PRODUCTION SAFE + STABLE + COMPLETE
// ==================================================

const mongoose = require("mongoose");

const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const QuizAttempt = require("../models/QuizAttempt");
const generateQuiz = require("./quiz.engine");


// ==================================================
// HELPERS
// ==================================================
function clean(v) {
  return String(v || "").trim();
}

function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}


// ==================================================
// 🔹 AI QUIZ GENERATION
// ==================================================
async function generateAndSaveQuiz(req, res) {
  try {
    const { title, topic, language } = req.body;

    if (!title || !topic)
      return res.status(400).json({ error: "Title and topic required" });

    const aiQuestions = await generateQuiz({
      topic,
      language,
      userId: req.user.id
    });

    if (!aiQuestions?.length)
      throw new Error("AI returned no questions");

    const quiz = await Quiz.create({
      title: clean(title),
      topic,
      language: language || null,
      type: "ai",
      createdBy: req.user.id,
      isActive: true
    });

    const questionDocs = aiQuestions.map(q => {

      const options = (q.options || [])
        .slice(0, 4)
        .map(o => clean(o));

      while (options.length < 4) options.push("N/A");

      let correctIndex = 0;

      if (typeof q.correctIndex === "number") correctIndex = q.correctIndex;
      else if (typeof q.answer === "number") correctIndex = q.answer;
      else if (typeof q.answer === "string")
        correctIndex = options.indexOf(clean(q.answer));

      if (correctIndex < 0 || correctIndex > 3) correctIndex = 0;

      return {
        quizId: quiz._id,
        questionText: clean(q.question) || "Untitled question",
        options,
        correctAnswer: Number(correctIndex),
        marks: 1
      };
    });

    await Question.insertMany(questionDocs);

    res.json({
      ok: true,
      quizId: String(quiz._id),
      totalQuestions: questionDocs.length
    });

  } catch (err) {
    console.error("[AI QUIZ ERROR]", err);
    res.status(500).json({ error: err.message });
  }
}


// ==================================================
// 🔹 CREATE MANUAL QUIZ
// ==================================================
async function createManualQuiz(req, res) {
  try {
    const { title, topic, language } = req.body;

    if (!title || !topic)
      return res.status(400).json({ error: "Title and topic required" });

    const quiz = await Quiz.create({
      title: clean(title),
      topic,
      language: language || null,
      type: "manual",
      createdBy: req.user.id,
      isActive: true
    });

    res.json({ ok: true, quizId: String(quiz._id) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create quiz" });
  }
}


// ==================================================
// 🔹 ADD QUESTIONS TO QUIZ
// ==================================================
async function addQuestionsToQuiz(req, res) {
  try {
    const { id } = req.params;
    const { questions } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid quiz id" });

    if (!Array.isArray(questions) || !questions.length)
      return res.status(400).json({ error: "Questions required" });

    const quizId = toObjectId(id);

    const docs = questions.map(q => {

      const options = (q.options || [])
        .slice(0, 4)
        .map(o => clean(o));

      while (options.length < 4) options.push("N/A");

      let idx = Number(q.correctAnswer);
      if (Number.isNaN(idx) || idx < 0 || idx > 3) idx = 0;

      return {
        quizId,
        questionText: clean(q.questionText) || "Untitled question",
        options,
        correctAnswer: Number(idx),
        marks: 1
      };
    });

    await Question.insertMany(docs);

    res.json({ ok: true, count: docs.length });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add questions" });
  }
}


// ==================================================
// 🔹 GET QUESTIONS OF QUIZ
// ==================================================
async function getQuestionsOfQuiz(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid id" });

    const questions = await Question
      .find({ quizId: toObjectId(id) })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ questions });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load questions" });
  }
}


// ==================================================
// 🔴 DELETE QUESTION
// ==================================================
async function deleteQuestion(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid question id" });

    await Question.deleteOne({ _id: toObjectId(id) });

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete question" });
  }
}


// ==================================================
// 🔹 GET ALL QUIZZES (ADMIN LIST)
// ==================================================
async function getAllQuizzes(req, res) {
  try {

    const quizzes = await Quiz.find({})
      .sort({ createdAt: -1 })
      .lean();

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
      totalQuestions: map[String(q._id)] || 0,
      isActive: q.isActive,
      createdAt: q.createdAt
    }));

    res.json({ quizzes: result });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load quizzes" });
  }
}


// ==================================================
// 🔹 TOGGLE QUIZ STATUS
// ==================================================
async function toggleQuizStatus(req, res) {
  try {

    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ error: "Not found" });

    quiz.isActive = !quiz.isActive;
    await quiz.save();

    res.json({ ok: true, isActive: quiz.isActive });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
}


// ==================================================
// 🔴 DELETE QUIZ
// ==================================================
async function deleteQuiz(req, res) {
  try {

    const { id } = req.params;
    const quizId = toObjectId(id);

    await Promise.all([
      Question.deleteMany({ quizId }),
      QuizAttempt.deleteMany({ quizId }),
      Quiz.deleteOne({ _id: quizId })
    ]);

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed" });
  }
}


// ==================================================
module.exports = {
  generateAndSaveQuiz,
  createManualQuiz,
  addQuestionsToQuiz,
  getQuestionsOfQuiz,
  deleteQuestion,
  getAllQuizzes,
  toggleQuizStatus,
  deleteQuiz
};
