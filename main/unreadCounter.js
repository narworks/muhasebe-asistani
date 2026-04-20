/**
 * Tracks unread new tebligat count for dock/taskbar badge + tray title.
 * Increments when daemon detects new tebligat; clears when user views.
 */

const { app, Tray } = require('electron');
const logger = require('./logger');

let unreadCount = 0;
let tray = null;

/**
 * Wire up tray reference (called from main.js after tray is created).
 */
function setTray(trayInstance) {
    tray = trayInstance;
    updateBadges();
}

function getCount() {
    return unreadCount;
}

/**
 * Increment the counter by N (called when daemon finds new tebligat).
 */
function increment(n = 1) {
    unreadCount += n;
    updateBadges();
}

/**
 * Clear the counter (called when user opens main window or views results).
 */
function clear() {
    if (unreadCount === 0) return;
    unreadCount = 0;
    updateBadges();
}

/**
 * Update all visual indicators: dock badge, taskbar overlay, tray title.
 */
function updateBadges() {
    // macOS dock badge
    if (process.platform === 'darwin' && app.dock) {
        try {
            app.dock.setBadge(unreadCount > 0 ? String(unreadCount) : '');
        } catch (err) {
            logger.debug(`[UnreadCounter] dock.setBadge error: ${err.message}`);
        }
    }

    // Tray title (macOS shows next to icon in menu bar)
    if (tray && process.platform === 'darwin') {
        try {
            tray.setTitle(unreadCount > 0 ? ` ${unreadCount}` : '');
        } catch (err) {
            logger.debug(`[UnreadCounter] tray.setTitle error: ${err.message}`);
        }
    }

    // Windows: badge count via app.setBadgeCount (Electron 30+ supports it)
    // Will no-op silently on unsupported platforms
    try {
        if (typeof app.setBadgeCount === 'function') {
            app.setBadgeCount(unreadCount);
        }
    } catch {
        /* ignore */
    }
}

module.exports = { setTray, increment, clear, getCount, updateBadges };
