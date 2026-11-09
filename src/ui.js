(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function store(k, v) {
    try { if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  var CATS = [['act', 'Actividades'], ['part', 'Participación'], ['exam', 'Evaluación'], ['', 'Ignorar']];
  var CAT_NAME = { act: 'Actividades entregadas', part: 'Participación en plataforma', exam: 'Evaluación / Prueba final' };
  var DEFAULT_SEDES = ['Durazno', 'Minas', 'Melo', 'Fray Bentos'];
  var S = { moodle: null, tpl: null, tplBuf: null, tplName: '', match: [], assign: [], status: [], pcts: {}, scripts: null, tab: 'act' };

  var fmt = function (x, d) { return x == null || !isFinite(x) ? '—' : x.toFixed(d == null ? 2 : d); };
  var msg = function (el, kind, text) { el.innerHTML = ''; if (text) el.appendChild(h('div', { class: 'msg ' + kind, text: text })); };
  function busy(btn, on, busyText) {
    if (!btn) return;
    if (on) { if (!btn.dataset.label) btn.dataset.label = btn.textContent; if (busyText) btn.textContent = busyText; btn.disabled = true; }
    else { if (btn.dataset.label) btn.textContent = btn.dataset.label; delete btn.dataset.label; btn.disabled = false; }
  }
  // ---------- deshacer (snapshots de columnas + emparejamiento) ----------
  var undoStack = [];
  function pushUndo() {
    if (!S.moodle) return;
    undoStack.push({
      cols: S.moodle.cols.map(function (c) { return { name: c.name, cat: c.cat, max: c.max }; }),
      assign: S.assign.slice(), status: S.status.slice(), dash: $('dash').checked
    });
    if (undoStack.length > 50) undoStack.shift();
    $('undo').disabled = false;
  }
  function undo() {
    var s = undoStack.pop();
    if (!s) return;
    S.moodle.cols.forEach(function (c) {
      for (var i = 0; i < s.cols.length; i++) if (s.cols[i].name === c.name) { c.cat = s.cols[i].cat; c.max = s.cols[i].max; break; }
    });
    S.assign = s.assign.slice(); S.status = s.status.slice();
    $('dash').checked = s.dash;
    renderCols(); recompute(); if (S.tpl) renderMatch();
    $('undo').disabled = !undoStack.length;
  }
  // ---------- exportar / importar configuración (localStorage cal:*) ----------
  function exportConfig() {
    var out = {};
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('cal:') === 0) out[k] = localStorage.getItem(k); } } catch (e) {}
    download(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), 'calificador_config.json');
  }
  function importConfig(file) {
    file.text().then(function (txt) {
      try {
        var obj = JSON.parse(txt), n = 0;
        Object.keys(obj).forEach(function (k) { if (k.indexOf('cal:') === 0) { try { localStorage.setItem(k, obj[k]); n++; } catch (e) {} } });
        fillSedes(); fillMaterias();
        msg($('msgCfg'), 'ok', 'Configuración importada (' + n + ' claves).');
        onProfileChange();
      } catch (e) { msg($('msgCfg'), 'err', 'Archivo de configuración inválido.'); }
    });
  }

  // ---------- 1. materia y sede ----------
  function sedes() { return store('cal:sedes') || DEFAULT_SEDES.slice(); }
  function fillSedes(sel) {
    var s = $('sede'); s.innerHTML = '';
    sedes().forEach(function (n) { s.appendChild(h('option', { value: n, text: n })); });
    if (sel) s.value = sel;
  }
  function fillMaterias() {
    var list = store('cal:materias') || [];
    var dl = $('materias'); dl.innerHTML = '';
    list.forEach(function (m) { dl.appendChild(h('option', { value: m })); });
  }
  var profKey = function () { return 'cal:p:' + $('materia').value.trim().toLowerCase() + '|' + $('sede').value; };
  function saveProfile() {
    var m = $('materia').value.trim(); if (!m || !S.moodle) return;
    var p = { cat: {}, max: {}, dash: $('dash').checked };
    S.moodle.cols.forEach(function (c) { p.cat[c.name] = c.cat; p.max[c.name] = c.max; });
    store(profKey(), p);
    var list = store('cal:materias') || [];
    if (list.indexOf(m) < 0) { list.push(m); store('cal:materias', list); fillMaterias(); }
  }
  function applyProfile() {
    if (!S.moodle || !$('materia').value.trim()) return false;
    var p = store(profKey()); if (!p) return false;
    var any = false;
    S.moodle.cols.forEach(function (c) {
      if (p.cat && c.name in p.cat) { c.cat = p.cat[c.name]; any = true; }
      if (p.max && c.name in p.max && p.max[c.name] > 0) c.max = p.max[c.name];
    });
    if (typeof p.dash === 'boolean') $('dash').checked = p.dash;
    return any;
  }
  $('addSede').addEventListener('click', function () {
    var n = (prompt('Nombre de la nueva sede:') || '').trim(); if (!n) return;
    var l = sedes(); if (l.map(function (x) { return x.toLowerCase(); }).indexOf(n.toLowerCase()) < 0) { l.push(n); store('cal:sedes', l); }
    fillSedes(n); onProfileChange();
  });
  function onProfileChange() { if (applyProfile()) { renderCols(); recompute(); } }
  $('materia').addEventListener('change', onProfileChange);
  $('sede').addEventListener('change', onProfileChange);

  // ---------- drop zones ----------
  function wireDrop(zone, input, handler) {
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') input.click(); });
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]); });
    input.addEventListener('click', function (e) { e.stopPropagation(); });
    input.addEventListener('change', function () { if (input.files[0]) handler(input.files[0]); input.value = ''; });
  }

  // ---------- 2. Moodle ----------
  function pickMoodleSheet(wb) {
    if (wb.SheetNames.length <= 1) return 0;
    var best = 0, bestScore = -1;
    wb.SheetNames.forEach(function (name, i) {
      try {
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
        var m = Core.parseMoodle(rows);
        var score = m.students.length * 1000 + m.cols.length;
        if (score > bestScore) { bestScore = score; best = i; }
      } catch (e) {}
    });
    return best;
  }
  async function loadMoodle(file) {
    if (S.moodle && !window.confirm('Ya hay calificaciones de Moodle cargadas. ¿Reemplazarlas por este archivo?')) return;
    try {
      msg($('msgM'), 'warn', 'Leyendo ' + file.name + '…');
      var wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
      var idx = pickMoodleSheet(wb);
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[idx]], { header: 1, raw: true, defval: '' });
      var m = Core.parseMoodle(rows);
      if (!m.students.length || !m.cols.length) throw new Error('No encontré estudiantes o columnas de notas. ¿Es la exportación de calificaciones de Moodle?');
      S.moodle = m; S.moodleName = file.name;
      var fromProfile = applyProfile();
      var note = wb.SheetNames.length > 1 ? ' (usé la hoja «' + wb.SheetNames[idx] + '»)' : '';
      msg($('msgM'), 'ok', file.name + note + ': ' + m.students.length + ' estudiantes y ' + m.cols.length + ' columnas de notas.' +
        (fromProfile ? ' Se aplicó la selección guardada para esta materia y sede.' : ' Selección sugerida automáticamente: revisala.'));
      $('colsBox').classList.remove('hidden');
      renderCols(); recompute();
      $('s3').classList.remove('off'); $('s4').classList.remove('off');
    } catch (e) { msg($('msgM'), 'err', 'No pude leer el archivo: ' + e.message); }
  }
  wireDrop($('dropM'), $('fileM'), loadMoodle);

  function setFlag(nm, c) {
    var old = nm.querySelector('.pill'); if (old) old.remove();
    if (!c.n) nm.appendChild(h('span', { class: 'pill', text: 'sin datos' }));
    else if (c.max !== 100 && c.max === Core.round2(c.obsMax)) nm.appendChild(h('span', { class: 'pill', text: 'mal configurada: ' + c.max + ' = 100 %' }));
  }
  function renderCols() {
    var t = $('colsT'); t.innerHTML = '';
    t.appendChild(h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Columna' }), h('th', { scope: 'col', class: 'num', text: 'Con nota' }), h('th', { scope: 'col', class: 'num', text: 'Máx. detectado' }),
      h('th', { scope: 'col', text: 'Sobre' }), h('th', { scope: 'col', text: 'Grupo' })])]));
    var tb = h('tbody'); var total = S.moodle.students.length;
    S.moodle.cols.forEach(function (c) {
      var nm = h('td', { class: 'wrap' }, [c.name.replace(/\s*\(Real\)\s*$/, '')]);
      setFlag(nm, c);
      var inp = h('input', { type: 'number', min: '1', step: 'any', value: String(c.max), 'aria-label': 'Sobre (máximo) de ' + c.name });
      inp.addEventListener('change', function () {
        pushUndo();
        var v = parseFloat(inp.value);
        c.max = v > 0 ? v : 100;
        inp.value = c.max;
        setFlag(nm, c);
        changed();
      });
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Grupo de ' + c.name });
      CATS.forEach(function (k) {
        var b = h('button', { type: 'button', text: k[1], class: c.cat === k[0] ? 'on' : '', 'aria-pressed': String(c.cat === k[0]), title: k[1] });
        b.addEventListener('click', function () {
          if (c.cat === k[0]) return;
          pushUndo();
          c.cat = k[0];
          Array.prototype.forEach.call(seg.children, function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
          b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
          changed();
        });
        seg.appendChild(b);
      });
      tb.appendChild(h('tr', {}, [nm, h('td', { class: 'num', text: c.n + '/' + total }), h('td', { class: 'num', text: c.n ? fmt(c.obsMax, c.obsMax % 1 ? 2 : 0) : '—' }), h('td', {}, [inp]), h('td', {}, [seg])]));
    });
    t.appendChild(tb);
  }
  $('suggestCols').addEventListener('click', function () { pushUndo(); S.moodle.cols.forEach(function (c) { c.cat = c.n ? Core.suggestCategory(c.name) : ''; }); renderCols(); recompute(); });
  $('resetCols').addEventListener('click', function () { pushUndo(); S.moodle.cols.forEach(function (c) { c.cat = c.n ? Core.suggestCategory(c.name) : ''; c.max = Core.suggestMax(c.obsMax); }); renderCols(); recompute(); });
  $('dash').addEventListener('change', function () { pushUndo(); changed(); });
  function changed() { saveProfile(); recompute(); }

  // ---------- 3. porcentajes ----------
  function recompute() {
    if (!S.moodle) return;
    var used = S.moodle.cols.filter(function (c) { return c.cat; });
    var dz = $('dash').checked;
    S.pcts = {};
    S.moodle.students.forEach(function (st) { S.pcts[st.id] = Core.studentPercents(st, used, dz); });
    var t = $('resT'); t.innerHTML = '';
    var counts = {}; ['act', 'part', 'exam'].forEach(function (k) { counts[k] = used.filter(function (c) { return c.cat === k; }).length; });
    t.appendChild(h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Estudiante' })].concat(['act', 'part', 'exam'].map(function (k) {
      return h('th', { scope: 'col', class: 'num', text: CAT_NAME[k] + ' (' + counts[k] + ' col.)' }); })))]));
    var tb = h('tbody');
    S.moodle.students.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); }).forEach(function (st) {
      var p = S.pcts[st.id];
      tb.appendChild(h('tr', {}, [h('td', { text: st.name })].concat(['act', 'part', 'exam'].map(function (k) { return h('td', { class: 'num', text: fmt(p[k]) }); }))));
    });
    t.appendChild(tb);
    var miss = ['act', 'part', 'exam'].filter(function (k) { return !counts[k]; });
    var box = $('resWarn'); if (!box) { box = h('div', { id: 'resWarn' }); $('s3').appendChild(box); }
    msg(box, 'warn', miss.length ? 'Falta asignar columnas a: ' + miss.map(function (k) { return CAT_NAME[k]; }).join(', ') + '.' : '');
    if (S.tpl) renderMatch();
  }

  // ---------- 4. planilla ----------
  function findTemplateSheet(wb) {
    for (var i = 0; i < wb.SheetNames.length; i++) {
      try {
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, defval: null });
        Core.parseTemplate(rows);
        return { idx: i, name: wb.SheetNames[i] };
      } catch (e) {}
    }
    return { idx: 0, name: wb.SheetNames[0] };
  }
  async function loadTemplate(file) {
    if (S.tpl && !window.confirm('Ya hay una planilla cargada. ¿Reemplazarla por este archivo?')) return;
    try {
      msg($('msgT'), 'warn', 'Leyendo ' + file.name + '…');
      var buf = new Uint8Array(await file.arrayBuffer());
      var wb = XLSX.read(buf, { type: 'array' });
      var st = findTemplateSheet(wb);
      var tpl = Core.parseTemplate(XLSX.utils.sheet_to_json(wb.Sheets[st.name], { header: 1, defval: null }));
      if (!tpl.rows.length) throw new Error('No encontré estudiantes en la planilla.');
      tpl.sheetName = st.name;
      S.tpl = tpl; S.tplBuf = buf; S.tplName = file.name;
      var note = wb.SheetNames.length > 1 ? ' (hoja «' + st.name + '»)' : '';
      msg($('msgT'), 'ok', file.name + note + ': ' + tpl.rows.length + ' filas de estudiantes (datos desde la fila ' + tpl.rows[0].rowNum + '). Columnas: actividades ' + tpl.cols.act + ', participación ' + tpl.cols.part + ', evaluación ' + tpl.cols.exam + '.');
      S.match = Core.matchRows(tpl.rows, S.moodle.students);
      S.assign = S.match.map(function (m) { return m.sid; });
      S.status = S.match.map(function (m) { return m.status; });
      $('tplBox').classList.remove('hidden'); $('s5').classList.add('hidden');
      renderMatch();
    } catch (e) { msg($('msgT'), 'err', 'No pude leer la planilla: ' + e.message); }
  }
  wireDrop($('dropT'), $('fileT'), loadTemplate);
  $('matchFilter').addEventListener('input', function () { renderMatch(); });

  function rowVals(i) {
    var sid = S.assign[i]; if (sid == null) return null;
    var p = S.pcts[sid]; if (!p || p.act == null || p.part == null || p.exam == null) return null;
    var c = Core.calc(p.act, p.part, p.exam);
    return { p: p, c: c };
  }
  function renderMatch() {
    var students = S.moodle.students.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });
    var q = ($('matchFilter') ? ($('matchFilter').value || '').trim().toLowerCase() : '');
    // conteos sobre TODAS las filas (no afectados por el filtro)
    var cnt = { auto: 0, review: 0, manual: 0, none: 0 };
    S.tpl.rows.forEach(function (r, i) { cnt[S.assign[i] == null ? 'none' : S.status[i]]++; });
    var t = $('matchT'); t.innerHTML = '';
    t.appendChild(h('thead', {}, [h('tr', {}, ['Fila', 'Documento', 'Nombre en la planilla', 'Estudiante en Moodle', 'Estado'].map(function (x) { return h('th', { scope: 'col', text: x }); })
      .concat(['Activ.', 'Particip.', 'Eval.', 'Curso (H)', 'Situación'].map(function (x, k) { return h('th', { scope: 'col', class: k < 4 ? 'num' : '', text: x }); })))]));
    var tb = h('tbody');
    S.tpl.rows.forEach(function (r, i) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && String(r.doc).indexOf(q) < 0) return;
      var sel = h('select', { 'aria-label': 'Asignar estudiante a la fila de ' + r.name });
      sel.appendChild(h('option', { value: '', text: '— sin asignar —' }));
      students.forEach(function (s) { sel.appendChild(h('option', { value: String(s.id), text: s.name })); });
      sel.value = S.assign[i] == null ? '' : String(S.assign[i]);
      sel.addEventListener('change', function () {
        pushUndo();
        S.assign[i] = sel.value === '' ? null : +sel.value;
        S.status[i] = S.assign[i] == null ? 'none' : 'manual';
        rerenderMatch();
      });
      var st = S.assign[i] == null ? 'none' : S.status[i];
      var tag = { auto: ['ok', 'automático'], review: ['warn', 'revisar'], manual: ['ok', 'manual'], none: ['err', 'sin datos'] }[st];
      var v = rowVals(i);
      tb.appendChild(h('tr', { class: st === 'review' ? 'low' : '' }, [
        h('td', { text: String(r.rowNum) }), h('td', { text: r.doc || '— sin CI —' }), h('td', { class: 'wrap', text: r.name }),
        h('td', {}, [sel]), h('td', {}, [h('span', { class: 'tag ' + tag[0], text: tag[1] })]),
        h('td', { class: 'num', text: v ? fmt(v.p.act) : '—' }), h('td', { class: 'num', text: v ? fmt(v.p.part) : '—' }), h('td', { class: 'num', text: v ? fmt(v.p.exam) : '—' }),
        h('td', { class: 'num', text: v ? fmt(v.c.H) : '—' }), h('td', { text: v ? v.c.I : '—' })]));
    });
    t.appendChild(tb);
    var used = {}; S.assign.forEach(function (s) { if (s != null) used[s] = 1; });
    var orphans = S.moodle.students.filter(function (s) { return !used[s.id]; });
    var sum = $('sum'); sum.innerHTML = '';
    sum.appendChild(h('span', { class: 'tag ok', text: (cnt.auto + cnt.manual) + ' emparejados' }));
    if (cnt.review) sum.appendChild(h('span', { class: 'tag warn', text: cnt.review + ' para revisar' }));
    if (cnt.none) sum.appendChild(h('span', { class: 'tag err', text: cnt.none + ' filas de la planilla sin datos de Moodle (quedan como están)' }));
    if (orphans.length) sum.appendChild(h('span', { class: 'tag warn', text: orphans.length + ' en Moodle sin fila en la planilla: ' + orphans.map(function (s) { return s.name; }).join(' · ') }));
    // documentos duplicados en la planilla
    var seen = {}, dups = [];
    S.tpl.rows.forEach(function (r) { if (r.doc) { if (seen[r.doc]) dups.push(r.doc); seen[r.doc] = 1; } });
    if (dups.length) sum.appendChild(h('span', { class: 'tag err', text: 'Documentos duplicados en la planilla: ' + dups.slice(0, 5).join(', ') + (dups.length > 5 ? '…' : '') }));
    // distribución de situaciones
    var sit = {};
    S.tpl.rows.forEach(function (r, i) { var v = rowVals(i); if (!v) return; var k = v.c.I; sit[k] = (sit[k] || 0) + 1; });
    var SIT_TAG = { 'PRUEBA FINAL': 'ok', 'TUTORÍA': 'warn', 'RECURSA': 'err', 'RECURSA O EXAMEN ÚNICO': 'err' };
    Object.keys(sit).sort().forEach(function (k) { sum.appendChild(h('span', { class: 'tag ' + (SIT_TAG[k] || ''), text: k + ': ' + sit[k] })); });
    var missing = ['act', 'part', 'exam'].some(function (k) { return !S.moodle.cols.some(function (c) { return c.cat === k; }); });
    $('dl').disabled = $('gen').disabled = $('csv').disabled = missing;
    if (S.scripts) generate(true);
  }
  function rerenderMatch() {
    var wrap = $('matchT').parentElement;
    var st = wrap ? wrap.scrollTop : 0;
    renderMatch();
    if (wrap) wrap.scrollTop = st;
  }

  function download(blob, name) {
    var a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('dl').addEventListener('click', async function () {
    saveProfile();
    var ups = [];
    S.tpl.rows.forEach(function (r, i) { var v = rowVals(i); if (v) ups.push({ rowNum: r.rowNum, act: v.p.act, part: v.p.part, exam: v.p.exam }); });
    busy($('dl'), true, 'Generando…');
    try {
      var out = await Core.patchXlsx(JSZip, S.tplBuf, S.tpl, ups);
      download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), S.tplName.replace(/\.xlsx$/i, '') + '_completada.xlsx');
      msg($('msgT'), 'ok', 'Planilla generada con ' + ups.length + ' filas completadas. Al abrirla, las fórmulas se recalculan solas.');
    } catch (e) { msg($('msgT'), 'err', 'No pude completar la planilla: ' + e.message); }
    busy($('dl'), false);
  });
  $('csv').addEventListener('click', function () {
    var lines = [['Documento', 'Nombre', 'Actividades %', 'Participacion %', 'Evaluacion %', 'Actividades UTEC', 'Participacion UTEC', 'Curso UTEC', 'Situacion', 'Evaluacion UTEC'].join(';')];
    S.tpl.rows.forEach(function (r, i) {
      var v = rowVals(i); if (!v) return;
      lines.push([r.doc, '"' + r.name.replace(/"/g, '""') + '"', fmt(v.p.act), fmt(v.p.part), fmt(v.p.exam), fmt(v.c.E), fmt(v.c.G), fmt(v.c.H), v.c.I, v.c.M == null ? 'NO CORRESPONDE' : fmt(v.c.M)].join(';'));
    });
    download(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), 'resumen_calificaciones.csv');
  });

  // ---------- 5. scripts ----------
  function generate(silent) {
    if (!silent) saveProfile();
    var ent = [], nodoc = 0;
    S.tpl.rows.forEach(function (r, i) { var v = rowVals(i); if (!v) return; if (!r.doc) { nodoc++; return; } ent.push({ doc: r.doc, E: v.c.E, G: v.c.G, M: v.c.M }); });
    S.scripts = Core.buildScripts(ent); S.nodoc = nodoc;
    $('s5').classList.remove('hidden'); drawTabs();
    if (!silent) $('s5').scrollIntoView({ behavior: 'smooth' });
  }
  function drawTabs() {
    var tabs = $('tabs'); tabs.innerHTML = '';
    [['act', 'Actividades'], ['part', 'Participación'], ['exam', 'Examen']].forEach(function (k) {
      var b = h('button', { type: 'button', class: S.tab === k[0] ? 'on' : '', text: k[1] + ' (' + S.scripts.counts[k[0]] + ')' });
      b.addEventListener('click', function () { S.tab = k[0]; drawTabs(); });
      tabs.appendChild(b);
    });
    $('code').value = S.scripts[S.tab];
    var notes = [];
    if (S.nodoc) notes.push(S.nodoc + ' fila(s) sin documento no están en el script.');
    var ex = S.scripts.counts.exam, tot = S.scripts.counts.act;
    if (ex < tot) notes.push('Examen: ' + (tot - ex) + ' estudiante(s) no incluidos (la planilla indica «NO CORRESPONDE» porque no llegan a la nota mínima del curso).');
    $('cinfo').textContent = notes.join(' ');
  }
  $('gen').addEventListener('click', function () { generate(false); });
  $('copy').addEventListener('click', async function () {
    var ta = $('code');
    try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand('copy'); }
    var b = $('copy'); b.textContent = '¡Copiado!'; setTimeout(function () { b.textContent = 'Copiar'; }, 1500);
  });

  // init
  $('undo').addEventListener('click', undo);
  $('exportCfg').addEventListener('click', exportConfig);
  $('importCfg').addEventListener('change', function () { if (this.files[0]) importConfig(this.files[0]); this.value = ''; });
  fillSedes(); fillMaterias();
  var last = store('cal:last'); if (last) { $('materia').value = last.m || ''; fillSedes(last.s); }
  ['materia', 'sede'].forEach(function (id) { $(id).addEventListener('change', function () { store('cal:last', { m: $('materia').value.trim(), s: $('sede').value }); }); });
})();
