'use strict';

/**
 * electron-updater 'error' event'i için geçici (recoverable) hata sınıflandırıcısı.
 * Geçici hatalar (ağ kopması, GitHub 5xx/429, SSL/DNS) kullanıcıya gösterilmez —
 * bir sonraki kontrolde kendiliğinden düzelir. Kalıcı hatalar (imza/checksum, 4xx)
 * gösterilir. Saf fonksiyon (electron bağımlılığı yok) → vitest ile test edilebilir.
 *
 * @param {{ message?: string, statusCode?: number, name?: string, response?: { statusCode?: number } }} err
 * @returns {boolean}
 */
function isTransientUpdateError(err) {
    if (!err) return false;
    const msg = typeof err.message === 'string' ? err.message : '';
    const statusCode =
        typeof err.statusCode === 'number'
            ? err.statusCode
            : err.response && typeof err.response.statusCode === 'number'
              ? err.response.statusCode
              : null;

    // HTTP durum kodu — en güvenilir sinyal (electron-updater HttpError.statusCode)
    if (statusCode !== null && (statusCode >= 500 || statusCode === 429)) {
        return true;
    }
    if (err.name === 'HttpError') return true;

    return (
        msg.includes('HttpError') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('EAI_AGAIN') ||
        msg.includes('ERR_SSL_PROTOCOL_ERROR') ||
        msg.includes('ERR_CERT_') ||
        msg.includes('ERR_NETWORK_CHANGED') ||
        msg.includes('ERR_INTERNET_DISCONNECTED') ||
        // 5xx / 429 mesajın herhangi yerinde — electron-updater "504 \"method: ...\""
        // formatı başta da olabilir; \b sınırı base64/sha512 gibi kelime-içi sayıları eler.
        /\b5\d{2}\b/.test(msg) ||
        /\b429\b/.test(msg)
    );
}

module.exports = { isTransientUpdateError };
