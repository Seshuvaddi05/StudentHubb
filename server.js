// server.js
// StudentHub backend: serves site + handles PDF uploads/deletion + user auth

require("dotenv").config();


const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");

const app = express();

// IMPORTANT: PORT for Render / local
const PORT = process.env.PORT || 4000; // http://127.0.0.1:4000

const ADMIN_SECRET = process.env.ADMIN_SECRET || "changeme123";
const JWT_SECRET = process.env.JWT_SECRET || "changeme_jwt_secret";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// -----------------------------
// Helpers for auth & storage
// -----------------------------
const USERS_FILE = path.join(__dirname, "users.json");
const DATA_FILE = path.join(__dirname, "data.json");

// in-memory OTP stores
// email verification: { [email]: { code, expiresAt } }
const emailOtps = {};
// password reset: { [email]: { code, expiresAt } }
const resetOtps = {};

// SMTP transporter (optional – logs OTP if not configured)
let mailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  console.log("[EMAIL] SMTP transporter configured.");
} else {
  console.log(
    "[EMAIL] SMTP is NOT fully configured. OTPs will only be logged to console."
  );
}

// ---- JSON helpers ----
function readJsonSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf-8");
      return fallback;
    }
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading", file, err);
    return fallback;
  }
}

function writeJsonSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function readData() {
  return readJsonSafe(DATA_FILE, { ebooks: [], questionPapers: [] });
}
function writeData(data) {
  writeJsonSafe(DATA_FILE, data);
}

function readUsers() {
  return readJsonSafe(USERS_FILE, { users: [] });
}
function writeUsers(usersObj) {
  writeJsonSafe(USERS_FILE, usersObj);
}

// ---- Auth helpers ----
function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// attach req.user if token cookie present
function attachUserFromCookie(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
  } catch (err) {
    // ignore invalid token
  }
  next();
}

app.use(attachUserFromCookie);

// require auth middleware (for protected routes)
function requireAuth(req, res, next) {
  if (req.user) return next();

  // If browser expects HTML, redirect to login
  const accept = req.headers.accept || "";
  if (accept.includes("text/html")) {
    const redirectTo =
      "/login.html?next=" + encodeURIComponent(req.originalUrl || "/");
    return res.redirect(redirectTo);
  }

  // Otherwise JSON
  return res.status(401).json({ ok: false, error: "Not authenticated" });
}

// -----------------------------
// Multer storage (for PDFs)
// -----------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const type = req.body.type; // "ebook" or "questionPaper"
    let dest = "pdfs/others";

    if (type === "ebook") {
      dest = "pdfs/ebooks";
    } else if (type === "questionPaper") {
      dest = "pdfs/question-papers";
    }

    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const original = file.originalname.toLowerCase().replace(/\s+/g, "-");
    cb(null, Date.now() + "-" + original);
  },
});

const upload = multer({ storage });

// -----------------------------
// Simple admin login route
// -----------------------------
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ ok: false, message: "Password required" });
  }

  if (password === ADMIN_SECRET) {
    return res.json({ ok: true, message: "Welcome admin" });
  }

  return res.status(401).json({ ok: false, message: "Invalid password" });
});

// -----------------------------
// USER AUTH ROUTES
// -----------------------------

