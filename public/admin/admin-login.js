async function login() {
  const email = document.getElementById("email").value;
  const secret = document.getElementById("secret").value;

  const res = await fetch("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, secret }),
  });

  if (!res.ok) {
    alert("Invalid admin credentials");
    return;
  }

  window.location.href = "/admin/admin-quiz.html";
}
