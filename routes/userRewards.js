// routes/userRewards.js
// Converted to use native MongoDB (db passed from server.js)
// Usage: const userRewardsRoutes = require('./routes/userRewards')(db);

const express = require("express");
const { ObjectId } = require("mongodb");
const auth = require("../middleware/auth"); // keep existing auth middleware

module.exports = function (db) {
  if (!db) {
    throw new Error("routes/userRewards requires a MongoDB 'db' instance");
  }

  const router = express.Router();

  // Collections
  const usersCol = () => db.collection("users");
  const pdfSubmissionsCol = () => db.collection("pdfSubmissions");
  const withdrawalCol = () => db.collection("Withdrawal");
  const notificationsCol = () => db.collection("notifications");

  // Local helper to add a user notification (simple native-doc)
  async function addNotification(userId, message, type = "info") {
    try {
      await notificationsCol().insertOne({
        userId: userId,
        message,
        type,
        read: false,
        createdAt: new Date(),
      });
    } catch (err) {
      console.warn("addNotification error:", err);
    }
  }

  /**
   * POST /api/user-submissions
   * User sends a PDF to admin for review
   */
  router.post("/user-submissions", auth, async (req, res) => {
    try {
      const { title, description, fileUrl } = req.body || {};
      if (!title || !fileUrl) {
        return res
          .status(400)
          .json({ ok: false, message: "Title and file URL are required." });
      }

      const doc = {
        userId: req.user.id,
        title: title.trim(),
        description: (description || "").trim(),
        fileUrl: fileUrl.trim(),
        status: "pending",
        createdAt: new Date(),
      };

      const result = await pdfSubmissionsCol().insertOne(doc);
      doc._id = result.insertedId;

      // Add a notification for the user (local helper)
      await addNotification(
        req.user.id,
        `We received your PDF "${doc.title}". Our team will review it soon.`,
        "info"
      );

      return res.json({ ok: true, submission: doc });
    } catch (err) {
      console.error("Error creating submission:", err);
      return res.status(500).json({ ok: false, message: "Server error." });
    }
  });

  /**
   * GET /api/user-submissions
   * User sees their submissions
   */
  router.get("/user-submissions", auth, async (req, res) => {
    try {
      const subs = await pdfSubmissionsCol()
        .find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();

      return res.json({ ok: true, submissions: subs });
    } catch (err) {
      console.error("Error fetching submissions:", err);
      return res.status(500).json({ ok: false, message: "Server error." });
    }
  });

  /**
   * GET /api/wallet
   * Return wallet coins and notifications + pending withdrawals
   */
  router.get("/wallet", auth, async (req, res) => {
    try {
      const userDoc = await usersCol().findOne(
        { _id: (() => {
            try { return new ObjectId(req.user.id); } catch { return null; }
          })() },
        { projection: { walletCoins: 1 } }
      );

      // Fallback: some setups store userId as string in users collection id; attempt by email if not found
      let walletCoins = 0;
      if (userDoc && typeof userDoc.walletCoins !== "undefined") {
        walletCoins = userDoc.walletCoins || 0;
      } else {
        const byEmail = await usersCol().findOne(
          { email: req.user.email },
          { projection: { walletCoins: 1 } }
        );
        walletCoins = (byEmail && byEmail.walletCoins) || 0;
      }

      const pendingWithdrawals = await WithdrawalCol()
        .find({ userId: req.user.id,})
        .sort({ createdAt: -1 })
        .toArray();

      const notifications = await notificationsCol()
        .find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();

      return res.json({
        ok: true,
        walletCoins,
        pendingWithdrawals,
        notifications,
      });
    } catch (err) {
      console.error("Error fetching wallet:", err);
      return res.status(500).json({ ok: false, message: "Server error." });
    }
  });

  /**
   * POST /api/withdraw
   * Create a withdrawal request and deduct coins
   */
  router.post("/withdraw", auth, async (req, res) => {
    try {
      let { amountCoins } = req.body || {};
      amountCoins = Number(amountCoins) || 0;

      if (amountCoins <= 0) {
        return res
          .status(400)
          .json({ ok: false, message: "Invalid withdrawal amount." });
      }

      // Attempt to find user by _id (ObjectId) first, fallback to email
      let userFilter;
      try {
        userFilter = { _id: new ObjectId(req.user.id) };
      } catch {
        userFilter = { email: req.user.email };
      }

      const user = await usersCol().findOne(userFilter);

      if (!user) {
        return res.status(404).json({ ok: false, message: "User not found." });
      }

      const currentCoins = Number(user.walletCoins || 0);

      if (currentCoins < 100) {
        return res.status(400).json({
          ok: false,
          message: "You need at least 100 coins in your wallet to withdraw.",
        });
      }

      if (amountCoins > currentCoins) {
        return res.status(400).json({
          ok: false,
          message: "You cannot withdraw more than your wallet balance.",
        });
      }

      // Deduct coins atomically using update with $inc
      const updateRes = await usersCol().findOneAndUpdate(
        userFilter,
        { $inc: { walletCoins: -amountCoins } },
        { returnDocument: "after" }
      );

      const newWallet = (updateRes.value && updateRes.value.walletCoins) || 0;

      const requestDoc = {
        userId: req.user.id,
        amountCoins,
        status: "pending",
        createdAt: new Date(),
      };

      const createReq = await WithdrawalCol().insertOne(requestDoc);
      requestDoc._id = createReq.insertedId;

      await addNotification(
        req.user.id,
        `Your withdrawal request of ${amountCoins} coins has been submitted.`,
        "info"
      );

      return res.json({ ok: true, request: requestDoc, walletCoins: newWallet });
    } catch (err) {
      console.error("Error creating withdrawal:", err);
      return res.status(500).json({ ok: false, message: "Server error." });
    }
  });

  return router;
};
