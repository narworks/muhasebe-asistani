const fs = require('fs');
const path = require('path');

// Read the built index.html
const htmlPath = path.join(__dirname, '../dist/index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace absolute paths with relative paths
html = html.replace(/src="\/assets\//g, 'src="./assets/');
html = html.replace(/href="\/assets\//g, 'href="./assets/');

// Write back
fs.writeFileSync(htmlPath, html);

console.log('✅ Fixed asset paths in index.html');
