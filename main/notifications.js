/**
 * Native OS notifications for background daemon events.
 * Uses Electron's Notification API (macOS/Windows/Linux native).
 */

const { Notification, nativeImage, app } = require('electron');
const path = require('path');
const logger = require('./logger');
const settings = require('./settings');

let iconCache = null;

function getIcon() {
    if (iconCache) return iconCache;
    try {
        const iconPath = app.isPackaged
            ? path.join(process.resourcesPath, 'icon.png')
            : path.join(__dirname, '..', 'build', 'icon.png');
        iconCache = nativeImage.createFromPath(iconPath);
        return iconCache;
    } catch {
        return null;
    }
}

function areNotificationsAllowed() {
    try {
        const s = settings.readSettings() || {};
        const daemon = s.daemon || {};
        if (daemon.notifications === false) return false;
    } catch {
        /* default to allowed */
    }
    return Notification.isSupported();
}

// Callback for opening main window — set from main.js
let openMainWindowCallback = null;

function setOpenMainWindowCallback(fn) {
    openMainWindowCallback = fn;
}

function show({ title, body, silent = false, urgency = 'normal', onClick = null }) {
    if (!areNotificationsAllowed()) return;
    try {
        const icon = getIcon();
        const n = new Notification({
            title,
            body,
            silent,
            urgency,
            ...(icon ? { icon } : {}),
        });
        // Click handler: opens main window + optionally runs extra callback
        n.on('click', () => {
            try {
                if (openMainWindowCallback) openMainWindowCallback();
                if (onClick) onClick();
            } catch (err) {
                logger.debug(`[Notifications] click handler error: ${err.message}`);
            }
        });
        n.show();
    } catch (err) {
        logger.debug(`[Notifications] show error: ${err.message}`);
    }
}

function notifyNewTebligat(firmName, count) {
    const title = count === 1 ? '🔔 Yeni Tebligat' : `🔔 ${count} Yeni Tebligat`;
    const body = `${firmName} için yeni tebligat bildirimleri var. Görmek için tıklayın.`;
    show({ title, body, urgency: 'normal' });
}

function notifyCritical(title, body) {
    show({ title: `⚠️ ${title}`, body, urgency: 'critical' });
}

function notifyInfo(title, body) {
    show({ title, body, urgency: 'low', silent: true });
}

module.exports = {
    show,
    notifyNewTebligat,
    notifyCritical,
    notifyInfo,
    areNotificationsAllowed,
    setOpenMainWindowCallback,
};
