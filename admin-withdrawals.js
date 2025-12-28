// admin-withdrawals.js
// StudentHub Admin – Withdrawals Management

let currentStatusFilter = "pending";
let emailSearch = "";

// ================================
// INITIAL LOAD
// ================================
document.addEventListener("DOMContentLoaded", () => {
  loadWithdrawals();
});

// ================================
// FILTERS
// ================================
function setFilter(status) {
  currentStatusFilter = status;

  const titleEl = document.getElementById("withdrawals-title");
  if (titleEl) {
    titleEl.textContent =
      status === "all"
        ? "All Withdrawal Requests"
        : status.charAt(0).toUpperCase() +
        status.slice(1) +
        " Withdrawal Requests";
  }

  loadWithdrawals();
}

function searchByEmail(value) {
  emailSearch = value.trim();
  loadWithdrawals();
}

// ================================
// LOAD WITHDRAWALS
// ================================
async function loadWithdrawals() {
  const tbody = document.getElementById("withdrawals-table-body");
  const statusEl = document.getElementById("withdrawals-status");

  if (!tbody || !statusEl) return;

  tbody.innerHTML = `<tr><td colspan="8">Loading withdrawals…</td></tr>`;
  statusEl.textContent = "Loading withdrawals…";

  try {
    let url = "/api/admin/withdrawals?";
    if (currentStatusFilter !== "all") {
      url += `status=${currentStatusFilter}&`;
    }
    if (emailSearch) {
      url += `email=${encodeURIComponent(emailSearch)}`;
    }

    const res = await fetch(url, { credentials: "include" });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error("Failed to load withdrawals");
    }

    const list = data.withdrawals || [];

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8">No withdrawals found.</td></tr>`;
      statusEl.textContent = "No withdrawals.";
      return;
    }

    tbody.innerHTML = "";

    list.forEach((w) => {
      const insufficientBalance =
        typeof w.walletCoins === "number" &&
        w.walletCoins < w.amountCoins;


      const tr = document.createElement("tr");

      const payoutDetails =
        w.payoutMethod === "upi"
          ? (w.upiId || "—")   // ✅ FULL UPI (no masking)
          : w.payoutMethod === "bank"
            ? w.bankAccount
              ? `A/C ${w.bankAccount} (${w.bankIfsc || ""})`
              : "—"
            : "—";


      tr.innerHTML = `
        <td>${w.userEmail}</td>

        <td><strong>${w.walletCoins ?? "—"}</strong></td>

        <td style="color:#b91c1c;font-weight:600;">
          ${w.amountCoins}
          ${insufficientBalance
          ? `<div style="color:red;font-size:0.75rem;margin-top:2px;">
                  ⚠ Insufficient balance
                </div>`
          : ""
        }
        </td>

        <td>${payoutDetails}</td>

        <td>${new Date(w.createdAt).toLocaleString()}</td>

        <td>${w.processedAt ? new Date(w.processedAt).toLocaleString() : "—"}</td>

        <td>
          <span style="
            padding:2px 8px;
            border-radius:999px;
            font-size:0.75rem;
            font-weight:600;
            background:${w.status === "pending"
          ? "#fde68a"
          : w.status === "approved"
            ? "#bbf7d0"
            : "#bae6fd"
        };
            color:${w.status === "pending"
          ? "#92400e"
          : w.status === "approved"
            ? "#166534"
            : "#1e40af"
        };
          ">
            ${w.status}
          </span>
        </td>

        <td>${w.status === "pending"
          ? `
        <button
          class="btn-approve"
          data-action="approve"
          data-id="${w.id}"
          ${insufficientBalance
            ? "disabled title='User has insufficient wallet balance'"
            : ""
          }
        >
          Approve
        </button>

        <button
          class="btn-reject"
          data-action="reject"
          data-id="${w.id}"
        >
          Reject
        </button>
      `
          : w.status === "approved"
            ? `
        <button
          class="btn-mark-paid"
          data-action="paid"
          data-id="${w.id}"
        >
          Mark Paid
        </button>
      `
            : w.status === "paid"
              ? `
        <span style="font-size:0.8rem;color:#15803d;font-weight:600;">
          Paid
        </span>
        ${w.paidAt
                ? `<div style="font-size:0.7rem;color:#6b7280;margin-top:4px;">
                 Paid at: ${new Date(w.paidAt).toLocaleString()}
               </div>`
                : ""
              }
      `
              : `
        <span style="font-size:0.8rem;color:#6b7280;">
          ${w.status}
        </span>
      `
        }
      </td>

      `;

      tbody.appendChild(tr);
    });

    statusEl.textContent = `${list.length} request(s) loaded.`;
  } catch (err) {
    console.error("Load withdrawals error:", err);
    tbody.innerHTML = `<tr><td colspan="8" style="color:red;">Failed to load withdrawals</td></tr>`;
    statusEl.textContent = "Error loading withdrawals.";
  }
}

// ================================
// ACTION HANDLER (APPROVE / REJECT / PAID)
// ================================
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn || btn.disabled) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  let confirmText = "Proceed?";
  if (action === "approve") confirmText = "Approve this withdrawal request?";
  if (action === "reject") confirmText = "Reject this withdrawal and refund coins?";
  if (action === "paid") confirmText = "Confirm payment has been sent?";

  if (!confirm(confirmText)) return;

  btn.disabled = true;

  try {
    const res = await fetch(`/api/admin/withdrawals/${id}/${action}`, {
      method: "POST",
      credentials: "include",
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Action failed");
    }

    loadWithdrawals();
  } catch (err) {
    alert(err.message || "Action failed");
    btn.disabled = false;
  }
});
