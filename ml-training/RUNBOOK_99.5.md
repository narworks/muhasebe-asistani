# Runbook: %99.5+ accuracy hedefi

20K data + 3-model ensemble + Multi-AI cascade. Tahmini ~50 saat (2 gün).

## Step 1 — 10K daha collect (toplam 20K)

Yeni terminal:

```bash
cd /Users/narworks/Projects/muhasebe-asistani
caffeinate -dims node scripts/collect-captcha-dataset.js \
  --target 20000 \
  --out training-data/captcha/v1 \
  --provider openai \
  --limit-cost 2
```

Resume edecek (10K mevcut). 10K daha collect → ~33 saat.

## Step 2 — Yeni 10K'yı re-label (gpt-4o)

Step 1 bittikten sonra:

```bash
cd /Users/narworks/Projects/muhasebe-asistani
caffeinate -dims node scripts/relabel-captcha-dataset.js \
  --in training-data/captcha/v1 \
  --model gpt-4o \
  --concurrency 3 \
  --limit-cost 5
```

Mevcut labels.csv (10K mini-relabel'lı) backup alınır, yeni 10K için gpt-4o etiketleme başlar. ~5 saat, $1.28.

## Step 3 — Migration 014 push (Supabase Dashboard)

[supabase/migrations/014_captcha_telemetry_methods.sql](muhasebe-asistani-landing/supabase/migrations/014_captcha_telemetry_methods.sql)
SQL Editor'a kopyala + çalıştır. ~10 saniye.

## Step 4 — 3 model train (ensemble)

Step 2 bittikten sonra. Sıralı 3 koşu (her biri ~6 saat 20K dataset için):

```bash
cd /Users/narworks/Projects/muhasebe-asistani/ml-training
source .venv/bin/activate

# Model 1
caffeinate -dims python train.py --data ../training-data/captcha/v1 \
  --epochs 50 --batch 32 --lr 0.0003 --seed 1 --out checkpoints/seed1

# Model 2
caffeinate -dims python train.py --data ../training-data/captcha/v1 \
  --epochs 50 --batch 32 --lr 0.0003 --seed 2 --out checkpoints/seed2

# Model 3
caffeinate -dims python train.py --data ../training-data/captcha/v1 \
  --epochs 50 --batch 32 --lr 0.0003 --seed 3 --out checkpoints/seed3
```

Toplam ~18 saat. Her seed farklı RNG → farklı model davranışı → ensemble voting kazanır.

## Step 5 — 3 ONNX export

```bash
cd /Users/narworks/Projects/muhasebe-asistani/ml-training
source .venv/bin/activate

python export_onnx.py --checkpoint checkpoints/seed1/best.pt \
  --quantize --test ../training-data/captcha/v1 --version v1-seed1 \
  --out captcha-v1-seed1.onnx

python export_onnx.py --checkpoint checkpoints/seed2/best.pt \
  --quantize --test ../training-data/captcha/v1 --version v1-seed2 \
  --out captcha-v1-seed2.onnx

python export_onnx.py --checkpoint checkpoints/seed3/best.pt \
  --quantize --test ../training-data/captcha/v1 --version v1-seed3 \
  --out captcha-v1-seed3.onnx
```

3 ayrı ONNX + metadata.json (her birinin metadata aynı, sadece test_accuracy farklı).

## Step 6 — Modelleri desktop bundle'a kopyala

```bash
cd /Users/narworks/Projects/muhasebe-asistani
cp ml-training/captcha-v1-seed{1,2,3}.int8.onnx main/automation/models/
cp ml-training/captcha-v1-seed1.metadata.json main/automation/models/captcha-v1.metadata.json
# Eski tek-model dosyasını sil (ensemble varlığını otomatik tespit eder)
rm -f main/automation/models/captcha-v1.int8.onnx
ls -lh main/automation/models/
```

## Step 7 — npm install Anthropic SDK

```bash
cd /Users/narworks/Projects/muhasebe-asistani
npm install @anthropic-ai/sdk
```

## Step 8 — Anthropic API key ekleme

`.env` dosyasına (terminal ile, chat'e yapıştırma):

```bash
# https://console.anthropic.com/settings/keys → "Create Key"
echo "ANTHROPIC_API_KEY=YENİ_KEY" >> /Users/narworks/Projects/muhasebe-asistani/.env
```

## Step 9 — Calibration analizi (ensemble + min-conf)

```bash
cd /Users/narworks/Projects/muhasebe-asistani
node scripts/test-crnn-calibration.js
```

Yeni optimal threshold beklenir (ensemble accuracy daha yüksek, calibration daha sağlıklı). Çıktıyı paylaş, threshold'u captchaSolver.js'te güncelleyim.

## Step 10 — Dev mode test

```bash
cd /Users/narworks/Projects/muhasebe-asistani
npm start
```

Tarama yap → log'larda göreceksin:

- `[CRNN] Init: ensemble (3 models)` ← yüklendi
- `[CAPTCHA] CRNN solved: ABC12 (conf=0.987, 75ms)` ← çalışıyor
- Veya CRNN reject edildi → `OpenAI fallback` veya `Claude fallback`

## Step 11 — v1.8.0 release

Tüm test başarılıysa:

```bash
cd /Users/narworks/Projects/muhasebe-asistani
# package.json'da version: "1.7.27" → "1.8.0" (manuel veya npm version minor)
npm version minor  # 1.7.27 → 1.8.0, git tag oluşturur
git push && git push --tags
```

GitHub Actions build + macOS notarize + Windows installer üretir, GitHub Releases'a koyar.

---

## Beklenen sonuçlar

| Metric                         | Şu an     | Hedef                   |
| ------------------------------ | --------- | ----------------------- |
| Dataset                        | 10K       | 20K                     |
| CRNN base accuracy             | %83       | %88-92                  |
| Ensemble (3 model) accuracy    | -         | %90-93                  |
| AI fallback (cascade) accuracy | %95       | %99                     |
| **Hibrit total accuracy**      | **%95.4** | **%99.5+** ✅           |
| AI fallback rate               | %74       | %15-25                  |
| Avg inference latency          | 28ms      | ~75ms (3 model paralel) |
