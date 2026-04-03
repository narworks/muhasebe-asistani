const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const ExcelJS = require('exceljs');

// Note: API anahtarı kullanıcıdan alınır ve güvenli şekilde saklanır.

async function convert(fileBuffer, mimeType, prompt, apiKey) {
    if (!apiKey) {
        throw new Error('API anahtarı bulunamadı.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    let fileContent = '';

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
        const worksheet = workbook.worksheets[0];
        const rows = [];
        worksheet.eachRow((row) => {
            rows.push(
                row.values
                    .slice(1)
                    .map((v) => (v != null ? String(v) : ''))
                    .join(',')
            );
        });
        fileContent = rows.join('\n');
    } else if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType.includes('csv')) {
        fileContent = fileBuffer.toString('utf-8');
    } else {
        // Last resort: try xlsx parse, fall back to text
        try {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(fileBuffer);
            const worksheet = workbook.worksheets[0];
            const rows = [];
            worksheet.eachRow((row) => {
                rows.push(
                    row.values
                        .slice(1)
                        .map((v) => (v != null ? String(v) : ''))
                        .join(',')
                );
            });
            fileContent = rows.join('\n');
        } catch {
            // Not xlsx either — try as plain text
            fileContent = fileBuffer.toString('utf-8');
        }
    }

    // 2. Create a smart prompt for Gemini
    const systemPrompt = `
      Sen bir veri dönüştürme uzmanı yapay zekasın. Sana verilen bir dosya içeriğini ve kullanıcı isteğini analiz ederek, istenen dönüşümü gerçekleştirmeli ve sonucu CSV formatında sunmalısın.

      ÖNEMLİ KURALLAR:
      1.  Çıktın SADECE ve SADECE geçerli bir CSV formatında olmalıdır.
      2.  CSV çıktısı dışında KESİNLİKLE hiçbir açıklama, selamlama, not veya ek metin ekleme. ("İşte istediğiniz CSV:" gibi ifadeler kullanma.)
      3.  Sonucun ilk satırı, kullanıcı isteğine uygun olarak oluşturduğun başlık (header) satırı olmalıdır.

      İşlenecek Ham Dosya İçeriği (ilk 8000 karakter):
      ---
      ${fileContent.substring(0, 8000)}
      ---

      Kullanıcının Yapılmasını İstediği Dönüşüm:
      ---
      ${prompt}
      ---

      İstenen CSV Çıktısı:
  `;

    // 3. Call the Gemini API
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;

    return response.text();
}

module.exports = {
    convert,
};
