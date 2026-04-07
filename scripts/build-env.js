/**
 * Build-time script: Embeds environment variables into a JS config module
 * so that .env is NOT shipped as a plaintext file in the binary.
 *
 * Usage: node scripts/build-env.js (runs after dotenv is loaded)
 */
const fs = require('fs');
const path = require('path');

// Load .env if available (CI creates it from secrets)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const keys = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'BILLING_URL', 'SENTRY_DSN'];

const lines = keys.map((key) => {
    const value = process.env[key] || '';
    // Escape single quotes in values
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `    ${key}: '${escaped}',`;
});

const content = `// Auto-generated at build time — do NOT commit\nmodule.exports = {\n${lines.join('\n')}\n};\n`;

const outPath = path.join(__dirname, '../main/env-config.js');
fs.writeFileSync(outPath, content, 'utf8');
console.log('env-config.js generated successfully.');
