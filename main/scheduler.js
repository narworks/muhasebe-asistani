const cron = require('node-cron');
const settings = require('./settings');
const database = require('./database');
const logger = require('./logger');

let scheduledTask = null;
let onScanCallback = null;

function init(onScanTrigger) {
    onScanCallback = onScanTrigger;
    const current = settings.readSettings();
    if (
        current.schedule &&
        current.schedule.enabled &&
        (current.schedule.finishByTime || current.schedule.startAtTime)
    ) {
        startSchedule(
            current.schedule.finishByTime,
            current.schedule.frequency || 'daily',
            current.schedule.customDays || [],
            current.schedule.startAtTime || null
        );

        // Check if a scheduled scan was missed while app was closed/sleeping.
        // Use estimatedStartTime (when cron WOULD HAVE fired) instead of nextScheduledScanAt (finish time).
        const missedTrigger = current.schedule.estimatedStartTime;
        if (missedTrigger) {
            const triggerTime = new Date(missedTrigger);
            const now = new Date();
            if (triggerTime < now) {
                const missedAgo = Math.round((now - triggerTime) / 60000);
                logger.debug(
                    `[Scheduler] Missed scan detected (${missedAgo} min ago), triggering now`
                );
                setTimeout(() => {
                    if (onScanCallback) onScanCallback();
                }, 30000);
            }
        }
    }
}

/**
 * Estimate scan duration based on number of active clients
 * Factors: login time, CAPTCHA solving, delays between clients, batch pauses
 * @returns {{ totalMinutes: number, clientCount: number }}
 */
function estimateScanDuration() {
    let activeClientCount = 0;
    try {
        const clients = database.getClients();
        activeClientCount = clients.filter((c) => c.status === 'active').length;
    } catch (e) {
        console.error('[Scheduler] Could not get client count:', e.message);
    }

    if (activeClientCount === 0) {
        return { totalMinutes: 0, clientCount: 0 };
    }

    const scanSettings = settings.readSettings().scan || {};
    const delayMin = scanSettings.delayMin || 15;
    const delayMax = scanSettings.delayMax || 45;
    const batchSize = scanSettings.batchSize || 20;
    const batchPauseMin = scanSettings.batchPauseMin || 120;
    const batchPauseMax = scanSettings.batchPauseMax || 300;

    // Average delay between clients (in seconds)
    const avgDelaySeconds = (delayMin + delayMax) / 2;

    // Average batch pause (in seconds)
    const avgBatchPauseSeconds = (batchPauseMin + batchPauseMax) / 2;

    // Estimated time per client (login + CAPTCHA + scraping + logout): ~45 seconds
    const timePerClientSeconds = 45;

    // Total delay time between clients
    const totalDelaySeconds = (activeClientCount - 1) * avgDelaySeconds;

    // Number of batch pauses
    const batchPauseCount = Math.max(0, Math.floor((activeClientCount - 1) / batchSize));
    const totalBatchPauseSeconds = batchPauseCount * avgBatchPauseSeconds;

    // Total processing time
    const totalProcessingSeconds = activeClientCount * timePerClientSeconds;

    // Total estimated time in minutes
    const totalSeconds = totalProcessingSeconds + totalDelaySeconds + totalBatchPauseSeconds;
    const totalMinutes = Math.ceil(totalSeconds / 60);

    // Add 20% buffer for safety
    const bufferedMinutes = Math.ceil(totalMinutes * 1.2);

    logger.debug(
        `[Scheduler] Estimated duration: ${bufferedMinutes} minutes for ${activeClientCount} clients`
    );

    return { totalMinutes: bufferedMinutes, clientCount: activeClientCount };
}

/**
 * Get allowed day numbers for a given frequency
 */
function getAllowedDays(frequency, customDays) {
    switch (frequency) {
        case 'weekdays':
            return [1, 2, 3, 4, 5];
        case 'weekends':
            return [0, 6];
        case 'custom':
            return customDays && customDays.length > 0 ? customDays : [0, 1, 2, 3, 4, 5, 6];
        default: // daily
            return [0, 1, 2, 3, 4, 5, 6];
    }
}

/**
 * Calculate the start time based on finish time and estimated duration
 */
