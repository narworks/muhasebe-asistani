# Muhasebe Asistanı - İş Modeli ve Genişleme Raporu

Bu rapor, "Muhasebe Asistanı" projesinin sürdürülebilir bir iş modeline kavuşması, maliyet analizi ve gelecekteki genişleme fırsatları üzerine hazırlanmıştır.

## 1. Kredi Sistemi ve Maliyet Analizi

Kullanıcıların kullandığı her araç, arka planda Google Gemini API'sini kullanmaktadır. Bu servislerin bize bir maliyeti vardır. Kar elde etmek için bu maliyetin üzerinde bir fiyatlandırma yapmalıyız.

### Maliyet Hesaplaması (Tahmini)

**Model:** Google Gemini 2.0 Flash (En güncel ve uygun maliyetli model)
*   **Girdi (Input) Maliyeti:** $0.10 / 1 Milyon Token
*   **Çıktı (Output) Maliyeti:** $0.40 / 1 Milyon Token

#### A. Banka Ekstresi Dönüştürücü
Ortalama bir banka ekstresi (PDF/Excel) ve üretilen CSV çıktısı için:
*   **Girdi:** ~10.000 Token (Büyük bir ekstre için) -> $0.001
*   **Çıktı:** ~2.000 Token (CSV verisi) -> $0.0008
*   **Toplam Maliyet:** **~$0.0018 (Yaklaşık 0.06 Türk Lirası)**

#### B. E-Tebligat Sorgulama (Auto-Captcha)
Bu işlemde sadece Captcha görseli işlenmektedir.
*   **Girdi:** 1 Görsel (~258 Token) -> İhmal edilebilir maliyet.
*   **Toplam Maliyet:** **<$0.0001 (Neredeyse bedava)**

### Fiyatlandırma Stratejisi (Revize: Aylık Abonelik Modeli)

Kullanıcı alışkanlıkları ve düzenli gelir akışı için **Aylık Abonelik (SaaS)** modeli en uygun yöntemdir. Bu modelde kullanıcılara her ay yenilenen bir "İşlem Limiti" tanımlanır.

#### 1. Paket Önerileri (Aylık - Revize)

Tüm paketler her ay başı sıfırlanır ve yeni aylık ödeme ile kotalar güncellenir.

*   **Başlangıç Paketi (Freelance):**
    *   **Limit:** Aylık 150 İşlem
    *   **Fiyat:** **299 TL / Ay**
    *   **Birim İşlem Fiyatı:** ~1.99 TL
    *   **Tahmini Maliyet:** ~9 TL
    *   **Kar:** ~290 TL

*   **Profesyonel Paket (Büro):**
    *   **Limit:** Aylık 500 İşlem
    *   **Fiyat:** **499 TL / Ay**
    *   **Birim İşlem Fiyatı:** ~1.00 TL
    *   **Tahmini Maliyet:** ~30 TL
    *   **Kar:** ~469 TL

*   **Kurumsal Paket (Limitsiz*):**
    *   **Limit:** Aylık 2.500 İşlem (Adil Kullanım Kotası)
    *   **Fiyat:** **1.499 TL / Ay**
    *   **Birim İşlem Fiyatı:** ~0.60 TL
    *   **Tahmini Maliyet:** ~150 TL
    *   **Kar:** ~1.349 TL

#### 2. Yıllık Ödeme İndirimi (%20)

Yıllık peşin ödemelerde %20 indirim uygulanarak kullanıcı bağlılığı artırılabilir.

