"""CRNN training — mixed dataset (real + synthetic) entry point.

Real (20K) + Synthetic (100K) birleştirilmiş training.

NOT (2026-05-07): Bu pipeline negatif sonuç verdi, production'da kullanılmıyor.
Mixed training (16K real + 80K synth, 30 epoch RTX 4090): mixed val %95.79 ama
real-only test %81.95. Real-only baseline: val %81.00. Production CRNN v1
(captcha-v1.onnx) zaten %92+ yapıyor (telemetri ortaya çıkardı). Synthetic
generator gerçek dağılımı temsil etmediği için model synth'e fit oldu.

Scriptler ileride yapılacak deneyler için baseline olarak kalıyor — yeniden
denemeden önce ya 5× daha çok real data, ya çok daha iyi generator, ya TrOCR.

Usage:
    cd ml-training
    source .venv/bin/activate
    python train_mixed.py \
        --real ../training-data/ddddocr-format \
        --synth ../training-data/synthetic \
        --epochs 30 --batch 128 --seed 2

Outputs:
    checkpoints-v2/best.pt           best val accuracy checkpoint
    checkpoints-v2/last.pt           last epoch checkpoint
    checkpoints-v2/training_log.json per-epoch metrics

RunPod typical (RTX A4000, 120K samples, 30 epoch, batch 128): ~3-4 saat.
M1 Max CPU not recommended (~24h+).
"""

from __future__ import annotations

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader
from tqdm import tqdm

from dataset_mixed import (
    MixedCaptchaDataset, NUM_CLASSES, BLANK_IDX, collate_fn, indices_to_label,
)
from model import CRNN, count_params


def set_all_seeds(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def pick_device() -> torch.device:
    # MPS CTC desteklemiyor — CUDA varsa CUDA, yoksa CPU.
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def ctc_decode_greedy(log_probs: torch.Tensor) -> list[str]:
    pred = log_probs.argmax(dim=-1).transpose(0, 1)
    return [indices_to_label(seq.cpu().numpy().tolist()) for seq in pred]


@torch.no_grad()
def evaluate(model, loader, device) -> dict:
    model.train(False)
    total = 0
    correct = 0
    char_total = 0
    char_correct = 0
    for images, _, _, labels in loader:
        images = images.to(device)
        log_probs = F.log_softmax(model(images), dim=-1)
        preds = ctc_decode_greedy(log_probs)
        for pred, target in zip(preds, labels):
            total += 1
            if pred == target:
                correct += 1
            for pc, tc in zip(pred, target):
                char_total += 1
                if pc == tc:
                    char_correct += 1
            char_total += abs(len(pred) - len(target))
    return {
        "exact_match": correct / total if total else 0.0,
        "char_accuracy": char_correct / char_total if char_total else 0.0,
        "samples": total,
    }


def train_one_epoch(model, loader, criterion, optimizer, device) -> float:
    model.train(True)
    total_loss = 0.0
    n_batches = 0
    pbar = tqdm(loader, desc="train", leave=False)
    for images, targets_concat, target_lengths, _ in pbar:
        images = images.to(device)
        targets_concat = targets_concat.to(device)
        target_lengths = target_lengths.to(device)

        log_probs = F.log_softmax(model(images), dim=-1)
        T, B, _ = log_probs.shape
        input_lengths = torch.full((B,), T, dtype=torch.long, device=device)

        loss = criterion(log_probs, targets_concat, input_lengths, target_lengths)
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
        optimizer.step()

        total_loss += loss.item()
        n_batches += 1
        pbar.set_postfix(loss=f"{loss.item():.3f}")
    return total_loss / max(1, n_batches)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--real", type=str, required=True, help="Real dataset folder (ddddocr format)")
    p.add_argument("--synth", type=str, required=True, help="Synthetic dataset folder")
    p.add_argument("--epochs", type=int, default=30)
    p.add_argument("--batch", type=int, default=128)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--out", type=str, default="checkpoints-v2")
    p.add_argument("--seed", type=int, default=2, help="RNG seed")
    args = p.parse_args()

    set_all_seeds(args.seed)
    device = pick_device()
    print(f"[train] device: {device} | seed: {args.seed}")

    sources = [(args.real, 1.0), (args.synth, 1.0)]

    train_ds = MixedCaptchaDataset(sources, split="train", augment=True, seed=args.seed)
    val_ds = MixedCaptchaDataset(sources, split="val", augment=False, seed=args.seed)
    print(f"[train] train={len(train_ds)} val={len(val_ds)} num_classes={NUM_CLASSES}")

    train_loader = DataLoader(
        train_ds, batch_size=args.batch, shuffle=True,
        collate_fn=collate_fn, num_workers=args.workers, pin_memory=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch, shuffle=False,
        collate_fn=collate_fn, num_workers=args.workers, pin_memory=True,
    )

    model = CRNN(num_classes=NUM_CLASSES).to(device)
    print(f"[train] params: {count_params(model):,}")

    criterion = torch.nn.CTCLoss(blank=BLANK_IDX, zero_infinity=True)
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=5e-4)
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    best_acc = 0.0
    log = []
    t0 = time.time()
    for epoch in range(1, args.epochs + 1):
        train_loss = train_one_epoch(model, train_loader, criterion, optimizer, device)
        scheduler.step()
        val_metrics = evaluate(model, val_loader, device)
        elapsed = time.time() - t0
        line = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "val_exact": round(val_metrics["exact_match"], 4),
            "val_char": round(val_metrics["char_accuracy"], 4),
            "lr": round(scheduler.get_last_lr()[0], 6),
            "elapsed_sec": round(elapsed, 1),
        }
        log.append(line)
        print(
            f"[epoch {epoch:3d}/{args.epochs}] loss={line['train_loss']:.3f} "
            f"val_exact={line['val_exact']*100:.1f}% val_char={line['val_char']*100:.1f}% "
            f"lr={line['lr']} elapsed={int(elapsed)}s"
        )

        torch.save({"model": model.state_dict(), "epoch": epoch}, out_dir / "last.pt")
        if val_metrics["exact_match"] > best_acc:
            best_acc = val_metrics["exact_match"]
            torch.save(
                {"model": model.state_dict(), "epoch": epoch, "val_exact": best_acc},
                out_dir / "best.pt",
            )

    with open(out_dir / "training_log.json", "w") as f:
        json.dump({"epochs": log, "best_val_exact": best_acc}, f, indent=2)
    print(f"[train] DONE — best val_exact = {best_acc*100:.2f}%")


if __name__ == "__main__":
    main()
