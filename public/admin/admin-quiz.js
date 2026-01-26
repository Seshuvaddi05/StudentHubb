// ===============================
// ELEMENTS
// ===============================
const topicSelect = document.getElementById("topic");
const languageBox = document.getElementById("languageBox");
const statusEl = document.getElementById("status");

// ===============================
// TOPIC → LANGUAGE TOGGLE
// ===============================
if (topicSelect && languageBox) {
  topicSelect.addEventListener("change", () => {
    languageBox.style.display =
      topicSelect.value === "programming" ? "block" : "none";
  });
}

// ===============================
// GENERATE & SAVE QUIZ (ADMIN)
// ===============================
async function generateQuiz() {
  const title = document.getElementById("title").value.trim();
  const topic = topicSelect.value;
  const language =
    topic === "programming"
      ? document.getElementById("language").value
      : null;

  // Validation
  if (!title || !topic) {
    statusEl.textContent = "❌ Title and topic are required";
    statusEl.className = "status-text error";
    return;
  }

  statusEl.textContent = "⏳ Generating quiz...";
  statusEl.className = "status-text";

  try {
    const res = await fetch("/api/admin/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, topic, language })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Quiz generation failed");
    }

    statusEl.textContent = "✅ Quiz generated successfully!";
    statusEl.className = "status-text success";

  } catch (err) {
    console.error("[ADMIN QUIZ ERROR]", err);
    statusEl.textContent = "❌ " + err.message;
    statusEl.className = "status-text error";
  }
}

// expose to inline onclick
window.generateQuiz = generateQuiz;
