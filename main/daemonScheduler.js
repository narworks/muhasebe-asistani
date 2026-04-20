/**
 * Background daemon scheduler.
 * Runs every N minutes (default 2) and scans one client at a time based on priority.
 * Adapts to system state (battery, CPU, time of day).
 *
 * Lifecycle:
 *   start() → begins ticking
 *   stop() → halts ticks
 *   pause(ms) → pauses for specified duration
 *   getState() → returns { running, lastTick, lastResult, nextTickAt, stats }
 */

const database = require('./database');
const logger = require('./logger');
const settings = require('./settings');
const systemMonitor = require('./systemMonitor');
const gibScraper = require('./automation/gibScraper');
const notifications = require('./notifications');
let Sentry;
try {
    Sentry = require('@sentry/electron/main');
} catch {
    Sentry = null;
}

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const MIN_INTERVAL_MS = 60 * 1000; // Never go below 1 minute
const IP_BLOCK_PAUSE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CAPTCHA_STREAK_PAUSE_MS = 30 * 60 * 1000; // 30 minutes

let state = {
    running: false,
    paused: false,
    pauseUntil: 0,
    lastTickAt: 0,
    nextTickAt: 0,
    lastResult: null,
    consecutiveCaptchaFailures: 0,
    consecutiveIpBlocks: 0,
    stats: {
        totalScans: 0,
        successes: 0,
        failures: 0,
        newTebligatFound: 0,
        startedAt: null,
    },
};

let tickTimer = null;
let onEventCallback = null;

function getEffectiveSettings() {
    const s = settings.readSettings() || {};
    const daemon = s.daemon || {};
    return {
        enabled: daemon.enabled !== false, // default true
        intervalMs:
            typeof daemon.intervalMs === 'number'
                ? Math.max(daemon.intervalMs, MIN_INTERVAL_MS)
                : DEFAULT_INTERVAL_MS,
        acOnly: daemon.acOnly === true,
        nightModeAggressive: daemon.nightModeAggressive !== false,
        notificationsEnabled: daemon.notifications !== false,
    };
}

function emit(event, data) {
    if (onEventCallback) {
        try {
            onEventCallback({ event, data, state: getState() });
        } catch (err) {
            logger.debug(`[Daemon] emit error: ${err.message}`);
        }
    }
}

function getState() {
    return {
        running: state.running,
        paused: state.paused,
        pauseUntil: state.pauseUntil,
        lastTickAt: state.lastTickAt,
        nextTickAt: state.nextTickAt,
        lastResult: state.lastResult,
        stats: { ...state.stats },
    };
}

