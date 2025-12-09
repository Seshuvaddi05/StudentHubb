// read-later.js
// Read Later page: shows saved items in the same card style as homepage

let readLaterItems = [];
let ownedMaterialIds = new Set();

// ---------- helpers ----------
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatPrice(item) {
  const priceNum = Number(item.price) || 0;
  return priceNum > 0 ? `₹${priceNum}` : "Free";
}

function isPaidItem(item) {
  const priceNum = Number(item && item.price) || 0;
  return priceNum > 0;
}

function applyTheme(theme) {
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

// ---------- NAVBAR COUNT BADGES ----------
// Generic helper for creating / updating a yellow badge on a nav link
function setNavCountOnLink(link, count) {
  if (!link) return;

  let badge = link.querySelector(".nav-count-pill");

  if (count > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-count-pill";
      badge.style.marginLeft = "0.35rem";
      badge.style.padding = "0.05rem 0.4rem";
      badge.style.borderRadius = "999px";
      badge.style.fontSize = "0.7rem";
      badge.style.background = "#fbbf24";
      badge.style.color = "#111827";
      badge.style.fontWeight = "600";
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.style.justifyContent = "center";
    }
    badge.textContent = count > 99 ? "99+" : String(count);
    link.appendChild(badge);
  } else if (badge) {
    badge.remove();
  }
}

// On the Read Later page we ONLY show the Read Later count;
// any Library badge here is removed.
function updateNavCounts() {
  const rlCount = readLaterItems.length;

  // 1) Update ONLY the Read Later link(s)
  const rlLinks = document.querySelectorAll('a[href="/read-later.html"]');
  rlLinks.forEach((link) => setNavCountOnLink(link, rlCount));

  // 2) Remove/hide any Library badges on THIS page
  const libLinks = document.querySelectorAll('a[href="/library.html"]');
  libLinks.forEach((link) => {
    const badge = link.querySelector(".nav-count-pill");
    if (badge) badge.remove();
  });
}

// ---------- navbar mobile ----------
function initMobileNav() {
  const navToggle = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");

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

// ---------- owned materials (My Library) ----------
async function loadOwnedMaterials() {
  try {
    const res = await fetch("/api/my-library");
    if (!res.ok) return;

    const data = await res.json();
    const ids = (data.items || [])
      .map((it) => it.itemId || it.id)
      .filter(Boolean);

    ownedMaterialIds = new Set(ids);

    // Still call this so Library badges (if any) are stripped on this page
    updateNavCounts();
  } catch (err) {
    console.warn("Unable to load owned materials for Read Later:", err);
  }
}

function isOwned(item) {
  const id = item.itemId || item.id || item.materialId;
  if (!id) return false;
  return ownedMaterialIds.has(id);
}

// ---------- load read-later items ----------
async function loadReadLaterItems() {
  try {
    const res = await fetch("/api/read-later");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data && data.ok !== false && Array.isArray(data.items)) {
      readLaterItems = data.items;
    } else {
      readLaterItems = [];
    }
    updateNavCounts();
  } catch (err) {
    console.error("Error loading read-later items:", err);
    readLaterItems = [];
  }
}

// ---------- remove single item ----------
async function handleRemoveFromReadLater(materialId) {
  try {
    const res = await fetch("/api/read-later/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });

    if (!res.ok) {
      alert("Could not remove from Read Later. Please try again.");
      return;
    }

    const data = await res.json();
    if (data.ok === false) {
      alert(data.message || "Could not remove from Read Later.");
      return;
    }

    // Remove locally and re-render
    readLaterItems = readLaterItems.filter(
      (it) => (it.itemId || it.id || it.materialId) !== materialId
    );
    renderReadLater();
    updateNavCounts();
  } catch (err) {
    console.error("handleRemoveFromReadLater error:", err);
    alert("Error removing item from Read Later.");
  }
}

// ---------- clear all ----------
async function handleClearAllReadLater() {
  if (!readLaterItems.length) return;

  const confirmClear = confirm(
    "Remove all items from your Read Later list?"
  );
  if (!confirmClear) return;

  const ids = readLaterItems
    .map((it) => it.itemId || it.id || it.materialId)
    .filter(Boolean);

  try {
    await Promise.all(
      ids.map((materialId) =>
        fetch("/api/read-later/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ materialId }),
        }).catch(() => null)
      )
    );
  } catch (err) {
    console.error("Error while clearing read-later:", err);
  }

  readLaterItems = [];
  renderReadLater();
  updateNavCounts();
}

