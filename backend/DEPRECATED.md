# ⚠️ DEPRECATED - Backend Klasörü

Bu klasör **artık kullanılmamaktadır** ve gelecekteki sürümlerde silinecektir.

## Neden Deprecated?

**Faz 4: Supabase Entegrasyonu** ile birlikte:

- Authentication ve subscription yönetimi **Supabase**'e taşındı
- Express backend yerine **Supabase Edge Functions** kullanılıyor
- Kullanıcı ve abonelik verileri artık **Supabase PostgreSQL** database'de tutuluyor
- Electron uygulaması direkt olarak Supabase API'si ile iletişim kuruyor

## Eski Mimari (v2 - Deprecated)

```
Electron App → Express Backend (server.js) → JSON Files (users.json, credits.json)
```

## Yeni Mimari (v3 - Current)

```
Electron App → Supabase (Auth + Database + Edge Functions)
```

## Dosya Yapısı (Referans için korunuyor)

- `server.js` - Ana Express server (PORT 3001)
- `package.json` - Backend dependencies
- `data/users.json` - Kullanıcı verileri (JSON)
- `data/credits.json` - Kredi verileri (JSON)
- `services/` - GIB scraping ve statement converter servisleri

## Migration Notu

Eğer eski backend üzerinde hala çalışan bir deployment varsa:

1. Supabase projesini ayarlayın (`supabase-setup.sql` çalıştırın)
2. Mevcut kullanıcı verilerini Supabase'e migrate edin
3. Vercel deployment'ı durdurun
4. Bu klasörü silin

---

**Son Kullanım Tarihi:** Faz 3 (2024)
**Yeni Sistem:** Supabase (Faz 4+)
