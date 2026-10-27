import { createRequire } from 'module';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const telemetry: any = require('../../main/captchaTelemetry.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jwt: any = require('../../main/jwtUtil.js');

function makeJwt(expSec: number): string {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${enc({ alg: 'HS256' })}.${enc({ exp: expSec, sub: 'u1' })}.sig`;
}

function res(status: number) {
    return { status, ok: status >= 200 && status < 300, text: async () => '' };
}

function setup(opts: { tokens: (string | null)[]; refreshOk?: boolean; statuses: number[] }) {
    const tokens = [...opts.tokens];
    const statuses = [...opts.statuses];
    const license = {
        getValidAccessToken: vi.fn(async () => (tokens.length > 1 ? tokens.shift() : tokens[0])),
        ensureFreshToken: vi.fn(async () => opts.refreshOk ?? false),
    };
    const fetch = vi.fn(async () => res(statuses.shift() ?? 500));
    telemetry.__setDepsForTest({
        settings: { readSettings: () => ({}) },
        logger: { debug: () => {} },
        license,
        fetch,
    });
    return { license, fetch };
}

describe('captchaTelemetry flush auth', () => {
    beforeEach(() => {
        process.env.BILLING_URL = 'https://muhasebeasistani.com/billing';
        telemetry.__resetForTest();
        telemetry.recordCaptcha({ method: 'crnn', success: true });
        telemetry.recordGibLogin({ success: true });
    });

    it('oturum yoksa göndermez ve buffer silinmez', async () => {
        const { fetch } = setup({ tokens: [null], statuses: [] });
        await telemetry.flush();
        expect(fetch).not.toHaveBeenCalled();
        expect(telemetry.__getBufferSizesForTest()).toEqual({ captcha: 1, login: 1 });
    });

    it('geçerli token ile Bearer başlığı gönderir, 200de buffer boşalır', async () => {
        const { fetch } = setup({ tokens: ['tok-1'], statuses: [200] });
        await telemetry.flush();
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://muhasebeasistani.com/api/admin/telemetry/captcha-batch');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
        expect(telemetry.__getBufferSizesForTest()).toEqual({ captcha: 0, login: 0 });
    });

    it('401de bir kez refresh edip yeni token ile tekrar dener', async () => {
        const { fetch, license } = setup({
            tokens: ['old', 'new'],
            refreshOk: true,
            statuses: [401, 200],
        });
        await telemetry.flush();
        expect(license.ensureFreshToken).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledTimes(2);
        const init2 = (fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
        expect((init2.headers as Record<string, string>).Authorization).toBe('Bearer new');
        expect(telemetry.__getBufferSizesForTest()).toEqual({ captcha: 0, login: 0 });
    });

    it('401 + refresh başarısızsa buffer korunur, sonsuz retry yok', async () => {
        const { fetch } = setup({ tokens: ['old'], refreshOk: false, statuses: [401] });
        await telemetry.flush();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(telemetry.__getBufferSizesForTest()).toEqual({ captcha: 1, login: 1 });
    });

    it('retry de 401 dönerse buffer korunur', async () => {
        const { fetch } = setup({ tokens: ['old', 'new'], refreshOk: true, statuses: [401, 401] });
        await telemetry.flush();
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(telemetry.__getBufferSizesForTest()).toEqual({ captcha: 1, login: 1 });
    });
});

describe('jwtUtil', () => {
    const now = 1_800_000_000_000;
    it('exp okur ve tazeliği hesaplar', () => {
        const t = makeJwt(now / 1000 + 3600);
        expect(jwt.getJwtExp(t)).toBe(now / 1000 + 3600);
        expect(jwt.isJwtFresh(t, 60_000, now)).toBe(true);
        expect(jwt.isJwtExpired(t, now)).toBe(false);
    });
    it('süresi dolmuş / dolmak üzere token', () => {
        expect(jwt.isJwtExpired(makeJwt(now / 1000 - 1), now)).toBe(true);
        expect(jwt.isJwtFresh(makeJwt(now / 1000 + 30), 60_000, now)).toBe(false);
    });
    it('bozuk token', () => {
        expect(jwt.getJwtExp('abc')).toBeNull();
        expect(jwt.isJwtFresh('abc')).toBe(false);
        expect(jwt.isJwtExpired('')).toBe(false);
    });
});
