// ==================================================
// StudentHub — ADMIN QUIZ CONTROLLER (FINAL)
// Added: DELETE quiz support
// Production safe + stable + clean
// ==================================================

const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const QuizAttempt = require("../models/QuizAttempt"); // ⭐ NEW
const generateQuiz = require("./quiz.engine");


// ==================================================
// HELPER → normalize text
// ==================================================
function clean(v) {
  return String(v || "").trim();
}



// ==================================================
// ADMIN: Generate quiz using AI
// POST /api/admin/quiz/generate
// ==================================================
exports.generateAndSaveQuiz = async (req, res) => {
  try {
    const { title, topic, language } = req.body;

    if (!req.user?.id)
      return res.status(401).json({ error: "Unauthorized" });

    if (!title || !topic)
      return res.status(400).json({ error: "Title and topic required" });


    // ============================================
    // 1️⃣ Generate AI questions
    // ============================================
    const aiQuestions = await generateQuiz({
      topic,
      language,
      userId: req.user.id,
    });

    if (!Array.isArray(aiQuestions) || !aiQuestions.length)
      throw new Error("AI returned no questions");


    // ============================================
    // 2️⃣ Create quiz
    // ============================================
    const quiz = await Quiz.create({
      title: clean(title),
      topic,
      language: language || null,
      createdBy: req.user.id,
      isActive: true,
    });


    // ============================================
    // 3️⃣ Save questions (store TEXT answer only)
    // ============================================
    const questionDocs = aiQuestions
      .filter(q => q?.question && Array.isArray(q.options) && q.options.length)
      .map(q => {

        const options = q.options.map(o => clean(o));

        let correctText = "";

        if (typeof q.correctIndex === "number" && options[q.correctIndex]) {
          correctText = options[q.correctIndex];
        }
        else if (typeof q.answer === "string") {
          correctText = clean(q.answer);
        }
        else if (typeof q.answer === "number" && options[q.answer]) {
          correctText = options[q.answer];
        }
        else {
          correctText = options[0];
        }

        return {
          quizId: quiz._id,
          questionText: clean(q.question),
          options,
          correctAnswer: correctText,
          marks: 1,
        };
      });

    await Question.insertMany(questionDocs);


    return res.json({
      ok: true,
      message: "Quiz generated & saved successfully",
      quizId: quiz._id,
      totalQuestions: questionDocs.length,
    });

  } catch (err) {
    console.error("[ADMIN QUIZ GENERATE ERROR]", err);
    return res.status(500).json({ error: err.message });
  }
};



// ==================================================
// ADMIN: Get all quizzes
// ==================================================
exports.getAllQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({}).sort({ createdAt: -1 }).lean();

    const counts = await Question.aggregate([
      { $group: { _id: "$quizId", count: { $sum: 1 } } }
    ]);

    const countMap = {};
    counts.forEach(c => countMap[c._id.toString()] = c.count);

    const result = quizzes.map(q => ({
      id: q._id.toString(),
      title: q.title,
      topic: q.topic,
      totalQuestions: countMap[q._id.toString()] || 0,
      isActive: q.isActive,
      createdAt: q.createdAt,
    }));

    res.json({ ok: true, quizzes: result });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load quizzes" });
  }
};



// ==================================================
// ADMIN: Toggle quiz active status
// ==================================================
exports.toggleQuizStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await Quiz.findById(id);
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    quiz.isActive = !quiz.isActive;
    await quiz.save();

    res.json({
      ok: true,
      quizId: quiz._id,
      isActive: quiz.isActive
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update quiz status" });
  }
};



// ==================================================
// 🔴 ADMIN: DELETE QUIZ (NEW)
// DELETE /api/admin/quiz/:id
// ==================================================
exports.deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;

    const quiz = await Quiz.findById(id);
    if (!quiz)
      return res.status(404).json({ error: "Quiz not found" });


    // ============================================
    // ⭐ DELETE EVERYTHING RELATED (safe cleanup)
    // ============================================
    await Promise.all([
      Question.deleteMany({ quizId: id }),
      QuizAttempt.deleteMany({ quizId: id }),
      Quiz.deleteOne({ _id: id }),
    ]);

    res.json({
      ok: true,
      message: "Quiz deleted permanently"
    });

  } catch (err) {
    console.error("[DELETE QUIZ ERROR]", err);
    res.status(500).json({ error: "Failed to delete quiz" });
  }
};