// Register user + send OTP
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ ok: false, message: "Name, email and password are required." });
    }

    const emailLower = email.toLowerCase().trim();
    const usersObj = readUsers();
    const existing = usersObj.users.find((u) => u.email === emailLower);
    if (existing) {
      return res
        .status(400)
        .json({ ok: false, message: "Email already registered. Please login." });
    }

    const hash = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      name: name.trim(),
      email: emailLower,
      passwordHash: hash,
      emailVerified: false,
      provider: "local",
      createdAt: new Date().toISOString(),
    };

    usersObj.users.push(newUser);
    writeUsers(usersObj);

    // Create OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    emailOtps[emailLower] = {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    // Send or log OTP
    if (mailTransporter) {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: emailLower,
        subject: "StudentHub – Email verification code",
        text: `Your verification code is: ${code}\n\nThis code is valid for 10 minutes.`,
      };
      await mailTransporter.sendMail(mailOptions);
      console.log("[EMAIL] Verification email sent to:", emailLower);
    } else {
      console.log(
        "[OTP] Verification code for",
        emailLower,
        "is:",
        code,
        "(no SMTP; logged only)"
      );
    }

    return res.json({
      ok: true,
      message:
        "Registered successfully. We've sent a verification code to your email.",
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Verify email with OTP
app.post("/api/auth/verify-email", (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res
        .status(400)
        .json({ ok: false, message: "Email and code are required." });
    }

    const emailLower = email.toLowerCase().trim();
    const otpEntry = emailOtps[emailLower];

    if (
      !otpEntry ||
      otpEntry.code !== code ||
      otpEntry.expiresAt < Date.now()
    ) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid or expired code." });
    }

    // Mark user as verified
    const usersObj = readUsers();
    const user = usersObj.users.find((u) => u.email === emailLower);
    if (!user) {
      return res
        .status(404)
        .json({ ok: false, message: "User not found for this email." });
    }

    user.emailVerified = true;
    writeUsers(usersObj);
    delete emailOtps[emailLower];

    return res.json({ ok: true, message: "Email verified. You can login now." });
  } catch (err) {
    console.error("Verify email error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Normal email/password login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, message: "Email and password required." });
    }

    const emailLower = email.toLowerCase().trim();
    const usersObj = readUsers();
    const user = usersObj.users.find((u) => u.email === emailLower);

    if (!user) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid email or password." });
    }

    if (!user.emailVerified && user.provider === "local") {
      return res.status(403).json({
        ok: false,
        message: "Please verify your email before logging in.",
      });
    }

    if (user.provider === "local") {
      const match = await bcrypt.compare(password, user.passwordHash || "");
      if (!match) {
        return res
          .status(400)
          .json({ ok: false, message: "Invalid email or password." });
      }
    }

    const token = signToken(user);
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      ok: true,
      user: { name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  return res.json({ ok: true });
});

// Google login with Google Identity Services (ID token)
app.post("/api/auth/google", async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res
        .status(400)
        .json({ ok: false, message: "Missing Google ID token." });
    }
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        ok: false,
        message: "Google login not configured on server.",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res
        .status(400)
        .json({ ok: false, message: "Unable to read Google account email." });
    }

    const emailLower = payload.email.toLowerCase().trim();
    const name = payload.name || emailLower;

    const usersObj = readUsers();
    let user = usersObj.users.find((u) => u.email === emailLower);

    if (!user) {
      // auto-create user from Google
      user = {
        id: Date.now().toString(),
        name,
        email: emailLower,
        passwordHash: "",
        emailVerified: true,
        provider: "google",
        createdAt: new Date().toISOString(),
      };
      usersObj.users.push(user);
      writeUsers(usersObj);
    }

    const token = signToken(user);
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({ ok: true, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error("Google auth error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to login with Google.",
    });
  }
});

// NEW: return current logged-in user
app.get("/api/me", requireAuth, (req, res) => {
  try {
    const usersObj = readUsers();
    const user = usersObj.users.find((u) => u.id === req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ ok: false, message: "User not found for this token." });
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        provider: user.provider,
      },
    });
  } catch (err) {
    console.error("/api/me error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ================================
// PASSWORD RESET FLOW
// ================================

// Request password reset: send OTP
app.post("/api/auth/request-reset", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res
        .status(400)
        .json({ ok: false, message: "Email is required." });
    }

    const emailLower = email.toLowerCase().trim();
    const usersObj = readUsers();
    const user = usersObj.users.find((u) => u.email === emailLower);

    // For security, do NOT reveal whether the email exists.
    // Only create + send OTP if user exists.
    if (user) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      resetOtps[emailLower] = {
        code,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      };

      try {
        if (mailTransporter) {
          const mailOptions = {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: emailLower,
            subject: "StudentHub – Password reset code",
            text: `Your password reset code is: ${code}\n\nThis code is valid for 10 minutes.`,
          };
          await mailTransporter.sendMail(mailOptions);
          console.log("[EMAIL] Password reset email sent to:", emailLower);
        } else {
          console.log(
            "[RESET OTP] Password reset code for",
            emailLower,
            "is:",
            code,
            "(no SMTP; logged only)"
          );
        }
      } catch (mailErr) {
        console.error("Reset email send error:", mailErr);
        // Still log the code as fallback
        console.log(
          "[RESET OTP - FALLBACK] Code for",
          emailLower,
          "is:",
          resetOtps[emailLower]?.code
        );
      }
    }

    // Always respond success (even if user not found / email failed),
    // so frontend doesn't show an error message.
    return res.json({
      ok: true,
      message:
        "If this email exists, a reset code has been sent. Please check your inbox or spam.",
    });
  } catch (err) {
    console.error("request-reset error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Server error sending reset code." });
  }
});

