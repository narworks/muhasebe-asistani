# CLAUDE.md — Muhasebe Asistani

## Project Overview

Electron desktop application for Turkish accountants (Mali Musavirler). Automates GIB (Turkish tax authority) e-notification scanning, bank statement conversion, and subscription management.

- **App ID:** `com.narworks.muhasebeasistani`
- **Stack:** Electron 35 + React 18 + Vite 4 + TypeScript + Tailwind CSS 3
- **Main process:** Plain JavaScript in `main/`
- **Renderer:** TypeScript/React in `src/`
- **Local DB:** SQLite via better-sqlite3
- **Cloud:** Supabase (auth, sync), iyzipay (payments)
- **Automation:** Puppeteer (GIB portal scraping), Google Gemini (statement parsing)

## Architecture

```
src/                  # React renderer (TypeScript/TSX)
  components/         # UI components (PascalCase filenames)
  pages/              # Route pages (auth, dashboard, tools, admin)
  context/            # React contexts (AuthContext)
  types/              # TypeScript type definitions
  lib/                # Utilities and validations
  test/               # Vitest tests

main/                 # Electron main process (JavaScript)
  main.js             # Entry point, IPC handlers, window management
  preload.js          # Context-isolated IPC bridge (window.electronAPI)
  database.js         # SQLite schema and queries
  supabase.js         # Supabase client and auth
  license.js          # Subscription/licensing logic
  autoUpdater.js      # electron-updater config
  scheduler.js        # node-cron scheduled scanning
  settings.js         # User preferences persistence
  logger.js           # Application logging
  automation/         # GIB scraping + statement conversion
    gibScraper.js     # Puppeteer-based GIB portal scraper
    gibApiClient.js   # GIB API wrapper
    statementConverter.js  # Gemini AI bank statement parsing

supabase/functions/   # Supabase Edge Functions (payment webhooks)
scripts/              # Build helpers (fix-paths, build-env)
build/                # Electron builder resources (icons, entitlements)
```

## Common Commands

```bash
npm start             # Dev mode (Vite dev server + Electron)
npm run dev           # Vite dev server only (port 5173)
npm run electron:dev  # Electron only (expects Vite on 5173)
npm run dist          # Full production build (vite build + fix-paths + build-env + electron-builder)
npm run lint          # ESLint check (src/ + main/)
npm run lint:fix      # ESLint autofix
npm run format        # Prettier format all
npm run format:check  # Prettier check
npm run type-check    # TypeScript check (tsc --noEmit)
npm test              # Run tests (vitest run)
npm run test:watch    # Watch mode tests
npm run test:coverage # Tests with coverage report
```

## Code Conventions

### Formatting (Prettier)

- 4-space indentation, single quotes, trailing commas (es5), semicolons, 100 char line width

### Linting (ESLint)

- `@typescript-eslint/no-explicit-any`: warn
- `no-console`: warn in `src/` (allowed in `main/`)
- React: no need to import React (react-jsx transform)

### TypeScript

- Strict mode enabled, target ES2022
- Path alias: `@/*` maps to `./src/*`
- Types defined in `src/types/index.ts`

### File Naming

- Components: PascalCase (`Button.tsx`, `MainLayout.tsx`)
- Main process modules: camelCase (`database.js`, `gibScraper.js`)

### Git Hooks (Husky + lint-staged)

- Pre-commit: ESLint fix + Prettier on staged `src/**/*.{ts,tsx}`, `main/**/*.js`, `*.{json,md}`

## Important Constraints

### Security

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` — all renderer-main communication goes through `preload.js` IPC bridge
- Never expose Node.js APIs directly to renderer
- Passwords stored via Electron `safeStorage` (encrypted)
- `.env` is gitignored — secrets embedded at build time via `scripts/build-env.js` into `main/env-config.js`

### Turkish Language / UI

- All user-facing UI text is in Turkish
- Entity names (firm names, tax numbers) may contain Turkish characters (ş, ç, ğ, ı, ö, ü, İ, Ş, Ç, Ğ, Ö, Ü)
- Use locale-aware string operations where relevant (`toLocaleLowerCase('tr-TR')`)

### Build & Distribution

- macOS: universal binary (arm64 + x64), notarized, hardened runtime
- Windows: NSIS installer
- Linux: AppImage + deb
- Auto-updates via GitHub Releases (electron-updater)
- CI/CD: GitHub Actions triggered on `v*` tag push
- Puppeteer Chromium bundled via `.puppeteer-cache` → `extraResources`

### Large Files

- `src/pages/tools/ETebligat.tsx` (~247KB) and `main/automation/gibScraper.js` (~97KB) are very large — read specific line ranges rather than entire files
- `main/main.js` (~45KB) — similarly large, read targeted sections

## Environment Variables

Required in `.env` (see `.env.example`):

- `GEMINI_API_KEY` — Google AI Studio (statement parsing)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — Supabase project
- `SUPABASE_SERVICE_ROLE_KEY` — build-time only (not shipped)
- `SENTRY_DSN` — error tracking
- `BILLING_URL` — payment portal

## Testing

- Framework: Vitest + @testing-library/react + jsdom
- Config: `vitest.config.ts`
- Tests located in `src/test/` and colocated `*.test.ts` files
- Coverage provider: v8
