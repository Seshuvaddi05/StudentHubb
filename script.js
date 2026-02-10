// script.js

// =============================
// GLOBAL STATE
// =============================
let ebooks = [];
let questionPapers = [];

// IDs of materials the user owns (purchased or library)
window.ownedMaterialIds = new Set();

// IDs of materials saved to read-later list
window.readLaterIds = new Set();


// Search history for recommendations (localStorage)
let searchHistory = [];

// We will attach these later inside DOMContentLoaded
window.applyEbookFilters = window.applyEbookFilters || null;
window.applyQPFilters = window.applyQPFilters || null;

// =============================
// UTIL: SLUGIFY
// =============================
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// =============================
// UTIL: HIGHLIGHT FOR SEARCH
// =============================
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, terms) {
  if (!terms || !terms.length || !text) return text;

  let result = text.toString();
  terms.forEach((t) => {
    if (!t) return;
    const pattern = new RegExp(`(${escapeRegExp(t)})`, "gi");
    result = result.replace(pattern, "<mark>$1</mark>");
  });
  return result;
}

// =============================
// TOAST
// =============================
let toastEl = null;
let toastTimer = null;

function showToast(message) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "download-toast";
    toastEl.style.position = "fixed";
    toastEl.style.left = "50%";
    toastEl.style.bottom = "1rem";
    toastEl.style.transform = "translateX(-50%)";
    toastEl.style.padding = "0.5rem 1rem";
    toastEl.style.borderRadius = "999px";
    toastEl.style.background = "rgba(15, 23, 42, 0.95)";
    toastEl.style.color = "#f9fafb";
    toastEl.style.fontSize = "0.85rem";
    toastEl.style.boxShadow = "0 8px 20px rgba(15, 23, 42, 0.6)";
    toastEl.style.opacity = "0";
    toastEl.style.pointerEvents = "none";
    toastEl.style.transition = "opacity 0.2s ease";
    toastEl.style.zIndex = "100";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.style.opacity = "1";

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.style.opacity = "0";
  }, 1800);
}

// =============================
// PRICE HELPERS
// =============================
function formatPrice(item) {
  if (!item) return "Free";
  const priceNum = Number(item.price) || 0;
  if (priceNum > 0) {
    return `₹${priceNum}`;
  }
  return "Free";
}

function createPriceBadge(item) {
  const span = document.createElement("span");
  span.className = "price-chip";
  span.textContent = formatPrice(item);
  return span;
}

function isPaidItem(item) {
  const priceNum = Number(item?.price) || 0;
  return priceNum > 0;
}

function isOwned(item) {
  if (!item || !item.id) return false;
  return ownedMaterialIds.has(item.id);
}

function isInReadLater(item) {
  if (!item || !item.id) return false;
  return readLaterIds.has(item.id);
}

// =============================
// CARD CREATION
// =============================
function createCard(item, highlightTerms = []) {
  const article = document.createElement("article");
  article.className = "card";

  // visually highlight owned materials
  if (isOwned(item)) {
    article.classList.add("card-owned");
  }

  // Title row with NEW badge + price + owned
  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";

  const h3 = document.createElement("h3");
  const titleText = item.title || "";
  h3.innerHTML = highlightText(titleText, highlightTerms);
  titleRow.appendChild(h3);

  // NEW badge
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

  // OWNED badge
  if (isOwned(item)) {
    const ownedBadge = document.createElement("span");
    ownedBadge.className = "new-badge";
    ownedBadge.style.background = "#059669";
    ownedBadge.textContent = "OWNED";
    titleRow.appendChild(ownedBadge);
  }

  // Price badge
  titleRow.appendChild(createPriceBadge(item));

  article.appendChild(titleRow);

  const pDesc = document.createElement("p");
  const descText = item.description || "";
  pDesc.innerHTML = highlightText(descText, highlightTerms);
  article.appendChild(pDesc);

  const meta = document.createElement("p");
  meta.style = "font-size: 0.8rem; color: #6b7280; margin-bottom: 0.4rem;";
  meta.textContent = `Exam: ${item.exam || "—"} | Subject: ${item.subject || "—"
    } | Year: ${item.year || "—"}`;
  article.appendChild(meta);

  // READ COUNTER
  const dcount = document.createElement("p");
  dcount.style = "font-size: 0.8rem; color: #374151; margin-bottom: 0.6rem;";
  dcount.textContent = `Reads: ${item.downloads || 0}`;
  article.appendChild(dcount);

  // Buttons row
  const btnRow = document.createElement("div");
  btnRow.className = "card-actions";


  // Quick preview
  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn small secondary";
  previewBtn.textContent = "Quick preview";
  previewBtn.addEventListener("click", () => openPdfPreview(item));
  btnRow.appendChild(previewBtn);

  // Reader / Buy button logic
  if (isPaidItem(item) && !isOwned(item)) {
    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "btn small primary";
    buyBtn.textContent = `Buy ₹${item.price}`;
    buyBtn.addEventListener("click", () => {
      buyPdf(item.id, item.price);
    });
    btnRow.appendChild(buyBtn);
  } else {
    const viewLink = document.createElement("a");
    viewLink.href = `/view/${slugify(item.title)}?id=${encodeURIComponent(
      item.id
    )}`;
    viewLink.target = "_blank";
    viewLink.rel = "noopener";
    viewLink.className = "btn small primary";
    viewLink.textContent = isOwned(item) ? "Read again" : "Open reader";
    btnRow.appendChild(viewLink);
  }

  // Add to Library (only for FREE items, and only if not already owned)
  if (!isPaidItem(item) && !isOwned(item)) {
    const libBtn = document.createElement("button");
    libBtn.type = "button";
    libBtn.className = "btn small secondary";
    libBtn.textContent = "Add to library";
    libBtn.addEventListener("click", () => handleAddToLibrary(item));
    btnRow.appendChild(libBtn);
  } else if (isOwned(item)) {
    const inLibTag = document.createElement("button");
    inLibTag.type = "button";
    inLibTag.disabled = true;
    inLibTag.className = "btn small secondary";
    inLibTag.style.opacity = "0.8";
    inLibTag.textContent = "In your library";
    btnRow.appendChild(inLibTag);
  }

  // Read later toggle
  const readLaterBtn = document.createElement("button");
  readLaterBtn.type = "button";
  readLaterBtn.className = "btn small secondary";
  updateReadLaterButton(readLaterBtn, item);
  readLaterBtn.addEventListener("click", () => handleToggleReadLater(item));
  btnRow.appendChild(readLaterBtn);

  article.appendChild(btnRow);

  return article;
}

