#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create a minimal 1x1 transparent PNG
// PNG signature + IHDR + IDAT + IEND chunks
const minimalPNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
  0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x00, // Width: 512, Height: 512
  0x08, 0x06, 0x00, 0x00, 0x00, 0x03, 0xED, 0x6A, // RGBA, deflate, etc + CRC
  0x72, // CRC
  0x00, 0x00, 0x00, 0x01, 0x73, 0x52, 0x47, 0x42, // sRGB chunk
  0x00, 0xAE, 0xCE, 0x1C, 0xE9,
  0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, // IDAT (minimal data)
  0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05,
  0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, // IEND
  0xAE, 0x42, 0x60, 0x82
]);

const buildDir = path.join(__dirname, '..', 'build');
const iconsDir = path.join(buildDir, 'icons');

// Ensure directories exist
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Write PNG files
const sizes = ['16x16', '32x32', '48x48', '64x64', '128x128', '256x256', '512x512', '1024x1024'];
sizes.forEach(size => {
  fs.writeFileSync(path.join(iconsDir, `${size}.png`), minimalPNG);
  console.log(`Created ${size}.png`);
});

// Write icon.png (used as source)
fs.writeFileSync(path.join(buildDir, 'icon.png'), minimalPNG);
console.log('Created icon.png');

console.log('✓ Placeholder icons created successfully!');
console.log('Note: These are minimal placeholders. Replace with real icons for production.');
