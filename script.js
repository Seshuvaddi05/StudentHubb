// script.js

let ebooks = [];
let questionPapers = [];

// ====== SLUGIFY (for /view/<slug> links) ======
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ====== HIGHLIGHT HELPERS (for search matches) ======
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

// ====== TOAST (Download notification) ======
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

// ====== CARD CREATION ======
function createCard(item, highlightTerms = []) {
  const article = document.createElement("article");
  article.className = "card";

  // Title row with NEW badge
  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";

  const h3 = document.createElement("h3");
  const titleText = item.title || "";
  h3.innerHTML = highlightText(titleText, highlightTerms);
  titleRow.appendChild(h3);

  // Show NEW if created within last 7 days
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

  article.appendChild(titleRow);

  const pDesc = document.createElement("p");
  const descText = item.description || "";
  pDesc.innerHTML = highlightText(descText, highlightTerms);
  article.appendChild(pDesc);

  const meta = document.createElement("p");
  meta.style = "font-size: 0.8rem; color: #6b7280; margin-bottom: 0.4rem;";
  meta.textContent = `Exam: ${item.exam || "—"} | Subject: ${
    item.subject || "—"
  } | Year: ${item.year || "—"}`;
  article.appendChild(meta);

  // DOWNLOAD COUNTER
  const dcount = document.createElement("p");
  dcount.style = "font-size: 0.8rem; color: #374151; margin-bottom: 0.6rem;";
  dcount.textContent = `Downloads: ${item.downloads || 0}`;
  article.appendChild(dcount);

  // Buttons row: Preview + Open page + Download
  const btnRow = document.createElement("div");
  btnRow.style = "display:flex; flex-wrap:wrap; gap:0.5rem;";

  // Preview in modal
  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn small secondary";
  previewBtn.textContent = "Preview";
  previewBtn.addEventListener("click", () => openPdfPreview(item));
  btnRow.appendChild(previewBtn);

  // Open dedicated /view/<slug> page
  const viewLink = document.createElement("a");
  viewLink.href = `/view/${slugify(item.title)}`;
  viewLink.target = "_blank";
  viewLink.rel = "noopener";
  viewLink.className = "btn small secondary";
  viewLink.textContent = "Open page";
  btnRow.appendChild(viewLink);

  // Download (with tracking)
  const link = document.createElement("a");
  link.href = `/api/download/${item.type}/${item.index}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "btn small primary";
  link.textContent = "Download";

  // 🔔 Show toast on download click
  link.addEventListener("click", () => {
    showToast("Download starting...");
  });

  btnRow.appendChild(link);

  article.appendChild(btnRow);

  return article;
}

// ====== RECENT CARD CREATION ======
function createRecentCard(item) {
  const article = document.createElement("article");
  article.className = "card";

  const tag = document.createElement("div");
  tag.className = "recent-card-tag";
  tag.textContent = item.type === "ebook" ? "E-Book" : "Question Paper";
  article.appendChild(tag);

  // Title row with NEW badge
  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";

  const h3 = document.createElement("h3");
  h3.textContent = item.title;
  titleRow.appendChild(h3);

  // Show NEW if created within last 7 days
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

  article.appendChild(titleRow);

  const pDesc = document.createElement("p");
  pDesc.textContent = item.description;
  article.appendChild(pDesc);

  const meta = document.createElement("p");
  meta.style = "font-size: 0.8rem; color: #6b7280; margin-bottom: 0.6rem;";
  meta.textContent = `Exam: ${item.exam || "—"} | Subject: ${
    item.subject || "—"
  } | Year: ${item.year || "—"}`;
  article.appendChild(meta);

  const btnRow = document.createElement("div");
  btnRow.style = "display:flex; flex-wrap:wrap; gap:0.5rem;";

  // Preview in modal
  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn small secondary";
  previewBtn.textContent = "Preview";
  previewBtn.addEventListener("click", () => openPdfPreview(item));
  btnRow.appendChild(previewBtn);

  // Open dedicated /view/<slug> page
  const viewLink = document.createElement("a");
  viewLink.href = `/view/${slugify(item.title)}`;
  viewLink.target = "_blank";
  viewLink.rel = "noopener";
  viewLink.className = "btn small secondary";
  viewLink.textContent = "Open page";
  btnRow.appendChild(viewLink);

  // Download (with tracking)
  const link = document.createElement("a");
  link.href = `/api/download/${item.type}/${item.index}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "btn small primary";
  link.textContent = "Download";

  // 🔔 Toast here too
  link.addEventListener("click", () => {
    showToast("Download starting...");
  });

  btnRow.appendChild(link);

  article.appendChild(btnRow);

  return article;
}

