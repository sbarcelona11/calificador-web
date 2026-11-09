// Pruebas de la logica pura. Con datos reales opcionales: MOODLE=/ruta.ods PLANILLA=/ruta.xlsx node test/core.test.js
const assert = require('assert'), Core = require('../src/core.js');
const close = (a, b) => assert(Math.abs(a - b) < 1e-9, a + ' != ' + b);

// ---------- escala UTEC (puntos de quiebre de la formula de la planilla) ----------
close(Core.scale(0), 1); close(Core.scale(25), 2); close(Core.scale(50), 2.75); close(Core.scale(59.999), 2.75 + 0.24 * 9.999 / 9); close(Core.scale(60), 3);
close(Core.scale(60.5), 3); close(Core.scale(61), 3.1); close(Core.scale(70), 4); close(Core.scale(90), 5); close(Core.scale(100), 5);

// ---------- maximo mal configurado ----------
assert.strictEqual(Core.suggestMax(40), 40); assert.strictEqual(Core.suggestMax(20), 20); assert.strictEqual(Core.suggestMax(90), 100); assert.strictEqual(Core.suggestMax(0), 100);

// ---------- toNum (separadores de miles / decimal) ----------
assert.strictEqual(Core.toNum('1,5'), 1.5); assert.strictEqual(Core.toNum('1.5'), 1.5);
assert.strictEqual(Core.toNum('1.234,56'), 1234.56); assert.strictEqual(Core.toNum('1,234.56'), 1234.56); assert.strictEqual(Core.toNum('1,234,56'), 1234.56);
assert.strictEqual(Core.toNum('  -5,5  '), -5.5);
assert.strictEqual(Core.toNum('-'), null); assert.strictEqual(Core.toNum('—'), null); assert.strictEqual(Core.toNum(''), null);
assert.strictEqual(Core.toNum(null), null); assert.strictEqual(Core.toNum(42), 42);

// ---------- colLetter ----------
assert.strictEqual(Core.colLetter(0), 'A'); assert.strictEqual(Core.colLetter(25), 'Z'); assert.strictEqual(Core.colLetter(26), 'AA'); assert.strictEqual(Core.colLetter(27), 'AB');

// ---------- calc (H, I, M) ----------
const c1 = Core.calc(100, 100, 100);
assert.strictEqual(c1.I, 'PRUEBA FINAL'); close(c1.E, 5); close(c1.G, 5); close(c1.H, 5); close(c1.M, 5);
const c2 = Core.calc(0, 0, 50);
assert.strictEqual(c2.I, 'RECURSA'); close(c2.H, 1); assert.strictEqual(c2.M, null);
assert.ok(Core.scaleFormula('E2').indexOf('IF(ISBLANK(E2)') === 0);

// ---------- promedio: 4 columnas, una vacia ('-') cuenta como 0 ----------
const st = { row: [100, 50, '-', 40] }, cols = [0, 1, 2, 3].map(i => ({ idx: i, max: i === 3 ? 40 : 100, cat: 'act' }));
close(Core.studentPercents(st, cols, true).act, (100 + 50 + 0 + 100) / 4);
close(Core.studentPercents(st, cols, false).act, (100 + 50 + 100) / 3);

// ---------- emparejamiento por nombre ----------
const stu = [{ id: 0, tok: Core.tokens('MARIA VERONICA COUTO SILVERA'), doc: '' }, { id: 1, tok: Core.tokens('GABRIEL NOLE AYZAGUER'), doc: '' }];
const m = Core.matchRows([{ doc: '', tok: Core.tokens('MARIA VERÓNICA COUTO') }, { doc: '', tok: Core.tokens('GABRIEL GERON') }], stu);
assert.strictEqual(m[0].sid, 0); assert.strictEqual(m[0].status, 'auto'); assert.strictEqual(m[1].sid, null);

// ---------- emparejamiento por documento ----------
const stu2 = [{ id: 0, tok: [], doc: '12345678' }, { id: 1, tok: [], doc: '99999999' }];
const m2 = Core.matchRows([{ doc: '12345678', tok: [] }, { doc: '88888888', tok: [] }], stu2);
assert.strictEqual(m2[0].sid, 0); assert.strictEqual(m2[0].status, 'auto'); assert.strictEqual(m2[1].sid, null);

// ---------- parseMoodle (sintético) ----------
const pm = Core.parseMoodle([
  ['Nombre', 'Apellido', 'CI', 'Dirección de correo', 'Entrega 1', 'Prueba Final'],
  ['Juan', 'Pérez', '12345678', 'juan@x', '80', '90']
]);
assert.strictEqual(pm.students.length, 1);
assert.strictEqual(pm.students[0].name, 'Pérez, Juan');
assert.strictEqual(pm.students[0].doc, '12345678');
assert.strictEqual(pm.cols.length, 2);
assert.strictEqual(pm.cols[0].cat, 'act'); assert.strictEqual(pm.cols[1].cat, 'exam');
assert.strictEqual(pm.cols[1].max, 100); // 90 se toma como nota real sobre 100
// sin columnas Nombre/Apellido -> error claro
assert.throws(function () { Core.parseMoodle([['foo', 'bar'], ['1', '2']]); }, /Nombre/);

