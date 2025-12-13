// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/* ================================
   NOTIFICATION SUB-SCHEMA
   (Used to notify users when:
   - PDF approved
   - PDF rejected
   - Withdrawal approved/rejected
   - General system messages)
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
    name: { type: String, required: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: { type: String, required: true },

    /* ---------------------------
       NEW FIELDS ADDED FOR REWARD SYSTEM
    ----------------------------*/

    // User wallet – stores earned coins
    walletCoins: {
      type: Number,
      default: 0,
    },

    // All user notifications
    notifications: [NotificationSchema],
  },
  { timestamps: true }
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
   EXPORT MODEL
===================================*/
module.exports = mongoose.model("User", userSchema);
