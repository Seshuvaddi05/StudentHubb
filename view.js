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

async function trackRead(id) {
  try {
    await fetch(`/api/materials/${id}/track-read`, { method: "POST" });
  } catch {}
}

async function markPurchase(material, amountPaid, reference) {
  const res = await fetch("/api/purchases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      materialId: material.id,
      amountPaid: Number(amountPaid) || 0,
      paymentId: reference || `manual-${Date.now()}`
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || "Purchase failed");
  }
}

// ---------- ✅ SECURE PDF LOADER (FIXED) ----------
function loadPdfIntoFrame(item) {
  const frame = document.getElementById("pdf-frame");
  if (!frame || !item?.file) return;

  // 🔐 FORCE PDF THROUGH /pdfs/* ROUTE
  const cleanPath = item.file.replace(/^\/+/, "").replace(/^pdfs\//, "");
  frame.src = `/pdfs/${cleanPath}`;

  trackRead(item.id);
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
      loadPdfIntoFrame(material);
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
      loadPdfIntoFrame(material);
      return;
    }

    // Unlock
    paywallBtn.addEventListener("click", async () => {
      try {
        paywallBtn.disabled = true;
        paywallBtn.textContent = "Unlocking…";

        await markPurchase(material, material.price, "");

        paywallBox.style.display = "none";
        loadPdfIntoFrame(material);
      } catch (err) {
        setStatus(err.message || "Unlock failed", "error");
      } finally {
        paywallBtn.disabled = false;
        paywallBtn.textContent = "Unlock PDF";
      }
    });

  } catch (err) {
    console.warn("Reader stopped:", err.message);
  }
});