// ====== RENDER LISTS ======
function renderList(list, containerId, searchTerms = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  if (list.length === 0) {
    // Friendly empty state + "Request this material" button
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

    // Hook up the "Request" button
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
          // Only override if empty
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

// ====== RENDER RECENT (for Recent + Popular) ======
function renderRecent(items, containerId = "recent-list") {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = `<p style="color:#6b7280;">No materials found.</p>`;
    return;
  }

  items.forEach((item) => container.appendChild(createRecentCard(item)));
}

// ====== POPULATE DROPDOWNS ======
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

// ====== FILTER FUNCTION (multi-keyword search) ======
function filterItems(list, search, examFilter, yearFilter = "") {
  const q = search.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean); // ["ssc","2024"]

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

    // every word must appear somewhere
    const matchesSearch =
      terms.length === 0 || terms.every((t) => textLower.includes(t));

    const matchesExam = examFilter ? item.exam === examFilter : true;
    const matchesYear = yearFilter ? item.year === yearFilter : true;

    return matchesSearch && matchesExam && matchesYear;
  });
}

// ====== SORT FUNCTION ======
function sortItems(list, sortBy) {
  const arr = [...list];

  if (sortBy === "title") {
    arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  } else if (sortBy === "downloads") {
    arr.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  } else if (sortBy === "recent") {
    // sort by createdAt if available, fallback to original order (index descending)
    arr.sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (db !== da) return db - da;
      // fallback: newer index first
      return (b.index ?? 0) - (a.index ?? 0);
    });
  }

  return arr;
}

