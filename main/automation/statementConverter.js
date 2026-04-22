const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const ExcelJS = require('exceljs');
const { withTimeout } = require('./withTimeout');
const aiProxy = require('./aiProxy');
const logger = require('../logger');

const MAX_CELLS = 50000;
const MAX_CONTENT_CHARS = 500000; // 500K karakter — Gemini 2.0 Flash 1M token destekler
// Statement conversion Gemini call timeout: prompt can be up to 500K chars
// (tens of pages of bank data), output CSV can be large. 2 minutes is a
// reasonable upper bound — beyond that we'd rather fail visibly than hang.
const GEMINI_STATEMENT_TIMEOUT_MS = 120_000;

// Hücre değerini Türkçe muhasebe formatında string'e çevir
function formatCellValue(cell) {
    if (cell.value === null || cell.value === undefined) return '';

    // Formüllü hücre — hesaplanmış sonucu al
    if (cell.type === ExcelJS.ValueType.Formula) {
        if (cell.result instanceof Date) {
            return formatDate(cell.result);
        }
        if (typeof cell.result === 'number') {
            return formatNumber(cell.result, cell.numFmt);
        }
        return cell.result != null ? String(cell.result) : '';
    }

    // Tarih hücresi
    if (cell.value instanceof Date) {
        return formatDate(cell.value);
    }

    // Sayı hücresi — Türkçe formatla
    if (typeof cell.value === 'number') {
        return formatNumber(cell.value, cell.numFmt);
    }

    // RichText
    if (cell.value && typeof cell.value === 'object' && cell.value.richText) {
        return cell.value.richText.map((part) => part.text || '').join('');
    }

    // Hyperlink
    if (cell.value && typeof cell.value === 'object' && cell.value.hyperlink) {
        return cell.value.text || cell.value.hyperlink || '';
    }

    return String(cell.value);
}

