// view.js – FINAL & CORRECT (Secure PDF loading via /pdfs/*)

// ---------- Utils ----------
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPaidItem(item) {
  return Number(item?.price || 0) > 0;
}

function formatPrice(item) {
  const p = Number(item?.price || 0);
  return p > 0 ? `₹${p}` : "Free";
}

function getSlugFromLocation() {
  const parts = window.location.pathname.split("/view/");
  return decodeURIComponent(parts[1]?.split(/[?#]/)[0] || "");
}

// ---------- 🔒 BASIC READER SECURITY ----------
document.addEventListener("contextmenu", e => e.preventDefault());

document.addEventListener("keydown", e => {
  if (
    (e.ctrlKey || e.metaKey) &&
    ["s", "p", "u"].includes(e.key.toLowerCase())
  ) {
    e.preventDefault();
    alert("This action is disabled for security reasons.");
  }

  if (e.key === "PrintScreen") {
    e.preventDefault();
    alert("Screenshots are disabled.");
  }
});


// ---------- 🔐 AUTH CHECK ----------
async function ensureLoggedIn() {
  const res = await fetch("/api/me");
  if (!res.ok) {
    const next = encodeURIComponent(window.location.pathname);
    window.location.href = `/login.html?next=${next}`;
    throw new Error("Not authenticated");
  }
  return res.json();
}

// ---------- API ----------
async function fetchAllMaterials() {
  const res = await fetch("/api/materials");
  if (!res.ok) throw new Error("Failed to load materials");

  const data = await res.json();
  return [
    ...(data.ebooks || []).map(m => ({ ...m, type: "ebook" })),
    ...(data.questionPapers || []).map(m => ({ ...m, type: "questionPaper" })),
  ].map(m => ({ ...m, slug: slugify(m.title) }));
}

async function fetchMyLibrary() {
  try {
    const res = await fetch("/api/my-library");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

const trackedReads = new Set();

async function trackRead(id) {
  if (trackedReads.has(id)) return;
  trackedReads.add(id);

  try {
    await fetch(`/api/materials/${id}/track-read`, { method: "POST" });
  } catch { }
}

// ---------- ✅ SECURE PDF LOADER (FIXED) ----------
function loadPdfIntoFrame(item) {
  const frame = document.getElementById("pdf-frame");
  if (!frame || !item?.file) return;

  // ✅ Always use DB path as-is
  const normalized = item.file.startsWith("/")
    ? item.file
    : "/" + item.file;

  frame.src = normalized;   // <-- THIS IS THE KEY FIX

  trackRead(item.id);
}


// ---------- 🔒 Blur PDF when tab inactive ----------
document.addEventListener("visibilitychange", () => {
  const frame = document.getElementById("pdf-frame");
  if (!frame) return;
  frame.style.filter = document.hidden ? "blur(10px)" : "none";
});


// ---------- 🔐 USER WATERMARK ----------
async function applyWatermark() {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (!res.ok) return;

    const data = await res.json();
    const email = data.user.email;
    const time = new Date().toLocaleString();

    const wm = document.getElementById("pdf-watermark");
    if (!wm) return;

    wm.innerHTML = "";
    for (let i = 0; i < 30; i++) {
      const span = document.createElement("span");
      span.textContent = `${email} • ${time}`;
      wm.appendChild(span);
    }
  } catch (err) {
    console.error("Watermark error", err);
  }
}


// ---------- MAIN ----------
document.addEventListener("DOMContentLoaded", async () => {
  const titleEl = document.getElementById("reader-title");
  const breadcrumbEl = document.getElementById("reader-breadcrumb");
  const metaLineEl = document.getElementById("reader-meta-line");
  const typePillEl = document.getElementById("reader-type-pill");
  const priceChipEl = document.getElementById("reader-price-chip");
  const paywallBox = document.getElementById("reader-paywall");
  const paywallBtn = document.getElementById("paywall-unlock-btn");
  const paywallStatus = document.getElementById("paywall-status");

  function setStatus(msg, type) {
    if (!paywallStatus) return;
    paywallStatus.textContent = msg || "";
    paywallStatus.className = type ? `paywall-status ${type}` : "paywall-status";
  }

  try {
    // 🔐 LOGIN CHECK
    await ensureLoggedIn();
    applyWatermark();

    const slug = getSlugFromLocation();
    const materials = await fetchAllMaterials();
    const material = materials.find(m => m.slug === slug);

    if (!material) {
      titleEl.textContent = "Material not found";
      breadcrumbEl.textContent = "Invalid link";
      return;
    }

    // Header
    breadcrumbEl.textContent =
      (material.type === "ebook" ? "E-Book" : "Question Paper") +
      (material.exam ? ` • ${material.exam}` : "");

    titleEl.textContent = material.title;
    metaLineEl.textContent =
      `Subject: ${material.subject || "—"} • Year: ${material.year || "—"}`;
    typePillEl.textContent =
      material.type === "ebook" ? "E-Book" : "Question Paper";
    priceChipEl.textContent = formatPrice(material);

    // ---------- FREE PDF ----------
    if (!isPaidItem(material)) {
      paywallBox.style.display = "none";
      const frame = document.getElementById("pdf-frame");
      frame.src = ""; // force reset
      setTimeout(() => loadPdfIntoFrame(material), 100);
      return;
    }

    // ---------- PAID PDF ----------
    paywallBox.style.display = "block";

    // Already purchased?
    const library = await fetchMyLibrary();
    const owned = library.find(
      i => i.itemId === material.id && i.itemType === material.type
    );

    if (owned) {
      paywallBox.style.display = "none";
      const frame = document.getElementById("pdf-frame");
      frame.src = ""; // force reset
      setTimeout(() => loadPdfIntoFrame(material), 100);
      return;
    }

    // Unlock
    paywallBtn.addEventListener("click", async () => {
      try {
        paywallBtn.disabled = true;
        paywallBtn.textContent = "Redirecting to payment…";

        // 1️⃣ Create Razorpay order
        const orderRes = await fetch("/api/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfId: material.id,
            amount: material.price,
          }),
        });

        const orderData = await orderRes.json();
        if (!orderData.success) {
          throw new Error(orderData.message || "Failed to create order");
        }

        // 2️⃣ Open Razorpay Checkout
        const rzp = new Razorpay({
          key: orderData.key,
          amount: orderData.amount,
          currency: "INR",
          order_id: orderData.orderId,
          name: "StudentHub",
          description: material.title,

          handler: async function (response) {
            // 3️⃣ Verify payment
            const verifyRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                paymentId: orderData.paymentId,
              }),
            });

            const verifyData = await verifyRes.json();
            if (!verifyData.success) {
              throw new Error("Payment verification failed");
            }

            // ✅ SUCCESS → unlock PDF
            paywallBox.style.display = "none";
            const frame = document.getElementById("pdf-frame");
            frame.src = ""; // force reset
            setTimeout(() => loadPdfIntoFrame(material), 100);
          },

          modal: {
            ondismiss: () => {
              paywallBtn.disabled = false;
              paywallBtn.textContent = "Unlock PDF";
            },
          },
        });

        rzp.open();
      } catch (err) {
        paywallBtn.disabled = false;
        paywallBtn.textContent = "Unlock PDF";
        setStatus(err.message || "Payment failed", "error");
      }
    });
  } catch (err) {
    console.warn("Reader stopped:", err.message);
  }
});

