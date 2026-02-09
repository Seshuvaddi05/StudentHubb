// ========================================
// StudentHub Global Guard (FIXED VERSION)
// ========================================

// Always check fresh login state
async function isLoggedIn() {
  try {
    const res = await fetch("/api/me", {
      credentials: "include",
      cache: "no-store" // ⭐ VERY IMPORTANT
    });

    return res.ok;
  } catch {
    return false;
  }
}


// ========================================
// Protect full page
// ========================================
async function protectPage() {
  if (!document.body.hasAttribute("data-protected")) return;

  const ok = await isLoggedIn();

  if (!ok) {
    window.location.replace("/login.html");
  }
}


// ========================================
// Protect links/buttons (LIVE check)
// ========================================
function protectElements() {
  document.addEventListener("click", async (e) => {

    // only handle anchors with data-protected
    const el = e.target.closest("a[data-protected]");
    if (!el) return;

    const href = el.getAttribute("href");

    // safety check
    if (!href || href === "#" || href === "null") return;

    e.preventDefault();

    const ok = await isLoggedIn();

    if (!ok) {
      window.location.href = "/login.html";
    } else {
      window.location.href = href;
    }

  });
}



// ========================================
// Protect dynamic PDF card buttons
// ========================================
function protectDynamicCards() {

  document.addEventListener("click", async (e) => {

    const btn = e.target.closest(".card button, .card a");
    if (!btn) return;

    const text = btn.innerText.toLowerCase();

    const restricted = [
      "quick preview",
      "open reader",
      "add to library",
      "read later"
    ];

    if (!restricted.some(r => text.includes(r))) return;

    e.preventDefault();

    const ok = await isLoggedIn();

    if (!ok) {
      window.location.href = "/login.html";
    }

  });

}


// ========================================
// INIT
// ========================================
document.addEventListener("DOMContentLoaded", () => {
  protectPage();
  protectElements();
  protectDynamicCards();
});
