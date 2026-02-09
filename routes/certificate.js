// ======================================================
// 🎓 StudentHub Certificate System (ULTRA FINAL PRO)
// QR • Verify • Save • Email • Optimized • Production Ready
// ======================================================

const router = require("express").Router();
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");


// ======================================================
// ⚡ EMAIL TRANSPORTER (CREATE ONCE = FAST)
// ======================================================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


// ======================================================
// 📦 CERTIFICATE MODEL
// ======================================================
const CertificateSchema = new mongoose.Schema(
  {
    certId: {
      type: String,
      unique: true,
      index: true,
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    name: String,
    email: String,

    score: Number,
    accuracy: Number,

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Certificate =
  mongoose.models.Certificate ||
  mongoose.model("Certificate", CertificateSchema);


// ======================================================
// 🔳 QR GENERATOR
// GET /api/certificate/qr?url=xxx
// ======================================================
router.get("/qr", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send("");

    const img = await QRCode.toDataURL(url);
    res.send(img);
  } catch (err) {
    console.error("[QR ERROR]", err);
    res.status(500).send("");
  }
});


// ======================================================
// ✅ VERIFY CERTIFICATE
// GET /api/certificate/verify/:id
// ======================================================
router.get("/verify/:id", async (req, res) => {
  try {
    const cert = await Certificate.findOne({
      certId: req.params.id,
    }).lean();

    if (!cert) return res.json({ valid: false });

    res.json({
      valid: true,
      name: cert.name,
      score: cert.score,
      accuracy: cert.accuracy,
      date: cert.createdAt,
    });
  } catch (err) {
    console.error("[VERIFY ERROR]", err);
    res.json({ valid: false });
  }
});


// ======================================================
// 💾 SAVE CERTIFICATE RECORD (SAFE + NO DUPLICATES)
// POST /api/certificate/save
// ======================================================
router.post("/save", async (req, res) => {
  try {
    const { certId, name, email, score, accuracy, userId } = req.body;

    if (!certId) return res.json({ ok: false });

    await Certificate.updateOne(
      { certId },
      {
        $setOnInsert: {
          certId,
          name,
          email,
          score,
          accuracy,
          userId,
        },
      },
      { upsert: true }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("[SAVE ERROR]", err);
    res.json({ ok: false });
  }
});


// ======================================================
// 📧 EMAIL CERTIFICATE (PDF ATTACH + HTML TEMPLATE)
// POST /api/certificate/email
// ======================================================
router.post("/email", async (req, res) => {
  try {
    const { email, pdf, certId } = req.body;

    if (!email || !pdf) {
      return res.status(400).json({ ok: false });
    }

    const verifyLink =
      `${process.env.BASE_URL || "http://localhost:4000"}` +
      `/verify-certificate.html?id=${certId}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "🎓 Your StudentHub Certificate",

      html: `
        <div style="font-family:system-ui">
          <h2>🎉 Congratulations!</h2>
          <p>Your certificate is attached.</p>

          <p><b>Certificate ID:</b> ${certId}</p>

          <p>
            🔍 Verify here:
            <a href="${verifyLink}">${verifyLink}</a>
          </p>

          <br/>
          <p>— StudentHub Team</p>
        </div>
      `,

      attachments: [
        {
          filename: "studenthub-certificate.pdf",
          content: pdf.split("base64,")[1],
          encoding: "base64",
        },
      ],
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[EMAIL ERROR]", err);
    res.json({ ok: false });
  }
});


// ======================================================
module.exports = router;
