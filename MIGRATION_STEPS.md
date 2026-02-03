# 🔄 Migration Steps - Desktop App + Landing Page

## Mevcut Durum
- ✅ GitHub Repo: `narworks/muhasebe-asistani` (Desktop app)
- ⚠️ Vercel Deployment: `vercel.com/narworks/muhasebe-asistani` (Eski web version - deprecated)

---

## 🎯 Hedef Mimari

```
Landing Page (Web)              Desktop App (Electron)
─────────────────────          ─────────────────────────
Next.js                        Electron + React
Vercel Deploy                  GitHub Releases
muhasebeasistani.com          .exe / .dmg / .AppImage

New Repo:                     Existing Repo:
muhasebe-asistani-landing     muhasebe-asistani
```

---

## 📋 ADIM 1: Mevcut Vercel Deployment'ı Durdur

### 1.1 Vercel Dashboard'da
1. https://vercel.com/narworks/muhasebe-asistani
2. **Settings** → **Git**
3. **Disconnect Repository** (veya pause auto-deployments)

**Neden?** Desktop app olarak çalıştığı için web deployment artık gerekli değil.

---

## 📋 ADIM 2: Desktop App için GitHub Actions Setup

### 2.1 Icon Dosyaları Oluştur
```bash
# Placeholder icons oluştur (gerçek tasarım eklenecek)
mkdir -p build/icons

# Windows icon
# macOS icon
# Linux icons
```

### 2.2 İlk Release Oluştur
```bash
# Version tag
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions otomatik çalışacak:
# - Windows .exe build
# - macOS .dmg build
# - Linux .AppImage build
# - GitHub Release oluştur
```

### 2.3 Test Release
1. https://github.com/narworks/muhasebe-asistani/releases
2. v1.0.0 release'i kontrol et
3. Download artifacts test et

---

## 📋 ADIM 3: Landing Page Repo Oluştur

### 3.1 Yeni GitHub Repo
```bash
# GitHub'da yeni repo oluştur
Repo Name: muhasebe-asistani-landing
Description: Landing page for Muhasebe Asistanı desktop app
Public: ✓
```

### 3.2 Next.js Projesi Oluştur
```bash
npx create-next-app@latest muhasebe-asistani-landing \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir

cd muhasebe-asistani-landing

# Install dependencies
npm install framer-motion

# Git init & push
git init
git add .
git commit -m "feat: Initialize landing page"
git remote add origin https://github.com/narworks/muhasebe-asistani-landing.git
git push -u origin main
```

### 3.3 Sayfalar Oluştur
```
app/
├── page.tsx              # Homepage
├── download/
│   └── page.tsx          # Download hub
├── pricing/
│   └── page.tsx          # Pricing
└── layout.tsx
```

### 3.4 GitHub Releases API Entegrasyonu
```typescript
// lib/github.ts
export async function getLatestRelease() {
  const res = await fetch(
    'https://api.github.com/repos/narworks/muhasebe-asistani/releases/latest',
    { next: { revalidate: 3600 } } // Cache 1 hour
  )
  return res.json()
}

// app/download/page.tsx
const release = await getLatestRelease()
const windowsAsset = release.assets.find(a => a.name.endsWith('.exe'))
const macosAsset = release.assets.find(a => a.name.endsWith('.dmg'))
const linuxAsset = release.assets.find(a => a.name.endsWith('.AppImage'))
```

---

## 📋 ADIM 4: Vercel'i Yeni Repo'ya Bağla

### 4.1 Vercel Dashboard
1. https://vercel.com/narworks/muhasebe-asistani
2. **Settings** → **Git**
3. **Disconnect** (eski repo'dan ayır)

### 4.2 Yeni Deployment
1. Vercel Dashboard → **New Project**
2. Import Git Repository: `muhasebe-asistani-landing`
3. Framework Preset: **Next.js**
4. Deploy

### 4.3 Domain Bağla
1. Vercel Project Settings → **Domains**
2. Add Domain: `muhasebeasistani.com`
3. DNS Ayarları:
   ```
   Type: A
   Name: @
   Value: 76.76.21.21 (Vercel IP)

   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

---

## 📋 ADIM 5: İki Repo Senkronizasyonu

### Desktop App Updates → Landing Page Otomatik Güncelleme

1. Desktop app'de yeni version:
   ```bash
   # muhasebe-asistani repo
   npm version patch  # 1.0.0 → 1.0.1
   git push --tags
   ```

2. GitHub Actions build yapar → Release oluşturur

3. Landing page otomatik güncellenir:
   - `getLatestRelease()` API'si latest version'ı çeker
   - Download butonları yeni version'a işaret eder
   - Changelog otomatik gösterilir

**Revalidation:** Next.js ISR (Incremental Static Regeneration) her 1 saatte bir yeniler

---

## 📋 ADIM 6: Testing & QA

### Desktop App
- [ ] Windows .exe indir ve test et
- [ ] macOS .dmg indir ve test et
- [ ] Linux .AppImage indir ve test et
- [ ] Auto-update test et (gelecekte)

### Landing Page
- [ ] Homepage görsel kontrolü
- [ ] Download butonları çalışıyor mu
- [ ] Latest version doğru gösteriliyor mu
- [ ] Platform detection çalışıyor mu
- [ ] Mobile responsive test

---

## ✅ Success Criteria

- ✅ Desktop app GitHub Releases'de mevcut
- ✅ Landing page muhasebeasistani.com'da live
- ✅ Download butonları çalışıyor
- ✅ Vercel deployment otomatik (git push → deploy)
- ✅ GitHub Actions otomatik (git tag → build → release)

---

## 🔄 Future Improvements

### Phase 2
- [ ] Auto-update mekanizması (Electron)
- [ ] Usage analytics (Posthog / Mixpanel)
- [ ] Newsletter signup
- [ ] Blog section

### Phase 3
- [ ] Web version (PWA) - opsiyonel
- [ ] Deep links (muhasebe-asistani://open)
- [ ] Referral system
- [ ] Affiliate program

---

## 📞 Support

Herhangi bir sorun olursa:
- Desktop App: GitHub Issues
- Landing Page: Vercel Support
- General: support@muhasebeasistani.com