// ---------- card UI ----------
function createReadLaterCard(item) {
  const id = item.itemId || item.id || item.materialId;
  const type = item.itemType === "questionPaper" ? "Question Paper" : "E-Book";

  const article = document.createElement("article");
  article.className = "card";

  // Small type tag (E-Book / Question Paper)
  const typeTag = document.createElement("div");
  typeTag.className = "recent-card-tag";
  typeTag.textContent = type;
  article.appendChild(typeTag);

  // Title row
  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";

  const h3 = document.createElement("h3");
  h3.textContent = item.title || "";
  titleRow.appendChild(h3);

  // NEW badge if fresh
  if (item.createdAt) {
    const createdTime = new Date(item.createdAt).getTime();
    const now = Date.now();
    const diffDays = (now - createdTime) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      const badge = document.createElement("span");
      badge.className = "new-badge";
      badge.textContent = "NEW";
      titleRow.appendChild(badge);
    }
  }

  // OWNED badge if in library
  if (isOwned(item)) {
    const ownedBadge = document.createElement("span");
    ownedBadge.className = "new-badge";
    ownedBadge.style.background = "#059669";
    ownedBadge.textContent = "OWNED";
    titleRow.appendChild(ownedBadge);
  }

  // Price badge
  const priceSpan = document.createElement("span");
  priceSpan.className = "price-chip";
  priceSpan.textContent = formatPrice(item);
  titleRow.appendChild(priceSpan);

  article.appendChild(titleRow);

  // Description
  const pDesc = document.createElement("p");
  pDesc.textContent = item.description || "";
  article.appendChild(pDesc);

  // Meta (Exam | Subject | Year)
  const meta = document.createElement("p");
  meta.style = "font-size: 0.8rem; color: #6b7280; margin-bottom: 0.4rem;";
  meta.textContent = `Exam: ${item.exam || "—"} | Subject: ${
    item.subject || "—"
  } | Year: ${item.year || "—"}`;
  article.appendChild(meta);

  // Reads count
  const dcount = document.createElement("p");
  dcount.style = "font-size: 0.8rem; color: #374151; margin-bottom: 0.6rem;";
  dcount.textContent = `Reads: ${item.downloads || 0}`;
  article.appendChild(dcount);

  // Button row
  const btnRow = document.createElement("div");
  btnRow.style = "display:flex; flex-wrap:wrap; gap:0.5rem;";

  const readerUrl = `/view/${slugify(item.title || "read")}?id=${encodeURIComponent(
    id
  )}`;

  const readBtn = document.createElement("a");
  readBtn.href = readerUrl;
  readBtn.target = "_blank";
  readBtn.rel = "noopener";
  readBtn.className = "btn small primary";
  readBtn.textContent = "Read now";
  btnRow.appendChild(readBtn);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn small secondary";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => handleRemoveFromReadLater(id));
  btnRow.appendChild(removeBtn);

  article.appendChild(btnRow);

  return article;
}

