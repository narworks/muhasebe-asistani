const Database = require('better-sqlite3');
const path = require('path');
const { app, safeStorage } = require('electron');
const logger = require('./logger');

let db;

function init() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'local_data.db');
    logger.debug('Database path:', dbPath);

    db = new Database(dbPath);

    // Initialize Tables
    db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firm_name TEXT NOT NULL,
      tax_number TEXT,
      gib_user_code TEXT,
      gib_password_encrypted BLOB,
      status TEXT DEFAULT 'active'
    )
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS tebligatlar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      tebligat_date TEXT,
      sender TEXT,
      subject TEXT,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

    db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tebligat_unique
    ON tebligatlar (client_id, tebligat_date, sender, subject, status)
  `);

    // Migration: Add document columns if they don't exist
    const tableInfo = db.pragma('table_info(tebligatlar)');
    const columns = tableInfo.map((col) => col.name);

    if (!columns.includes('document_no')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN document_no TEXT');
    }
    if (!columns.includes('document_url')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN document_url TEXT');
    }
    if (!columns.includes('document_path')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN document_path TEXT');
    }
    if (!columns.includes('sub_unit')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN sub_unit TEXT');
    }
    if (!columns.includes('document_type')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN document_type TEXT');
    }
    if (!columns.includes('send_date')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN send_date TEXT');
    }
    if (!columns.includes('notification_date')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN notification_date TEXT');
    }
    if (!columns.includes('read_date')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN read_date TEXT');
    }

    // Migration: Add last_full_scan_at to clients
    const clientInfo = db.pragma('table_info(clients)');
    const clientCols = clientInfo.map((col) => col.name);
    if (!clientCols.includes('last_full_scan_at')) {
        db.exec('ALTER TABLE clients ADD COLUMN last_full_scan_at TEXT');
    }

    // Migration: Unique constraint on gib_user_code (prevent duplicate clients)
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_gib_user_code
        ON clients (gib_user_code) WHERE gib_user_code IS NOT NULL AND gib_user_code != ''
    `);

    // Scan history: one row per scan session
    db.exec(`
        CREATE TABLE IF NOT EXISTS scan_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            scan_type TEXT,
            total_clients INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            new_tebligat_count INTEGER DEFAULT 0,
            duration_seconds INTEGER DEFAULT 0,
            results_json TEXT
        )
    `);
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_scan_history_started
        ON scan_history(started_at DESC)
    `);
}

function saveClient(clientData) {
    if (!db) init();

    const { firm_name, tax_number, gib_user_code, gib_password } = clientData;

    // Check for duplicate gib_user_code
    if (gib_user_code) {
        const existing = db
            .prepare('SELECT id, firm_name FROM clients WHERE gib_user_code = ?')
            .get(gib_user_code);
        if (existing) {
            throw new Error(
                `Bu GİB kullanıcı kodu zaten kayıtlı (${existing.firm_name}). Aynı mükellef tekrar eklenemez.`
            );
        }
    }

    // Encrypt password
    let encryptedPassword = null;
    if (gib_password && safeStorage.isEncryptionAvailable()) {
        encryptedPassword = safeStorage.encryptString(gib_password);
    } else if (gib_password) {
        console.warn('SafeStorage not available, cannot securely save password.');
        throw new Error('Şifreleme sistemi (SafeStorage) bu sistemde kullanılamıyor.');
    }

    const stmt = db.prepare(`
    INSERT INTO clients (firm_name, tax_number, gib_user_code, gib_password_encrypted)
    VALUES (@firm_name, @tax_number, @gib_user_code, @encryptedPassword)
  `);

    return stmt.run({
        firm_name,
        tax_number,
        gib_user_code,
        encryptedPassword,
    });
}

function updateClient(id, clientData) {
    if (!db) init();

    const { firm_name, tax_number, gib_user_code, gib_password } = clientData;

    let encryptedPassword = null;
    if (gib_password) {
        if (safeStorage.isEncryptionAvailable()) {
            encryptedPassword = safeStorage.encryptString(gib_password);
        } else {
            throw new Error('Şifreleme sistemi (SafeStorage) bu sistemde kullanılamıyor.');
        }
    }

    if (encryptedPassword) {
        const stmt = db.prepare(`
      UPDATE clients
      SET firm_name = @firm_name,
          tax_number = @tax_number,
          gib_user_code = @gib_user_code,
          gib_password_encrypted = @encryptedPassword
      WHERE id = @id
    `);
        return stmt.run({
            id,
            firm_name,
            tax_number,
            gib_user_code,
            encryptedPassword,
        });
    }

    const stmt = db.prepare(`
    UPDATE clients
    SET firm_name = @firm_name,
        tax_number = @tax_number,
        gib_user_code = @gib_user_code
    WHERE id = @id
  `);

    return stmt.run({
        id,
        firm_name,
        tax_number,
        gib_user_code,
    });
}

function updateClientStatus(id, status) {
    if (!db) init();
    const stmt = db.prepare('UPDATE clients SET status = ? WHERE id = ?');
    return stmt.run(status, id);
}

function deleteClient(id) {
    if (!db) init();
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM tebligatlar WHERE client_id = ?').run(id);
        db.prepare('DELETE FROM clients WHERE id = ?').run(id);
    });
    tx();
}

function getClients() {
    if (!db) init();
    const stmt = db.prepare(
        'SELECT id, firm_name, tax_number, gib_user_code, status, last_full_scan_at FROM clients'
    );
    return stmt.all();
}

function saveTebligatlar(clientId, tebligatlar) {
    if (!db) init();
    if (!Array.isArray(tebligatlar) || tebligatlar.length === 0) return 0;

    const insert = db.prepare(`
    INSERT OR IGNORE INTO tebligatlar (
      client_id, tebligat_date, sender, subject, status,
      document_no, document_url, document_path,
      sub_unit, document_type, send_date, notification_date, read_date
    ) VALUES (
      @client_id, @tebligat_date, @sender, @subject, @status,
      @document_no, @document_url, @document_path,
      @sub_unit, @document_type, @send_date, @notification_date, @read_date
    )
  `);

    // Update document_path for existing records that now have a downloaded file
    const updateDocPath = db.prepare(`
    UPDATE tebligatlar SET document_path = @document_path
    WHERE client_id = @client_id AND document_no = @document_no
      AND (document_path IS NULL OR document_path = '')
      AND @document_path IS NOT NULL
  `);

    const insertMany = db.transaction((items) => {
        let inserted = 0;
        const newIds = [];
        for (const item of items) {
            const result = insert.run({
                client_id: clientId,
                tebligat_date: item.date || null,
                sender: item.sender || null,
                subject: item.subject || null,
                status: item.status || null,
                document_no: item.documentNo || null,
                document_url: item.documentUrl || null,
                document_path: item.documentPath || null,
                sub_unit: item.subUnit || null,
                document_type: item.documentType || null,
                send_date: item.sendDate || null,
                notification_date: item.notificationDate || null,
                read_date: item.readDate || null,
            });
            if (result.changes > 0) {
                inserted++;
                newIds.push(Number(result.lastInsertRowid));
            }

            // If record already existed, update its document_path
            if (result.changes === 0 && item.documentPath) {
                updateDocPath.run({
                    client_id: clientId,
                    document_no: item.documentNo || null,
                    document_path: item.documentPath,
                });
            }
        }
        return { inserted, newIds };
    });

    return insertMany(tebligatlar);
}

function getTebligatlar(limit = 50000) {
    if (!db) init();
    // Large default limit (50K) — SQLite handles this easily locally.
    // Previous 200 limit caused last-5-clients-only display bug on large installs.
    const stmt = db.prepare(`
    SELECT t.id,
           t.tebligat_date,
           t.sender,
           t.subject,
           t.status,
           t.document_no,
           t.document_url,
           t.document_path,
           t.sub_unit,
           t.document_type,
           t.send_date,
           t.notification_date,
           t.read_date,
           t.created_at,
           c.firm_name,
           c.id as client_id
    FROM tebligatlar t
    JOIN clients c ON c.id = t.client_id
    ORDER BY t.created_at DESC
    LIMIT ?
  `);
    return stmt.all(limit);
}

// Get a single tebligat by id (includes client info for on-demand fetching)
function getTebligatById(id) {
    if (!db) init();
    const stmt = db.prepare(`
    SELECT t.id,
           t.tebligat_date,
           t.sender,
           t.subject,
           t.status,
           t.document_no,
           t.document_url,
           t.document_path,
           t.sub_unit,
           t.document_type,
           t.send_date,
           t.notification_date,
           t.read_date,
           t.created_at,
           t.client_id,
           c.firm_name
    FROM tebligatlar t
    JOIN clients c ON c.id = t.client_id
    WHERE t.id = ?
  `);
    return stmt.get(id);
}

// Mark client as having completed a full scan
function updateClientScanDate(id) {
    if (!db) init();
    const stmt = db.prepare('UPDATE clients SET last_full_scan_at = ? WHERE id = ?');
    return stmt.run(new Date().toISOString(), id);
}

// Update document path for a tebligat
function updateTebligatDocument(tebligatId, documentPath) {
    if (!db) init();
    const stmt = db.prepare('UPDATE tebligatlar SET document_path = ? WHERE id = ?');
    return stmt.run(documentPath, tebligatId);
}

// Update document path by old path (used when .imz is converted to .pdf)
function updateTebligatDocumentByPath(oldPath, newPath) {
    if (!db) init();
    const stmt = db.prepare('UPDATE tebligatlar SET document_path = ? WHERE document_path = ?');
    return stmt.run(newPath, oldPath);
}

// Function to retrieve decrypted password (internal use only, for bot)
function getClientPassword(id) {
    if (!db) init();
    const stmt = db.prepare('SELECT gib_password_encrypted FROM clients WHERE id = ?');
    const row = stmt.get(id);
    if (row && row.gib_password_encrypted) {
        return safeStorage.decryptString(row.gib_password_encrypted);
    }
    return null;
}

function deleteTebligat(id) {
    if (!db) init();
    const stmt = db.prepare('DELETE FROM tebligatlar WHERE id = ?');
    return stmt.run(id);
}

function deleteTebligatlarByClient(clientId) {
    if (!db) init();
    const stmt = db.prepare('DELETE FROM tebligatlar WHERE client_id = ?');
    return stmt.run(clientId);
}

function getTebligatlarByClient(clientId) {
    if (!db) init();
    const stmt = db.prepare('SELECT * FROM tebligatlar WHERE client_id = ?');
    return stmt.all(clientId);
}

function bulkSaveClients(clients) {
    if (!db) init();

    const stmt = db.prepare(`
        INSERT INTO clients (firm_name, tax_number, gib_user_code, gib_password_encrypted)
        VALUES (@firm_name, @tax_number, @gib_user_code, @encryptedPassword)
    `);

    const results = { saved: 0, errors: [] };

    for (let i = 0; i < clients.length; i++) {
        const c = clients[i];
        try {
            let encryptedPassword = null;
            if (c.gib_password && safeStorage.isEncryptionAvailable()) {
                encryptedPassword = safeStorage.encryptString(c.gib_password);
            } else if (c.gib_password) {
                throw new Error('Şifreleme sistemi kullanılamıyor.');
            }
            stmt.run({
                firm_name: c.firm_name,
                tax_number: c.tax_number || null,
                gib_user_code: c.gib_user_code || null,
                encryptedPassword,
            });
            results.saved++;
        } catch (err) {
            const msg = err.message?.includes('UNIQUE')
                ? 'Bu GİB kullanıcı kodu zaten kayıtlı'
                : err.message;
            results.errors.push({ row: i + 2, firm_name: c.firm_name, error: msg });
        }
    }

    return results;
}

function createScanHistory(scanType) {
    if (!db) init();
    const stmt = db.prepare(`
        INSERT INTO scan_history (started_at, scan_type)
        VALUES (?, ?)
    `);
    const result = stmt.run(new Date().toISOString(), scanType || 'full');
    return Number(result.lastInsertRowid);
}

function updateScanHistory(id, data) {
    if (!db) init();
    const fields = [];
    const values = {};
    for (const key of [
        'finished_at',
        'total_clients',
        'success_count',
        'error_count',
        'new_tebligat_count',
        'duration_seconds',
        'results_json',
    ]) {
        if (key in data) {
            fields.push(`${key} = @${key}`);
            values[key] = data[key];
        }
    }
    if (fields.length === 0) return;
    values.id = id;
    db.prepare(`UPDATE scan_history SET ${fields.join(', ')} WHERE id = @id`).run(values);
}

function getScanHistory(limit = 50) {
    if (!db) init();
    return db
        .prepare(
            `SELECT * FROM scan_history
             ORDER BY started_at DESC
             LIMIT ?`
        )
        .all(limit);
}

function getLastScanFailedClientIds() {
    if (!db) init();
    const latest = db
        .prepare(
            `SELECT results_json FROM scan_history
             WHERE results_json IS NOT NULL
             ORDER BY started_at DESC
             LIMIT 1`
        )
        .get();
    if (!latest || !latest.results_json) return [];
    try {
        const results = JSON.parse(latest.results_json);
        return results.filter((r) => !r.success).map((r) => r.clientId);
    } catch {
        return [];
    }
}

module.exports = {
    init,
    saveClient,
    updateClient,
    updateClientStatus,
    deleteClient,
    getClients,
    getClientPassword,
    saveTebligatlar,
    getTebligatlar,
    getTebligatById,
    updateTebligatDocument,
    updateTebligatDocumentByPath,
    updateClientScanDate,
    deleteTebligat,
    deleteTebligatlarByClient,
    getTebligatlarByClient,
    bulkSaveClients,
    createScanHistory,
    updateScanHistory,
    getScanHistory,
    getLastScanFailedClientIds,
};
