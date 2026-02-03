#!/usr/bin/env python3

import struct
import zlib
import os

def create_simple_png(width, height, color=(14, 165, 233, 255)):
    """Create a simple solid color PNG"""

    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk (image header)
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    ihdr = struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    png += ihdr

    # IDAT chunk (image data)
    # Create scanlines (filter byte + pixel data)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # Filter type: None
        for x in range(width):
            raw_data += bytes(color)  # RGBA pixels

    compressed = zlib.compress(raw_data, 9)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    png += idat

    # IEND chunk
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    png += iend

    return png

# Create build directory if it doesn't exist
build_dir = os.path.join(os.path.dirname(__file__), '..', 'build')
icons_dir = os.path.join(build_dir, 'icons')
os.makedirs(icons_dir, exist_ok=True)

# Sky blue color (matching the theme)
color = (14, 165, 233, 255)  # #0ea5e9 in RGBA

# Create main icon
main_icon = create_simple_png(512, 512, color)
with open(os.path.join(build_dir, 'icon.png'), 'wb') as f:
    f.write(main_icon)
print('Created icon.png (512x512)')

# Create all required sizes
sizes = [
    (16, '16x16'),
    (32, '32x32'),
    (48, '48x48'),
    (64, '64x64'),
    (128, '128x128'),
    (256, '256x256'),
    (512, '512x512'),
    (1024, '1024x1024')
]

for size, name in sizes:
    icon_data = create_simple_png(size, size, color)
    with open(os.path.join(icons_dir, f'{name}.png'), 'wb') as f:
        f.write(icon_data)
    print(f'Created {name}.png')

print('\n✓ All placeholder icons created successfully!')
print('Note: These are solid color placeholders. Replace with real icons for production.')
