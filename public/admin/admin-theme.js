// ===============================
// ADMIN THEME TOGGLE (GLOBAL)
// ===============================

(function () {
  const toggleBtn = document.getElementById("theme-toggle");

  if (!toggleBtn) return;

  // Load saved theme
  const savedTheme = localStorage.getItem("admin-theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  }

  toggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    // Persist theme
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("admin-theme", isDark ? "dark" : "light");
  });
})();
