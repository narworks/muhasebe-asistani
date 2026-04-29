# CRNN CAPTCHA Training Pipeline

GİB CAPTCHA'larını lokal çözmek için CNN+BiLSTM+CTC tabanlı model eğitim ve ONNX export pipeline'ı.

## Pipeline

```
training-data/captcha/v1/         (collect-captcha-dataset.js çıktısı)
  images/<hash>.png + labels.csv
        │
        ▼
   train.py            (PyTorch eğitim, MPS/CUDA/CPU)
        │
        ▼
   checkpoints/best.pt
        │
        ▼
  export_onnx.py       (ONNX export + INT8 quantize + test set accuracy)
        │
        ▼
   captcha-v1.onnx + .int8.onnx + .metadata.json
        │
        ▼
   main/automation/models/  (Faz 2'de Electron bundle'a kopyalanır)
```

## Kurulum (Mac M1/M2 — MPS GPU ile)

```bash
cd ml-training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

PyTorch MPS (Metal) backend Apple Silicon'da otomatik kullanılır. CUDA veya CPU fallback otomatik seçilir.

## Kullanım

### 1. Eğitim

```bash
python train.py --data ../training-data/captcha/v1 --epochs 50 --batch 64
```

Tipik süre:

- **M1 Max + 2K sample + 50 epoch:** ~30-45 dk
- **M1 Max + 10K sample + 50 epoch:** ~3-4 saat
- **CPU + 2K sample + 50 epoch:** ~3-5 saat
- **A10 GPU (Modal.com) + 10K sample + 50 epoch:** ~30-45 dk

Çıktı:

- `checkpoints/best.pt` — en iyi val accuracy checkpoint'i
- `checkpoints/last.pt` — son epoch
- `checkpoints/training_log.json` — per-epoch metrics

### 2. ONNX Export

```bash
python export_onnx.py \
    --checkpoint checkpoints/best.pt \
    --out captcha-v1.onnx \
    --quantize \
    --test ../training-data/captcha/v1 \
    --version v1
```

Çıktı:

- `captcha-v1.onnx` — FP32 (~15 MB)
- `captcha-v1.int8.onnx` — INT8 quantized (~3-5 MB) — **production'da bu kullanılır**
- `captcha-v1.metadata.json` — version, accuracy, charset, input shape

## Architecture

CNN backbone (7 conv blocks) → variable-width feature map → BiLSTM (256 hidden, 2 layer) → Linear(num_classes) → CTC loss.

- **Input:** grayscale, 32×W (W variable, max 160)
- **Output classes:** 63 (62 alphanumeric + 1 CTC blank)
- **Loss:** CTC (sequence-level, alignment-free)
- **Augmentation:** rotation ±8°, gaussian blur, gaussian noise
- **Optimizer:** AdamW, cosine schedule, gradient clip @ 5.0

## Hedef metric'ler

- **Test set exact-match accuracy:** %95+
- **Inference latency (CPU, ONNX Runtime):** <50ms per image
- **Model size (INT8):** <5 MB

## Modal.com (cloud GPU) — opsiyonel

2K dataset M1'de yeter, ama 10K+ veya hızlı iterasyon istiyorsan Modal.com:

```python
# modal_train.py (örnek; bu repo'da henüz yok, lazım olunca eklenir)
import modal
stub = modal.Stub("captcha-crnn")
image = modal.Image.debian_slim().pip_install_from_requirements("requirements.txt")

@stub.function(image=image, gpu="A10G", timeout=3600)
def train_remote(data_url: str): ...
```

Modal account + token gerekir. Pricing: A10 ~$1.10/h, A100 ~$4/h. Tek run $1-5.

## Sıradaki adımlar

1. `train.py` ile checkpoint üret
2. `export_onnx.py` ile ONNX al
3. Test set accuracy %95+ ise → `main/automation/models/` altına kopyala
4. Faz 2 (Electron integration): `onnxruntime-node` ile UtilityProcess inference
