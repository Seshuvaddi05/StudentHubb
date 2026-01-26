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
const Request = require("./models/Request");
// Razorpay
const razorpay = require("./utils/razorpay");
const Payment = require("./models/Payment");
const crypto = require("crypto");


const app = express();

// IMPORTANT: PORT for Render / local
const PORT = process.env.PORT || 4000; // http://127.0.0.1:4000

const ADMIN_SECRET = process.env.ADMIN_SECRET || "changeme123";
const JWT_SECRET = process.env.JWT_SECRET || "changeme_jwt_secret";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleClient = GOOGLE_CLIENT_ID
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;


// admin quiz routes must be protected
const auth = require("./middleware/auth");
const adminOnly = require("./middleware/adminOnly");


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
function withdrawalsCollection() {
  return db.collection("withdrawals");
}
function walletLedgerCollection() {
  return db.collection("walletLedger");
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


app.use(
  "/api/admin/quiz",
  auth,
  adminOnly,
  require("./routes/adminQuiz")
);

// ✅ USER QUIZ ROUTES (leaderboard, submit, etc)
const quizRoutes = require("./routes/quiz");
app.use("/api/quiz", quizRoutes);


// ✅ ADD THESE TWO LINES EXACTLY HERE
const adminQuizQuestions = require("./routes/adminQuizQuestions");
app.use("/api", adminQuizQuestions);

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
// Withdrawal email helper
// -----------------------------
async function sendWithdrawalEmail(to, subject, text) {
  if (!mailTransporter) {
    console.log("[EMAIL SKIPPED]", subject, "→", to);
    return;
  }

  await mailTransporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

// -----------------------------
// Simple admin login route
// -----------------------------
app.post("/api/admin/login", async (req, res) => {
  const { password } = req.body || {};

  if (!password) {
    return res.status(400).json({ ok: false, message: "Password required" });
  }

  if (password !== ADMIN_SECRET) {
    return res.status(401).json({ ok: false, message: "Invalid password" });
  }

  // 🔑 Create admin token
  const token = jwt.sign(
    {
      id: "admin",
      email: process.env.ADMIN_EMAIL,
      name: "Admin",
      role: "admin", // 🔥 REQUIRED
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );


  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({ ok: true, message: "Admin logged in" });
});


// ================================
// USER: MATERIAL REQUEST API
// ================================
app.post("/api/requests", async (req, res) => {
  try {
    const { name, email, materialType, examSubject, details } = req.body;

    if (!name || !email || !materialType || !details) {
      return res.status(400).json({
        ok: false,
        message: "Name, email, material type and details are required",
      });
    }

    await Request.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      materialType,
      examSubject: examSubject || "",
      details: details || "",
      createdAt: new Date(),
    });

    return res.json({
      ok: true,
      message: "Request submitted successfully",
    });
  } catch (err) {
    console.error("/api/requests error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
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
      createdAt: new Date(),
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
      path: "/",
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



// =======================
// 👉 ADD RAZORPAY CODE HERE 👇
// =======================
app.post("/api/create-order", auth, async (req, res) => {
  try {
    const { pdfId, amount } = req.body;

    if (!pdfId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      receipt: `pdf_${pdfId.toString().slice(-8)}`, // 🔥 FIX
    });

    const payment = await Payment.create({
      userId: req.user.id,
      pdfId,
      razorpayOrderId: order.id,
      amount,
      status: "created",
      createdAt: new Date(),
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      key: process.env.RAZORPAY_KEY_ID,
      paymentId: payment._id,
    });
  } catch (err) {
    console.error("create-order error:", err);
    res.status(500).json({
      success: false,
      message: err?.error?.description || "Order creation failed",
    });
  }
});


// ================================
// VERIFY RAZORPAY PAYMENT (FINAL)
// ================================
app.post("/api/verify-payment", auth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !paymentId
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification data",
      });
    }

    // 🔐 VERIFY SIGNATURE
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // 🔎 FETCH PAYMENT RECORD
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // 🚫 PREVENT DOUBLE CONFIRMATION
    if (payment.status === "success") {
      return res.json({ success: true, alreadyVerified: true });
    }

    // ✅ UPDATE PAYMENT STATUS
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = "success";
    await payment.save();

    await ordersCollection().updateOne(
      {
        userId: req.user.id,
        itemType: "ebook",
        itemId: payment.pdfId.toString(),
      },
      {
        $set: {
          userId: req.user.id,
          userEmail: req.user.email,
          itemType: "ebook",
          itemId: payment.pdfId.toString(),
          price: payment.amount,
          status: "success",
          paymentMethod: "razorpay",
          paymentId: razorpay_payment_id,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // 📚 ADD TO USER LIBRARY (orders collection)
    await ordersCollection().updateOne(
      {
        userId: req.user.id,
        itemType: "ebook", // later you can derive dynamically
        itemId: payment.pdfId.toString(),
      },
      {
        $setOnInsert: {
          userId: req.user.id,
          userEmail: req.user.email,
          itemType: "ebook",
          itemId: payment.pdfId.toString(),
          price: payment.amount,
          status: "success",
          paymentMethod: "razorpay",
          paymentId: razorpay_payment_id,
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (err) {
    console.error("verify-payment error:", err);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
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
        createdAt: new Date(),
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
      path: "/",
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

app.get("/api/me", auth, async (req, res) => {
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
app.post("/api/user-submissions", auth, uploadSubmission.single("file"), async (req, res) => {
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

    // ✅ NEW: read extra metadata from submission form
    const exam = (req.body && req.body.exam) || "";
    const subject = (req.body && req.body.subject) || "";
    const year = (req.body && req.body.year) || "";

    const pdfUrlFromBody =
      (req.body && (req.body.pdfUrl || req.body.fileUrl)) || "";


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

      // ✅ STORE METADATA
      exam: (exam || "").trim(),
      subject: (subject || "").trim(),
      year: (year || "").trim(),

      file: storedFilePath,
      pdfUrl: storedFilePath ? null : (publicFileUrl || null),

      userId: user ? user.id : null,
      userEmail: user ? user.email : null,

      status: "pending",
      adminNote: "",
      createdAt: new Date(),
      processedAt: null,
      type: req.body.type === "ebook"
        ? "ebook"
        : req.body.type === "questionPaper"
          ? "questionPaper"
          : "ebook", // default = ebook
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

// GET list submissions (USER – their own submissions only)
app.get("/api/user-submissions", auth, async (req, res) => {
  try {
    const { status } = req.query; // optional ?status=approved|rejected|pending
    const q = {
      userId: req.user.id,   // 🔥 THIS IS THE FIX
    };

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
app.post("/api/user-submissions/:id/approve", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ ok: false, message: "Missing submission id" });
    }

    const _id = new ObjectId(id);
    const adminNote = req.body?.adminNote || "";
    const coinsAwarded = Number.isFinite(Number(req.body?.coinsAwarded))
      ? Number(req.body.coinsAwarded)
      : 0;

    // ✅ 1️⃣ FETCH SUBMISSION FIRST
    const sub = await submissionsCollection().findOne({ _id });
    if (!sub) {
      return res.status(404).json({ ok: false, message: "Submission not found" });
    }

    // 🚫 2️⃣ PREVENT DOUBLE APPROVAL (CORRECT PLACE)
    if (sub.status === "approved") {
      return res.status(400).json({
        ok: false,
        message: "Submission already approved",
      });
    }

    // ✅ 3️⃣ UPDATE STATUS
    await submissionsCollection().updateOne(
      { _id },
      {
        $set: {
          status: "approved",
          processedAt: new Date(),
          adminNote,
        },
      }
    );

    // ✅ 4️⃣ AWARD COINS
    if (coinsAwarded > 0 && sub.userId) {
      await usersCollection().updateOne(
        { _id: new ObjectId(sub.userId) },
        { $inc: { walletCoins: coinsAwarded } }
      );

      await walletLedgerCollection().insertOne({
        userId: sub.userId,
        type: "submission-reward",
        amount: coinsAwarded,
        ref: sub._id.toString(),
        createdAt: new Date(),
      });
    }

    // 🔔 5️⃣ NOTIFY USER
    if (sub.userId) {
      const { addNotification } = require("./utils/notifications");
      await addNotification(
        sub.userId,
        `Your submission "${sub.title}" was approved. You earned ${coinsAwarded} coins.`,
        "success"
      );
    }

    return res.json({
      ok: true,
      message: "Submission approved successfully",
      coinsAwarded,
    });
  } catch (err) {
    console.error("/api/user-submissions/:id/approve error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error while approving submission",
    });
  }
}
);


// POST reject (admin)
// Behavior: reject marks submission as "rejected" (kept for history)
// If a file was uploaded and stored on disk, it will be removed as well.
app.post("/api/user-submissions/:id/reject", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const reason = (req.body && req.body.reason) || "";
    if (!id) return res.status(400).json({ ok: false, message: "Missing id" });

    const _id = new ObjectId(id);
    // find the submission to check for stored file
    const sub = await submissionsCollection().findOne({ _id });
    if (!sub) return res.status(404).json({ ok: false, message: "Submission not found" });

    // If the submission has a stored file path (file field), remove it from disk
    if (sub.file) {
      try {
        const filePath = path.join(__dirname, sub.file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("[SUBMISSION DELETE] removed file:", filePath);
        }
      } catch (e) {
        console.warn("[SUBMISSION DELETE] unable to delete file:", e && e.message ? e.message : e);
      }
    }

    // delete the submission document
    await submissionsCollection().updateOne(
      { _id },
      {
        $set: {
          status: "rejected",
          adminNote: reason,
          processedAt: new Date(),
        },
      }
    );


    // 🔔 STEP 2: Notify user
    if (sub?.userId) {
      const { addNotification } = require("./utils/notifications");
      await addNotification(
        sub.userId,
        `Your submission "${sub.title}" was rejected.`,
        {
          type: "error",
          meta: { reason }
        }
      );
    }


    // Optionally log the rejection reason somewhere (adminNote or separate collection).
    // For now we simply return the reason in response for auditing in client logs.
    return res.json({ ok: true, message: "Submission rejected and removed", reason });
  } catch (err) {
    console.error("/api/user-submissions/:id/reject error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});



// ================================
// ADMIN: GET ALL SUBMISSIONS
// ================================
app.get("/api/admin/submissions", auth, adminOnly, async (req, res) => {
  try {
    const { status } = req.query; // optional ?status=pending|approved|rejected

    const query = {};
    if (status) query.status = status;

    const docs = await submissionsCollection()
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    const mapped = docs.map((d) => {
      let fileUrl = "";
      if (d.file) {
        const normalized = d.file.split(path.sep).join("/");
        fileUrl = normalized.startsWith("/") ? normalized : "/" + normalized;
      } else if (d.pdfUrl) {
        fileUrl = d.pdfUrl;
      }

      return {
        id: d._id.toString(),
        title: d.title,
        description: d.description,
        fileUrl,
        userEmail: d.userEmail,
        status: d.status,
        adminNote: d.adminNote || "",
        createdAt: d.createdAt,
        processedAt: d.processedAt,
        exam: d.exam || "",
        subject: d.subject || "",
        year: d.year || "",
      };
    });

    return res.json({ ok: true, submissions: mapped });
  } catch (err) {
    console.error("/api/admin/submissions error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
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
    id: doc._id.toString(),
    title: doc.title || "",
    description: doc.description || "",
    file: doc.file,
    subject: doc.subject || "",
    exam: doc.exam || "",
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
// My Library (purchased items)
// -----------------------------
app.get("/api/my-library", auth, async (req, res) => {
  try {
    const userIdStr = req.user.id;
    let userObjectId = null;

    try {
      userObjectId = new ObjectId(userIdStr);
    } catch (_) { }

    const orders = await ordersCollection()
      .find({
        $or: [
          { userId: userIdStr },          // string userId
          { userId: userObjectId },       // ObjectId userId (old data)
        ],
      })
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
app.post("/api/library/add", auth, async (req, res) => {
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
      createdAt: new Date(),
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
app.get("/api/read-later", auth, async (req, res) => {
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

app.post("/api/read-later/add", auth, async (req, res) => {
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

app.post("/api/read-later/remove", auth, async (req, res) => {
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

/* ================================
   ADMIN: GET ALL REQUESTS
================================ */
app.get("/api/admin/requests", auth, adminOnly, async (req, res) => {
  try {
    const list = await Request.find().sort({ createdAt: -1 });
    res.json({ ok: true, requests: list });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

/* ================================
   ADMIN: UPDATE REQUEST STATUS
================================ */
app.post("/api/admin/requests/:id", auth, adminOnly, async (req, res) => {
  try {
    const { status, adminNote } = req.body;

    await Request.findByIdAndUpdate(req.params.id, {
      status,
      adminNote,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});


// ================================
// NOTIFICATIONS – USER APIs
// ================================
app.get("/api/notifications", auth, async (req, res) => {
  try {
    const user = await usersCollection().findOne(
      { email: req.user.email },
      { projection: { notifications: { $slice: -20 } } }
    );

    if (!user || !Array.isArray(user.notifications)) {
      return res.json({ ok: true, notifications: [] });
    }

    // newest first
    const list = user.notifications.slice().reverse();

    res.json({ ok: true, notifications: list });
  } catch (err) {
    console.error("/api/notifications error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});


app.post("/api/notifications/:index/read", auth, async (req, res) => {
  try {
    const index = Number(req.params.index);

    if (Number.isNaN(index)) {
      return res.status(400).json({ ok: false, message: "Invalid index" });
    }

    const user = await usersCollection().findOne(
      { email: req.user.email },
      { projection: { notifications: 1 } }
    );

    if (!user || !user.notifications || !user.notifications[index]) {
      return res.status(404).json({ ok: false, message: "Notification not found" });
    }

    const key = `notifications.${index}.read`;

    await usersCollection().updateOne(
      { email: req.user.email },
      { $set: { [key]: true } }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("mark notification read error:", err);
    res.status(500).json({ ok: false });
  }
});


// ================================
// WALLET APIs  👈 ADD HERE
// ================================
app.get("/api/wallet", auth, async (req, res) => {
  try {
    const user = await usersCollection().findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const withdrawals = await withdrawalsCollection()
      .find({ userId: req.user.id }) // 🔥 REMOVE status filter
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      ok: true,
      walletCoins: user.walletCoins || 0,
      minWithdraw: 100,
      conversionRate: 1,
      withdrawals: withdrawals.map(w => ({
        id: w._id.toString(),
        amountCoins: w.amountCoins,
        status: w.status,
        createdAt: w.createdAt,
        processedAt: w.processedAt,
      })),
    });

  } catch (err) {
    console.error("/api/wallet error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

// ================================
// WALLET LEDGER (USER HISTORY)
// ================================
app.get("/api/wallet/ledger", auth, async (req, res) => {
  try {
    const list = await walletLedgerCollection()
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ ok: true, ledger: list });
  } catch (err) {
    console.error("/api/wallet/ledger error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});


// ================================
// WALLET ANALYTICS (USER)
// ================================
// ================================
// WALLET ANALYTICS (USER)
// ================================
app.get("/api/wallet/analytics", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Ledger-based totals
    const ledger = await walletLedgerCollection()
      .find({ userId })
      .toArray();

    let earned = 0;
    let withdrawn = 0;

    ledger.forEach((l) => {
      if (l.amount > 0) earned += l.amount;
      if (l.type === "withdraw-request") {
        withdrawn += Math.abs(l.amount);// withdraw-request
      }
    });

    // Paid withdrawals count
    const paid = await withdrawalsCollection().countDocuments({
      userId,
      status: "paid",
    });

    return res.json({
      ok: true,
      earned,
      withdrawn,
      paid,
    });
  } catch (err) {
    console.error("/api/wallet/analytics error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});


// ================================
// USER: Withdrawal History
// ================================
app.get("/api/withdrawals/history", auth, async (req, res) => {
  try {
    const list = await withdrawalsCollection()
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      ok: true,
      withdrawals: list.map(w => ({
        id: w._id.toString(),

        amountCoins: w.amountCoins,     // 1 coin = 1 money
        status: w.status,

        payoutMethod: w.payoutMethod || "",     // "upi" | "bank"
        payoutDetails: w.payoutDetails || {},   // full object

        note: w.note || "",

        createdAt: w.createdAt,
        processedAt: w.processedAt || null,
      })),
    });
  } catch (err) {
    console.error("User withdrawal history error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to load withdrawal history",
    });
  }
});


app.post("/api/withdraw", auth, async (req, res) => {
  const session = mongoClientInstance.startSession();

  try {
    const { amountCoins, payoutDetails, note } = req.body;

    // ================================
    // BASIC VALIDATION
    // ================================
    const coins = Number(amountCoins);

    if (!Number.isFinite(coins) || coins < 100) {
      return res.status(400).json({
        ok: false,
        message: "Minimum withdrawal is 100 coins",
      });
    }

    if (!payoutDetails || typeof payoutDetails !== "object") {
      return res.status(400).json({
        ok: false,
        message: "Withdrawal method is required",
      });
    }

    if (!payoutDetails.method) {
      return res.status(400).json({
        ok: false,
        message: "Withdrawal method is required",
      });
    }

    // ================================
    // PAYOUT METHOD VALIDATION
    // ================================
    if (payoutDetails.method === "upi") {
      if (
        !payoutDetails.upiId ||
        typeof payoutDetails.upiId !== "string" ||
        !payoutDetails.upiId.includes("@")
      ) {
        return res.status(400).json({
          ok: false,
          message: "Valid UPI ID is required",
        });
      }
    }

    if (payoutDetails.method === "bank") {
      if (
        !payoutDetails.bankName ||
        !payoutDetails.bankAccount ||
        !payoutDetails.bankIfsc
      ) {
        return res.status(400).json({
          ok: false,
          message: "Complete bank details are required",
        });
      }
    }

    // ================================
    // TRANSACTION START
    // ================================
    await session.withTransaction(async () => {
      // 🔒 1️⃣ Fetch user (transaction-safe)
      const user = await usersCollection().findOne(
        { email: req.user.email },
        { session }
      );

      if (!user) {
        throw new Error("User not found");
      }

      // ⏱️ 2️⃣ COOLDOWN CHECK (24 HOURS)
      const lastWithdrawal = await withdrawalsCollection()
        .find({ userId: user._id.toString() })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

      if (lastWithdrawal.length) {
        const lastTime = new Date(lastWithdrawal[0].createdAt).getTime();
        const now = Date.now();
        const diffHours = (now - lastTime) / (1000 * 60 * 60);

        if (diffHours < 24) {
          throw new Error(
            "You can request withdrawal only once every 24 hours. Please try again later."
          );
        }
      }

      // 💰 3️⃣ FINAL BALANCE CHECK
      if (user.walletCoins < coins) {
        throw new Error("Insufficient wallet balance");
      }

      // 🔻 4️⃣ DEDUCT WALLET COINS
      await usersCollection().updateOne(
        { _id: user._id },
        { $inc: { walletCoins: -coins } },
        { session }
      );

      // 🧾 5️⃣ WALLET LEDGER ENTRY
      await walletLedgerCollection().insertOne(
        {
          userId: user._id.toString(),
          type: "withdraw-request",
          amount: -coins,
          ref: "withdrawal",
          createdAt: new Date(),
        },
        { session }
      );

      // 🏦 6️⃣ INSERT WITHDRAWAL REQUEST
      await withdrawalsCollection().insertOne(
        {
          userId: user._id.toString(),
          userEmail: user.email,

          payoutMethod: payoutDetails.method,
          payoutDetails: {
            ...payoutDetails, // safe full object
          },

          note: typeof note === "string" ? note.trim() : "",
          amountCoins: coins,

          status: "pending",
          createdAt: new Date(),
          processedAt: null,
        },
        { session }
      );
    });

    return res.json({
      ok: true,
      message: "Withdrawal request submitted",
    });
  } catch (err) {
    console.error("/api/withdraw error:", err);

    return res.status(400).json({
      ok: false,
      message: err.message || "Withdrawal failed",
    });
  } finally {
    await session.endSession();
  }
});


app.get("/api/admin/withdrawals", auth, adminOnly, async (req, res) => {
  try {
    const { status, email } = req.query;

    // ✅ Build query dynamically
    const query = {};

    if (status && status !== "all") {
      if (status.includes(",")) {
        query.status = { $in: status.split(",") };
      } else {
        query.status = status;
      }
    }

    if (email) {
      query.userEmail = { $regex: email, $options: "i" };
    }

    const withdrawals = await withdrawalsCollection()
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    // ================================
    // FETCH USER WALLET BALANCES (SAFE)
    // ================================
    const userIds = [
      ...new Set(withdrawals.map(w => w.userId).filter(Boolean)),
    ];

    const validUserObjectIds = userIds
      .map(id => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const users = await usersCollection()
      .find({ _id: { $in: validUserObjectIds } })
      .project({ walletCoins: 1 })
      .toArray();

    const walletMap = {};
    users.forEach(u => {
      walletMap[u._id.toString()] = u.walletCoins || 0;
    });

    // ================================
    // RESPONSE
    // ================================
    return res.json({
      ok: true,
      withdrawals: withdrawals.map(w => ({
        id: w._id.toString(),
        userEmail: w.userEmail,

        // ✅ FLATTENED PAYOUT FIELDS (frontend-safe)
        payoutMethod: w.payoutMethod || "",
        upiId: w.payoutDetails?.upiId || null,
        bankAccount: w.payoutDetails?.bankAccount || null,
        bankIfsc: w.payoutDetails?.bankIfsc || null,
        bankName: w.payoutDetails?.bankName || null,

        amountCoins: w.amountCoins,
        walletCoins: walletMap[String(w.userId)] ?? 0,

        status: w.status,
        createdAt: w.createdAt,
        processedAt: w.processedAt || null,
        paidAt: w.paidAt || null, // ✅ CONSISTENT PAID TIMESTAMP
      })),
    });

  } catch (err) {
    console.error("/api/admin/withdrawals error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});

// ================================
// ADMIN: EXPORT WITHDRAWALS TO CSV
// ================================
app.get(
  "/api/admin/withdrawals/export",
  auth,
  adminOnly,
  async (req, res) => {
    try {
      const list = await withdrawalsCollection()
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      // ✅ CSV header
      let csv = "Email,Method,Amount,Status,Requested,Processed,PaidAt\n";

      // ✅ Prevent CSV / Excel injection
      const safe = (v) => `"${String(v || "").replace(/"/g, '""')}"`;

      list.forEach((w) => {
        csv +=
          `${safe(w.userEmail)},` +
          `${safe(w.payoutMethod)},` +
          `${safe(w.amountCoins)},` +
          `${safe(w.status)},` +
          `${safe(w.createdAt)},` +
          `${safe(w.processedAt || "")},` +
          `${safe(w.paidAt || "")}\n`;
      });


      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=withdrawals.csv"
      );

      res.send(csv);
    } catch (err) {
      console.error("CSV export error:", err);
      res.status(500).send("Failed to export CSV");
    }
  }
);



app.post(
  "/api/admin/withdrawals/:id/approve",
  auth,
  adminOnly,
  async (req, res) => {

    try {

      const _id = new ObjectId(req.params.id);

      // ✅ 1️⃣ FETCH ONLY PENDING WITHDRAWAL
      const w = await withdrawalsCollection().findOne({
        _id,
        status: "pending",
      });

      if (!w) {
        return res.status(400).json({
          ok: false,
          message: "Withdrawal already processed or not found",
        });
      }

      // ✅ 2️⃣ UPDATE STATUS TO APPROVED
      await withdrawalsCollection().updateOne(
        { _id },
        {
          $set: {
            status: "approved",
            processedAt: new Date(),
            processedBy: req.user.email, // ✅ ADD HERE
          },
        }
      );

      // 🔔 STEP 2: Notify user
      const { addNotification } = require("./utils/notifications");
      await addNotification(
        w.userId,
        `Your withdrawal request of ${w.amountCoins} coins has been approved.`,
        "success"
      );



      // 🧾 3️⃣ WALLET LEDGER ENTRY (APPROVAL CONFIRMATION)
      await walletLedgerCollection().insertOne({
        userId: w.userId,
        type: "withdraw-approved",
        amount: 0,
        ref: w._id.toString(),
        createdAt: new Date(),
      });

      // 📧 4️⃣ SEND EMAIL NOTIFICATION
      await sendWithdrawalEmail(
        w.userEmail,
        "Withdrawal Approved – StudentHub",
        `Your withdrawal of ${w.amountCoins} coins has been approved and processed.`
      );

      return res.json({
        ok: true,
        message: "Withdrawal approved",
      });
    } catch (err) {
      console.error("approve withdrawal error:", err);
      return res.status(500).json({
        ok: false,
        message: "Server error",
      });
    }
  });

app.post("/api/admin/withdrawals/:id/reject", auth, adminOnly, async (req, res) => {
  try {

    const _id = new ObjectId(req.params.id);

    // 🔒 1️⃣ Fetch ONLY pending withdrawal
    const w = await withdrawalsCollection().findOne({
      _id,
      status: "pending",
    });

    if (!w) {
      return res.status(400).json({
        ok: false,
        message: "Withdrawal already processed or not found",
      });
    }

    // 💰 2️⃣ REFUND coins back to user wallet
    await usersCollection().updateOne(
      { email: w.userEmail },
      { $inc: { walletCoins: w.amountCoins } }
    );

    // 🧾 3️⃣ Wallet ledger entry (refund)
    await walletLedgerCollection().insertOne({
      userId: w.userId,
      type: "withdraw-refund",
      amount: w.amountCoins,
      ref: "withdrawal",
      createdAt: new Date(),
    });

    // ❌ 4️⃣ Mark withdrawal as rejected (SINGLE update)
    await withdrawalsCollection().updateOne(
      { _id },
      {
        $set: {
          status: "rejected",
          processedAt: new Date(),
          processedBy: req.user.email,
        },
      }
    );

    // 🔔 STEP 2: Notify user
    const { addNotification } = require("./utils/notifications");
    await addNotification(
      w.userId,
      `Your withdrawal request was rejected. Coins have been refunded.`,
      "error"
    );


    // 📧 5️⃣ Send email notification
    await sendWithdrawalEmail(
      w.userEmail,
      "Withdrawal Rejected – StudentHub",
      `Your withdrawal of ${w.amountCoins} coins was rejected. Coins have been refunded to your wallet.`
    );

    return res.json({
      ok: true,
      message: "Withdrawal rejected & refunded",
    });
  } catch (err) {
    console.error("reject withdrawal error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});


// ================================
// ADMIN: MARK WITHDRAWAL AS PAID
// ================================
app.post("/api/admin/withdrawals/:id/paid", auth, adminOnly, async (req, res) => {
  try {
    const _id = new ObjectId(req.params.id);

    // 🔒 Only APPROVED withdrawals can be marked PAID
    const w = await withdrawalsCollection().findOne({
      _id,
      status: "approved",
    });

    if (!w) {
      return res.status(400).json({
        ok: false,
        message: "Only approved withdrawals can be marked as paid",
      });
    }

    // 🚫 Prevent double payment (race-condition safety)
    if (w.status === "paid") {
      return res.status(400).json({
        ok: false,
        message: "Withdrawal already paid",
      });
    }

    // 🔎 Ensure user still exists
    const user = await usersCollection().findOne({
      _id: new ObjectId(w.userId),
    });

    if (!user) {
      return res.status(400).json({
        ok: false,
        message: "User not found",
      });
    }

    // ✅ MARK AS PAID
    await withdrawalsCollection().updateOne(
      { _id },
      {
        $set: {
          status: "paid",
          paidAt: new Date(),
          processedAt: new Date(),
          processedBy: req.user.email,
        },
      }
    );

    // 🧾 WALLET LEDGER ENTRY
    await walletLedgerCollection().insertOne({
      userId: w.userId,
      type: "withdraw-paid",
      amount: 0,
      ref: w._id.toString(),
      createdAt: new Date(),
    });

    // 🔔 In-app notification
    const { addNotification } = require("./utils/notifications");
    await addNotification(
      w.userId,
      `Your withdrawal of ${w.amountCoins} coins has been paid successfully.`,
      "success"
    );

    // 📧 Email notification
    await sendWithdrawalEmail(
      w.userEmail,
      "Withdrawal Paid – StudentHub",
      `Your withdrawal of ${w.amountCoins} coins has been successfully paid.`
    );

    return res.json({
      ok: true,
      message: "Withdrawal marked as PAID",
    });
  } catch (err) {
    console.error("mark paid error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error",
    });
  }
});


// -----------------------------
// Purchases (unchanged)
// -----------------------------
app.post("/api/purchases", auth, async (req, res) => {
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
        createdAt: new Date(),
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
        createdAt: new Date(),
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
app.delete("/api/materials/:type/:index", auth, adminOnly, async (req, res) => {
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


// ================================
// ADMIN: Delete material by ID (PRODUCTION SAFE)
// ================================
app.delete("/api/admin/materials/:id", auth, adminOnly, async (req, res) => {
  try {

    const { id } = req.params;
    let _id;

    try {
      _id = new ObjectId(id);
    } catch {
      return res.status(400).json({ ok: false, message: "Invalid material ID" });
    }

    let col = ebooksCollection();
    let doc = await col.findOne({ _id });

    if (!doc) {
      col = questionPapersCollection();
      doc = await col.findOne({ _id });
    }

    if (!doc) {
      return res.status(404).json({ ok: false, message: "Material not found" });
    }

    if (doc.file) {
      const filePath = path.join(__dirname, doc.file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await col.deleteOne({ _id });

    return res.json({ ok: true, message: "Material deleted successfully" });
  } catch (err) {
    console.error("Admin delete material error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});


// -----------------------------
// Track a "read" (view in reader)
// -----------------------------
app.post("/api/materials/:id/track-read", auth, async (req, res) => {
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
// Track download (FREE PDFs ONLY)
// -----------------------------
app.get("/api/download/:type/:index", auth, async (req, res) => {
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

    // 🔒 BLOCK DIRECT DOWNLOAD FOR PAID PDFs
    if (price > 0) {
      return res.status(403).json({
        error: "Paid PDFs must be accessed via reader only",
      });
    }

    // ✅ FREE PDF → allow download + track
    await col.updateOne(
      { _id: item._id },
      { $inc: { downloads: 1 } }
    );

    if (item.file) {
      let url = item.file.split(path.sep).join("/");
      if (!url.startsWith("/")) url = "/" + url;
      return res.redirect(url);
    }

    return res.redirect("/");
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
app.get("/dashboard.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});
app.get("/view/:slug", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "view.html"));
});
app.get("/library.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "library.html"));
});
app.get("/read-later.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "read-later.html"));
});
app.get("/submit-pdf.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "submit-pdf.html"));
});
app.get("/my-submissions.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "my-submissions.html"));
});
app.get("/wallet.html", auth, (req, res) => {
  res.sendFile(path.join(__dirname, "wallet.html"));
});

// -----------------------------
// ADMIN PAGES (PROTECTED)
// -----------------------------

// Admin dashboard
app.get("/admin.html", adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/admin", auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Admin materials
app.get("/admin-materials.html", auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "admin-materials.html"));
});

// Admin submissions
app.get("/admin-submissions.html", auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "admin-submissions.html"));
});

// Admin withdrawals
app.get("/admin-withdrawals.html", auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "admin-withdrawals.html"));
});

// Admin approved submissions (optional page)
app.get("/admin-approved.html", auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "admin-approved.html"));
});

// Admin user requests
app.get("/admin-requests.html", auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "admin-requests.html"));
});

// Admin quiz generator
app.get("/admin-quiz.html", auth, adminOnly, (req, res) => {
  res.sendFile(path.join(__dirname, "admin-quiz.html"));
});


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

    // ================================
    // MongoDB Indexes (Performance)
    // ================================
    try {
      await db.collection("withdrawals").createIndex({ status: 1, createdAt: -1 });
      await db.collection("withdrawals").createIndex({ userId: 1, createdAt: -1 });
      await db.collection("withdrawals").createIndex({ status: 1, userId: 1 });
      await db.collection("withdrawals").createIndex({ userEmail: 1 });
      await db.collection("walletLedger").createIndex({ userId: 1, createdAt: -1 });
      await db.collection("orders").createIndex({ userId: 1 });
      await db.collection("readLater").createIndex({ userId: 1 });

      console.log("[MongoDB] Indexes ensured");
    } catch (indexErr) {
      console.warn("[MongoDB] Index creation warning:", indexErr.message);
    }


    // Make db accessible to routes and other code
    app.locals.db = db;
    app.locals.mongoClient = client;

    // ===============================
    // 🔐 SECURE PDF DELIVERY (REGEX – EXPRESS SAFE)
    // ===============================
    app.get(/^\/pdfs\/(.+)/, auth, async (req, res) => {
      try {
        const relativePath = req.params[0]; // ebooks/abc.pdf OR submissions/x.pdf
        const baseDir = path.join(__dirname, "pdfs");
        const filePath = path.join(baseDir, relativePath);

        // 🔒 Path traversal protection
        if (!filePath.startsWith(baseDir)) {
          return res.status(403).send("Access denied");
        }

        if (!fs.existsSync(filePath)) {
          return res.status(404).send("PDF not found");
        }

        // Normalize DB path
        const normalizedDbPath = `pdfs/${relativePath.replace(/^pdfs\//, "")}`;

        // 🔍 Find material
        // 🔍 1️⃣ Check EBOOKS / QUESTION PAPERS
        let item =
          (await ebooksCollection().findOne({ file: normalizedDbPath })) ||
          (await questionPapersCollection().findOne({ file: normalizedDbPath }));

        // 🔍 2️⃣ If NOT material → check SUBMISSIONS
        if (!item) {
          const submission = await submissionsCollection().findOne({
            file: normalizedDbPath,
          });

          // ❌ Not submission either
          if (!submission) {
            return res.status(403).send("Unauthorized");
          }

          // 🔐 Submission PDFs → ADMIN ONLY
          if (req.user.email !== process.env.ADMIN_EMAIL) {
            return res.status(403).send("Admin access only");
          }

          // ✅ Admin allowed → serve PDF
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", "inline");
          res.setHeader("Cache-Control", "no-store");
          res.removeHeader("X-Frame-Options");
          return res.sendFile(filePath);
        }

        // 🔐 Paid check (FIXED)
        if (item.price > 0) {
          const paid = await ordersCollection().findOne({
            userId: req.user.id,
            itemId: item._id.toString(),
            status: { $in: ["success", "free", "library-add"] },
          });

          if (!paid) {
            return res.status(403).send("Payment required");
          }
        }

        // ✅ REQUIRED HEADERS FOR CHROME PDF VIEW
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Cache-Control", "no-store");
        // ❌ DO NOT SET X-Frame-Options (Chrome blocks PDFs)
        res.removeHeader("X-Frame-Options");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.sendFile(filePath);
      } catch (err) {
        console.error("Secure PDF error:", err);
        res.status(403).send("Access denied");
      }
    });


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
            auth,
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
          const router = adminRewards(db, { auth, ObjectId });
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



    // ===============================
    // ADMIN: PREVIEW SUBMISSION PDF
    // ===============================
    app.get(
      "/admin/preview/submission/:id",
      auth,
      adminOnly,
      async (req, res) => {
        try {
          const sub = await submissionsCollection().findOne({
            _id: new ObjectId(req.params.id),
          });

          if (!sub || !sub.file) {
            return res.status(404).send("PDF not found");
          }

          const filePath = path.join(__dirname, sub.file);

          if (!fs.existsSync(filePath)) {
            return res.status(404).send("PDF missing on disk");
          }

          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", "inline");
          res.setHeader("Cache-Control", "no-store");

          res.sendFile(filePath);
        } catch (err) {
          console.error("Admin preview error:", err);
          res.status(403).send("Unauthorized");
        }
      }
    );




    // ===============================
    // STATIC FILES (HTML / CSS / JS / IMAGES)
    // ===============================
    app.use(
      express.static(path.join(__dirname), {
        index: false,
        extensions: ["html", "css", "js", "png", "jpg", "svg"],
      })
    );



    app.use(express.static(path.join(__dirname, "public")));




    // ===============================
    // CHECK MATERIAL ACCESS (READER)
    // ===============================
    app.get("/api/materials/:id/access", async (req, res) => {
      try {
        const id = req.params.id;
        let item = null;
        let itemType = null;

        const _id = new ObjectId(id);

        item = await ebooksCollection().findOne({ _id });
        if (item) itemType = "ebook";

        if (!item) {
          item = await questionPapersCollection().findOne({ _id });
          if (item) itemType = "questionPaper";
        }

        if (!item) return res.status(404).json({});

        let canAccess = item.price === 0;
        let userId = null;

        try {
          const token = req.cookies?.token;
          if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.id;
          }
        } catch { }

        if (item.price > 0 && userId) {
          const paid = await ordersCollection().findOne({
            userId,
            itemType,
            itemId: id,
            status: "success",
          });
          if (paid) canAccess = true;
        }

        res.json({
          id,
          title: item.title,
          exam: item.exam,
          subject: item.subject,
          year: item.year,
          price: item.price,
          downloads: item.downloads,
          canAccess,
        });
      } catch {
        res.status(500).json({});
      }
    });



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