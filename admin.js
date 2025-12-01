// admin.js - logic for StudentHub admin page

let ADMIN_SECRET = null;

// Helper: small status message setter
function setText(id, text, color) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || "";
  if (color) el.style.color = color;
}

// ---- Login ----
async function handleLogin(e) {
  e.preventDefault();

  const pwdInput = document.getElementById("admin-password");
  const errorEl = document.getElementById("admin-login-error");
  errorEl.style.display = "none";

  const password = pwdInput.value.trim();
  if (!password) return;

  try {
    const res = await fetch("/api/admin-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Login failed");
    }

    ADMIN_SECRET = password;
    // Optional: remember between refreshes
    // localStorage.setItem("studenthub_admin_secret", password);

    // Show panel, hide login
    document.getElementById("login-section").style.display = "none";
    document.getElementById("admin-panel").style.display = "block";

    await loadMaterials();
  } catch (err) {
    console.error("Login error:", err);
    errorEl.textContent = err.message || "Invalid password";
    errorEl.style.display = "block";
  }
}

// ---- Load & render materials ----
async function loadMaterials() {
  setText("admin-stats", "Loading materials...");
  const listContainer = document.getElementById("materials-list");
  listContainer.innerHTML = "";

  try {
    const res = await fetch("/api/materials");
    const data = await res.json();

    renderMaterials(data);
  } catch (err) {
    console.error("Load materials error:", err);
    setText("admin-stats", "Error loading materials", "#b91c1c");
  }
}

function renderMaterials(data) {
  const listContainer = document.getElementById("materials-list");
  const ebooks = data.ebooks || [];
  const qps = data.questionPapers || [];

  const totalDownloads = [...ebooks, ...qps].reduce(
    (sum, item) => sum + (item.downloads || 0),
    0
  );

  setText(
    "admin-stats",
    `E-Books: ${ebooks.length} | Question Papers: ${qps.length} | Total Downloads: ${totalDownloads}`
  );

  if (!ebooks.length && !qps.length) {
    listContainer.innerHTML = `<p style="color:#6b7280;">No materials uploaded yet.</p>`;
    return;
  }

  let html = "";

  if (ebooks.length) {
    html += `<h3 style="margin-top:1rem;">E-Books (${ebooks.length})</h3>`;
    html += buildTable("ebook", ebooks);
  }

  if (qps.length) {
    html += `<h3 style="margin-top:1.5rem;">Question Papers (${qps.length})</h3>`;
    html += buildTable("questionPaper", qps);
  }

  listContainer.innerHTML = html;

  // Attach delete listeners
  listContainer.querySelectorAll(".admin-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-type");
      const index = btn.getAttribute("data-index");
      deleteMaterial(type, index);
    });
  });
}

function buildTable(type, items) {
  let rows = `
    <table style="width:100%; border-collapse:collapse; font-size:0.9rem; margin-top:0.4rem;">
      <thead>
        <tr style="text-align:left; border-bottom:1px solid #e5e7eb;">
          <th style="padding:0.4rem;">Title</th>
          <th style="padding:0.4rem;">Exam</th>
          <th style="padding:0.4rem;">Subject</th>
          <th style="padding:0.4rem;">Year</th>
          <th style="padding:0.4rem;">Downloads</th>
          <th style="padding:0.4rem;">Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  items.forEach((item, index) => {
    rows += `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:0.4rem;">${item.title || ""}</td>
        <td style="padding:0.4rem;">${item.exam || "—"}</td>
        <td style="padding:0.4rem;">${item.subject || "—"}</td>
        <td style="padding:0.4rem;">${item.year || "—"}</td>
        <td style="padding:0.4rem;">${item.downloads || 0}</td>
        <td style="padding:0.4rem;">
          <button type="button"
            class="btn small secondary admin-delete-btn"
            data-type="${type}"
            data-index="${index}">
            Delete
          </button>
        </td>
      </tr>
    `;
  });

  rows += `</tbody></table>`;
  return rows;
}

// ---- Upload handler ----
async function handleUpload(e) {
  e.preventDefault();

  if (!ADMIN_SECRET) {
    alert("You are not logged in as admin.");
    return;
  }

  const statusId = "upload-status";
  setText(statusId, "Uploading...", "#6b7280");

  const type = document.getElementById("mat-type").value;
  const title = document.getElementById("mat-title").value.trim();
  const description = document.getElementById("mat-description").value.trim();
  const subject = document.getElementById("mat-subject").value.trim();
  const exam = document.getElementById("mat-exam").value.trim();
  const year = document.getElementById("mat-year").value.trim();
  const fileInput = document.getElementById("mat-file");

  if (!fileInput.files.length) {
    setText(statusId, "Please choose a PDF file.", "#b91c1c");
    return;
  }

  const formData = new FormData();
  formData.append("type", type);
  formData.append("title", title);
  formData.append("description", description);
  formData.append("subject", subject);
  formData.append("exam", exam);
  formData.append("year", year);
  formData.append("file", fileInput.files[0]);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "x-admin-secret": ADMIN_SECRET
      },
      body: formData
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Upload failed");
    }

    setText(statusId, "Uploaded successfully ✅", "#15803d");
    (document.getElementById("upload-form") as HTMLFormElement)?.reset; // ignore TS style

    // reload list
    await loadMaterials();
  } catch (err) {
    console.error("Upload error:", err);
    setText(statusId, err.message || "Upload failed", "#b91c1c");
  }
}

// ---- Delete material ----
async function deleteMaterial(type, index) {
  if (!ADMIN_SECRET) {
    alert("You are not logged in as admin.");
    return;
  }

  if (!confirm("Delete this item permanently?")) return;

  try {
    const res = await fetch(`/api/materials/${type}/${index}`, {
      method: "DELETE",
      headers: {
        "x-admin-secret": ADMIN_SECRET
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Delete failed");
    }

    await loadMaterials();
  } catch (err) {
    console.error("Delete error:", err);
    alert(err.message || "Delete failed");
  }
}

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("admin-login-form");
  const uploadForm = document.getElementById("upload-form");

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (uploadForm) {
    uploadForm.addEventListener("submit", handleUpload);
  }
});
