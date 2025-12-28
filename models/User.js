// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/* ================================
   NOTIFICATION SUB-SCHEMA
   Used for:
   - PDF approval/rejection
   - Withdrawal status updates
   - System messages
===================================*/
const NotificationSchema = new mongoose.Schema(
  {
    message: { type: String, required: true },

    type: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
    },

    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/* ================================
   USER MAIN SCHEMA
===================================*/
const userSchema = new mongoose.Schema(
  {
    /* ---------------------------
       BASIC USER INFO
    ----------------------------*/
    name: { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    password: { type: String, required: true },

    /* ---------------------------
       WALLET & REWARD SYSTEM
    ----------------------------*/

    // Total available coins
    walletCoins: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Coins locked during pending withdrawal
    lockedCoins: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Last withdrawal timestamp (for rate limiting)
    lastWithdrawalAt: {
      type: Date,
      default: null,
    },

    // Wallet last updated (audit purpose)
    walletUpdatedAt: {
      type: Date,
      default: Date.now,
    },

    /* ---------------------------
       NOTIFICATIONS
    ----------------------------*/
    notifications: [NotificationSchema],
  },
  {
    timestamps: true, // createdAt & updatedAt
  }
);

/* ================================
   PASSWORD HASHING
===================================*/
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/* ================================
   PASSWORD MATCHING
===================================*/
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

/* ================================
   WALLET HELPER METHODS (PRO)
===================================*/

// Add coins safely
userSchema.methods.addCoins = async function (coins) {
  this.walletCoins += coins;
  this.walletUpdatedAt = new Date();
  await this.save();
};

// Lock coins during withdrawal
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

// Unlock coins (if withdrawal rejected)
userSchema.methods.unlockCoins = async function (coins) {
  this.lockedCoins -= coins;
  this.walletCoins += coins;
  this.walletUpdatedAt = new Date();
  await this.save();
};

// Finalize withdrawal (coins permanently removed)
userSchema.methods.finalizeWithdrawal = async function (coins) {
  this.lockedCoins -= coins;
  this.walletUpdatedAt = new Date();
  await this.save();
};

/* ================================
   EXPORT MODEL
===================================*/
module.exports = mongoose.model("User", userSchema);
