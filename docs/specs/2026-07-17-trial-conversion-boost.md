# Trial → Paid Conversion Boost — Design Spec

**Tarih:** 2026-07-17
**Yazar:** Gürkan Kılıç (Claude Code brainstorming ile)
**Hedef sürüm:** v1.9.15 (Katman 1-3) + v1.10.0 (Katman 4-5)

---

## 1. Bağlam ve Sorun

### 1.1 Metrikler (2026-04-07 launch → 2026-07-17, ~3 ay)

- Toplam signup: 23
- Paid conversion: 3 gerçek ödeme (Elif, gulhank68, nubilgi) + 1 complimentary (Soner)
- Toplam gelir: 17.000₺ (3 ayda)
- Trial → Paid rate: %13 (17 trial'ın 3'ü)

### 1.2 Ana Bulgular

- **Aktivasyon problemi**: 17 trial user'ın 9-10'u tek bir tarama bile yapmamış (sm.hyildirim, alaiyemuhasebe, Osman, cangoz, camgoz, erhan, mustafa, tuna, birgulucar, ercan). v1.9.14 onboarding fix bunu adresliyor.
- **Payment session bile açılmıyor**: Trial user'ların hiçbiri "Abonelik" butonuna basmıyor. 12 expired trial'dan 0'ı payment session açmadı. Ödeme yapan 2 kişi (gulhank68, nubilgi) doğrudan **havale** yapmış — iyzico akışını atlamış.
- **iyzico çalışıyor** ama trigger zayıf. Yalnız Elif iyzico ile ödedi.

### 1.3 Root Cause

Trial içindeki upgrade CTA'sı **tek bir bar + sidebar link** ile sınırlı. Aktivasyon anındaki heyecan, trial son gün aciliyeti, trial expired sonrası winback — hiçbir bağlamda net bir psikoloji tetiklenmiyor.

---

## 2. Ürün Gerçek Özellikleri (Kaynak Doğrulanmış)

Aşağıdaki değerler `subscriptions.max_clients` + `credit_balances.monthly_credits_limit` + `src/pages/dashboard/Subscription.tsx` üzerinden doğrulanmıştır.

### 2.1 Trial (14 gün ücretsiz)

- Mükellef limiti: **20**
- Aylık kredi: **500**
- Modüller: Excel Asistanı + E-Tebligat Kontrol (ikisi de açık)

### 2.2 Pro Paid Plan

- Mükellef limiti: **200**
- Aylık kredi: **5.000**
- Modüller: Excel Asistanı + E-Tebligat Kontrol (ikisi de açık)

### 2.3 Fiyat Yapısı

- Excel Asistanı tek başına: **2.500₺/yıl**
- E-Tebligat Kontrol tek başına: **5.000₺/yıl**
- Tam Paket (ikisi birden): **6.000₺/yıl** (1.500₺ tasarruf)
- Ek kredi paketi: **1.500₺ / 1.000 kredi** (süresiz)

### 2.4 Trial → Paid Differential

Aboneliğe geçince:

- Mükellef limiti **10x artar** (20 → 200)
- Aylık kredi **10x artar** (500 → 5.000)
- Modül seti aynı kalır

---

## 3. Non-Goals (YAPILMAYACAKLAR)

Bu prensipler `feedback_no_discount_tactics.md` ve `feedback_verify_product_specs.md` memory'e göre:

- ❌ İndirim/kupon/promosyon fiyatı sunulmayacak (%20 erken abonelik, %15 winback, "sadece bu hafta" — hiçbiri)
- ❌ Yapay kıtlık dili kullanılmayacak ("son 3 saat", "%X off flash sale")
- ❌ Ürün özellikleri kaynağından doğrulanmadan iddia edilmeyecek
- ❌ "Sınırsız", "unlimited", "en iyi", "market lideri" tarzı doğrulanmamış üstünlük iddiaları yasak

Aciliyet için sadece **gerçek kayıp korkusu** OK: "trial bittikten sonra mükellef listenize erişim durur" — bu somut ve doğru.

---

## 4. Design — 5 Katman

Her katman bağımsız test edilebilir. Sıra: 1 → 2 → 3 (v1.9.15), sonra 4 → 5 (v1.10.0).

### Katman 1 — Trial Son 3 Gün Countdown Modal

**Amaç:** Aciliyet + kayıp bilinci (indirim değil).

