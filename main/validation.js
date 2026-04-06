/**
 * IPC Input Validation Helpers
 * Validates user input before processing to prevent injection and invalid data
 */

/**
 * Validate client data for save/update operations
 */
function validateClientData(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Geçersiz müşteri verisi.');
    }

    const name = data.firm_name || data.name;
    const gib_username = data.gib_user_code || data.gib_username;
    const tax_id = data.tax_number || data.tax_id;

    // Required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Firma adı zorunludur.');
    }

    if (name.length > 255) {
        throw new Error('Firma adı çok uzun (max 255 karakter).');
    }

    // GIB credentials validation
    if (gib_username && typeof gib_username !== 'string') {
        throw new Error('Geçersiz GİB kullanıcı adı.');
    }

    if (gib_username && gib_username.length > 100) {
        throw new Error('GİB kullanıcı adı çok uzun.');
    }

    // Tax ID validation (Turkish format: 10 or 11 digits)
    if (tax_id) {
        const cleanTaxId = String(tax_id).replace(/\D/g, '');
        if (cleanTaxId.length !== 10 && cleanTaxId.length !== 11) {
            throw new Error('Vergi numarası 10 veya 11 haneli olmalıdır.');
        }
    }

    return true;
}

/**
 * Validate numeric ID
 */
function validateId(id, fieldName = 'ID') {
    if (id === undefined || id === null) {
        throw new Error(`${fieldName} zorunludur.`);
    }

    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) {
        throw new Error(`Geçersiz ${fieldName}.`);
    }

    return numId;
}

/**
 * Validate client status
 */
function validateStatus(status) {
    const validStatuses = ['active', 'inactive', 'pending'];
    if (!validStatuses.includes(status)) {
        throw new Error('Geçersiz durum değeri.');
    }
    return status;
}

/**
 * Validate scan settings
 */
function validateScanSettings(settings) {
    if (!settings || typeof settings !== 'object') {
        throw new Error('Geçersiz tarama ayarları.');
    }

    const { batchSize, delayBetweenClients, startPeriod, endPeriod } = settings;

    // Batch size validation
    if (batchSize !== undefined) {
        const num = Number(batchSize);
        if (!Number.isInteger(num) || num < 1 || num > 100) {
            throw new Error('Batch boyutu 1-100 arasında olmalıdır.');
        }
    }

    // Delay validation
    if (delayBetweenClients !== undefined) {
        const num = Number(delayBetweenClients);
        if (!Number.isInteger(num) || num < 0 || num > 60000) {
            throw new Error('Bekleme süresi 0-60000 ms arasında olmalıdır.');
        }
    }

    // Period validation (format: YYYY-MM)
    const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (startPeriod && !periodRegex.test(startPeriod)) {
        throw new Error('Başlangıç dönemi formatı geçersiz (YYYY-MM).');
    }

    if (endPeriod && !periodRegex.test(endPeriod)) {
        throw new Error('Bitiş dönemi formatı geçersiz (YYYY-MM).');
    }

    return true;
}

/**
 * Validate schedule configuration
 */
function validateScheduleConfig(config) {
    if (!config || typeof config !== 'object') {
        throw new Error('Geçersiz zamanlama ayarları.');
    }

    const { enabled, time, finishByTime, frequency, customDays } = config;

    if (typeof enabled !== 'boolean') {
        throw new Error('Zamanlama durumu geçersiz.');
    }

    // Time format validation (HH:MM)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (time && !timeRegex.test(time)) {
        throw new Error('Saat formatı geçersiz (HH:MM).');
    }

    if (finishByTime && !timeRegex.test(finishByTime)) {
        throw new Error('Bitiş saati formatı geçersiz (HH:MM).');
    }

    // Frequency validation
    const validFrequencies = ['daily', 'weekly', 'custom'];
    if (frequency && !validFrequencies.includes(frequency)) {
        throw new Error('Geçersiz sıklık değeri.');
    }

    // Custom days validation
    if (customDays) {
        if (!Array.isArray(customDays)) {
            throw new Error('Özel günler bir dizi olmalıdır.');
        }
        const validDays = [0, 1, 2, 3, 4, 5, 6];
        for (const day of customDays) {
            if (!validDays.includes(day)) {
                throw new Error('Geçersiz gün değeri (0-6).');
            }
        }
    }

    return true;
}

/**
 * Validate statement conversion input
 */
function validateStatementInput(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Geçersiz dönüştürme verisi.');
    }

    const { fileBuffer, mimeType, prompt } = data;

    // File buffer validation
    if (!fileBuffer) {
        throw new Error('Dosya içeriği zorunludur.');
    }

    // Max file size: 50MB
    const maxSize = 50 * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
        throw new Error('Dosya boyutu çok büyük (max 50MB).');
    }

    // MIME type validation
    const validMimeTypes = [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'text/plain',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
    ];
    if (mimeType && !validMimeTypes.includes(mimeType)) {
        throw new Error('Desteklenmeyen dosya formatı.');
    }

    // Prompt validation
    if (prompt && typeof prompt !== 'string') {
        throw new Error('Geçersiz prompt.');
    }

    if (prompt && prompt.length > 10000) {
        throw new Error('Prompt çok uzun (max 10000 karakter).');
    }

    return true;
}

module.exports = {
    validateClientData,
    validateId,
    validateStatus,
    validateScanSettings,
    validateScheduleConfig,
    validateStatementInput,
};
