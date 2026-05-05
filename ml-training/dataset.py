"""CAPTCHA dataset loader — labels.csv + images/<hash>.png yapısı.

labels.csv format:
    hash,label,confidence,source,timestamp
    abc123,7K9P3,,gpt-4o-mini,2026-04-29T10:00:00Z

Görüntüler `<root>/images/<hash>.png` altında. Charset = [0-9A-Za-z] (62 karakter)
+ CTC blank = index 0 → toplam 63 class.

Augmentation: rotation, perspective, gauss blur, gauss noise. CTC training
sırasında uygulanır; validation ve test set'te uygulanmaz.
"""

from __future__ import annotations

import os
import random
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image, ImageEnhance, ImageFilter
from torch.utils.data import Dataset
from torchvision import transforms


def _find_perspective_coeffs(source_coords, target_coords):
    """8 katsayıyı hesapla — PIL Image.PERSPECTIVE için."""
    matrix = []
    for s, t in zip(source_coords, target_coords):
        matrix.append([t[0], t[1], 1, 0, 0, 0, -s[0] * t[0], -s[0] * t[1]])
        matrix.append([0, 0, 0, t[0], t[1], 1, -s[1] * t[0], -s[1] * t[1]])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(source_coords, dtype=np.float64).reshape(8)
    res = np.linalg.solve(A, B)
    return tuple(res.tolist())

# Charset — CTC için index 0 = blank, 1..62 = karakterler.
CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
BLANK_IDX = 0
CHAR_TO_IDX = {c: i + 1 for i, c in enumerate(CHARSET)}
IDX_TO_CHAR = {i + 1: c for i, c in enumerate(CHARSET)}
NUM_CLASSES = len(CHARSET) + 1  # +1 for blank

# Görüntü hedef boyutu — height sabit 32, width orantılı (variable-length CTC için).
TARGET_HEIGHT = 32
MAX_WIDTH = 160  # GİB CAPTCHA tipik 100-150px


def label_to_indices(label: str) -> list[int]:
    """Etiket string'ini CTC class index'lerine çevir (1-tabanlı, 0 blank için ayrılmış)."""
    return [CHAR_TO_IDX[c] for c in label]


def indices_to_label(indices: list[int]) -> str:
    """CTC decode sonucu index dizisini string'e çevir (blank ve repeat'leri çıkar)."""
    out = []
    prev = BLANK_IDX
    for idx in indices:
        if idx != BLANK_IDX and idx != prev:
            out.append(IDX_TO_CHAR.get(int(idx), ""))
        prev = idx
    return "".join(out)


