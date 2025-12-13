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
const mongoose = require("mongoose");

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
let mongoClientInstance = null; // keep reference for graceful shutdown

function usersCollection() {
  return db.collection("users");
}
function ebooksCollection() {
  return db.collection("ebooks");
}
function questionPapersCollection() {
  return db.collection("questionPapers");
}
function ordersCollection() {
  return db.collection("orders");
}
function readLaterCollection() {
  return db.collection("readLater");
}
function submissionsCollection() {
  return db.collection("submissions");
}

// -----------------------------
// Middleware (global)
// -----------------------------
app.use(
  cors({
    origin: true, // reflect request origin
    credentials: true, // allow cookies
  })
);
app.use(express.json());
app.use(cookieParser());

// -----------------------------
// Auth helpers
// -----------------------------
function signToken(user) {
  return jwt.sign(
    {
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
    req.user = payload; // { id, email, name }
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
// In-memory OTP stores
// -----------------------------
const emailOtps = {};
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
// USER AUTH ROUTES (unchanged)
// -----------------------------
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
      walletCoins: 0,
      notifications: [],
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

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  return res.json({ ok: true });
});

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
        walletCoins: 0,
        notifications: [],
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
// Submissions: support file upload + legacy URL
// -----------------------------
const submissionsUploadDir = path.join(__dirname, "pdfs", "submissions");
fs.mkdirSync(submissionsUploadDir, { recursive: true });

const submissionsStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, submissionsUploadDir);
  },
  filename: function (req, file, cb) {
    const safe = (file.originalname || "file")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9.\-_\(\)]/g, "");
    cb(null, Date.now() + "-" + safe);
  },
});
const uploadSubmission = multer({
  storage: submissionsStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB limit
});

// POST create submission (supports either file upload or JSON with pdfUrl)
// NOTE: call multer middleware directly. multer will only parse if request
// is multipart/form-data; no need for manual content-type checks.
app.post(
  "/api/user-submissions",
  requireAuth,
  uploadSubmission.single("file"),
  async (req, res) => {
    try {
      // Debug logs to inspect what arrived (helpful for troubleshooting)
      console.log("[SUBMISSION] POST /api/user-submissions hit");
      console.log("  content-type:", req.headers["content-type"] || "(none)");
      console.log("  body keys:", req.body ? Object.keys(req.body) : "(no body)");
      console.log("  file:", req.file ? {
        originalname: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      } : "(none uploaded)");

      // Accept either fields from form-data or JSON body
      const title =
        (req.body && (req.body.title || req.body.pdfTitle)) ||
        (req.body && req.body.name) ||
        "";
      const description = (req.body && req.body.description) || "";
      const pdfUrlFromBody = (req.body && (req.body.pdfUrl || req.body.fileUrl)) || "";

      const user = req.user || null;

      if (!title || (!pdfUrlFromBody && !req.file)) {
        return res
          .status(400)
          .json({ ok: false, message: "title and pdfUrl are required" });
      }

      // If file was uploaded via multer, build the relative web path
      let storedFilePath = null; // relative like "pdfs/submissions/....pdf"
      let publicFileUrl = null; // web path like "/pdfs/submissions/....pdf"

      if (req.file && req.file.path) {
        // req.file.path might be absolute on Windows; convert to relative web path
        let rel = path.relative(__dirname, req.file.path);
        rel = rel.split(path.sep).join("/"); // normalize to forward slashes
        storedFilePath = rel; // e.g. "pdfs/submissions/12345-file.pdf"
        publicFileUrl = "/" + storedFilePath; // e.g. "/pdfs/submissions/..."
      } else if (pdfUrlFromBody) {
        // Accept arbitrary URL (external links) - keep as-is
        publicFileUrl = pdfUrlFromBody.trim();
      }

      const doc = {
        title: (title || "").trim(),
        description: (description || "").trim(),

        // ✅ REQUIRED FIX: save these fields
        exam: (req.body.exam || "").trim(),
        subject: (req.body.subject || "").trim(),
        year: (req.body.year || "").trim(),
        type: (req.body.type || "").trim(), // ebook | questionPaper

        // store both: 'file' stores the relative path when file uploaded
        // 'pdfUrl' stores the original URL (if provided)
        file: storedFilePath,
        pdfUrl: storedFilePath ? null : (publicFileUrl || null),

        userId: user ? user.id : null,
        userEmail: user ? user.email : null,

        status: "pending",
        adminNote: "",
        createdAt: new Date().toISOString(),
        processedAt: null,
      };


      const result = await submissionsCollection().insertOne(doc);
      doc._id = result.insertedId;

      console.log("[SUBMISSION] stored id:", doc._id.toString(), "file:", doc.file, "pdfUrl:", doc.pdfUrl);

      return res.json({
        ok: true,
        message: "Submitted",
        submission: { id: doc._id.toString() },
      });
    } catch (err) {
      console.error("/api/user-submissions (POST) error:", err);
      return res.status(500).json({ ok: false, message: "Server error" });
    }
  }
);

