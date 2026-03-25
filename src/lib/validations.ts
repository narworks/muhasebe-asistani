import { z } from 'zod';

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
    email: z
        .string()
        .min(1, 'E-posta adresi zorunludur')
        .email('Geçerli bir e-posta adresi giriniz'),
    password: z
        .string()
        .min(1, 'Şifre zorunludur')
        .min(6, 'Şifre en az 6 karakter olmalıdır'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Client (Mükellef) form validation schema
 */
export const clientSchema = z.object({
    firm_name: z
        .string()
        .min(1, 'Firma adı zorunludur')
        .max(255, 'Firma adı çok uzun (max 255 karakter)'),
    gib_user_code: z
        .string()
        .min(1, 'GİB kullanıcı kodu zorunludur')
        .max(100, 'GİB kullanıcı kodu çok uzun'),
    gib_password: z.string().optional().or(z.literal('')),
    tax_number: z
        .string()
        .optional()
        .refine(
            (val) => {
                if (!val || val === '') return true;
                const cleaned = val.replace(/\D/g, '');
                return cleaned.length === 10 || cleaned.length === 11;
            },
            { message: 'Vergi numarası 10 veya 11 haneli olmalıdır' }
        ),
});

/**
 * Client schema for editing (password optional)
 */
export const clientEditSchema = clientSchema.extend({
    gib_password: z.string().optional().or(z.literal('')),
});

/**
 * Client schema for new client (password required)
 */
export const clientCreateSchema = clientSchema.extend({
    gib_password: z.string().min(1, 'GİB şifresi zorunludur'),
});

export type ClientFormData = z.infer<typeof clientSchema>;

/**
 * Scan settings validation schema
 */
export const scanSettingsSchema = z.object({
    batchSize: z
        .number()
        .int()
        .min(1, 'Batch boyutu en az 1 olmalıdır')
        .max(100, 'Batch boyutu en fazla 100 olabilir')
        .optional(),
    delayBetweenClients: z
        .number()
        .int()
        .min(0, 'Bekleme süresi negatif olamaz')
        .max(60000, 'Bekleme süresi en fazla 60 saniye olabilir')
        .optional(),
    startPeriod: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Dönem formatı YYYY-MM olmalıdır')
        .optional()
        .or(z.literal('')),
    endPeriod: z
        .string()
        .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Dönem formatı YYYY-MM olmalıdır')
        .optional()
        .or(z.literal('')),
});

export type ScanSettingsFormData = z.infer<typeof scanSettingsSchema>;

/**
 * Schedule configuration validation schema
 */
export const scheduleConfigSchema = z.object({
    enabled: z.boolean(),
    time: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Saat formatı HH:MM olmalıdır')
        .optional()
        .or(z.literal('')),
    finishByTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Saat formatı HH:MM olmalıdır')
        .optional()
        .or(z.literal('')),
    frequency: z.enum(['daily', 'weekly', 'custom']).default('daily'),
    customDays: z
        .array(z.number().int().min(0).max(6))
        .optional()
        .default([]),
});

export type ScheduleConfigFormData = z.infer<typeof scheduleConfigSchema>;

/**
 * Helper function to safely parse and validate form data
 */
export function validateForm<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    const errors: Record<string, string> = {};
    for (const error of result.error.errors) {
        const path = error.path.join('.');
        if (!errors[path]) {
            errors[path] = error.message;
        }
    }

    return { success: false, errors };
}
