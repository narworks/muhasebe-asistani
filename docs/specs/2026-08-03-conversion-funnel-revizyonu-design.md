# Conversion Huni Revizyonu (v1.9.16) — Tasarım

**Tarih:** 2026-08-03
**Durum:** Onaylandı (tasarım)
**Hedef sürüm:** v1.9.16

## Problem

Trial kullanıcıları uygulama içinden `/billing` satın-alma sayfasına ulaştıramıyoruz. Canlı Supabase verisi: tarih boyunca ~20 trial kullanıcıdan yalnızca **3-4'ü** satın-alma formuna ulaştı. Ödeme yollarının kendisi çalışıyor (ulaşan neredeyse herkes dönüştü: nubilgi + Soner Havale, elif iyzico; formu dolduran 3 kişiden sadece Mazi son adımda düştü). **Sızıntı yukarıda: trial kullanıcıları satın-alma akışına hiç sokamıyoruz.**

Explore kod denetimi 5 somut zayıf halka buldu (aşağıda P0-P4). Bu revizyon hepsini kapatır.

## Kısıtlar (Global)

- **Erişim:** Bu düzeltmeler yalnızca **v1.9.15+** kullanıcılara ulaşır. v1.9.11'de takılanlar (auto-updater tray-mode bug) güncellemeden göremez — ayrı bir kurtarma işi, kapsam dışı.
- **Pazarlama kuralı:** İndirim/kupon/promosyon/yapay kıtlık YOK. "Kayıp bilinci" (deneme süresi doldu → erişim kısıtlandı) serbest.
- **Fiyatlar (Supabase'den doğrulanmış, değiştirilmez):** Tam Paket 6.000₺/yıl (`plan-bundle-annual`), E-Tebligat Kontrol 5.000₺ (`plan-etebligat-annual`), Excel Asistanı 2.500₺ (`plan-excel-annual`).
- **Mimari:** Yerinde düzenleme; yeni mimari/dosya yok (bir küçük yardımcı hariç olabilir). Mevcut pattern'ler izlenir. Renderer TS/React, main process plain JS. Prettier: 4-space, single quote, trailing comma (es5), 100 char.
- **"1.500₺ tasarruf" bundle karşılaştırması** (7.500₺ = 2500+5000 üstü çizili) dürüst paket-vs-tektek fiyatı — indirim taktiği değil, dokunulmaz.

## Yaklaşım

Beş bağımsız düzeltme, hepsi mevcut bileşenlerde yerinde. Sıra bağımsız test edilebilir; ortak bir mimari değişiklik yok.

---

## P0 — /subscription: Görünür "Satın Al" butonları + forma kaydırma

**Dosya:** `src/pages/dashboard/Subscription.tsx`

**Sorun:** Plan kartları `<button>` (satır 256, 300) — tıklanınca `selectedPlan` set olup ödeme formu aşağıda (satır 358) açılıyor. Ama kartlar fiyatlı bilgi paneli gibi duruyor; üzerinde "Satın Al" yok, tıklanabilir olduğu belli değil, form kaydırma yapılmadan altta beliriyor. Teknik olmayan mali müşavir alım butonu bulamıyor, takılıyor.

**Değişiklik:**

1. Kart kabını `<button>`'dan `<div>`'e çevir (buton-içinde-buton geçersiz HTML). Her kartın içine tek net **`<button>` "Satın Al →"** koy.
2. "Satın Al" tıklaması → `setSelectedPlan(planId)` + ödeme formuna yumuşak kaydırma. Ödeme formu bölümüne bir `ref` (`formRef`) eklenir; seçimde `formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })`.
3. Sahip olunan (aktif) modül kartında "Satın Al" yerine mevcut **"AKTİF"** rozeti kalır (`isActive = hasModule(id) && !isTrial`). Trial ve expired kullanıcıda üç kartta da "Satın Al" görünür.
4. Ödeme formu isim alanını mümkünse ön-doldur. Şu an sadece email dolu (satır 66). İsim `currentUser` üzerinde mevcutsa (`displayName`/`name`) `formData.name`'e ön-doldur; yoksa boş bırak.
5. Kartın tamamı tıklanabilir kalabilir (div `onClick`) ama birincil görünür eylem "Satın Al" butonudur.

**Kabul:** Trial/expired kullanıcı /subscription'a girince her planda açık "Satın Al" butonu görür; tıklayınca form görünür alana kayar ve ödeme butonları (Kredi Kartı / Havale) görünür.

---

## P1 — TrialBanner: Dolmuş-trial kalıcı kırmızı şeridi

**Dosya:** `src/components/TrialBanner.tsx` (MainLayout.tsx:55'te mount — uygulama geneli)

**Sorun:** Satır 36 `if (!subscription?.isTrial || !subscription.isActive) return null;` — trial dolunca (`isActive=false`) en görünür kalıcı "Abone Ol" şeridi tamamen kayboluyor; conversion baskısının en yüksek olduğu an boş kalıyor.

**Değişiklik:** Gate'i üç duruma böl:

- `isTrial && isActive` → mevcut geri sayım şeridi (**X gün ücretsiz deneme kaldı** + renk skalası) — değişmez.
- `isTrial && !isActive` → **kırmızı şerit**: "Deneme süreniz doldu — devam etmek için abone olun" + "Abone Ol" butonu → `/subscription`. Renkler `getSeverityColors('expired')`'ten (`src/lib/subscriptionUtils.ts`).
- Aksi (ücretli/complimentary) → `return null` (ücretli abonelik expiry'si ayrı sistemde, `expiresAt`).

**Kabul:** Trial dolan kullanıcı her sayfanın üstünde kalıcı kırmızı "Deneme süreniz doldu — Abone Ol" şeridi görür.

---

## P2 — WinbackModal: Tekrar-gösterim kadansı + client-side expiry

**Dosya:** `src/components/upgrade/WinbackModal.tsx` (App.tsx:47'de mount), `main/settings.js`

**Sorun:** Gate (satır 49-52) `isTrial && status==='expired' && !winback.shownAt`. İki zayıflık: (a) yalnız server cron `status='expired'` yapınca çıkar — cron gecikirse dolmuş kullanıcı hiç modal görmez; (b) tek "Şimdi Değil" → `winback.shownAt` set → **sonsuza dek kaybolur**.

**Değişiklik:**

1. **Client-side expiry algılama:** `status === 'expired'` VEYA `trialEndsAt` geçmişte. Yeni koşul: `isTrial && (status === 'expired' || (trialEndsAt && new Date(trialEndsAt).getTime() < Date.now()))`. Cron beklemeden trial biter bitmez tetiklenir.
2. **Tekrar gösterim kadansı:** **7 günde bir, en fazla 3 kez.** `main/settings.js` `winback` state'ine `count` eklenir: `{ shownAt: null, count: 0 }`. Gösterim gate'i: `count < 3 && (shownAt == null || (now - shownAt) >= 7 gün)`. `markWinbackShown()` → `shownAt = now`, `count += 1`.
3. Günlük hatırlatmayı zaten kalıcı banner (P1) taşır; modal nazik periyodik dokunuş kalır.

**settings.js detay:** `defaultSettings.winback` → `{ shownAt: null, count: 0 }`. Merge mantığı (satır 100-102, 149-151) `count`'u korur. `markWinbackShown` (satır 204-205) `count`'u okuyup +1 yazar. `resetUpgradeCTAState` (satır 233) `{ shownAt: null, count: 0 }` set eder. `getUpgradeCTAState` `count`'u döndürür (`useUpgradeCTA` üzerinden UI'ya).

**Kabul:** Trial biter bitmez (cron beklemeden) modal çıkar; "Şimdi Değil" sonrası 7 gün içinde tekrar çıkmaz, 3. gösterimden sonra bir daha çıkmaz.

---

## P3 — Kalıcı CTA güçlendirme (Navbar çipi + Sidebar trial rozeti)

**Dosyalar:** `src/components/layout/Navbar.tsx`, `src/components/layout/Sidebar.tsx`

**Sorun:** İki kalıcı CTA zayıf. Navbar'daki "Abone Ol" çipi (satır 70) küçük ve soluk. Sidebar "Abonelik" linki rozeti (satır 325-336) `getExpiryStatus(subscription)`'e bakıyor — o `expiresAt`'e dayalı; trial kullanıcıda `expiresAt` null → rozet çıkmıyor, link yönetim gibi duruyor.

**Değişiklik:**

1. **Navbar** (satır 51-72): inactive (`!subscription.isActive`) kullanıcıdaki "Abone Ol" çipini belirgin yap — dolu sky arka plan (`bg-sky-500 text-white hover:bg-sky-600`), buton görünümü. Aktif/PRO görünümü değişmez.
2. **Sidebar** (satır 325-336): "Abonelik" rozetine **trial-farkında** dal ekle. `getExpiryStatus` (notification scheduler'da da kullanıldığı için) DEĞİŞTİRİLMEZ; bunun yerine Sidebar içinde küçük ayrı hesap: `subscription.isTrial` ise `trialEndsAt`'ten gün hesapla → aktifse amber "X gün" rozeti, dolmuşsa (`!isActive`) kırmızı "Süresi doldu" rozeti. Trial değilse mevcut `getExpiryStatus` rozeti kalır.

**Kabul:** Inactive kullanıcı belirgin dolu "Abone Ol" butonu görür; trial kullanıcı Sidebar'da "X gün"/"Süresi doldu" rozeti görür.

---

## P4 — openCheckout: source=desktop paramı

**Dosya:** `main/main.js` (satır 1837-1847, `open-checkout` handler)

**Sorun:** `open-billing-portal` handler'ı `source=desktop` gönderiyor (satır 1884) ama `open-checkout` göndermiyor. Süresi dolan kullanıcının asıl kullandığı yol (`/subscription` → "Kredi Kartı ile Öde" → `openCheckout` → `/billing/checkout`) web'de kompakt masaüstü arayüzünü almıyor.

**Değişiklik:** `urlParams.set('source', 'desktop')` ekle (satır 1840-1845 arası).

**Kabul:** `open-checkout` ile açılan checkout URL'i `source=desktop` içerir.

---

## Test

Framework: Vitest + @testing-library/react (mevcut).

- **P0:** Subscription.tsx — "Satın Al" tıklaması `selectedPlan` set ediyor + ödeme formu render oluyor; aktif modülde "Satın Al" yerine "AKTİF".
- **P1:** TrialBanner — `isTrial && !isActive` → kırmızı "Deneme süreniz doldu" + "Abone Ol" link; `isTrial && isActive` → geri sayım; ücretli → null.
- **P2:** WinbackModal gate mantığı — client-side expiry (trialEndsAt geçmiş) tetikliyor; `count>=3` veya `shownAt < 7g` gösterimi engelliyor. settings.js `winback.count` merge/increment.
- **P3:** Sidebar trial rozeti (isTrial + trialEndsAt → doğru etiket/renk).
- **P4:** main-process — manuel doğrulama (URL'de `source=desktop`).

## Kapsam Dışı (bilerek)

- v1.9.11 stuck kullanıcıların kurtarılması (ayrı iş).
- Fiyat/plan/indirim değişikliği.
- `/billing` (landing) tarafı — bu revizyon yalnız desktop app.
- AhaMomentPrompt / TrialCountdownModal davranışı (mevcut, dokunulmaz).

## Rollout

- Sürüm: 1.9.15 → **1.9.16** (minor: feature).
- Küçük bağımsız commit'ler (P0…P4 + testler).
- Tüm commit'ler sonrası tag + build.
