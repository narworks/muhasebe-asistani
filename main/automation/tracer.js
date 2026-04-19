/**
 * Per-client scan tracer — collects phase timings and counters.
 * PII-safe by design: only integer client_id, no firm names, no strings with user data.
 *
 * Usage:
 *   const trace = tracer.startClientTrace(clientId);
 *   await trace.span('login.http', async () => { ... });
 *   trace.measurement('docs.found', 42);
 *   const result = trace.finish({ success: true });
 *   // result = { clientId, totalMs, phases: {...}, measurements: {...} }
 */

const { performance } = require('perf_hooks');
let Sentry;
try {
    Sentry = require('@sentry/electron/main');
} catch {
    Sentry = null;
}

// Allowlisted span names — no dynamic strings (PII safety)
const ALLOWED_SPANS = new Set([
    'login.http',
    'login.puppeteer',
    'login.captcha_fetch',
    'login.captcha_solve',
    'login.post',
    'api.list_non_archived',
    'api.list_archived',
    'api.list_incremental',
    'fs.dedup_scan',
    'download.batch',
    'download.single',
    'db.save_tebligatlar',
    'gemini.captcha_fallback',
    'tesseract.captcha_solve',
]);

const ALLOWED_MEASUREMENTS = new Set([
    'docs.found',
    'docs.downloaded',
    'docs.skipped_existing',
    'docs.skipped_filter',
    'download.bytes',
    'captcha.attempts',
    'captcha.tesseract_hit',
    'captcha.gemini_fallback',
    'puppeteer.fallback_used',
    'api.page_count',
    'retry.count',
]);

class ClientTrace {
    constructor(clientId) {
        this.clientId = clientId;
        this.startedAt = performance.now();
        this.phases = {};
        this.measurements = {};
        this.sentryTransaction = null;

        if (Sentry) {
            try {
                this.sentryTransaction = Sentry.startInactiveSpan({
                    name: 'gib.scan.client',
                    op: 'scan.client',
                    attributes: { client_id_hash: this._hashClientId(clientId) },
                });
            } catch {
                /* Sentry unavailable, continue without it */
            }
        }
    }

    _hashClientId(id) {
        // Simple reversible-in-log hash (not cryptographic, just for dashboards)
        return String(id)
            .split('')
            .reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 7);
    }

    async span(name, fn) {
        if (!ALLOWED_SPANS.has(name)) {
            // Defense in depth: refuse non-allowlisted names
            return await fn();
        }
        const t0 = performance.now();
        let sentrySpan = null;
        if (Sentry && this.sentryTransaction) {
            try {
                sentrySpan = Sentry.startInactiveSpan({ name, op: name });
            } catch {
                /* ignore */
            }
        }
        try {
            return await fn();
        } finally {
            const dt = performance.now() - t0;
            this.phases[name] = (this.phases[name] || 0) + dt;
            if (sentrySpan) {
                try {
                    sentrySpan.end();
                } catch {
                    /* ignore */
                }
            }
        }
    }

    measurement(key, value) {
        if (!ALLOWED_MEASUREMENTS.has(key)) return;
        const numValue = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
        if (Number.isNaN(numValue)) return;
        this.measurements[key] = (this.measurements[key] || 0) + numValue;
    }

    finish({ success = true, errorType = null } = {}) {
        const totalMs = Math.round(performance.now() - this.startedAt);
        const result = {
            clientId: this.clientId,
            totalMs,
            success,
            errorType,
            phases: { ...this.phases },
            measurements: { ...this.measurements },
        };

        if (this.sentryTransaction) {
            try {
                this.sentryTransaction.setStatus(
                    success ? { code: 1 /* OK */ } : { code: 2 /* ERROR */ }
                );
                if (errorType) this.sentryTransaction.setAttribute('error_type', errorType);
                this.sentryTransaction.end();
            } catch {
                /* ignore */
            }
        }

        return result;
    }
}

function startClientTrace(clientId) {
    return new ClientTrace(clientId);
}

/**
 * Aggregate per-client traces into a scan-level summary for telemetry.
 * All PII-safe — only numbers, booleans, error type names.
 */
function aggregateTraces(traces) {
    const summary = {
        client_count: traces.length,
        success_count: 0,
        error_count: 0,
        login_http_ms: 0,
        login_puppeteer_ms: 0,
        captcha_tesseract_ms: 0,
        captcha_gemini_ms: 0,
        api_list_ms: 0,
        download_ms: 0,
        captcha_tesseract_hit: 0,
        captcha_gemini_fallback: 0,
        puppeteer_fallback_count: 0,
        docs_found: 0,
        docs_downloaded: 0,
        docs_skipped_existing: 0,
        docs_skipped_filter: 0,
        error_types: {},
    };

    for (const t of traces) {
        if (t.success) summary.success_count++;
        else {
            summary.error_count++;
            if (t.errorType) {
                summary.error_types[t.errorType] = (summary.error_types[t.errorType] || 0) + 1;
            }
        }

        summary.login_http_ms += t.phases['login.http'] || 0;
        summary.login_puppeteer_ms += t.phases['login.puppeteer'] || 0;
        summary.captcha_tesseract_ms += t.phases['tesseract.captcha_solve'] || 0;
        summary.captcha_gemini_ms += t.phases['gemini.captcha_fallback'] || 0;
        summary.api_list_ms +=
            (t.phases['api.list_non_archived'] || 0) +
            (t.phases['api.list_archived'] || 0) +
            (t.phases['api.list_incremental'] || 0);
        summary.download_ms += t.phases['download.batch'] || 0;

        summary.captcha_tesseract_hit += t.measurements['captcha.tesseract_hit'] || 0;
        summary.captcha_gemini_fallback += t.measurements['captcha.gemini_fallback'] || 0;
        summary.puppeteer_fallback_count += t.measurements['puppeteer.fallback_used'] || 0;
        summary.docs_found += t.measurements['docs.found'] || 0;
        summary.docs_downloaded += t.measurements['docs.downloaded'] || 0;
        summary.docs_skipped_existing += t.measurements['docs.skipped_existing'] || 0;
        summary.docs_skipped_filter += t.measurements['docs.skipped_filter'] || 0;
    }

    // Round all durations to integer ms
    for (const key of Object.keys(summary)) {
        if (key.endsWith('_ms')) summary[key] = Math.round(summary[key]);
    }

    return summary;
}

module.exports = { startClientTrace, aggregateTraces };
