// normalize-submissions-paths.js
// Run from project root. It normalizes Windows/absolute pdf paths in submissions
// to the relative form: "pdfs/submissions/<basename>" and sets fileUrl to "/pdfs/submissions/<basename>".

require('dotenv').config();
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'studenthub';

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in .env — aborting.');
  process.exit(1);
}

(async function main() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const submissions = db.collection('submissions');

    // Find docs where file or pdfUrl or fileUrl looks like a Windows absolute path or contains backslashes
    const cursor = submissions.find({
      $or: [
        { file: { $exists: true, $type: 'string', $regex: '\\\\' } },            // contains backslash
        { pdfUrl: { $exists: true, $type: 'string', $regex: '\\\\' } },
        { fileUrl: { $exists: true, $type: 'string', $regex: '\\\\' } },
        { file: { $exists: true, $type: 'string', $regex: '^[A-Za-z]:\\\\' } }, // C:\...
        { pdfUrl: { $exists: true, $type: 'string', $regex: '^[A-Za-z]:\\\\' } },
        { fileUrl: { $exists: true, $type: 'string', $regex: '^[A-Za-z]:\\\\' } },
      ],
    });

    let updated = 0;
    const changedDocs = [];

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc) continue;

      // prefer doc.file then pdfUrl then fileUrl
      const originalCandidates = [doc.file, doc.pdfUrl, doc.fileUrl].filter(Boolean);
      if (!originalCandidates.length) continue;

      const original = String(originalCandidates[0]);

      // Try to extract basename safely
      let basename = path.basename(original);
      // If basename contains backslashes (weird), replace
      basename = basename.replace(/\\/g, '/').split('/').pop();

      if (!basename || !basename.toLowerCase().endsWith('.pdf')) {
        console.warn(`Skipping doc ${doc._id}: extracted basename "${basename}" not a PDF.`);
        continue;
      }

      const rel = path.posix.join('pdfs', 'submissions', basename); // 'pdfs/submissions/<basename>'
      const fileUrl = '/' + rel;

      // Optionally check if the file exists at either the absolute original path or the normalized location
      const absFromOriginal = original.replace(/^file:\/\//i, '');
      const absExists = fs.existsSync(absFromOriginal);
      const normalizedPathOnDisk = path.join(process.cwd(), rel);
      const normalizedExists = fs.existsSync(normalizedPathOnDisk);

      // If neither exists, still update the DB (you might have moved files earlier). We log warnings.
      if (!absExists && !normalizedExists) {
        console.warn(`Warning: file not found for submission ${doc._id}. Neither "${absFromOriginal}" nor "${normalizedPathOnDisk}" exists. DB will be updated with normalized path anyway.`);
      } else {
        if (absExists) {
          // copy/move the file to pdfs/submissions if you want — but DO NOT move automatically to avoid accidental overwrites.
          // we will NOT move files automatically in this script.
          console.log(`Found file on disk for ${doc._id} at "${absFromOriginal}". (Will NOT move it automatically.)`);
        }
        if (normalizedExists) {
          console.log(`Normalized file already present at "${normalizedPathOnDisk}" for ${doc._id}.`);
        }
      }

      // perform update
      const update = {
        $set: {
          file: rel,
          fileUrl: fileUrl,
        },
      };

      const r = await submissions.updateOne({ _id: doc._id }, update);
      if (r.modifiedCount > 0) {
        updated++;
        changedDocs.push({ id: doc._id.toString(), file: rel, fileUrl });
        console.log(`Updated ${doc._id} -> file="${rel}", fileUrl="${fileUrl}"`);
      } else {
        console.warn(`No update performed for ${doc._id} (modifiedCount=0)`);
      }
    }

    console.log('Done. Updated documents:', updated);
    if (changedDocs.length) {
      console.log('Changed docs sample:', changedDocs.slice(0, 10));
    }

    process.exit(0);
  } catch (err) {
    console.error('Error running normalization:', err);
    process.exit(2);
  } finally {
    try { await client.close(); } catch (_) {}
  }
})();
