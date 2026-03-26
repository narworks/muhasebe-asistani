import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{js,ts,tsx}'],
        exclude: ['node_modules', 'dist', 'backend'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'dist/', 'backend/', '**/*.d.ts', '**/*.config.*'],
        },
        deps: {
            optimizer: {
                web: {
                    include: ['@testing-library/react', 'react-dom'],
                },
            },
        },
        server: {
            deps: {
                inline: ['react-dom'],
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    esbuild: {
        jsx: 'automatic',
    },
});
