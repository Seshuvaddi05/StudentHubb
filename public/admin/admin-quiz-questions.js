const params = new URLSearchParams(window.location.search);
const quizId = params.get("quizId");

if (!quizId) {
    alert("Quiz ID missing");
    location.href = "admin-quizzes.html";
}

const API = "/api";

async function loadQuestions() {
    const res = await fetch(`${API}/admin/quizzes/${quizId}/questions`);
    const data = await res.json();

    const container = document.getElementById("questions");
    container.innerHTML = "";

    data.forEach(q => {
        container.innerHTML += `
      <div class="card">
        <p><b>${q.questionText}</b></p>
        <p>Answer: ${q.correctAnswer}</p>
        <button onclick="deleteQuestion('${q._id}')">Delete</button>
      </div>
    `;
    });
}

async function addQuestion() {
    const questionText = document.getElementById("questionText").value;
    const options = [...document.querySelectorAll(".opt")].map(o => o.value);
    const correctIndex = ["A", "B", "C", "D"].indexOf(correctAnswer);
    const correctAnswerText = options[correctIndex];


    if (!questionText || !correctAnswer) {
        alert("Fill all required fields");
        return;
    }

    await fetch(`${API}/admin/quizzes/${quizId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            questionText,
            options,
            correctAnswer
        })
    });

    loadQuestions();
}

async function deleteQuestion(id) {
    if (!confirm("Delete question?")) return;

    await fetch(`${API}/admin/questions/${id}`, {
        method: "DELETE"
    });

    loadQuestions();
}

loadQuestions();
