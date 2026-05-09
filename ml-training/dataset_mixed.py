"""Mixed CAPTCHA dataset loader — real (20K) + synthetic (100K) birleştir.

Format (her iki source da aynı):
  <root>/<label>_<id>.png            # ddddocr-style filename
  Örnek: 326rk_67aa5b98801ddc3d.png  (real)
         326rk_synth000042.png        (synthetic)

Label filename'den parse edilir (split('_')[0]).

Kullanım:
  ds = MixedCaptchaDataset(
      sources=[
          ('../training-data/ddddocr-format', 1.0),  # real, full weight
          ('../training-data/synthetic', 1.0),       # synth, full weight
      ],
      split='train', augment=True,
  )

Split: deterministic 80/10/10 her source için AYRI uygulanır — yani 20K real'in
%80'i + 100K synth'in %80'i train'e girer. Bu real distribution'ı val/test'te
korumayı garantiler (synth'in real'i gölgelemesini önler).

Augmentation aynı (rotation, perspective, blur, noise, erasing).
"""

from __future__ import annotations

import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageEnhance, ImageFilter
from torch.utils.data import Dataset
from torchvision import transforms

# Charset — CTC için index 0 = blank, 1..62 = karakterler.
CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
BLANK_IDX = 0
CHAR_TO_IDX = {c: i + 1 for i, c in enumerate(CHARSET)}
IDX_TO_CHAR = {i + 1: c for i, c in enumerate(CHARSET)}
NUM_CLASSES = len(CHARSET) + 1

TARGET_HEIGHT = 32
MAX_WIDTH = 160

# Generator label charset includes lowercase + digits + (rare) uppercase.
# Verify all chars present in CHARSET; skip otherwise.
_VALID_CHARS = set(CHARSET)


def _find_perspective_coeffs(source_coords, target_coords):
    matrix = []
    for s, t in zip(source_coords, target_coords):
        matrix.append([t[0], t[1], 1, 0, 0, 0, -s[0] * t[0], -s[0] * t[1]])
        matrix.append([0, 0, 0, t[0], t[1], 1, -s[1] * t[0], -s[1] * t[1]])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(source_coords, dtype=np.float64).reshape(8)
    res = np.linalg.solve(A, B)
    return tuple(res.tolist())


def label_to_indices(label: str) -> list[int]:
    return [CHAR_TO_IDX[c] for c in label]


def indices_to_label(indices: list[int]) -> str:
    out = []
    prev = BLANK_IDX
    for idx in indices:
        if idx != BLANK_IDX and idx != prev:
            out.append(IDX_TO_CHAR.get(int(idx), ""))
        prev = idx
    return "".join(out)


def _scan_source(root: Path) -> list[tuple[Path, str]]:
    """Klasördeki tüm <label>_<id>.png dosyalarını oku → (path, label) listesi."""
    items = []
    for png in root.glob("*.png"):
        stem = png.stem  # without .png
        label = stem.split("_")[0]
        # Charset filtresi — generator nadir uppercase üretebilir, hepsi CHARSET'te zaten var
        if not label or any(c not in _VALID_CHARS for c in label):
            continue
        if not (4 <= len(label) <= 7):
            continue
        items.append((png, label))
    return items


class MixedCaptchaDataset(Dataset):
    """
    Multiple source'ları birleştir + her source için ayrı 80/10/10 split.

    Args:
        sources: [(root_path, weight), ...] — weight şimdilik unused (ileride
                 over/undersample için), liste sırası önemli değil.
        split: 'train' | 'val' | 'test'
        augment: True ise stronger augmentation pipeline (training)
        seed: deterministic split için (default 42)
    """

    def __init__(
        self,
        sources: list[tuple[str, float]],
        split: str = "train",
        augment: bool = False,
        seed: int = 42,
    ):
        self.augment = augment
        self.records: list[tuple[Path, str]] = []

        rng = np.random.default_rng(seed)

        per_source_summary = []
        for src_path, _weight in sources:
            root = Path(src_path)
            items = _scan_source(root)
            if not items:
                print(f"[dataset] WARNING: 0 samples in {root}")
                continue

            # Source-içi deterministic shuffle
            idxs = rng.permutation(len(items))
            items = [items[i] for i in idxs]

            n = len(items)
            train_end = int(n * 0.8)
            val_end = int(n * 0.9)

            if split == "train":
                chunk = items[:train_end]
            elif split == "val":
                chunk = items[train_end:val_end]
            elif split == "test":
                chunk = items[val_end:]
            else:
                raise ValueError(f"Invalid split: {split}")

            self.records.extend(chunk)
            per_source_summary.append((str(root.name), len(chunk), n))

        # Global shuffle (source mixing — train sırasında source order bias olmasın)
        if split == "train":
            self_idxs = rng.permutation(len(self.records))
            self.records = [self.records[i] for i in self_idxs]

        if not self.records:
            raise RuntimeError(f"No samples loaded for split '{split}'")

        # Summary log
        for name, take, total in per_source_summary:
            pct = (take / total * 100) if total else 0
            print(f"[dataset] {split:5s} {name:25s} {take:>6d}/{total:<6d} ({pct:.0f}%)")

        self.to_tensor = transforms.Compose(
            [
                transforms.Grayscale(num_output_channels=1),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.5], std=[0.5]),
            ]
        )

    def __len__(self) -> int:
        return len(self.records)

    def _load_image(self, path: Path) -> Image.Image:
        return Image.open(path).convert("L")

    def _augment(self, img: Image.Image) -> Image.Image:
        w, h = img.size

        if random.random() < 0.6:
            angle = random.uniform(-15, 15)
            img = img.rotate(angle, resample=Image.BILINEAR, fillcolor=255)

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
                pass

        if random.random() < 0.4:
            factor = random.uniform(0.7, 1.3)
            img = ImageEnhance.Brightness(img).enhance(factor)
        if random.random() < 0.3:
            factor = random.uniform(0.7, 1.3)
            img = ImageEnhance.Contrast(img).enhance(factor)

        if random.random() < 0.3:
            img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.3, 1.0)))

        if random.random() < 0.4:
            arr = np.array(img, dtype=np.float32)
            noise = np.random.normal(0, random.uniform(5, 15), arr.shape)
            arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
            img = Image.fromarray(arr)

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
        path, label = self.records[idx]
        img = self._load_image(path)
        if self.augment:
            img = self._augment(img)
        img = self._resize(img)
        tensor = self.to_tensor(img)
        targets = torch.tensor(label_to_indices(label), dtype=torch.long)
        return tensor, targets, label


def collate_fn(batch):
    images, targets, labels = zip(*batch)
    max_w = max(img.shape[-1] for img in images)
    padded = []
    for img in images:
        if img.shape[-1] < max_w:
            pad = torch.zeros(1, img.shape[1], max_w - img.shape[-1])
            img = torch.cat([img, pad], dim=-1)
        padded.append(img)
    images_tensor = torch.stack(padded, dim=0)
    target_lengths = torch.tensor([len(t) for t in targets], dtype=torch.long)
    targets_concat = torch.cat(targets, dim=0)
    return images_tensor, targets_concat, target_lengths, list(labels)


def get_image_size():
    return TARGET_HEIGHT, MAX_WIDTH
