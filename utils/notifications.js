// utils/notifications.js
// Centralized in-app notification helper for StudentHub
// Stores notifications INSIDE the User document (embedded array)

const mongoose = require("mongoose");
const User = require("../models/User");

/**
 * Add a notification to a user
 *
 * BASIC:
 *   addNotification(userId, "Withdrawal approved", "success");
 *
 * ADVANCED:
 *   addNotification(userId, "Withdrawal rejected", {
 *     type: "error",
 *     title: "Withdrawal Failed",
 *     meta: { reason: "Invalid UPI ID" }
 *   });
 */
async function addNotification(userId, message, typeOrOptions = "info") {
  try {
    if (!userId || !message) return;

    const uid = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    let options = {};
    if (typeof typeOrOptions === "string") {
      options.type = typeOrOptions;
    } else if (typeof typeOrOptions === "object" && typeOrOptions !== null) {
      options = { ...typeOrOptions };
    }

    const notification = {
      title: options.title || "Notification",
      message,
      type: options.type || "info", // info | success | warning | error
      read: false,
      createdAt: new Date(),
    };

    // Optional metadata (safe extra info)
    if (options.meta && typeof options.meta === "object") {
      notification.meta = options.meta;
    }

    // Push notification & keep only latest 50
    await User.updateOne(
      { _id: uid },
      {
        $push: {
          notifications: {
            $each: [notification],
            $slice: -50, // keep latest 50 notifications
          },
        },
      }
    );
  } catch (err) {
    console.error("[Notification] addNotification error:", err.message);
  }
}

/**
 * Get notifications for a user (newest first)
 * Default limit = 20
 */
async function getNotifications(userId, limit = 20) {
  try {
    if (!userId) return [];

    const uid = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    const user = await User.findById(uid, {
      notifications: { $slice: -limit },
    }).lean();

    if (!user || !Array.isArray(user.notifications)) return [];

    // newest first
    return user.notifications.slice().reverse();
  } catch (err) {
    console.error("[Notification] getNotifications error:", err.message);
    return [];
  }
}

/**
 * Mark ALL notifications as read
 */
async function markAllNotificationsRead(userId) {
  try {
    if (!userId) return;

    const uid = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    await User.updateOne(
      { _id: uid },
      { $set: { "notifications.$[].read": true } }
    );
  } catch (err) {
    console.error(
      "[Notification] markAllNotificationsRead error:",
      err.message
    );
  }
}

/**
 * Mark ONE notification as read
 */
async function markNotificationRead(userId, notificationId) {
  try {
    if (!userId || !notificationId) return;

    const uid = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    const nid = mongoose.Types.ObjectId.isValid(notificationId)
      ? new mongoose.Types.ObjectId(notificationId)
      : notificationId;

    await User.updateOne(
      { _id: uid, "notifications._id": nid },
      { $set: { "notifications.$.read": true } }
    );
  } catch (err) {
    console.error("[Notification] markNotificationRead error:", err.message);
  }
}

/**
 * Clear ALL notifications
 */
async function clearNotifications(userId) {
  try {
    if (!userId) return;

    const uid = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    await User.updateOne(
      { _id: uid },
      { $set: { notifications: [] } }
    );
  } catch (err) {
    console.error("[Notification] clearNotifications error:", err.message);
  }
}

module.exports = {
  addNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  clearNotifications,
};
