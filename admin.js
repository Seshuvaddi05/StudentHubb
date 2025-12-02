// admin.js
// Works with admin.html (login-section, admin-panel, mat-* ids)

function $(id) {
  return document.getElementById(id);
}

// =============== VIEW SWITCH ===============

function showAdminPanel() {
  const loginSection = $("login-section");
  const adminPanel = $("admin-panel");
  if (loginSection) loginSection.style.display = "none";
  if (adminPanel) adminPanel.style.display = "block";
  loadMaterialsList();
}

function showLogin() {
  const loginSection = $("login-section");
  const adminPanel = $("admin-panel");
  if (adminPanel) adminPanel.style.display = "none";
  if (loginSection) loginSection.style.display = "block";
  localStorage.removeItem("studenthub_admin_logged");
}

// =============== LOGIN ===============

async function handleAdminLogin(e) {
  e.preventDefault();

  const pwdInput = $("admin-password");
  const errorEl = $("admin-login-error");
  if (errorEl) {
    errorEl.style.display = "none";
  }

  if (!pwdInput) {
    alert("Password input not found.");
    return;
  }

  const password = pwdInput.value.trim();
  if (!password) {
    if (errorEl) {
      errorEl.textContent = "Please enter the admin password.";
      errorEl.style.display = "block";
    } else {
      alert("Please enter the admin password.");
    }
    return;
  }

  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.ok === false) {
      const msg = data.message || data.error || "Invalid password. Please try again.";
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.style.display = "block";
      } else {
        alert(msg);
      }
      return;
    }

    // success
    localStorage.setItem("studenthub_admin_logged", "1");
    pwdInput.value = "";
    showAdminPanel();
  } catch (err) {
    console.error("Login error:", err);
    if (errorEl) {
      errorEl.textContent = "Could not reach server for login.";
      errorEl.style.display = "block";
    } else {
      alert("Could not reach server for login.");
    }
  }
}

// =============== LOAD MATERIALS LIST ===============

async function loadMaterialsList() {
  const listEl = $("materials-list");
  const statsEl = $("admin-stats");
  if (!listEl) return;

  listEl.innerHTML = "Loading...";
  if (statsEl) statsEl.textContent = "Loading materials...";

  try {
    const res = await fetch("/api/materials");
    if (!res.ok) throw new Error("Failed to load materials");

    const data = await res.json();
    const ebooks = data.ebooks || [];
    const qps = data.questionPapers || [];

    if (statsEl) {
      statsEl.textContent =
        "E-Books: " +
        ebooks.length +
        " | Question Papers: " +
        qps.length +
        " | Total: " +
        (ebooks.length + qps.length);
    }

    if (!ebooks.length && !qps.length) {
      listEl.innerHTML = "<p>No materials uploaded yet.</p>";
      return;
    }

    const wrapper = document.createElement("div");

    function buildSection(title, list, type) {
      if (!list.length) return;
      const section = document.createElement("div");

      const h3 = document.createElement("h3");
      h3.textContent = title;
      h3.style.margin = "0.75rem 0 0.4rem";
      section.appendChild(h3);

      list.forEach(function (item, index) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.border = "1px solid #e5e7eb";
        row.style.borderRadius = "0.5rem";
        row.style.padding = "0.5rem 0.75rem";
        row.style.marginBottom = "0.35rem";

        const label = document.createElement("div");
        label.innerHTML =
          "<strong>" +
          (item.title || "(no title)") +
          "</strong><br/>" +
          "<span style='font-size:0.8rem;color:#6b7280;'>" +
          (item.exam || "—") +
          " | " +
          (item.subject || "—") +
          " | Year: " +
          (item.year || "—") +
          " | Downloads: " +
          (item.downloads || 0) +
          "</span>";
        row.appendChild(label);

        const delBtn = document.createElement("button");
        delBtn.textContent = "Delete";
        delBtn.className = "btn small";
        delBtn.style.background = "#ef4444";
        delBtn.style.color = "#ffffff";
        delBtn.addEventListener("click", function () {
          handleDelete(type, index);
        });
        row.appendChild(delBtn);

        section.appendChild(row);
      });

      wrapper.appendChild(section);
    }

    buildSection("E-Books", ebooks, "ebook");
    buildSection("Question Papers", qps, "questionPaper");

    listEl.innerHTML = "";
    listEl.appendChild(wrapper);
  } catch (err) {
    console.error("Error loading materials:", err);
    listEl.innerHTML =
      "<p style='color:#b91c1c;'>Failed to load materials from server.</p>";
    if (statsEl) statsEl.textContent = "Error loading materials.";
  }
}

