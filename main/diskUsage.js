/**
 * Disk usage calculator for documents folder + warning logic.
 * Runs periodically to compute total size, warns user when threshold exceeded.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const logger = require('./logger');
const settings = require('./settings');
const systemMonitor = require('./systemMonitor');
const notifications = require('./notifications');

const WARNING_THRESHOLD_MB = 5 * 1024; // 5 GB
const WARNING_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000; // at most once per 24h

let cache = {
    totalMB: null,
    fileCount: null,
    freeDiskMB: null,
    computedAt: 0,
};
let lastWarningAt = 0;

function getDocumentsBasePath() {
    const s = settings.readSettings() || {};
    return s.documentsFolder || path.join(app.getPath('userData'), 'documents');
}

/**
 * Recursively compute directory size in bytes + file count.
 * Safe against permission errors.
 */
function computeDirSize(dir) {
    let bytes = 0;
    let count = 0;
    try {
        if (!fs.existsSync(dir)) return { bytes: 0, count: 0 };
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            try {
                if (entry.isDirectory()) {
                    const sub = computeDirSize(full);
                    bytes += sub.bytes;
                    count += sub.count;
                } else if (entry.isFile()) {
                    bytes += fs.statSync(full).size;
                    count++;
                }
            } catch {
                /* skip unreadable entries */
            }
        }
    } catch {
        /* skip unreadable dir */
    }
    return { bytes, count };
}

/**
 * Compute disk usage. Cached for 5 minutes to avoid I/O overhead.
 */
function getDiskUsage(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cache.totalMB !== null && now - cache.computedAt < 5 * 60 * 1000) {
        return cache;
    }

    const basePath = getDocumentsBasePath();
    const { bytes, count } = computeDirSize(basePath);
    const totalMB = Math.round(bytes / 1024 / 1024);
    const freeDiskMB = systemMonitor.getFreeDiskSpaceMB();

    cache = {
        totalMB,
        fileCount: count,
        freeDiskMB,
        documentsPath: basePath,
        computedAt: now,
    };

    // Check warning threshold
    checkWarningThreshold(totalMB);

    return cache;
}

function checkWarningThreshold(totalMB) {
    if (totalMB < WARNING_THRESHOLD_MB) return;
    const now = Date.now();
    if (now - lastWarningAt < WARNING_MIN_INTERVAL_MS) return; // already warned in last 24h

    const gb = (totalMB / 1024).toFixed(1);
    try {
        notifications.notifyCritical(
            'Belgeler disk alanı uyarısı',
            `Tebligat belgeleriniz ${gb} GB alan kapladı. Yedekleme veya eski belgelerin temizlenmesi önerilir.`
        );
        lastWarningAt = now;
        logger.debug(`[DiskUsage] Warning triggered at ${gb} GB`);
    } catch (err) {
        logger.debug(`[DiskUsage] Warning notification error: ${err.message}`);
    }
}

/**
 * Background refresh — call on app startup and every 6 hours.
 */
function scheduleBackgroundRefresh() {
    // Initial check after 30s
    setTimeout(() => {
        getDiskUsage(true);
    }, 30 * 1000);

    // Then every 6 hours
    setInterval(
        () => {
            getDiskUsage(true);
        },
        6 * 60 * 60 * 1000
    );
}

module.exports = { getDiskUsage, scheduleBackgroundRefresh };
