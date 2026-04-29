/**
 * Subscription expiry hesaplama + severity tier mantığı.
 * UI komponentleri ve native notification scheduler bu yardımcılardan beslenir
 * — gün eşikleri tek noktada tanımlı, formül değiştiğinde her yerde güncel kalır.
 */

import type { Subscription } from '../types';

export type ExpirySeverity = 'safe' | 'info' | 'warning' | 'critical' | 'expired';

export interface ExpiryStatus {
    /** Bitime kalan gün (negatif = geçmiş, null = expiresAt yok / complimentary) */
    daysRemaining: number | null;
    /** UI severity bucket */
    severity: ExpirySeverity;
    /** Banner gösterilmeli mi (safe = gösterme) */
    shouldShowBanner: boolean;
    /** Bildirim eşiği (30/14/7/3/1) tetiklendiyse hangi gün */
    notificationThreshold: number | null;
}

const NOTIFICATION_THRESHOLDS = [30, 14, 7, 3, 1] as const;

/**
 * Subscription'ın bitiş durumunu hesaplar.
 * Complimentary kullanıcılar için (founder, test) expiry yoktur — daysRemaining null.
 */
export function getExpiryStatus(subscription: Subscription | null): ExpiryStatus {
    if (!subscription || !subscription.expiresAt) {
        return {
            daysRemaining: null,
            severity: 'safe',
            shouldShowBanner: false,
            notificationThreshold: null,
        };
    }

    const expiryMs = new Date(subscription.expiresAt).getTime();
    const nowMs = Date.now();
    const diffMs = expiryMs - nowMs;
    const daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let severity: ExpirySeverity;
    if (daysRemaining < 0) severity = 'expired';
    else if (daysRemaining <= 1) severity = 'critical';
    else if (daysRemaining <= 7) severity = 'warning';
    else if (daysRemaining <= 30) severity = 'info';
    else severity = 'safe';

    // Notification threshold: tam o güne ulaşıldığında tetiklenir (idempotent
    // logic main process tarafında, "bu eşik için bildirim atıldı mı" persist).
    const notificationThreshold = NOTIFICATION_THRESHOLDS.find((t) => daysRemaining === t) ?? null;

    return {
        daysRemaining,
        severity,
        shouldShowBanner: severity !== 'safe',
        notificationThreshold,
    };
}

/**
 * Severity'ye göre Tailwind renk class'ları — UI consistency.
 */
export function getSeverityColors(severity: ExpirySeverity): {
    bg: string;
    border: string;
    text: string;
    icon: string;
} {
    switch (severity) {
        case 'info':
            return {
                bg: 'bg-sky-500/10',
                border: 'border-sky-500/30',
                text: 'text-sky-300',
                icon: 'text-sky-400',
            };
        case 'warning':
            return {
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/30',
                text: 'text-amber-300',
                icon: 'text-amber-400',
            };
        case 'critical':
            return {
                bg: 'bg-red-500/10',
                border: 'border-red-500/40',
                text: 'text-red-300',
                icon: 'text-red-400',
            };
        case 'expired':
            return {
                bg: 'bg-red-600/15',
                border: 'border-red-600/50',
                text: 'text-red-200',
                icon: 'text-red-400',
            };
        default:
            return {
                bg: 'bg-slate-700/30',
                border: 'border-slate-600',
                text: 'text-slate-300',
                icon: 'text-slate-400',
            };
    }
}

/**
 * Kullanıcıya gösterilecek mesaj.
 */
export function getExpiryMessage(status: ExpiryStatus): string {
    if (status.daysRemaining === null) return '';
    if (status.severity === 'expired') {
        const daysOverdue = Math.abs(status.daysRemaining);
        return daysOverdue === 0
            ? 'Aboneliğiniz bugün sona erdi.'
            : `Aboneliğiniz ${daysOverdue} gün önce sona erdi.`;
    }
    if (status.daysRemaining === 0) return 'Aboneliğiniz bugün sona eriyor.';
    if (status.daysRemaining === 1) return 'Aboneliğiniz yarın sona eriyor.';
    return `Aboneliğinizin sonuna ${status.daysRemaining} gün kaldı.`;
}

/**
 * Sidebar'daki kompakt etiket için.
 */
export function getCompactLabel(status: ExpiryStatus): string {
    if (status.daysRemaining === null) return '';
    if (status.severity === 'expired') return 'Süresi doldu';
    if (status.daysRemaining === 0) return 'Bugün sona eriyor';
    if (status.daysRemaining === 1) return 'Yarın sona eriyor';
    return `${status.daysRemaining} gün kaldı`;
}