- **Trigger:** `trial_ends_at - now < 3 gün` AND app açılışı AND `settings.upgradeModal.lastShownAt > 24h önce`
- **Yer:** Full-screen modal, sağ üstte kapatma butonu
- **İçerik:**

    ```
    Deneme sürenizin bitmesine {N} gün.

    Trial bittikten sonra:
    • Mükellef listenize erişim durur
    • Arka plan e-tebligat takibi kesilir
    • Excel Asistanı ve E-Tebligat Kontrol devre dışı kalır

    Kesintisiz devam için Tam Paket abonelik: 6.000₺/yıl
    (Excel Asistanı + E-Tebligat Kontrol · 200 mükellef · 5.000 kredi/ay)
    ```

- **CTA:** "Aboneliğe Geç" (primary, landing `/billing`) + "Daha Sonra" (secondary, dismiss)
- **State:** `settings.upgradeModal.lastShownAt`

### Katman 2 — Aha Moment Prompt

**Amaç:** İlk başarı anında değeri hatırlat.

- **Trigger:** `settings.onboarding.firstDiscoveryAt` SET olduktan 5 sn sonra AND `settings.onboarding.ahaPromptShownAt` NULL
- **Yer:** Modal (küçük, kompakt) — kutlama tonu
- **İçerik:**

    ```
    🎉 İlk taraman {saniye} saniyede bitti!

    Trial'da:
    • 20 mükellef ekleyebilirsin
    • 500 kredi/ay
    • Tüm modüller açık

    Aboneliğe geçince:
    • 200 mükellef limiti (10 kat)
    • 5.000 kredi/ay (10 kat)
    • Aynı modüller — 6.000₺/yıl
    ```

- **CTA:** "Planları İncele" (soft — Subscription sayfasına yönlendir) + "Kapat"
- **State:** `settings.onboarding.ahaPromptShownAt` — bir kez göster

### Katman 3 — Trial Expired Winback Modal

**Amaç:** Trial biter bitmez tut.

- **Trigger:** `sub_status = 'expired' AND trial_end_reason = 'expired'` AND app açılışı AND `settings.winback.shownAt` NULL
- **Yer:** Full-screen modal
- **İçerik (dinamik istatistik):**

    ```
    Deneme süreniz doldu.

    Trial sırasında:
    • {X} tarama yaptınız
    • Tahmini {Y} saat tasarruf ettiniz
    • {Z} mükellef eklediniz

    Tam Paket ile devam edin (6.000₺/yıl):
    • 200 mükellef limiti
    • 5.000 kredi/ay
    • Excel Asistanı + E-Tebligat Kontrol

    Mükellef listeniz ve ayarlarınız korunur.
    ```

- **CTA:** "Aboneliğe Geç" + "Şimdi Değil"
- **State:** `settings.winback.shownAt`
- **Metrik hesabı:** `usage_logs` + `scan_telemetry` üzerinden X (scan count), Y = X × 3 dk (kaba tahmin), Z (client count)

### Katman 4 — ROI Dashboard Widget (v1.10.0)

**Amaç:** Değeri her giriş yeniden göster.

- **Yer:** Ana Panel üstünde küçük card
- **İçerik (Trial):**
    ```
    Bu ay: {X} tarama · Tahmini {Y} saat tasarruf · {Z} / 500 kredi
    → Trial'da 20 mükellef sınırındasın (kullandığın: {N}/20)
    ```
- **İçerik (Paid):**
    ```
    Bu ay: {X} tarama · {Y} saat tasarruf · {Z} / 5.000 kredi · {N} / 200 mükellef
    Yıllık toplam: {A} tarama · {B} saat tasarruf
    ```

### Katman 5 — Sosyal Kanıt Widget (v1.10.0)

**Amaç:** Trust signal + community psikolojisi.

- **Yer:** Sidebar altında veya Ana Panel köşe card
- **Anonim varyant:** `Bu ay {N} SMMM Muhasebe Asistanı ile çalışıyor` (Supabase COUNT)
- **İzinli spesifik varyant:** `Elif K. · 172 tarama · 43 saat tasarruf` (kişi izniyle, baş harf)
- **Rotasyon:** 3-5 hikaye arası

---

## 5. Backend Değişiklikleri

### 5.1 Yeni Migration