// GET list submissions (admin). Returns fileUrl normalized for frontend.
app.get("/api/user-submissions", requireAuth, async (req, res) => {
  try {
    const { status } = req.query; // optional ?status=approved|rejected|pending
    const q = {};
    if (status) q.status = status;

    const docs = await submissionsCollection().find(q).sort({ createdAt: -1 }).toArray();

    const mapped = docs.map((d) => {
      // Build fileUrl for frontend:
      let fileUrl = "";
      if (d.file) {
        const normalized = d.file.split(path.sep).join("/");
        if (normalized.startsWith("/")) fileUrl = normalized;
        else fileUrl = "/" + normalized;
      } else if (d.pdfUrl) {
        fileUrl = d.pdfUrl;
      }

      return {
        id: d._id.toString(),
        title: d.title || "",
        description: d.description || "",
        fileUrl: fileUrl || "",
        userEmail: d.userEmail || "",
        status: d.status || "pending",
        adminNote: d.adminNote || "",
        createdAt: d.createdAt || "",
        processedAt: d.processedAt || null,
        // optional extra fields (if you added exam/subject/year in future)
        exam: d.exam || "",
        subject: d.subject || "",
        year: d.year || "",
        type: d.type || "",
      };
    });

    return res.json({ ok: true, submissions: mapped });
  } catch (err) {
    console.error("/api/user-submissions (GET) error:", err);
    return res.status(500).json({ ok: false, message: "Server error loading submissions" });
  }
});

