/* Lógica pura (sin DOM). Funciona en navegador (global Core) y en Node (module.exports). */
(function (root) {
  'use strict';

  // ---------- utilidades ----------
  function toNum(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    var s = String(v).trim();
    if (s === '' || s === '-' || s === '—') return null;
    // Admite separador de miles: el último separador (, o .) es el decimal; el resto son miles.
    var ld = s.lastIndexOf('.'), lc = s.lastIndexOf(',');
    if (lc > ld || ld > lc) {
      var dec = Math.max(lc, ld);
      s = s.slice(0, dec).replace(/[.,\s]/g, '') + '.' + s.slice(dec + 1).replace(/[^0-9]/g, '');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function round2(x) { return Math.round(x * 100) / 100; }
  function colLetter(i) { // 0 -> A
    var s = ''; i++;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  var STOP = { DE: 1, DEL: 1, LA: 1, LAS: 1, LOS: 1, DA: 1, DO: 1, DOS: 1, Y: 1, E: 1 };
  function tokens(s) {
    var t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ').trim().split(' ');
    var out = [];
    t.forEach(function (w) { if (w && !STOP[w] && out.indexOf(w) < 0) out.push(w); });
    return out;
  }

  // ---------- escala UTEC (misma fórmula que columnas E / G / M de la planilla) ----------
  function scale(x) {
    if (x < 25) return x * 0.99 / 24 + 1;
    if (x < 50) return (x - 25) * 0.74 / 24 + 2;
    if (x < 60) return (x - 50) * 0.24 / 9 + 2.75;
    if (x < 61) return 3;
    if (x < 70) return (x - 61) / 9 + 3.1;
    if (x < 90) return (x - 70) * 0.99 / 19 + 4;
    if (x <= 100) return 5;
    return NaN;
  }
  // Réplica de H, I y M de la planilla (para vista previa y scripts de Moodle)
  function calc(actPct, partPct, examPct) {
    var E = scale(actPct), G = scale(partPct);
    var H = G >= 3 ? (E >= 3 ? E * 0.6 + G * 0.4 : 2 + (E * 0.6 + G * 0.4) / 100) : G;
    var I = H <= 1 ? 'RECURSA' : H < 2 ? 'RECURSA O EXAMEN ÚNICO' : H < 3 ? 'TUTORÍA' : 'PRUEBA FINAL';
    var M = H < 2 ? null : scale(examPct); // null = "NO CORRESPONDE"
    return { E: E, G: G, H: H, I: I, M: M };
  }

  // ---------- Moodle ----------
  var SKIP_COL = /^(ultima descarga|última descarga|total del curso)/i;
  function suggestCategory(name) {
    var n = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/prueba final|examen/.test(n)) return 'exam';
    if (/cierre/.test(n)) return 'part';
    if (/pre-?eval|^tarea:|entrega/.test(n)) return 'act';
    return '';
  }
  function suggestMax(obsMax) {
    if (!(obsMax > 0)) return 100;
    if (obsMax >= 80 && obsMax <= 100) return 100; // nota "real" sobre 100 (aunque nadie sacó 100)
    return round2(obsMax); // 40, 20, ... = columna mal configurada: ese máximo es el 100 %
  }
  /** rows: array de arrays (hoja completa). */
  function parseMoodle(rows) {
    var hi = 0;
    for (var r = 0; r < Math.min(rows.length, 10); r++) {
      var low = (rows[r] || []).map(function (c) { return String(c == null ? '' : c).toLowerCase(); });
      if (low.indexOf('nombre') >= 0 && low.some(function (c) { return c.indexOf('apellido') === 0; })) { hi = r; break; }
    }
    var head = (rows[hi] || []).map(function (c) { return String(c == null ? '' : c).trim(); });
    var low = head.map(function (c) { return c.toLowerCase(); });
    var iFirst = low.indexOf('nombre');
    var iLast = low.findIndex(function (c) { return c.indexOf('apellido') === 0; });
    if (iFirst < 0 || iLast < 0) throw new Error('No encuentro las columnas "Nombre" y "Apellido" en la exportación de Moodle.');
    var iUser = low.findIndex(function (c) { return c.indexOf('nombre de usuario') === 0 || c === 'username'; });
    var iDoc = low.findIndex(function (c) { return /^(n[uú]mero de id|id number|documento|c[eé]dula|ci)$/.test(c); });
    var data = rows.slice(hi + 1).filter(function (r) { return r && (r[iFirst] || r[iLast]); });
    var cols = [];
    head.forEach(function (name, idx) {
      if (!name || idx === iFirst || idx === iLast || idx === iUser || idx === iDoc || SKIP_COL.test(name)) return;
      var vals = data.map(function (r) { return toNum(r[idx]); }).filter(function (v) { return v !== null; });
      var raw = data.filter(function (r) { var v = r[idx]; return v != null && String(v).trim() !== '' && String(v).trim() !== '-' && toNum(v) === null; });
      if (raw.length) return; // no es columna numérica (institución, correo, etc.)
      if (!vals.length && /correo|instituci|departamento|email/i.test(name)) return;
      var obs = vals.length ? Math.max.apply(null, vals) : 0;
      cols.push({ idx: idx, name: name, n: vals.length, obsMax: obs, max: suggestMax(obs), cat: vals.length ? suggestCategory(name) : '' });
    });
    var students = data.map(function (r, k) {
      var first = String(r[iFirst] || '').trim(), last = String(r[iLast] || '').trim();
      return { id: k, first: first, last: last, name: (last + ', ' + first).replace(/^, |, $/g, ''),
        user: iUser >= 0 ? String(r[iUser] || '') : '', doc: iDoc >= 0 ? String(r[iDoc] || '').replace(/\D+/g, '') : '',
        tok: tokens(first + ' ' + last), row: r };
    });
    return { head: head, cols: cols, students: students };
  }
  /** cols: [{idx,max,cat}] ya con la asignación. Devuelve porcentajes (0-100) o null si la categoría no tiene columnas. */
  function studentPercents(st, cols, dashAsZero) {
    var out = {};
    ['act', 'part', 'exam'].forEach(function (cat) {
      var cs = cols.filter(function (c) { return c.cat === cat; });
      if (!cs.length) { out[cat] = null; return; }
      var sum = 0, n = 0;
      cs.forEach(function (c) {
        var v = toNum(st.row[c.idx]);
        if (v === null) { if (dashAsZero) { n++; } return; }
        var max = c.max > 0 ? c.max : 100;
        sum += Math.min(v / max * 100, 100); n++;
      });
      out[cat] = n ? sum / n : 0;
    });
    return out;
  }

  // ---------- planilla (calificador) ----------
  /** rows: array de arrays de la hoja (SheetJS header:1). */
  function parseTemplate(rows) {
    var find = function (re) {
      for (var r = 0; r < Math.min(rows.length, 20); r++)
        for (var c = 0; c < (rows[r] || []).length; c++)
          if (typeof rows[r][c] === 'string' && re.test(rows[r][c].normalize('NFD').replace(/[̀-ͯ]/g, ''))) return { r: r, c: c };
      return null;
    };
    var a = find(/actividades entregadas/i), p = find(/participacion en plataforma/i), e = find(/evaluacion \/ prueba final|prueba final/i);
    if (!a || !p || !e) throw new Error('No encuentro los encabezados "Actividades ENTREGADAS", "Participación en Plataforma" y "Evaluación / Prueba Final" en la planilla.');
    var hdrRow = Math.max(a.r, p.r, e.r);
    var students = [];
    var started = false;
    for (var r = hdrRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var name = typeof row[2] === 'string' ? row[2].trim() : '';
      var isData = name && (typeof row[1] === 'number' || /^\d+$/.test(String(row[1] || '')) || started);
      if (!name) { if (started) break; else continue; }
      if (!isData) continue;
      started = true;
      var doc = row[1] == null ? '' : String(row[1]).replace(/\D+/g, '');
      students.push({ rowNum: r + 1, doc: doc, name: name, tok: tokens(name) });
    }
    return { cols: { act: colLetter(a.c), part: colLetter(p.c), exam: colLetter(e.c),
        actScale: colLetter(a.c + 1), partScale: colLetter(p.c + 1), examScale: colLetter(e.c + 1) }, rows: students };
  }

  /** Empareja filas de planilla con estudiantes de Moodle (por documento si existe, si no por nombre). */
  function matchRows(tplRows, students) {
    return tplRows.map(function (tr) {
      if (tr.doc) {
        var byDoc = students.filter(function (s) { return s.doc && s.doc === tr.doc; });
        if (byDoc.length === 1) return { sid: byDoc[0].id, status: 'auto', score: 1 };
      }
      var scored = students.map(function (s) {
        var shared = tr.tok.filter(function (t) { return s.tok.indexOf(t) >= 0; }).length;
        var score = shared / Math.max(1, Math.min(tr.tok.length, s.tok.length));
        return { s: s, shared: shared, score: score, jac: shared / (tr.tok.length + s.tok.length - shared || 1) };
      }).filter(function (x) { return x.shared >= 2 && x.score >= 0.6; })
        .sort(function (x, y) { return y.score - x.score || y.jac - x.jac; });
      if (!scored.length) return { sid: null, status: 'none', score: 0 };
      var best = scored[0], second = scored[1];
      var unique = !second || second.score < best.score || second.jac < best.jac;
      return { sid: best.s.id, status: best.score === 1 && unique ? 'auto' : 'review', score: best.score };
    });
  }

  // ---------- escritura en el .xlsx (parche XML: conserva logo, tabla, estilos y fórmulas) ----------
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function scaleFormula(c) {
    return 'IF(ISBLANK(' + c + '),"Pendiente",IF(' + c + '<25,' + c + '*0.99/24+1,IF(' + c + '<50,(' + c + '-25)*0.74/24+2,IF(' + c +
      '<60,(' + c + '-50)*0.24/9+2.75,IF(' + c + '<61,3,IF(' + c + '<70,(' + c + '-61)/9+3.1,IF(' + c + '<90,(' + c + '-70)*0.99/19+4,IF(' + c + '<=100,5,"#ERROR"))))))))';
  }
  function cellRe(ref) { return new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)'); }
  function setCell(xml, ref, content) {
    var re = cellRe(ref), m = re.exec(xml);
    if (!m) throw new Error('La celda ' + ref + ' no existe en la planilla.');
    var s = /\ss="(\d+)"/.exec(m[1]);
    var rep = '<c r="' + ref + '"' + (s ? ' s="' + s[1] + '"' : '') + '>' + content + '</c>';
    return xml.replace(re, function () { return rep; });
  }
  function hasFormula(xml, ref) { var m = cellRe(ref).exec(xml); return !!(m && m[2] && m[2].indexOf('<f') >= 0); }

  /** updates: [{rowNum, act, part, exam}] (porcentajes). allRows: todos los rowNum de datos de la planilla. */
  async function patchXlsx(JSZip, buf, tpl, updates) {
    var zip = await JSZip.loadAsync(buf);
    var wb = await zip.file('xl/workbook.xml').async('string');
    var rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    // Localiza la hoja de la planilla por su nombre (si lo sabemos) o cae en la primera.
    var sheetRe = tpl.sheetName
      ? new RegExp('<sheet [^>]*name="' + tpl.sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>')
      : /<sheet [^>]*>/;
    var sheetTag = sheetRe.exec(wb);
    if (!sheetTag) throw new Error('No encuentro la hoja "' + (tpl.sheetName || 'principal') + '" en la planilla.');
    var rid = /r:id="([^"]+)"/.exec(sheetTag[0])[1];
    var target = new RegExp('<Relationship [^>]*Id="' + rid + '"[^>]*>').exec(rels)[0];
    var path = 'xl/' + /Target="([^"]+)"/.exec(target)[1].replace(/^\/?(xl\/)?/, '');
    var xml = await zip.file(path).async('string');
    var C = tpl.cols;

    updates.forEach(function (u) {
      xml = setCell(xml, C.act + u.rowNum, '<v>' + round2(u.act) + '</v>');
      xml = setCell(xml, C.part + u.rowNum, '<v>' + round2(u.part) + '</v>');
      xml = setCell(xml, C.exam + u.rowNum, '<v>' + round2(u.exam) + '</v>');
    });
    // La columna "Escala UTEC" de participación viene como valor fijo en la plantilla: la convierto en fórmula
    // (igual que la de actividades y la de examen) para que se calcule sola a partir del porcentaje.
    tpl.rows.forEach(function (r) {
      var ref = C.partScale + r.rowNum;
      if (!hasFormula(xml, ref)) xml = setCell(xml, ref, '<f>' + esc(scaleFormula(C.part + r.rowNum)) + '</f>');
    });
    // Quito valores en caché de las fórmulas de las filas de datos (obsoletos); el programa recalcula al abrir.
    tpl.rows.forEach(function (r) {
      xml = xml.replace(new RegExp('<row r="' + r.rowNum + '"[\\s\\S]*?</row>'), function (row) {
        return row.replace(/<c r="[A-Z]+\d+"[^>]*?>[\s\S]*?<\/c>/g, function (cell) {
          if (cell.indexOf('<f') < 0) return cell;
          return cell.replace(/<v>[\s\S]*?<\/v>/, '').replace(/ t="str"/, '');
        });
      });
    });
    zip.file(path, xml);
    // fuerza recálculo completo al abrir
    if (/<calcPr[^>]*>/.test(wb)) wb = wb.replace(/<calcPr([^>]*?)\/?>/, function (m, a) {
      return '<calcPr' + a.replace(/\sfullCalcOnLoad="[^"]*"/, '') + ' fullCalcOnLoad="1"/>'; });
    else if (/<\/definedNames>/.test(wb)) wb = wb.replace('</definedNames>', '</definedNames><calcPr fullCalcOnLoad="1"/>');
    else wb = wb.replace('</sheets>', '</sheets><calcPr fullCalcOnLoad="1"/>');
    zip.file('xl/workbook.xml', wb);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ---------- scripts para subir notas a Moodle (mismo formato que el Apps Script original) ----------
  function fmtNum(n, d) { return Number.isInteger(n) ? String(n) : n.toFixed(d); }
  var MOODLE_CODE = "const regex = /\\d+/g;\n" +
    "const tabla = document.getElementsByTagName('table')[6];\n" +
    "for(var i = 0; i < tabla.rows.length; i++) {\n" +
    "  const estudiante = tabla.rows[i].cells[0].textContent.trim();\n" +
    "  const estudianteCI = estudiante && estudiante.length > 0 ? estudiante.match(regex)?.join(\"\") : \"\";\n" +
    "  const input = tabla.rows[i].cells[6].querySelector('input');\n" +
    "  if (input && data[estudianteCI] !== undefined) {\n" +
    "    input.value = data[estudianteCI];\n" +
    "    const event = new Event('change');\n" +
    "    input.dispatchEvent(event);\n" +
    "  }\n" +
    "}";
  /** entries: [{doc, E, G, M}] -> {act, part, exam} (texto JS listo para pegar en la consola). */
  function buildScripts(entries) {
    var d = { act: {}, part: {}, exam: {} };
    entries.forEach(function (e) {
      if (!e.doc) return;
      if (isFinite(e.E)) d.act[e.doc] = fmtNum(round2(e.E), 2);
      if (isFinite(e.G)) d.part[e.doc] = fmtNum(round2(e.G), 2);
      if (e.M != null && isFinite(e.M)) d.exam[e.doc] = fmtNum(round2(e.M), 2);
    });
    var mk = function (o) { return 'const data = ' + JSON.stringify(o, null, 2) + ';\n\n' + MOODLE_CODE; };
    return { act: mk(d.act), part: mk(d.part), exam: mk(d.exam), counts: { act: Object.keys(d.act).length, part: Object.keys(d.part).length, exam: Object.keys(d.exam).length } };
  }

  var Core = { toNum: toNum, round2: round2, colLetter: colLetter, tokens: tokens, scale: scale, calc: calc,
    suggestCategory: suggestCategory, suggestMax: suggestMax, parseMoodle: parseMoodle, studentPercents: studentPercents,
    parseTemplate: parseTemplate, matchRows: matchRows, patchXlsx: patchXlsx, buildScripts: buildScripts, scaleFormula: scaleFormula };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof self !== 'undefined' ? self : this);
