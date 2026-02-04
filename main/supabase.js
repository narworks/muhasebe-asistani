/**
 * Supabase Client Module
 * Electron main process'de kullanılmak üzere Supabase client'ı sağlar
 */

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

/**
 * Supabase client'ı başlatır
 * @throws {Error} SUPABASE_URL veya SUPABASE_ANON_KEY eksikse
 */
const init = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            'SUPABASE_URL ve SUPABASE_ANON_KEY environment variable\'ları .env dosyasında tanımlanmalıdır.'
        );
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: false, // Electron'da session'ı kendimiz yönetiyoruz
            detectSessionInUrl: false
        }
    });

    console.log('✅ Supabase client initialized');
};

/**
 * Supabase client instance'ı döndürür
 * @returns {Object} Supabase client
 * @throws {Error} Client henüz başlatılmadıysa
 */
const getClient = () => {
    if (!supabase) {
        throw new Error('Supabase client henüz başlatılmadı. Önce init() çağırın.');
    }
    return supabase;
};

/**
 * Email/password ile kullanıcı girişi yapar
 * @param {string} email - Kullanıcı email
 * @param {string} password - Kullanıcı şifresi
 * @returns {Promise<{user, session, error}>}
 */
const signInWithEmail = async (email, password) => {
    const client = getClient();
    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        console.error('Supabase sign in error:', error.message);
        return { user: null, session: null, error };
    }

    return { user: data.user, session: data.session, error: null };
};

/**
 * Email/password ile yeni kullanıcı kaydı yapar
 * @param {string} email - Kullanıcı email
 * @param {string} password - Kullanıcı şifresi
 * @returns {Promise<{user, session, error}>}
 */
const signUpWithEmail = async (email, password) => {
    const client = getClient();
    const { data, error } = await client.auth.signUp({
        email,
        password
    });

    if (error) {
        console.error('Supabase sign up error:', error.message);
        return { user: null, session: null, error };
    }

    return { user: data.user, session: data.session, error: null };
};

/**
 * Mevcut session'dan kullanıcı bilgisini getirir
 * @param {string} accessToken - JWT access token
 * @returns {Promise<{user, error}>}
 */
const getUserFromToken = async (accessToken) => {
    const client = getClient();
    const { data, error } = await client.auth.getUser(accessToken);

    if (error) {
        console.error('Supabase get user error:', error.message);
        return { user: null, error };
    }

    return { user: data.user, error: null };
};

/**
 * Kullanıcı abonelik durumunu getirir
 * @param {string} userId - Kullanıcı UUID
 * @returns {Promise<{subscription, error}>}
 */
const getSubscription = async (userId) => {
    const client = getClient();

    const { data, error } = await client
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Supabase get subscription error:', error.message);
        return { subscription: null, error };
    }

    // Eğer kayıt yoksa, yeni bir inactive subscription oluştur
    if (!data) {
        const { data: newSub, error: insertError } = await client
            .from('subscriptions')
            .insert({
                user_id: userId,
                status: 'inactive',
                plan: 'pro'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Failed to create subscription:', insertError.message);
            return { subscription: null, error: insertError };
        }

        return { subscription: newSub, error: null };
    }

    return { subscription: data, error: null };
};

/**
 * Abonelik durumunu günceller
 * @param {string} userId - Kullanıcı UUID
 * @param {Object} updates - Güncellenecek alanlar
 * @returns {Promise<{subscription, error}>}
 */
const updateSubscription = async (userId, updates) => {
    const client = getClient();

    const { data, error } = await client
        .from('subscriptions')
        .update({
            ...updates,
            last_check_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

    if (error) {
        console.error('Supabase update subscription error:', error.message);
        return { subscription: null, error };
    }

    return { subscription: data, error: null };
};

/**
 * Device ID ve app version'ı günceller
 * @param {string} userId - Kullanıcı UUID
 * @param {string} deviceId - Cihaz ID
 * @param {string} appVersion - Uygulama versiyonu
 * @returns {Promise<{success, error}>}
 */
const updateDeviceInfo = async (userId, deviceId, appVersion) => {
    const client = getClient();

    const { error } = await client
        .from('subscriptions')
        .update({
            device_id: deviceId,
            app_version: appVersion,
            last_check_at: new Date().toISOString()
        })
        .eq('user_id', userId);

    if (error) {
        console.error('Failed to update device info:', error.message);
        return { success: false, error };
    }

    return { success: true, error: null };
};

/**
 * AI kullanım logunu kaydeder (opsiyonel - analytics için)
 * @param {Object} logData - Log verileri
 * @returns {Promise<{success, error}>}
 */
const logUsage = async ({ userId, subscriptionId, operationType, tokensUsed, costUsd, deviceId, success, errorMessage }) => {
    const client = getClient();

    const { error } = await client
        .from('usage_logs')
        .insert({
            user_id: userId,
            subscription_id: subscriptionId,
            operation_type: operationType,
            tokens_used: tokensUsed || 0,
            cost_usd: costUsd || 0,
            device_id: deviceId,
            success: success !== false,
            error_message: errorMessage || null
        });

    if (error) {
        console.error('Failed to log usage:', error.message);
        return { success: false, error };
    }

    return { success: true, error: null };
};

/**
 * Kullanıcının kredi bakiyesini getirir
 * @param {string} userId - Kullanıcı UUID
 * @returns {Promise<{credits, error}>}
 */
const getCredits = async (userId) => {
    const client = getClient();

    const { data, error } = await client.rpc('get_credit_balance', {
        p_user_id: userId
    });

    if (error) {
        console.error('Failed to get credits:', error.message);
        return { credits: null, error };
    }

    return { credits: data, error: null };
};

/**
 * Kullanıcının kredisinden düşer (atomik)
 * @param {string} userId - Kullanıcı UUID
 * @param {number} amount - Düşülecek kredi miktarı
 * @param {string} operationType - İşlem tipi ('e_tebligat_scan' | 'statement_convert')
 * @param {string} [deviceId] - Cihaz ID
 * @returns {Promise<{result, error}>}
 */
const deductCredits = async (userId, amount, operationType, deviceId) => {
    const client = getClient();

    const { data, error } = await client.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_operation_type: operationType,
        p_device_id: deviceId || null
    });

    if (error) {
        console.error('Failed to deduct credits:', error.message);
        return { result: null, error };
    }

    return { result: data, error: null };
};

/**
 * Başarısız işlem sonrası kredi iadesi yapar
 * @param {string} userId - Kullanıcı UUID
 * @param {number} amount - İade edilecek kredi miktarı
 * @param {string} operationType - İşlem tipi
 * @returns {Promise<{result, error}>}
 */
const refundCredits = async (userId, amount, operationType) => {
    const client = getClient();

    const { data, error } = await client.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: amount,
        p_operation_type: operationType
    });

    if (error) {
        console.error('Failed to refund credits:', error.message);
        return { result: null, error };
    }

    return { result: data, error: null };
};

/**
 * Çıkış yapar (session'ı temizler)
 * @returns {Promise<{error}>}
 */
const signOut = async () => {
    const client = getClient();
    const { error } = await client.auth.signOut();

    if (error) {
        console.error('Supabase sign out error:', error.message);
    }

    return { error };
};

module.exports = {
    init,
    getClient,
    signInWithEmail,
    signUpWithEmail,
    getUserFromToken,
    getSubscription,
    updateSubscription,
    updateDeviceInfo,
    logUsage,
    getCredits,
    deductCredits,
    refundCredits,
    signOut
};
