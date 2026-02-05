const cron = require('node-cron');
const settings = require('./settings');

let scheduledTask = null;
let onScanCallback = null;

function init(onScanTrigger) {
    onScanCallback = onScanTrigger;
    const current = settings.readSettings();
    if (current.schedule && current.schedule.enabled && current.schedule.time) {
        startSchedule(
            current.schedule.time,
            current.schedule.frequency || 'daily',
            current.schedule.customDays || []
        );
    }
}

/**
 * Build cron expression from time, frequency, and custom days
 * @param {string} time - Time in HH:MM format
 * @param {string} frequency - 'daily' | 'weekdays' | 'weekends' | 'custom'
 * @param {number[]} customDays - Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
 * @returns {string} Cron expression
 */
function buildCronExpression(time, frequency, customDays) {
    const [hours, minutes] = time.split(':').map(Number);

    let dayOfWeek = '*';
    switch (frequency) {
        case 'weekdays':
            dayOfWeek = '1-5';
            break;
        case 'weekends':
            dayOfWeek = '0,6';
            break;
        case 'custom':
            if (customDays && customDays.length > 0) {
                dayOfWeek = [...customDays].sort((a, b) => a - b).join(',');
            }
            break;
        // 'daily' default: '*'
    }

    return `${minutes} ${hours} * * ${dayOfWeek}`;
}

/**
 * Calculate the next scheduled run time
 * @param {string} time - Time in HH:MM format
 * @param {string} frequency - 'daily' | 'weekdays' | 'weekends' | 'custom'
 * @param {number[]} customDays - Array of day numbers
 * @returns {Date} Next scheduled run time
 */
function calculateNextRun(time, frequency, customDays) {
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();

    // Get allowed days based on frequency
    let allowedDays;
    switch (frequency) {
        case 'weekdays':
            allowedDays = [1, 2, 3, 4, 5];
            break;
        case 'weekends':
            allowedDays = [0, 6];
            break;
        case 'custom':
            allowedDays = customDays && customDays.length > 0 ? customDays : [0, 1, 2, 3, 4, 5, 6];
            break;
        default: // daily
            allowedDays = [0, 1, 2, 3, 4, 5, 6];
    }

    // Find the next allowed day
    for (let daysAhead = 0; daysAhead < 8; daysAhead++) {
        const candidate = new Date(now);
        candidate.setDate(candidate.getDate() + daysAhead);
        candidate.setHours(hours, minutes, 0, 0);

        const dayOfWeek = candidate.getDay();

        if (allowedDays.includes(dayOfWeek)) {
            // If it's today, check if the time hasn't passed yet
            if (daysAhead === 0 && candidate <= now) {
                continue;
            }
            return candidate;
        }
    }

    // Fallback (should not happen)
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() + 1);
    fallback.setHours(hours, minutes, 0, 0);
    return fallback;
}

function startSchedule(timeStr, frequency = 'daily', customDays = []) {
    stopSchedule();

    const [hours, minutes] = timeStr.split(':').map(Number);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        console.error('[Scheduler] Invalid time format:', timeStr);
        return false;
    }

    // Validate custom days for 'custom' frequency
    if (frequency === 'custom' && (!customDays || customDays.length === 0)) {
        console.error('[Scheduler] Custom frequency requires at least one day selected');
        return false;
    }

    const cronExpression = buildCronExpression(timeStr, frequency, customDays);

    if (!cron.validate(cronExpression)) {
        console.error('[Scheduler] Invalid cron expression:', cronExpression);
        return false;
    }

    const frequencyLabel = {
        daily: 'Her gün',
        weekdays: 'Hafta içi',
        weekends: 'Hafta sonu',
        custom: `Özel günler (${customDays.join(',')})`
    }[frequency];

    console.log(`[Scheduler] Scan scheduled: ${frequencyLabel} at ${timeStr} (cron: ${cronExpression})`);

    scheduledTask = cron.schedule(cronExpression, () => {
        console.log(`[Scheduler] Triggered scheduled scan at ${new Date().toISOString()}`);

        // Update last scan time and calculate next run
        const nextRun = calculateNextRun(timeStr, frequency, customDays);
        settings.updateSettings({
            schedule: {
                lastScheduledScanAt: new Date().toISOString(),
                nextScheduledScanAt: nextRun.toISOString()
            }
        });

        if (onScanCallback) onScanCallback();
    });

    // Calculate and save next run time
    const nextRun = calculateNextRun(timeStr, frequency, customDays);

    settings.updateSettings({
        schedule: {
            enabled: true,
            time: timeStr,
            frequency: frequency,
            customDays: customDays,
            nextScheduledScanAt: nextRun.toISOString()
        }
    });

    return true;
}

function stopSchedule() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
    settings.updateSettings({
        schedule: {
            enabled: false,
            nextScheduledScanAt: null
        }
    });
}

function getStatus() {
    const current = settings.readSettings();
    return {
        enabled: current.schedule?.enabled || false,
        time: current.schedule?.time || '08:00',
        frequency: current.schedule?.frequency || 'daily',
        customDays: current.schedule?.customDays || [],
        lastScheduledScanAt: current.schedule?.lastScheduledScanAt || null,
        nextScheduledScanAt: current.schedule?.nextScheduledScanAt || null
    };
}

module.exports = { init, startSchedule, stopSchedule, getStatus, buildCronExpression };
