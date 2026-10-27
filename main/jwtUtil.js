/**
 * JWT yardımcıları (doğrulama YAPMAZ — yalnızca payload okur).
 *
 * Access token'ın süresinin dolup dolmadığını istemci tarafında tahmin
 * etmek için kullanılır; asıl doğrulama sunucuda (supabase.auth.getUser).
 */

/**
 * JWT payload'ındaki `exp` (saniye) değerini döndürür. Okunamazsa null.
 * @param {string} token
 * @returns {number|null}
 */
function getJwtExp(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    try {
        const json = Buffer.from(parts[1], 'base64url').toString('utf8');
        const payload = JSON.parse(json);
        return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
}

/**
 * Token'ın en az `minValidityMs` daha geçerli olup olmadığı.
 * `exp` okunamıyorsa false döner (yenileme denensin diye).
 * @param {string} token
 * @param {number} [minValidityMs=60000]
 * @param {number} [nowMs=Date.now()]
 * @returns {boolean}
 */
function isJwtFresh(token, minValidityMs = 60_000, nowMs = Date.now()) {
    const exp = getJwtExp(token);
    if (exp === null) return false;
    return exp * 1000 - nowMs > minValidityMs;
}

/**
 * Token süresi tamamen dolmuş mu (exp geçmişte). `exp` okunamıyorsa false.
 * @param {string} token
 * @param {number} [nowMs=Date.now()]
 * @returns {boolean}
 */
function isJwtExpired(token, nowMs = Date.now()) {
    const exp = getJwtExp(token);
    if (exp === null) return false;
    return exp * 1000 <= nowMs;
}

module.exports = { getJwtExp, isJwtFresh, isJwtExpired };
