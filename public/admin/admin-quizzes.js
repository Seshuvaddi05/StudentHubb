/* =====================================================
   ADMIN QUIZZES PAGE – FINAL PRODUCTION (HARDENED)
   Features:
   ✅ Load quizzes
   ✅ Empty state
   ✅ Toggle enable/disable
   ✅ Delete quiz
   ✅ Search
   ✅ Topic filter
   ✅ Status filter
   ✅ XSS safe
   ✅ Double-click safe
===================================================== */

const tableBody = document.getElementById("quizTableBody");

const searchInput = document.getElementById("searchInput");
const topicFilter = document.getElementById("topicFilter");
const statusFilter = document.getElementById("statusFilter");

let quizzes = [];



/* =====================================================
   SMALL HELPERS
===================================================== */

// prevent XSS (VERY important for admin pages)
function escapeHTML(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, color = "#6b7280") {
  tableBody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align:center; padding:24px; color:${color};">
        ${text}
      </td>
    </tr>
  `;
}



/* =====================================================
   LOAD QUIZZES
===================================================== */
async function loadQuizzes() {
  showMessage("Loading quizzes...");

  try {
    const res = await fetch("/api/admin/quiz/all", {
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed");

    quizzes = data.quizzes || [];

    renderQuizzes();

  } catch (err) {
    console.error("[ADMIN QUIZZES ERROR]", err);
    showMessage("Failed to load quizzes", "#dc2626");
  }
}



/* =====================================================
   RENDER (Search + Filter)
===================================================== */
function renderQuizzes() {
  const search = (searchInput?.value || "").toLowerCase();
  const topic = topicFilter?.value || "";
  const status = statusFilter?.value || "";

  const filtered = quizzes.filter(q => {

    const title = (q.title || "").toLowerCase();

    if (search && !title.includes(search)) return false;
    if (topic && q.topic !== topic) return false;
    if (status && String(q.isActive) !== status) return false;

    return true;
  });


  /* ========= EMPTY ========= */
  if (filtered.length === 0) {
    showMessage("No quizzes found");
    return;
  }

  tableBody.innerHTML = "";


  /* ========= ROWS ========= */
  filtered.forEach(q => {

    const quizId = q._id || q.id;

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHTML(q.title || "")}</td>
      <td>${escapeHTML(q.topic || "")}</td>
      <td>${q.totalQuestions ?? 0}</td>

      <td>
        <span class="status-badge ${
          q.isActive ? "status-active" : "status-inactive"
        }">
          ${q.isActive ? "Active" : "Inactive"}
        </span>
      </td>

      <td style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="action-btn ${
          q.isActive ? "btn-disable" : "btn-enable"
        } toggle-btn">
          ${q.isActive ? "Disable" : "Enable"}
        </button>

        <a
          href="/admin/admin-quiz-questions.html?quizId=${quizId}"
          class="action-btn btn-secondary">
          Manage
        </a>

        <button class="action-btn btn-delete delete-btn">
          Delete
        </button>
      </td>

      <td>${new Date(q.createdAt).toLocaleString()}</td>
    `;


    // safer event listeners (no inline JS)
    tr.querySelector(".toggle-btn")
      .addEventListener("click", () => toggleQuiz(quizId));

    tr.querySelector(".delete-btn")
      .addEventListener("click", () => deleteQuiz(quizId));

    tableBody.appendChild(tr);
  });
}



/* =====================================================
   TOGGLE
===================================================== */
async function toggleQuiz(id) {

  if (!confirm("Change quiz status?")) return;

  try {

    const btn = event.target;
    btn.disabled = true;

    const res = await fetch(`/api/admin/quiz/${id}/toggle`, {
      method: "PUT",
      credentials: "include"
    });

    if (!res.ok) throw new Error();

    await loadQuizzes();

  } catch (err) {
    console.error("[TOGGLE QUIZ ERROR]", err);
    alert("Failed to update quiz status");
  }
}



/* =====================================================
   DELETE
===================================================== */
async function deleteQuiz(id) {

  const ok = confirm(
    "⚠️ This will permanently delete:\n\n• Quiz\n• Questions\n• Attempts\n\nContinue?"
  );

  if (!ok) return;

  try {

    const btn = event.target;
    btn.disabled = true;

    const res = await fetch(`/api/admin/quiz/${id}`, {
      method: "DELETE",
      credentials: "include"
    });

    if (!res.ok) throw new Error();

    await loadQuizzes();

  } catch (err) {
    console.error("[DELETE QUIZ ERROR]", err);
    alert("Failed to delete quiz");
  }
}



/* =====================================================
   EVENTS
===================================================== */
searchInput?.addEventListener("input", renderQuizzes);
topicFilter?.addEventListener("change", renderQuizzes);
statusFilter?.addEventListener("change", renderQuizzes);



/* =====================================================
   INIT
===================================================== */
loadQuizzes();