```sql
-- Analytics amaçlı: hangi CTA'dan geldi
ALTER TABLE subscriptions ADD COLUMN signup_source TEXT;
-- Örnek değerler: 'trial_last_days_modal', 'aha_moment_prompt', 'winback_modal', 'organic'
```

### 5.2 Yeni settings alanları (main/settings.js)

```js
settings.upgradeModal = { lastShownAt: null };
settings.winback = { shownAt: null };
settings.onboarding.ahaPromptShownAt = null;
```

### 5.3 Yeni IPC handler (main/main.js)

```js
ipcMain.handle('mark-upgrade-modal-shown', () => settings.markUpgradeModalShown());
ipcMain.handle('mark-winback-shown', () => settings.markWinbackShown());
ipcMain.handle('mark-aha-prompt-shown', () => settings.markAhaPromptShown());
```

### 5.4 Yeni renderer component'ler

```
src/components/upgrade/TrialCountdownModal.tsx       (Katman 1)
src/components/upgrade/AhaMomentPrompt.tsx           (Katman 2)
src/components/upgrade/WinbackModal.tsx              (Katman 3)
src/components/dashboard/ROIWidget.tsx               (Katman 4)
src/components/dashboard/SocialProofWidget.tsx       (Katman 5)
```

### 5.5 Landing app (`muhasebe-asistani-landing`)

- `/billing` sayfası query param `?source=X` kabul etsin
- Query param ödeme session'ına yansısın (`payment_sessions.signup_source` — opsiyonel)

---

## 6. Success Metrics

### 6.1 v1.9.15 Sprint (Katman 1-3, 2 hafta sonra ölç)

- **Trial → Paid conversion:** %13 → **%20+** hedefi
- **Modal görme → tıklama CTR:**
    - Katman 1 hedef: %30+
    - Katman 2 hedef: %40+
    - Katman 3 hedef: %25+
- **Aha moment click → Payment session:** %10+
- **Kaynak-attribution:** hangi katman'dan gelen kullanıcı ödeme yaptı (`signup_source`)

### 6.2 v1.10.0 Sprint (Katman 4-5, 4 hafta sonra ölç)

- **Retention (paid):** aylık aktif kullanım artışı
- **Uzun-vade conversion (trial):** ROI widget gören trial user'ların conversion rate karşılaştırması

---

## 7. Roadmap ve Effort Tahmini

### 7.1 v1.9.15 — MVP (2-3 gün geliştirme)

- Katman 1 (Son 3 gün modal) — 4-6 saat
- Katman 2 (Aha moment) — 3-4 saat
- Katman 3 (Winback modal) — 4-6 saat
- IPC + settings + migration — 2-3 saat
- Test + polish — 4-6 saat

### 7.2 v1.10.0 — Katman 4-5 (4-6 gün geliştirme)

- Katman 4 (ROI widget) — 1 gün
- Katman 5 (Sosyal kanıt widget) — 1 gün
- Rotating logic + Supabase COUNT sorgusu — 4-6 saat
- Test + polish — 1 gün

---

## 8. Risk ve Non-Goals

### 8.1 Riskler

- **Katman 1/3 modal yorgunluğu:** Kullanıcı her açılışta modal görürse rahatsız olur. Mitigation: 24h cooldown + kolay dismiss.
- **Aha moment yanlış zamanlı:** Tarama fail olursa "başarılı" prompt saçma olur. Mitigation: `firstDiscoveryAt` sadece başarılı tarama sonrası set edilecek.
- **Winback modal spam:** Trial expired user her açılışta görürse can sıkar. Mitigation: bir kez göster + `shownAt` set et.

### 8.2 Non-Goals

- Email otomatik winback yok (bu spec'in dışında — manuel email sürecinde tutalım)
- SMS bildirim yok
- Referans/affiliate program yok (gelecek sprint)
- İndirim/kupon YOK (memory'e göre yasak)

---

## 9. İlgili Kayıtlar

- Memory: [[project-pricing]], [[feedback-no-discount-tactics]], [[feedback-verify-product-specs]], [[feedback-marketing]]
- v1.9.14 fix: `916c9fd` — auto-updater tray-mode fix
- Onboarding fix: `e7aebbf` — WelcomeModal + DiscoveryPrompt
- Aktivasyon telemetry: `settings.onboarding.firstDiscoveryAt` — Katman 2 trigger için hazır
