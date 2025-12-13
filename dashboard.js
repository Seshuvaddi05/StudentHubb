// dashboard.js
// User dashboard: stats + wallet + notifications + creator overview

(function () {
  const BASE_URL = window.location.origin;

  // Elements
  const yearSpan = document.getElementById("year");

  const nameEl = document.getElementById("dash-name");
  const joinedEl = document.getElementById("dash-joined");

  const ebooksStat = document.getElementById("stat-ebooks");
  const qpsStat = document.getElementById("stat-qps");
  const totalStat = document.getElementById("stat-total");
  const walletStat = document.getElementById("stat-wallet");

  const submissionsStat = document.getElementById("stat-submissions");
  const submissionsDetail = document.getElementById("stat-submissions-detail");

  const withdrawalsStat = document.getElementById("stat-withdrawals");
  const withdrawalsDetail = document.getElementById("stat-withdrawals-detail");

  const purchasedList = document.getElementById("purchased-list");
  const notificationsList = document.getElementById("notifications-list");

  const logoutBtn = document.getElementById("logout-btn");

  const navToggle = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");

  const themeToggleBtn = document.getElementById("theme-toggle");

  const notifBell = document.getElementById("notif-bell");
  const notifDot = document.getElementById("notif-dot");
  const notifPanel = document.getElementById("notif-panel");
  const notifPanelList = document.getElementById("notif-list");

  // ---------------- THEME ----------------
  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark");
      if (themeToggleBtn) themeToggleBtn.textContent = "☀️";
    } else {
      document.body.classList.remove("dark");
      if (themeToggleBtn) themeToggleBtn.textContent = "🌙";
    }
    localStorage.setItem("studenthub_theme", theme);
  }

  function initTheme() {
    const saved = localStorage.getItem("studenthub_theme") || "light";
    applyTheme(saved);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", () => {
        const next = document.body.classList.contains("dark") ? "light" : "dark";
        applyTheme(next);
      });
    }
  }

  // ---------------- MOBILE NAV ----------------
  function initMobileNav() {
    if (!navToggle || !navLinks) return;
    navToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
      navToggle.classList.toggle("open");
    });
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        navToggle.classList.remove("open");
      });
    });
  }

  // ---------------- BACK TO TOP ----------------
  function initBackToTop() {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;

    window.addEventListener("scroll", () => {
      if (window.scrollY > 300) btn.classList.add("show");
      else btn.classList.remove("show");
    });

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ---------------- FETCH HELPERS ----------------
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

  // ---------------- LOAD USER ----------------
  async function loadUser() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/me`);
      const u = data.user;
      if (!u) return;

      if (nameEl) nameEl.textContent = u.name || "Student";
      if (joinedEl && u.createdAt) {
        const d = new Date(u.createdAt);
        joinedEl.textContent = d.toLocaleDateString("en-IN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
      }
    } catch (err) {
      console.error("loadUser error:", err);
    }
  }

  // ---------------- LOAD MATERIAL STATS ----------------
  async function loadMaterialStats() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/materials`);
      const ebooks = Array.isArray(data.ebooks) ? data.ebooks.length : 0;
      const qps = Array.isArray(data.questionPapers)
        ? data.questionPapers.length
        : 0;

      if (ebooksStat) ebooksStat.textContent = ebooks;
      if (qpsStat) qpsStat.textContent = qps;
      if (totalStat) totalStat.textContent = ebooks + qps;
    } catch (err) {
      console.error("loadMaterialStats error:", err);
    }
  }

  // ---------------- LOAD WALLET + NOTIFS + WITHDRAWALS ----------------
  async function loadWalletAndNotifications() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/wallet`);

      if (walletStat) {
        walletStat.textContent =
          typeof data.walletCoins === "number" ? data.walletCoins : 0;
      }

      // Withdrawal stats (based on pending list; we only know pending from this endpoint)
      const pending = Array.isArray(data.pendingWithdrawals)
        ? data.pendingWithdrawals.length
        : 0;

      // For now we only know "pending" count; approved/rejected could be added later
      if (withdrawalsStat) withdrawalsStat.textContent = pending;
      if (withdrawalsDetail) {
        withdrawalsDetail.textContent = `${pending} pending • 0 approved • 0 rejected`;
      }

      // Notifications
      const notifs = Array.isArray(data.notifications)
        ? data.notifications
        : [];

      renderNotifications(notifs);
    } catch (err) {
      console.error("loadWalletAndNotifications error:", err);
    }
  }

  function renderNotifications(notifs) {
    const listEl = notificationsList;
    const panelList = notifPanelList;
    if (!listEl || !panelList) return;

    listEl.innerHTML = "";
    panelList.innerHTML = "";

    if (!notifs.length) {
      listEl.innerHTML =
        '<p class="dash-empty">No notifications yet.</p>';
      if (notifDot) notifDot.style.display = "none";
      return;
    }

    // Show orange dot if there is at least one notification
    if (notifDot) notifDot.style.display = "block";

    notifs
      .slice()
      .reverse() // newest first
      .forEach((n) => {
        const createdAt = n.createdAt
          ? new Date(n.createdAt)
          : null;
        const timeText = createdAt
          ? createdAt.toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        // Main list (on page)
        const item = document.createElement("div");
        item.className = "dash-list-item notif-item";
        item.innerHTML = `
          <div class="notif-title">${n.message || ""}</div>
          <div class="notif-meta">${timeText}</div>
        `;
        listEl.appendChild(item);

        // Bell dropdown
        const panelItem = document.createElement("div");
        panelItem.className = "notif-item";
        panelItem.innerHTML = `
          <div class="notif-title">${n.message || ""}</div>
          <div class="notif-meta">${timeText}</div>
        `;
        panelList.appendChild(panelItem);
      });
  }

  // ---------------- LOAD PURCHASED PDFs ----------------
  async function loadPurchased() {
    if (!purchasedList) return;
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/my-library`);
      const items = Array.isArray(data.items) ? data.items : [];

      purchasedList.innerHTML = "";

      if (!items.length) {
        purchasedList.innerHTML =
          '<p class="dash-empty">You haven\'t purchased or unlocked any PDFs yet.</p>';
        return;
      }

      items.slice(0, 5).forEach((it) => {
        const row = document.createElement("div");
        row.className = "dash-list-item";
        row.textContent = `${it.title || "Untitled"} • ${
          it.exam || "—"
        } • ${it.year || "—"}`;
        purchasedList.appendChild(row);
      });

      if (items.length > 5) {
        const more = document.createElement("div");
        more.className = "dash-list-item";
        more.innerHTML =
          `<a href="/library.html">View all ${items.length} items in My Library →</a>`;
        purchasedList.appendChild(more);
      }
    } catch (err) {
      console.error("loadPurchased error:", err);
      purchasedList.innerHTML =
        '<p class="dash-empty">Could not load your library. Please refresh.</p>';
    }
  }

  // ---------------- LOAD USER SUBMISSIONS ----------------
  async function loadSubmissions() {
    try {
      const data = await safeJsonFetch(`${BASE_URL}/api/user-submissions`);
      const submissions = Array.isArray(data.submissions)
        ? data.submissions
        : [];

      const total = submissions.length;
      let pending = 0;
      let approved = 0;
      let rejected = 0;

      submissions.forEach((s) => {
        if (s.status === "pending") pending++;
        else if (s.status === "approved") approved++;
        else if (s.status === "rejected") rejected++;
      });

      if (submissionsStat) submissionsStat.textContent = total;
      if (submissionsDetail) {
        submissionsDetail.textContent = `${pending} pending • ${approved} approved • ${rejected} rejected`;
      }
    } catch (err) {
      console.error("loadSubmissions error:", err);
    }
  }

  // ---------------- NOTIF BELL UI ----------------
  function initNotificationsUI() {
    if (!notifBell || !notifPanel) return;

    notifBell.addEventListener("click", () => {
      notifPanel.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (
        !notifPanel.contains(e.target) &&
        !notifBell.contains(e.target)
      ) {
        notifPanel.classList.remove("open");
      }
    });
  }

  // ---------------- LOGOUT ----------------
  function initLogout() {
    if (!logoutBtn) return;
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch(`${BASE_URL}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.error("logout error:", err);
      } finally {
        window.location.href = "/";
      }
    });
  }

  // ---------------- INIT ----------------
  function init() {
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    initTheme();
    initMobileNav();
    initBackToTop();
    initNotificationsUI();
    initLogout();

    loadUser();
    loadMaterialStats();
    loadWalletAndNotifications();
    loadPurchased();
    loadSubmissions();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
