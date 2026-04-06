const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SETTINGS_FILENAME = 'settings.json';

const defaultSettings = {
    deviceId: null,
    legalConsentAccepted: false,
    license: {
        subscriptionStatus: 'inactive',
        plan: null,
        expiresAt: null,
        lastCheckAt: null,
        billingUrl: null,
        email: null,
    },
    encrypted: {
        token: null,
    },
    scan: {
        delayMin: 15,
        delayMax: 45,
        batchSize: 20,
        batchPauseMin: 120,
        batchPauseMax: 300,
        maxCaptchaRetries: 3,
        lastScanAt: null,
    },
    schedule: {
        enabled: false,
        time: '08:00',
        lastScheduledScanAt: null,
        nextScheduledScanAt: null,
    },
    documentsFolder: null,
};

const getSettingsPath = () => {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, SETTINGS_FILENAME);
};

const readSettings = () => {
    const settingsPath = getSettingsPath();
    if (!fs.existsSync(settingsPath)) {
        return { ...defaultSettings };
    }

    try {
        const raw = fs.readFileSync(settingsPath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...defaultSettings,
            ...parsed,
            license: {
                ...defaultSettings.license,
                ...(parsed.license || {}),
            },
            encrypted: {
                ...defaultSettings.encrypted,
                ...(parsed.encrypted || {}),
            },
            scan: {
                ...defaultSettings.scan,
                ...(parsed.scan || {}),
            },
            schedule: {
                ...defaultSettings.schedule,
                ...(parsed.schedule || {}),
            },
        };
    } catch (error) {
        console.error('Failed to read settings:', error);
        return { ...defaultSettings };
    }
};

const writeSettings = (settings) => {
    const settingsPath = getSettingsPath();
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Failed to write settings:', error);
    }
};

const updateSettings = (patch) => {
    const current = readSettings();
    const updated = {
        ...current,
        ...patch,
        license: {
            ...current.license,
            ...(patch.license || {}),
        },
        encrypted: {
            ...current.encrypted,
            ...(patch.encrypted || {}),
        },
        scan: {
            ...current.scan,
            ...(patch.scan || {}),
        },
        schedule: {
            ...current.schedule,
            ...(patch.schedule || {}),
        },
    };
    writeSettings(updated);
    return updated;
};

const isEncryptionAvailable = () => {
    try {
        return safeStorage.isEncryptionAvailable();
    } catch {
        return false;
    }
};

// Fallback: simple obfuscation when safeStorage unavailable (Windows edge case)
const obfuscate = (str) => Buffer.from(str).toString('base64');
const deobfuscate = (str) => {
    try {
        return Buffer.from(str, 'base64').toString('utf-8');
    } catch {
        return null;
    }
};

const setEncryptedValue = (key, value) => {
    const settings = readSettings();
    if (isEncryptionAvailable()) {
        settings.encrypted[key] = safeStorage.encryptString(value).toString('base64');
        settings.encrypted[key + '_method'] = 'safe';
    } else {
        // Fallback for Windows when DPAPI unavailable
        settings.encrypted[key] = obfuscate(value);
        settings.encrypted[key + '_method'] = 'fallback';
    }
    writeSettings(settings);
};

const getEncryptedValue = (key) => {
    const settings = readSettings();
    const encrypted = settings.encrypted[key];
    if (!encrypted) return null;
    const method = settings.encrypted[key + '_method'];
    try {
        if (method === 'fallback') {
            return deobfuscate(encrypted);
        }
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (error) {
        // Try fallback decode if safe decryption fails
        const fallback = deobfuscate(encrypted);
        if (fallback) return fallback;
        console.error('Failed to decrypt value:', error);
        return null;
    }
};

const getDeviceId = () => {
    const settings = readSettings();
    if (settings.deviceId) return settings.deviceId;

    const deviceId = crypto.randomUUID();
    updateSettings({ deviceId });
    return deviceId;
};

module.exports = {
    readSettings,
    updateSettings,
    setEncryptedValue,
    getEncryptedValue,
    getDeviceId,
};
