// submit-pdf.js — multipart file upload to /api/user-submissions (updated)
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("submit-pdf-form");
  const statusEl = document.getElementById("submit-status");
  const submitBtn = document.getElementById("submit-btn");
  const fileInput = document.getElementById("pdf-file");
  const progressWrap = document.getElementById("upload-progress");
  const progressBar = document.getElementById("upload-progress-bar");
  const progressPercent = document.getElementById("upload-percent");

  function setStatus(text = "", type = "") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = "submit-status";
    if (type === "success") statusEl.classList.add("success");
    else if (type === "error") statusEl.classList.add("error");
  }

  function setUploading(isUploading) {
    if (!submitBtn) return;
    submitBtn.disabled = !!isUploading;
    submitBtn.textContent = isUploading ? "Uploading…" : "Submit PDF";
    if (progressWrap) {
      progressWrap.style.display = isUploading ? "block" : "none";
    }
    if (!isUploading && progressBar) {
      setTimeout(() => {
        progressBar.style.width = "0%";
        if (progressPercent) progressPercent.textContent = "";
      }, 600);
    }
  }

  function niceFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setStatus("");

    const title = (document.getElementById("pdf-title") || {}).value || "";
    const description = (document.getElementById("pdf-description") || {}).value || "";
    const type = (document.getElementById("pdf-type") || {}).value || "ebook";
    const exam = (document.getElementById("pdf-exam") || {}).value || "";
    const subject = (document.getElementById("pdf-subject") || {}).value || "";
    const year = (document.getElementById("pdf-year") || {}).value || "";
    const file = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;

    if (!title.trim()) {
      setStatus("Please provide a title for the PDF.", "error");
      document.getElementById("pdf-title").focus();
      return;
    }

    if (!file) {
      setStatus("Please choose a PDF file to upload.", "error");
      if (fileInput) fileInput.focus();
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Only PDF files are accepted.", "error");
      if (fileInput) fileInput.focus();
      return;
    }

    const maxClient = 25 * 1024 * 1024; // 25MB recommended
    if (file.size > maxClient) {
      const proceed = confirm(
        `Selected file is ${niceFileSize(file.size)} (recommended max ${niceFileSize(maxClient)}). Continue?`
      );
      if (!proceed) return;
    }

    const endpoint = "/api/user-submissions";

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("type", type);
    formData.append("exam", exam.trim());
    formData.append("subject", subject.trim());
    formData.append("year", year.trim());
    formData.append("file", file);

    // Debug logging (remove later if desired)
    console.log("FormData: title", title);
    console.log("FormData: description", description);
    console.log("FormData: type", type, "exam", exam, "subject", subject, "year", year);
    console.log("FormData: file", file && file.name, file && file.size);

    setUploading(true);
    setStatus("Starting upload...");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);
    xhr.withCredentials = true; // send cookies

    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        if (progressBar) progressBar.style.width = pct + "%";
        if (progressPercent) progressPercent.textContent = pct + "%";
        setStatus(`Uploading: ${pct}%`);
      }
    });

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;

      setUploading(false);

      let response = null;
      try {
        response = JSON.parse(xhr.responseText || "{}");
      } catch (err) {
        console.warn("Non-JSON response:", xhr.responseText);
      }

      if (xhr.status === 0) {
        setStatus("Network error: failed to reach server.", "error");
        console.error("Upload XHR network error", xhr);
        return;
      }

      if (xhr.status === 401) {
        setStatus("Please sign in to submit PDFs. Redirecting to login…", "error");
        setTimeout(() => {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = "/login.html?next=" + next;
        }, 700);
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        const msg = (response && (response.message || response.msg)) || "Thanks! Your PDF was submitted and is pending review.";
        setStatus(msg, "success");
        form.reset();
        if (progressBar) progressBar.style.width = "0%";
        if (progressPercent) progressPercent.textContent = "";
        return;
      }

      const serverMsg = (response && (response.message || response.error)) || `Upload failed (HTTP ${xhr.status}).`;
      setStatus(serverMsg, "error");
      console.error("Upload error:", xhr.status, xhr.responseText);
    };

    xhr.onerror = function (err) {
      setUploading(false);
      setStatus("Network error during upload. Check console for details.", "error");
      console.error("Upload XHR onerror", err);
    };

    xhr.send(formData);
  });
});
