const axios = require('axios');
const fs = require('fs');
const path = require('path');
const GIB_API_BASE = 'https://dijital.gib.gov.tr/apigateway';
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Create an axios client with GİB API auth headers
function createApiClient(token) {
    return axios.create({
        baseURL: GIB_API_BASE,
        headers: {
            Authorization: `Bearer ${token}`,
            'ui-client': 'fe',
            'page-name': 'e-tebligat',
            referer: 'https://dijital.gib.gov.tr/',
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
            'user-agent': USER_AGENT,
        },
        timeout: 30000,
    });
}

// POST /etebligat/etebligat/tebligat-listele
async function listTebligatlar(apiClient, { pageNo = 1, pageSize = 100, arsivDurum = null } = {}) {
    const filters = [];
    if (arsivDurum !== null) {
        filters.push({ fieldName: 'arsivDurum', values: [String(arsivDurum)] });
    }

    const resp = await apiClient.post('/etebligat/etebligat/tebligat-listele', {
        meta: {
            pagination: { pageNo, pageSize },
            sortFieldName: 'id',
            sortType: 'ASC',
            filters,
        },
    });

    return resp.data;
}

/**
 * Parse GIB date string to timestamp. Supports:
 * - DD/MM/YYYY (HH:MM)
 * - DD.MM.YYYY (HH:MM)
 * - ISO 8601
 * Returns null if unparseable.
 */
function parseGibDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    const m = s.match(/^(\d{2})[./](\d{2})[./](\d{4})(?:[\sT](\d{1,2}):(\d{2}))?/);
    if (m) {
        return new Date(
            Number(m[3]),
            Number(m[2]) - 1,
            Number(m[1]),
            Number(m[4] || 0),
            Number(m[5] || 0)
        ).getTime();
    }
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? null : t;
}

/**
 * Convert a GIB-format date string to ISO 8601 for DB storage.
 * Returns empty string if input is falsy or unparseable — callers expect empty string, not null.
 */
function toIsoFromGib(dateStr) {
    if (!dateStr) return '';
    const t = parseGibDate(dateStr);
    if (t === null) return '';
    return new Date(t).toISOString();
}

/**
 * Fetch all tebligatlar across pages with ASC sort (GIB-native).
 * If sinceDate is provided, items older than that date are filtered out locally
 * after fetching. Pagination continues until all items fetched or totalCount reached.
 *
 * Resilience:
 * - Per-page transient errors (timeout, 5xx, network flake) retry once with 2s
 *   backoff; a second failure returns partial results rather than throwing. For
 *   accounts with 1000+ tebligat, failing on page 7/10 and losing the 6000+
 *   already-fetched items is worse than accepting a partial fetch and flagging.
 * - Max page safety cap: 50 pages × 1000 = 50k items. GIB in practice tops out
 *   well below this; the cap exists to prevent a malformed `count` response
 *   from producing an infinite loop.
 * - Callers can detect partial fetches via the `partial` flag on the return
 *   object (future: expose this; currently silent — logged but fetch continues).
 */
async function fetchAllTebligatlar(apiClient, { arsivDurum = null, sinceDate = null } = {}) {
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 50; // hard safety cap — 50k items is >> any real account
    const cutoff = sinceDate ? parseGibDate(sinceDate) || new Date(sinceDate).getTime() : null;
    let pageNo = 1;
    const allItems = [];

    while (pageNo <= MAX_PAGES) {
        let result;
        try {
            result = await listTebligatlar(apiClient, {
                pageNo,
                pageSize: PAGE_SIZE,
                arsivDurum,
            });
        } catch (err) {
            // Retry once for transient errors. If the retry also fails, break
            // with partial results rather than losing everything fetched so far.
            const isTransient =
                err.code === 'ECONNABORTED' ||
                err.code === 'ECONNRESET' ||
                err.code === 'ETIMEDOUT' ||
                err.message?.includes('timeout') ||
                (err.response?.status >= 500 && err.response?.status < 600);
            if (!isTransient) throw err;
            try {
                await new Promise((r) => setTimeout(r, 2000));
                result = await listTebligatlar(apiClient, {
                    pageNo,
                    pageSize: PAGE_SIZE,
                    arsivDurum,
                });
            } catch (retryErr) {
                // Partial fetch: log and return what we have. Caller sees a list
                // shorter than GIB's true count; downstream logic (skippedExisting
                // dedup, scanSingleClient save) handles it naturally.
                try {
                    require('../logger').warn(
                        `[fetchAllTebligatlar] Page ${pageNo} failed after retry, returning partial (${allItems.length} items): ${retryErr.message}`
                    );
                } catch {
                    /* logger not available */
                }
                break;
            }
        }

        const items = result.data?.tebligatDtoList || [];
        allItems.push(...items);

        const totalCount = result.data?.count || 0;
        if (allItems.length >= totalCount || items.length < PAGE_SIZE) break;
        pageNo++;
    }

    if (pageNo > MAX_PAGES) {
        try {
            require('../logger').warn(
                `[fetchAllTebligatlar] Hit MAX_PAGES=${MAX_PAGES} cap; items=${allItems.length}. Possible malformed count from GIB.`
            );
        } catch {
            /* logger not available */
        }
    }

    // Local filter by date if sinceDate provided
    if (cutoff !== null) {
        return allItems.filter((dto) => {
            const t = parseGibDate(dto.tebligZamani || dto.gonderimZamani);
            if (t === null) return true; // keep if date unparseable (safer)
            return t >= cutoff;
        });
    }

    return allItems;
}

