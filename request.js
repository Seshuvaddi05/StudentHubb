document.getElementById("requestForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const msg = document.getElementById("reqMsg");
  const submitBtn = e.target.querySelector("button[type='submit']");

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const type = document.getElementById("type").value;
  const exam = document.getElementById("exam").value.trim();
  const details = document.getElementById("details").value.trim();

  // ✅ Validation
  if (!name || !email || !type || !details) {
    msg.textContent = "❌ Please fill all required fields";
    msg.style.color = "red";
    return;
  }

  // UI feedback
  msg.textContent = "⏳ Sending request...";
  msg.style.color = "#6b7280";
  submitBtn.disabled = true;

  try {
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        materialType: type,      // ✅ backend expects this
        examSubject: exam,       // ✅ backend expects this
        details,
      }),
    });

    const result = await res.json();

    if (result.ok) {
      msg.textContent = "✅ Request sent successfully";
      msg.style.color = "green";
      e.target.reset();
    } else {
      msg.textContent = "❌ " + (result.message || "Failed to send request");
      msg.style.color = "red";
    }
  } catch (err) {
    console.error("Request error:", err);
    msg.textContent = "❌ Server error. Please try again.";
    msg.style.color = "red";
  } finally {
    submitBtn.disabled = false;
  }
});