function formatDate(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function formatNumber(val, numFmt) {
    // Para/ondalık formatı varsa 2 basamak
    if (
        numFmt &&
        (numFmt.includes('#') ||
            numFmt.includes('0.00') ||
            numFmt.includes('₺') ||
            numFmt.includes('TL'))
    ) {
        return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    // Tam sayı ise ondalık ekleme
    if (Number.isInteger(val)) return String(val);
    // Ondalıklı sayı — 2 basamak Türkçe format
    return val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Bir worksheet'i TAB-separated string'e çevir
function worksheetToText(worksheet) {
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
        const cells = [];
        const colCount = row.cellCount;
        for (let col = 1; col <= colCount; col++) {
            const cell = row.getCell(col);
            cells.push(formatCellValue(cell));
        }
        rows.push(cells.join('\t'));
    });
    return rows.join('\n');
}

async function convert(fileBuffer, mimeType, prompt, apiKey) {
    if (!apiKey) {
        throw new Error('API anahtarı bulunamadı.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    let fileContent = '';
    let sheetCount = 1;

    // 1. Parse file content based on MIME type
    if (mimeType === 'application/pdf') {
        const data = await pdf(fileBuffer);
        fileContent = data.text;
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        mimeType.includes('sheet') ||
        mimeType.includes('excel') ||
        mimeType.includes('xlsx')
    ) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(fileBuffer);

        // Toplam hücre sayısı kontrolü (tüm sheet'ler)
        let totalCells = 0;
        for (const ws of workbook.worksheets) {
            totalCells += ws.rowCount * ws.columnCount;
        }
        if (totalCells > MAX_CELLS) {
            throw new Error(
                `Bu dosya çok büyük (${totalCells.toLocaleString('tr-TR')} hücre). Maksimum ${MAX_CELLS.toLocaleString('tr-TR')} hücre işlenebilir. Dosyanızı bölerek tekrar deneyin.`
            );
        }

        sheetCount = workbook.worksheets.length;
        const allParts = [];
        for (const ws of workbook.worksheets) {
            if (ws.rowCount === 0) continue;
            if (sheetCount > 1) {
                allParts.push(`--- Sayfa: ${ws.name} ---`);
            }
            allParts.push(worksheetToText(ws));
        }
        fileContent = allParts.join('\n');
    } else if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType.includes('csv')) {
        fileContent = fileBuffer.toString('utf-8');
    } else {
        // Last resort: try xlsx parse, fall back to text
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(fileBuffer);

            let totalCells = 0;
            for (const ws of workbook.worksheets) {
                totalCells += ws.rowCount * ws.columnCount;
            }
            if (totalCells > MAX_CELLS) {
                throw new Error(
                    `Bu dosya çok büyük (${totalCells.toLocaleString('tr-TR')} hücre). Maksimum ${MAX_CELLS.toLocaleString('tr-TR')} hücre işlenebilir.`
                );
            }

            sheetCount = workbook.worksheets.length;
            const allParts = [];
            for (const ws of workbook.worksheets) {
                if (ws.rowCount === 0) continue;
                if (sheetCount > 1) {
                    allParts.push(`--- Sayfa: ${ws.name} ---`);
                }
                allParts.push(worksheetToText(ws));
            }
            fileContent = allParts.join('\n');
        } catch (err) {
            if (err.message?.includes('hücre')) throw err;
            fileContent = fileBuffer.toString('utf-8');
        }
    }

    // İçerik çok büyükse kırp (Gemini token limiti için güvenlik payı)
    if (fileContent.length > MAX_CONTENT_CHARS) {
        fileContent =
            fileContent.substring(0, MAX_CONTENT_CHARS) +
            '\n\n[... dosyanın geri kalanı çok büyük olduğu için kesildi]';
    }

    // 2. Muhasebe odaklı prompt
    const multiSheetNote =
        sheetCount > 1
            ? '\nDOSYA BİRDEN FAZLA SAYFA İÇERİYOR. Her sayfanın başında "--- Sayfa: [isim] ---" satırı ile ayrılmıştır. Tüm sayfaları işle.'
            : '';

    const systemPrompt = `Sen bir muhasebe veri dönüştürme motorusun. Girdi olarak verilen dosya içeriğini kullanıcının talimatına göre BİREBİR dönüştür.

KESİN KURALLAR — İSTİSNASIZ UYULMALI:
1. Çıktın YALNIZCA CSV formatında olmalıdır. Başka HİÇBİR metin, açıklama, yorum, selamlama veya not YAZMA.
2. CSV başlığı (header) ilk satır olmalıdır.
3. SAYI FORMATI: Para tutarlarını AYNEN koru. Girdide "1.234,56" ise çıktıda da "1.234,56" yaz. Format değiştirme, yuvarlama.
4. TARİH FORMATI: Tarihleri GG.AA.YYYY formatında yaz (örnek: 15.03.2026).
5. YORUM YAPMA: "İşte sonuç", "Not:", "Açıklama:", "csv" kod bloğu işaretleri gibi HİÇBİR ek metin ekleme.
6. EKSİK VERİ: Boş hücreleri boş bırak, tahmin etme, doldurma, varsayılan değer atama.
7. SATIR SAYISI: Girdideki TÜM veri satırlarını işle, hiçbirini atlama veya özetleme.
8. CSV DELİMİTER: Sütun ayracı olarak noktalı virgül (;) kullan.
9. Tırnak içindeki değerlerde noktalı virgül varsa o değeri çift tırnak içine al.
10. Markdown kod bloğu (\`\`\`) KULLANMA. Düz CSV metni yaz.
${multiSheetNote}

İŞLENECEK DOSYA İÇERİĞİ:
---
${fileContent}
---

KULLANICININ TALİMATI:
---
${prompt}
---

CSV ÇIKTISI:
`;

    // 3. Call the Gemini API. Proxy-first: landing backend üzerinden
    //    (API key bundle exposure engellemek için). Proxy fail durumunda
    //    direkt Gemini SDK fallback. Proxy tarafı zaten markdown trim
    //    yapıyor, direct path'te kendimiz temizleriz.
    if (aiProxy.isProxyEnabled()) {
        try {
            const csv = await aiProxy.convertStatement(systemPrompt);
            return csv;
        } catch (err) {
            if (err.status === 429) {
                // Rate limit proxy'de — direct path da aynı quota'dan düşer,
                // daha iyi bir hata vermek için throw et.
                throw err;
            }
            logger.debug(
                `[Statement] Proxy fail (${err.code}), falling back to direct Gemini: ${err.message}`
            );
            // fall through to direct path
        }
    }

    // Direct Gemini — grace period için. Sunset edilecek.
    const result = await withTimeout(
        model.generateContent(systemPrompt),
        GEMINI_STATEMENT_TIMEOUT_MS,
        'Gemini Statement'
    );
    const response = await result.response;
    let text = response.text();

    // Gemini bazen markdown kod bloğu ile sarar — temizle
    text = text
        .replace(/^```(?:csv)?\s*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();

    return text;
}

module.exports = {
    convert,
};
