"""
Synthetic CAPTCHA generator — GİB CAPTCHA stilini taklit eden 135×45 RGB görseller.

Live GİB CAPTCHA özellikleri (47xha- örneği):
  - Beyaz/açık arka plan
  - Koyu (siyah/lacivert) bold sans-serif karakterler
  - 5-6 karakter, bazen sonda tire/dash
  - Hafif eğim/rotasyon (-8°…+8°)
  - Yatay altçizgi (scribble karalama)
  - Üst-alt seviyelerde 1-2 çapraz çizgi
  - Sarımsı/turuncu küçük dekorasyon blokları (nadir)

Kullanım:
  python synthetic_generator.py preview --count 10
  python synthetic_generator.py generate --count 100000 --out ../training-data/synthetic/
"""
import argparse
import os
import random
import string
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 135, 45

LOWER_DIGITS = string.ascii_lowercase + string.digits
UPPER = string.ascii_uppercase

# Label uzunluk dağılımı — gerçek dataset 5-6 ağırlıklı
LENGTH_WEIGHTS = [(4, 5), (5, 50), (6, 35), (7, 10)]

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Verdana Bold.ttf",
    "/System/Library/Fonts/Supplemental/Tahoma.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

# Karakter renkleri — saf siyah ağırlıklı (gerçekteki gibi)
TEXT_COLORS = [
    (0, 0, 0),
    (15, 15, 15),
    (25, 25, 25),
    (5, 5, 10),
]

# Çizgi renkleri — siyah (gerçekteki çapraz + altçizgi)
LINE_COLORS = [
    (0, 0, 0),
    (10, 10, 10),
    (30, 30, 30),
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def weighted_choice(items_weights):
    items, weights = zip(*items_weights)
    return random.choices(items, weights=weights, k=1)[0]


def random_label() -> str:
    length = weighted_choice(LENGTH_WEIGHTS)
    chars = []
    for _ in range(length):
        if random.random() < 0.05:
            chars.append(random.choice(UPPER))
        else:
            chars.append(random.choice(LOWER_DIGITS))
    return "".join(chars)


def make_gradient_bg() -> Image.Image:
    """
    Vinyet/gradient grayscale arka plan — gerçekteki en belirgin özellik.
    Yatay gradient (sol açık → sağ koyu) veya tersine, bazen radial.
    Karanlık ucun yoğunluğu varyasyonlu (bazı sample'larda hafif, bazılarında belirgin).
    """
    img = Image.new("RGB", (WIDTH, HEIGHT), "white")
    pixels = img.load()
    direction = random.choice(["lr", "rl", "tb", "bt", "diag"])
    light = random.randint(220, 255)
    dark = random.randint(60, 130)

    for y in range(HEIGHT):
        for x in range(WIDTH):
            if direction == "lr":
                t = x / (WIDTH - 1)
            elif direction == "rl":
                t = 1 - x / (WIDTH - 1)
            elif direction == "tb":
                t = y / (HEIGHT - 1)
            elif direction == "bt":
                t = 1 - y / (HEIGHT - 1)
            else:  # diag
                t = (x / (WIDTH - 1) + y / (HEIGHT - 1)) / 2
            v = int(light + (dark - light) * t)
            pixels[x, y] = (v, v, v)
    return img


def draw_text_chars(img: Image.Image, label: str):
    """
    Karakterleri tek tek bold sans-serif çiz.
    Karakter boyutu HEIGHT'ın %65-75'i (~30-34 px).
    Spacing orta — birbirine değmez ama uzak da değil.
    """
    font_size = random.randint(30, 34)
    font = load_font(font_size)

    n = len(label)
    avail = WIDTH - 12  # 6 px padding her iki yan
    avg_char_w = avail / n
    char_step = avg_char_w * random.uniform(0.92, 1.05)

    for i, ch in enumerate(label):
        canvas_w = max(35, font_size + 6)
        canvas_h = HEIGHT + 10
        char_img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        char_draw = ImageDraw.Draw(char_img)
        color = random.choice(TEXT_COLORS) + (255,)

        # Bold pekiştirme — 1px offset'le tekrar (font built-in bold yetmediğinde)
        for dx, dy in [(0, 0), (1, 0), (0, 1)]:
            char_draw.text((3 + dx, 2 + dy), ch, font=font, fill=color)

        angle = random.uniform(-8, 8)
        char_img = char_img.rotate(angle, resample=Image.BICUBIC, expand=False)

        x = int(6 + i * char_step)
        y = random.randint(-2, 6)
        img.paste(char_img, (x, y), char_img)


def add_underscore_scribble(img: Image.Image):
    """Yatay altçizgi karalama — gerçekteki imza altı tarzı çizgi."""
    if random.random() > 0.7:
        return
    draw = ImageDraw.Draw(img)
    color = random.choice(LINE_COLORS)
    thickness = random.randint(1, 2)
    x = random.randint(0, 15)
    y = HEIGHT - random.randint(4, 12)
    while x < WIDTH - 10:
        dx = random.randint(8, 20)
        dy = random.randint(-2, 2)
        draw.line([x, y, x + dx, y + dy], fill=color, width=thickness)
        x += dx
        y += dy


def add_diagonal_lines(img: Image.Image):
    """1-2 çapraz çizgi karakterleri keser."""
    draw = ImageDraw.Draw(img)
    for _ in range(random.randint(1, 2)):
        color = random.choice(LINE_COLORS)
        thickness = random.randint(1, 2)
        x0 = random.randint(-10, 30)
        y0 = random.randint(0, HEIGHT)
        x1 = random.randint(WIDTH - 30, WIDTH + 10)
        y1 = random.randint(0, HEIGHT)
        draw.line([x0, y0, x1, y1], fill=color, width=thickness)


def add_noise_pixels(img: Image.Image, density: float = 0.01):
    """Hafif salt-pepper grain."""
    pixels = img.load()
    n = int(WIDTH * HEIGHT * density)
    for _ in range(n):
        x = random.randint(0, WIDTH - 1)
        y = random.randint(0, HEIGHT - 1)
        if random.random() < 0.5:
            pixels[x, y] = (random.randint(0, 80),) * 3
        else:
            pixels[x, y] = (random.randint(180, 230),) * 3


def generate_one(label: str = None) -> tuple[Image.Image, str]:
    if label is None:
        label = random_label()
    # Gradient grayscale background (gerçekteki belirgin özellik)
    img = make_gradient_bg()

    draw_text_chars(img, label)
    add_underscore_scribble(img)
    add_diagonal_lines(img)
    add_noise_pixels(img, density=random.uniform(0.005, 0.015))

    if random.random() < 0.3:
        img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.2, 0.5)))
    return img, label


