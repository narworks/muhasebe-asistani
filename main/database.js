const Database = require('better-sqlite3');
const path = require('path');
const { app, safeStorage } = require('electron');

let db;

function init() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'local_data.db');
    console.log("Database path:", dbPath);

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
    const columns = tableInfo.map(col => col.name);

    if (!columns.includes('document_no')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN document_no TEXT');
    }
    if (!columns.includes('document_url')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN document_url TEXT');
    }
    if (!columns.includes('document_path')) {
        db.exec('ALTER TABLE tebligatlar ADD COLUMN document_path TEXT');
    }
}

function saveClient(clientData) {
    if (!db) init();

    const { firm_name, tax_number, gib_user_code, gib_password } = clientData;

    // Encrypt password
    let encryptedPassword = null;
    if (gib_password && safeStorage.isEncryptionAvailable()) {
        encryptedPassword = safeStorage.encryptString(gib_password);
    } else if (gib_password) {
        console.warn("SafeStorage not available, cannot securely save password.");
        throw new Error("Şifreleme sistemi (SafeStorage) bu sistemde kullanılamıyor.");
    }

    const stmt = db.prepare(`
    INSERT INTO clients (firm_name, tax_number, gib_user_code, gib_password_encrypted)
    VALUES (@firm_name, @tax_number, @gib_user_code, @encryptedPassword)
  `);

    return stmt.run({
        firm_name,
        tax_number,
        gib_user_code,
        encryptedPassword
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
            throw new Error("Şifreleme sistemi (SafeStorage) bu sistemde kullanılamıyor.");
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
            encryptedPassword
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
        gib_user_code
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
    const stmt = db.prepare('SELECT id, firm_name, tax_number, gib_user_code, status FROM clients');
    return stmt.all();
}

function saveTebligatlar(clientId, tebligatlar) {
    if (!db) init();
    if (!Array.isArray(tebligatlar) || tebligatlar.length === 0) return 0;

    const insert = db.prepare(`
    INSERT OR IGNORE INTO tebligatlar (client_id, tebligat_date, sender, subject, status, document_no, document_url, document_path)
    VALUES (@client_id, @tebligat_date, @sender, @subject, @status, @document_no, @document_url, @document_path)
  `);

    const insertMany = db.transaction((items) => {
        let inserted = 0;
        for (const item of items) {
            const result = insert.run({
                client_id: clientId,
                tebligat_date: item.date || null,
                sender: item.sender || null,
                subject: item.subject || null,
                status: item.status || null,
                document_no: item.documentNo || null,
                document_url: item.documentUrl || null,
                document_path: item.documentPath || null
            });
            inserted += result.changes || 0;
        }
        return inserted;
    });

    return insertMany(tebligatlar);
}

function getTebligatlar(limit = 200) {
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

// Update document path for a tebligat
function updateTebligatDocument(tebligatId, documentPath) {
    if (!db) init();
    const stmt = db.prepare('UPDATE tebligatlar SET document_path = ? WHERE id = ?');
    return stmt.run(documentPath, tebligatId);
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
    updateTebligatDocument
};
