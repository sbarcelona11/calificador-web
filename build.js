// Empaqueta src/app.html + librerias + src/core.js + src/ui.js en un unico dist/index.html (autocontenido, sin internet).
const fs = require('fs'), path = require('path');
const r = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
let html = r('src/app.html');
const parts = { JSZIP: 'node_modules/jszip/dist/jszip.min.js', XLSX: 'node_modules/xlsx/dist/xlsx.full.min.js', CORE: 'src/core.js', UI: 'src/ui.js' };
for (const [k, p] of Object.entries(parts)) html = html.replace('/*' + k + '*/', () => r(p).replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), html);
console.log('dist/index.html', Math.round(html.length / 1024) + ' KB');
