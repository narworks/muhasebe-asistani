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

// --- API Endpoint ---
app.post('/api/convert', upload.single('file'), async (req, res) => {
    // CRITICAL FIX: Initialize Gemini AI on-demand for each request.
    // This prevents the server from crashing on startup if the API key isn't immediately available.
    // The API_KEY is injected into the environment by Vercel/AI Studio only after the user selects it.
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set at the time of request.");
        // Use status 401 to indicate an authentication/authorization issue.
        return res.status(401).json({ error: 'Sunucuda API anahtarı bulunamadı. Lütfen tekrar seçmeyi deneyin.' });
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
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

        // 1. Parse file content based on MIME type
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
        
        // 2. Create a smart prompt for Gemini
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


        // 3. Call the Gemini API
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
        });

        const resultText = response.text;
        // Send the result as plain text (CSV)
        res.setHeader('Content-Type', 'text/plain');
        res.status(200).send(resultText);

    } catch (error) {
        console.error('API Hatası:', error);
        res.status(500).json({ error: 'Dönüştürme sırasında sunucuda bir hata oluştu.' });
    }
});

// For Vercel to manage the server, we export the app.
// For local development, app.listen() would be used.
module.exports = app;