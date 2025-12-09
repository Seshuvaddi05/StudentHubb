// library.js
// "My Library" page: shows materials from /api/my-library

let myLibraryItems = [];

// -------- THEME ----------
function applyLibraryTheme(theme) {
  const body = document.body;
  const toggleBtn = document.getElementById("theme-toggle");
  if (!body || !toggleBtn) return;

  if (theme === "dark") {
    body.classList.add("dark");
    toggleBtn.textContent = "☀️";
  } else {
    body.classList.remove("dark");
    toggleBtn.textContent = "🌙";
  }

  localStorage.setItem("studenthub_theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("studenthub_theme") || "light";
  applyLibraryTheme(saved);

  const toggleBtn = document.getElementById("theme-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const next = document.body.classList.contains("dark") ? "light" : "dark";
      applyLibraryTheme(next);
    });
  }
}

// -------- HELPERS ----------
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatPriceNum(price) {
  const p = Number(price) || 0;
  return p > 0 ? `₹${p}` : "Free";
}

function formatDate(isoStr) {
  if (!isoStr) return "Unknown";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function filterLibraryItems() {
  const searchInput = document.getElementById("library-search");
  const typeFilter = document.getElementById("library-type-filter");

  const q = (searchInput?.value || "").trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const typeVal = typeFilter?.value || "all";

  let filtered = myLibraryItems.slice();

  if (typeVal !== "all") {
    filtered = filtered.filter((item) => item.itemType === typeVal);
  }

  if (terms.length > 0) {
    filtered = filtered.filter((item) => {
      const text = [
        item.title || "",
        item.description || "",
        item.exam || "",
        item.subject || "",
        item.year || "",
      ]
        .join(" ")
        .toLowerCase();

      return terms.every((t) => text.includes(t));
    });
  }

  return filtered;
}

function renderLibrary() {
  const container = document.getElementById("library-list");
  const statusEl = document.getElementById("library-status");
  const summaryEl = document.getElementById("library-summary");
  if (!container) return;

  const filtered = filterLibraryItems();
  container.innerHTML = "";

  if (filtered.length === 0) {
    const msg =
      myLibraryItems.length === 0
        ? "You don’t have any materials in your library yet."
        : "No items match your search / filters.";

    if (summaryEl) summaryEl.textContent = "My Library";
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.classList.remove("error");
    }
    return;
  }

  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = "library-card";

    const top = document.createElement("div");
    top.className = "library-card-top";

    const titleWrap = document.createElement("div");
    const titleEl = document.createElement("div");
    titleEl.className = "library-card-title";
    titleEl.textContent = item.title || "Untitled";
    titleWrap.appendChild(titleEl);

    const metaShort = document.createElement("div");
    metaShort.className = "library-card-meta";
    metaShort.textContent = `${item.exam || "—"} • ${
      item.subject || "—"
    } • ${item.year || "—"}`;
    titleWrap.appendChild(metaShort);

    top.appendChild(titleWrap);

    const chips = document.createElement("div");
    const ownedPill = document.createElement("span");
    ownedPill.className = "pill-owned";
    ownedPill.textContent = "Owned";
    chips.appendChild(ownedPill);

    const typePill = document.createElement("span");
    typePill.className = "pill-type";
    typePill.style.marginLeft = "0.25rem";
    typePill.textContent =
      item.itemType === "ebook" ? "E-Book" : "Question Paper";
    chips.appendChild(typePill);

    top.appendChild(chips);

    card.appendChild(top);

    if (item.description) {
      const desc = document.createElement("p");
      desc.style.fontSize = "0.82rem";
      desc.style.margin = "0.25rem 0 0.4rem";
      desc.style.color = "#374151";
      desc.textContent = item.description;
      card.appendChild(desc);
    }

    const footer = document.createElement("div");
    footer.className = "library-card-footer";

    const left = document.createElement("div");
    left.textContent = `Price: ${formatPriceNum(item.price)} • Reads: ${
      item.downloads || 0
    }`;
    footer.appendChild(left);

    const right = document.createElement("div");
    right.textContent = `Purchased: ${formatDate(item.orderedAt)}`;
    footer.appendChild(right);

    card.appendChild(footer);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.flexWrap = "wrap";
    btnRow.style.gap = "0.5rem";
    btnRow.style.marginTop = "0.55rem";

    const openBtn = document.createElement("a");
    openBtn.className = "btn small primary";
    openBtn.textContent = "Open in reader";
    openBtn.href = `/view/${slugify(item.title)}`;
    openBtn.target = "_blank";
    openBtn.rel = "noopener";
    btnRow.appendChild(openBtn);

    card.appendChild(btnRow);

    container.appendChild(card);
  });

  if (summaryEl) {
    summaryEl.textContent = `Showing ${filtered.length} of ${myLibraryItems.length} items in your library.`;
  }
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.classList.remove("error");
  }
}

async function loadMyLibrary() {
  const statusEl = document.getElementById("library-status");
  const summaryEl = document.getElementById("library-summary");
  if (summaryEl) summaryEl.textContent = "Loading your library…";

  try {
    const res = await fetch("/api/my-library", {
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    myLibraryItems = data.items || [];

    if (myLibraryItems.length === 0) {
      if (summaryEl) summaryEl.textContent = "My Library";
      if (statusEl) {
        statusEl.textContent =
          "You don’t have any materials yet. Unlock a paid PDF or open a free one to start building your library.";
        statusEl.classList.remove("error");
      }
      renderLibrary();
      return;
    }

    if (summaryEl) {
      summaryEl.textContent = `My Library (${myLibraryItems.length} items)`;
    }
    renderLibrary();
  } catch (err) {
    console.error("Error loading my library:", err);
    if (statusEl) {
      statusEl.textContent =
        "Failed to load your library. Please refresh or login again.";
      statusEl.classList.add("error");
    }
  }
}

function initLibraryFilters() {
  const searchInput = document.getElementById("library-search");
  const typeFilter = document.getElementById("library-type-filter");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderLibrary();
    });
  }
  if (typeFilter) {
    typeFilter.addEventListener("change", () => {
      renderLibrary();
    });
  }
}

// ------ INIT ------
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initLibraryFilters();
  loadMyLibrary();
});
