// view.js – viewer page logic

document.addEventListener("DOMContentLoaded", async () => {
  const yearSpan = document.getElementById("year");
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  const slug = window.location.pathname.split("/").pop();

  const titleEl = document.getElementById("view-title");
  const descEl = document.getElementById("view-description");
  const metaEl = document.getElementById("view-meta");
  const extraEl = document.getElementById("view-extra");
  const frameEl = document.getElementById("view-frame");
  const openPdfBtn = document.getElementById("view-open-pdf");
  const downloadBtn = document.getElementById("view-download");
  const statusEl = document.getElementById("view-status");

  if (!slug) {
    if (titleEl) titleEl.textContent = "Material not found";
    if (statusEl) statusEl.textContent = "Invalid URL. Please go back to the home page.";
    return;
  }

  try {
    const res = await fetch(`/api/material-by-slug/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      if (titleEl) titleEl.textContent = "Material not found";
      if (statusEl) statusEl.textContent =
        "We could not find this material. It may have been removed.";
      return;
    }

    const data = await res.json();
    const item = data.item;
    const type = data.type;
    const index = data.index;

    document.title = `${item.title} – StudentHub`;

    if (titleEl) titleEl.textContent = item.title || "Untitled";
    if (descEl) {
      descEl.textContent =
        item.description || "No description was provided for this material.";
    }

    if (metaEl) {
      const exam = item.exam || "—";
      const subject = item.subject || "—";
      const year = item.year || "—";
      metaEl.textContent = `Exam: ${exam} | Subject: ${subject} | Year: ${year}`;
    }

    if (extraEl) {
      extraEl.textContent = `Type: ${
        type === "ebook" ? "E-Book" : "Question Paper"
      } · Downloads: ${item.downloads || 0}`;
    }

    const filePath = item.file.startsWith("/") ? item.file : "/" + item.file;

    if (frameEl) {
      frameEl.src = filePath;
    }

    if (openPdfBtn) {
      openPdfBtn.href = filePath;
    }

    if (downloadBtn) {
      downloadBtn.href = `/api/download/${type}/${index}`;
    }

    if (statusEl) {
      statusEl.textContent = "If the PDF does not load, click 'Open full PDF' above.";
    }
  } catch (err) {
    console.error("Error loading material by slug:", err);
    if (titleEl) titleEl.textContent = "Error loading material";
    if (statusEl) {
      statusEl.textContent =
        "Something went wrong while loading this material. Please try again later.";
    }
  }
});
