/**
 * Tracks unviewed tebligat count for dock/taskbar badge + tray title.
 * Reads from `tebligatlar.app_viewed_at IS NULL` rows — badge reflects
 * real state, not ephemeral session counter.
 */

const { app } = require('electron');
const logger = require('./logger');

let unreadCount = 0;
let tray = null;

/**
 * Wire up tray reference (called from main.js after tray is created).
 */
function setTray(trayInstance) {
    tray = trayInstance;
    refreshFromDb();
}

function getCount() {
    return unreadCount;
}

/**
 * Read current unviewed count from the database and update badges.
 * Call this after any operation that changes viewed state (new tebligat saved,
 * user marked viewed, etc). Safe to call frequently — a single indexed COUNT
 * query is cheap.
 */
function refreshFromDb() {
    try {
        const database = require('./database');
        const counts = database.getUnviewedCounts();
        unreadCount = counts.total;
    } catch (err) {
        logger.debug(`[UnreadCounter] refreshFromDb error: ${err.message}`);
    }
    updateBadges();
}

/**
 * Legacy API — still called from a few places. Now just refreshes from DB
 * (argument ignored since truth lives in the DB).
 */
function increment() {
    refreshFromDb();
}

/**
 * Legacy API — clearing the counter doesn't reset DB. Kept for backward compat
 * but triggers a refresh so badge matches real state.
 */
function clear() {
    refreshFromDb();
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

module.exports = { setTray, increment, clear, getCount, updateBadges, refreshFromDb };
