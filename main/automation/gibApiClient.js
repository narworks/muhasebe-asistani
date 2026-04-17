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
async function listTebligatlar(
    apiClient,
    { pageNo = 1, pageSize = 100, arsivDurum = null, sortDesc = false } = {}
) {
    const filters = [];
    if (arsivDurum !== null) {
        filters.push({ fieldName: 'arsivDurum', values: [String(arsivDurum)] });
    }

    const resp = await apiClient.post('/etebligat/etebligat/tebligat-listele', {
        meta: {
            pagination: { pageNo, pageSize },
            sortFieldName: 'id',
            sortType: sortDesc ? 'DESC' : 'ASC',
            filters,
        },
    });

    return resp.data;
}

/**
 * Parse GIB date string to timestamp. Supports:
 * - DD/MM/YYYY (HH:MM)
 * - ISO 8601
 * Returns null if unparseable.
 */
function parseGibDate(dateStr) {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
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
 * Fetch all tebligatlar across pages.
 * If sinceDate is provided, uses DESC sort + early termination: stops paging
 * once items older than sinceDate appear. Older items are dropped.
 */
async function fetchAllTebligatlar(apiClient, { arsivDurum = null, sinceDate = null } = {}) {
    const PAGE_SIZE = 1000;
    const cutoff = sinceDate ? parseGibDate(sinceDate) || new Date(sinceDate).getTime() : null;
    const useIncremental = cutoff !== null;
    let pageNo = 1;
    const allItems = [];

    for (;;) {
        const result = await listTebligatlar(apiClient, {
            pageNo,
            pageSize: PAGE_SIZE,
            arsivDurum,
            sortDesc: useIncremental,
        });
        const items = result.data?.tebligatDtoList || [];

        if (useIncremental) {
            let sawOlder = false;
            for (const dto of items) {
                const t = parseGibDate(dto.tebligZamani || dto.gonderimZamani);
                if (t !== null && t < cutoff) {
                    sawOlder = true;
                    break;
                }
                allItems.push(dto);
            }
            if (sawOlder) break;
        } else {
            allItems.push(...items);
        }

        const totalCount = result.data?.count || 0;
        if (allItems.length >= totalCount || items.length < PAGE_SIZE) break;
        pageNo++;
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
        date: dto.tebligZamani || dto.gonderimZamani || '',
        sendDate: dto.gonderimZamani || '',
        notificationDate: dto.tebligZamani || '',
        readDate: dto.mukellefOkumaZamani || '',
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
};