// POST approve (admin)
// NOTE: This handler marks submission as "approved" but DOES NOT auto-publish to ebooks.
// Approved submissions remain in submissions collection and will be visible in the admin "Approved" page.
// =============================
// APPROVE SUBMISSION (ADMIN)
// =============================
app.post("/api/user-submissions/:id/approve", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ ok: false, message: "Missing id" });
    }

    const _id = new ObjectId(id);
    const now = new Date().toISOString();

    const adminNote =
      req.body && typeof req.body.adminNote === "string"
        ? req.body.adminNote.trim()
        : "";

    const coinsAwarded = Number.isFinite(Number(req.body?.coinsAwarded))
      ? Number(req.body.coinsAwarded)
      : 0;

    // Update ONLY admin-related fields
    const update = {
      $set: {
        status: "approved",
        processedAt: now,
        adminNote,
      },
    };

    const result = await submissionsCollection().updateOne({ _id }, update);

    if (result.matchedCount === 0) {
      return res.status(404).json({ ok: false, message: "Submission not found" });
    }

    // Fetch submission AFTER approval
    const submission = await submissionsCollection().findOne({ _id });

    // Award coins if applicable
    if (coinsAwarded > 0 && submission?.userEmail) {
      await usersCollection().updateOne(
        { email: submission.userEmail },
        { $inc: { walletCoins: coinsAwarded } }
      );
    }

    // NOTE:
    // exam / subject / year are intentionally NOT modified here
    // They must already exist from submission time

    return res.json({
      ok: true,
      message: "Submission approved successfully",
    });
  } catch (err) {
    console.error("APPROVE submission error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});


// =============================
// REJECT SUBMISSION (ADMIN)
// =============================
app.post("/api/user-submissions/:id/reject", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ ok: false, message: "Missing id" });
    }

    const reason =
      req.body && typeof req.body.reason === "string"
        ? req.body.reason.trim()
        : "";

    const _id = new ObjectId(id);

    const submission = await submissionsCollection().findOne({ _id });
    if (!submission) {
      return res.status(404).json({ ok: false, message: "Submission not found" });
    }

    // Remove uploaded file if exists
    if (submission.file) {
      try {
        const filePath = path.join(__dirname, submission.file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("[SUBMISSION REJECT] File deleted:", filePath);
        }
      } catch (e) {
        console.warn("[SUBMISSION REJECT] File delete failed:", e.message);
      }
    }

    await submissionsCollection().deleteOne({ _id });

    return res.json({
      ok: true,
      message: "Submission rejected and deleted",
      reason,
    });
  } catch (err) {
    console.error("REJECT submission error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});


// =============================
// MATERIAL HELPERS
// =============================
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
    id: doc._id.toString(),
    title: doc.title || "",
    description: doc.description || "",
    file: doc.file,
    exam: doc.exam || "",
    subject: doc.subject || "",
    year: doc.year || "—",
    createdAt: doc.createdAt || new Date().toISOString(),
    downloads: doc.downloads || 0,
    price: typeof doc.price === "number" ? doc.price : 0,
  });

  return {
    ebooks: ebooks.map(mapDoc),
    questionPapers: questionPapers.map(mapDoc),
  };
}

async function getListByType(type) {
  if (type === "ebook") {
    return ebooksCollection()
      .find({})
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
  }

  if (type === "questionPaper") {
    return questionPapersCollection()
      .find({})
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
  }

  return [];
}

function collectionByType(type) {
  if (type === "ebook") return ebooksCollection();
  if (type === "questionPaper") return questionPapersCollection();
  return null;
}

