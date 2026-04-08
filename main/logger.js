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
    // SECURITY: Only forward Error objects to Sentry — never string messages.
    // String logs can contain PII (firma adı, müşteri verisi); Error objects
    // are deterministic and can be filtered by beforeSend.
    warn: (...args) => {
        console.warn(...args);
        if (Sentry && isProduction) {
            const errArg = args.find((a) => a instanceof Error);
            if (errArg) {
                Sentry.captureException(errArg, { level: 'warning' });
            }
            // String messages intentionally NOT sent to Sentry
        }
    },
    error: (...args) => {
        console.error(...args);
        if (Sentry && isProduction) {
            const errArg = args.find((a) => a instanceof Error);
            if (errArg) {
                Sentry.captureException(errArg);
            }
            // String messages intentionally NOT sent to Sentry (PII risk)
        }
    },
};
