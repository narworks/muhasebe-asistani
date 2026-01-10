const axios = require('axios');
const { app } = require('electron');
const settings = require('./settings');

const LICENSE_API_URL = process.env.LICENSE_API_URL || 'https://api.muhasebeasistani.com';
const BILLING_FALLBACK_URL = process.env.BILLING_URL || 'https://billing.muhasebeasistani.com';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

let state = null;
let checkIntervalId = null;

const defaultState = {
  token: null,
  subscriptionStatus: 'inactive',
  plan: null,
  credits: 0,
  expiresAt: null,
  lastCheckAt: null,
  billingUrl: null,
  pendingUsage: 0,
  email: null
};

const loadState = () => {
  const stored = settings.readSettings();
  const token = settings.getEncryptedValue('token');

  state = {
    ...defaultState,
    ...stored.license,
    token
  };
};

const persistState = () => {
  if (!state) return;
  const { token, ...license } = state;
  settings.updateSettings({ license });
  if (token) {
    try {
      settings.setEncryptedValue('token', token);
    } catch (error) {
      console.warn('Failed to store token securely:', error.message);
    }
  }
};

const setStateFromResponse = (data, options = {}) => {
  const { resetPending = false } = options;
  state.subscriptionStatus = data.subscriptionStatus || 'inactive';
  state.plan = data.plan || state.plan;
  if (typeof data.credits === 'number') {
    state.credits = data.credits;
  }
  state.expiresAt = data.expiresAt || state.expiresAt;
  state.billingUrl = data.billingUrl || state.billingUrl;
  state.lastCheckAt = new Date().toISOString();
  if (resetPending) {
    state.pendingUsage = 0;
  }
  persistState();
};

const ensureLoaded = () => {
  if (!state) {
    loadState();
  }
};

const login = async ({ email, password }) => {
  ensureLoaded();
  const deviceId = settings.getDeviceId();
  const appVersion = app.getVersion();

  try {
    const response = await axios.post(`${LICENSE_API_URL}/login`, {
      email,
      password,
      deviceId,
      appVersion
    });

    const data = response.data || {};
    state.token = data.token || null;
    state.email = email;
    setStateFromResponse(data);
    if (typeof data.credits === 'number' && state.pendingUsage > 0) {
      state.credits = Math.max(0, data.credits - state.pendingUsage);
      persistState();
    }

    return {
      success: true,
      subscriptionStatus: state.subscriptionStatus,
      plan: state.plan,
      credits: state.credits,
      billingUrl: state.billingUrl
    };
  } catch (error) {
    console.error('License login failed:', error.message);
    return { success: false, message: 'Giriş başarısız: ' + error.message };
  }
};

const checkLicense = async () => {
  ensureLoaded();
  if (!state.token) {
    return { success: false, message: 'Oturum bulunamadı.' };
  }

  try {
    const deviceId = settings.getDeviceId();
    const response = await axios.post(
      `${LICENSE_API_URL}/license/check`,
      { deviceId, pendingUsage: state.pendingUsage },
      { headers: { Authorization: `Bearer ${state.token}` } }
    );

    setStateFromResponse(response.data || {}, { resetPending: true });
    return { success: true, subscriptionStatus: state.subscriptionStatus, credits: state.credits };
  } catch (error) {
    console.warn('License check failed:', error.message);
    return { success: false, message: 'Lisans doğrulaması başarısız.' };
  }
};

const startScheduler = () => {
  if (checkIntervalId) return;
  checkIntervalId = setInterval(() => {
    if (state && state.token) {
      checkLicense();
    }
  }, CHECK_INTERVAL_MS);
};

const init = () => {
  ensureLoaded();
  startScheduler();
};

const hasActiveSubscription = () => {
  ensureLoaded();
  if (state.subscriptionStatus !== 'active') return false;
  if (state.expiresAt && Date.now() > new Date(state.expiresAt).getTime()) return false;
  if (!state.lastCheckAt) return false;
  const lastCheck = new Date(state.lastCheckAt).getTime();
  return Date.now() - lastCheck <= GRACE_PERIOD_MS;
};

const getGraceRemainingMs = () => {
  ensureLoaded();
  if (!state.lastCheckAt) return 0;
  const lastCheck = new Date(state.lastCheckAt).getTime();
  const remaining = GRACE_PERIOD_MS - (Date.now() - lastCheck);
  return Math.max(0, remaining);
};

const getCredits = () => {
  ensureLoaded();
  return state.credits || 0;
};

const consumeCredits = (amount) => {
  ensureLoaded();
  if (state.credits < amount) {
    throw new Error('Yetersiz kredi.');
  }
  state.credits -= amount;
  state.pendingUsage += amount;
  persistState();
};

const getBillingUrl = () => {
  ensureLoaded();
  return state.billingUrl || BILLING_FALLBACK_URL;
};

const getApiKey = () => settings.getEncryptedValue('apiKey');

const setApiKey = (apiKey) => {
  settings.setEncryptedValue('apiKey', apiKey);
};

const hasApiKey = () => Boolean(getApiKey());

module.exports = {
  init,
  login,
  checkLicense,
  hasActiveSubscription,
  getGraceRemainingMs,
  getCredits,
  consumeCredits,
  getBillingUrl,
  getApiKey,
  setApiKey,
  hasApiKey
};
