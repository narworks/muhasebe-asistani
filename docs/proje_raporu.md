# Muhasebe Asistanı - Proje Raporu

**Son Güncelleme:** 05.12.2025

## 📋 Proje Durumu
Proje büyük bir mimari değişikliğe uğrayarak **Cloud SaaS** modelinden **Hibrit Electron.js Masaüstü** uygulamasına evrilmiştir. Bu değişiklik, veri güvenliği (Zero-Knowledge) ve yerel çalışma performansı için yapılmıştır.

## ✅ Tamamlanan Özellikler

### 1. Mimari Dönüşüm (Electron.js)
*   **Masaüstü Uygulaması:** Web tabanlı yapı Electron ile masaüstüne taşındı.
*   **Yerel Veritabanı:** `better-sqlite3` ile veriler kullanıcının cihazında saklanıyor.
*   **Güvenlik:** `safeStorage` (Electron API) ile Mükellef şifreleri yerel olarak şifreleniyor.
*   **SaaS Lisanslama:** Bulut ile sadece lisans kontrolü için haberleşiliyor.

### 2. Kredi Sistemi
*   **Altyapı:** Kullanıcı bazlı kredi takibi yerel ve bulut senkronizasyonu ile çalışıyor.
*   **Entegrasyon:** Ekstre Dönüştürücü aracı kredi kontrolü ile çalışıyor.

### 3. E-Tebligat Otomasyonu
*   **Yerel Bot:** GİB sorgulamaları artık sunucuda değil, kullanıcının bilgisayarında (yerel IP) çalışıyor.
*   **Görsel Arayüz:** Otomatik tarama loglarını gösteren yeni arayüz eklendi.
*   **Yapay Zeka:** Captcha çözümü Gemini API ile devam ediyor.

### 4. Ekstre Dönüştürücü
*   **IPC Entegrasyonu:** React arayüzü, dosya işleme için Electron Main Process ile güvenli iletişim kuruyor.
*   **AI Desteği:** Banka ekstreleri Gemini ile analiz edilip CSV'ye dönüştürülüyor.

### 5. Arayüz İyileştirmeleri
*   **Login Yönlendirmesi:** Kayıt işlemleri web sitesine yönlendiriliyor.
*   **Yönetici Paneli:** Masaüstü versiyonunda devre dışı bırakıldı (Web'den yönetilecek).

## 🚀 Planlanan Özellikler (Yakında)
*   **Fiş/Fatura Okuyucu (OCR):** Görüntüden veri ayıklama.
*   **SGK Borç Sorgulama:** İşveren borç takibi.
*   **Vergi Asistanı:** Hesaplama ve mevzuat botu.
*   **Otomatik Güncelleme:** `electron-updater` ile uzaktan güncelleme.

## 💰 İş Modeli
*   **Abonelik:** Aylık yenilenen paketler (Freelance, Büro, Kurumsal).
*   **Veri Gizliliği:** "Veri Sende, Lisans Bulutta" prensibi.

## 🛠️ Teknik Notlar
*   **Framework:** Electron.js + React + Vite
*   **Backend:** Node.js (Electron Main Process)
*   **Veritabanı:** SQLite (Yerel), JSON (SaaS Mock)
*   **AI:** Google Gemini 1.5 Flash
*   **Bot:** Puppeteer / Axios