// =============== DELETE ===============

async function handleDelete(type, index) {
  if (!confirm("Are you sure you want to delete this item?")) return;

  try {
    const res = await fetch("/api/materials/" + type + "/" + index, {
      method: "DELETE"
    });

    const data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      alert(data.error || "Delete failed.");
      return;
    }

    alert("Deleted successfully.");
    loadMaterialsList();
  } catch (err) {
    console.error("Delete error:", err);
    alert("Server error while deleting.");
  }
}

// =============== UPLOAD ===============

async function handleUpload(e) {
  e.preventDefault();

  const typeEl = $("mat-type");
  const titleEl = $("mat-title");
  const descEl = $("mat-description");
  const subjEl = $("mat-subject");
  const examEl = $("mat-exam");
  const yearEl = $("mat-year");
  const fileEl = $("mat-file");
  const statusEl = $("upload-status");

  if (statusEl) {
    statusEl.textContent = "";
    statusEl.style.color = "#6b7280";
  }

  if (!typeEl || !titleEl || !fileEl) {
    alert("Form elements not found in HTML.");
    return;
  }

  const type = typeEl.value;
  const title = titleEl.value.trim();

  if (!title || !fileEl.files.length) {
    alert("Title and PDF file are required.");
    return;
  }

  const fd = new FormData();
  fd.append("type", type);
  fd.append("title", title);
  fd.append("description", descEl ? descEl.value.trim() : "");
  fd.append("subject", subjEl ? subjEl.value.trim() : "");
  fd.append("exam", examEl ? examEl.value.trim() : "");
  fd.append("year", yearEl ? yearEl.value.trim() : "");
  fd.append("file", fileEl.files[0]);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: fd
    });

    const data = await res.json().catch(function () {
      return {};
    });

    if (!res.ok) {
      const msg = data.error || "Upload failed.";
      if (statusEl) {
        statusEl.style.color = "#b91c1c";
        statusEl.textContent = msg;
      } else {
        alert(msg);
      }
      return;
    }

    if (statusEl) {
      statusEl.style.color = "#16a34a";
      statusEl.textContent = "Uploaded successfully!";
    } else {
      alert("Uploaded successfully!");
    }

    const uploadFormEl = $("upload-form");
    if (uploadFormEl) uploadFormEl.reset();

    loadMaterialsList();
  } catch (err) {
    console.error("Upload error:", err);
    if (statusEl) {
      statusEl.style.color = "#b91c1c";
      statusEl.textContent = "Server error while uploading.";
    } else {
      alert("Server error while uploading.");
    }
  }
}

// =============== INIT ===============

document.addEventListener("DOMContentLoaded", function () {
  const loginForm = $("admin-login-form");
  if (loginForm) loginForm.addEventListener("submit", handleAdminLogin);

  const uploadForm = $("upload-form");
  if (uploadForm) uploadForm.addEventListener("submit", handleUpload);

  const logoutBtn = $("admin-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      showLogin();
    });
  }

  const logged = localStorage.getItem("studenthub_admin_logged") === "1";
  if (logged) {
    showAdminPanel();
  } else {
    showLogin();
  }
});
