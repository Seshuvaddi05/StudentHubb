// read-later.js
// Final, updated Read Later page script — Library-style cards, robust API handling

/* global fetch, document, localStorage, window, confirm, console, alert */

let readLaterItems = [];
let ownedMaterialIds = new Set();
let readLaterSearchQuery = "";


// ---------- small helpers ----------
function slugify(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function formatPrice(item) {
  const priceNum = Number(item.price) || 0;
  return priceNum > 0 ? `₹${priceNum}` : "Free";
}
function isPaidItem(item) {
  return Number(item && item.price) > 0;
}
function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

// ---------- theme + mobile nav (shared small bits) ----------
function applyTheme(theme) {
  const body = document.body;
  const toggleBtn = document.getElementById("theme-toggle");
  if (!body) return;
  if (theme === "dark") {
    body.classList.add("dark");
    if (toggleBtn) toggleBtn.textContent = "☀️";
  } else {
    body.classList.remove("dark");
    if (toggleBtn) toggleBtn.textContent = "🌙";
  }
  localStorage.setItem("studenthub_theme", theme);
}

function initMobileNav() {
  const navToggle = document.getElementById("nav-toggle");
  const navLinks = document.getElementById("nav-links");
  if (!navToggle || !navLinks) return;
  navToggle.addEventListener("click", () => {
    navLinks.classList.toggle("open");
    navToggle.classList.toggle("open");
  });
  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      navToggle.classList.remove("open");
    });
  });
}

// ---------- NAVBAR COUNT BADGE for Read Later ----------
function setNavCountOnLink(link, count) {
  if (!link) return;
  let badge = link.querySelector(".nav-count-pill");
  if (count > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-count-pill";
      // style similar to nav-badge from your CSS (kept inline to be robust)
      badge.style.marginLeft = "0.35rem";
      badge.style.padding = "0.05rem 0.4rem";
      badge.style.borderRadius = "999px";
      badge.style.fontSize = "0.7rem";
      badge.style.background = "#fbbf24";
      badge.style.color = "#111827";
      badge.style.fontWeight = "600";
      badge.style.display = "inline-flex";
      badge.style.alignItems = "center";
      badge.style.justifyContent = "center";
    }
    badge.textContent = count > 99 ? "99+" : String(count);
    // ensure badge appended (avoid duplicates)
    if (!link.contains(badge)) link.appendChild(badge);
  } else if (badge) {
    badge.remove();
  }
}

function updateNavCounts() {
  const rlCount = readLaterItems.length;
  qsa('a[href="/read-later.html"]').forEach((link) =>
    setNavCountOnLink(link, rlCount)
  );
  // remove library badge on this page (avoid confusion)
  qsa('a[href="/library.html"]').forEach((link) => {
    const badge = link.querySelector(".nav-count-pill");
    if (badge) badge.remove();
  });
}

// ---------- Owned materials (my-library) ----------
async function loadOwnedMaterials() {
  try {
    const res = await fetch("/api/my-library");
    if (!res.ok) return;
    const data = await res.json();
    const ids = (data.items || [])
      .map((it) => it.itemId || it.id)
      .filter(Boolean);
    ownedMaterialIds = new Set(ids);
    updateNavCounts();
  } catch (err) {
    console.warn("Unable to load owned materials for Read Later:", err);
  }
}

function isOwned(item) {
  const id = item.itemId || item.id || item.materialId;
  if (!id) return false;
  return ownedMaterialIds.has(id);
}

