const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let Sentry;
try {
    Sentry = require('@sentry/electron/main');
} catch {
    Sentry = null;
}

const isProduction = app.isPackaged;

// File logging — without this, info/warn/error go to console only. In a
// packaged Electron app that console output is not easily accessible to
// users, so support conversations lost diagnostic context. File logging
// with rotation gives us a tail to inspect when users report problems.
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB — 1 rotation = 10 MB total cap
let logDir;
let logFile;
try {
    logDir = path.join(app.getPath('userData'), 'logs');
    logFile = path.join(logDir, 'main.log');
} catch {
    // app.getPath can throw very early in startup; we'll lazy-init on first write.
    logDir = null;
    logFile = null;
}

const ensureLogDir = () => {
    try {
        if (!logDir) {
            logDir = path.join(app.getPath('userData'), 'logs');
            logFile = path.join(logDir, 'main.log');
        }
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    } catch {
        /* ignore — file logging degrades silently rather than crash the app */
    }
};

const rotateIfNeeded = () => {
    try {
        const stats = fs.statSync(logFile);
        if (stats.size > MAX_LOG_SIZE) {
            const backup = logFile + '.old';
            try {
                fs.unlinkSync(backup);
            } catch {
                /* no prior backup */
            }
            fs.renameSync(logFile, backup);
        }
    } catch {
        /* file doesn't exist yet or stat failed — next write creates it */
    }
};

const formatArg = (a) => {
    if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
    if (typeof a === 'object') {
        try {
            return JSON.stringify(a);
        } catch {
            return String(a);
        }
    }
    return String(a);
};

const writeToFile = (level, args) => {
    try {
        ensureLogDir();
        if (!logFile) return;
        rotateIfNeeded();
        const ts = new Date().toISOString();
        const msg = args.map(formatArg).join(' ');
        fs.appendFileSync(logFile, `[${ts}] [${level}] ${msg}\n`);
    } catch {
        /* ignore — file logging is best-effort */
    }
};

/**
 * Return the log file path so support flows can open it in Finder/Explorer
 * without hardcoding the userData layout in multiple places.
 */
const getLogFilePath = () => logFile;

module.exports = {
    debug: (...args) => {
        if (!isProduction) console.log(...args);
        // Debug logs still go to file in production so intermittent issues
        // are investigable after the fact — file rotation caps disk use.
        writeToFile('DEBUG', args);
    },
    info: (...args) => {
        console.log(...args);
        writeToFile('INFO', args);
    },
    // SECURITY: Only forward Error objects to Sentry — never string messages.
    // String logs can contain PII (firma adı, müşteri verisi); Error objects
    // are deterministic and can be filtered by beforeSend.
    warn: (...args) => {
        console.warn(...args);
        writeToFile('WARN', args);
        if (Sentry && isProduction) {
            const errArg = args.find((a) => a instanceof Error);
            if (errArg) {
                Sentry.captureException(errArg, { level: 'warning' });
            }
        }
    },
    error: (...args) => {
        console.error(...args);
        writeToFile('ERROR', args);
        if (Sentry && isProduction) {
            const errArg = args.find((a) => a instanceof Error);
            if (errArg) {
                Sentry.captureException(errArg);
            }
        }
    },
    getLogFilePath,
};
