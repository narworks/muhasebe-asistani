const { app } = require('electron');

let Sentry;
try {
    Sentry = require('@sentry/electron/main');
} catch {
    Sentry = null;
}

const isProduction = app.isPackaged;

module.exports = {
    debug: (...args) => {
        if (!isProduction) console.log(...args);
    },
    info: (...args) => console.log(...args),
    warn: (...args) => {
        console.warn(...args);
        if (Sentry && isProduction) {
            const errArg = args.find((a) => a instanceof Error);
            if (errArg) {
                Sentry.captureException(errArg, { level: 'warning' });
            }
        }
    },
    error: (...args) => {
        console.error(...args);
        if (Sentry && isProduction) {
            const errArg = args.find((a) => a instanceof Error);
            if (errArg) {
                Sentry.captureException(errArg);
            } else {
                const msg = args.map((a) => String(a)).join(' ');
                Sentry.captureMessage(msg, 'error');
            }
        }
    },
};