// ---------- Load Read-Later items (robust) ----------
async function loadReadLaterItems() {
  try {
    const res = await fetch("/api/read-later");
    if (!res.ok) throw new Error("Failed to load read-later");
    const data = await res.json();

    // If API returns items array — great.
    if (data && Array.isArray(data.items) && data.items.length) {
      readLaterItems = data.items;
      updateNavCounts();
      return;
    }

    // If API returned ids but items empty, fallback: fetch materials + map ids
    const ids = (Array.isArray(data.ids) ? data.ids : []).map(String).filter(Boolean);
    if (ids.length) {
      // fetch all materials and pick matching ones
      const matsRes = await fetch("/api/materials");
      if (!matsRes.ok) {
        readLaterItems = [];
        return;
      }
      const mats = await matsRes.json();
      const all = [
        ...(Array.isArray(mats.ebooks) ? mats.ebooks : []).map((d) => ({ ...d, itemType: "ebook", itemId: d.id })),
        ...(Array.isArray(mats.questionPapers) ? mats.questionPapers : []).map((d) => ({ ...d, itemType: "questionPaper", itemId: d.id })),
      ];
      // create a map for quick lookup
      const map = {};
      all.forEach((a) => { map[a.itemId] = a; });
      readLaterItems = ids.map((id) => {
        const found = map[id];
        if (found) return found;
        // fallback: create a minimal stub so it can be removed by user
        return { itemId: id, itemType: "ebook", title: "Untitled material", price: 0 };
      });
      updateNavCounts();
      return;
    }

    // otherwise, no items
    readLaterItems = [];
    updateNavCounts();
  } catch (err) {
    console.error("Error loading read-later items:", err);
    readLaterItems = [];
    updateNavCounts();
  }
}

// ---------- remove single item ----------
async function handleRemoveFromReadLater(materialId) {
  try {
    const res = await fetch("/api/read-later/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
    if (!res.ok) {
      alert("Could not remove from Read Later. Please try again.");
      return;
    }
    const data = await res.json();
    if (data.ok === false) {
      alert(data.message || "Could not remove from Read Later.");
      return;
    }
    // remove locally and re-render
    readLaterItems = readLaterItems.filter(
      (it) => (it.itemId || it.id || it.materialId) !== materialId
    );
    renderReadLater();
    updateNavCounts();
  } catch (err) {
    console.error("handleRemoveFromReadLater error:", err);
    alert("Error removing item from Read Later.");
  }
}

// ---------- add free item to user's library ----------
async function handleAddToLibrary(materialId) {
  try {
    const res = await fetch("/api/library/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      alert("Could not add to library: " + text);
      return;
    }
    const data = await res.json();
    if (data.ok) {
      ownedMaterialIds.add(materialId);
      // update UI badges + re-render
      renderReadLater();
      updateNavCounts();
      alert("Added to your library.");
    } else {
      alert(data.message || "Failed to add to library.");
    }
  } catch (err) {
    console.error("handleAddToLibrary error:", err);
    alert("Error adding item to library.");
  }
}

// ---------- create a library-style card (DOM) ----------
function createLibraryCard(item) {
  const id = item.itemId || item.id || item.materialId || "";
  const typeLabel = item.itemType === "questionPaper" ? "Question Paper" : "E-Book";

  const card = document.createElement("div");
  card.className = "library-card"; // uses your page CSS

  // Top row: title + price + badges
  const top = document.createElement("div");
  top.className = "library-card-top";
  top.style.justifyContent = "space-between";
  top.style.alignItems = "center";

  const left = document.createElement("div");
  left.style.flex = "1";

  const title = document.createElement("div");
  title.className = "library-card-title";
  title.textContent = item.title || "Untitled";

  const meta = document.createElement("div");
  meta.className = "library-card-meta";
  const examText = item.exam || "—";
  const subjectText = item.subject || "—";
  const yearText = item.year || "—";
  meta.textContent = `${examText} • ${subjectText} • ${yearText}`;

  left.appendChild(title);
  left.appendChild(meta);

  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.alignItems = "center";
  right.style.gap = "0.5rem";

  // price pill
  const price = document.createElement("div");
  price.className = "pill-type"; // reuse similar decorative pill styles
  price.style.background = "transparent";
  price.style.border = "none";
  price.style.fontWeight = "600";
  price.textContent = formatPrice(item);
  right.appendChild(price);

  // OWNED badge (if owned)
  if (isOwned(item)) {
    const owned = document.createElement("div");
    owned.className = "pill-owned";
    owned.style.marginLeft = "0.6rem";
    owned.textContent = "Owned";
    right.appendChild(owned);
  }

  top.appendChild(left);
  top.appendChild(right);
  card.appendChild(top);

  // description (short)
  if (item.description) {
    const desc = document.createElement("div");
    desc.style.marginTop = "0.35rem";
    desc.style.fontSize = "0.92rem";
    desc.textContent = item.description;
    card.appendChild(desc);
  }

  // lower info row: reads, purchased date if any
  const footer = document.createElement("div");
  footer.className = "library-card-footer";
  footer.style.marginTop = "0.6rem";

  const leftFooter = document.createElement("div");
  leftFooter.textContent = `Reads: ${item.downloads || 0}`;
  footer.appendChild(leftFooter);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "0.5rem";
  actions.style.alignItems = "center";

  // Open in reader button
  const readerLink = document.createElement("a");
  readerLink.className = "btn small primary";
  readerLink.textContent = isOwned(item) || !isPaidItem(item) ? "Open in reader" : "Preview";
  readerLink.href = `/view/${slugify(item.title || "read")}?id=${encodeURIComponent(id)}`;
  readerLink.target = "_blank";
  readerLink.rel = "noopener";
  actions.appendChild(readerLink);

  // If item is free and not owned => show add-to-library button
  if (!isOwned(item) && !isPaidItem(item)) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn small secondary";
    addBtn.textContent = "Add to library";
    addBtn.addEventListener("click", () => {
      addBtn.disabled = true;
      handleAddToLibrary(id).finally(() => (addBtn.disabled = false));
    });
    actions.appendChild(addBtn);
  }

  // Remove button (remove from read later)
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn small secondary";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => handleRemoveFromReadLater(id));
  actions.appendChild(removeBtn);

  footer.appendChild(actions);
  card.appendChild(footer);

  return card;
}

