/**
 * Diagnostic bundle generator.
 * Exports anonymized scan diagnostic info as JSON for user to share with developer.
 *
 * PII-safe: no firm names, no credentials, no file paths.
 * Includes: app version, OS info, per-client timing breakdown with hashed IDs,
 *           error classifications, scan config.
 */

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const { app, dialog } = require('electron');
const logger = require('./logger');
const database = require('./database');

function hashClientId(clientId) {
    return crypto
        .createHash('sha256')
        .update(String(clientId) + 'diag-bundle-salt')
        .digest('hex')
        .substring(0, 8);
}

/**
 * Anonymize per-client timings — replace numeric client_id with hash,
 * strip any unexpected fields.
 */
function anonymizeTimings(timings) {
    if (!Array.isArray(timings)) return [];
    return timings.map((t) => ({
        client_hash: hashClientId(t.clientId),
        total_ms: t.totalMs || 0,
        success: Boolean(t.success),
        error_type: t.errorType || null,
        phases: t.phases || {},
        measurements: t.measurements || {},
    }));
}

/**
 * Build diagnostic bundle for a specific scan.
 * Returns JSON-serializable object.
 */
function buildBundle(scanHistoryId) {
    const scan = database.getScanHistoryById(scanHistoryId);
    if (!scan) {
        throw new Error(`Scan not found: ${scanHistoryId}`);
    }

    let parsed = null;
    if (scan.results_json) {
        try {
            parsed = JSON.parse(scan.results_json);
        } catch {
            /* corrupt or old format */
        }
    }

    return {
        bundle_version: 1,
        generated_at: new Date().toISOString(),
        app: {
            version: app.getVersion(),
            electron_version: process.versions.electron,
            node_version: process.versions.node,
            chrome_version: process.versions.chrome,
        },
        system: {
            platform: os.platform(),
            arch: os.arch(),
            release: os.release(),
            total_memory_mb: Math.round(os.totalmem() / 1024 / 1024),
            free_memory_mb: Math.round(os.freemem() / 1024 / 1024),
            cpu_count: os.cpus().length,
        },
        scan: {
            id: scan.id,
            type: scan.scan_type,
            started_at: scan.started_at,
            finished_at: scan.finished_at,
            duration_seconds: scan.duration_seconds,
            client_count: scan.client_count,
            success_count: scan.success_count,
            error_count: scan.error_count,
        },
        timings: parsed ? anonymizeTimings(parsed.timings) : [],
        aggregated: parsed?.aggregated || {},
        rate_limit_wait_ms: parsed?.rateLimitWaitMs || 0,
    };
}

/**
 * Save bundle to user-chosen file via OS dialog.
 * Returns { saved: true, path } or { saved: false, reason }.
 */
async function exportBundle(scanHistoryId) {
    try {
        const bundle = buildBundle(scanHistoryId);
        const defaultName = `muhasebe-asistani-tani-${scanHistoryId}-${Date.now()}.json`;

        const result = await dialog.showSaveDialog({
            title: 'Tanı Paketini Kaydet',
            defaultPath: defaultName,
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });

        if (result.canceled || !result.filePath) {
            return { saved: false, reason: 'cancelled' };
        }

        fs.writeFileSync(result.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
        logger.debug(`[DiagBundle] Exported to ${result.filePath}`);
        return { saved: true, path: result.filePath };
    } catch (err) {
        logger.debug(`[DiagBundle] Export error: ${err.message}`);
        return { saved: false, reason: err.message };
    }
}

module.exports = { buildBundle, exportBundle, hashClientId };