function calculateStartTime(finishTime, durationMinutes, frequency, customDays) {
    if (!finishTime) {
        throw new Error('calculateStartTime: finishTime is required');
    }
    const [hours, minutes] = finishTime.split(':').map(Number);
    const now = new Date();
    const allowedDays = getAllowedDays(frequency, customDays);

    // Find the next allowed day where the start time is still in the future
    for (let daysAhead = 0; daysAhead < 8; daysAhead++) {
        const candidateFinish = new Date(now);
        candidateFinish.setDate(candidateFinish.getDate() + daysAhead);
        candidateFinish.setHours(hours, minutes, 0, 0);

        if (allowedDays.includes(candidateFinish.getDay())) {
            const candidateStart = new Date(
                candidateFinish.getTime() - durationMinutes * 60 * 1000
            );
            if (candidateStart > now) {
                return { startTime: candidateStart, finishTime: candidateFinish };
            }
        }
    }

    // Fallback
    const fallbackFinish = new Date(now);
    fallbackFinish.setDate(fallbackFinish.getDate() + 1);
    fallbackFinish.setHours(hours, minutes, 0, 0);
    const fallbackStart = new Date(fallbackFinish.getTime() - durationMinutes * 60 * 1000);
    return { startTime: fallbackStart, finishTime: fallbackFinish };
}

/**
 * Calculate finish time from start time (used in start mode).
 * Finds the next allowed day where start time is in the future.
 */
function calculateFinishFromStart(startAtTime, durationMinutes, frequency, customDays) {
    if (!startAtTime) {
        throw new Error('calculateFinishFromStart: startAtTime is required');
    }
    const [sh, sm] = startAtTime.split(':').map(Number);
    const now = new Date();
    const allowedDays = getAllowedDays(frequency, customDays);

    for (let daysAhead = 0; daysAhead < 8; daysAhead++) {
        const candidateStart = new Date(now);
        candidateStart.setDate(candidateStart.getDate() + daysAhead);
        candidateStart.setHours(sh, sm, 0, 0);

        if (allowedDays.includes(candidateStart.getDay())) {
            // Grace period: if today AND start time passed by less than 2 minutes,
            // trigger NOW (with small delay). Otherwise move to next allowed day.
            if (candidateStart > now) {
                const finishTime = new Date(candidateStart.getTime() + durationMinutes * 60 * 1000);
                return { startTime: candidateStart, finishTime };
            }
            if (daysAhead === 0) {
                const minutesPassed = (now - candidateStart) / 60000;
                if (minutesPassed < 2) {
                    const immediateStart = new Date(now.getTime() + 5000); // 5s from now
                    const finishTime = new Date(
                        immediateStart.getTime() + durationMinutes * 60 * 1000
                    );
                    return { startTime: immediateStart, finishTime };
                }
            }
        }
    }

    // Fallback: tomorrow at requested time
    const fallbackStart = new Date(now);
    fallbackStart.setDate(fallbackStart.getDate() + 1);
    fallbackStart.setHours(sh, sm, 0, 0);
    const fallbackFinish = new Date(fallbackStart.getTime() + durationMinutes * 60 * 1000);
    return { startTime: fallbackStart, finishTime: fallbackFinish };
}

/**
 * Build cron expression from time
 * @param {Date} startTime - Start time as Date object
 * @param {string} frequency - 'daily' | 'weekdays' | 'weekends' | 'custom'
 * @param {number[]} customDays - Array of day numbers
 * @returns {string} Cron expression
 */
