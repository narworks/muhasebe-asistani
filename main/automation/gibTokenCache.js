/**
 * GİB Bearer Token disk cache — CAPTCHA çağrı sayısını minimize eder.
 *
 * Mevcut akış (cache yok): her tarama → CAPTCHA çöz → login → token al → atılır.
 * Yeni akış (cache var):  ilk tarama → CAPTCHA çöz → login → token cache'lendi
 *                         sonraki tarama → cache'den token kullan, CAPTCHA atla
 *                         token expire → yeni CAPTCHA + login + cache update
 *
 * Tipik etki: 1 mükellef × günde 6 tarama × 4-saatlik token expire =
 *             günde 6 CAPTCHA → günde 1-2 CAPTCHA (~%70 azalma)
 *
 * Disk persistence: `userData/gib-tokens.enc` (Electron safeStorage encrypted).
 * Her mükellef için ayrı slot (gib_user_code → { token, expiresAt }).
 *
 * NOT: 401 detection caller'ın sorumluluğu — apiClient 401 alırsa
 * `invalidateToken(gibUserCode)` çağırıp retry edilmeli.
 */

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const logger = require('../logger');

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 dk early refresh — exp tam yaklaşmadan yenile
// GİB token JWT değil (128 char hex, exp claim yok) → fallback şart.
// 4 saat — daemon eligibility'i 2 saat olduğu için cache HIT yapar.
// Eğer token gerçekten <4h valid ise 401 recovery interceptor invalidate eder.
const FALLBACK_EXPIRY_MS = 4 * 60 * 60 * 1000;

let cachePath = null;
const memCache = new Map(); // gibUserCode → { token, expiresAt }
let loaded = false;

const stats = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    decode_fails: 0,
    persist_fails: 0,
};

function getCachePath() {
    if (cachePath) return cachePath;
    try {
        cachePath = path.join(app.getPath('userData'), 'gib-tokens.enc');
    } catch {
        cachePath = null;
    }
    return cachePath;
}

function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
        const p = getCachePath();
        if (!p || !fs.existsSync(p)) return;
        if (!safeStorage.isEncryptionAvailable()) {
            logger.debug('[TokenCache] safeStorage unavailable, skipping disk load');
            return;
        }
        const encrypted = fs.readFileSync(p);
        const json = safeStorage.decryptString(encrypted);
        const data = JSON.parse(json);
        for (const [k, v] of Object.entries(data)) {
            if (v && typeof v.token === 'string' && typeof v.expiresAt === 'number') {
                memCache.set(k, v);
            }
        }
        logger.debug(`[TokenCache] Loaded ${memCache.size} tokens from disk`);
    } catch (err) {
        logger.debug(`[TokenCache] Load fail: ${err.message}`);
    }
}

function persistCache() {
    try {
        const p = getCachePath();
        if (!p || !safeStorage.isEncryptionAvailable()) return;
        const obj = {};
        for (const [k, v] of memCache) obj[k] = v;
        const encrypted = safeStorage.encryptString(JSON.stringify(obj));
        fs.writeFileSync(p, encrypted);
    } catch (err) {
        stats.persist_fails++;
        logger.debug(`[TokenCache] Persist fail: ${err.message}`);
    }
}

/**
 * JWT payload'dan exp claim'i milisaniye cinsinden çıkar.
 * Decode fail ederse FALLBACK_EXPIRY_MS sonrasını varsay (konservatif).
 */
/**
 * GİB token = 128 char hex (random session token, JWT değil).
 * Expire süresi sunucu tarafında — bilinmiyor. Fallback kullan, 401 recovery
 * interceptor (gibScraper) gerçek expire'da invalidate eder.
 *
 * NOT: İleride farklı bir GİB endpoint JWT döndürürse decode fallback'i için
 * try block korundu (defensive).
 */
function decodeJWTExpiry(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Not a JWT');
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        if (typeof payload.exp !== 'number') throw new Error('No exp claim');
        return payload.exp * 1000;
    } catch {
        stats.decode_fails++;
        return Date.now() + FALLBACK_EXPIRY_MS;
    }
}

/**
 * Cache'den valid token al — yoksa veya yakında expire ediyorsa null.
 * Caller null alınca httpLogin ile yeni token alır + setToken çağırır.
 */
function getValidToken(gibUserCode) {
    if (!gibUserCode) return null;
    ensureLoaded();
    const cached = memCache.get(gibUserCode);
    if (!cached) {
        stats.misses++;
        return null;
    }
    if (Date.now() + REFRESH_BUFFER_MS >= cached.expiresAt) {
        stats.misses++;
        return null;
    }
    stats.hits++;
    return cached.token;
}

function setToken(gibUserCode, token) {
    if (!gibUserCode || !token) return;
    ensureLoaded();
    const expiresAt = decodeJWTExpiry(token);
    memCache.set(gibUserCode, { token, expiresAt });
    persistCache();
    const remainingMin = Math.round((expiresAt - Date.now()) / 60000);
    logger.debug(
        `[TokenCache] Saved token for ${gibUserCode.slice(0, 4)}*** (expires in ${remainingMin}min)`
    );
}

function invalidateToken(gibUserCode) {
    if (!gibUserCode) return;
    ensureLoaded();
    if (memCache.delete(gibUserCode)) {
        stats.invalidations++;
        persistCache();
        logger.debug(`[TokenCache] Invalidated ${gibUserCode.slice(0, 4)}***`);
    }
}

function getStats() {
    return { ...stats };
}

function resetStats() {
    Object.keys(stats).forEach((k) => (stats[k] = 0));
}

function clearAll() {
    memCache.clear();
    persistCache();
}

module.exports = {
    getValidToken,
    setToken,
    invalidateToken,
    getStats,
    resetStats,
    clearAll,
};
