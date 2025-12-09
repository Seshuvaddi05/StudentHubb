// view.js – Handles loading a single material + payment / unlock

// Keep slugify in sync with script.js
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPaidItem(item) {
  const priceNum = Number(item?.price) || 0;
  return priceNum > 0;
}

function formatPrice(item) {
  if (!item) return "Free";
  const priceNum = Number(item.price) || 0;
  if (priceNum > 0) return `₹${priceNum}`;
  return "Free";
}

function getSlugFromLocation() {
  const path = window.location.pathname || "";
  const parts = path.split("/view/");
  if (parts.length < 2) return "";
  const slugPart = parts[1].split(/[?#]/)[0];
  return decodeURIComponent(slugPart);
}

async function fetchAllMaterials() {
  const res = await fetch("/api/materials");
  if (!res.ok) throw new Error("Failed to load materials");
  const data = await res.json();
  const ebooks = (data.ebooks || []).map((m) => ({ ...m, type: "ebook" }));
  const qps = (data.questionPapers || []).map((m) => ({
    ...m,
    type: "questionPaper",
  }));
  return [...ebooks, ...qps].map((m) => ({
    ...m,
    slug: slugify(m.title || ""),
  }));
}

async function fetchMyLibrary() {
  try {
    const res = await fetch("/api/my-library");
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.items)) return [];
    return data.items;
  } catch (err) {
    console.warn("Unable to load library:", err);
    return [];
  }
}

async function trackRead(materialId) {
  if (!materialId) return;
  try {
    await fetch(`/api/materials/${materialId}/track-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.warn("Failed to track read:", err);
  }
}

function loadPdfIntoFrame(item) {
  const frame = document.getElementById("pdf-frame");
  if (!frame || !item || !item.file) return;

  frame.src = "/" + item.file.replace(/^\/+/, "");
  trackRead(item.id);
}

async function markPurchase(material, amountPaid, reference) {
  const payload = {
    materialId: material.id,
    amountPaid: Number(amountPaid) || 0,
    paymentId: reference || `manual-${Date.now()}`,
  };

  const res = await fetch("/api/purchases", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || "Failed to record purchase");
  }
  return data;
}

document.addEventListener("DOMContentLoaded", async () => {
  const slug = getSlugFromLocation();

  const titleEl = document.getElementById("reader-title");
  const metaLineEl = document.getElementById("reader-meta-line");
  const breadcrumbEl = document.getElementById("reader-breadcrumb");
  const typePillEl = document.getElementById("reader-type-pill");
  const priceChipEl = document.getElementById("reader-price-chip");
  const downloadsPillEl = document.getElementById("reader-downloads-pill");

  const paywallBox = document.getElementById("reader-paywall");
  const paywallPriceInput = document.getElementById("paywall-price");
  const paywallAmountInput = document.getElementById("paywall-amount");
  const paywallRefInput = document.getElementById("paywall-reference");
  const paywallConfirm = document.getElementById("paywall-confirm");
  const paywallBtn = document.getElementById("paywall-unlock-btn");
  const paywallStatusEl = document.getElementById("paywall-status");

  let currentMaterial = null;
  let unlocked = false;

  function setStatus(msg, kind) {
    if (!paywallStatusEl) return;
    paywallStatusEl.textContent = msg || "";
    paywallStatusEl.classList.remove("error", "ok");
    if (kind) paywallStatusEl.classList.add(kind);
  }

  try {
    const allMaterials = await fetchAllMaterials();
    currentMaterial = allMaterials.find((m) => m.slug === slug);

    if (!currentMaterial) {
      if (titleEl) titleEl.textContent = "Material not found";
      if (breadcrumbEl) breadcrumbEl.textContent = "Unknown material";
      setStatus("We couldn't find this PDF. Please go back and try again.", "error");
      return;
    }

    // Fill header info
    if (breadcrumbEl) {
      breadcrumbEl.textContent =
        (currentMaterial.type === "ebook" ? "E-Book" : "Question Paper") +
        (currentMaterial.exam ? " • " + currentMaterial.exam : "");
    }
    if (titleEl) titleEl.textContent = currentMaterial.title || "Untitled PDF";
    if (metaLineEl) {
      metaLineEl.textContent = `Subject: ${
        currentMaterial.subject || "—"
      }  •  Year: ${currentMaterial.year || "—"}`;
    }
    if (typePillEl) {
      typePillEl.textContent =
        currentMaterial.type === "ebook" ? "E-Book" : "Question Paper";
    }
    if (priceChipEl) {
      priceChipEl.textContent = formatPrice(currentMaterial);
    }
    if (downloadsPillEl) {
      const d = Number(currentMaterial.downloads) || 0;
      if (d > 0) {
        downloadsPillEl.style.display = "inline-flex";
        downloadsPillEl.textContent = `${d} read${d === 1 ? "" : "s"}`;
      }
    }

    const paid = isPaidItem(currentMaterial);

    if (!paid) {
      // Free PDF – no paywall
      if (paywallBox) paywallBox.style.display = "none";
      loadPdfIntoFrame(currentMaterial);
      unlocked = true;
      return;
    }

    // Paid PDF – show paywall by default
    if (paywallBox) paywallBox.style.display = "block";
    if (paywallPriceInput)
      paywallPriceInput.value = Number(currentMaterial.price) || 0;
    if (paywallAmountInput)
      paywallAmountInput.value = Number(currentMaterial.price) || 0;

    // Check if user already purchased this item
    const myItems = await fetchMyLibrary();
    const already = myItems.find(
      (it) => it.itemId === currentMaterial.id && it.itemType === currentMaterial.type
    );

    if (already) {
      // Already purchased → auto unlock
      if (paywallBox) paywallBox.style.display = "none";
      setStatus("You already purchased this PDF. Unlocking…", "ok");
      loadPdfIntoFrame(currentMaterial);
      unlocked = true;
      return;
    }

    // Not purchased yet – wire up unlock button
    if (paywallBtn) {
      paywallBtn.addEventListener("click", async () => {
        if (unlocked) return;

        const requiredPrice = Number(currentMaterial.price) || 0;
        const amountPaid = Number(paywallAmountInput?.value || 0);
        const reference = paywallRefInput?.value.trim();

        setStatus("", null);

        if (!paywallConfirm || !paywallConfirm.checked) {
          setStatus("Please tick the confirmation box after paying.", "error");
          return;
        }

        if (!amountPaid || amountPaid < requiredPrice) {
          setStatus(
            `Amount should be at least ₹${requiredPrice}.`,
            "error"
          );
          return;
        }

        try {
          paywallBtn.disabled = true;
          paywallBtn.textContent = "Unlocking…";

          await markPurchase(currentMaterial, amountPaid, reference);

          setStatus("Purchase recorded. Unlocking your PDF…", "ok");
          if (paywallBox) paywallBox.style.display = "none";
          loadPdfIntoFrame(currentMaterial);
          unlocked = true;
        } catch (err) {
          console.error(err);
          setStatus(
            err.message || "Failed to unlock. Please try again.",
            "error"
          );
        } finally {
          paywallBtn.disabled = false;
          paywallBtn.textContent = "Unlock PDF";
        }
      });
    }
  } catch (err) {
    console.error("Error in reader:", err);
    if (titleEl) titleEl.textContent = "Error loading PDF";
    setStatus(
      "Something went wrong while loading this PDF. Please try again later.",
      "error"
    );
  }
});