class CaptchaDataset(Dataset):
    """labels.csv'den okur, image'leri grayscale + fixed-height resize ile yükler.

    Args:
        root: training-data/captcha/v1 klasörü
        split: 'train' | 'val' | 'test'  (csv 80/10/10 deterministic split)
        augment: True ise training augmentation uygulanır
        seed: split'in deterministik olması için (default 42)
    """

    def __init__(
        self,
        root: str | Path,
        split: str = "train",
        augment: bool = False,
        seed: int = 42,
    ):
        self.root = Path(root)
        self.images_dir = self.root / "images"
        self.augment = augment

        df = pd.read_csv(self.root / "labels.csv")
        df = df.dropna(subset=["hash", "label"]).reset_index(drop=True)

        # Deterministic shuffle + 80/10/10 split
        rng = np.random.default_rng(seed)
        perm = rng.permutation(len(df))
        df = df.iloc[perm].reset_index(drop=True)
        n = len(df)
        train_end = int(n * 0.8)
        val_end = int(n * 0.9)
        if split == "train":
            df = df.iloc[:train_end]
        elif split == "val":
            df = df.iloc[train_end:val_end]
        elif split == "test":
            df = df.iloc[val_end:]
        else:
            raise ValueError(f"Invalid split: {split}")

        self.records = df[["hash", "label"]].to_records(index=False)

        # Sadece input normalisation (augmentation forward'da inline)
        self.to_tensor = transforms.Compose(
            [
                transforms.Grayscale(num_output_channels=1),
                transforms.ToTensor(),  # 0..1
                transforms.Normalize(mean=[0.5], std=[0.5]),  # -1..1
            ]
        )

    def __len__(self) -> int:
        return len(self.records)

    def _load_image(self, hash_str: str) -> Image.Image:
        path = self.images_dir / f"{hash_str}.png"
        return Image.open(path).convert("L")

    def _augment(self, img: Image.Image) -> Image.Image:
        """Stronger augmentation pipeline — overfit'i azaltır.

        Önceki sürüm hafif (rotation ±8°, blur, noise) idi; model 8K
        train data'sını çabuk ezberliyordu. Bu sürüm perspective +
        brightness + erasing ekleyerek varyasyon arttırır.
        """
        w, h = img.size

        # Rotation ±15° (önceki ±8°)
        if random.random() < 0.6:
            angle = random.uniform(-15, 15)
            img = img.rotate(angle, resample=Image.BILINEAR, fillcolor=255)

        # Perspective transform (CAPTCHA tipik perspective içerir)
        if random.random() < 0.4:
            max_warp = 0.10
            dx, dy = w * max_warp, h * max_warp
            src = [(0, 0), (w, 0), (w, h), (0, h)]
            dst = [
                (random.uniform(-dx, dx), random.uniform(-dy, dy)),
                (w + random.uniform(-dx, dx), random.uniform(-dy, dy)),
                (w + random.uniform(-dx, dx), h + random.uniform(-dy, dy)),
                (random.uniform(-dx, dx), h + random.uniform(-dy, dy)),
            ]
            try:
                coeffs = _find_perspective_coeffs(src, dst)
                img = img.transform(
                    (w, h), Image.PERSPECTIVE, coeffs, Image.BILINEAR, fillcolor=255
                )
            except np.linalg.LinAlgError:
                pass  # rare singular matrix — skip

        # Brightness/contrast jitter
        if random.random() < 0.4:
            factor = random.uniform(0.7, 1.3)
            img = ImageEnhance.Brightness(img).enhance(factor)
        if random.random() < 0.3:
            factor = random.uniform(0.7, 1.3)
            img = ImageEnhance.Contrast(img).enhance(factor)

        # Gauss blur
        if random.random() < 0.3:
            img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.3, 1.0)))

        # Gauss noise (hafif güçlendirildi)
        if random.random() < 0.4:
            arr = np.array(img, dtype=np.float32)
            noise = np.random.normal(0, random.uniform(5, 15), arr.shape)
            arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
            img = Image.fromarray(arr)

        # Random erasing — küçük patch'ler beyaz/siyah ile silinir
        if random.random() < 0.3:
            arr = np.array(img)
            erase_w = max(1, int(w * random.uniform(0.05, 0.15)))
            erase_h = max(1, int(h * random.uniform(0.05, 0.20)))
            if erase_w < w and erase_h < h:
                ex = random.randint(0, w - erase_w)
                ey = random.randint(0, h - erase_h)
                fill = random.choice([0, 128, 255])
                arr[ey : ey + erase_h, ex : ex + erase_w] = fill
                img = Image.fromarray(arr)

        return img

    def _resize(self, img: Image.Image) -> Image.Image:
        w, h = img.size
        new_w = int(w * TARGET_HEIGHT / h)
        new_w = min(new_w, MAX_WIDTH)
        new_w = max(new_w, 32)
        return img.resize((new_w, TARGET_HEIGHT), Image.BILINEAR)

    def __getitem__(self, idx: int):
        rec = self.records[idx]
        hash_str = str(rec.hash)
        label = str(rec.label)

        img = self._load_image(hash_str)
        if self.augment:
            img = self._augment(img)
        img = self._resize(img)

        tensor = self.to_tensor(img)  # (1, H, W)
        targets = torch.tensor(label_to_indices(label), dtype=torch.long)
        return tensor, targets, label


def collate_fn(batch):
    """Variable-width image'leri pad eder + CTC için target_lengths/input_lengths verir."""
    images, targets, labels = zip(*batch)

    # Pad to max width in batch
    max_w = max(img.shape[-1] for img in images)
    padded = []
    for img in images:
        if img.shape[-1] < max_w:
            pad = torch.zeros(1, img.shape[1], max_w - img.shape[-1])
            img = torch.cat([img, pad], dim=-1)
        padded.append(img)
    images_tensor = torch.stack(padded, dim=0)  # (B, 1, H, W)

    target_lengths = torch.tensor([len(t) for t in targets], dtype=torch.long)
    targets_concat = torch.cat(targets, dim=0)
    return images_tensor, targets_concat, target_lengths, list(labels)


def get_image_size():
    return TARGET_HEIGHT, MAX_WIDTH