def cmd_preview(args):
    out_dir = Path("/tmp/synthetic_preview")
    out_dir.mkdir(exist_ok=True)
    samples = []
    for i in range(args.count):
        img, label = generate_one()
        path = out_dir / f"{label}_{i:03d}.png"
        img.save(path)
        samples.append((label, path))
        print(f"  {i+1:2d}. {label}")

    cols = (args.count + 1) // 2
    grid = Image.new("RGB", (WIDTH * cols + 10 * (cols - 1), HEIGHT * 2 + 10), "white")
    for i, (_, path) in enumerate(samples):
        row, col = divmod(i, cols)
        x = col * (WIDTH + 10)
        y = row * (HEIGHT + 10)
        grid.paste(Image.open(path), (x, y))
    grid_path = out_dir / "grid.png"
    grid.save(grid_path)
    print(f"\nGrid: {grid_path}")


def cmd_generate(args):
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    labels_csv = out_dir / "labels.csv"

    with open(labels_csv, "w") as f:
        f.write("filename,label\n")
        for i in range(args.count):
            img, label = generate_one()
            filename = f"{label}_synth{i:06d}.png"
            img.save(out_dir / filename)
            f.write(f"{filename},{label}\n")
            if (i + 1) % 5000 == 0:
                print(f"  {i+1}/{args.count}")

    print(f"\nDone. {args.count} samples in {out_dir}")
    print(f"Labels: {labels_csv}")


def main():
    parser = argparse.ArgumentParser(description="Synthetic GİB CAPTCHA generator")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_preview = sub.add_parser("preview", help="Generate small preview batch + grid")
    p_preview.add_argument("--count", type=int, default=10)
    p_preview.set_defaults(func=cmd_preview)

    p_gen = sub.add_parser("generate", help="Generate full training batch")
    p_gen.add_argument("--count", type=int, required=True)
    p_gen.add_argument("--out", type=str, required=True)
    p_gen.set_defaults(func=cmd_generate)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
