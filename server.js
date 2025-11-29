// server.js
// Simple backend for StudentHub: serves site + handles PDF uploads & deletion

const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cors = require("cors");

const app = express();
const PORT = 4000; // http://127.0.0.1:4000

// ---- Middleware ----
app.use(cors());
app.use(express.json());

// Serve all static files (HTML, CSS, JS, PDFs)
app.use(express.static(__dirname));

// ---- Data helpers ----
const DATA_FILE = path.join(__dirname, "data.json");

function readData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            const initial = { ebooks: [], questionPapers: [] };
            fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf-8");
            return initial;
        }

        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        return JSON.parse(raw);
    } catch (err) {
        console.error("Error reading data.json:", err);
        return { ebooks: [], questionPapers: [] };
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ---- Multer storage (for PDFs) ----
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
    }
});

const upload = multer({ storage });

// ---- API: get all materials ----
app.get("/api/materials", (req, res) => {
    const data = readData();
    res.json(data);
});

// ---- API: upload a new PDF & add metadata ----
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
                createdAt: new Date().toISOString() // NEW: timestamp
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
                item: newItem
            });
        } catch (err2) {
            console.error("Upload handler error:", err2);
            res.status(500).json({ error: "Server error while uploading file" });
        }
    });
});

// ---- API: delete a material + its PDF ----
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

// ---- API: track a download ----
app.get("/api/download/:type/:index", (req, res) => {
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

        // Redirect to PDF file
        return res.redirect("/" + list[i].file);
    } catch (err) {
        console.error("Download error:", err);
        res.status(500).json({ error: "Download tracking failed" });
    }
});


// Fallback: serve index.html for root
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Unexpected server error" });
});

app.listen(PORT, () => {
    console.log(`StudentHub server running at http://127.0.0.1:${PORT}`);
});
