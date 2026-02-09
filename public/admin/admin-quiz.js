// ======================================================
// StudentHub Admin Quiz JS — PRODUCTION FINAL (HARDENED)
// AI + Manual quizzes
// Safe + validated + crash proof
// ======================================================


// ===============================
// ELEMENTS
// ===============================
const topicSelect = document.getElementById("topic");
const languageBox = document.getElementById("languageBox");
const statusEl = document.getElementById("status");

const quizTypeSelect = document.getElementById("quizType");
const aiBox = document.getElementById("aiBox");
const manualBox = document.getElementById("manualBox");

const container = document.getElementById("questionsContainer");
const saveBtn = document.getElementById("saveBtn");


// ======================================================
// 🔹 Status helper
// ======================================================
function setStatus(msg = "", type = "") {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = `status-text ${type}`;
}


// ======================================================
// 🔹 Topic → Language toggle
// ======================================================
if (topicSelect && languageBox) {
  topicSelect.addEventListener("change", () => {
    languageBox.style.display =
      topicSelect.value === "programming" ? "block" : "none";
  });
}


// ======================================================
// 🔹 Quiz Type toggle
// ======================================================
if (quizTypeSelect) {
  quizTypeSelect.addEventListener("change", () => {
    const type = quizTypeSelect.value;

    if (aiBox) aiBox.style.display = type === "ai" ? "block" : "none";
    if (manualBox) manualBox.style.display = type === "manual" ? "block" : "none";
  });
}


// ======================================================
// 🔹 Add Question UI (safe)
// ======================================================
function addQuestion() {

  if (!container) return;

  const div = document.createElement("div");
  div.className = "question-box";

  div.innerHTML = `
    <textarea placeholder="Question text"></textarea>
    <input placeholder="Option 1">
    <input placeholder="Option 2">
    <input placeholder="Option 3">
    <input placeholder="Option 4">
    <input placeholder="Correct option index (0-3)" type="number" min="0" max="3">
    <button type="button" class="remove-btn">❌ Remove</button>
    <hr>
  `;

  div.querySelector(".remove-btn")
    .addEventListener("click", () => div.remove());

  container.appendChild(div);

  div.querySelector("textarea").focus();
}


// ======================================================
// 🔹 Collect Manual Questions (strict validation)
// ======================================================
function collectQuestions() {

  if (!container) return [];

  const blocks = [...container.children];
  const questions = [];

  for (const b of blocks) {

    const fields = b.querySelectorAll("textarea, input");

    const questionText = fields[0].value.trim();

    const options = [
      fields[1].value.trim(),
      fields[2].value.trim(),
      fields[3].value.trim(),
      fields[4].value.trim(),
    ];

    const correctAnswer = Number(fields[5].value);

    if (!questionText || options.some(o => !o)) {
      throw new Error("All questions and options are required");
    }

    if (Number.isNaN(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) {
      throw new Error("Correct answer must be between 0 and 3");
    }

    questions.push({
      questionText,
      options,
      correctAnswer
    });
  }

  return questions;
}


// ======================================================
// 🔹 SAVE QUIZ
// ======================================================
async function saveQuiz() {

  if (!saveBtn) return;

  saveBtn.disabled = true;

  const title = document.getElementById("title")?.value.trim();
  const topic = topicSelect?.value;

  const language =
    topic === "programming"
      ? document.getElementById("language")?.value.trim()
      : null;

  const type = quizTypeSelect?.value;

  if (!title || !topic) {
    setStatus("❌ Title and topic required", "error");
    saveBtn.disabled = false;
    return;
  }

  setStatus("⏳ Saving quiz...");

  try {

    // ==================================================
    // AI QUIZ
    // ==================================================
    if (type === "ai") {

      let count = Number(document.getElementById("aiCount")?.value || 10);

      // ⭐ clamp (production safe)
      if (Number.isNaN(count) || count < 1) count = 10;
      if (count > 50) count = 50;

      const res = await fetch("/api/admin/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, topic, language, count })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed");

      setStatus("✅ AI quiz generated successfully!", "success");
      saveBtn.disabled = false;
      return;
    }


    // ==================================================
    // MANUAL QUIZ
    // ==================================================
    const questions = collectQuestions();

    if (!questions.length) {
      throw new Error("Add at least 1 question");
    }

    const createRes = await fetch("/api/admin/quiz/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, topic, language })
    });

    const quiz = await createRes.json();

    if (!createRes.ok) throw new Error("Failed to create quiz");

    const quizId = quiz.quizId;

    const qRes = await fetch(`/api/admin/quiz/${quizId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ questions })
    });

    if (!qRes.ok) throw new Error("Failed to save questions");

    setStatus("✅ Manual quiz saved successfully!", "success");

    // ⭐ clear UI (polish)
    container.innerHTML = "";
    addQuestion();
    document.getElementById("title").value = "";

  } catch (err) {
    console.error(err);
    setStatus("❌ " + err.message, "error");
  }

  saveBtn.disabled = false;
}


// ======================================================
// INIT
// ======================================================
if (saveBtn) saveBtn.addEventListener("click", saveQuiz);

if (container && container.children.length === 0) {
  addQuestion();
}

window.addQuestion = addQuestion;
window.saveQuiz = saveQuiz;
