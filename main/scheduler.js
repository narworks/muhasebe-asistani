const cron = require('node-cron');
const settings = require('./settings');

let scheduledTask = null;
let onScanCallback = null;

function init(onScanTrigger) {
    onScanCallback = onScanTrigger;
    const current = settings.readSettings();
    if (current.schedule && current.schedule.enabled && current.schedule.time) {
        startSchedule(current.schedule.time);
    }
}

function startSchedule(timeStr) {
    stopSchedule();

    const [hours, minutes] = timeStr.split(':').map(Number);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        console.error('[Scheduler] Invalid time format:', timeStr);
        return false;
    }

    const cronExpression = `${minutes} ${hours} * * *`;

    if (!cron.validate(cronExpression)) {
        console.error('[Scheduler] Invalid cron expression:', cronExpression);
        return false;
    }

    console.log(`[Scheduler] Daily scan scheduled at ${timeStr} (cron: ${cronExpression})`);

    scheduledTask = cron.schedule(cronExpression, () => {
        console.log(`[Scheduler] Triggered scheduled scan at ${new Date().toISOString()}`);
        settings.updateSettings({
            schedule: { lastScheduledScanAt: new Date().toISOString() }
        });
        if (onScanCallback) onScanCallback();
    });

    // Calculate next run time
    const now = new Date();
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
        next.setDate(next.getDate() + 1);
    }

    settings.updateSettings({
        schedule: {
            enabled: true,
            time: timeStr,
            nextScheduledScanAt: next.toISOString()
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
        lastScheduledScanAt: current.schedule?.lastScheduledScanAt || null,
        nextScheduledScanAt: current.schedule?.nextScheduledScanAt || null
    };
}

module.exports = { init, startSchedule, stopSchedule, getStatus };
