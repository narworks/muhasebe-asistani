const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();
const pdf = require('pdf-parse');
const xlsx = require('xlsx');

const app = express();
const port = 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// --- Gemini AI Setup ---
// API anahtarının .env dosyasından yüklendiğinden emin ol
if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- API Endpoint ---
app.post('/api/convert', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Dosya yüklenmedi.' });
        }
        if (!req.body.prompt) {
             return res.status(400).json({ error: 'Dönüşüm komutu eksik.' });
        }

        const userPrompt = req.body.prompt;
        const fileBuffer = req.file.buffer;
        let fileContent = '';

        // 1. Dosya içeriğini MIME türüne göre ayrıştır
        if (req.file.mimetype === 'application/pdf') {
            const data = await pdf(fileBuffer);
            fileContent = data.text;
        } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || req.file.originalname.endsWith('.xlsx')) {
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            fileContent = xlsx.utils.sheet_to_csv(worksheet);
        } else if (req.file.mimetype === 'text/plain') {
            fileContent = fileBuffer.toString('utf-8');
        } else {
             return res.status(400).json({ error: 'Desteklenmeyen dosya formatı.' });
        }
        
        // 2. Gemini için "akıllı prompt" oluştur
        const prompt = `
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
            ${userPrompt}
            ---
            
            İstenen CSV Çıktısı:
        `;


        // 3. Gemini API'sini çağır
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
        });

        const resultText = response.text;
        // Sonucu düz metin (CSV) olarak gönder
        res.setHeader('Content-Type', 'text/plain');
        res.status(200).send(resultText);

    } catch (error) {
        console.error('API Hatası:', error);
        res.status(500).json({ error: 'Dönüştürme sırasında sunucuda bir hata oluştu.' });
    }
});

// Vercel'in sunucuyu yönetmesi için bu satırı dışa aktarıyoruz.
// Yerel geliştirme için app.listen() kullanılır.
module.exports = app;
