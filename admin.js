// admin.js
// Admin upload + list + search + delete for StudentHub

(function () {
  const BASE_URL = window.location.origin;

  const uploadForm = document.getElementById("upload-form");
  const uploadStatus = document.getElementById("upload-status");

  const materialsSearch = document.getElementById("materials-search");
  const materialsTypeFilter = document.getElementById("materials-type-filter");
  const materialsTableBody = document.getElementById("materials-table-body");
  const materialsListStatus = document.getElementById("materials-list-status");

  const themeToggleBtn = document.getElementById("theme-toggle");

  // local in-memory list: each item = { id, title, exam, year, price, downloads, type, index }
  let allMaterials = [];

  // -----------------------------
  // Theme toggle (same behaviour as main site)
  // -----------------------------
  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("dark");
      if (themeToggleBtn) themeToggleBtn.textContent = "☀️";
    } else {
      document.body.classList.remove("dark");
      if (themeToggleBtn) themeToggleBtn.textContent = "🌙";
    }
  }

  function initTheme() {
    const saved = localStorage.getItem("studenthub-theme") || "light";
    applyTheme(saved);

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", () => {
        const nowDark = !document.body.classList.contains("dark");
        const next = nowDark ? "dark" : "light";
        localStorage.setItem("studenthub-theme", next);
        applyTheme(next);
      });
    }
  }

  // -----------------------------
  // Upload handling
  // -----------------------------
  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadForm) return;

    uploadStatus.textContent = "";
    uploadStatus.style.color = "";

    const type = document.getElementById("type").value;
    const title = document.getElementById("title").value.trim();
    const description = document.getElementById("description").value.trim();
    const exam = document.getElementById("exam").value.trim();
    const subject = document.getElementById("subject").value.trim();
    const year = document.getElementById("year").value.trim();
    const priceInput = document.getElementById("price");
    const isPaidCheckbox = document.getElementById("isPaid");
    const fileInput = document.getElementById("file");

    if (!title || !fileInput.files.length) {
      uploadStatus.textContent = "Title and PDF file are required.";
      uploadStatus.style.color = "#b91c1c";
      return;
    }

    let price = 0;
    const rawPrice = Number(priceInput.value || "0");
    if (isPaidCheckbox.checked) {
      if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
        uploadStatus.textContent =
          "For paid material, please enter a price greater than 0.";
        uploadStatus.style.color = "#b91c1c";
        return;
      }
      price = rawPrice;
    }

    const formData = new FormData();
    formData.append("type", type);
    formData.append("title", title);
    formData.append("description", description);
    formData.append("exam", exam);
    formData.append("subject", subject);
    formData.append("year", year);
    formData.append("price", String(price));
    formData.append("file", fileInput.files[0]);

    uploadStatus.textContent = "Uploading...";
    uploadStatus.style.color = "";

    try {
      const res = await fetch(`${BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      uploadStatus.textContent = "Uploaded successfully!";
      uploadStatus.style.color = "#16a34a";

      // Clear form
      uploadForm.reset();
      priceInput.value = "";
      isPaidCheckbox.checked = false;

      // Refresh materials list so admin can see new item
      await fetchMaterials();
    } catch (err) {
      console.error("Upload error:", err);
      uploadStatus.textContent =
        "Upload failed: " + (err.message || "Unexpected error");
      uploadStatus.style.color = "#b91c1c";
    }
  }

  // -----------------------------
  // Fetch & render materials
  // -----------------------------
  async function fetchMaterials() {
    if (!materialsTableBody) return;

    materialsTableBody.innerHTML = "";
    if (materialsListStatus) {
      materialsListStatus.textContent = "Loading materials…";
      materialsListStatus.classList.add("muted");
    }

    try {
      const res = await fetch(`${BASE_URL}/api/materials`);
      if (!res.ok) throw new Error("Failed to load materials");
      const data = await res.json();

      const list = [];
      const ebooks = Array.isArray(data.ebooks) ? data.ebooks : [];
      const qps = Array.isArray(data.questionPapers) ? data.questionPapers : [];

      // Store index from each type array so we can call DELETE /api/materials/:type/:index
      ebooks.forEach((m, idx) => {
        list.push({
          id: m.id,
          title: m.title || "",
          exam: m.exam || "",
          year: m.year || "—",
          price: typeof m.price === "number" ? m.price : 0,
          downloads: m.downloads || 0,
          type: "ebook",
          typeLabel: "E-Book",
          index: idx,
        });
      });

      qps.forEach((m, idx) => {
        list.push({
          id: m.id,
          title: m.title || "",
          exam: m.exam || "",
          year: m.year || "—",
          price: typeof m.price === "number" ? m.price : 0,
          downloads: m.downloads || 0,
          type: "questionPaper",
          typeLabel: "Question Paper",
          index: idx,
        });
      });

      allMaterials = list;
      renderMaterials();
    } catch (err) {
      console.error("Fetch materials error:", err);
      if (materialsListStatus) {
        materialsListStatus.textContent =
          "Failed to load materials. Please refresh the page.";
        materialsListStatus.classList.remove("muted");
        materialsListStatus.style.color = "#b91c1c";
      }
    }
  }

  function renderMaterials() {
    if (!materialsTableBody) return;

    const searchTerm = (materialsSearch?.value || "").toLowerCase().trim();
    const typeFilter = materialsTypeFilter?.value || "";

    let filtered = allMaterials.slice();

    if (typeFilter) {
      filtered = filtered.filter((m) => m.type === typeFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter((m) => {
        const text =
          `${m.title} ${m.exam} ${m.year}`.toLowerCase();
        return text.includes(searchTerm);
      });
    }

    materialsTableBody.innerHTML = "";

    if (!filtered.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.textContent = "No materials found.";
      materialsTableBody.appendChild(tr);
      tr.appendChild(td);

      if (materialsListStatus) {
        materialsListStatus.textContent = "No materials match your filters.";
        materialsListStatus.classList.remove("muted");
        materialsListStatus.style.color = "#6b7280";
      }
      return;
    }

    filtered.forEach((m, i) => {
      const tr = document.createElement("tr");

      const priceLabel = m.price > 0 ? `₹${m.price}` : "Free";

      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${m.title}</td>
        <td><span class="admin-pill">${m.typeLabel}</span></td>
        <td>${m.exam || "—"}</td>
        <td>${m.year || "—"}</td>
        <td>${priceLabel}</td>
        <td>${m.downloads}</td>
        <td>
          <button
            class="btn-danger"
            data-action="delete"
            data-type="${m.type}"
            data-index="${m.index}"
          >
            Delete
          </button>
        </td>
      `;

      materialsTableBody.appendChild(tr);
    });

    if (materialsListStatus) {
      materialsListStatus.textContent = `${filtered.length} material(s) shown.`;
      materialsListStatus.classList.add("muted");
      materialsListStatus.style.color = "";
    }
  }

  // -----------------------------
  // Delete handler (event delegation)
  // -----------------------------
  async function handleTableClick(e) {
    const btn = e.target.closest("button[data-action='delete']");
    if (!btn) return;

    const type = btn.getAttribute("data-type");
    const indexStr = btn.getAttribute("data-index");
    const index = Number(indexStr);

    if (!type || Number.isNaN(index)) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this material? This cannot be undone."
    );
    if (!confirmed) return;

    btn.disabled = true;
    const oldLabel = btn.textContent;
    btn.textContent = "Deleting…";

    try {
      const res = await fetch(
        `${BASE_URL}/api/materials/${encodeURIComponent(type)}/${index}`,
        { method: "DELETE" }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Delete failed");
      }

      await fetchMaterials();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete material: " + (err.message || "Unexpected error"));
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  }

  // -----------------------------
  // Init
  // -----------------------------
  function init() {
    initTheme();

    if (uploadForm) {
      uploadForm.addEventListener("submit", handleUpload);
    }

    if (materialsSearch) {
      materialsSearch.addEventListener("input", () => renderMaterials());
    }
    if (materialsTypeFilter) {
      materialsTypeFilter.addEventListener("change", () => renderMaterials());
    }
    if (materialsTableBody) {
      materialsTableBody.addEventListener("click", handleTableClick);
    }

    fetchMaterials();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