// Reset password using OTP
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!email || !code || !newPassword) {
      return res.status(400).json({
        ok: false,
        message: "Email, code and new password are required.",
      });
    }

    const emailLower = email.toLowerCase().trim();
    const entry = resetOtps[emailLower];

    if (!entry || entry.code !== code || entry.expiresAt < Date.now()) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid or expired reset code." });
    }

    const usersObj = readUsers();
    const user = usersObj.users.find((u) => u.email === emailLower);
    if (!user) {
      return res
        .status(404)
        .json({ ok: false, message: "User not found for this email." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = hash;
    // If they reset using email, we can safely mark email as verified
    user.emailVerified = true;
    writeUsers(usersObj);
    delete resetOtps[emailLower];

    return res.json({
      ok: true,
      message: "Password updated successfully. Please login with your new password.",
    });
  } catch (err) {
    console.error("reset-password error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// -----------------------------
// Serve PDFs only for logged-in users
// -----------------------------
app.use("/pdfs", requireAuth, express.static(path.join(__dirname, "pdfs")));

// -----------------------------
// Materials API (public listing; files still protected)
// -----------------------------
app.get("/api/materials", (req, res) => {
  const data = readData();
  res.json(data);
});

// -----------------------------
// Upload a new PDF & add metadata (admin page uses this)
// -----------------------------
app.post("/api/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ error: err.message || "Upload failed" });
    }

    try {
      const { type, title, description, subject, exam, year } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (!type || !title) {
        return res.status(400).json({ error: "Type and title are required" });
      }

      const relativePath = req.file.path.replace(/\\/g, "/");
      const data = readData();

      const newItem = {
        title: (title || "").trim(),
        description: (description || "").trim(),
        file: relativePath,
        subject: (subject || "").trim(),
        exam: (exam || "").trim(),
        year: (year || "").trim() || "—",
        createdAt: new Date().toISOString(),
        downloads: 0,
      };

      if (type === "ebook") {
        data.ebooks.push(newItem);
      } else if (type === "questionPaper") {
        data.questionPapers.push(newItem);
      } else {
        return res.status(400).json({ error: "Invalid type" });
      }

      writeData(data);

      res.json({
        message: "Uploaded successfully",
        item: newItem,
      });
    } catch (err2) {
      console.error("Upload handler error:", err2);
      res.status(500).json({ error: "Server error while uploading file" });
    }
  });
});

// -----------------------------
// Delete a material + its PDF
// -----------------------------
app.delete("/api/materials/:type/:index", (req, res) => {
  try {
    const { type, index } = req.params;
    const i = parseInt(index, 10);

    const data = readData();
    let list;

    if (type === "ebook") {
      list = data.ebooks;
    } else if (type === "questionPaper") {
      list = data.questionPapers;
    } else {
      return res.status(400).json({ error: "Invalid type" });
    }

    if (isNaN(i) || i < 0 || i >= list.length) {
      return res.status(404).json({ error: "Item not found" });
    }

    const item = list[i];

    if (item.file) {
      const filePath = path.join(__dirname, item.file);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.warn("Could not delete file:", filePath, e.message);
      }
    }

    list.splice(i, 1);
    writeData(data);

    res.json({ message: "Deleted successfully", type, index: i });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Server error while deleting item" });
  }
});

// -----------------------------
// Track a download (also requires login)
// -----------------------------
app.get("/api/download/:type/:index", requireAuth, (req, res) => {
  try {
    const { type, index } = req.params;
    const i = parseInt(index, 10);

    const data = readData();
    let list;

    if (type === "ebook") list = data.ebooks;
    else if (type === "questionPaper") list = data.questionPapers;
    else return res.status(400).json({ error: "Invalid type" });

    if (isNaN(i) || i < 0 || i >= list.length) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Increase download counter
    list[i].downloads = (list[i].downloads || 0) + 1;
    writeData(data);

    // Redirect to PDF file (protected by /pdfs auth)
    return res.redirect("/" + list[i].file);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Download tracking failed" });
  }
});

// -----------------------------
// HTML page routes
// -----------------------------

// Home (public – but PDFs still require login)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Login page (public)
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// Dashboard page – must be logged in
app.get("/dashboard.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Viewer page – must be logged in
app.get("/view/:slug", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "view.html"));
});

// Static files (CSS, JS, images, admin.html, etc.)
app.use(express.static(__dirname));

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(PORT, () => {
  console.log(`StudentHub server running at http://127.0.0.1:${PORT}`);
  console.log("ADMIN_SECRET:", ADMIN_SECRET);
});
