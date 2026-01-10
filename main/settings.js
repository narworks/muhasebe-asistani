const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SETTINGS_FILENAME = 'settings.json';

const defaultSettings = {
  deviceId: null,
  license: {
    subscriptionStatus: 'inactive',
    plan: null,
    credits: 0,
    expiresAt: null,
    lastCheckAt: null,
    billingUrl: null,
    pendingUsage: 0,
    email: null
  },
  encrypted: {
    token: null,
    apiKey: null
  }
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
        ...(parsed.license || {})
      },
      encrypted: {
        ...defaultSettings.encrypted,
        ...(parsed.encrypted || {})
      }
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
      ...(patch.license || {})
    },
    encrypted: {
      ...current.encrypted,
      ...(patch.encrypted || {})
    }
  };
  writeSettings(updated);
  return updated;
};

const ensureEncryptionAvailable = () => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Şifreleme sistemi bu cihazda kullanılamıyor.');
  }
};

const setEncryptedValue = (key, value) => {
  ensureEncryptionAvailable();
  const settings = readSettings();
  settings.encrypted[key] = safeStorage.encryptString(value).toString('base64');
  writeSettings(settings);
};

const getEncryptedValue = (key) => {
  const settings = readSettings();
  const encrypted = settings.encrypted[key];
  if (!encrypted) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch (error) {
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
  getDeviceId
};
