// ==========================================
// StudentHub Admin Theme (FINAL PRODUCTION)
// Use this ONE file on all admin pages
// ==========================================

(function () {
  const STORAGE_KEY = "studenthub-theme";

  // ------------------------------------------
  // Apply theme to DOM
  // ------------------------------------------
  function applyTheme(theme) {
    const btn = document.getElementById("theme-toggle");

    if (theme === "dark") {
      document.body.classList.add("dark");
      if (btn) btn.textContent = "☀️";
    } else {
      document.body.classList.remove("dark");
      if (btn) btn.textContent = "🌙";
    }

    localStorage.setItem(STORAGE_KEY, theme);
  }

  // ------------------------------------------
  // Detect default theme (first visit only)
  // ------------------------------------------
  function getDefaultTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;

    // Auto detect system theme (nice UX bonus)
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  // ------------------------------------------
  // Init
  // ------------------------------------------
  function initTheme() {
    const theme = getDefaultTheme();
    applyTheme(theme);

    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const next = document.body.classList.contains("dark")
        ? "light"
        : "dark";

      applyTheme(next);
    });
  }

  document.addEventListener("DOMContentLoaded", initTheme);
})();
