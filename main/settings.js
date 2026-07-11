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
    // Onboarding first-run tracking (v1.9.14+) — kullanıcının ilk defa gördüğü
    // adımları işaretler. WelcomeModal + DiscoveryPrompt bu değerlere göre
    // gösterilir. Sidebar'daki "?" ikonu bu grubu sıfırlar (reset for demo).
    onboarding: {
        seenWelcomeAt: null,
        firstClientAddedAt: null,
        firstDiscoveryAt: null,
        completedAt: null,
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
            onboarding: {
                ...defaultSettings.onboarding,
                ...(parsed.onboarding || {}),
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
        onboarding: {
            ...current.onboarding,
            ...(patch.onboarding || {}),
        },
    };
    writeSettings(updated);
    return updated;
};

/**
 * Onboarding adım işaretleme helper'ı.
 * Renderer IPC üzerinden çağırır — main/main.js 'mark-onboarding-step' handler'ı.
 *
 * Adımlar: 'seenWelcome' | 'firstClientAdded' | 'firstDiscovery' | 'completed'
 * 'reset' özel değeri tüm onboarding state'ini sıfırlar (Sidebar '?' ikonu için).
 */
const markOnboardingStep = (stepName) => {
    const now = new Date().toISOString();
    if (stepName === 'reset') {
        return updateSettings({
            onboarding: {
                seenWelcomeAt: null,
                firstClientAddedAt: null,
                firstDiscoveryAt: null,
                completedAt: null,
            },
        });
    }
    const keyMap = {
        seenWelcome: 'seenWelcomeAt',
        firstClientAdded: 'firstClientAddedAt',
        firstDiscovery: 'firstDiscoveryAt',
        completed: 'completedAt',
    };
    const key = keyMap[stepName];
    if (!key) {
        throw new Error(`Unknown onboarding step: ${stepName}`);
    }
    return updateSettings({ onboarding: { [key]: now } });
};

const getOnboardingState = () => {
    return readSettings().onboarding;
};

const isEncryptionAvailable = () => {
    try {
        return safeStorage.isEncryptionAvailable();
    } catch {
        return false;
    }
};

// Fallback encoding when safeStorage is unavailable. This is NOT encryption
// — base64 is reversible — it's obfuscation to avoid casual eyeballing of
// settings.json. Any attacker with file read access decodes it trivially.
// Used only for low-sensitivity values (session tokens) and flagged via
// _method so callers can detect + warn.
const obfuscate = (str) => Buffer.from(str).toString('base64');
const deobfuscate = (str) => {
    try {
        return Buffer.from(str, 'base64').toString('utf-8');
    } catch {
        return null;
    }
};

// Keys classified as "high-sensitivity" — we refuse to fall back to base64
// obfuscation for these. GIB passwords, if stored, would let an attacker log
// into the tax portal; they must not land in a plaintext-equivalent state.
// When safeStorage isn't available, setEncryptedValue throws for these keys
// and the caller surfaces the error to the user.
const HIGH_SENSITIVITY_KEYS = new Set(['gib_password']);

class InsecureStorageError extends Error {
    constructor(key) {
        super(
            `Secure storage unavailable (safeStorage.isEncryptionAvailable()=false). ` +
                `Refusing to save sensitive value for key="${key}". ` +
                `On Linux install libsecret; on Windows check DPAPI availability.`
        );
        this.name = 'InsecureStorageError';
        this.code = 'INSECURE_STORAGE';
    }
}

const setEncryptedValue = (key, value) => {
    const settings = readSettings();
    if (isEncryptionAvailable()) {
        settings.encrypted[key] = safeStorage.encryptString(value).toString('base64');
        settings.encrypted[key + '_method'] = 'safe';
        writeSettings(settings);
        return;
    }
    // Fallback path — refused for high-sensitivity keys.
    if (HIGH_SENSITIVITY_KEYS.has(key)) {
        throw new InsecureStorageError(key);
    }
    // Low-sensitivity tokens can fall back to obfuscation; logger.warn so
    // support can spot systems in this degraded state in log files.
    try {
        require('./logger').warn(
            `[settings] safeStorage unavailable — using obfuscation fallback for key="${key}"`
        );
    } catch {
        /* logger might not be loadable in very early startup */
    }
    settings.encrypted[key] = obfuscate(value);
    settings.encrypted[key + '_method'] = 'fallback';
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
    // Exposed so callers (renderer via IPC, diagnostic bundles) can check
    // storage security state before trusting saved passwords.
    isEncryptionAvailable,
    InsecureStorageError,
    // Onboarding helpers (v1.9.14+)
    markOnboardingStep,
    getOnboardingState,
};
