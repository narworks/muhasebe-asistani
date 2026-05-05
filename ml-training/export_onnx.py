"""ONNX export + opsiyonel INT8 quantization.

Usage:
    python export_onnx.py \
        --checkpoint checkpoints/best.pt \
        --out captcha-v1.onnx \
        --quantize

Outputs:
    captcha-v1.onnx                FP32 ONNX model
    captcha-v1.int8.onnx           INT8 quantized (--quantize ile)
    captcha-v1.metadata.json       version, accuracy, charset, input shape

Test inference: --test ../training-data/captcha/v1 (test split'te accuracy ölç)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

from dataset import CaptchaDataset, NUM_CLASSES, TARGET_HEIGHT, MAX_WIDTH, indices_to_label, CHARSET
from model import CRNN


def export_fp32(checkpoint_path: Path, out_path: Path):
    state = torch.load(checkpoint_path, map_location="cpu")
    model = CRNN(num_classes=NUM_CLASSES)
    model.load_state_dict(state["model"])
    model.train(False)  # inference mode

    # Dynamic width — ONNX dinamik axis ile değişken W destekler.
    # NOT: PyTorch 2.11+ yeni dynamo-based exporter LSTM + dinamik W ile
    # 'GuardOnDataDependentSymNode' atıyor → legacy TorchScript exporter
    # (dynamo=False) kullanıyoruz, bu kombinasyonu sorunsuz handle ediyor.
    dummy = torch.randn(1, 1, TARGET_HEIGHT, MAX_WIDTH)
    torch.onnx.export(
        model,
        dummy,
        str(out_path),
        input_names=["image"],
        output_names=["log_probs"],
        dynamic_axes={"image": {0: "batch", 3: "width"}, "log_probs": {0: "time", 1: "batch"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )

    # Validate
    onnx_model = onnx.load(str(out_path))
    onnx.checker.check_model(onnx_model)
    print(f"[export] FP32 ONNX: {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


def quantize_int8(fp32_path: Path, int8_path: Path):
    from onnxruntime.quantization import quantize_dynamic, QuantType

    quantize_dynamic(
        model_input=str(fp32_path),
        model_output=str(int8_path),
        weight_type=QuantType.QInt8,
    )
    print(f"[export] INT8 ONNX: {int8_path} ({int8_path.stat().st_size / 1024:.1f} KB)")


def ctc_decode_logprobs(log_probs: np.ndarray) -> str:
    pred = log_probs.argmax(axis=-1).squeeze(1)  # (T,)
    return indices_to_label(pred.tolist())


def evaluate_onnx(onnx_path: Path, dataset_root: Path):
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    test_ds = CaptchaDataset(dataset_root, split="test", augment=False)
    n_total = len(test_ds)
    n_correct = 0
    for i in range(n_total):
        tensor, _, label = test_ds[i]  # (1, H, W)
        # Pad/crop to MAX_WIDTH for fixed-shape inference
        c, h, w = tensor.shape
        if w < MAX_WIDTH:
            pad = torch.zeros(c, h, MAX_WIDTH - w)
            tensor = torch.cat([tensor, pad], dim=-1)
        elif w > MAX_WIDTH:
            tensor = tensor[:, :, :MAX_WIDTH]
        x = tensor.unsqueeze(0).numpy()  # (1, 1, H, W)
        outputs = session.run(["log_probs"], {"image": x})[0]  # (T, 1, C)
        pred = ctc_decode_logprobs(outputs)
        if pred == label:
            n_correct += 1
    acc = n_correct / n_total if n_total else 0.0
    print(f"[export] Test set accuracy ({onnx_path.name}): {n_correct}/{n_total} = {acc*100:.2f}%")
    return acc


def write_metadata(out_path: Path, version: str, test_accuracy: float, sample_count: int):
    meta = {
        "version": version,
        "architecture": "CRNN (CNN+BiLSTM+CTC)",
        "input_shape": [1, 1, TARGET_HEIGHT, MAX_WIDTH],
        "input_format": "grayscale, height=32, variable width up to 160, normalized [-1,1]",
        "output_format": "log_probs (T, B, num_classes), CTC decode (greedy)",
        "charset": CHARSET,
        "blank_idx": 0,
        "num_classes": NUM_CLASSES,
        "test_accuracy": round(test_accuracy, 4),
        "training_sample_count": sample_count,
    }
    out_path.write_text(json.dumps(meta, indent=2))
    print(f"[export] Metadata: {out_path}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", type=str, default="checkpoints/best.pt")
    p.add_argument("--out", type=str, default="captcha-v1.onnx")
    p.add_argument("--quantize", action="store_true", help="INT8 quantize ek olarak")
    p.add_argument("--test", type=str, default=None, help="Test set accuracy ölç (dataset root)")
    p.add_argument("--version", type=str, default="v1")
    args = p.parse_args()

    checkpoint_path = Path(args.checkpoint)
    out_path = Path(args.out)

    export_fp32(checkpoint_path, out_path)

    int8_path = None
    if args.quantize:
        int8_path = out_path.with_suffix(".int8.onnx")
        quantize_int8(out_path, int8_path)

    test_acc = 0.0
    sample_count = 0
    if args.test:
        dataset_root = Path(args.test)
        # Sample count = labels.csv satır sayısı
        import pandas as pd
        sample_count = len(pd.read_csv(dataset_root / "labels.csv"))
        # Hangi modeli test edeceğimizi seç — INT8 varsa onu, yoksa FP32
        eval_target = int8_path if int8_path else out_path
        test_acc = evaluate_onnx(eval_target, dataset_root)

    metadata_path = out_path.with_suffix(".metadata.json")
    write_metadata(metadata_path, args.version, test_acc, sample_count)


if __name__ == "__main__":
    main()
