// wallet.js
// Shows wallet balance and lets user request withdrawals.

document.addEventListener("DOMContentLoaded", () => {
  const balanceEl = document.getElementById("wallet-coins");
  const pendingListEl = document.getElementById("pending-withdrawals");
  const withdrawInput = document.getElementById("withdraw-amount");
  const withdrawBtn = document.getElementById("withdraw-btn");
  const statusEl = document.getElementById("withdraw-status");

  if (!balanceEl || !pendingListEl || !withdrawBtn || !statusEl) return;

  let currentBalance = 0;

  async function loadWallet() {
    statusEl.textContent = "";
    statusEl.className = "withdraw-status";

    try {
      const res = await fetch("/api/wallet", { credentials: "include" });
      const data = await res.json();

      if (!res.ok || data.ok === false) {
        balanceEl.textContent = "-";
        statusEl.textContent =
          data.message ||
          "Unable to load wallet. Please make sure you are signed in.";
        statusEl.classList.add("error");
        return;
      }

      currentBalance = Number(data.walletCoins || 0);
      balanceEl.textContent = currentBalance.toString();

      const pending = data.pendingWithdrawals || [];
      pendingListEl.innerHTML = "";

      if (!pending.length) {
        pendingListEl.innerHTML =
          "<li style='font-size:0.8rem; color:#6b7280;'>No pending withdrawals.</li>";
      } else {
        pending.forEach((req) => {
          const li = document.createElement("li");
          li.style.fontSize = "0.82rem";
          const created = req.createdAt
            ? new Date(req.createdAt).toLocaleString("en-IN", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Unknown date";
          li.textContent = `${req.amountCoins} coins • requested on ${created}`;
          pendingListEl.appendChild(li);
        });
      }
    } catch (err) {
      console.error("loadWallet error:", err);
      balanceEl.textContent = "-";
      statusEl.textContent =
        "Unexpected error while loading wallet. Please try again.";
      statusEl.classList.add("error");
    }
  }

  withdrawBtn.addEventListener("click", async () => {
    const inputVal = Number(withdrawInput.value || "0");
    statusEl.textContent = "";
    statusEl.className = "withdraw-status";

    if (!inputVal || inputVal <= 0) {
      statusEl.textContent = "Please enter a valid coin amount.";
      statusEl.classList.add("error");
      return;
    }

    if (currentBalance < 100) {
      statusEl.textContent =
        "You need at least 100 coins in your wallet to place a withdrawal request.";
      statusEl.classList.add("error");
      return;
    }

    if (inputVal > currentBalance) {
      statusEl.textContent =
        "You cannot request more coins than your current balance.";
      statusEl.classList.add("error");
      return;
    }

    statusEl.textContent = "Submitting your withdrawal request…";

    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amountCoins: inputVal }),
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        statusEl.textContent =
          data.message ||
          "Unable to submit withdrawal request. Please try again.";
        statusEl.classList.add("error");
        return;
      }

      statusEl.textContent =
        "Your withdrawal request was submitted and will be reviewed by the admin.";
      statusEl.classList.add("success");
      withdrawInput.value = "";
      await loadWallet();
    } catch (err) {
      console.error("withdraw error:", err);
      statusEl.textContent =
        "Unexpected error while submitting withdrawal request.";
      statusEl.classList.add("error");
    }
  });

  loadWallet();
});
