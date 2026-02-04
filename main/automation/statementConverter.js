const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const xlsx = require('xlsx');

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
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimeType.includes('sheet') || mimeType.includes('excel')) {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        fileContent = xlsx.utils.sheet_to_csv(worksheet);
    } else if (mimeType === 'text/plain') {
        fileContent = fileBuffer.toString('utf-8');
    } else {
        throw new Error('Desteklenmeyen dosya formatı.');
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
    convert
};