function updateReadLaterButton(btn, item) {
  if (!btn) return;
  if (isInReadLater(item)) {
    btn.textContent = "Saved for later";
    btn.style.opacity = "0.9";
  } else {
    btn.textContent = "Read later";
    btn.style.opacity = "1";
  }
}

// =============================
// RECENT CARD CREATION
// =============================
function createRecentCard(item) {
  const article = document.createElement("article");
  article.className = "card";

  if (isOwned(item)) {
    article.classList.add("card-owned");
  }

  const tag = document.createElement("div");
  tag.className = "recent-card-tag";
  tag.textContent = item.type === "ebook" ? "E-Book" : "Question Paper";
  article.appendChild(tag);

  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";

  const h3 = document.createElement("h3");
  h3.textContent = item.title;
  titleRow.appendChild(h3);

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

  if (isOwned(item)) {
    const ownedBadge = document.createElement("span");
    ownedBadge.className = "new-badge";
    ownedBadge.style.background = "#059669";
    ownedBadge.textContent = "OWNED";
    titleRow.appendChild(ownedBadge);
  }

  titleRow.appendChild(createPriceBadge(item));
  article.appendChild(titleRow);

  const pDesc = document.createElement("p");
  pDesc.textContent = item.description;
  article.appendChild(pDesc);

  const meta = document.createElement("p");
  meta.style = "font-size: 0.8rem; color: #6b7280; margin-bottom: 0.6rem;";
  meta.textContent = `Exam: ${item.exam || "—"} | Subject: ${item.subject || "—"
    } | Year: ${item.year || "—"}`;
  article.appendChild(meta);

  const btnRow = document.createElement("div");
  btnRow.className = "card-actions";


  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn small secondary";
  previewBtn.textContent = "Quick preview";
  previewBtn.addEventListener("click", () => openPdfPreview(item));
  btnRow.appendChild(previewBtn);

  const viewLink = document.createElement("a");
  viewLink.href = `/view/${slugify(item.title)}?id=${encodeURIComponent(
    item.id
  )}`;
  viewLink.target = "_blank";
  viewLink.rel = "noopener";
  viewLink.className = "btn small primary";
  viewLink.textContent = isOwned(item) ? "Read again" : "Open reader";
  btnRow.appendChild(viewLink);

  article.appendChild(btnRow);

  return article;
}

// =============================
// RENDER LISTS
// =============================
function renderList(list, containerId, searchTerms = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  if (list.length === 0) {
    let searchTerm = "";
    let contextLabel = "material";

    if (containerId === "ebooks-list") {
      const input = document.getElementById("ebook-search");
      if (input) searchTerm = input.value.trim();
      contextLabel = "e-book";
    } else if (containerId === "qp-list") {
      const input = document.getElementById("qp-search");
      if (input) searchTerm = input.value.trim();
      contextLabel = "question paper";
    }

    const safeTerm = searchTerm ? ` for "${searchTerm}"` : "";
    const btnId = `empty-request-btn-${containerId}`;

    container.innerHTML = `
      <div class="card" style="border:1px dashed #d1d5db; background:#f9fafb; text-align:left; padding:1rem; border-radius:0.75rem;">
        <h3 style="font-size:1rem; margin-bottom:0.3rem;">No materials found${safeTerm}.</h3>
        <p style="font-size:0.85rem; color:#6b7280; margin-bottom:0.6rem;">
          You can request this ${contextLabel}, and we’ll try to add it soon.
        </p>
        <button type="button" id="${btnId}" class="btn small primary">
          Request this ${contextLabel}
        </button>
      </div>
    `;

    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener("click", () => {
        const form = document.getElementById("request-form");
        const typeSelect = document.getElementById("req-type");
        const examInput = document.getElementById("req-exam");
        const detailsInput = document.getElementById("req-details");

        if (typeSelect) {
          if (containerId === "ebooks-list") typeSelect.value = "E-Book";
          else if (containerId === "qp-list") typeSelect.value = "Question Paper";
        }

        if (examInput && searchTerm) {
          examInput.value = searchTerm;
        }

        if (detailsInput && searchTerm) {
          const base = `Looking for a ${contextLabel} related to: ${searchTerm}`;
          if (!detailsInput.value.trim()) {
            detailsInput.value = base;
          }
        }

        const contactSection = document.getElementById("contact");
        if (contactSection) {
          contactSection.scrollIntoView({ behavior: "smooth" });
        } else if (form) {
          form.scrollIntoView({ behavior: "smooth" });
        }

        const nameInput = document.getElementById("req-name");
        if (nameInput) {
          setTimeout(() => nameInput.focus(), 300);
        }
      });
    }

    return;
  }

  list.forEach((item) =>
    container.appendChild(createCard(item, searchTerms))
  );
}

