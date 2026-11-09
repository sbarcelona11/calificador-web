// Modo desarrollo: rearma dist/index.html ante cada cambio en src/ y sirve en http://localhost:8081
// Uso: npm run dev
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const watch = ['build.js', 'src/app.html', 'src/core.js', 'src/ui.js'].map(f => path.join(__dirname, f));
let timer = null;
function build() {
  try { execSync('node build.js', { stdio: 'inherit' }); }
  catch (e) { console.error('build falló:', e.message); }
}
build();
watch.forEach(f => fs.watchFile(f, { interval: 250 }, () => { clearTimeout(timer); timer = setTimeout(build, 150); }));
require('./serve.js');
