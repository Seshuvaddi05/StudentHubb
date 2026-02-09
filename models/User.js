// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");


/* ======================================================
   🔔 NOTIFICATION SUB-SCHEMA
   ====================================================== */
const NotificationSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },

    type: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
    },

    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);


/* ======================================================
   👤 USER MAIN SCHEMA (PRODUCTION FINAL)
   ====================================================== */
const userSchema = new mongoose.Schema(
  {
    /* ==================================================
       BASIC USER INFO
    ================================================== */

    // Display name
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // ⭐ NEW → leaderboard friendly username
    username: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
    },

    // ⭐ NEW → profile photo / avatar URL
    avatar: {
      type: String,
      default: null,
    },


    /* ==================================================
       💰 WALLET & REWARD SYSTEM
    ================================================== */

    walletCoins: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedCoins: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastWithdrawalAt: {
      type: Date,
      default: null,
    },

    walletUpdatedAt: {
      type: Date,
      default: Date.now,
    },


    /* ==================================================
       🚀 QUIZ STATS CACHE (VERY FAST DASHBOARD)
       avoids heavy aggregation queries
    ================================================== */

    quizStats: {
      totalAttempts: { type: Number, default: 0 },
      totalScore: { type: Number, default: 0 },
      bestScore: { type: Number, default: 0 },
    },


    /* ==================================================
       🔔 NOTIFICATIONS
    ================================================== */
    notifications: [NotificationSchema],
  },
  {
    timestamps: true,
  }
);


/* ======================================================
   ⚡ INDEXES (PERFORMANCE BOOST)
   ====================================================== */

userSchema.index({ createdAt: -1 });
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });


/* ======================================================
   🔐 PASSWORD HASHING
   ====================================================== */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  next();
});


/* ======================================================
   🔑 PASSWORD MATCH
   ====================================================== */
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};


/* ======================================================
   💰 WALLET HELPERS
   ====================================================== */

userSchema.methods.addCoins = async function (coins) {
  this.walletCoins += coins;
  this.walletUpdatedAt = new Date();
  await this.save();
};

userSchema.methods.lockCoins = async function (coins) {
  if (coins > this.walletCoins) {
    throw new Error("Insufficient wallet balance");
  }

  this.walletCoins -= coins;
  this.lockedCoins += coins;
  this.walletUpdatedAt = new Date();
  this.lastWithdrawalAt = new Date();

  await this.save();
};

userSchema.methods.unlockCoins = async function (coins) {
  this.lockedCoins -= coins;
  this.walletCoins += coins;
  this.walletUpdatedAt = new Date();

  await this.save();
};

userSchema.methods.finalizeWithdrawal = async function (coins) {
  this.lockedCoins -= coins;
  this.walletUpdatedAt = new Date();

  await this.save();
};


/* ======================================================
   🧠 QUIZ STATS HELPERS (NEW)
   ====================================================== */

// call this after each quiz submission
userSchema.methods.updateQuizStats = async function (score) {
  this.quizStats.totalAttempts += 1;
  this.quizStats.totalScore += score;

  if (score > this.quizStats.bestScore) {
    this.quizStats.bestScore = score;
  }

  await this.save();
};


/* ======================================================
   EXPORT
   ====================================================== */
module.exports = mongoose.model("User", userSchema);
