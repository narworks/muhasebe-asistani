import { describe, it, expect } from 'vitest';
import { isTransientUpdateError } from '../../main/updateErrorFilter';

describe('isTransientUpdateError', () => {
    it('electron-updater 504 (mesaj başında status) → transient', () => {
        expect(
            isTransientUpdateError({
                message:
                    '504 "method: GET url: https://github.com/x/y/releases.atom\\n\\n<!DOCTYPE html>"',
            })
        ).toBe(true);
    });

    it('statusCode 503 → transient', () => {
        expect(isTransientUpdateError({ statusCode: 503, message: 'boom' })).toBe(true);
    });

    it('statusCode 429 (rate limit) → transient', () => {
        expect(isTransientUpdateError({ statusCode: 429 })).toBe(true);
    });

    it("name 'HttpError' → transient", () => {
        expect(isTransientUpdateError({ name: 'HttpError', message: 'x' })).toBe(true);
    });

    it('ECONNRESET → transient', () => {
        expect(isTransientUpdateError({ message: 'read ECONNRESET' })).toBe(true);
    });

    it('": 500" formatı (mevcut davranış korunur) → transient', () => {
        expect(isTransientUpdateError({ message: 'HttpError: 500 Internal' })).toBe(true);
    });

    it('sha512 checksum hatası (kalıcı) → transient DEĞİL', () => {
        expect(
            isTransientUpdateError({ message: 'sha512 checksum mismatch, update rejected' })
        ).toBe(false);
    });

    it('404 (429 hariç 4xx) → transient DEĞİL', () => {
        expect(isTransientUpdateError({ statusCode: 404, message: 'Not Found' })).toBe(false);
    });

    it('null / undefined → false', () => {
        expect(isTransientUpdateError(null)).toBe(false);
        expect(isTransientUpdateError(undefined)).toBe(false);
    });
});
