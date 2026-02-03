# Build Assets

## Icon Files

Bu klasörde electron-builder için gerekli icon dosyaları bulunur.

### Gerekli Dosyalar:

#### Windows
- `icon.ico` (256x256 px) - Windows installer icon

#### macOS
- `icon.icns` (512x512 px) - macOS app icon

#### Linux
- `icons/16x16.png`
- `icons/32x32.png`
- `icons/48x48.png`
- `icons/64x64.png`
- `icons/128x128.png`
- `icons/256x256.png`
- `icons/512x512.png`

### Tasarım Gereksinimleri:

- Format: PNG (transparent background)
- Renk: Full color
- İçerik: Logo + "M" harfi veya muhasebe simgesi
- Stil: Modern, minimal, profesyonel

### Placeholder Status:

⚠️ **Şu anda placeholder icon'lar kullanılıyor**
- Gerçek tasarım dosyaları eklenene kadar electron-icon-builder ile otomatik oluşturulacak

### Gerçek Icon Ekleme:

1. Tasarımcıdan 1024x1024 PNG al
2. electron-icon-builder ile otomatik boyutlandır:
   ```bash
   npm install -g electron-icon-builder
   electron-icon-builder --input=./source-icon.png --output=./build
   ```
