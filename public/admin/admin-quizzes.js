/* =====================================================
   ADMIN QUIZZES PAGE – FINAL PRODUCTION VERSION
   Features:
   ✅ Load quizzes
   ✅ Empty state
   ✅ Toggle enable/disable
   ✅ Delete quiz
   ✅ Search
   ✅ Topic filter
   ✅ Status filter
===================================================== */

const tableBody = document.getElementById("quizTableBody");

const searchInput = document.getElementById("searchInput");
const topicFilter = document.getElementById("topicFilter");
const statusFilter = document.getElementById("statusFilter");

let quizzes = []; // master data



/* =====================================================
   LOAD QUIZZES FROM SERVER
===================================================== */
async function loadQuizzes() {
  try {
    const res = await fetch("/api/admin/quiz/all", {
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Failed to fetch quizzes");

    quizzes = data.quizzes || [];

    renderQuizzes();

  } catch (err) {
    console.error("[ADMIN QUIZZES ERROR]", err);

    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:24px; color:#dc2626;">
          Failed to load quizzes
        </td>
      </tr>
    `;
  }
}



/* =====================================================
   RENDER (Search + Filter + Draw table)
===================================================== */
function renderQuizzes() {
  const search = (searchInput?.value || "").toLowerCase();
  const topic = topicFilter?.value || "";
  const status = statusFilter?.value || "";

  tableBody.innerHTML = "";

  const filtered = quizzes.filter(q => {

    if (search && !q.title.toLowerCase().includes(search)) return false;
    if (topic && q.topic !== topic) return false;
    if (status && String(q.isActive) !== status) return false;

    return true;
  });


  /* ========= EMPTY STATE ========= */
  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:24px; color:#6b7280;">
          No quizzes found
        </td>
      </tr>
    `;
    return;
  }


  /* ========= RENDER ROWS ========= */
  filtered.forEach(q => {
    const tr = document.createElement("tr");

    const quizId = q._id || q.id;

    tr.innerHTML = `
      <td>${q.title}</td>
      <td>${q.topic}</td>
      <td>${q.totalQuestions ?? 0}</td>

      <td>
        <span class="status-badge ${
          q.isActive ? "status-active" : "status-inactive"
        }">
          ${q.isActive ? "Active" : "Inactive"}
        </span>
      </td>

      <td style="display:flex; gap:8px; flex-wrap:wrap;">

        <!-- Toggle -->
        <button
          class="action-btn ${
            q.isActive ? "btn-disable" : "btn-enable"
          }"
          onclick="toggleQuiz('${quizId}')">
          ${q.isActive ? "Disable" : "Enable"}
        </button>

        <!-- Manage -->
        <a
          href="/admin/admin-quiz-questions.html?quizId=${quizId}"
          class="action-btn btn-secondary">
          Manage
        </a>

        <!-- ⭐ Delete -->
        <button
          class="action-btn btn-delete"
          onclick="deleteQuiz('${quizId}')">
          Delete
        </button>

      </td>

      <td>${new Date(q.createdAt).toLocaleString()}</td>
    `;

    tableBody.appendChild(tr);
  });
}



/* =====================================================
   TOGGLE QUIZ STATUS
===================================================== */
async function toggleQuiz(id) {
  if (!confirm("Change quiz status?")) return;

  try {
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
   DELETE QUIZ
===================================================== */
async function deleteQuiz(id) {
  const ok = confirm(
    "⚠️ This will permanently delete:\n\n• Quiz\n• Questions\n• Attempts\n\nContinue?"
  );

  if (!ok) return;

  try {
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
   EVENTS (Search + Filters)
===================================================== */
searchInput?.addEventListener("input", renderQuizzes);
topicFilter?.addEventListener("change", renderQuizzes);
statusFilter?.addEventListener("change", renderQuizzes);



/* =====================================================
   INIT
===================================================== */
loadQuizzes();
