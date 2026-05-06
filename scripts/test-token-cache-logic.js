/* eslint-disable no-console */
/**
 * gibTokenCache.js logic unit test — Electron API olmadan, sadece JWT
 * decode + cache set/get/invalidate doğruluğunu doğrular.
 *
 * Mock electron module (app.getPath, safeStorage) → Node standalone'da çalışır.
 */

const path = require('path');
const Module = require('module');

// === Mock electron ===
const tmpDir = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'token-cache-test-'));
const mockElectron = {
    app: {
        getPath: (key) => {
            if (key === 'userData') return tmpDir;
            throw new Error(`Unmocked app.getPath: ${key}`);
        },
    },
    safeStorage: {
        // Simple xor-based "encryption" — sadece test için
        isEncryptionAvailable: () => true,
        encryptString: (s) => Buffer.from(`MOCK:${s}`),
        decryptString: (buf) => buf.toString().replace(/^MOCK:/, ''),
    },
};
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._load = function (request, parent, ...rest) {
    if (request === 'electron') return mockElectron;
    return originalLoad.call(this, request, parent, ...rest);
};

// Mock logger (Electron app context'inde require ederken zincirlemeyi kes)
const mockLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
require.cache[require.resolve('../main/logger.js')] = {
    exports: mockLogger,
    loaded: true,
};

// === Test başlat ===
const cache = require('../main/automation/gibTokenCache');

let passed = 0;
let failed = 0;
function assert(name, cond) {
    if (cond) {
        console.log(`  ✓ ${name}`);
        passed++;
    } else {
        console.log(`  ✗ ${name}`);
        failed++;
    }
}

// Helper: build a mock JWT with given exp (seconds since epoch)
function makeJWT(expSec) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: expSec })).toString('base64url');
    return `${header}.${payload}.fakesignature`;
}

console.log('\n=== Test 1: Empty cache, getValidToken returns null ===');
assert('Empty cache miss', cache.getValidToken('USER1') === null);

console.log('\n=== Test 2: setToken + getValidToken round-trip ===');
const futureToken = makeJWT(Math.floor(Date.now() / 1000) + 3600); // +1h
cache.setToken('USER1', futureToken);
assert('Token retrieved after set', cache.getValidToken('USER1') === futureToken);

console.log('\n=== Test 3: Per-user isolation ===');
const otherToken = makeJWT(Math.floor(Date.now() / 1000) + 3600);
cache.setToken('USER2', otherToken);
assert('USER1 unchanged', cache.getValidToken('USER1') === futureToken);
assert('USER2 separate', cache.getValidToken('USER2') === otherToken);

console.log('\n=== Test 4: Expired token returns null ===');
const expiredToken = makeJWT(Math.floor(Date.now() / 1000) - 100); // 100s past
cache.setToken('USER3', expiredToken);
assert('Expired token detected', cache.getValidToken('USER3') === null);

console.log('\n=== Test 5: Soon-to-expire (within 5min buffer) returns null ===');
const soonToken = makeJWT(Math.floor(Date.now() / 1000) + 60); // +1min (within 5min buffer)
cache.setToken('USER4', soonToken);
assert('Within refresh buffer treated as expired', cache.getValidToken('USER4') === null);

console.log('\n=== Test 6: Invalidation ===');
cache.invalidateToken('USER1');
assert('Invalidated token gone', cache.getValidToken('USER1') === null);
assert('Other user unaffected', cache.getValidToken('USER2') === otherToken);

console.log('\n=== Test 7: Malformed JWT → fallback expiry (30min) ===');
cache.setToken('USER5', 'not-a-jwt');
const t = cache.getValidToken('USER5');
assert('Malformed JWT still cached (fallback)', t === 'not-a-jwt');

console.log('\n=== Test 8: Disk persistence — reload ===');
delete require.cache[require.resolve('../main/automation/gibTokenCache.js')];
const cache2 = require('../main/automation/gibTokenCache');
assert('USER2 token survived restart', cache2.getValidToken('USER2') === otherToken);
assert('Invalidated USER1 still gone after restart', cache2.getValidToken('USER1') === null);

console.log('\n=== Test 9: Stats ===');
const stats = cache2.getStats();
console.log(`  hits=${stats.hits} misses=${stats.misses} invalidations=${stats.invalidations} decode_fails=${stats.decode_fails}`);
assert('Stats hits > 0', stats.hits > 0);
assert('Stats decode_fails recorded', stats.decode_fails >= 1);

// Cleanup
require('fs').rmSync(tmpDir, { recursive: true, force: true });
Module._load = originalLoad;

console.log(`\n${'='.repeat(40)}`);
console.log(`SONUÇ: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
