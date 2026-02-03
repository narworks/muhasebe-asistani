# 🌐 Landing Page Plan - Muhasebe Asistanı

## 📋 Genel Bakış

Landing page, kullanıcıların ürünü keşfetmesi, özelliklerini öğrenmesi ve desktop uygulamasını indirmesi için tasarlanmış web sitesidir.

---

## 🏗️ Teknoloji Stack

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** (mevcut projeden tutarlılık)
- **Framer Motion** (animasyonlar)

### Deployment
- **Vercel** (otomatik deployment)

### Analytics
- **Vercel Analytics** veya **Google Analytics**

---

## 📄 Sayfa Yapısı

### 1. **Homepage (/)**
```
┌─────────────────────────────────────┐
│ NAVBAR                              │
│  Logo | Özellikler | Fiyatlandırma │
│       | İndirme | Giriş Yap       │
├─────────────────────────────────────┤
│                                     │
│  HERO SECTION                       │
│  "Mali Müşavirler için Yapay Zeka │
│   Destekli Otomasyon"              │
│                                     │
│  [Windows İndir] [macOS İndir]     │
│  [Linux İndir]                     │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  FEATURES SECTION                   │
│  🏦 Banka Ekstresi Dönüştürücü     │
│  📧 E-Tebligat Otomasyonu          │
│  📊 İstatistikler                   │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  HOW IT WORKS                       │
│  1. İndir  2. Kur  3. Kullan       │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  PRICING                            │
│  Muhasebe Asistanı Pro             │
│  499 TL/Ay                         │
│  • Sınırsız Ekstré Dönüştürme     │
│  • Sınırsız E-Tebligat            │
│  • AI Destekli İşlemler           │
│  [Hemen Başla]                     │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  TESTIMONIALS                       │
│  Kullanıcı yorumları               │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  FOOTER                             │
│  Logo | Linkler | Sosyal Medya    │
│  © 2024 NarWorks                   │
│                                     │
└─────────────────────────────────────┘
```

### 2. **/download** (Download Hub)
- Platform detection (Windows/macOS/Linux)
- Latest version info
- Changelog
- System requirements
- Direct download links

### 3. **/pricing** (Fiyatlandırma)
- Plan detayları
- SSS
- İletişim formu

### 4. **/docs** (Dokümantasyon - Opsiyonel)
- Kurulum rehberi
- Kullanım kılavuzu
- SSS
- Video tutorials

### 5. **/register** (Yönlendirme)
- Desktop app indir → Uygulama içinden kayıt ol

### 6. **/login** (Yönlendirme)
- Desktop app indir → Uygulama içinden giriş yap

---

## 🔗 Desktop App Entegrasyonu

### Download Links
Landing page'den indirme linkleri:

```typescript
// GitHub Releases API kullanarak otomatik latest version
const GITHUB_RELEASES_API = 'https://api.github.com/repos/narworks/muhasebe-asistani/releases/latest'

// Platform detection
const getPlatform = () => {
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('win')) return 'windows'
  if (userAgent.includes('mac')) return 'macos'
  if (userAgent.includes('linux')) return 'linux'
  return 'unknown'
}

// Download URL generator
const getDownloadUrl = async () => {
  const release = await fetch(GITHUB_RELEASES_API).then(r => r.json())
  const platform = getPlatform()

  const assetMap = {
    windows: release.assets.find(a => a.name.endsWith('.exe')),
    macos: release.assets.find(a => a.name.endsWith('.dmg')),
    linux: release.assets.find(a => a.name.endsWith('.AppImage'))
  }

  return assetMap[platform]?.browser_download_url
}
```

### Deep Links (Opsiyonel - İleri Aşamada)
Desktop app kurulu kullanıcılar için deep link:

