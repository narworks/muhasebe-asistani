# 💳 Iyzico Entegrasyonu Kurulum Rehberi

Bu rehber, Muhasebe Asistanı uygulamasının Iyzico tekrarlayan ödeme (subscription) entegrasyonunu tamamlamak için gereken adımları içerir.

## 📋 Ön Koşullar

- [ ] Iyzico hesabı ([iyzico.com](https://www.iyzico.com))
- [ ] Supabase projesi kurulu ve çalışıyor
- [ ] Supabase CLI kurulu (`npm install -g supabase`)

---

## 1️⃣ Iyzico Hesabı ve Sub-Merchant Oluşturma

### 1.1 Iyzico Hesabına Giriş
1. [Iyzico Dashboard](https://merchant.iyzipay.com)'a giriş yapın
2. Mevcut hesabınız varsa (portfoymax.com için), **yeni bir alt üye işyeri (sub-merchant)** oluşturacağız

### 1.2 Yeni Sub-Merchant Oluşturma
1. Dashboard → **Alt Üye İşyerleri** sekmesine gidin
2. **"Yeni Alt Üye İşyeri Ekle"** butonuna tıklayın
3. Bilgileri girin:
   - **İşyeri Adı:** Muhasebe Asistanı
   - **Vergi Numarası:** (şirket vergi numarası)
   - **IBAN:** (ödeme alacağınız banka hesabı)
   - **İletişim Bilgileri:** support@muhasebeasistani.com
4. **Kaydet**

⚠️ **Önemli:** Sub-merchant approval süreci 1-3 iş günü sürebilir.

---

## 2️⃣ API Credentials Alma

### 2.1 API ve Secret Key
1. Dashboard → **Ayarlar → API Anahtarları** sekmesine gidin
2. **Sandbox** (test) veya **Production** (canlı) seçin
3. Aşağıdaki değerleri kopyalayın:

```
API Key: sandbox-xxx... (veya canlı ortam için üretim key)
Secret Key: sandbox-yyy... (veya canlı ortam için üretim secret)
```

### 2.2 .env Dosyasına Ekleyin
Projenin root dizinindeki `.env` dosyasını açın ve ekleyin:

```bash
# Iyzico Credentials
IYZICO_API_KEY=sandbox-xxx...
IYZICO_SECRET_KEY=sandbox-yyy...
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com  # Production: https://api.iyzipay.com
```

---

## 3️⃣ Pricing Plan (Fiyatlandırma Planı) Oluşturma

### 3.1 Dashboard'da Plan Oluşturma
1. Dashboard → **Abonelik Yönetimi → Fiyatlandırma Planları** sekmesine gidin
2. **"Yeni Plan Oluştur"** butonuna tıklayın
3. Plan bilgilerini girin:

| Alan | Değer |
|------|-------|
| **Plan Adı** | Muhasebe Asistanı Pro |
| **Plan Kodu** | `muhasebe-pro-monthly` |
| **Açıklama** | Tüm araçlara sınırsız erişim - Aylık abonelik |
| **Fiyat** | 499 TL |
| **Para Birimi** | TRY |
| **Faturalama Periyodu** | Aylık (30 gün) |
| **Deneme Süresi** | 0 gün (veya isterseniz 7 gün) |
| **Yenileme Tipi** | Otomatik |

4. **Kaydet**
5. Plan Kodu'nu not edin: `muhasebe-pro-monthly`

---

## 4️⃣ Supabase Edge Functions Deployment

### 4.1 Supabase CLI ile Login
```bash
supabase login
```

### 4.2 Projeyi Linkle
```bash
supabase link --project-ref your-project-ref
```

`your-project-ref`'i Supabase Dashboard → Settings → General → Reference ID'den alın.

### 4.3 Edge Functions'ları Deploy Et
```bash
# create-subscription function
supabase functions deploy create-subscription

# iyzico-webhook function
supabase functions deploy iyzico-webhook
```

### 4.4 Environment Variables Ekle
```bash
# Iyzico credentials
supabase secrets set IYZICO_API_KEY=sandbox-xxx...
supabase secrets set IYZICO_SECRET_KEY=sandbox-yyy...
supabase secrets set IYZICO_BASE_URL=https://sandbox-api.iyzipay.com
```

---

## 5️⃣ Webhook URL Tanımlama

### 5.1 Webhook URL'i Alın
Edge Function deploy edildikten sonra URL:
```
https://your-project.supabase.co/functions/v1/iyzico-webhook
```

### 5.2 Iyzico Dashboard'da Tanımlayın
1. Dashboard → **Ayarlar → Webhook Ayarları** sekmesine gidin
2. **"Yeni Webhook Ekle"** butonuna tıklayın
3. Webhook bilgilerini girin:
   - **URL:** `https://your-project.supabase.co/functions/v1/iyzico-webhook`
   - **Event Tipi:** Tümünü seçin (SUBSCRIPTION_ORDER_SUCCESS, SUBSCRIPTION_ORDER_FAIL, SUBSCRIPTION_CANCELLED, SUBSCRIPTION_EXPIRED)
4. **Kaydet**

---

## 6️⃣ Frontend Entegrasyonu (SubscriptionModal)

SubscriptionModal'da "Abone Ol" butonuna tıklandığında Supabase Edge Function'a istek atılır.

### Güncelleme Gerekli:
[src/components/SubscriptionModal.tsx](src/components/SubscriptionModal.tsx) dosyasında `openBilling` fonksiyonunu güncelleyin:

```typescript
const openBilling = async () => {
    try {
        // Kullanıcı bilgilerini form ile al (modal içinde form eklenecek)
        const customerData = {
            pricing_plan_reference_code: 'muhasebe-pro-monthly',
            customer_email: currentUserEmail,
            customer_name: 'Kullanıcı Adı', // Formdan alınacak
            customer_surname: 'Kullanıcı Soyadı', // Formdan alınacak
            customer_identity_number: '11111111111', // TC kimlik no (formdan alınacak)
            customer_phone: '+905551234567', // Telefon (formdan alınacak)
            customer_address: 'Adres detayı', // Formdan alınacak
            customer_city: 'İstanbul', // Formdan alınacak
            customer_country: 'Turkey',
            customer_zip_code: '34000', // Formdan alınacak
        };

        // Supabase Edge Function'a istek at
        const { data: { session } } = await supabase.auth.getSession();

        const response = await fetch(
            'https://your-project.supabase.co/functions/v1/create-subscription',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(customerData),
            }
        );

        const result = await response.json();

        if (result.success && result.checkout_form_content) {
            // 3D Secure checkout form'u aç
            // Bu HTML iframe veya modal olarak gösterilebilir
            // Örnek: yeni window aç veya modal içinde göster
            const checkoutWindow = window.open('', '_blank', 'width=600,height=700');
            checkoutWindow.document.write(result.checkout_form_content);
        }
    } catch (error) {
        console.error('Subscription creation failed:', error);
        alert('Abonelik oluşturulamadı. Lütfen tekrar deneyin.');
    }
};
```

**Not:** Yukarıdaki kod şu anda Electron context'inde çalışmaz (Supabase client frontend'de yok). Bu nedenle:

**Seçenek 1:** Electron IPC üzerinden Supabase Edge Function'a istek at (main process'te)
**Seçenek 2:** `openBillingPortal` IPC handler'ını güncelleyerek Iyzico checkout'u başlat

---

## 7️⃣ Test Etme

### 7.1 Sandbox Test Kartları
Iyzico sandbox ortamında test kartları:

| Kart Numarası | CVV | Expiry | Sonuç |
|---------------|-----|--------|-------|
| 5528790000000008 | 123 | 12/30 | Başarılı |
| 5406675000000008 | 123 | 12/30 | Başarısız |

### 7.2 Test Senaryoları
1. ✅ Kullanıcı login olur
2. ✅ Subscription Modal açılır
3. ✅ "Abone Ol" butonuna tıklanır
4. ✅ Kullanıcı bilgileri girilir
5. ✅ Iyzico checkout form açılır (3D Secure)
6. ✅ Test kartı ile ödeme yapılır
7. ✅ Webhook tetiklenir (SUBSCRIPTION_ORDER_SUCCESS)
8. ✅ Supabase database'de subscription status = 'active' olur
9. ✅ Uygulama yenilenir, "Aktif Abonelik" badge'i görünür

---

## 8️⃣ Production'a Geçiş

### Sandbox'tan Production'a Geçerken:
1. ✅ Iyzico Dashboard'da production API keys alın
2. ✅ `.env` ve Supabase secrets'ı güncelleyin:
   ```bash
   IYZICO_BASE_URL=https://api.iyzipay.com
   ```
3. ✅ Pricing plan'ı production'da yeniden oluşturun
4. ✅ Webhook URL'i production Supabase function'a güncelleyin
5. ✅ Test edin!

---

## 🐛 Sorun Giderme

### "Subscription creation failed" Hatası
- ✅ Iyzico API credentials doğru mu?
- ✅ Pricing plan reference code doğru mu?
- ✅ Sub-merchant onaylandı mı?

### Webhook Gelmiyor
- ✅ Iyzico Dashboard'da webhook URL doğru tanımlı mı?
- ✅ Edge Function deploy edildi mi?
- ✅ Event tipleri seçili mi?

### 3D Secure Açılmıyor
- ✅ `checkoutFormContent` dönüyor mu?
- ✅ Popup blocker kapalı mı?

---

## 📊 Veritabanı Güncellemeleri

Webhook'lar otomatik olarak `subscriptions` tablosunu günceller:

| Event | Status Değişimi |
|-------|----------------|
| SUBSCRIPTION_ORDER_SUCCESS | `status = 'active'`, `expires_at = +30 gün` |
| SUBSCRIPTION_ORDER_FAIL | `status = 'inactive'` |
| SUBSCRIPTION_CANCELLED | `status = 'cancelled'`, `cancelled_at = NOW()` |
| SUBSCRIPTION_EXPIRED | `status = 'expired'` |

---

## ✅ Kurulum Tamamlandı!

Iyzico entegrasyonu hazır. Şu anda:
- ✅ Tekrarlayan ödeme altyapısı kurulu
- ✅ Webhook event'leri otomatik işleniyor
- ✅ Subscription durumu Supabase'de tutuluyor

### Sıradaki Adımlar:
- **Faz 6:** Final cleanup (AdminDashboard, unused dependencies)
- **Production Launch:** Canlıya geçiş

---

**Sorularınız için:** [GitHub Issues](https://github.com/your-repo/issues)
