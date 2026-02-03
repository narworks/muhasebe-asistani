/**
 * License Manager - Supabase Edition
 * Kullanıcı authentication ve subscription yönetimi
 */

const { app } = require('electron');
const settings = require('./settings');
const supabase = require('./supabase');

const BILLING_URL = process.env.BILLING_URL || 'https://muhasebeasistani.com/pricing';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 saat
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

let state = null;
let checkIntervalId = null;

const defaultState = {
    userId: null,
    accessToken: null,
    refreshToken: null,
    email: null,
    subscriptionStatus: 'inactive',
    plan: null,
    expiresAt: null,
    lastCheckAt: null
};

/**
 * State'i settings'den yükler
 */
const loadState = () => {
    const stored = settings.readSettings();
    const accessToken = settings.getEncryptedValue('accessToken');
    const refreshToken = settings.getEncryptedValue('refreshToken');

    state = {
        ...defaultState,
        ...stored.license,
        accessToken,
        refreshToken
    };
};

/**
 * State'i settings'e kaydeder
 */
const persistState = () => {
    if (!state) return;

    const { accessToken, refreshToken, ...license } = state;
    settings.updateSettings({ license });

    // Token'ları güvenli şekilde sakla
    if (accessToken) {
        try {
            settings.setEncryptedValue('accessToken', accessToken);
        } catch (error) {
            console.warn('Failed to store access token:', error.message);
        }
    }

    if (refreshToken) {
        try {
            settings.setEncryptedValue('refreshToken', refreshToken);
        } catch (error) {
            console.warn('Failed to store refresh token:', error.message);
        }
    }
};

/**
 * Supabase subscription verisinden state'i günceller
 */
const setStateFromSubscription = (subscription) => {
    if (!subscription) return;

    state.subscriptionStatus = subscription.status || 'inactive';
    state.plan = subscription.plan || 'pro';
    state.expiresAt = subscription.expires_at || null;
    state.lastCheckAt = new Date().toISOString();

    persistState();
};

/**
 * State'in yüklendiğinden emin olur
 */
const ensureLoaded = () => {
    if (!state) {
        loadState();
    }
};

/**
 * Supabase ile email/password login
 */
const login = async ({ email, password }) => {
    ensureLoaded();

    try {
        const deviceId = settings.getDeviceId();
        const appVersion = app.getVersion();

        // Supabase auth
        const { user, session, error } = await supabase.signInWithEmail(email, password);

        if (error) {
            console.error('Supabase login failed:', error.message);
            return {
                success: false,
                message: error.message === 'Invalid login credentials'
                    ? 'E-posta veya şifre hatalı.'
                    : 'Giriş başarısız: ' + error.message
            };
        }

        if (!user || !session) {
            return { success: false, message: 'Giriş başarısız.' };
        }

        // State'i güncelle
        state.userId = user.id;
        state.email = user.email;
        state.accessToken = session.access_token;
        state.refreshToken = session.refresh_token;

        // Subscription bilgisini çek
        const { subscription, error: subError } = await supabase.getSubscription(user.id);

        if (subError) {
            console.warn('Failed to fetch subscription:', subError.message);
        } else {
            setStateFromSubscription(subscription);

            // Device info güncelle
            await supabase.updateDeviceInfo(user.id, deviceId, appVersion);
        }

        persistState();

        return {
            success: true,
            subscriptionStatus: state.subscriptionStatus,
            plan: state.plan,
            expiresAt: state.expiresAt
        };
    } catch (error) {
        console.error('Login error:', error.message);
        return { success: false, message: 'Giriş sırasında hata oluştu: ' + error.message };
    }
};

/**
 * Subscription durumunu Supabase'den kontrol eder
 */