// ====== LOAD DATA FROM BACKEND ======
async function loadMaterials() {
  let ok = false;
  try {
    const res = await fetch("/api/materials");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    ebooks = data.ebooks || [];
    questionPapers = data.questionPapers || [];

    // Add type + index for download tracking + preview
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

// ====== BUILD RECENT ITEMS ======
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

// ====== MOST DOWNLOADED ======
function getMostDownloaded(limit = 6) {
  const combined = [...ebooks, ...questionPapers];
  combined.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  return combined.slice(0, limit);
}

// ====== THEME HANDLING ======
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

// ====== PDF PREVIEW MODAL ======
function openPdfPreview(item) {
  const modal = document.getElementById("pdf-modal");
  const frame = document.getElementById("pdf-modal-frame");
  const titleEl = document.getElementById("pdf-modal-title");
  if (!modal || !frame || !titleEl) return;

  frame.src = item.file; // direct file path
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

// ====== INIT ======
document.addEventListener("DOMContentLoaded", async () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // 🔹 Mobile nav toggle
  const navToggle = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
      navToggle.classList.toggle("open");
    });

    // Close menu when a link is clicked
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        navToggle.classList.remove("open");
      });
    });
  }

  // Theme initial load
  const savedTheme = localStorage.getItem("studenthub_theme") || "light";
  applyTheme(savedTheme);

  const themeToggleBtn = document.getElementById("theme-toggle");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const next = document.body.classList.contains("dark") ? "light" : "dark";
      applyTheme(next);
    });
  }

  // Load status bar
  const loadStatus = document.getElementById("load-status");
  if (loadStatus) {
    loadStatus.style.display = "block";
    loadStatus.classList.remove("error");
    loadStatus.textContent = "⏳ Loading materials...";
  }

  // PDF modal close handlers
  const modalCloseBtn = document.getElementById("pdf-modal-close");
  const modalBackdrop = document.querySelector(".pdf-modal-backdrop");
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closePdfPreview);
  }
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", closePdfPreview);
  }

  // ESC key closes modal
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") {
      closePdfPreview();
    }
  });

  // Load materials
  const ok = await loadMaterials();

  // Update load status based on result
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
      // hide after 3 seconds
      setTimeout(() => {
        loadStatus.style.display = "none";
      }, 3000);
    }
  }

  // Populate dropdowns
  populateDropdown(ebooks, "exam", "ebook-exam-filter");
  populateDropdown(questionPapers, "exam", "qp-exam-filter");
  populateDropdown(questionPapers, "year", "qp-year-filter");

  // Render lists (default: recent sort)
  const initialEbooksSorted = sortItems(ebooks, "recent");
  const initialQPsorted = sortItems(questionPapers, "recent");
  renderList(initialEbooksSorted, "ebooks-list");
  renderList(initialQPsorted, "qp-list");

  // Recently Added
  const recentItems = getRecentItems(6);
  renderRecent(recentItems, "recent-list");

  // Most Downloaded
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

  // ====== E-BOOK Filters + Sort + Summary ======
  const ebookSearch = document.getElementById("ebook-search");
  const ebookExam = document.getElementById("ebook-exam-filter");
  const ebookSort = document.getElementById("ebook-sort");

  // Create dynamic summary row under ebook filter bar
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

    if (searchVal) extras.push(`Search: "${searchVal}"`);
    if (examVal) extras.push(`Exam: ${examVal}`);
    if (sortVal && sortVal !== "recent") {
      const label = sortVal === "title" ? "Title A–Z" : "Most downloaded";
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

  function applyEbookFilters() {
    const searchVal = ebookSearch ? ebookSearch.value : "";
    const filtered = filterItems(
      ebooks,
      searchVal,
      ebookExam ? ebookExam.value : ""
    );
    const sorted = sortItems(filtered, ebookSort ? ebookSort.value : "recent");

    const terms = searchVal
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    renderList(sorted, "ebooks-list", terms);
    updateEbookFilterSummary(filtered.length);
  }

  function applyEebookFiltersWrapper() {
    applyEbookFilters();
  }

  if (ebookSearch) ebookSearch.addEventListener("input", applyEebookFiltersWrapper);
  if (ebookExam) ebookExam.addEventListener("change", applyEebookFiltersWrapper);
  if (ebookSort)
    ebookSort.addEventListener("change", () => {
      applyEbookFilters();
    });

  // Clear filters button for ebooks
  if (ebookClearBtn && ebookSearch && ebookExam && ebookSort) {
    ebookClearBtn.addEventListener("click", () => {
      ebookSearch.value = "";
      ebookExam.value = "";
      ebookSort.value = "recent";
      applyEbookFilters();
    });
  }

  // Initialize ebook summary once data is loaded
  updateEbookFilterSummary(ebooks.length);

  // ====== QUESTION PAPER Filters + Sort + Summary ======
  const qpSearch = document.getElementById("qp-search");
  const qpExam = document.getElementById("qp-exam-filter");
  const qpYear = document.getElementById("qp-year-filter");
  const qpSort = document.getElementById("qp-sort");

  // Dynamic summary row under question paper filter bar
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

    if (searchVal) extras.push(`Search: "${searchVal}"`);
    if (examVal) extras.push(`Exam: ${examVal}`);
    if (yearVal) extras.push(`Year: ${yearVal}`);
    if (sortVal && sortVal !== "recent") {
      const label = sortVal === "title" ? "Title A–Z" : "Most downloaded";
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

  function applyQPFilters() {
    const searchVal = qpSearch ? qpSearch.value : "";
    const filtered = filterItems(
      questionPapers,
      searchVal,
      qpExam ? qpExam.value : "",
      qpYear ? qpYear.value : ""
    );
    const sorted = sortItems(filtered, qpSort ? qpSort.value : "recent");

    const terms = searchVal
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    renderList(sorted, "qp-list", terms);
    updateQPFilterSummary(filtered.length);
  }

  if (qpSearch) qpSearch.addEventListener("input", applyQPFilters);
  if (qpExam) qpExam.addEventListener("change", applyQPFilters);
  if (qpYear) qpYear.addEventListener("change", applyQPFilters);
  if (qpSort) qpSort.addEventListener("change", applyQPFilters);

  // Clear filters for question papers
  if (qpClearBtn && qpSearch && qpExam && qpYear && qpSort) {
    qpClearBtn.addEventListener("click", () => {
      qpSearch.value = "";
      qpExam.value = "";
      qpYear.value = "";
      qpSort.value = "recent";
      applyQPFilters();
    });
  }

  // Initialize qp summary
  updateQPFilterSummary(questionPapers.length);

  // Back to top button
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

      if (targetId === "ebook-search") applyEbookFilters();
      else applyQPFilters();
    });
  });

  // --- Share StudentHub section ---
  const shareCopyBtn = document.getElementById("share-copy");
  const shareStatus = document.getElementById("share-status");
  const shareWhatsApp = document.getElementById("share-whatsapp");
  const shareTelegram = document.getElementById("share-telegram");
  const shareFacebook = document.getElementById("share-facebook");

  try {
    const siteUrl = window.location.origin + "/";
    const shareText =
      "Free E-Books & Previous Year Question Papers – StudentHub: " + siteUrl;

    // Update links dynamically
    if (shareWhatsApp) {
      shareWhatsApp.href =
        "https://wa.me/?text=" + encodeURIComponent(shareText);
    }

    if (shareTelegram) {
      shareTelegram.href =
        "https://t.me/share/url?url=" +
        encodeURIComponent(siteUrl) +
        "&text=" +
        encodeURIComponent("StudentHub – Free exam materials");
    }

    if (shareFacebook) {
      shareFacebook.href =
        "https://www.facebook.com/sharer/sharer.php?u=" +
        encodeURIComponent(siteUrl);
    }

    // Copy link button
    if (shareCopyBtn && shareStatus) {
      shareCopyBtn.addEventListener("click", async () => {
        const textToCopy = siteUrl;

        // Try modern clipboard API first
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
          // Not a secure context (e.g. 192.168.x.x) → fallback
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

  // ============================
  // Keyboard shortcut for search
  // ============================
  document.addEventListener("keydown", (e) => {
    // Don't trigger if user is already typing in a field
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

    // If only one search exists, just focus that
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
});