async function tick() {
    const ds = getEffectiveSettings();

    if (!ds.enabled) {
        logger.debug('[Daemon] disabled by settings, stopping');
        stop();
        return;
    }

    // Respect active pause
    if (state.pauseUntil > Date.now()) {
        const remainingMs = state.pauseUntil - Date.now();
        logger.debug(`[Daemon] paused, resuming in ${Math.round(remainingMs / 60000)}min`);
        state.nextTickAt = state.pauseUntil;
        scheduleNextTick(remainingMs);
        return;
    }
    state.paused = false;

    // Check system state
    const sysState = systemMonitor.snapshot();
    const decision = systemMonitor.shouldScanNow(sysState, ds);

    if (!decision.shouldScan) {
        logger.debug(`[Daemon] skipping tick: ${decision.reason}`);
        emit('skipped', { reason: decision.reason });
        scheduleNextTick(decision.delayMs || ds.intervalMs);
        return;
    }

    // Get next client to scan
    let client;
    try {
        client = database.getNextClientForDaemonScan();
    } catch (err) {
        logger.debug(`[Daemon] getNextClient error: ${err.message}`);
        scheduleNextTick(ds.intervalMs);
        return;
    }

    if (!client) {
        logger.debug('[Daemon] no eligible client, waiting');
        emit('idle', { reason: 'no_eligible_client' });
        scheduleNextTick(ds.intervalMs);
        return;
    }

    // Scan single client
    state.lastTickAt = Date.now();
    emit('scan_start', { clientId: client.id, firmName: client.firm_name });

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            logger.debug('[Daemon] no Gemini API key, disabling');
            stop();
            return;
        }

        const result = await gibScraper.scanSingleClient(client.id, apiKey);
        state.lastResult = result;
        state.stats.totalScans++;

        if (result.success) {
            state.stats.successes++;
            state.consecutiveCaptchaFailures = 0;
            state.consecutiveIpBlocks = 0;
            if (state.consecutiveFailuresForClient) {
                delete state.consecutiveFailuresForClient[client.id];
            }

            if (result.newTebligatCount > 0) {
                state.stats.newTebligatFound += result.newTebligatCount;
                if (ds.notificationsEnabled) {
                    notifications.notifyNewTebligat(client.firm_name, result.newTebligatCount);
                }
                emit('new_tebligat', {
                    clientId: client.id,
                    firmName: client.firm_name,
                    count: result.newTebligatCount,
                });
            }

            emit('scan_success', {
                clientId: client.id,
                firmName: client.firm_name,
                newTebligatCount: result.newTebligatCount,
                durationMs: result.durationMs,
            });
        } else {
            state.stats.failures++;

            // IP block → long pause
            if (result.errorType === 'ip_blocked') {
                state.consecutiveIpBlocks++;
                state.pauseUntil = Date.now() + IP_BLOCK_PAUSE_MS;
                state.paused = true;
                logger.debug('[Daemon] IP block detected, pausing 24h');
                if (ds.notificationsEnabled) {
                    notifications.notifyCritical(
                        'GİB IP Engeli',
                        'Uygulama 24 saat tarama yapmayacak. IP engelinizin kaldırılması için GİB Teknoloji ile iletişime geçin.'
                    );
                }
                emit('ip_blocked', {});
                scheduleNextTick(IP_BLOCK_PAUSE_MS);
                return;
            }

            // CAPTCHA streak → short pause
            if (result.errorType === 'captcha_failed') {
                state.consecutiveCaptchaFailures++;
                if (state.consecutiveCaptchaFailures >= 3) {
                    state.pauseUntil = Date.now() + CAPTCHA_STREAK_PAUSE_MS;
                    state.paused = true;
                    logger.debug('[Daemon] 3+ CAPTCHA failures, pausing 30min');
                    if (Sentry) {
                        Sentry.captureMessage('daemon.captcha_streak', {
                            level: 'warning',
                            tags: { component: 'daemon', errorType: 'captcha_streak' },
                        });
                    }
                    state.consecutiveCaptchaFailures = 0;
                    emit('captcha_streak', {});
                    scheduleNextTick(CAPTCHA_STREAK_PAUSE_MS);
                    return;
                }
            }

            // Track consecutive failures per-client (e.g., same mükellef always failing)
            state.lastFailedClientId = client.id;
            state.consecutiveFailuresForClient = state.consecutiveFailuresForClient || {};
            state.consecutiveFailuresForClient[client.id] =
                (state.consecutiveFailuresForClient[client.id] || 0) + 1;

            // If same client fails 3+ times in a row, report to Sentry (not PII — just client_id)
            if (state.consecutiveFailuresForClient[client.id] === 3) {
                if (Sentry) {
                    Sentry.captureMessage(`daemon.client_repeat_failure`, {
                        level: 'warning',
                        tags: {
                            component: 'daemon',
                            errorType: result.errorType,
                        },
                        extra: {
                            clientId: client.id,
                            errorType: result.errorType,
                            consecutiveFailures: 3,
                        },
                    });
                }
            }

            emit('scan_failure', {
                clientId: client.id,
                firmName: client.firm_name,
                errorType: result.errorType,
                errorMessage: result.errorMessage,
            });
        }
    } catch (err) {
        logger.debug(`[Daemon] tick error: ${err.message}`);
        state.stats.failures++;
        emit('tick_error', { message: err.message });
    }

    // Schedule next tick with adaptive interval
    const multiplier = systemMonitor.getIntervalMultiplier(sysState, ds);
    const nextInterval = Math.max(MIN_INTERVAL_MS, Math.round(ds.intervalMs * multiplier));
    scheduleNextTick(nextInterval);
}

function scheduleNextTick(delayMs) {
    if (tickTimer) clearTimeout(tickTimer);
    if (!state.running) return;
    state.nextTickAt = Date.now() + delayMs;
    tickTimer = setTimeout(() => {
        tick().catch((err) => {
            logger.debug(`[Daemon] unhandled tick error: ${err.message}`);
        });
    }, delayMs);
}

function start(eventCallback = null) {
    if (state.running) {
        logger.debug('[Daemon] already running');
        return;
    }
    const ds = getEffectiveSettings();
    if (!ds.enabled) {
        logger.debug('[Daemon] not starting: disabled in settings');
        return;
    }

    onEventCallback = eventCallback;
    state.running = true;
    state.paused = false;
    state.pauseUntil = 0;
    state.stats.startedAt = Date.now();
    state.stats.totalScans = 0;
    state.stats.successes = 0;
    state.stats.failures = 0;
    state.stats.newTebligatFound = 0;

    logger.debug(`[Daemon] started, interval ${ds.intervalMs}ms`);
    emit('started', {});

    // First tick with a small delay (10s) to let app settle
    scheduleNextTick(10 * 1000);
}

function stop() {
    if (!state.running) return;
    state.running = false;
    state.paused = false;
    if (tickTimer) {
        clearTimeout(tickTimer);
        tickTimer = null;
    }
    logger.debug('[Daemon] stopped');
    emit('stopped', {});
}

function pause(durationMs) {
    state.pauseUntil = Date.now() + durationMs;
    state.paused = true;
    emit('paused', { durationMs });
    scheduleNextTick(durationMs);
}

function resume() {
    state.paused = false;
    state.pauseUntil = 0;
    state.consecutiveCaptchaFailures = 0;
    state.consecutiveIpBlocks = 0;
    emit('resumed', {});
    scheduleNextTick(1000); // resume with 1s delay
}

module.exports = {
    start,
    stop,
    pause,
    resume,
    getState,
};
