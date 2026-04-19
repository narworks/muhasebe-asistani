/**
 * System resource monitor for adaptive daemon behavior.
 * Reports battery, CPU, network, and disk status to the scheduler.
 */

const os = require('os');
const fs = require('fs');
const { powerMonitor, net, app } = require('electron');
const logger = require('./logger');

let lastCpuInfo = null;

/**
 * Get current CPU usage percentage (averaged over ~500ms sample).
 * Returns 0-100.
 */
function getCpuUsagePercent() {
    const cpus = os.cpus();
    const info = cpus.reduce(
        (acc, cpu) => {
            acc.total +=
                cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
            acc.idle += cpu.times.idle;
            return acc;
        },
        { total: 0, idle: 0 }
    );

    if (!lastCpuInfo) {
        lastCpuInfo = info;
        return 0;
    }

    const totalDiff = info.total - lastCpuInfo.total;
    const idleDiff = info.idle - lastCpuInfo.idle;
    lastCpuInfo = info;

    if (totalDiff <= 0) return 0;
    return Math.round(100 * (1 - idleDiff / totalDiff));
}

/**
 * Get battery status (Electron API).
 * Returns { charging: boolean|null, percent: number|null, onBatteryPower: boolean }.
 */
function getBatteryStatus() {
    try {
        return {
            onBatteryPower: powerMonitor.isOnBatteryPower(),
            charging: !powerMonitor.isOnBatteryPower(),
            percent: null, // Electron doesn't expose battery percentage directly
        };
    } catch {
        return { charging: null, percent: null, onBatteryPower: false };
    }
}

/**
 * Check if the system has internet access.
 */
function isOnline() {
    try {
        return net.isOnline();
    } catch {
        return true; // assume online if detection fails
    }
}

/**
 * Get free memory percent.
 */
function getFreeMemoryPercent() {
    const total = os.totalmem();
    const free = os.freemem();
    return Math.round((free / total) * 100);
}

/**
 * Get free disk space in MB for the user data directory.
 * Best-effort; returns null if detection fails.
 */
function getFreeDiskSpaceMB() {
    try {
        const stat = fs.statfsSync(app.getPath('userData'));
        const freeBytes = stat.bavail * stat.bsize;
        return Math.round(freeBytes / 1024 / 1024);
    } catch {
        return null;
    }
}

/**
 * Check if system is idle (user inactive) — Electron's powerMonitor.
 * Returns seconds since last input.
 */
function getIdleTimeSeconds() {
    try {
        return powerMonitor.getSystemIdleTime();
    } catch {
        return 0;
    }
}

/**
 * Snapshot current system state for scheduler decision-making.
 */
function snapshot() {
    return {
        timestamp: Date.now(),
        cpu_percent: getCpuUsagePercent(),
        battery: getBatteryStatus(),
        online: isOnline(),
        free_memory_percent: getFreeMemoryPercent(),
        free_disk_mb: getFreeDiskSpaceMB(),
        idle_seconds: getIdleTimeSeconds(),
        hour: new Date().getHours(),
        day_of_week: new Date().getDay(), // 0=Sunday
    };
}

/**
 * Decide whether daemon should scan NOW based on system state.
 * Returns { shouldScan: boolean, reason: string, delayMs?: number }.
 */
function shouldScanNow(state, settings = {}) {
    // Network: hard block if offline
    if (!state.online) {
        return { shouldScan: false, reason: 'offline', delayMs: 60000 };
    }

    // Disk: block if <500 MB free
    if (state.free_disk_mb !== null && state.free_disk_mb < 500) {
        return { shouldScan: false, reason: 'disk_full', delayMs: 30 * 60 * 1000 };
    }

    // Battery: pause if on battery and setting says so
    if (state.battery.onBatteryPower) {
        if (settings.acOnly) {
            return { shouldScan: false, reason: 'battery_ac_only_mode', delayMs: 5 * 60 * 1000 };
        }
    }

    // CPU: pause if system very busy
    if (state.cpu_percent > 70) {
        return { shouldScan: false, reason: 'cpu_busy', delayMs: 3 * 60 * 1000 };
    }

    // Memory check is disabled on macOS — os.freemem() is misleading (doesn't count
    // cached/compressed memory that OS reclaims on demand). A 32GB Mac with many apps
    // open can show <1% "free" while having plenty of available RAM.
    // On Windows/Linux, os.freemem() is more accurate; use 2% as a safety threshold.
    if (process.platform !== 'darwin' && state.free_memory_percent < 2) {
        return { shouldScan: false, reason: 'low_memory', delayMs: 5 * 60 * 1000 };
    }

    return { shouldScan: true, reason: 'ok' };
}

/**
 * Determine interval adjustment based on time and resources.
 * Returns multiplier: 1.0 = normal (2 min), 2.0 = slow (4 min), 0.5 = fast (1 min).
 */
function getIntervalMultiplier(state, settings = {}) {
    // Battery without AC → slower (unless user disabled)
    if (state.battery.onBatteryPower && !settings.acOnly) {
        return 2.0; // half speed on battery
    }

    // Night mode (02:00-06:00) → faster if enabled
    if (settings.nightModeAggressive !== false && state.hour >= 2 && state.hour < 6) {
        return 0.5; // 2x faster at night
    }

    // Weekend → slower
    if ((state.day_of_week === 0 || state.day_of_week === 6) && state.hour < 9) {
        return 2.0;
    }

    return 1.0;
}

module.exports = {
    snapshot,
    shouldScanNow,
    getIntervalMultiplier,
    getCpuUsagePercent,
    getBatteryStatus,
    isOnline,
    getFreeDiskSpaceMB,
};
