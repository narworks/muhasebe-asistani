import { describe, it, expect } from 'vitest';
import {
    loginSchema,
    clientSchema,
    scanSettingsSchema,
    scheduleConfigSchema,
    validateForm,
} from './validations';

describe('Validation Schemas', () => {
    describe('loginSchema', () => {
        it('should accept valid login data', () => {
            const result = loginSchema.safeParse({
                email: 'test@example.com',
                password: 'password123',
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid email', () => {
            const result = loginSchema.safeParse({
                email: 'invalid-email',
                password: 'password123',
            });
            expect(result.success).toBe(false);
        });

        it('should reject short password', () => {
            const result = loginSchema.safeParse({
                email: 'test@example.com',
                password: '12345',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('clientSchema', () => {
        it('should accept valid client data', () => {
            const result = clientSchema.safeParse({
                name: 'Test Firma',
                gib_username: 'testuser',
                tax_id: '1234567890',
            });
            expect(result.success).toBe(true);
        });

        it('should reject empty name', () => {
            const result = clientSchema.safeParse({
                name: '',
            });
            expect(result.success).toBe(false);
        });

        it('should accept 10-digit tax ID', () => {
            const result = clientSchema.safeParse({
                name: 'Test',
                tax_id: '1234567890',
            });
            expect(result.success).toBe(true);
        });

        it('should accept 11-digit TC Kimlik No', () => {
            const result = clientSchema.safeParse({
                name: 'Test',
                tax_id: '12345678901',
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid tax ID', () => {
            const result = clientSchema.safeParse({
                name: 'Test',
                tax_id: '123',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('scanSettingsSchema', () => {
        it('should accept valid settings', () => {
            const result = scanSettingsSchema.safeParse({
                batchSize: 10,
                delayBetweenClients: 5000,
                startPeriod: '2024-01',
                endPeriod: '2024-12',
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid batchSize', () => {
            const result = scanSettingsSchema.safeParse({
                batchSize: 0,
            });
            expect(result.success).toBe(false);
        });

        it('should reject invalid period format', () => {
            const result = scanSettingsSchema.safeParse({
                startPeriod: '2024-13',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('scheduleConfigSchema', () => {
        it('should accept valid config', () => {
            const result = scheduleConfigSchema.safeParse({
                enabled: true,
                time: '09:00',
                frequency: 'daily',
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid time format', () => {
            const result = scheduleConfigSchema.safeParse({
                enabled: true,
                time: '25:00',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('validateForm helper', () => {
        it('should return success with valid data', () => {
            const result = validateForm(loginSchema, {
                email: 'test@example.com',
                password: 'password123',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.email).toBe('test@example.com');
            }
        });

        it('should return errors with invalid data', () => {
            const result = validateForm(loginSchema, {
                email: 'invalid',
                password: '123',
            });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.errors).toHaveProperty('email');
                expect(result.errors).toHaveProperty('password');
            }
        });
    });
});