const checkLicense = async () => {
    ensureLoaded();

    if (!state.userId || !state.accessToken) {
        return { success: false, message: 'Oturum bulunamadı.' };
    }

    try {
        // Token geçerliliğini kontrol et
        const { user, error: userError } = await supabase.getUserFromToken(state.accessToken);

        if (userError || !user) {
            console.warn('Token geçersiz:', userError?.message);
            // Token refresh denemesi yapılabilir burada
            return { success: false, message: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.' };
        }

        // Subscription bilgisini güncelle
        const { subscription, error: subError } = await supabase.getSubscription(user.id);

        if (subError) {
            console.error('Subscription check failed:', subError.message);
            return { success: false, message: 'Abonelik doğrulaması başarısız.' };
        }

        setStateFromSubscription(subscription);

        return {
            success: true,
            subscriptionStatus: state.subscriptionStatus
        };
    } catch (error) {
        console.error('License check error:', error.message);
        return { success: false, message: 'Lisans doğrulaması sırasında hata oluştu.' };
    }
};

/**
 * Periyodik subscription kontrolünü başlatır
 */
const startScheduler = () => {
    if (checkIntervalId) return;

    checkIntervalId = setInterval(() => {
        if (state && state.userId && state.accessToken) {
            checkLicense();
        }
    }, CHECK_INTERVAL_MS);
};

/**
 * License manager'ı başlatır
 */
const init = () => {
    ensureLoaded();
    startScheduler();
};

/**
 * Aboneliğin aktif olup olmadığını kontrol eder
 */
const hasActiveSubscription = () => {
    ensureLoaded();

    // Status kontrolü
    if (state.subscriptionStatus !== 'active') {
        return false;
    }

    // Expiry kontrolü
    if (state.expiresAt) {
        const expiryDate = new Date(state.expiresAt).getTime();
        if (Date.now() > expiryDate) {
            return false;
        }
    }

    // Grace period kontrolü (internet yoksa 7 gün izin ver)
    if (!state.lastCheckAt) {
        return false;
    }

    const lastCheck = new Date(state.lastCheckAt).getTime();
    const gracePeriodRemaining = GRACE_PERIOD_MS - (Date.now() - lastCheck);

    return gracePeriodRemaining > 0;
};

/**
 * Grace period kalan süresini döndürür (ms)
 */
const getGraceRemainingMs = () => {
    ensureLoaded();

    if (!state.lastCheckAt) return 0;

    const lastCheck = new Date(state.lastCheckAt).getTime();
    const remaining = GRACE_PERIOD_MS - (Date.now() - lastCheck);

    return Math.max(0, remaining);
};

/**
 * Subscription durumunu döndürür
 */
const getSubscriptionStatus = () => {
    ensureLoaded();

    return {
        isActive: hasActiveSubscription(),
        plan: state.plan || null,
        expiresAt: state.expiresAt || null,
        status: state.subscriptionStatus || 'inactive'
    };
};

/**
 * Billing portal URL'ini döndürür
 */
const getBillingUrl = () => {
    return BILLING_URL;
};

/**
 * Kullanıcı bilgilerini döndürür
 */
const getUserInfo = () => {
    ensureLoaded();

    return {
        userId: state.userId,
        email: state.email
    };
};

/**
 * Çıkış yapar (state'i temizler)
 */
const logout = async () => {
    ensureLoaded();

    try {
        // Supabase'den çıkış yap
        await supabase.signOut();
    } catch (error) {
        console.warn('Supabase sign out error:', error.message);
    }

    // State'i sıfırla
    state = { ...defaultState };
    persistState();

    // Encrypted değerleri temizle
    try {
        settings.setEncryptedValue('accessToken', '');
        settings.setEncryptedValue('refreshToken', '');
    } catch (error) {
        console.warn('Failed to clear tokens:', error.message);
    }

    return { success: true };
};

module.exports = {
    init,
    login,
    checkLicense,
    logout,
    hasActiveSubscription,
    getGraceRemainingMs,
    getSubscriptionStatus,
    getBillingUrl,
    getUserInfo
};