// =============================
// RENDER RECENT / POPULAR
// =============================
function renderRecent(items, containerId = "recent-list") {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<p style="font-size:0.95rem; color:#6b7280; margin-bottom:0.6rem;">No materials found.</p>`;
    return;
  }

  items.forEach((item) => container.appendChild(createRecentCard(item)));
}

// =============================
// DROPDOWN POPULATE
// =============================
function populateDropdown(list, field, dropdownId) {
  const dropdown = document.getElementById(dropdownId);
  if (!dropdown) return;

  while (dropdown.options.length > 1) {
    dropdown.remove(1);
  }

  const values = [...new Set(list.map((item) => item[field]).filter(Boolean))];

  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    dropdown.appendChild(opt);
  });
}

// =============================
// FILTER FUNCTION
// =============================
function filterItems(list, search, examFilter, yearFilter = "") {
  const q = search.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  return list.filter((item) => {
    const text =
      (item.title || "") +
      " " +
      (item.description || "") +
      " " +
      (item.exam || "") +
      " " +
      (item.subject || "") +
      " " +
      (item.year || "");

    const textLower = text.toLowerCase();

    const matchesSearch =
      terms.length === 0 || terms.every((t) => textLower.includes(t));

    const matchesExam = examFilter ? item.exam === examFilter : true;
    const matchesYear = yearFilter ? item.year === yearFilter : true;

    return matchesSearch && matchesExam && matchesYear;
  });
}

// =============================
// SORT FUNCTION
// =============================
function sortItems(list, sortBy) {
  const arr = [...list];

  if (sortBy === "title") {
    arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  } else if (sortBy === "downloads") {
    arr.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  } else if (sortBy === "recent") {
    arr.sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (db !== da) return db - da;
      return (b.index ?? 0) - (a.index ?? 0);
    });
  }

  return arr;
}

// =============================
// BACKEND LOADERS
// =============================
async function loadMaterials() {
  let ok = false;
  try {
    const res = await fetch("/api/materials");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    ebooks = data.ebooks || [];
    questionPapers = data.questionPapers || [];

    // Add type + index
    ebooks = ebooks.map((item, i) => ({ ...item, type: "ebook", index: i }));
    questionPapers = questionPapers.map((item, i) => ({
      ...item,
      type: "questionPaper",
      index: i,
    }));

    ok = true;
  } catch (err) {
    console.error("Error loading materials:", err);
    ebooks = [];
    questionPapers = [];
  }
  return ok;
}

async function loadOwnedMaterials() {
  try {
    const res = await fetch("/api/my-library");
    if (!res.ok) return; // not logged in or route unavailable
    const data = await res.json();
    if (!data || data.ok === false || !Array.isArray(data.items)) return;

    const ids = data.items
      .map((item) => item.itemId || item.id)
      .filter(Boolean);
    ownedMaterialIds = new Set(ids);
  } catch (err) {
    console.warn("Unable to load owned materials:", err);
  }
}

async function loadReadLater() {
  try {
    const res = await fetch("/api/read-later");
    if (!res.ok) return;
    const data = await res.json();
    const ids =
      data.ids ||
      (Array.isArray(data.items)
        ? data.items.map((it) => it.itemId || it.id)
        : []);
    readLaterIds = new Set(ids.filter(Boolean));
  } catch (err) {
    console.warn("Unable to load read-later list:", err);
  }
}

// =============================
// NAVBAR COUNTS (My Library + Read Later)
// =============================
function updateNavbarCounts() {
  const libraryLink =
    document.querySelector('a[href="/library.html"]') ||
    document.querySelector('a[href="library.html"]');
  const readLaterLink =
    document.querySelector('a[href="/read-later.html"]') ||
    document.querySelector('a[href="read-later.html"]');

  const libraryCount = ownedMaterialIds.size || 0;
  const readLaterCount = readLaterIds.size || 0;

  function ensureBadge(link) {
    if (!link) return null;
    let badge = link.querySelector(".nav-count-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-count-badge";
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.style.justifyContent = "center";
      badge.style.marginLeft = "0.35rem";
      badge.style.minWidth = "1.1rem";
      badge.style.padding = "0 0.35rem";
      badge.style.borderRadius = "999px";
      badge.style.fontSize = "0.7rem";
      badge.style.fontWeight = "600";
      badge.style.backgroundColor = "#facc15"; // yellow pill
      badge.style.color = "#111827";
      badge.style.boxShadow = "0 0 0 1px rgba(0,0,0,0.04)";
      link.appendChild(badge);
    }
    return badge;
  }

  const libBadge = ensureBadge(libraryLink);
  const rlBadge = ensureBadge(readLaterLink);

  if (libBadge) {
    if (libraryCount > 0) {
      libBadge.textContent = String(libraryCount);
      libBadge.style.visibility = "visible";
    } else {
      libBadge.textContent = "";
      libBadge.style.visibility = "hidden";
    }
  }

  if (rlBadge) {
    if (readLaterCount > 0) {
      rlBadge.textContent = String(readLaterCount);
      rlBadge.style.visibility = "visible";
    } else {
      rlBadge.textContent = "";
      rlBadge.style.visibility = "hidden";
    }
  }
}

// =============================
// RECENT & POPULAR BUILDERS
// =============================
function getRecentItems(limit = 6) {
  const combined = [];

  ebooks.forEach((item) => combined.push({ ...item }));
  questionPapers.forEach((item) => combined.push({ ...item }));

  combined.sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });

  return combined.slice(0, limit);
}

function getMostDownloaded(limit = 6) {
  const combined = [...ebooks, ...questionPapers];
  combined.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  return combined.slice(0, limit);
}

// =============================
// THEME
// =============================
// =============================
// GLOBAL THEME (FINAL CLEAN)
// =============================
function applyTheme(isLight) {
  const body = document.body;
  const toggleBtn = document.getElementById("theme-toggle");

  if (!body) return;

  body.classList.toggle("light", isLight);

  if (toggleBtn) {
    toggleBtn.textContent = isLight ? "🌙" : "☀️";
  }

  localStorage.setItem("studenthub_theme", isLight ? "light" : "dark");
}

// =============================
// AUTH NAVBAR HELPER
// =============================
async function fetchCurrentUser() {
  try {
    const res = await fetch("/api/auth/me", {
      credentials: "include"
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok || !data.user) return null;
    return data.user;
  } catch (err) {
    console.warn("Unable to fetch current user:", err);
    return null;
  }
}

async function initAuthNavbar() {
  let authLink =
    document.getElementById("nav-auth-link") ||
    document.querySelector("[data-auth-link]") ||
    document.querySelector('a[href*="login.html"]');

  if (!authLink) return;

  const user = await fetchCurrentUser();

  if (user) {
    authLink.textContent = "My dashboard";
    authLink.href = "/dashboard.html";
  } else {
    authLink.textContent = "Sign in";
    authLink.href = "/login.html";
  }
}

// =============================
// PDF PREVIEW MODAL
// =============================
function openPdfPreview(item) {
  if (isPaidItem(item)) {
    const readerUrl = `/view/${slugify(item.title)}?id=${encodeURIComponent(
      item.id
    )}`;
    alert("This is a paid PDF. Opening the reader so you can unlock it.");
    window.open(readerUrl, "_blank", "noopener");
    return;
  }

  const modal = document.getElementById("pdf-modal");
  const frame = document.getElementById("pdf-modal-frame");
  const titleEl = document.getElementById("pdf-modal-title");
  if (!modal || !frame || !titleEl) return;

  frame.src = item.file;
  titleEl.textContent = item.title || "PDF Preview";
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closePdfPreview() {
  const modal = document.getElementById("pdf-modal");
  const frame = document.getElementById("pdf-modal-frame");
  if (!modal || !frame) return;

  modal.classList.remove("show");
  frame.src = "";
  document.body.style.overflow = "";
}

// =============================
// LIBRARY & READ-LATER ACTIONS
// =============================
async function handleAddToLibrary(item) {
  if (!item || !item.id) return;

  try {
    const res = await fetch("/api/library/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId: item.id }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        showToast("Please sign in to save items to your library.");
      } else {
        showToast("Could not add to library. Try again.");
      }
      return;
    }

    const data = await res.json();
    if (data.ok === false) {
      showToast(data.message || "Could not add to library.");
      return;
    }

    ownedMaterialIds.add(item.id);
    showToast("Added to your library.");
    refreshAllSections();
  } catch (err) {
    console.error("handleAddToLibrary error:", err);
    showToast("Error adding to library.");
  }
}

async function handleToggleReadLater(item) {
  if (!item || !item.id) return;
  const currentlySaved = isInReadLater(item);
  const endpoint = currentlySaved
    ? "/api/read-later/remove"
    : "/api/read-later/add";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId: item.id }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        showToast("Please sign in to use Read Later.");
      } else {
        showToast("Could not update Read Later.");
      }
      return;
    }

    const data = await res.json();
    if (data.ok === false) {
      showToast(data.message || "Could not update Read Later.");
      return;
    }

    if (currentlySaved) {
      readLaterIds.delete(item.id);
      showToast("Removed from Read Later.");
    } else {
      readLaterIds.add(item.id);
      showToast("Saved to Read Later.");
    }

    refreshAllSections();
  } catch (err) {
    console.error("handleToggleReadLater error:", err);
    showToast("Error updating Read Later.");
  }
}

// Safely refresh UI sections after state changes
function refreshAllSections() {
  // Re-apply filters & re-render sections so Owned/Read-later UI updates
  if (typeof window.applyEbookFilters === "function") {
    window.applyEbookFilters();
  }
  if (typeof window.applyQPFilters === "function") {
    window.applyQPFilters();
  }

  const recentItems = getRecentItems(6);
  renderRecent(recentItems, "recent-list");

  const popularItems = getMostDownloaded(6);
  renderRecent(popularItems, "popular-list");

  renderRecommendations();
  updateNavbarCounts();
}

// =============================
// SEARCH HISTORY & RECOMMENDATIONS
// =============================
function loadSearchHistory() {
  try {
    const raw = localStorage.getItem("studenthub_search_history");
    if (!raw) {
      searchHistory = [];
      return;
    }
    const parsed = JSON.parse(raw);
    searchHistory = Array.isArray(parsed) ? parsed : [];
  } catch {
    searchHistory = [];
  }
}

function saveSearchHistory() {
  try {
    localStorage.setItem(
      "studenthub_search_history",
      JSON.stringify(searchHistory.slice(-20))
    );
  } catch {
    // ignore
  }
}

function trackSearch(term) {
  const t = term.trim().toLowerCase();
  if (!t || t.length < 3) return;
  searchHistory.push(t);
  searchHistory = searchHistory.slice(-20);
  saveSearchHistory();
}

function buildRecommendations(limit = 6) {
  const combined = [...ebooks, ...questionPapers];
  if (!combined.length) return [];

  const historyText = searchHistory.join(" ");
  const historyTerms = historyText.split(/\s+/).filter(Boolean);

  const scored = combined.map((item) => {
    let score = 0;

    if (isOwned(item)) score += 4;
    if (isInReadLater(item)) score += 3;

    if (item.downloads) {
      score += Math.min(item.downloads, 200) / 40; // up to +5
    }

    if (item.createdAt) {
      const days =
        (Date.now() - new Date(item.createdAt).getTime()) /
        (1000 * 60 * 60 * 24);
      if (days < 7) score += 2;
      else if (days < 30) score += 1;
    }

    const combinedText = `${item.exam || ""} ${item.subject || ""} ${item.title || ""
      }`.toLowerCase();

    historyTerms.forEach((t) => {
      if (!t) return;
      if (combinedText.includes(t)) score += 0.8;
    });

    return { item, score };
  });

  const filtered = scored.filter((x) => x.score > 0.5);
  filtered.sort((a, b) => b.score - a.score);

  return filtered.slice(0, limit).map((x) => x.item);
}

function renderRecommendations() {
  const container =
    document.getElementById("reco-list") ||
    document.getElementById("recommended-list");
  const summary = document.getElementById("reco-summary");

  if (!container) return;

  const recos = buildRecommendations(6);
  container.innerHTML = "";

  if (!recos.length) {
    container.innerHTML =
      '<p style="color:#6b7280; font-size:0.9rem;">Start searching or opening PDFs and we’ll show smart recommendations here.</p>';
    if (summary) summary.textContent = "No recommendations yet.";
    return;
  }

  recos.forEach((item) => container.appendChild(createRecentCard(item)));

  if (summary) {
    summary.textContent =
      "Recommended for you based on your searches, reads and library.";
  }
}

// =============================
// SMART SEARCH SUGGESTIONS
// =============================
function initSearchSuggestions() {
  const ebookSearch = document.getElementById("ebook-search");
  const qpSearch = document.getElementById("qp-search");

  const allItemsSupplier = () => [...ebooks, ...questionPapers];

  function setupSuggestForInput(config) {
    const { input, mode } = config;
    if (!input) return;

    const parent = input.parentElement || input;
    parent.style.position = "relative";

    const box = document.createElement("div");
    box.className = "suggest-box";
    box.id = `${mode}-suggest-box`;
    parent.appendChild(box);

    function hideBox() {
      box.style.display = "none";
      box.innerHTML = "";
    }

    function showSuggestions(value) {
      const q = value.trim().toLowerCase();
      if (!q || q.length < 2) {
        hideBox();
        return;
      }

      const items = allItemsSupplier();
      const tokens = new Set();

      items.forEach((item) => {
        [item.title, item.exam, item.subject, item.year].forEach((field) => {
          if (!field) return;
          field
            .toString()
            .split(/\s+/)
            .forEach((w) => {
              const clean = w.toLowerCase();
              if (clean.length >= 3) tokens.add(clean);
            });
        });
      });

      searchHistory.forEach((term) => {
        term
          .split(/\s+/)
          .filter((x) => x.length >= 3)
          .forEach((x) => tokens.add(x));
      });

      const candidates = Array.from(tokens);

      const scored = candidates
        .map((t) => {
          let score = 0;
          if (t.startsWith(q)) score += 3;
          else if (t.includes(q)) score += 1;

          let usage = 0;
          items.forEach((item) => {
            const full = `${item.exam || ""} ${item.subject || ""}`.toLowerCase();
            if (full.includes(t)) usage += 1;
          });
          score += Math.min(usage, 5) * 0.2;

          return { text: t, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 7);

      if (!scored.length) {
        hideBox();
        return;
      }

      box.innerHTML = "";
      scored.forEach(({ text }) => {
        const itemEl = document.createElement("div");
        itemEl.className = "suggest-item";
        const regex = new RegExp(escapeRegExp(q), "i");
        const highlighted = text.replace(regex, (m) => `<strong>${m}</strong>`);
        itemEl.innerHTML = highlighted;
        itemEl.addEventListener("click", () => {
          input.value = text;
          hideBox();
          if (mode === "ebook") window.applyEbookFilters?.();
          else window.applyQPFilters?.();
        });
        box.appendChild(itemEl);
      });

      box.style.display = "block";
    }

    input.addEventListener("input", (e) => {
      showSuggestions(e.target.value || "");
    });

    input.addEventListener("focus", (e) => {
      if (e.target.value && e.target.value.length >= 2) {
        showSuggestions(e.target.value);
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hideBox();
        input.blur();
      } else if (e.key === "Enter") {
        hideBox();
      }
    });

    document.addEventListener("click", (e) => {
      if (!box.contains(e.target) && e.target !== input) {
        hideBox();
      }
    });
  }

  setupSuggestForInput({ input: ebookSearch, mode: "ebook" });
  setupSuggestForInput({ input: qpSearch, mode: "qp" });
}

// =============================
// INIT
// =============================
document.addEventListener("DOMContentLoaded", async () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // Mobile nav
  // =============================
  // MOBILE SIDEBAR TOGGLE (FINAL)
  // =============================
  const navToggle = document.getElementById("nav-toggle");
  const sidebar = document.querySelector(".sidebar");

  if (navToggle && sidebar) {
    navToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      navToggle.classList.toggle("open");
    });

    // auto close when clicking any sidebar link
    sidebar.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        sidebar.classList.remove("open");
        navToggle.classList.remove("open");
      });
    });
  }
  // Theme
  // =============================
  // THEME INIT
  // =============================
  const savedTheme = localStorage.getItem("studenthub_theme");
  const isLight = savedTheme === "light";

  applyTheme(isLight);

  const themeToggleBtn = document.getElementById("theme-toggle");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const nextIsLight = !document.body.classList.contains("light");
      applyTheme(nextIsLight);
    });
  }


  // Auth navbar
  initAuthNavbar();

  // Search history
  loadSearchHistory();

  // Load status
  const loadStatus = document.getElementById("load-status");
  if (loadStatus) {
    loadStatus.style.display = "block";
    loadStatus.classList.remove("error");
    loadStatus.textContent = "⏳ Loading materials...";
  }

  // PDF modal events
  const modalCloseBtn = document.getElementById("pdf-modal-close");
  const modalBackdrop = document.querySelector(".pdf-modal-backdrop");
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closePdfPreview);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closePdfPreview);
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") closePdfPreview();
  });

  // =============================
  // Show skeleton loaders FIRST
  // =============================
  const ebookList = document.getElementById("ebooks-list");
  const qpList = document.getElementById("qp-list");

  if (ebookList) {
    ebookList.innerHTML = `
    <div class="skeleton"></div>
    <div class="skeleton"></div>
    <div class="skeleton"></div>
  `;
  }

  if (qpList) {
    qpList.innerHTML = `
    <div class="skeleton"></div>
    <div class="skeleton"></div>
    <div class="skeleton"></div>
  `;
  }

  // 1) Load materials
  const ok = await loadMaterials();

  // 2) Load owned + read-later (if logged in)
  await loadOwnedMaterials();
  await loadReadLater();

  // Initial navbar counts
  updateNavbarCounts();

  // Update load status
  if (loadStatus) {
    if (!ok) {
      loadStatus.classList.add("error");
      loadStatus.textContent =
        "⚠️ Unable to load materials. Please check if the server is running.";
    } else if (!ebooks.length && !questionPapers.length) {
      loadStatus.classList.remove("error");
      loadStatus.textContent =
        "ℹ️ No materials found yet. Use the upload section to add PDFs.";
    } else {
      loadStatus.classList.remove("error");
      loadStatus.textContent = `✅ Loaded ${ebooks.length} e-books and ${questionPapers.length} question papers.`;
      setTimeout(() => {
        loadStatus.style.display = "none";
      }, 3000);
    }
  }

  // Populate dropdowns
  populateDropdown(ebooks, "exam", "ebook-exam-filter");
  populateDropdown(questionPapers, "exam", "qp-exam-filter");
  populateDropdown(questionPapers, "year", "qp-year-filter");

  // Render main lists
  const initialEbooksSorted = sortItems(ebooks, "recent");
  const initialQPsorted = sortItems(questionPapers, "recent");
  renderList(initialEbooksSorted, "ebooks-list");
  renderList(initialQPsorted, "qp-list");

  // Recent & Popular
  const recentItems = getRecentItems(6);
  renderRecent(recentItems, "recent-list");

  const popularItems = getMostDownloaded(6);
  renderRecent(popularItems, "popular-list");

  // Stats
  const ebooksLen = ebooks.length;
  const qpLen = questionPapers.length;
  const totalLen = ebooksLen + qpLen;

  const ebooksCountEl = document.getElementById("ebooks-count");
  const qpCountEl = document.getElementById("qp-count");
  const totalCountEl = document.getElementById("total-count");
  const ebooksStatEl = document.getElementById("ebooks-count-stat");
  const qpStatEl = document.getElementById("qp-count-stat");

  if (ebooksCountEl) ebooksCountEl.textContent = `(${ebooksLen})`;
  if (qpCountEl) qpCountEl.textContent = `(${qpLen})`;
  if (totalCountEl) totalCountEl.textContent = totalLen.toString();
  if (ebooksStatEl) ebooksStatEl.textContent = ebooksLen.toString();
  if (qpStatEl) qpStatEl.textContent = qpLen.toString();

  // ====== E-BOOK Filters + Sort + Summary + Price filter ======
  const ebookSearch = document.getElementById("ebook-search");
  const ebookExam = document.getElementById("ebook-exam-filter");
  const ebookSort = document.getElementById("ebook-sort");
  const ebookPriceFilter = document.getElementById("ebook-price-filter"); // "all", "free", "paid"

  let ebookSummaryText = null;
  let ebookClearBtn = null;
  const ebookSection = document.getElementById("ebooks");
  if (ebookSection) {
    const bar = ebookSection.querySelector(".filter-bar");
    if (bar && bar.parentNode) {
      const row = document.createElement("div");
      row.style =
        "margin:0.2rem 0 0.75rem; font-size:0.8rem; color:#6b7280; display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem;";

      ebookSummaryText = document.createElement("span");
      ebookSummaryText.id = "ebook-filter-summary";
      ebookSummaryText.textContent = "Showing all e-books.";

      ebookClearBtn = document.createElement("button");
      ebookClearBtn.type = "button";
      ebookClearBtn.id = "ebook-clear-filters";
      ebookClearBtn.className = "chip";
      ebookClearBtn.textContent = "Clear filters";
      ebookClearBtn.style.display = "none";

      row.appendChild(ebookSummaryText);
      row.appendChild(ebookClearBtn);
      bar.parentNode.insertBefore(row, bar.nextSibling);
    }
  }

  function updateEbookFilterSummary(filteredCount = ebooks.length) {
    if (!ebookSummaryText || !ebookClearBtn) return;

    const extras = [];
    const searchVal = ebookSearch ? ebookSearch.value.trim() : "";
    const examVal = ebookExam ? ebookExam.value : "";
    const sortVal = ebookSort ? ebookSort.value : "recent";
    const priceVal = ebookPriceFilter ? ebookPriceFilter.value : "all";

    if (searchVal) extras.push(`Search: "${searchVal}"`);
    if (examVal) extras.push(`Exam: ${examVal}`);
    if (priceVal === "free") extras.push("Free only");
    if (priceVal === "paid") extras.push("Paid only");
    if (sortVal && sortVal !== "recent") {
      const label = sortVal === "title" ? "Title A–Z" : "Most read";
      extras.push(`Sort: ${label}`);
    }

    const base = `Showing ${filteredCount} of ${ebooks.length} e-books`;

    if (extras.length === 0) {
      ebookSummaryText.textContent = base + ".";
      ebookClearBtn.style.display = "none";
    } else {
      ebookSummaryText.textContent = base + " • " + extras.join(" • ");
      ebookClearBtn.style.display = "inline-flex";
    }
  }

  // Make filters globally callable
  window.applyEbookFilters = function () {
    const searchVal = ebookSearch ? ebookSearch.value : "";
    const examVal = ebookExam ? ebookExam.value : "";
    const sortVal = ebookSort ? ebookSort.value : "recent";
    const priceVal = ebookPriceFilter ? ebookPriceFilter.value : "all";

    if (searchVal) trackSearch(searchVal);

    let filtered = filterItems(ebooks, searchVal, examVal);

    if (priceVal === "free") {
      filtered = filtered.filter((item) => !isPaidItem(item));
    } else if (priceVal === "paid") {
      filtered = filtered.filter((item) => isPaidItem(item));
    }

    const sorted = sortItems(filtered, sortVal);

    const terms = searchVal
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    renderList(sorted, "ebooks-list", terms);
    updateEbookFilterSummary(filtered.length);
    renderRecommendations();
  };

  if (ebookSearch)
    ebookSearch.addEventListener("input", () => window.applyEbookFilters());
  if (ebookExam)
    ebookExam.addEventListener("change", () => window.applyEbookFilters());
  if (ebookSort)
    ebookSort.addEventListener("change", () => window.applyEbookFilters());
  if (ebookPriceFilter)
    ebookPriceFilter.addEventListener("change", () => window.applyEbookFilters());

  if (ebookClearBtn && ebookSearch && ebookExam && ebookSort) {
    ebookClearBtn.addEventListener("click", () => {
      ebookSearch.value = "";
      ebookExam.value = "";
      ebookSort.value = "recent";
      if (ebookPriceFilter) ebookPriceFilter.value = "all";
      window.applyEbookFilters();
    });
  }

  updateEbookFilterSummary(ebooks.length);

  // ====== QUESTION PAPER Filters + Sort + Summary + Price filter ======
  const qpSearch = document.getElementById("qp-search");
  const qpExam = document.getElementById("qp-exam-filter");
  const qpYear = document.getElementById("qp-year-filter");
  const qpSort = document.getElementById("qp-sort");
  const qpPriceFilter = document.getElementById("qp-price-filter");

  let qpSummaryText = null;
  let qpClearBtn = null;
  const qpSection = document.getElementById("question-papers");
  if (qpSection) {
    const bar2 = qpSection.querySelector(".filter-bar");
    if (bar2 && bar2.parentNode) {
      const row2 = document.createElement("div");
      row2.style =
        "margin:0.2rem 0 0.75rem; font-size:0.8rem; color:#6b7280; display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem;";

      qpSummaryText = document.createElement("span");
      qpSummaryText.id = "qp-filter-summary";
      qpSummaryText.textContent = "Showing all question papers.";

      qpClearBtn = document.createElement("button");
      qpClearBtn.type = "button";
      qpClearBtn.id = "qp-clear-filters";
      qpClearBtn.className = "chip";
      qpClearBtn.textContent = "Clear filters";
      qpClearBtn.style.display = "none";

      row2.appendChild(qpSummaryText);
      row2.appendChild(qpClearBtn);
      bar2.parentNode.insertBefore(row2, bar2.nextSibling);
    }
  }

  function updateQPFilterSummary(filteredCount = questionPapers.length) {
    if (!qpSummaryText || !qpClearBtn) return;

    const extras = [];
    const searchVal = qpSearch ? qpSearch.value.trim() : "";
    const examVal = qpExam ? qpExam.value : "";
    const yearVal = qpYear ? qpYear.value : "";
    const sortVal = qpSort ? qpSort.value : "recent";
    const priceVal = qpPriceFilter ? qpPriceFilter.value : "all";

    if (searchVal) extras.push(`Search: "${searchVal}"`);
    if (examVal) extras.push(`Exam: ${examVal}`);
    if (yearVal) extras.push(`Year: ${yearVal}`);
    if (priceVal === "free") extras.push("Free only");
    if (priceVal === "paid") extras.push("Paid only");
    if (sortVal && sortVal !== "recent") {
      const label = sortVal === "title" ? "Title A–Z" : "Most read";
      extras.push(`Sort: ${label}`);
    }

    const base = `Showing ${filteredCount} of ${questionPapers.length} question papers`;

    if (extras.length === 0) {
      qpSummaryText.textContent = base + ".";
      qpClearBtn.style.display = "none";
    } else {
      qpSummaryText.textContent = base + " • " + extras.join(" • ");
      qpClearBtn.style.display = "inline-flex";
    }
  }

  window.applyQPFilters = function () {
    const searchVal = qpSearch ? qpSearch.value : "";
    const examVal = qpExam ? qpExam.value : "";
    const yearVal = qpYear ? qpYear.value : "";
    const sortVal = qpSort ? qpSort.value : "recent";
    const priceVal = qpPriceFilter ? qpPriceFilter.value : "all";

    if (searchVal) trackSearch(searchVal);

    let filtered = filterItems(questionPapers, searchVal, examVal, yearVal);

    if (priceVal === "free") {
      filtered = filtered.filter((item) => !isPaidItem(item));
    } else if (priceVal === "paid") {
      filtered = filtered.filter((item) => isPaidItem(item));
    }

    const sorted = sortItems(filtered, sortVal);

    const terms = searchVal
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    renderList(sorted, "qp-list", terms);
    updateQPFilterSummary(filtered.length);
    renderRecommendations();
  };

  if (qpSearch) qpSearch.addEventListener("input", window.applyQPFilters);
  if (qpExam) qpExam.addEventListener("change", window.applyQPFilters);
  if (qpYear) qpYear.addEventListener("change", window.applyQPFilters);
  if (qpSort) qpSort.addEventListener("change", window.applyQPFilters);
  if (qpPriceFilter)
    qpPriceFilter.addEventListener("change", window.applyQPFilters);

  if (qpClearBtn && qpSearch && qpExam && qpYear && qpSort) {
    qpClearBtn.addEventListener("click", () => {
      qpSearch.value = "";
      qpExam.value = "";
      qpYear.value = "";
      qpSort.value = "recent";
      if (qpPriceFilter) qpPriceFilter.value = "all";
      window.applyQPFilters();
    });
  }

  updateQPFilterSummary(questionPapers.length);

  // Back to top
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

  // Request Form
  const requestForm = document.getElementById("request-form");
  if (requestForm) {
    requestForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = document.getElementById("req-name").value.trim();
      const email = document.getElementById("req-email").value.trim();
      const type = document.getElementById("req-type").value;
      const exam = document.getElementById("req-exam").value.trim();
      const details = document.getElementById("req-details").value.trim();

      if (!name || !email || !type || !exam || !details) {
        alert("Please fill all fields before sending your request.");
        return;
      }

      const to = "seshuvaddi03@gmail.com";
      const subject = encodeURIComponent(
        `[StudentHub Request] ${type} - ${exam}`
      );
      const body = encodeURIComponent(
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Material Type: ${type}\n` +
        `Exam / Subject: ${exam}\n\n` +
        `Requested Details:\n${details}\n\n` +
        `Sent from StudentHub website.`
      );

      const mailtoLink = `mailto:${to}?subject=${subject}&body=${body}`;
      window.location.href = mailtoLink;
    });
  }

  // Quick filter chips
  const chips = document.querySelectorAll(".chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const targetId = chip.getAttribute("data-target");
      const text = chip.getAttribute("data-text") || "";
      const input = document.getElementById(targetId);
      if (!input) return;

      input.value = text;

      if (targetId === "ebook-search") window.applyEbookFilters?.();
      else window.applyQPFilters?.();
    });
  });

  // Share section
  const shareCopyBtn = document.getElementById("share-copy");
  const shareStatus = document.getElementById("share-status");
  const shareWhatsApp = document.getElementById("share-whatsapp");
  const shareTelegram = document.getElementById("share-telegram");
  const shareFacebook = document.getElementById("share-facebook");

  try {
    const siteUrl = window.location.origin + "/";
    const shareText =
      "Free & premium E-Books & Previous Year Question Papers – StudentHub: " +
      siteUrl;

    if (shareWhatsApp) {
      shareWhatsApp.href =
        "https://wa.me/?text=" + encodeURIComponent(shareText);
    }

    if (shareTelegram) {
      shareTelegram.href =
        "https://t.me/share/url?url=" +
        encodeURIComponent(siteUrl) +
        "&text=" +
        encodeURIComponent("StudentHub – Free & paid exam materials");
    }

    if (shareFacebook) {
      shareFacebook.href =
        "https://www.facebook.com/sharer/sharer.php?u=" +
        encodeURIComponent(siteUrl);
    }

    if (shareCopyBtn && shareStatus) {
      shareCopyBtn.addEventListener("click", async () => {
        const textToCopy = siteUrl;

        if (navigator.clipboard && window.isSecureContext) {
          try {
            await navigator.clipboard.writeText(textToCopy);
            shareStatus.textContent =
              "Link copied! You can paste it anywhere.";
          } catch (err) {
            console.warn("Clipboard API failed, falling back:", err);
            fallbackCopy(textToCopy, shareStatus);
          }
        } else {
          fallbackCopy(textToCopy, shareStatus);
        }

        setTimeout(() => {
          shareStatus.textContent = "";
        }, 3000);
      });
    }
  } catch (err) {
    console.error("Error initializing share buttons:", err);
  }

  function fallbackCopy(textToCopy, statusEl) {
    const dummy = document.createElement("input");
    dummy.value = textToCopy;
    document.body.appendChild(dummy);
    dummy.select();
    try {
      document.execCommand("copy");
      if (statusEl) {
        statusEl.textContent =
          "Link copied! You can paste it anywhere.";
      }
    } catch (err2) {
      console.error("execCommand copy failed:", err2);
      if (statusEl) {
        statusEl.textContent =
          "Unable to copy. Please copy the link from the address bar.";
      }
    }
    document.body.removeChild(dummy);
  }

  // Keyboard shortcut for search
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const tag = active && active.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      active?.isContentEditable
    ) {
      return;
    }

    const isSlash = e.key === "/";
    const isGlobalSearch = e.ctrlKey && e.key.toLowerCase() === "k";

    if (!isSlash && !isGlobalSearch) return;

    e.preventDefault();

    const ebookSectionEl = document.getElementById("ebooks");
    const qpSectionEl = document.getElementById("question-papers");
    const ebookSearchInput = document.getElementById("ebook-search");
    const qpSearchInput = document.getElementById("qp-search");

    if (!ebookSearchInput && !qpSearchInput) return;

    if (!ebookSectionEl || !qpSectionEl || !ebookSearchInput || !qpSearchInput) {
      const targetInput = ebookSearchInput || qpSearchInput;
      targetInput.focus();
      targetInput.select();
      return;
    }

    const scrollY = window.scrollY || window.pageYOffset;
    const ebookTop = ebookSectionEl.offsetTop;
    const qpTop = qpSectionEl.offsetTop;
    const midPoint = (ebookTop + qpTop) / 2;

    if (scrollY < midPoint) {
      ebookSearchInput.focus();
      ebookSearchInput.select();
    } else {
      qpSearchInput.focus();
      qpSearchInput.select();
    }
  });

  /* =====================================
   🔔 Notifications (Navbar)
   ===================================== */

  document.addEventListener("DOMContentLoaded", () => {
    const notifBtn = document.getElementById("notifBtn");
    const notifCount = document.getElementById("notifCount");
    const notifDropdown = document.getElementById("notifDropdown");
    const notifList = document.getElementById("notifList");
    const notifReadAll = document.getElementById("notifReadAll");


    // If navbar doesn't have notification UI, exit safely
    if (!notifBtn || !notifDropdown || !notifList) return;

    // ---------------------------
    // Load notifications
    // ---------------------------
    async function loadNotifications() {
      try {
        const res = await fetch("/api/notifications", {
          credentials: "include",
        });

        if (!res.ok) return;

        const data = await res.json();
        const notifications = Array.isArray(data.notifications)
          ? data.notifications
          : [];

        renderNotifications(notifications);
      } catch (err) {
        console.warn("Notification load failed:", err);
      }
    }

    // ---------------------------
    // Render list + badge
    // ---------------------------
    function renderNotifications(list) {
      notifList.innerHTML = "";

      if (!list.length) {
        notifList.innerHTML =
          `<li class="empty">No notifications yet</li>`;
        notifCount.style.display = "none";
        return;
      }

      const unread = list.filter((n) => !n.read).length;

      if (unread > 0) {
        notifCount.textContent = unread;
        notifCount.style.display = "inline-block";
      } else {
        notifCount.style.display = "none";
      }

      list.forEach((n) => {
        const li = document.createElement("li");

        // 🔥 TYPE-BASED STYLING (STEP 1.2)
        li.className = `notif-item notif-${n.type || "info"} ${n.read ? "" : "unread"
          }`;

        const time = n.createdAt
          ? new Date(n.createdAt).toLocaleString()
          : "";

        li.innerHTML = `
    <div>${n.message || ""}</div>
    <div style="font-size:0.7rem;opacity:0.7;margin-top:2px;">
      ${time}
    </div>
  `;
        li.addEventListener("click", () => markAsRead(n._id, li));
        notifList.appendChild(li);
      });
    }

    // ---------------------------
    // Mark notification as read
    // ---------------------------
    async function markAsRead(id, li) {
      try {
        await fetch(`/api/notifications/${id}/read`, {
          method: "POST",
          credentials: "include",
        });

        li.classList.remove("unread");

        // Update badge count
        const current = parseInt(notifCount.textContent || "0", 10);
        if (current > 1) {
          notifCount.textContent = current - 1;
        } else {
          notifCount.style.display = "none";
        }
      } catch (err) {
        console.warn("Failed to mark notification read", err);
      }
    }



    async function markAllAsRead() {
      try {
        await fetch("/api/notifications/read-all", {
          method: "POST",
          credentials: "include",
        });

        // Remove unread styling instantly
        document.querySelectorAll("#notifList li.unread")
          .forEach(li => li.classList.remove("unread"));

        notifCount.style.display = "none";
      } catch (err) {
        console.warn("Failed to mark all as read", err);
      }
    }

    // ---------------------------
    // Toggle dropdown
    // ---------------------------
    notifBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle("hidden");
    });

    // Close when clicking outside
    document.addEventListener("click", () => {
      notifDropdown.classList.add("hidden");
    });

    notifDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Initial load
    loadNotifications();

    // ---------------------------
    // Auto refresh notifications (every 30s)
    // ---------------------------
    setInterval(() => {
      loadNotifications();
    }, 30000); // 30 seconds

  });

  // Initialize suggestions & recommendations
  initSearchSuggestions();
  renderRecommendations();

  /* =================================================
   🌟 PRO UI POLISH (adds premium feel)
================================================= */

  /* ---------- Smooth section reveal ---------- */
  const sections = document.querySelectorAll(".section");

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("show");
          revealObserver.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  sections.forEach((s) => revealObserver.observe(s));


  /* ---------- Navbar shadow on scroll ---------- */
  const navbar = document.querySelector(".navbar");

  window.addEventListener("scroll", () => {
    if (!navbar) return;

    if (window.scrollY > 10) {
      navbar.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";
    } else {
      navbar.style.boxShadow = "0 2px 10px rgba(0,0,0,0.15)";
    }
  });


  /* ---------- Animated stats counters ---------- */
  function animateCounter(el, target) {
    let start = 0;
    const duration = 700;
    const step = Math.ceil(target / (duration / 16));

    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        el.textContent = target;
        clearInterval(timer);
      } else {
        el.textContent = start;
      }
    }, 16);
  }

  ["total-count", "ebooks-count-stat", "qp-count-stat"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) animateCounter(el, parseInt(el.textContent || "0", 10));
  });


  /* ---------- Page fade-in ---------- */
  document.body.style.opacity = "0";
  setTimeout(() => {
    document.body.style.transition = "opacity 0.35s ease";
    document.body.style.opacity = "1";
  }, 50);

});


// ================================
// RAZORPAY BUY PDF FUNCTION
// ================================
async function buyPdf(pdfId, price) {
  const res = await fetch("/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // 🔥 VERY IMPORTANT (cookies auth)
    body: JSON.stringify({ pdfId, amount: price }),
  });

  const data = await res.json();

  if (!data.success) {
    alert("Unable to start payment");
    return;
  }

  const options = {
    key: data.key,
    amount: data.amount,
    currency: "INR",
    name: "StudentHub",
    description: "PDF Purchase",
    order_id: data.orderId,

    handler: async function (response) {
      const verifyRes = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          paymentId: data.paymentId,
        }),
      });

      const verifyData = await verifyRes.json();

      if (verifyData.success) {
        alert("Payment Successful!");
        window.location.reload(); // or redirect to library
      } else {
        alert("Payment verification failed");
      }
    },
  };

  const rzp = new Razorpay(options);
  rzp.open();
}

