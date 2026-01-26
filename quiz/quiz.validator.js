// quiz/quiz.validator.js

const MIN_QUESTIONS = 25;
const MAX_QUESTIONS = 30;

module.exports = function validateQuiz(quiz) {
  if (!Array.isArray(quiz)) {
    throw new Error("Quiz must be an array");
  }

  if (quiz.length < MIN_QUESTIONS || quiz.length > MAX_QUESTIONS) {
    throw new Error(
      `Quiz must contain between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} questions (got ${quiz.length})`
    );
  }

  quiz.forEach((q, i) => {
    // Question
    if (typeof q.question !== "string" || !q.question.trim()) {
      throw new Error(`Invalid question at index ${i}`);
    }

    // Options
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`Invalid options at index ${i}`);
    }

    q.options.forEach((opt, j) => {
      if (typeof opt !== "string" || !opt.trim()) {
        throw new Error(`Invalid option at index ${i}, option ${j}`);
      }
    });

    // Correct index
    if (
      typeof q.correctIndex !== "number" ||
      q.correctIndex < 0 ||
      q.correctIndex > 3
    ) {
      throw new Error(
        `Invalid correctIndex at index ${i} (value: ${q.correctIndex})`
      );
    }

    // Difficulty
    if (!["easy", "medium", "hard"].includes(q.difficulty)) {
      throw new Error(`Invalid difficulty at index ${i}`);
    }
  });

  return true; // explicit success
};