// POST /etebligat/etebligat/belge-ek-listele — get document file info
async function getDocumentFiles(apiClient, tebligId, tebligSecureId) {
    const resp = await apiClient.post('/etebligat/etebligat/belge-ek-listele', {
        tebligId,
        tebligSecureId,
    });
    return resp.data;
}

// POST /etebligat/etebligat/belge-getir — get download link
async function getDocumentLink(apiClient, params) {
    const resp = await apiClient.post('/etebligat/etebligat/belge-getir', {
        data: params,
    });
    return resp.data;
}

// GET report/download?uuid=... — download actual file
async function downloadFile(reportLink, filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const response = await axios({
        method: 'GET',
        url: reportLink,
        responseType: 'arraybuffer',
        headers: {
            referer: 'https://dijital.gib.gov.tr/',
            'user-agent': USER_AGENT,
        },
        timeout: 60000,
    });

    // Only save if we got meaningful content (>1KB to skip empty/template PDFs)
    if (response.data.length > 1000) {
        fs.writeFileSync(filePath, response.data);
        return filePath;
    }

    return null;
}

// Extract PDF from .imz (PKCS#7 signed envelope containing PDF)
function extractPdfFromImz(imzPath) {
    const data = fs.readFileSync(imzPath);
    const pdfStart = data.indexOf(Buffer.from('%PDF'));
    if (pdfStart < 0) return null;

    // Find last %%EOF marker
    const eofMarker = Buffer.from('%%EOF');
    let pdfEnd = -1;
    let searchFrom = data.length - 1;
    while (searchFrom > pdfStart) {
        const idx = data.lastIndexOf(eofMarker, searchFrom);
        if (idx > pdfStart) {
            pdfEnd = idx + eofMarker.length;
            break;
        }
        searchFrom = idx - 1;
    }
    if (pdfEnd < 0) return null;

    const pdfData = data.subarray(pdfStart, pdfEnd);
    const pdfPath = imzPath.replace(/\.imz$/i, '.pdf');
    fs.writeFileSync(pdfPath, pdfData);
    return pdfPath;
}

// Full download chain: belge-ek-listele → belge-getir → download
async function downloadDocument(apiClient, tebligat, filePath) {
    // Step 1: Get document file info
    const fileInfo = await getDocumentFiles(apiClient, tebligat.tebligId, tebligat.tebligSecureId);
    if (!fileInfo.tebligBelge) {
        throw new Error('Belge dosya bilgisi bulunamad\u0131 (belge-ek-listele bo\u015f)');
    }

    const belge = fileInfo.tebligBelge;

    // Step 2: Get download link
    const linkResult = await getDocumentLink(apiClient, {
        id: belge.id,
        secureId: belge.secureId,
        belgeTip: belge.belgeTip,
        tarafId: tebligat.tarafId,
        tarafSecureId: tebligat.tarafSecureId,
        uzanti: belge.uzanti,
        belgeAdi: belge.adi,
    });

    if (!linkResult.reportLink) {
        throw new Error('\u0130ndirme linki al\u0131namad\u0131 (belge-getir bo\u015f)');
    }

    // Step 3: Download — adjust extension based on actual file type
    const ext = belge.uzanti || 'pdf';
    const actualPath = filePath.replace(/\.[^.]+$/, `.${ext}`);
    const savedPath = await downloadFile(linkResult.reportLink, actualPath);

    if (!savedPath) {
        throw new Error('Dosya indirilemedi veya \u00e7ok k\u00fc\u00e7\u00fck (bozuk)');
    }

    // Step 4: If .imz, extract the embedded PDF for easy viewing
    if (ext === 'imz') {
        const pdfPath = extractPdfFromImz(savedPath);
        if (pdfPath) return pdfPath; // Return .pdf path for DB storage
    }

    return savedPath;
}

// Map GİB API DTO → our internal tebligat format (matches saveTebligatlar expectations)
function mapTebligatDto(dto) {
    return {
        sender: dto.kurumAciklama || 'GİB',
        subUnit: dto.altKurum || '',
        documentType: dto.belgeTuruAciklama || '',
        subject: `${dto.belgeTuruAciklama || ''} - ${dto.altKurum || ''}`.trim() || 'Tebligat',
        documentNo: dto.belgeNo || '',
        status: dto.mukellefOkumaZamani ? 'Okunmuş' : 'Okunmamış',
        date: toIsoFromGib(dto.tebligZamani || dto.gonderimZamani),
        sendDate: toIsoFromGib(dto.gonderimZamani),
        notificationDate: toIsoFromGib(dto.tebligZamani),
        readDate: toIsoFromGib(dto.mukellefOkumaZamani),
        documentUrl: null,
        documentPath: null,
        // GİB identifiers for document download chain
        tarafId: dto.tarafId,
        tarafSecureId: dto.tarafSecureId,
        tebligId: dto.tebligId,
        tebligSecureId: dto.tebligSecureId,
    };
}

module.exports = {
    createApiClient,
    listTebligatlar,
    fetchAllTebligatlar,
    getDocumentFiles,
    getDocumentLink,
    downloadFile,
    downloadDocument,
    extractPdfFromImz,
    mapTebligatDto,
    parseGibDate,
    toIsoFromGib,
};
