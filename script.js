// script.js

let ebooks = [];
let questionPapers = [];

// ====== CARD CREATION ======
function createCard(item) {
  const article = document.createElement("article");
  article.className = "card";

  const h3 = document.createElement("h3");
  h3.textContent = item.title;
  article.appendChild(h3);

  const pDesc = document.createElement("p");
  pDesc.textContent = item.description;
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

  // Buttons row: Preview + Download
  const btnRow = document.createElement("div");
  btnRow.style = "display:flex; flex-wrap:wrap; gap:0.5rem;";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn small secondary";
  previewBtn.textContent = "Preview";
  previewBtn.addEventListener("click", () => openPdfPreview(item));
  btnRow.appendChild(previewBtn);

  const link = document.createElement("a");
  link.href = `/api/download/${item.type}/${item.index}`;
  link.target = "_blank";
  link.className = "btn small primary";
  link.textContent = "Download";
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

  const h3 = document.createElement("h3");
  h3.textContent = item.title;
  article.appendChild(h3);

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

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "btn small secondary";
  previewBtn.textContent = "Preview";
  previewBtn.addEventListener("click", () => openPdfPreview(item));
  btnRow.appendChild(previewBtn);

  const link = document.createElement("a");
  link.href = `/api/download/${item.type}/${item.index}`;
  link.target = "_blank";
  link.className = "btn small primary";
  link.textContent = "Download";
  btnRow.appendChild(link);

  article.appendChild(btnRow);

  return article;
}

// ====== RENDER LISTS ======
function renderList(list, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "";

  if (list.length === 0) {
    container.innerHTML = `<p style="color:#6b7280;">No items found.</p>`;
    return;
  }

  list.forEach((item) => container.appendChild(createCard(item)));
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

// ====== FILTER FUNCTION ======
function filterItems(list, search, examFilter, yearFilter = "") {
  const q = search.trim().toLowerCase();

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

    const matchesSearch = text.toLowerCase().includes(q);
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

  // EBOOK Filters + Sort
  const ebookSearch = document.getElementById("ebook-search");
  const ebookExam = document.getElementById("ebook-exam-filter");
  const ebookSort = document.getElementById("ebook-sort");

  function applyEbookFilters() {
    const filtered = filterItems(ebooks, ebookSearch.value, ebookExam.value);
    const sorted = sortItems(filtered, ebookSort.value);
    renderList(sorted, "ebooks-list");
  }

  ebookSearch.addEventListener("input", applyEbookFilters);
  ebookExam.addEventListener("change", applyEbookFilters);
  ebookSort.addEventListener("change", applyEbookFilters);

  // QUESTION PAPER Filters + Sort
  const qpSearch = document.getElementById("qp-search");
  const qpExam = document.getElementById("qp-exam-filter");
  const qpYear = document.getElementById("qp-year-filter");
  const qpSort = document.getElementById("qp-sort");

  function applyQPFilters() {
    const filtered = filterItems(
      questionPapers,
      qpSearch.value,
      qpExam.value,
      qpYear.value
    );
    const sorted = sortItems(filtered, qpSort.value);
    renderList(sorted, "qp-list");
  }

  qpSearch.addEventListener("input", applyQPFilters);
  qpExam.addEventListener("change", applyQPFilters);
  qpYear.addEventListener("change", applyQPFilters);
  qpSort.addEventListener("change", applyQPFilters);

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
});