// -----------------------------
// My Library (purchased items)
// -----------------------------
app.get("/api/my-library", requireAuth, async (req, res) => {
  try {
    const orders = await ordersCollection()
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    if (!orders.length) {
      return res.json({ ok: true, items: [] });
    }

    const ebookIds = [];
    const qpIds = [];
    for (const o of orders) {
      if (o.itemType === "ebook") ebookIds.push(new ObjectId(o.itemId));
      else if (o.itemType === "questionPaper")
        qpIds.push(new ObjectId(o.itemId));
    }

    const ebookMap = {};
    const qpMap = {};

    if (ebookIds.length) {
      const docs = await ebooksCollection()
        .find({ _id: { $in: ebookIds } })
        .toArray();
      docs.forEach((d) => {
        ebookMap[d._id.toString()] = d;
      });
    }

    if (qpIds.length) {
      const docs = await questionPapersCollection()
        .find({ _id: { $in: qpIds } })
        .toArray();
      docs.forEach((d) => {
        qpMap[d._id.toString()] = d;
      });
    }

    const items = orders
      .map((o) => {
        const sourceMap = o.itemType === "ebook" ? ebookMap : qpMap;
        const doc = sourceMap[o.itemId];
        if (!doc) return null;

        return {
          orderId: o._id.toString(),
          orderedAt: o.createdAt,
          itemType: o.itemType,
          itemId: o.itemId,
          title: doc.title || "",
          description: doc.description || "",
          subject: doc.subject || "",
          exam: doc.exam || "",
          year: doc.year || "—",
          file: doc.file,
          downloads: doc.downloads || 0,
          price:
            typeof doc.price === "number"
              ? doc.price
              : typeof o.price === "number"
                ? o.price
                : 0,
        };
      })
      .filter(Boolean);

    return res.json({ ok: true, items });
  } catch (err) {
    console.error("/api/my-library error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// -----------------------------
// Add FREE items to library
// -----------------------------
app.post("/api/library/add", requireAuth, async (req, res) => {
  try {
    const { materialId } = req.body || {};
    if (!materialId) {
      return res
        .status(400)
        .json({ ok: false, message: "materialId is required." });
    }

    let _id;
    try {
      _id = new ObjectId(materialId);
    } catch (e) {
      return res.status(400).json({ ok: false, message: "Invalid materialId." });
    }

    let item = await ebooksCollection().findOne({ _id });
    let itemType = "ebook";

    if (!item) {
      item = await questionPapersCollection().findOne({ _id });
      itemType = "questionPaper";
    }

    if (!item) {
      return res
        .status(404)
        .json({ ok: false, message: "Material not found." });
    }

    // Avoid duplicates
    const existing = await ordersCollection().findOne({
      userId: req.user.id,
      itemType,
      itemId: materialId,
    });

    if (existing) {
      return res.json({ ok: true, already: true, message: "Already in library." });
    }

    await ordersCollection().insertOne({
      userId: req.user.id,
      userEmail: req.user.email,
      itemType,
      itemId: materialId,
      price: 0,
      status: "free",
      paymentMethod: "library-add",
      createdAt: new Date().toISOString(),
    });

    return res.json({ ok: true, message: "Added to your library." });
  } catch (err) {
    console.error("/api/library/add error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Server error adding to library." });
  }
});

// -----------------------------
// READ-LATER APIs
// -----------------------------
app.get("/api/read-later", requireAuth, async (req, res) => {
  try {
    const docs = await readLaterCollection()
      .find({ userId: req.user.id })
      .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
      .toArray();

    if (!docs.length) {
      return res.json({ ok: true, ids: [], items: [] });
    }

    const materialIds = docs
      .map((d) => d.materialId)
      .filter(Boolean)
      .map((id) => id.toString());

    const uniqueIds = [...new Set(materialIds)];

    const objectIds = uniqueIds
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    let ebookDocs = [];
    let qpDocs = [];

    if (objectIds.length) {
      ebookDocs = await ebooksCollection()
        .find({ _id: { $in: objectIds } })
        .toArray();
      qpDocs = await questionPapersCollection()
        .find({ _id: { $in: objectIds } })
        .toArray();
    }

    const ebookMap = {};
    const qpMap = {};

    ebookDocs.forEach((d) => {
      ebookMap[d._id.toString()] = d;
    });
    qpDocs.forEach((d) => {
      qpMap[d._id.toString()] = d; // fixed typo here
    });

    const items = docs
      .map((d) => {
        const midStr = d.materialId ? d.materialId.toString() : "";
        if (!midStr) return null;

        const ebook = ebookMap[midStr];
        const qp = qpMap[midStr];
        const doc = ebook || qp;
        if (!doc) return null;

        const itemType = ebook ? "ebook" : "questionPaper";

        return {
          itemId: midStr,
          itemType,
          title: doc.title || "",
          description: doc.description || "",
          subject: doc.subject || "",
          exam: doc.exam || "",
          year: doc.year || "—",
          file: doc.file,
          downloads: doc.downloads || 0,
          price: typeof doc.price === "number" ? doc.price : 0,
          createdAt: doc.createdAt || d.createdAt || new Date().toISOString(),
        };
      })
      .filter(Boolean);

    return res.json({ ok: true, ids: materialIds, items });
  } catch (err) {
    console.error("/api/read-later GET error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Server error loading Read Later." });
  }
});

app.post("/api/read-later/add", requireAuth, async (req, res) => {
  try {
    const { materialId } = req.body || {};
    if (!materialId) {
      return res
        .status(400)
        .json({ ok: false, message: "materialId is required." });
    }

    let _id;
    try {
      _id = new ObjectId(materialId);
    } catch (e) {
      return res.status(400).json({ ok: false, message: "Invalid materialId." });
    }

    let doc = await ebooksCollection().findOne({ _id });
    let itemType = "ebook";
    if (!doc) {
      doc = await questionPapersCollection().findOne({ _id });
      itemType = "questionPaper";
    }
    if (!doc) {
      return res
        .status(404)
        .json({ ok: false, message: "Material not found." });
    }

    const nowIso = new Date().toISOString();

    await readLaterCollection().updateOne(
      { userId: req.user.id, materialId },
      {
        $set: {
          itemType,
          updatedAt: nowIso,
        },
        $setOnInsert: {
          userId: req.user.id,
          materialId,
          createdAt: nowIso,
        },
      },
      { upsert: true }
    );

    return res.json({ ok: true, message: "Saved to Read Later." });
  } catch (err) {
    console.error("/api/read-later/add error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Server error updating Read Later." });
  }
});

app.post("/api/read-later/remove", requireAuth, async (req, res) => {
  try {
    const { materialId } = req.body || {};
    if (!materialId) {
      return res
        .status(400)
        .json({ ok: false, message: "materialId is required." });
    }

    await readLaterCollection().deleteOne({
      userId: req.user.id,
      materialId,
    });

    return res.json({ ok: true, message: "Removed from Read Later." });
  } catch (err) {
    console.error("/api/read-later/remove error:", err);
    return res
      .status(500)
      .json({ ok: false, message: "Server error updating Read Later." });
  }
});

// -----------------------------
// Purchases (unchanged)
// -----------------------------
app.post("/api/purchases", requireAuth, async (req, res) => {
  try {
    const { materialId, amountPaid, paymentId } = req.body || {};

    if (!materialId) {
      return res.status(400).json({ ok: false, message: "materialId is required." });
    }

    let item = null;
    let itemType = null;

    try {
      const _id = new ObjectId(materialId);
      item = await ebooksCollection().findOne({ _id });
      if (item) itemType = "ebook";
      if (!item) {
        item = await questionPapersCollection().findOne({ _id });
        if (item) itemType = "questionPaper";
      }
    } catch (e) {
      return res.status(400).json({ ok: false, message: "Invalid materialId." });
    }

    if (!item || !itemType) {
      return res
        .status(404)
        .json({ ok: false, message: "Material not found for given id." });
    }

    const price =
      typeof item.price === "number"
        ? item.price
        : Number(amountPaid) || 0;

    const existing = await ordersCollection().findOne({
      userId: req.user.id,
      itemType: itemType,
      itemId: item._id.toString(),
    });

    if (!existing) {
      await ordersCollection().insertOne({
        userId: req.user.id,
        userEmail: req.user.email,
        itemType,
        itemId: materialId,
        price,
        status: "success",
        paymentMethod: "demo-paywall",
        paymentId: paymentId || null,
        createdAt: new Date().toISOString(),
      });

      console.log(
        `[ORDER] Created demo paywall purchase for ${req.user.email} on ${itemType} ${materialId} for ₹${price}`
      );
    }

    return res.json({ ok: true, message: "Purchase recorded." });
  } catch (err) {
    console.error("/api/purchases error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// -----------------------------
// Materials API (public listing; files still protected by /pdfs above)
// -----------------------------
// Secure PDF serving (works with iframe/pdf viewer)
// Secure PDF serving (Node 22 / Express safe)


// -----------------------------
// Admin upload route (unchanged)
// -----------------------------
app.post("/api/upload", (req, res) => {
  const storage = multer.diskStorage({
    destination: function (req2, file, cb) {
      const type = req2.body.type; // "ebook" or "questionPaper"
      let dest = "pdfs/others";

      if (type === "ebook") {
        dest = "pdfs/ebooks";
      } else if (type === "questionPaper") {
        dest = "pdfs/question-papers";
      }

      fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    },
    filename: function (req2, file, cb) {
      const original = file.originalname.toLowerCase().replace(/\s+/g, "-");
      cb(null, Date.now() + "-" + original);
    },
  });

  const upload = multer({ storage });

  upload.single("file")(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ error: err.message || "Upload failed" });
    }

    try {
      const { type, title, description, subject, exam, year, price } = req.body;

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

      const numericPrice = Number(price);
      const finalPrice =
        Number.isFinite(numericPrice) && numericPrice > 0
          ? numericPrice
          : 0;

      const newItem = {
        title: (title || "").trim(),
        description: (description || "").trim(),
        file: relativePath,
        subject: (subject || "").trim(),
        exam: (exam || "").trim(),
        year: (year || "").trim() || "—",
        createdAt: new Date().toISOString(),
        downloads: 0,
        price: finalPrice,
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
// Track a "read" (view in reader)
// -----------------------------
app.post("/api/materials/:id/track-read", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ ok: false, message: "id is required." });
    }

    let _id;
    try {
      _id = new ObjectId(id);
    } catch (e) {
      return res.status(400).json({ ok: false, message: "Invalid id format." });
    }

    let col = ebooksCollection();
    let doc = await col.findOne({ _id });

    if (!doc) {
      col = questionPapersCollection();
      doc = await col.findOne({ _id });
    }

    if (!doc) {
      return res.status(404).json({ ok: false, message: "Material not found." });
    }

    const current = doc.downloads || 0;
    const next = current + 1;

    await col.updateOne({ _id }, { $set: { downloads: next } });

    return res.json({ ok: true, downloads: next });
  } catch (err) {
    console.error("/api/materials/:id/track-read error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// -----------------------------
// Track download (login required)
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
    const price = typeof item.price === "number" ? item.price : 0;

    if (price > 0) {
      const existingOrder = await ordersCollection().findOne({
        userId: req.user.id,
        itemType: type,
        itemId: item._id.toString(),
      });

      if (!existingOrder) {
        await ordersCollection().insertOne({
          userId: req.user.id,
          userEmail: req.user.email,
          itemType: type,
          itemId: item._id.toString(),
          price,
          status: "success",
          paymentMethod: "test-free",
          paymentId: null,
          createdAt: new Date().toISOString(),
        });
        console.log(
          `[ORDER] Created test purchase for user ${req.user.email} on ${type} ${item._id.toString()} for ₹${price}`
        );
      }
    }

    await col.updateOne(
      { _id: item._id },
      { $set: { downloads: (item.downloads || 0) + 1 } }
    );

    // If file is stored as relative path, redirect to '/pdfs/...' else to given file path
    if (item.file) {
      // ensure leading slash
      let url = item.file.split(path.sep).join("/");
      if (!url.startsWith("/")) url = "/" + url;
      return res.redirect(url);
    }

    return res.redirect("/" + (item.file || "").replace(/\\/g, "/"));
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Download tracking failed" });
  }
});

// -----------------------------
// HTML page routes (user side)
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
app.get("/library.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "library.html"));
});
app.get("/read-later.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "read-later.html"));
});
app.get("/submit-pdf.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "submit-pdf.html"));
});
app.get("/my-submissions.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "my-submissions.html"));
});
app.get("/wallet.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "wallet.html"));
});

