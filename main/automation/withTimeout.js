/**
 * Wrap a promise with a timeout. Required for Gemini SDK calls because
 * GoogleGenerativeAI has no built-in per-request timeout — a stalled upstream
 * (network flake, API slowdown, regional outage) otherwise hangs indefinitely.
 *
 * On timeout the returned promise rejects with an Error that carries
 * `errorType: 'gemini_timeout'` so callers can distinguish it from rate-limit
 * or other API errors and apply a different retry strategy.
 */
function withTimeout(promise, ms, label = 'operation') {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error(`${label} timeout after ${ms}ms`);
            err.errorType = 'gemini_timeout';
            reject(err);
        }, ms);
        promise.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            (e) => {
                clearTimeout(timer);
                reject(e);
            }
        );
    });
}

module.exports = { withTimeout };
