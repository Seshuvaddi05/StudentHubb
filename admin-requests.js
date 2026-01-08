const tbody = document.querySelector("#reqTable tbody");

/* ================================
   LOAD ALL REQUESTS (ADMIN)
================================ */
fetch("/api/admin/requests", {
  method: "GET",
  credentials: "include",
})
  .then((r) => {
    if (!r.ok) {
      throw new Error("Unauthorized or failed to load");
    }
    return r.json();
  })
  .then((data) => {
    tbody.innerHTML = "";

    if (!data.requests || data.requests.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty">
            No requests found
          </td>
        </tr>
      `;
      return;
    }

    data.requests.forEach((r) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.email)}</td>
        <td>${formatType(r.materialType)}</td>
        <td>${escapeHtml(r.examSubject || "—")}</td>
        <td class="wrap">${escapeHtml(r.details || "—")}</td>
        <td>
          <span class="req-status ${r.status}">
            ${r.status}
          </span>
        </td>
        <td>
          ${
            r.status === "pending"
              ? `
                <button class="btn small success"
                        onclick="updateStatus('${r._id}', 'completed')">
                  ✔ Complete
                </button>
                <button class="btn small danger"
                        onclick="updateStatus('${r._id}', 'rejected')">
                  ✖ Reject
                </button>
              `
              : "—"
          }
        </td>
      `;

      tbody.appendChild(tr);
    });
  })
  .catch((err) => {
    console.error(err);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="error">
          Failed to load requests
        </td>
      </tr>
    `;
  });

/* ================================
   UPDATE REQUEST STATUS
================================ */
function updateStatus(id, status) {
  const msg =
    status === "completed"
      ? "Mark this request as COMPLETED?"
      : "Reject this request?";

  if (!confirm(msg)) return;

  fetch("/api/admin/requests/" + id, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  })
    .then((r) => {
      if (!r.ok) throw new Error("Update failed");
      return r.json();
    })
    .then(() => {
      location.reload();
    })
    .catch(() => {
      alert("Failed to update request");
    });
}

/* ================================
   HELPERS
================================ */
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatType(type) {
  if (type === "ebook") return "E-Book";
  if (type === "questionPaper") return "Question Paper";
  return "—";
}