// -----------------------------
// ADMIN PAGES
// -----------------------------
app.get("/admin.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});
app.get("/admin-materials.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-materials.html"));
});
app.get("/admin-submissions.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-submissions.html"));
});
app.get("/admin-withdrawals.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-withdrawals.html"));
});
app.get("/admin-approved.html", (req, res) => {
  // If you created admin-approved.html, this will serve it
  res.sendFile(path.join(__dirname, "admin-approved.html"));
});



// =============================
// SECURE PDF SERVING (KEEP HERE)
// =============================
// =============================
// SECURE PDF SERVING (EXPRESS 5 SAFE)
// =============================
app.get(/^\/pdfs\/(.+)$/, requireAuth, (req, res) => {
  try {
    // Regex capture group
    const relativePath = req.params[0];

    const pdfRoot = path.join(__dirname, "pdfs");
    const filePath = path.join(pdfRoot, relativePath);

    // Path traversal protection
    if (!filePath.startsWith(pdfRoot)) {
      return res.status(403).send("Forbidden");
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");

    res.sendFile(filePath);
  } catch (err) {
    console.error("PDF serve error:", err);
    res.status(500).send("Error serving PDF");
  }
});



// -----------------------------
// Static files
// -----------------------------
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
    // Create native MongoDB client
    const client = new MongoClient(MONGODB_URI);
    mongoClientInstance = client;

    await client.connect();
    db = client.db(DB_NAME);

    console.log("[MongoDB] Connected to", DB_NAME);

    // Make db accessible to routes and other code
    app.locals.db = db;
    app.locals.mongoClient = client;

    // Mongoose connect (so models/* based on mongoose still work)
    try {
      await mongoose.connect(MONGODB_URI, {
        dbName: DB_NAME,
      });
      console.log("[Mongoose] Connected to", DB_NAME);
    } catch (mErr) {
      console.warn(
        "[Mongoose] Failed to connect (continuing, native driver connected):",
        mErr && mErr.message ? mErr.message : mErr
      );
    }

    // Try to mount optional route modules (if present)
    try {
      const userRewardsModule = require("./routes/userRewards");
      if (typeof userRewardsModule === "function") {
        try {
          const router = userRewardsModule(db, {
            requireAuth,
            addNotification: require("./utils/notifications")?.addNotification,
            ObjectId,
          });
          app.use("/api", router);
          console.log("[Routes] Mounted routes/userRewards (factory)");
        } catch (callErr) {
          console.warn(
            "[Routes] userRewards exported function but calling it failed:",
            callErr.message || callErr
          );
          app.use("/api", userRewardsModule);
          console.log("[Routes] Mounted routes/userRewards (fallback)");
        }
      } else {
        app.use("/api", userRewardsModule);
        console.log("[Routes] Mounted routes/userRewards");
      }
    } catch (err) {
      console.warn("[Routes] Could not mount routes/userRewards:", err && err.message ? err.message : err);
    }

    try {
      const adminRewards = require("./routes/adminRewards");
      if (typeof adminRewards === "function") {
        try {
          const router = adminRewards(db, { requireAuth, ObjectId });
          app.use("/api", router);
          console.log("[Routes] Mounted routes/adminRewards (factory)");
        } catch (callErr) {
          console.warn(
            "[Routes] adminRewards exported function but calling it failed:",
            callErr.message || callErr
          );
          app.use("/api", adminRewards);
          console.log("[Routes] Mounted routes/adminRewards (fallback)");
        }
      } else {
        app.use("/api", adminRewards);
        console.log("[Routes] Mounted routes/adminRewards");
      }
    } catch (err) {
      console.warn("[Routes] Could not mount routes/adminRewards:", err && err.message ? err.message : err);
    }

    app.listen(PORT, () => {
      console.log(`StudentHub server running at http://127.0.0.1:${PORT}`);
      console.log("ADMIN_SECRET:", ADMIN_SECRET);
    });

    // Graceful shutdown
    const gracefulClose = async () => {
      console.log("\n[INFO] Graceful shutdown initiated.");
      try {
        if (mongoClientInstance) {
          await mongoClientInstance.close();
          console.log("[MongoDB] Native client closed.");
        }
      } catch (e) {
        console.warn("[MongoDB] Error closing native client:", e && e.message ? e.message : e);
      }
      try {
        await mongoose.disconnect();
        console.log("[Mongoose] Disconnected.");
      } catch (e) {
        // ignore
      }
      process.exit(0);
    };

    process.on("SIGINT", gracefulClose);
    process.on("SIGTERM", gracefulClose);
  } catch (err) {
    console.error("[FATAL] Failed to connect to MongoDB:", err);
    try {
      if (mongoClientInstance) await mongoClientInstance.close();
    } catch (_) { }
    process.exit(1);
  }
}

startServer();

