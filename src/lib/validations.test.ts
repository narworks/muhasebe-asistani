import { describe, it, expect } from 'vitest';
import {
    loginSchema,
    clientSchema,
    clientCreateSchema,
    clientEditSchema,
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
                firm_name: 'Test Firma',
                gib_user_code: 'testuser',
                tax_number: '1234567890',
            });
            expect(result.success).toBe(true);
        });

        it('should reject empty firm name', () => {
            const result = clientSchema.safeParse({
                firm_name: '',
                gib_user_code: 'testuser',
            });
            expect(result.success).toBe(false);
        });

        it('should reject empty gib_user_code', () => {
            const result = clientSchema.safeParse({
                firm_name: 'Test',
                gib_user_code: '',
            });
            expect(result.success).toBe(false);
        });

        it('should accept 10-digit tax number', () => {
            const result = clientSchema.safeParse({
                firm_name: 'Test',
                gib_user_code: 'testuser',
                tax_number: '1234567890',
            });
            expect(result.success).toBe(true);
        });

        it('should accept 11-digit TC Kimlik No', () => {
            const result = clientSchema.safeParse({
                firm_name: 'Test',
                gib_user_code: 'testuser',
                tax_number: '12345678901',
            });
            expect(result.success).toBe(true);
        });

        it('should reject invalid tax number', () => {
            const result = clientSchema.safeParse({
                firm_name: 'Test',
                gib_user_code: 'testuser',
                tax_number: '123',
            });
            expect(result.success).toBe(false);
        });
    });

    describe('clientCreateSchema', () => {
        it('should require password for new clients', () => {
            const result = clientCreateSchema.safeParse({
                firm_name: 'Test',
                gib_user_code: 'testuser',
                gib_password: '',
            });
            expect(result.success).toBe(false);
        });

        it('should accept valid new client data with password', () => {
            const result = clientCreateSchema.safeParse({
                firm_name: 'Test',
                gib_user_code: 'testuser',
                gib_password: 'password123',
            });
            expect(result.success).toBe(true);
        });
    });

    describe('clientEditSchema', () => {
        it('should allow empty password for editing', () => {
            const result = clientEditSchema.safeParse({
                firm_name: 'Test',
                gib_user_code: 'testuser',
                gib_password: '',
            });
            expect(result.success).toBe(true);
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
                const errorResult = result as { success: false; errors: Record<string, string> };
                expect(errorResult.errors).toHaveProperty('email');
                expect(errorResult.errors).toHaveProperty('password');
            }
        });
    });
});
