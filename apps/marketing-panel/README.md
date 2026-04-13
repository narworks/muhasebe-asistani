# Muhasebe Asistanı Marketing OS

Bu panel, reklam bütçesi olmadan yürütülen organik pazarlama planını web arayüzünden takip etmek için hazırlanmış statik bir MVP'dir.

## Nasıl Açılır?

`index.html` dosyasını tarayıcıda açmanız yeterlidir:

```text
apps/marketing-panel/index.html
```

Sunucu, veritabanı veya kurulum gerekmez. Veriler tarayıcının `localStorage` alanında tutulur.

## Ekranlar

- Dashboard: aktif haftanın içerik, temas, yanıt, demo, deneme ve satış özeti.
- İçerik Takvimi: 13 haftalık LinkedIn, YouTube Shorts ve SEO planı.
- Potansiyel Müşteriler: basit organik CRM ve takip listesi.
- Mesaj Şablonları: kişiselleştirilebilir ve kopyalanabilir mesajlar.
- Skor Kartı: cuma kapanışı için haftalık metrikler ve öğrenimler.

## Veri Yönetimi

- `Yedek Al`: Tüm panel verilerini JSON olarak indirir.
- `Yedek Yükle`: Daha önce alınan JSON yedeğini geri yükler.
- `CSV indir`: İçerik takvimi, potansiyel müşteri listesi ve skor kartı için ayrı dışa aktarım sağlar.
- `Sıfırla`: Tarayıcıdaki panel verilerini başlangıç haline döndürür.

## Sonraki Aşama

Panel birden fazla cihazdan kullanılacaksa aynı veri modelinin Supabase'e taşınması önerilir. İlk sürümde bilinçli olarak backend eklenmedi; amaç sıfır bütçeyle hemen kullanılabilir bir takip sistemi sağlamaktır.
