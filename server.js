// server.js
// StudentHub backend: serves site + handles PDF uploads/deletion + user auth (MongoDB-based)

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
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

// IMPORTANT: PORT for Render / local
const PORT = process.env.PORT || 4000; // http://127.0.0.1:4000

const ADMIN_SECRET = process.env.ADMIN_SECRET || "changeme123";
const JWT_SECRET = process.env.JWT_SECRET || "changeme_jwt_secret";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;

// ---- MongoDB setup ----
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "studenthub";

if (!MONGODB_URI) {
  console.error(
    "[FATAL] MONGODB_URI is not set. Please add it to your .env / Render environment."
  );
  process.exit(1);
}

let db; // will be set after connecting

function usersCollection() {
  return db.collection("users");
}
function ebooksCollection() {
  return db.collection("ebooks");
}
function questionPapersCollection() {
  return db.collection("questionPapers");
}

// -----------------------------
// Middleware
// -----------------------------
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// -----------------------------
// In-memory OTP stores
// -----------------------------
// email verification: { [email]: { code, expiresAt } }
const emailOtps = {};
// password reset: { [email]: { code, expiresAt } }
const resetOtps = {};

// -----------------------------
// SMTP transporter
// -----------------------------
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

// -----------------------------
// Auth helpers
// -----------------------------
function signToken(user) {
  return jwt.sign(
    {
      // prefer Mongo _id if present
      id: user._id ? user._id.toString() : user.id,
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

  const accept = req.headers.accept || "";
  if (accept.includes("text/html")) {
    const redirectTo =
      "/login.html?next=" + encodeURIComponent(req.originalUrl || "/");
    return res.redirect(redirectTo);
  }

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
    const existing = await usersCollection().findOne({ email: emailLower });
    if (existing) {
      return res
        .status(400)
        .json({ ok: false, message: "Email already registered. Please login." });
    }

    const hash = await bcrypt.hash(password, 10);
    const newUser = {
      name: name.trim(),
      email: emailLower,
      passwordHash: hash,
      emailVerified: false,
      provider: "local",
      createdAt: new Date().toISOString(),
    };

    const insertRes = await usersCollection().insertOne(newUser);
    newUser._id = insertRes.insertedId;

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
app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res
        .status(400)
        .json({ ok: false, message: "Email and code are required." });
    }

    const emailLower = email.toLowerCase().trim();
    const otpEntry = emailOtps[emailLower];

    if (!otpEntry || otpEntry.code !== code || otpEntry.expiresAt < Date.now()) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid or expired code." });
    }

    const user = await usersCollection().findOne({ email: emailLower });
    if (!user) {
      return res
        .status(404)
        .json({ ok: false, message: "User not found for this email." });
    }

    await usersCollection().updateOne(
      { email: emailLower },
      { $set: { emailVerified: true } }
    );
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
    const user = await usersCollection().findOne({ email: emailLower });

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

    let user = await usersCollection().findOne({ email: emailLower });

    if (!user) {
      // auto-create user from Google
      const newUser = {
        name,
        email: emailLower,
        passwordHash: "",
        emailVerified: true,
        provider: "google",
        createdAt: new Date().toISOString(),
      };
      const insertRes = await usersCollection().insertOne(newUser);
      newUser._id = insertRes.insertedId;
      user = newUser;
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

// return current logged-in user
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const user = await usersCollection().findOne({ email: req.user.email });
    if (!user) {
      return res
        .status(404)
        .json({ ok: false, message: "User not found for this token." });
    }

    return res.json({
      ok: true,
      user: {
        id: user._id.toString(),
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
app.post("/api/auth/request-reset", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res
        .status(400)
        .json({ ok: false, message: "Email is required." });
    }

    const emailLower = email.toLowerCase().trim();
    const user = await usersCollection().findOne({ email: emailLower });

    if (!user) {
      return res
        .status(404)
        .json({ ok: false, message: "No account found with that email." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetOtps[emailLower] = {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    if (mailTransporter) {
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: emailLower,
        subject: "StudentHub – Password reset code",
        text: `Your password reset code is: ${code}\n\nThis code is valid for 10 minutes.`,
      };
      mailTransporter
        .sendMail(mailOptions)
        .then(() =>
          console.log("[EMAIL] Password reset email sent to:", emailLower)
        )
        .catch((err) => console.error("Reset email error:", err));
    } else {
      console.log(
        "[RESET OTP] Code for",
        emailLower,
        "is:",
        code,
        "(no SMTP; logged only)"
      );
    }

    return res.json({
      ok: true,
      message:
        "If this email exists, we've sent a reset code. Please check your inbox.",
    });
  } catch (err) {
    console.error("request-reset error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

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

    const user = await usersCollection().findOne({ email: emailLower });
    if (!user) {
      return res
        .status(404)
        .json({ ok: false, message: "User not found for this email." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await usersCollection().updateOne(
      { email: emailLower },
      { $set: { passwordHash: hash, emailVerified: true } }
    );

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
// Materials helpers (Mongo)
// -----------------------------
async function getAllMaterials() {
  const ebooks = await ebooksCollection()
    .find({})
    .sort({ createdAt: 1, _id: 1 })
    .toArray();
  const questionPapers = await questionPapersCollection()
    .find({})
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  const mapDoc = (doc) => ({
    title: doc.title || "",
    description: doc.description || "",
    file: doc.file,
    subject: doc.subject || "",
    exam: doc.exam || "",
    year: doc.year || "—",
    createdAt: doc.createdAt || new Date().toISOString(),
    downloads: doc.downloads || 0,
  });

  return {
    ebooks: ebooks.map(mapDoc),
    questionPapers: questionPapers.map(mapDoc),
  };
}

async function getListByType(type) {
  if (type === "ebook") {
    return await ebooksCollection()
      .find({})
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
  }
  if (type === "questionPaper") {
    return await questionPapersCollection()
      .find({})
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
  }
  return null;
}

function collectionByType(type) {
  if (type === "ebook") return ebooksCollection();
  if (type === "questionPaper") return questionPapersCollection();
  return null;
}

// -----------------------------
// Serve PDFs only for logged-in users
// -----------------------------
app.use("/pdfs", requireAuth, express.static(path.join(__dirname, "pdfs")));

// -----------------------------
// Materials API (public listing; files still protected)
// -----------------------------
app.get("/api/materials", async (req, res) => {
  try {
    const data = await getAllMaterials();
    res.json(data);
  } catch (err) {
    console.error("/api/materials error:", err);
    res.status(500).json({ error: "Failed to load materials" });
  }
});

// -----------------------------
// Upload a new PDF & add metadata
// -----------------------------
app.post("/api/upload", (req, res) => {
  upload.single("file")(req, res, async (err) => {
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

      const col = collectionByType(type);
      if (!col) {
        return res.status(400).json({ error: "Invalid type" });
      }

      const relativePath = req.file.path.replace(/\\/g, "/");

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

      await col.insertOne(newItem);

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
app.delete("/api/materials/:type/:index", async (req, res) => {
  try {
    const { type, index } = req.params;
    const i = parseInt(index, 10);

    const list = await getListByType(type);
    if (!list) {
      return res.status(400).json({ error: "Invalid type" });
    }

    if (isNaN(i) || i < 0 || i >= list.length) {
      return res.status(404).json({ error: "Item not found" });
    }

    const item = list[i];
    const col = collectionByType(type);

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

    await col.deleteOne({ _id: item._id });

    res.json({ message: "Deleted successfully", type, index: i });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Server error while deleting item" });
  }
});

// -----------------------------
// Track a download (also requires login)
// -----------------------------
app.get("/api/download/:type/:index", requireAuth, async (req, res) => {
  try {
    const { type, index } = req.params;
    const i = parseInt(index, 10);

    const list = await getListByType(type);
    if (!list) {
      return res.status(400).json({ error: "Invalid type" });
    }

    if (isNaN(i) || i < 0 || i >= list.length) {
      return res.status(404).json({ error: "Item not found" });
    }

    const item = list[i];
    const col = collectionByType(type);

    await col.updateOne(
      { _id: item._id },
      { $set: { downloads: (item.downloads || 0) + 1 } }
    );

    return res.redirect("/" + item.file);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Download tracking failed" });
  }
});

// -----------------------------
// HTML page routes
// -----------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/dashboard.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

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

// -----------------------------
// Start server AFTER Mongo connects
// -----------------------------
async function startServer() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);

    console.log("[MongoDB] Connected to", DB_NAME);

    app.listen(PORT, () => {
      console.log(`StudentHub server running at http://127.0.0.1:${PORT}`);
      console.log("ADMIN_SECRET:", ADMIN_SECRET);
    });
  } catch (err) {
    console.error("[FATAL] Failed to connect to MongoDB:", err);
    process.exit(1);
  }
}

startServer();