```html
<!-- Landing page'de giriş butonu -->
<a href="muhasebe-asistani://login">
  Uygulamayı Aç
</a>

<!-- Eğer kurulu değilse, download'a yönlendir -->
<script>
  window.location.href = 'muhasebe-asistani://login'
  setTimeout(() => {
    window.location.href = '/download'
  }, 2000)
</script>
```

---

## 📊 Analytics & Tracking

### Events
```typescript
// Download tracking
trackEvent('download_started', {
  platform: 'windows',
  version: '1.0.0'
})

// Registration tracking
trackEvent('registration_initiated', {
  source: 'landing_page'
})

// Subscription tracking
trackEvent('subscription_completed', {
  plan: 'pro'
})
```

---

## 🚀 Deployment Pipeline

### GitHub Actions (.github/workflows/deploy-landing.yml)
```yaml
name: Deploy Landing Page

on:
  push:
    branches: [main]
    paths:
      - 'apps/landing/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: vercel/actions@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

### Vercel Config (vercel.json)
```json
{
  "buildCommand": "cd apps/landing && npm run build",
  "outputDirectory": "apps/landing/.next",
  "framework": "nextjs",
  "rewrites": [
    {
      "source": "/download",
      "destination": "/download"
    }
  ]
}
```

---

## 📝 Content Strategy

### SEO Optimization
```tsx
// app/layout.tsx
export const metadata = {
  title: 'Muhasebe Asistanı - Mali Müşavirler için Yapay Zeka Destekli Otomasyon',
  description: 'Banka ekstresi dönüştürme, e-tebligat otomasyonu ve daha fazlası. Mali müşavirlerin iş yükünü azaltan yapay zeka destekli araçlar.',
  keywords: 'muhasebe, mali müşavir, yapay zeka, otomasyon, ekstré dönüştürme, e-tebligat',
  openGraph: {
    title: 'Muhasebe Asistanı',
    description: 'Mali Müşavirler için Yapay Zeka Destekli Otomasyon',
    images: ['/og-image.png']
  }
}
```

### Call-to-Actions
1. **Primary CTA:** "Ücretsiz Dene" → Download
2. **Secondary CTA:** "Fiyatlandırma" → /pricing
3. **Tertiary CTA:** "Demo İzle" → Video modal

---

## 🎨 Design System

### Mevcut Projeden Kullanılacaklar
- Tailwind config
- Color palette (slate, sky, emerald)
- Typography
- Button styles
- Card components

### Yeni Eklenecekler
- Hero sections
- Feature cards
- Testimonials
- Pricing cards
- Footer

---

## 📦 Quick Start (Yeni Repo için)

```bash
# Landing page repo oluştur
npx create-next-app@latest muhasebe-asistani-landing --typescript --tailwind --app

cd muhasebe-asistani-landing

# Dependencies
npm install framer-motion

# Vercel'e deploy
vercel --prod
```

---

## 🔗 Domain Setup

### 1. muhasebeasistani.com → Landing Page (Vercel)
### 2. app.muhasebeasistani.com → (Gelecekte web version için - opsiyonel)
### 3. api.muhasebeasistani.com → Supabase Edge Functions (CNAME)

---

## ✅ Checklist

### Phase 1: MVP Landing Page
- [ ] Next.js projesi oluştur
- [ ] Homepage tasarımı
- [ ] Download page
- [ ] Pricing page
- [ ] GitHub Releases entegrasyonu
- [ ] Vercel deployment

### Phase 2: Enhancement
- [ ] SEO optimization
- [ ] Analytics tracking
- [ ] Testimonials section
- [ ] Blog (opsiyonel)
- [ ] Newsletter signup

### Phase 3: Advanced
- [ ] Deep links
- [ ] Web version (PWA - opsiyonel)
- [ ] A/B testing
- [ ] Live chat support

---

## 📞 Support

Landing page'den destek kanalları:
- Email: support@muhasebeasistani.com
- WhatsApp Business: +90 XXX XXX XX XX
- Intercom/Crisp chat widget