function buildCronExpression(startTime, frequency, customDays) {
    const hours = startTime.getHours();
    const minutes = startTime.getMinutes();

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

function startSchedule(finishByTime, frequency = 'daily', customDays = [], startAtTime = null) {
    stopSchedule();

    const timeToValidate = startAtTime || finishByTime;
    const [hours, minutes] = timeToValidate.split(':').map(Number);

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        console.error('[Scheduler] Invalid time format:', timeToValidate);
        return false;
    }

    // Validate custom days for 'custom' frequency
    if (frequency === 'custom' && (!customDays || customDays.length === 0)) {
        console.error('[Scheduler] Custom frequency requires at least one day selected');
        return false;
    }

    // Estimate scan duration
    const { totalMinutes, clientCount } = estimateScanDuration();

    if (clientCount === 0) {
        console.warn('[Scheduler] No active clients found, cannot schedule scan');
        settings.updateSettings({
            schedule: {
                enabled: false,
                finishByTime: finishByTime || null,
                startAtTime: startAtTime || null,
                frequency: frequency,
                customDays: customDays,
                estimatedDurationMinutes: 0,
                estimatedStartTime: null,
                nextScheduledScanAt: null,
            },
        });
        return false;
    }

    // Calculate when to start
    let startTime, finishTime;
    if (startAtTime) {
        ({ startTime, finishTime } = calculateFinishFromStart(
            startAtTime,
            totalMinutes,
            frequency,
            customDays
        ));
    } else {
        ({ startTime, finishTime } = calculateStartTime(
            finishByTime,
            totalMinutes,
            frequency,
            customDays
        ));
    }
    const cronExpression = buildCronExpression(startTime, frequency, customDays);

    if (!cron.validate(cronExpression)) {
        console.error('[Scheduler] Invalid cron expression:', cronExpression);
        return false;
    }

    const frequencyLabel = {
        daily: 'Her gün',
        weekdays: 'Hafta içi',
        weekends: 'Hafta sonu',
        custom: `Özel günler (${customDays.join(',')})`,
    }[frequency];

    logger.debug(
        `[Scheduler] Scan scheduled: ${frequencyLabel}, finish by ${finishByTime}, start at ${startTime.toLocaleTimeString('tr-TR')} (cron: ${cronExpression})`
    );
    logger.debug(
        `[Scheduler] Estimated duration: ${totalMinutes} minutes for ${clientCount} clients`
    );

    scheduledTask = cron.schedule(cronExpression, () => {
        logger.debug(`[Scheduler] Triggered scheduled scan at ${new Date().toISOString()}`);

        // Recalculate next run — branch based on active mode
        const { totalMinutes: newDuration } = estimateScanDuration();
        let nextStart, nextFinish;
        try {
            if (startAtTime) {
                ({ startTime: nextStart, finishTime: nextFinish } = calculateFinishFromStart(
                    startAtTime,
                    newDuration,
                    frequency,
                    customDays
                ));
            } else {
                ({ startTime: nextStart, finishTime: nextFinish } = calculateStartTime(
                    finishByTime,
                    newDuration,
                    frequency,
                    customDays
                ));
            }

            settings.updateSettings({
                schedule: {
                    lastScheduledScanAt: new Date().toISOString(),
                    estimatedStartTime: nextStart.toISOString(),
                    nextScheduledScanAt: nextFinish.toISOString(),
                    estimatedDurationMinutes: newDuration,
                },
            });
        } catch (err) {
            logger.error('[Scheduler] Failed to recalculate next run:', err);
        }

        if (onScanCallback) onScanCallback();
    });

    // Save settings with next run info — always use null (not undefined) for unused fields
    settings.updateSettings({
        schedule: {
            enabled: true,
            finishByTime: finishByTime || null,
            startAtTime: startAtTime || null,
            frequency: frequency,
            customDays: customDays,
            estimatedDurationMinutes: totalMinutes,
            estimatedStartTime: startTime.toISOString(),
            nextScheduledScanAt: finishTime.toISOString(),
        },
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
            estimatedStartTime: null,
            nextScheduledScanAt: null,
        },
    });
}

function getStatus() {
    const current = settings.readSettings();

    // Recalculate estimated duration if schedule is enabled
    let estimatedDurationMinutes = current.schedule?.estimatedDurationMinutes || 0;
    let clientCount = 0;

    if (current.schedule?.enabled) {
        const estimation = estimateScanDuration();
        estimatedDurationMinutes = estimation.totalMinutes;
        clientCount = estimation.clientCount;
    }

    return {
        enabled: current.schedule?.enabled || false,
        finishByTime: current.schedule?.finishByTime || '08:00',
        startAtTime: current.schedule?.startAtTime || null,
        // Keep 'time' for backwards compatibility
        time: current.schedule?.finishByTime || current.schedule?.time || '08:00',
        frequency: current.schedule?.frequency || 'daily',
        customDays: current.schedule?.customDays || [],
        lastScheduledScanAt: current.schedule?.lastScheduledScanAt || null,
        nextScheduledScanAt: current.schedule?.nextScheduledScanAt || null,
        estimatedStartTime: current.schedule?.estimatedStartTime || null,
        estimatedDurationMinutes: estimatedDurationMinutes,
        clientCount: clientCount,
    };
}

/**
 * Refresh schedule timing (call when client count changes)
 */
function refreshSchedule() {
    const current = settings.readSettings();
    if (
        current.schedule?.enabled &&
        (current.schedule?.finishByTime || current.schedule?.startAtTime)
    ) {
        startSchedule(
            current.schedule.finishByTime,
            current.schedule.frequency || 'daily',
            current.schedule.customDays || [],
            current.schedule.startAtTime || null
        );
    }
}

module.exports = {
    init,
    startSchedule,
    stopSchedule,
    getStatus,
    refreshSchedule,
    estimateScanDuration,
};
