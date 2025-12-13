// utils/notifications.js
const User = require("../models/User");

/**
 * Add a notification to a user.
 *
 * Usage (compatible with old version):
 *   addNotification(userId, "Your PDF was approved", "success");
 *
 * Or with more options:
 *   addNotification(userId, "Withdrawal rejected", {
 *     type: "error",
 *     meta: { reason: "Bank details invalid" }
 *   });
 *
 * We also keep only the latest 50 notifications for each user.
 */
async function addNotification(userId, message, typeOrOptions = "info") {
  if (!userId || !message) return;

  let options = {};
  if (typeof typeOrOptions === "string") {
    options.type = typeOrOptions;
  } else if (typeOrOptions && typeof typeOrOptions === "object") {
    options = { ...typeOrOptions };
  }

  const notification = {
    message,
    type: options.type || "info",
    read: false,
  };

  // Optional extra data (e.g. { reason, relatedId, kind: "pdf" })
  if (options.meta && typeof options.meta === "object") {
    notification.meta = options.meta;
  }

  try {
    await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          notifications: {
            $each: [notification],
            // keep only the newest 50 notifications
            $slice: -50,
          },
        },
      },
      { new: false }
    );
  } catch (err) {
    console.error("addNotification error:", err);
  }
}

/**
 * Get a user's notifications (newest first).
 * Default limit: 20
 */
async function getNotifications(userId, limit = 20) {
  if (!userId) return [];

  try {
    const user = await User.findById(userId, {
      notifications: { $slice: -limit },
    }).lean();

    if (!user || !Array.isArray(user.notifications)) return [];

    // We sliced from the end (oldest→newest), reverse to show newest first
    return user.notifications.slice().reverse();
  } catch (err) {
    console.error("getNotifications error:", err);
    return [];
  }
}

/**
 * Mark all notifications as read for a user.
 */
async function markAllNotificationsRead(userId) {
  if (!userId) return;

  try {
    await User.updateOne(
      { _id: userId, "notifications.read": false },
      { $set: { "notifications.$[].read": true } }
    );
  } catch (err) {
    console.error("markAllNotificationsRead error:", err);
  }
}

/**
 * Clear all notifications for a user.
 */
async function clearNotifications(userId) {
  if (!userId) return;

  try {
    await User.findByIdAndUpdate(userId, { $set: { notifications: [] } });
  } catch (err) {
    console.error("clearNotifications error:", err);
  }
}

module.exports = {
  addNotification,
  getNotifications,
  markAllNotificationsRead,
  clearNotifications,
};
