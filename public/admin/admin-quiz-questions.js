/* =====================================================
   ADMIN QUIZ QUESTIONS – PRODUCTION FINAL (HARDENED)
   safe + crash proof + backend aligned
===================================================== */

const params = new URLSearchParams(window.location.search);
const quizId = params.get("quizId");

const API = "/api/admin/quiz";

const container = document.getElementById("questions");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");

let loading = false;


/* =====================================================
   GUARD
===================================================== */
if (!quizId) {
  alert("Quiz ID missing");
  location.href = "/admin/admin-quizzes.html";
}


/* =====================================================
   HELPERS
===================================================== */
function setStatus(msg = "", type = "") {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = `status-text ${type}`;
}

function clearForm() {
  document.getElementById("questionText").value = "";
  document.querySelectorAll(".opt").forEach(o => (o.value = ""));
  document.getElementById("correctAnswer").value = "";
}

function showMessage(text) {
  if (!container) return;
  container.innerHTML = `<p class="muted">${text}</p>`;
}


/* =====================================================
   LOAD QUESTIONS
===================================================== */
async function loadQuestions() {

  if (!container) return;

  showMessage("Loading...");

  try {
    const res = await fetch(`${API}/${quizId}/questions`, {
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok) throw new Error();

    const questions = data.questions || [];

    container.innerHTML = "";

    if (!questions.length) {
      showMessage("No questions yet");
      if (countEl) countEl.textContent = "0";
      return;
    }

    questions.forEach((q, index) => {

      const div = document.createElement("div");
      div.className = "question-item";

      const optionsHTML = q.options
        .map((o, i) =>
          `<li>${i === Number(q.correctAnswer) ? "✅ " : ""}${o}</li>`
        )
        .join("");

      div.innerHTML = `
        <h4>Q${index + 1}. ${q.questionText}</h4>
        <ul>${optionsHTML}</ul>
        <button class="btn-danger">Delete</button>
      `;

      div.querySelector("button")
        .addEventListener("click", () => deleteQuestion(q._id));

      container.appendChild(div);
    });

    if (countEl) countEl.textContent = questions.length;

  } catch (err) {
    console.error(err);
    showMessage("Failed to load questions");
  }
}


/* =====================================================
   ADD QUESTION
===================================================== */
async function addQuestion(e) {

  if (loading) return;
  loading = true;

  const btn = e?.target;
  if (btn) btn.disabled = true;

  const questionText = document.getElementById("questionText").value.trim();
  const options = [...document.querySelectorAll(".opt")].map(o => o.value.trim());
  const correctAnswer = document.getElementById("correctAnswer").value;

  if (!questionText) {
    setStatus("❌ Enter question text", "error");
    reset(btn);
    return;
  }

  if (options.some(o => !o)) {
    setStatus("❌ Fill all 4 options", "error");
    reset(btn);
    return;
  }

  if (correctAnswer === "") {
    setStatus("❌ Select correct answer", "error");
    reset(btn);
    return;
  }

  try {

    const res = await fetch(`${API}/${quizId}/questions`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionText,
        options,
        correctAnswer: Number(correctAnswer)
      })
    });

    if (!res.ok) throw new Error();

    clearForm();
    setStatus("✅ Question added", "success");

    await loadQuestions();

  } catch (err) {
    console.error(err);
    setStatus("❌ Failed to add question", "error");
  }

  reset(btn);
}

function reset(btn) {
  loading = false;
  if (btn) btn.disabled = false;
}


/* =====================================================
   DELETE QUESTION
===================================================== */
async function deleteQuestion(id) {

  if (!confirm("Delete question?")) return;

  try {
    await fetch(`${API}/question/${id}`, {
      method: "DELETE",
      credentials: "include"
    });

    loadQuestions();

  } catch (err) {
    console.error(err);
  }
}


/* =====================================================
   ENTER KEY SUPPORT
===================================================== */
document.getElementById("questionText")
  ?.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.ctrlKey) addQuestion(e);
  });


/* =====================================================
   INIT
===================================================== */
window.addQuestion = addQuestion;

loadQuestions();