// ---------- render with filters + stats ----------
function renderReadLater() {
  const list = qs("#read-later-list");
  const empty = qs("#read-later-empty");
  const summary = qs("#read-later-summary");
  const clearBtn = qs("#read-later-clear");
  const filtersRow = qs("#read-later-filters");
  const statsEl = qs("#read-later-stats");

  if (!list) return;

  if (!readLaterItems.length) {
    list.innerHTML = "";
    if (empty) empty.style.display = "block";
    if (summary) summary.textContent = "No items saved yet. Use the 'Read later' button to save materials.";
    if (clearBtn) clearBtn.style.display = "none";
    if (filtersRow) filtersRow.style.display = "none";
    if (statsEl) statsEl.textContent = "";
    updateNavCounts();
    return;
  }

  if (empty) empty.style.display = "none";
  if (filtersRow) filtersRow.style.display = "flex";
  if (clearBtn) clearBtn.style.display = "inline-flex";

  // Read filters
  const typeSelect = qs("#rl-type-filter");
  const priceSelect = qs("#rl-price-filter");
  const sortSelect = qs("#rl-sort");

  const typeVal = typeSelect ? typeSelect.value : "all";
  const priceVal = priceSelect ? priceSelect.value : "all";
  const sortVal = sortSelect ? sortSelect.value : "recent";

  let filtered = [...readLaterItems];
  // 🔍 Search filter (title / exam / subject / year)
  if (readLaterSearchQuery) {
    const q = readLaterSearchQuery;
    filtered = filtered.filter((it) => {
      const haystack = `
      ${it.title || ""}
      ${it.exam || ""}
      ${it.subject || ""}
      ${it.year || ""}
    `.toLowerCase();
      return haystack.includes(q);
    });
  }


  // Type filter
  if (typeVal === "ebook") filtered = filtered.filter((it) => it.itemType !== "questionPaper");
  else if (typeVal === "questionPaper") filtered = filtered.filter((it) => it.itemType === "questionPaper");

  // Price filter
  if (priceVal === "free") filtered = filtered.filter((it) => !isPaidItem(it));
  else if (priceVal === "paid") filtered = filtered.filter((it) => isPaidItem(it));

  // Sorting
  filtered.sort((a, b) => {
    if (sortVal === "title") return (a.title || "").localeCompare(b.title || "");
    if (sortVal === "reads") return (b.downloads || 0) - (a.downloads || 0);
    // recent
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });

  // Render
  list.innerHTML = "";
  filtered.forEach((item) => {
    const card = createLibraryCard(item);
    list.appendChild(card);
  });

  // Summary text
  if (readLaterSearchQuery) {
    summary.textContent = `Found ${filtered.length} result(s) for “${readLaterSearchQuery}”.`;
  } else {
    summary.textContent = `Showing ${filtered.length} of ${readLaterItems.length} item${readLaterItems.length === 1 ? "" : "s"} in Read Later.`;
  }


  // Stats (free / paid / value)
  if (statsEl) {
    const total = readLaterItems.length;
    const freeCount = readLaterItems.filter((it) => !isPaidItem(it)).length;
    const paidCount = total - freeCount;
    const totalValue = readLaterItems.reduce((sum, it) => sum + (isPaidItem(it) ? Number(it.price || 0) : 0), 0);
    if (total === 0) statsEl.textContent = "";
    else if (paidCount === 0) statsEl.textContent = `All ${total} saved items are free.`;
    else statsEl.textContent = `Free: ${freeCount} • Paid: ${paidCount} • Value of paid items: ₹${totalValue}`;
  }

  updateNavCounts();
}

