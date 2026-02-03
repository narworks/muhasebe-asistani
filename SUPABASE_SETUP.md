# 🚀 Supabase Kurulum Rehberi

Bu rehber, Muhasebe Asistanı uygulamasının Supabase entegrasyonunu tamamlamak için gereken adımları içerir.

## 📋 Ön Koşullar

- [ ] Supabase hesabı ([supabase.com](https://supabase.com))
- [ ] Node.js ve npm kurulu
- [ ] Gemini API Key (zaten mevcutsa)

---

## 1️⃣ Supabase Projesi Oluşturma

1. [Supabase Dashboard](https://supabase.com/dashboard)'a gidin
2. **"New Project"** butonuna tıklayın
3. Proje bilgilerini girin:
   - **Name:** `muhasebe-asistani` (veya istediğiniz isim)
   - **Database Password:** Güçlü bir şifre seçin (kaydedin!)
   - **Region:** `Europe (Frankfurt)` veya size en yakın bölge
4. **"Create new project"** butonuna tıklayın
5. Proje hazır olana kadar bekleyin (~2 dakika)

---

## 2️⃣ Database Schema Kurulumu

1. Supabase Dashboard'da **"SQL Editor"** sekmesine gidin
2. Projedeki `supabase-setup.sql` dosyasının içeriğini kopyalayın
3. SQL Editor'e yapıştırın
4. **"Run"** butonuna tıklayın
5. Başarılı mesajı görmelisiniz:
   ```
   Success. No rows returned
   ```

Bu SQL scripti şunları oluşturur:
- ✅ `subscriptions` tablosu (kullanıcı abonelikleri)
- ✅ `usage_logs` tablosu (AI kullanım logları)
- ✅ Row Level Security (RLS) policies
- ✅ Automatic triggers (updated_at, yeni kullanıcı kaydı)

---

## 3️⃣ Authentication Ayarları

1. **Authentication → Providers** sekmesine gidin
2. **Email** provider'ını bulun ve **Enable** edin
3. Ayarlar:
   - ✅ **Enable Email provider:** ON
   - ✅ **Confirm email:** OFF (test için kapalı, production'da açın)
   - ✅ **Secure email change:** ON
4. **Save** butonuna tıklayın

---

## 4️⃣ API Credentials Alma

1. **Settings → API** sekmesine gidin
2. Aşağıdaki değerleri kopyalayın:

### Project URL
```
https://your-project.supabase.co
```

### Anon (Public) Key
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjk4ODQ1NjAwLCJleHAiOjIwMTQ0MjE2MDB9...
```

### Service Role Key (GİZLİ - Paylaşmayın!)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvdXItcHJvamVjdCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE2OTg4NDU2MDAsImV4cCI6MjAxNDQyMTYwMH0...
```

---

## 5️⃣ .env Dosyasını Güncelleme

1. Projenin root dizinindeki `.env` dosyasını açın
2. Supabase credentials'ları yapıştırın:

```bash
# Gemini AI API Key (Backend - AI işlemleri için)
GEMINI_API_KEY=your-gemini-api-key-here

# Supabase Credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Billing Portal URL (opsiyonel, Faz 5'te kullanılacak)
BILLING_URL=https://muhasebeasistani.com/pricing
```

3. Dosyayı kaydedin

⚠️ **ÖNEMLİ:** `.env` dosyası `.gitignore`'da olmalı (zaten eklendi)

---

## 6️⃣ Test Kullanıcısı Oluşturma

### Yöntem 1: Supabase Dashboard
1. **Authentication → Users** sekmesine gidin
2. **"Add user"** butonuna tıklayın
3. Email ve şifre girin
4. **"Create user"** butonuna tıklayın

### Yöntem 2: SQL Editor
```sql
-- Test kullanıcısı oluştur
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES (
  'test@muhasebeasistani.com',
  crypt('test123', gen_salt('bf')),
  NOW()
);
```

---

## 7️⃣ Subscription Testi

SQL Editor'de test kullanıcısına aktif abonelik ekleyin:

```sql
-- Kullanıcının ID'sini bul
SELECT id, email FROM auth.users WHERE email = 'test@muhasebeasistani.com';

-- Abonelik durumunu aktif yap (user_id'yi yukarıdaki sorgudan alın)
UPDATE subscriptions
SET
  status = 'active',
  started_at = NOW(),
  expires_at = NOW() + INTERVAL '30 days'
WHERE user_id = 'USER_ID_BURAYA';
```

---

## 8️⃣ Uygulamayı Çalıştırma

```bash
# Dependencies yüklü mü kontrol edin
npm install

# Electron uygulamasını başlatın
npm start
```

### Test Adımları:
1. ✅ Login sayfası açılmalı
2. ✅ `test@muhasebeasistani.com` / `test123` ile giriş yapın
3. ✅ Dashboard yüklenmeli
4. ✅ Navbar'da "Aktif Abonelik" badge'i görünmeli
5. ✅ Subscription Modal'da plan bilgileri görünmeli

---

## 🐛 Sorun Giderme

### "Supabase initialization failed" Hatası
- ✅ `.env` dosyasında `SUPABASE_URL` ve `SUPABASE_ANON_KEY` doğru mu?
- ✅ Proje dizininde `.env` dosyası var mı?

### "Invalid login credentials" Hatası
- ✅ Email ve şifre doğru mu?
- ✅ Supabase Dashboard → Authentication → Users'da kullanıcı var mı?
- ✅ Email provider aktif mi?

### Token Hatası
- ✅ Supabase console'da RLS policies aktif mi?
- ✅ `supabase-setup.sql` tam olarak çalıştırıldı mı?

### Database Hatası
- ✅ SQL Editor'de `SELECT * FROM subscriptions;` çalışıyor mu?
- ✅ Triggers ve functions oluşturuldu mu?

---

## 📊 Veritabanı Yapısı

### `subscriptions` Tablosu
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | UUID | Primary key |
| user_id | UUID | auth.users'a foreign key |
| email | TEXT | Kullanıcı email |
| plan | TEXT | 'pro' (şimdilik tek plan) |
| status | TEXT | 'active', 'inactive', 'cancelled', 'expired' |
| iyzico_subscription_reference_code | TEXT | Iyzico entegrasyonu için (Faz 5) |
| started_at | TIMESTAMPTZ | Abonelik başlangıç tarihi |
| expires_at | TIMESTAMPTZ | Abonelik bitiş tarihi |
| device_id | TEXT | Cihaz ID |
| app_version | TEXT | Uygulama versiyonu |

### `usage_logs` Tablosu
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| id | UUID | Primary key |
| user_id | UUID | Kullanıcı ID |
| operation_type | TEXT | 'statement_convert', 'e_tebligat_scan' |
| tokens_used | INTEGER | Kullanılan token sayısı |
| cost_usd | NUMERIC | Maliyet (USD) |
| success | BOOLEAN | İşlem başarılı mı? |

---

## ✅ Kurulum Tamamlandı!

Supabase entegrasyonu aktif. Şu anda:
- ✅ Kullanıcı auth Supabase üzerinden
- ✅ Subscription yönetimi Supabase database'de
- ✅ Session'lar Electron encrypted storage'da
- ✅ Backend klasörü deprecated (artık kullanılmıyor)

### Sıradaki Adımlar:
- **Faz 5:** Iyzico ödeme entegrasyonu
- **Faz 6:** Final cleanup (AdminDashboard silme, etc.)

---

**Sorularınız için:** [GitHub Issues](https://github.com/your-repo/issues)
