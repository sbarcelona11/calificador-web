// E2E con Playwright. Uso: npm run build && MOODLE=/ruta.ods PLANILLA=/ruta.xlsx node test/e2e.js  (requiere: npx playwright install chromium)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://'+process.cwd()+'/dist/index.html');
  await p.fill('#materia', 'IAA'); await p.selectOption('#sede', 'Durazno');
  await p.setInputFiles('#fileM', process.env.MOODLE);
  await p.waitForSelector('#colsT tbody tr');
  console.log(await p.textContent('#msgM'));
  await p.screenshot({ path: require('os').tmpdir()+'/calificador_e2e.png', fullPage: true });
  await p.setInputFiles('#fileT', process.env.PLANILLA);
  await p.waitForSelector('#matchT tbody tr');
  console.log(await p.textContent('#msgT')); console.log(await p.textContent('#sum'));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dl')]);
  await dl.saveAs(require('os').tmpdir()+'/calificador_e2e.xlsx'); console.log('descargado', dl.suggestedFilename());
  await p.click('#gen'); await p.click('#tabs button:nth-child(3)');
  console.log((await p.inputValue('#code')).slice(0, 120));
  await p.screenshot({ path: require('os').tmpdir()+'/calificador_e2e2.png', fullPage: true });
  // persistencia: recargar y volver a cargar
  await p.reload(); await p.fill('#materia', 'IAA'); await p.selectOption('#sede', 'Durazno');
  await p.setInputFiles('#fileM', process.env.MOODLE); await p.waitForSelector('#colsT tbody tr');
  console.log(await p.textContent('#msgM'));
  console.log('errores:', errs);
  await b.close();
})();
