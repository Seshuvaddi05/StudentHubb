// dashboard.js
// StudentHub – User Dashboard Logic (FINAL CLEAN VERSION)

(function () {
  const BASE_URL = window.location.origin;

  /* ---------------- ELEMENTS ---------------- */

  const yearSpan = document.getElementById("year");

  const dashTitle = document.getElementById("dash-title");
  const dashSubtitle = document.getElementById("dash-subtitle");

  const metricEbooks = document.getElementById("metric-ebooks");
  const metricQps = document.getElementById("metric-qps");
  const metricTotal = document.getElementById("metric-total");

  const metricLibrary = document.getElementById("metric-library");
  const metricReadLater = document.getElementById("metric-readlater");

  const metricWallet = document.getElementById("metric-wallet");

  const metricSubs = document.getElementById("metric-submissions");
  const metricSubsDetail = document.getElementById("metric-submissions-detail");

  const metricWithdrawals = document.getElementById("metric-withdrawals");
  const metricWithdrawalsDetail = document.getElementById("metric-withdrawals-detail");

  const accountInfo = document.getElementById("account-info");
  const accountExtra = document.getElementById("account-extra");

  const libraryList = document.getElementById("my-library-list");
  const popularList = document.getElementById("popular-list");
  const notificationsList = document.getElementById("notifications-list");

  const logoutBtn = document.getElementById("btn-logout");

  const navToggle = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");
  const themeToggleBtn = document.getElementById("theme-toggle");


  /* ---------------- HELPERS ---------------- */

  async function safeJsonFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: "include",
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  function slugify(text) {
    return (text || "")
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /* ---------------- THEME ---------------- */

  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark");
      themeToggleBtn.textContent = "☀️";
    } else {
      document.body.classList.remove("dark");
      themeToggleBtn.textContent = "🌙";
    }
    localStorage.setItem("studenthub_theme", theme);
  }

  function initTheme() {
    const saved = localStorage.getItem("studenthub_theme") || "light";
    applyTheme(saved);

    themeToggleBtn.addEventListener("click", () => {
      const next = document.body.classList.contains("dark") ? "light" : "dark";
      applyTheme(next);
    });
  }

  /* ---------------- NAV & UI ---------------- */

  function initMobileNav() {
    if (!navToggle || !navLinks) return;
    navToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
      navToggle.classList.toggle("open");
    });
  }

  function initBackToTop() {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;

    window.addEventListener("scroll", () => {
      btn.classList.toggle("show", window.scrollY > 300);
    });

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function ensureLoggedIn() {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) throw new Error("Not logged in");
    } catch {
      window.location.href = "/login.html?next=/dashboard.html";
    }
  }


  /* ---------------- USER ---------------- */

  async function loadUser() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/me`);
      const u = data.user;

      dashTitle.textContent = `Welcome, ${u.name || u.email}`;
      dashSubtitle.textContent = `You joined StudentHub on ${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"
        }`;

      accountInfo.textContent = u.email || "";
    } catch (err) {
      dashSubtitle.textContent = "Failed to load account.";
      console.error(err);
    }
  }

  /* ---------------- MATERIAL STATS ---------------- */

  async function loadMaterialStats() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/materials`);
      const ebooks = Array.isArray(data.ebooks) ? data.ebooks.length : 0;
      const qps = Array.isArray(data.questionPapers) ? data.questionPapers.length : 0;

      metricEbooks.textContent = ebooks;
      metricQps.textContent = qps;
      metricTotal.textContent = ebooks + qps;

      const combined = [
        ...(data.ebooks || []).map(i => ({ ...i, type: "E-Book" })),
        ...(data.questionPapers || []).map(i => ({ ...i, type: "Question Paper" }))
      ];

      combined.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
      popularList.innerHTML = "";

      combined.slice(0, 6).forEach(it => {
        const div = document.createElement("div");
        div.className = "dash-list-item";
        div.innerHTML = `
          <div class="dash-list-item-title">${it.title || "Untitled"}</div>
          <div class="dash-list-item-meta">${it.type} • ${it.exam || "—"} • Downloads: ${it.downloads || 0}</div>
        `;
        popularList.appendChild(div);
      });

      if (!combined.length) {
        popularList.innerHTML = `<div class="dash-empty">No materials yet.</div>`;
      }
    } catch (err) {
      console.error(err);
    }
  }

  /* ---------------- LIBRARY ---------------- */

  async function loadLibrary() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/my-library`);
      const items = Array.isArray(data.items) ? data.items : [];

      metricLibrary.textContent = items.length;
      accountExtra.textContent = `Purchased items: ${items.length}`;

      libraryList.innerHTML = "";

      if (!items.length) {
        libraryList.innerHTML = `<div class="dash-empty">No purchases yet.</div>`;
        return;
      }

      items.forEach(it => {
        const div = document.createElement("div");
        div.className = "dash-list-item";
        div.innerHTML = `
          <div class="dash-list-item-title">${it.title || "Untitled"}</div>
          <div class="dash-list-item-meta">
            ${it.itemType === "questionPaper" ? "Question Paper" : "E-Book"} •
            ${it.exam || "—"} • ${it.year || "—"} • ₹${Number(it.price || 0)}
          </div>
          <div class="dash-list-item-actions">
            <a class="btn small" href="/view/${slugify(it.title)}?id=${encodeURIComponent(it.itemId)}">
              Open reader
            </a>
          </div>
        `;
        libraryList.appendChild(div);
      });
    } catch (err) {
      console.error(err);
    }
  }


  /* ---------------- READ LATER ---------------- */

  async function loadReadLater() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/read-later`);

      // ✅ CORRECT: count only real visible items
      const count = Array.isArray(data.items) ? data.items.length : 0;

      metricReadLater.textContent = count;
    } catch (err) {
      console.error("Failed to load Read Later count", err);
      metricReadLater.textContent = "0";
    }
  }


  /* ---------------- WALLET & WITHDRAWALS ---------------- */

  async function loadWallet() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/wallet`);
      metricWallet.textContent = data.walletCoins || 0;

      const withdrawals = data.withdrawals || [];
      let pending = 0, paid = 0, rejected = 0;

      withdrawals.forEach(w => {
        if (w.status === "pending") pending++;
        else if (w.status === "paid" || w.status === "approved") paid++;
        else if (w.status === "rejected") rejected++;
      });

      metricWithdrawals.textContent = withdrawals.length;
      metricWithdrawalsDetail.textContent =
        `${pending} pending • ${paid} paid • ${rejected} rejected`;

      renderNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
    }
  }

  /* ---------------- SUBMISSIONS ---------------- */

  async function loadSubmissions() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/user-submissions`);
      const submissions = data.submissions || [];

      let pending = 0, approved = 0, rejected = 0;

      submissions.forEach(s => {
        if (s.status === "pending") pending++;
        else if (s.status === "approved") approved++;
        else if (s.status === "rejected") rejected++;
      });

      metricSubs.textContent = submissions.length;
      metricSubsDetail.textContent =
        `${pending} pending • ${approved} approved • ${rejected} rejected`;
    } catch (err) {
      console.error(err);
    }
  }

  /* ---------------- NOTIFICATIONS ---------------- */

  function renderNotifications(notifs) {
    notificationsList.innerHTML = "";

    if (!notifs.length) {
      notificationsList.innerHTML = `<div class="dash-empty">No notifications yet.</div>`;
      return;
    }

    notifs.slice().reverse().forEach(n => {
      const div = document.createElement("div");
      div.className = "dash-list-item";
      div.innerHTML = `
        <div>${n.message || ""}</div>
        <small>${n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}</small>
      `;
      notificationsList.appendChild(div);
    });
  }

  /* ---------------- LOGOUT ---------------- */

  function initLogout() {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch(`${BASE_URL}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } finally {
        window.location.href = "/login.html";
      }
    });
  }

  /* ---------------- INIT ---------------- */

  async function init() {
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    await ensureLoggedIn(); // 🔐 CHECK LOGIN FIRST

    initTheme();
    initMobileNav();
    initBackToTop();
    initLogout();

    await loadUser();
    await loadMaterialStats();
    await loadLibrary();
    await loadReadLater();
    await loadWallet();
    await loadSubmissions();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
