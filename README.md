# 📊 Muhasebe Asistanı

**Mali Müşavirler için Yapay Zeka Destekli Otomasyon Aracı**

Muhasebe Asistanı, mali müşavirlerin günlük işlerini hızlandırmak ve otomatikleştirmek için geliştirilmiş bir Electron masaüstü uygulamasıdır.

---

## ✨ Özellikler

### 🏦 Banka Ekstresi Dönüştürücü
- PDF, Excel, resim formatlarındaki banka ekstrelerini Excel'e dönüştürür
- Google Gemini AI kullanarak akıllı veri çıkarımı
- Muhasebe yazılımlarına uyumlu format

### 📧 E-Tebligat Otomasyonu
- GIB E-Tebligat portalından otomatik tebligat taraması
- CAPTCHA çözümü (AI destekli)
- Müşteri bazlı takip ve bildirim

### 📈 İstatistikler ve Raporlama
- AI kullanım istatistikleri
- İşlem geçmişi ve raporlar

---

## 🏗️ Teknoloji Stack

### Frontend
- **React 18** + TypeScript
- **Tailwind CSS** - Modern UI framework
- **Vite** - Build tool
- **React Router** - SPA routing

### Backend / Desktop
- **Electron 31** - Cross-platform desktop app
- **Node.js** - Main process
- **Better-SQLite3** - Local database (clients, tebligatlar)

### Cloud Infrastructure
- **Supabase** - Authentication, PostgreSQL database, Edge Functions
- **Google Gemini 2.0 Flash** - AI processing (statement conversion, CAPTCHA)
- **Iyzico** - Recurring payment (subscription)

### Automation
- **Puppeteer** - GIB web scraping
- **PDF-Parse** - PDF işleme
- **XLSX** - Excel işlemleri

---

## 📦 Kurulum

### Gereksinimler
- Node.js 18+
- npm veya yarn
- Supabase hesabı ([supabase.com](https://supabase.com))
- Gemini API Key ([ai.google.dev](https://ai.google.dev))

### 1. Repository'yi Klonlayın
```bash
git clone https://github.com/your-username/muhasebe-asistani.git
cd muhasebe-asistani
```

### 2. Dependencies Yükleyin
```bash
npm install
```

### 3. Environment Variables (.env)
`.env` dosyası oluşturun ve aşağıdaki değişkenleri ekleyin:

```bash
# Gemini AI API Key
GEMINI_API_KEY=your-gemini-api-key-here

# Supabase Credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Billing Portal URL (opsiyonel)
BILLING_URL=https://muhasebeasistani.com/pricing
```

### 4. Supabase Setup
Detaylı kurulum için: [SUPABASE_SETUP.md](SUPABASE_SETUP.md)

```bash
# Supabase SQL schema'yı çalıştırın
# supabase-setup.sql dosyasını Supabase SQL Editor'de çalıştırın
```

### 5. Uygulamayı Çalıştırın
```bash
# Development mode
npm start

# Production build
npm run dist
```

---

## 🚀 Deployment

### Electron Build
```bash
npm run dist
```

Çıktılar `dist/` klasöründe:
- **Windows:** `.exe` installer
- **macOS:** `.dmg` installer
- **Linux:** `.AppImage` / `.deb`

### Supabase Edge Functions
```bash
# Supabase CLI ile deploy
supabase functions deploy create-subscription
supabase functions deploy iyzico-webhook
```

Detaylı kurulum için: [IYZICO_SETUP.md](IYZICO_SETUP.md)

---

## 📖 Dokümantasyon

- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) - Supabase kurulumu ve database schema
- [IYZICO_SETUP.md](IYZICO_SETUP.md) - Iyzico ödeme entegrasyonu
- [backend/DEPRECATED.md](backend/DEPRECATED.md) - Eski backend hakkında bilgi

---

## 🗂️ Proje Yapısı

```
muhasebe-asistani/
├── main/                       # Electron main process
│   ├── main.js                 # Ana Electron dosyası
│   ├── preload.js              # IPC bridge
│   ├── supabase.js             # Supabase client
│   ├── license.js              # Auth & subscription yönetimi
│   ├── database.js             # SQLite (local data)
│   ├── settings.js             # Encrypted settings
│   └── automation/
│       ├── gibScraper.js       # E-Tebligat scraper
│       └── statementConverter.js # Ekstré dönüştürücü
│
├── src/                        # React frontend
│   ├── components/
│   │   ├── layout/             # Navbar, Sidebar, MainLayout
│   │   ├── ui/                 # Button, Input, Card, etc.
│   │   └── SubscriptionModal.tsx
│   ├── pages/
│   │   ├── auth/               # Login, Register
│   │   ├── dashboard/          # Dashboard, Account, Statistics
│   │   └── tools/              # StatementConverter, ETebligat
│   ├── context/                # AuthContext
│   ├── types/                  # TypeScript definitions
│   └── App.tsx
│
├── supabase/
│   └── functions/              # Edge Functions
│       ├── create-subscription/
│       └── iyzico-webhook/
│
├── backend/                    # ⚠️ DEPRECATED (Faz 2'de kullanılıyordu)
├── supabase-setup.sql          # Supabase database schema
├── .env                        # Environment variables (gitignore'da)
└── package.json
```

---

## 🔐 Güvenlik

- ✅ Supabase Row Level Security (RLS) aktif
- ✅ Electron safeStorage ile token şifreleme
- ✅ IPC contextIsolation enabled
- ✅ API keys environment variables'da
- ✅ `.env` dosyası `.gitignore`'da

---

## 📊 İş Modeli

### Abonelik Planı
- **Plan:** Muhasebe Asistanı Pro
- **Fiyat:** 499 TL/Ay
- **Özellikler:** Sınırsız ekstré dönüştürme, sınırsız e-tebligat taraması, AI destekli işlemler

### Maliyet Analizi (500 Kullanıcı)
| Kalem | Aylık Maliyet |
|-------|---------------|
| Supabase Pro | 25 USD (~940 TL) |
| Gemini API (500 kullanıcı × 100 işlem/ay) | ~212 USD (~7,970 TL) |
| Iyzico Komisyonu (499 TL × 500 × %2.9) | ~7,240 TL |
| **Toplam Maliyet** | **~16,150 TL** |
| **Gelir (500 × 499 TL)** | **249,500 TL** |
| **Kar Marjı** | **~93.5%** |

---

## 🛠️ Geliştirme

### Scripts
```bash
npm run dev          # Vite dev server (frontend)
npm run electron:dev # Electron development mode
npm start            # Hem frontend hem Electron
npm run build        # Production build
npm run dist         # Electron installer oluştur
```

### Tech Debt & TODO
- [ ] `axios` dependency'sini kaldır (artık Supabase kullanıyoruz)
- [ ] `keytar` dependency'sini kaldır (Electron safeStorage kullanıyoruz)
- [ ] Gemini 2.0 Flash → 2.5 Flash-Lite migration (2026 Mart öncesi)
- [ ] E2E test suite ekle
- [ ] CI/CD pipeline (GitHub Actions)

---

## 📝 Lisans

MIT License - Copyright (c) 2024 NarWorks

---

## 🤝 Katkıda Bulunma

Pull request'ler memnuniyetle karşılanır. Büyük değişiklikler için lütfen önce bir issue açın.

---

## 📧 İletişim

- **Email:** support@muhasebeasistani.com
- **Website:** https://muhasebeasistani.com
- **GitHub Issues:** [Issues](https://github.com/your-username/muhasebe-asistani/issues)

---

**Made with ❤️ by NarWorks**