// ---------- parseTemplate (sintético) ----------
const pt = Core.parseTemplate([
  ['N°', 'Documento', 'Nombre', 'Actividades ENTREGADAS', 'Escala', 'Participación en Plataforma', 'Escala', 'Evaluación / Prueba Final', 'Escala'],
  ['1', '12345678', 'Pérez, Juan', '', '', '', '', '', '']
]);
assert.strictEqual(pt.cols.act, 'D'); assert.strictEqual(pt.cols.part, 'F'); assert.strictEqual(pt.cols.exam, 'H');
assert.strictEqual(pt.cols.actScale, 'E'); assert.strictEqual(pt.cols.partScale, 'G'); assert.strictEqual(pt.cols.examScale, 'I');
assert.strictEqual(pt.rows.length, 1); assert.strictEqual(pt.rows[0].doc, '12345678'); assert.strictEqual(pt.rows[0].name, 'Pérez, Juan');

// ---------- buildScripts ----------
const scr = Core.buildScripts([
  { doc: '111', E: 4, G: 3.25, M: null },
  { doc: '', E: 5, G: 5, M: 5 },
  { doc: '222', E: 4.5, G: 3.2, M: 2.1 }
]);
assert.strictEqual(scr.counts.act, 2); assert.strictEqual(scr.counts.exam, 1);
assert.ok(scr.act.indexOf('"111": "4"') >= 0); assert.ok(scr.act.indexOf('"222": "4.50"') >= 0);
assert.ok(scr.exam.indexOf('"222": "2.10"') >= 0); assert.ok(scr.exam.indexOf('"111"') < 0);
assert.ok(scr.act.indexOf('document.getElementsByTagName') >= 0);

console.log('OK: pruebas unitarias');

// ---------- patchXlsx (integración, requiere jszip + xlsx) ----------
(async () => {
  let JSZip, XLSX;
  try { JSZip = require('jszip'); XLSX = require('xlsx'); }
  catch (e) { console.log('SKIP: patchXlsx (jszip/xlsx no instalados)'); return; }
  const header = ['N°', 'Documento', 'Nombre', 'Actividades ENTREGADAS', 'Escala', 'Participación en Plataforma', 'Escala', 'Evaluación / Prueba Final', 'Escala'];
  const data = [1, 12345678, 'Pérez, Juan', 80, 4, 70, 3, 60, 4];
  const ws = XLSX.utils.aoa_to_sheet([header, data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Calificador');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const tpl = Core.parseTemplate(XLSX.utils.sheet_to_json(XLSX.read(buf).Sheets['Calificador'], { header: 1, defval: null }));
  tpl.sheetName = 'Calificador';
  assert.strictEqual(tpl.cols.act, 'D'); assert.strictEqual(tpl.cols.part, 'F'); assert.strictEqual(tpl.cols.exam, 'H');
  const out = await Core.patchXlsx(JSZip, buf, tpl, [{ rowNum: 2, act: 85, part: 90, exam: 55 }]);
  const wb2 = XLSX.read(out);
  const rows2 = XLSX.utils.sheet_to_json(wb2.Sheets['Calificador'], { header: 1, defval: null });
  assert.strictEqual(rows2[1][3], 85); assert.strictEqual(rows2[1][5], 90); assert.strictEqual(rows2[1][7], 55);
  // G2 (escala de participación) debe quedar convertida a fórmula (SheetJS no lee fórmulas sin valor en caché: se verifica el XML)
  const z2 = await JSZip.loadAsync(out);
  const sheetObjs = z2.file(/xl\/worksheets\/.*\.xml/);
  let sheetXml = '';
  for (const f of sheetObjs) sheetXml += await f.async('string');
  assert.ok(/<c r="G2"[^>]*><f>/.test(sheetXml), 'G2 debe quedar como fórmula');
  const wbXml = await (await JSZip.loadAsync(out)).file('xl/workbook.xml').async('string');
  assert.ok(/fullCalcOnLoad="1"/.test(wbXml), 'debe forzar recálculo');
  console.log('OK: patchXlsx');
})().catch(e => { console.error('FAIL patchXlsx:', e.message); process.exit(1); });

if (process.env.MOODLE && process.env.PLANILLA) {
  const XLSX = require('xlsx'), fs = require('fs');
  const mw = XLSX.read(fs.readFileSync(process.env.MOODLE)), M = Core.parseMoodle(XLSX.utils.sheet_to_json(mw.Sheets[mw.SheetNames[0]], { header: 1, raw: true, defval: '' }));
  const tw = XLSX.read(fs.readFileSync(process.env.PLANILLA)), T = Core.parseTemplate(XLSX.utils.sheet_to_json(tw.Sheets[tw.SheetNames[0]], { header: 1, defval: null }));
  const mt = Core.matchRows(T.rows, M.students);
  console.log('Datos reales:', M.students.length, 'estudiantes,', T.rows.length, 'filas, emparejadas', mt.filter(x => x.sid != null).length);
}