// ---------- clear all ----------
async function handleClearAllReadLater() {
  if (!readLaterItems.length) return;
  const confirmClear = confirm("Remove all items from your Read Later list?");
  if (!confirmClear) return;

  const ids = readLaterItems.map((it) => it.itemId || it.id || it.materialId).filter(Boolean);
  try {
    await Promise.all(
      ids.map((materialId) =>
        fetch("/api/read-later/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ materialId }),
        }).catch(() => null)
      )
    );
  } catch (err) {
    console.error("Error while clearing read-later:", err);
  }
  readLaterItems = [];
  renderReadLater();
  updateNavCounts();
}

// ---------- init ----------
document.addEventListener("DOMContentLoaded", async () => {
  // year placeholder
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // theme + mobile nav + back-to-top
  initMobileNav();
  const savedTheme = localStorage.getItem("studenthub_theme") || "light";
  applyTheme(savedTheme);
  const themeToggleBtn = document.getElementById("theme-toggle");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const next = document.body.classList.contains("dark") ? "light" : "dark";
      applyTheme(next);
    });
  }
  const backToTopBtn = document.getElementById("back-to-top");
  if (backToTopBtn) {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 300) backToTopBtn.classList.add("show");
      else backToTopBtn.classList.remove("show");
    });
    backToTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  // load data (owned first optional, then read-later)
  // owned materials help show OWNED badges correctly
  await loadOwnedMaterials();
  await loadReadLaterItems();
  renderReadLater();

  // wire clear all & filters
  const clearBtn = document.getElementById("read-later-clear");
  if (clearBtn) clearBtn.addEventListener("click", handleClearAllReadLater);

  const typeSelect = document.getElementById("rl-type-filter");
  const priceSelect = document.getElementById("rl-price-filter");
  const sortSelect = document.getElementById("rl-sort");
  const searchInput = document.getElementById("rl-search");
  if (typeSelect) typeSelect.addEventListener("change", renderReadLater);
  if (priceSelect) priceSelect.addEventListener("change", renderReadLater);
  if (sortSelect) sortSelect.addEventListener("change", renderReadLater);
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      readLaterSearchQuery = searchInput.value.toLowerCase().trim();
      renderReadLater();
    });
  }

});