// ---------- render with filters + stats ----------
function renderReadLater() {
  const list = document.getElementById("read-later-list");
  const empty = document.getElementById("read-later-empty");
  const summary = document.getElementById("read-later-summary");
  const clearBtn = document.getElementById("read-later-clear");
  const filtersRow = document.getElementById("read-later-filters");
  const statsEl = document.getElementById("read-later-stats");

  if (!list) return;

  // No items at all
  if (!readLaterItems.length) {
    list.innerHTML = "";
    if (empty) empty.style.display = "block";
    if (summary)
      summary.textContent =
        "No items saved yet. Use the 'Read later' button to save materials.";
    if (clearBtn) clearBtn.style.display = "none";
    if (filtersRow) filtersRow.style.display = "none";
    if (statsEl) statsEl.textContent = "";
    return;
  }

  if (empty) empty.style.display = "none";
  if (filtersRow) filtersRow.style.display = "flex";
  if (clearBtn) clearBtn.style.display = "inline-flex";

  // Read filters
  const typeSelect = document.getElementById("rl-type-filter");
  const priceSelect = document.getElementById("rl-price-filter");
  const sortSelect = document.getElementById("rl-sort");

  const typeVal = typeSelect ? typeSelect.value : "all";
  const priceVal = priceSelect ? priceSelect.value : "all";
  const sortVal = sortSelect ? sortSelect.value : "recent";

  let filtered = [...readLaterItems];

  // Type filter
  if (typeVal === "ebook") {
    filtered = filtered.filter((it) => it.itemType !== "questionPaper");
  } else if (typeVal === "questionPaper") {
    filtered = filtered.filter((it) => it.itemType === "questionPaper");
  }

  // Price filter
  if (priceVal === "free") {
    filtered = filtered.filter((it) => !isPaidItem(it));
  } else if (priceVal === "paid") {
    filtered = filtered.filter((it) => isPaidItem(it));
  }

  // Sorting
  filtered.sort((a, b) => {
    if (sortVal === "title") {
      return (a.title || "").localeCompare(b.title || "");
    }
    if (sortVal === "reads") {
      return (b.downloads || 0) - (a.downloads || 0);
    }
    // recent (default)
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });

  // Render list
  list.innerHTML = "";
  filtered.forEach((item) => {
    list.appendChild(createReadLaterCard(item));
  });

  // Summary text (filtered vs total)
  if (summary) {
    summary.textContent = `Showing ${filtered.length} of ${
      readLaterItems.length
    } item${readLaterItems.length === 1 ? "" : "s"} in Read Later.`;
  }

  // NEW: Stats (free / paid / total paid value) – based on ALL readLaterItems
  if (statsEl) {
    const total = readLaterItems.length;
    const freeCount = readLaterItems.filter((it) => !isPaidItem(it)).length;
    const paidCount = total - freeCount;
    const totalValue = readLaterItems.reduce((sum, it) => {
      if (!isPaidItem(it)) return sum;
      const p = Number(it.price) || 0;
      return sum + p;
    }, 0);

    if (total === 0) {
      statsEl.textContent = "";
    } else if (paidCount === 0) {
      statsEl.textContent = `All ${total} saved items are free.`;
    } else {
      statsEl.textContent = `Free: ${freeCount} • Paid: ${paidCount} • Value of paid items: ₹${totalValue}`;
    }
  }
}

// ---------- init ----------
document.addEventListener("DOMContentLoaded", async () => {
  // Year in footer
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // mobile nav + theme
  initMobileNav();

  const savedTheme = localStorage.getItem("studenthub_theme") || "light";
  applyTheme(savedTheme);

  const themeToggleBtn = document.getElementById("theme-toggle");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const next = document.body.classList.contains("dark") ? "light" : "dark";
      applyTheme(next);
    });
  }

  // back to top
  const backToTopBtn = document.getElementById("back-to-top");
  if (backToTopBtn) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 300) backToTopBtn.classList.add("show");
      else backToTopBtn.classList.remove("show");
    });
    backToTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Owned + Read Later data
  await loadOwnedMaterials();
  await loadReadLaterItems();
  renderReadLater();
  updateNavCounts();

  // Wire up "Clear all"
  const clearBtn = document.getElementById("read-later-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", handleClearAllReadLater);
  }

  // Wire up filters
  const typeSelect = document.getElementById("rl-type-filter");
  const priceSelect = document.getElementById("rl-price-filter");
  const sortSelect = document.getElementById("rl-sort");

  if (typeSelect) typeSelect.addEventListener("change", renderReadLater);
  if (priceSelect) priceSelect.addEventListener("change", renderReadLater);
  if (sortSelect) sortSelect.addEventListener("change", renderReadLater);
});
