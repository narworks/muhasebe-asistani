# Muhasebe Asistanı - Proje Raporu

**Son Güncelleme:** 05.12.2025

## 📋 Proje Durumu
Proje, temel MVP (Minimum Viable Product) aşamasını tamamlamış ve genişleme evresine geçmiştir. Kredi sistemi entegre edilmiş, E-Tebligat özelliği eklenmiş ve gelecek özellikler için altyapı hazırlanmıştır.

## ✅ Tamamlanan Özellikler

### 1. Kredi Sistemi
*   **Altyapı:** Kullanıcı bazlı kredi takibi (`credits.json`).
*   **Entegrasyon:** Ekstre Dönüştürücü aracı artık kredi düşerek çalışıyor.
*   **UI:** Kullanıcı bakiyesi arayüzde görüntüleniyor.

### 2. E-Tebligat Kontrol
*   **Otomasyon:** GİB E-Tebligat sistemine otomatik giriş ve sorgulama.
*   **Yapay Zeka:** Captcha çözümü için Google Gemini Vision entegrasyonu.
*   **UI:** Sorgulama sonuçları tablo halinde listeleniyor.

### 3. Arayüz İyileştirmeleri
*   **Dashboard:** Yeni araç kartları ve "Yakında" (Mock) araçlar eklendi.
*   **Sidebar:** Menü yapısı güncellendi, yeni ikonlar eklendi.
*   **İstatistikler:** Kullanım ve kredi istatistikleri sayfası yenilendi.

## 🚀 Planlanan Özellikler (Yakında)
*   **Fiş/Fatura Okuyucu (OCR):** Görüntüden veri ayıklama.
*   **SGK Borç Sorgulama:** İşveren borç takibi.
*   **Vergi Asistanı:** Hesaplama ve mevzuat botu.
*   **Ödeme Sistemi:** Iyzico/PayTR entegrasyonu ile kredi satın alma.

## 💰 İş Modeli
*   **Abonelik:** Aylık yenilenen paketler (Freelance, Büro, Kurumsal).
*   **Fiyatlandırma:** 299 TL'den başlayan fiyatlar.
*   **Detaylar:** `docs/is_modeli_raporu.md` dosyasında mevcuttur.

## 🛠️ Teknik Notlar
*   **Backend:** Node.js, Express
*   **Frontend:** React, Tailwind CSS
*   **AI:** Google Gemini 2.0 Flash
*   **Veritabanı:** Şu an JSON tabanlı, ileride PostgreSQL'e geçilecek.
