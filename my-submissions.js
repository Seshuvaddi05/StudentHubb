// my-submissions.js
// Shows list of all submissions and their statuses.

document.addEventListener("DOMContentLoaded", () => {

  // ⭐⭐ CRITICAL: enable global helpers (theme + nav)
  if (window.initThemeToggle) initThemeToggle();
  if (window.initMobileNav) initMobileNav();
  if (window.initBackToTop) initBackToTop();


  const listEl = document.getElementById("submissions-list");
  const statusEl = document.getElementById("submissions-status");
  if (!listEl || !statusEl) return;

  async function loadSubmissions() {
    statusEl.textContent = "Loading your submissions…";

    try {
      const res = await fetch("/api/user-submissions", {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok || data.ok === false) {
        statusEl.textContent =
          data.message ||
          "Unable to load submissions. Please make sure you are signed in.";
        return;
      }

      const submissions = data.submissions || [];
      listEl.innerHTML = "";

      if (!submissions.length) {
        statusEl.textContent =
          "You haven’t submitted any PDFs yet. Start by using the Submit PDF page.";
        return;
      }

      submissions.forEach((s) => {
        const card = document.createElement("article");
        card.className = "submission-card";

        const title = document.createElement("div");
        title.className = "submission-title";
        title.textContent = s.title || "Untitled PDF";
        card.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "submission-meta";
        const created = s.createdAt
          ? new Date(s.createdAt).toLocaleString("en-IN", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Unknown date";

        meta.textContent = `Submitted on ${created}`;
        card.appendChild(meta);

        const pill = document.createElement("span");
        pill.className = "status-pill";

        if (s.status === "approved") {
          pill.classList.add("status-approved");
          pill.textContent = "Approved";
        } else if (s.status === "rejected") {
          pill.classList.add("status-rejected");
          pill.textContent = "Rejected";
        } else {
          pill.classList.add("status-pending");
          pill.textContent = "Pending review";
        }
        card.appendChild(pill);

        if (s.coinsAwarded && s.status === "approved") {
          const coins = document.createElement("div");
          coins.className = "submission-meta";
          coins.textContent = `Coins earned: ${s.coinsAwarded}`;
          card.appendChild(coins);
        }

        if (s.rejectReason && s.status === "rejected") {
          const reason = document.createElement("div");
          reason.className = "submission-meta";
          reason.textContent = `Reason: ${s.rejectReason}`;
          card.appendChild(reason);
        }

        listEl.appendChild(card);
      });

      statusEl.textContent = `Showing ${submissions.length} of your submissions.`;

    } catch (err) {
      console.error("loadSubmissions error:", err);
      statusEl.textContent =
        "Unexpected error while loading submissions. Please try again.";
    }
  }

  loadSubmissions();
});
