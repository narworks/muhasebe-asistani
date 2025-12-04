const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();
const pdf = require('pdf-parse');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const CREDITS_FILE = path.join(__dirname, 'data', 'credits.json');

// Helper to get credits
const getCredits = () => {
    try {
        if (!fs.existsSync(CREDITS_FILE)) return {};
        const data = fs.readFileSync(CREDITS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading credits:', error);
        return {};
    }
};

// Helper to update credits
const updateCredits = (userId, amount) => {
    const credits = getCredits();
    credits[userId] = (credits[userId] || 0) + amount;
    fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
    return credits[userId];
};

const app = express();
const port = 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// --- API Endpoint ---
app.post('/api/convert', upload.single('file'), async (req, res) => {
    try {
        const userId = req.body.userId;
        if (!userId) {
            return res.status(400).json({ error: 'Kullanıcı kimliği bulunamadı.' });
        }

        const credits = getCredits();
        const userBalance = credits[userId] || 0;

        if (userBalance < 1) {
            return res.status(403).json({ error: 'Yetersiz kredi. Lütfen kredi yükleyin.' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Sunucu API anahtarı yapılandırılmamış.' });
        }

        const ai = new GoogleGenAI({ apiKey });

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

        // Deduct credit on success
        updateCredits(userId, -1);


    } catch (error) {
        console.error('API Hatası:', error);
        // Provide a more specific error if it's an API key issue
        if (error.message && (error.message.includes('API key not valid') || error.message.includes('API_KEY_INVALID'))) {
            return res.status(401).json({ error: 'Geçersiz Gemini API anahtarı. Lütfen kontrol edip tekrar deneyin.' });
        }
        res.status(500).json({ error: 'Dönüştürme sırasında sunucuda bir hata oluştu.' });
    }
});

// For Vercel to manage the server, we export the app.
// For local development, app.listen() would be used.
const gibService = require('./services/gibService');

// --- Credit Endpoints ---
app.get('/api/credits/:userId', (req, res) => {
    const credits = getCredits();
    const balance = credits[req.params.userId] || 0;
    res.json({ balance });
});

// --- GIB E-Tebligat Endpoints ---

app.get('/api/gib/init', async (req, res) => {
    try {
        const result = await gibService.initSession();
        res.json(result);
    } catch (error) {
        console.error('GIB Init Error:', error);
        res.status(500).json({ error: 'GIB oturumu başlatılamadı.' });
    }
});

app.post('/api/gib/check', async (req, res) => {
    try {
        const { sessionId, username, password, captcha } = req.body;
        if (!sessionId || !username || !password) {
            return res.status(400).json({ error: 'Eksik bilgiler.' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        const data = await gibService.loginAndFetch(sessionId, username, password, captcha, apiKey);
        res.json({ success: true, data });
    } catch (error) {
        console.error('GIB Check Error:', error);
        res.status(500).json({ error: error.message || 'Sorgulama başarısız.' });
    }
});

// Start server if running directly
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Backend server running on port ${port}`);
    });
}

module.exports = app;