*   **Başlangıç (Yıllık):** 3.588 TL yerine **2.870 TL** (Aylık ~239 TL'ye gelir)
*   **Profesyonel (Yıllık):** 5.988 TL yerine **4.790 TL** (Aylık ~399 TL'ye gelir)
*   **Kurumsal (Yıllık):** 17.988 TL yerine **14.390 TL** (Aylık ~1.199 TL'ye gelir)

#### 2. Kötüye Kullanımı Önleme (Fair Use Policy)

"Limitsiz" veya yüksek kotalı paketlerde API maliyetlerini kontrol altında tutmak ve bot saldırılarını engellemek için şu yöntemler uygulanmalıdır:

1.  **Adil Kullanım Kotası (AKK):** "Limitsiz" paketlerde bile teknik bir üst sınır (örn: 2.500 işlem) belirlenmeli ve sözleşmede belirtilmelidir. Bu sınır aşıldığında hız düşürülür veya ek ücret talep edilir.
2.  **Hız Sınırlaması (Rate Limiting):** Bir kullanıcının dakikada yapabileceği işlem sayısı sınırlandırılmalıdır (Örn: Dakikada maksimum 5 sorgu). Bu, botların sistemi kilitlemesini engeller.
3.  **IP ve Cihaz Kontrolü:** Aynı hesabın aynı anda 10 farklı IP'den işlem yapması engellenmelidir (Şifre paylaşımını önlemek için).
4.  **Captcha Doğrulama:** Şüpheli derecede hızlı işlem yapan kullanıcılara ara ara "Ben robot değilim" doğrulaması gösterilmelidir.

---

## 2. Ödeme Sistemi Entegrasyonu

Türkiye'de SaaS (Yazılım Hizmeti) ödemeleri için Stripe doğrudan kullanılamamaktadır. Yerli ve güvenilir alternatifler şunlardır:

### A. Iyzico (Önerilen)
*   **Avantajları:** Kolay entegrasyon, abonelik sistemi desteği, güvenilir marka.
*   **Komisyon:** İşlem başına %2.99 + 0.25 TL (yaklaşık).
*   **Kullanım:** "Kredi Yükle" butonu ile Iyzico ödeme formunu açıp, başarılı ödeme sonrası `credits.json` (veya veritabanı) güncellenir.

### B. PayTR
*   **Avantajları:** Düşük komisyon oranları, ertesi gün ödeme.
*   **Kullanım:** Iyzico ile benzer mantıkta çalışır.

**Entegrasyon Planı:**
1.  Iyzico/PayTR'dan "Sanal POS" başvurusu yapılır.
2.  Backend'de `/api/payment/create` endpoint'i oluşturulur.
3.  Frontend'de kredi paketleri listelenir ve "Satın Al" butonu ödeme servisine yönlendirir.

---

## 3. Yeni Araç Önerileri

Sistemi tam kapsamlı bir "Muhasebe Asistanı"na dönüştürmek için eklenebilecek diğer araçlar:

### A. Fiş/Fatura Okuyucu (OCR)
*   **İşlev:** Kullanıcı fişin fotoğrafını çeker, yapay zeka (Gemini Vision) Tarih, Tutar, KDV, İşyeri Adı gibi bilgileri ayıklar ve Excel'e döker.
*   **Değer:** Muhasebecilerin en çok zaman harcadığı "fiş işleme" yükünü ortadan kaldırır.
*   **Maliyet:** Ekstre dönüştürücü ile benzer (~0.06 TL).

### B. SGK Borç Sorgulama
*   **İşlev:** E-Tebligat mantığıyla, SGK sistemine girip işveren borçlarını sorgular.
*   **Değer:** Düzenli yapılması gereken kritik bir kontrolü otomatize eder.

### C. Vergi Hesaplama Asistanı
*   **İşlev:** "X tutarındaki faturanın KDV dahil toplamı nedir?" veya "Yıllık gelir vergisi dilimleri nedir?" gibi soruları yanıtlayan bir sohbet botu.
*   **Değer:** Hızlı bilgi erişimi sağlar.

### D. TCMB Döviz Kuru Çekici
*   **İşlev:** Geçmiş tarihli döviz kurlarını TCMB'den otomatik çeker ve tablo olarak sunar.

---

## 4. Yol Haritası ve Öneriler

1.  **Veritabanı Geçişi:** `credits.json` dosyası basit testler için uygundur ancak gerçek para trafiği için **MongoDB** veya **PostgreSQL** gibi gerçek bir veritabanına geçilmelidir.
2.  **Güvenlik:** Ödeme işlemleri için SSL sertifikası (HTTPS) zorunludur.
3.  **Kullanıcı Paneli:** Kullanıcının satın alma geçmişini ve harcama detaylarını görebileceği bir "Cüzdan" sayfası eklenmelidir.

**Sonuç:** Proje, düşük API maliyetleri sayesinde yüksek kar potansiyeline sahiptir. Iyzico entegrasyonu ve "Fiş Okuyucu" gibi yeni araçlarla değeri katlanarak artırılabilir.
