//admin-theme.js
// admin-theme.js (GLOBAL – use on all admin pages)

(function () {
  function applyTheme(theme) {
    const btn = document.getElementById("theme-toggle");
    if (theme === "dark") {
      document.body.classList.add("dark");
      if (btn) btn.textContent = "☀️";
    } else {
      document.body.classList.remove("dark");
      if (btn) btn.textContent = "🌙";
    }
    localStorage.setItem("studenthub-theme", theme);
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(localStorage.getItem("studenthub-theme") || "light");

    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = document.body.classList.contains("dark") ? "light" : "dark";
        applyTheme(next);
      });
    }
  });
})();
