"""CRNN training entry point — local M1/M2 (MPS), CUDA veya CPU.

Usage:
    cd ml-training
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    python train.py --data ../training-data/captcha/v1 --epochs 50 --batch 64

Outputs:
    checkpoints/best.pt           best val accuracy checkpoint
    checkpoints/last.pt           last epoch checkpoint
    checkpoints/training_log.json per-epoch metrics

Tipik süre (M1 Max, 2K sample, 50 epoch): ~30-45 dk
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader
from tqdm import tqdm

from dataset import CaptchaDataset, NUM_CLASSES, BLANK_IDX, collate_fn, indices_to_label
from model import CRNN, count_params


def pick_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def ctc_decode_greedy(log_probs: torch.Tensor) -> list[str]:
    """log_probs: (T, B, C) → list of decoded strings (greedy)."""
    pred = log_probs.argmax(dim=-1).transpose(0, 1)  # (B, T)
    return [indices_to_label(seq.cpu().numpy().tolist()) for seq in pred]


@torch.no_grad()
def evaluate(model, loader, device) -> dict:
    model.train(False)  # inference mode (BatchNorm/Dropout switched off)
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

        log_probs = F.log_softmax(model(images), dim=-1)  # (T, B, C)
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
    p.add_argument("--data", type=str, required=True, help="dataset root (labels.csv + images/)")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--batch", type=int, default=64)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--out", type=str, default="checkpoints")
    args = p.parse_args()

    device = pick_device()
    print(f"[train] device: {device}")

    train_ds = CaptchaDataset(args.data, split="train", augment=True)
    val_ds = CaptchaDataset(args.data, split="val", augment=False)
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
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
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
