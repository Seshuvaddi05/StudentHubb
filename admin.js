// admin.js
// Handles admin upload, materials listing, search, delete

(function () {
  const BASE_URL = window.location.origin;

  // Upload page elements
  const uploadForm = document.getElementById("upload-form");
  const uploadStatus = document.getElementById("upload-status");

  // Materials page elements
  const materialsSearch = document.getElementById("materials-search");
  const materialsTypeFilter = document.getElementById("materials-type-filter");
  const materialsTableBody = document.getElementById("materials-table-body");
  const materialsListStatus = document.getElementById("materials-list-status");

  // Local cache of all materials
  let allMaterials = [];

  // -----------------------------
  // THEME CONTROL
  // -----------------------------
  function applyTheme(theme) {
    const btn = document.getElementById("theme-toggle");
    if (theme === "dark") {
      document.body.classList.add("dark");
      if (btn) btn.textContent = "☀️";
    } else {
      document.body.classList.remove("dark");
      if (btn) btn.textContent = "🌙";
    }
    localStorage.setItem("studenthub-theme", theme);
  }

  function initTheme() {
    applyTheme(localStorage.getItem("studenthub-theme") || "light");
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const next = document.body.classList.contains("dark") ? "light" : "dark";
        applyTheme(next);
      });
    }
  }

  // -----------------------------
  // ADMIN UPLOAD HANDLING
  // -----------------------------
  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadForm) return;

    uploadStatus.textContent = "Uploading…";
    uploadStatus.style.color = "";

    const type = document.getElementById("type").value;
    const title = document.getElementById("title").value.trim();
    const description = document.getElementById("description").value.trim();
    const exam = document.getElementById("exam").value.trim();
    const subject = document.getElementById("subject").value.trim();
    const year = document.getElementById("year").value.trim();
    const isPaid = document.getElementById("isPaid").checked;
    const priceRaw = Number(document.getElementById("price").value || 0);
    const fileInput = document.getElementById("file");

    if (!title || !fileInput.files.length) {
      uploadStatus.textContent = "Title and PDF file are required.";
      uploadStatus.style.color = "#b91c1c";
      return;
    }

    let price = 0;
    if (isPaid) {
      if (priceRaw <= 0 || !Number.isFinite(priceRaw)) {
        uploadStatus.textContent = "Please enter a valid price.";
        uploadStatus.style.color = "#b91c1c";
        return;
      }
      price = priceRaw;
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

    try {
      const res = await fetch(`${BASE_URL}/api/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");

      uploadStatus.textContent = "Uploaded successfully!";
      uploadStatus.style.color = "#16a34a";
      uploadForm.reset();

      fetchMaterials();
    } catch (err) {
      uploadStatus.textContent = "Upload failed: " + err.message;
      uploadStatus.style.color = "#b91c1c";
    }
  }

  // -----------------------------
  // FETCH MATERIALS
  // -----------------------------
  async function fetchMaterials() {
    if (!materialsTableBody) return;

    materialsTableBody.innerHTML =
      `<tr><td colspan="8">Loading materials…</td></tr>`;
    materialsListStatus.textContent = "Loading materials…";

    try {
      const res = await fetch(`${BASE_URL}/api/materials`, {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok) throw new Error("Failed to load");

      allMaterials = [];

      (data.ebooks || []).forEach((m) => {
        allMaterials.push({
          id: m.id, // ✅ MongoDB ID
          type: "ebook",
          typeLabel: "E-Book",
          title: m.title || "",
          exam: m.exam || "",
          year: m.year || "",
          price: m.price || 0,
          downloads: m.downloads || 0,
        });
      });

      (data.questionPapers || []).forEach((m) => {
        allMaterials.push({
          id: m.id, // ✅ MongoDB ID
          type: "questionPaper",
          typeLabel: "Question Paper",
          title: m.title || "",
          exam: m.exam || "",
          year: m.year || "",
          price: m.price || 0,
          downloads: m.downloads || 0,
        });
      });

      renderMaterials();
    } catch (err) {
      console.error(err);
      materialsTableBody.innerHTML =
        `<tr><td colspan="8" style="color:#b91c1c;">Failed to load materials.</td></tr>`;
      materialsListStatus.textContent = "Failed to load materials.";
    }
  }

  // -----------------------------
  // RENDER TABLE
  // -----------------------------
  function renderMaterials() {
    let filtered = [...allMaterials];
    const search = (materialsSearch?.value || "").toLowerCase().trim();
    const typeFilter = materialsTypeFilter?.value || "";

    if (typeFilter) filtered = filtered.filter(m => m.type === typeFilter);
    if (search) {
      filtered = filtered.filter(m =>
        `${m.title} ${m.exam} ${m.year}`.toLowerCase().includes(search)
      );
    }

    if (!filtered.length) {
      materialsTableBody.innerHTML =
        `<tr><td colspan="8">No materials found.</td></tr>`;
      return;
    }

    materialsTableBody.innerHTML = "";

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
          <button class="btn-danger"
            data-action="delete"
            data-type="${m.type}"
            data-id="${m.id}">
            Delete
          </button>
        </td>
      `;
      materialsTableBody.appendChild(tr);
    });
  }

  // -----------------------------
  // DELETE MATERIAL (FIXED)
  // -----------------------------
  async function handleDelete(e) {
    const btn = e.target.closest("button[data-action='delete']");
    if (!btn) return;

    const id = btn.dataset.id;

    if (!confirm("⚠️ Delete this material permanently? This cannot be undone.")) {
      return;
    }

    btn.disabled = true;
    btn.textContent = "Deleting…";

    try {
      const res = await fetch(
        `${BASE_URL}/api/admin/materials/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Delete failed");
      }

      fetchMaterials(); // refresh list
    } catch (err) {
      alert("Delete failed: " + err.message);
      btn.disabled = false;
      btn.textContent = "Delete";
    }
  }


  // -----------------------------
  // INIT
  // -----------------------------
  function init() {
    initTheme();
    uploadForm?.addEventListener("submit", handleUpload);
    materialsTableBody?.addEventListener("click", handleDelete);
    materialsSearch?.addEventListener("input", renderMaterials);
    materialsTypeFilter?.addEventListener("change", renderMaterials);
    fetchMaterials();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
