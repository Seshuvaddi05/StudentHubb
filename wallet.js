// wallet.js
// StudentHub Wallet – FINAL PRODUCTION VERSION
// Balance • INR conversion • Withdrawals • History • Ledger

document.addEventListener("DOMContentLoaded", () => {
  // ============================
  // ELEMENT REFERENCES
  // ============================
  const walletBalanceEl = document.getElementById("walletBalance");
  const walletRupeesEl = document.getElementById("walletRupees");

  const balanceInput = document.getElementById("withdraw-balance");
  const amountInput = document.getElementById("withdrawAmount");
  const nameInput = document.getElementById("accountName");
  const upiInput = document.getElementById("upiId");
  const noteInput = document.getElementById("withdraw-note");

  const withdrawBtn = document.getElementById("withdrawBtn");
  const messageEl = document.getElementById("walletMessage");
  const historyBody = document.getElementById("withdrawalHistory");
  const ledgerBody = document.getElementById("walletLedger");

  const statEarnedEl = document.getElementById("statEarned");
  const statWithdrawnEl = document.getElementById("statWithdrawn");
  const statPaidEl = document.getElementById("statPaid");

  const methodSelect = document.getElementById("withdrawMethod");
  const upiSection = document.getElementById("upiSection");
  const bankSection = document.getElementById("bankSection");

  const bankNameInput = document.getElementById("bankName");
  const bankAccountInput = document.getElementById("bankAccount");
  const bankIfscInput = document.getElementById("bankIfsc");


  if (!walletBalanceEl || !withdrawBtn) return;

  // ============================
  // STATE
  // ============================
  const state = {
    balance: 0,
    minWithdraw: 100,
    hasPending: false,
  };

  // ============================
  // HELPERS
  // ============================
  function showMessage(msg = "", type = "") {
    if (!messageEl) return;
    messageEl.textContent = msg;
    messageEl.className = `withdraw-status ${type}`;
  }

  function formatDate(d) {
    return new Date(d).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (methodSelect) {
    methodSelect.addEventListener("change", () => {
      if (methodSelect.value === "bank") {
        upiSection.style.display = "none";
        bankSection.style.display = "block";
      } else {
        upiSection.style.display = "block";
        bankSection.style.display = "none";
      }
    });
  }



  // ============================
  // LOAD USER (NAME)
  // ============================
  async function loadUser() {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      const data = await res.json();

      if (res.ok && data.ok && data.user && nameInput) {
        nameInput.value = data.user.name || data.user.email || "";
        nameInput.readOnly = true;
      }
    } catch (err) {
      console.warn("User load failed:", err);
    }
  }

  // ============================
  // LOAD WALLET
  // ============================
  async function loadWallet() {
    showMessage("");

    try {
      const res = await fetch("/api/wallet", { credentials: "include" });
      const data = await res.json();

      if (!res.ok || data.ok === false) {
        throw new Error(data.message || "Failed to load wallet");
      }

      state.balance = Number(data.walletCoins || 0);
      state.minWithdraw = Number(data.minWithdraw || 100);
      state.rate = Number(data.conversionRate || 0.1);

      walletBalanceEl.textContent = `₹${state.balance}`;
      walletRupeesEl.textContent = `₹${state.balance}`;
      balanceInput.value = `₹${state.balance}`;


      renderWithdrawals(data.withdrawals || []);
      loadLedger();
    } catch (err) {
      showMessage(err.message || "Wallet load error", "error");
    }
  }


  async function loadAnalytics() {
    try {
      const res = await fetch("/api/wallet/analytics", {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok || data.ok === false) return;

      if (statEarnedEl) statEarnedEl.textContent = data.earned || 0;
      if (statWithdrawnEl) statWithdrawnEl.textContent = data.withdrawn || 0;
      if (statPaidEl) statPaidEl.textContent = data.paid || 0;
    } catch (err) {
      console.warn("Analytics load failed:", err);
    }
  }


  // ============================
  // RENDER WITHDRAWALS
  // ============================
  function renderWithdrawals(list) {
    historyBody.innerHTML = "";
    state.hasPending = false;

    if (!list.length) {
      historyBody.innerHTML =
        "<tr><td colspan='3'>No withdrawals yet</td></tr>";
      withdrawBtn.disabled = false;
      return;
    }

    list.forEach((w) => {
      if (w.status === "pending") state.hasPending = true;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${w.amountCoins}</td>
        <td>${formatDate(w.createdAt)}</td>
        <td class="status ${w.status}">
          ${w.status}
        </td>
      `;
      historyBody.appendChild(tr);
    });

    if (state.hasPending) {
      withdrawBtn.disabled = true;
      showMessage(
        "You already have a pending withdrawal request.",
        "warning"
      );
    } else {
      withdrawBtn.disabled = false;
    }
  }

  // ============================
  // LOAD WALLET LEDGER
  // ============================
  async function loadLedger() {
    if (!ledgerBody) return;

    ledgerBody.innerHTML =
      "<tr><td colspan='3'>Loading wallet activity…</td></tr>";

    try {
      const res = await fetch("/api/wallet/ledger", {
        credentials: "include",
      });
      const data = await res.json();

      if (!res.ok || data.ok === false) {
        throw new Error("Ledger load failed");
      }

      const list = data.ledger || [];
      ledgerBody.innerHTML = "";

      if (!list.length) {
        ledgerBody.innerHTML =
          "<tr><td colspan='3'>No wallet activity yet</td></tr>";
        return;
      }

      list.forEach((l) => {
        const typeClass = l.amount >= 0 ? "credit" : "debit";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <span class="ledger-type ${typeClass}">
              ${l.type}
            </span>
          </td>
          <td>${l.amount}</td>
          <td>${formatDate(l.createdAt)}</td>
        `;
        ledgerBody.appendChild(tr);
      });
    } catch (err) {
      ledgerBody.innerHTML =
        "<tr><td colspan='3'>Failed to load wallet activity</td></tr>";
    }
  }

  // ============================
  // SUBMIT WITHDRAWAL
  // ============================
  withdrawBtn.addEventListener("click", async () => {
    if (withdrawBtn.disabled) return;

    const amount = Number(amountInput.value); // ₹ amount
    const note = noteInput.value.trim();
    const upiId = upiInput.value.trim();

    showMessage("");

    // 🔹 Basic validations
    if (!amount || amount <= 0) {
      return showMessage("Enter a valid withdrawal amount", "error");
    }

    const amountCoins = amount; // 1 coin = ₹1

    if (amountCoins < state.minWithdraw) {
      return showMessage(
        `Minimum withdrawal is ₹${state.minWithdraw}`,
        "error"
      );
    }

    if (amountCoins > state.balance) {
      return showMessage("Amount exceeds wallet balance", "error");
    }

    // 🔹 BUILD PAYOUT DETAILS (✅ MUST BE HERE)
    const method = methodSelect.value;
    let payoutDetails = {};

    if (method === "upi") {
      if (!upiId || !upiId.includes("@")) {
        return showMessage("Enter a valid UPI ID", "error");
      }

      payoutDetails = {
        method: "upi",
        upiId: upiId.trim(),
      };
    } else {
      if (
        !bankNameInput.value ||
        !bankAccountInput.value ||
        !bankIfscInput.value
      ) {
        return showMessage("Enter complete bank details", "error");
      }

      payoutDetails = {
        method: "bank",
        bankName: bankNameInput.value.trim(),
        bankAccount: bankAccountInput.value.trim(),
        bankIfsc: bankIfscInput.value.trim(),
      };
    }

    // 🔹 SUBMIT
    withdrawBtn.disabled = true;
    showMessage("Submitting withdrawal request…");

    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amountCoins,
          payoutDetails,
          note,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        throw new Error(data.message || "Withdrawal failed");
      }

      showMessage("Withdrawal request submitted successfully.", "success");

      amountInput.value = "";
      upiInput.value = "";
      noteInput.value = "";
      bankNameInput.value = "";
      bankAccountInput.value = "";
      bankIfscInput.value = "";

      await loadWallet();
      await loadAnalytics();
    } catch (err) {
      showMessage(err.message || "Withdrawal error", "error");
      withdrawBtn.disabled = false;
    }
  });

  // Disable submit button for invalid amount (UX polish)
  if (amountInput) {
    amountInput.addEventListener("input", () => {
      const amount = Number(amountInput.value);

      if (!amount || amount <= 0) {
        withdrawBtn.disabled = true;
        return;
      }

      const coins = amount;

      if (coins < state.minWithdraw || coins > state.balance) {
        withdrawBtn.disabled = true;
      } else {
        withdrawBtn.disabled = false;
      }
    });
  }

  // ============================
  // INIT
  // ============================
  loadUser();
  loadWallet();
  loadAnalytics();
});
