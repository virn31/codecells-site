// lib/fotosPaciente.js — pestaña "Fotos" de la app del paciente (mi-nivel.html).
//
// Decisiones (2026-10-27):
// - Las fotos viven SOLO en el teléfono (IndexedDB), por paciente. Nada se
//   sube a CODE CELLS™: no hay foto clínica en el servidor sin aviso de
//   privacidad que lo cubra. Si se desinstala la app o se borran sus datos,
//   se pierden — la pantalla lo dice.
// - Cámara guiada: silueta según lo que se fotografía y "foto fantasma" (la
//   anterior de la misma categoría, translúcida) para repetir la postura.
// - Antes/después con barra deslizable; galería por mes, difuminada hasta
//   que el paciente toca "Mostrar" (y de nuevo al salir de la pestaña).
// - Sin OCR de recetas: la receta es acto del médico (MVP-2); una receta en
//   papel se guarda como "Documento" para enseñarla en consulta.
// Se guarda la imagen SIN espejo aunque se tome con la cámara frontal: en
// una foto clínica izquierda y derecha deben ser las reales.
(function (raiz) {
  'use strict';

  const CATEGORIAS = [
    { id: 'cuerpo-frente', nombre: 'Cuerpo de frente', icono: '🧍', guia: 'cuerpo', camara: 'environment', consejo: 'De pie, brazos ligeramente separados. Misma luz y distancia cada vez.' },
    { id: 'cuerpo-perfil', nombre: 'Cuerpo de perfil', icono: '🚶', guia: 'perfil', camara: 'environment', consejo: 'De lado, mirando al frente, brazos relajados.' },
    { id: 'rostro', nombre: 'Rostro', icono: '🙂', guia: 'rostro', camara: 'user', consejo: 'Sin maquillaje ni filtros, con luz de frente.' },
    { id: 'piel', nombre: 'Piel o lunar', icono: '🔍', guia: 'piel', camara: 'environment', consejo: 'A unos 15 cm, la zona en el centro del círculo y bien enfocada.' },
    { id: 'herida', nombre: 'Herida o cirugía', icono: '🩹', guia: 'piel', camara: 'environment', consejo: 'Limpia y con buena luz; que se vea completa dentro del círculo.' },
    { id: 'documento', nombre: 'Documento', icono: '📄', guia: 'documento', camara: 'environment', consejo: 'Receta o estudio en papel, plano y dentro del marco.' },
  ];
  const POR_ID = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));
  const LADO_MAX = 1600, LADO_MINI = 360, CALIDAD = 0.85;

  // ─── Funciones puras (probadas en test/fotos-paciente.test.js) ──────
  // Medidas para que el lado mayor no pase de `max` (nunca agranda).
  function escalar(w, h, max) {
    const f = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) };
  }
  // Recorte de la imagen de la cámara que coincide con lo que se ve en
  // pantalla (object-fit: cover): lo que el paciente encuadró es lo que se guarda.
  function recorteCover(vw, vh, cw, ch) {
    const a = cw / ch;
    if (vw / vh > a) { const sw = vh * a; return { sx: (vw - sw) / 2, sy: 0, sw, sh: vh }; }
    const sh = vw / a; return { sx: 0, sy: (vh - sh) / 2, sw: vw, sh };
  }
  // Fotos (más recientes primero) agrupadas por mes 'YYYY-MM'.
  function agruparPorMes(fotos) {
    const orden = fotos.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const grupos = [];
    for (const f of orden) {
      const clave = String(f.fecha).slice(0, 7);
      const g = grupos[grupos.length - 1];
      if (g && g.clave === clave) g.fotos.push(f); else grupos.push({ clave, fotos: [f] });
    }
    return grupos;
  }
  // Días enteros entre dos fechas ISO (por día calendario local).
  function diasEntre(a, b) {
    const d = s => { const x = new Date(s); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()); };
    return Math.round(Math.abs(d(b) - d(a)) / 864e5);
  }
  // Par por defecto para comparar en una categoría: la primera y la última.
  function parPorDefecto(fotos, categoria) {
    const de = fotos.filter(f => f.categoria === categoria).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    return de.length >= 2 ? { antes: de[0], despues: de[de.length - 1] } : null;
  }

  const api = { CATEGORIAS, POR_ID, escalar, recorteCover, agruparPorMes, diasEntre, parPorDefecto };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ═══ Navegador ═══════════════════════════════════════════════════
  const doc = raiz.document;
  let ctx = null;               // { codigo(), esc, tt, fechaLarga }
  let fotos = [];               // metadatos del paciente (sin blobs)
  let urls = {};                // id → object URL de la miniatura
  let filtro = 'todas';
  let visibles = false;         // difuminadas hasta que el paciente las muestra
  let comparar = null;          // { categoria, antesId, despuesId }
  let iniciado = false;

  // ─── Almacenamiento (IndexedDB) ───────────────────────────────────
  let dbPromesa = null;
  function db() {
    if (dbPromesa) return dbPromesa;
    dbPromesa = new Promise((ok, mal) => {
      if (!raiz.indexedDB) return mal(new Error('sin IndexedDB'));
      const r = raiz.indexedDB.open('codecells-fotos', 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore('fotos', { keyPath: 'id' }); s.createIndex('codigo', 'codigo'); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
    return dbPromesa;
  }
  function tx(modo, fn) {
    return db().then(d => new Promise((ok, mal) => {
      const t = d.transaction('fotos', modo); const s = t.objectStore('fotos');
      const res = fn(s);
      t.oncomplete = () => ok(res && 'result' in res ? res.result : undefined);
      t.onerror = () => mal(t.error); t.onabort = () => mal(t.error || new Error('abortada'));
    }));
  }
  const listarDe = codigo => tx('readonly', s => s.index('codigo').getAll(codigo));
  const guardar = reg => tx('readwrite', s => s.put(reg));
  const borrar = id => tx('readwrite', s => s.delete(id));
  const leer = id => tx('readonly', s => s.get(id));

  // ─── Utilidades de imagen ─────────────────────────────────────────
  function aBlob(canvas, calidad) { return new Promise((ok, mal) => canvas.toBlob(b => b ? ok(b) : mal(new Error('toBlob')), 'image/jpeg', calidad)); }
  // Dibuja `fuente` (video o imagen) recortada y escalada; devuelve imagen y miniatura.
  async function procesar(fuente, sw0, sh0, recorte, espejo) {
    const rc = recorte || { sx: 0, sy: 0, sw: sw0, sh: sh0 };
    const m = escalar(rc.sw, rc.sh, LADO_MAX);
    const c = doc.createElement('canvas'); c.width = m.w; c.height = m.h;
    const g = c.getContext('2d');
    // Lo que se ve en espejo (cámara frontal) se guarda sin espejo.
    if (espejo) { g.translate(m.w, 0); g.scale(-1, 1); }
    g.drawImage(fuente, rc.sx, rc.sy, rc.sw, rc.sh, 0, 0, m.w, m.h);
    const mm = escalar(m.w, m.h, LADO_MINI);
    const cm = doc.createElement('canvas'); cm.width = mm.w; cm.height = mm.h;
    cm.getContext('2d').drawImage(c, 0, 0, mm.w, mm.h);
    return { imagen: await aBlob(c, CALIDAD), miniatura: await aBlob(cm, 0.8), w: m.w, h: m.h };
  }

  // ─── Siluetas de la cámara (SVG, viewBox 300×600) ─────────────────
  const TRAZO = 'fill="none" stroke="#C9A96E" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"';
  const GUIAS = {
    cuerpo: `<circle cx="150" cy="78" r="36" ${TRAZO}/><path ${TRAZO} d="M132 112v14q-36 4-56 24q-14 14-16 46l-8 132q-1 14 10 16h8l10-112h7l4 100q4 92 8 140l3 96q1 12 14 12h14l6-106 5-88h10l5 88 6 106h14q13 0 14-12l3-96q4-48 8-140l4-100h7l10 112h8q11-2 10-16l-8-132q-2-32-16-46q-20-20-56-24v-14"/><line x1="150" y1="20" x2="150" y2="590" stroke="#C9A96E" stroke-width="1" opacity="0.35"/>`,
    perfil: `<ellipse cx="158" cy="78" rx="32" ry="38" ${TRAZO}/><path ${TRAZO} d="M150 115l-2 12q-30 10-32 48q-3 56 8 116q-6 40 3 70l7 110-3 90q0 14 18 14h36l-8-14-8-90 3-110q12-30 8-70q14-58 10-118q-4-36-24-46l3-12"/><line x1="150" y1="20" x2="150" y2="590" stroke="#C9A96E" stroke-width="1" opacity="0.35"/>`,
    rostro: `<ellipse cx="150" cy="270" rx="96" ry="128" ${TRAZO}/><line x1="62" y1="250" x2="238" y2="250" stroke="#C9A96E" stroke-width="1" opacity="0.4"/><line x1="150" y1="130" x2="150" y2="410" stroke="#C9A96E" stroke-width="1" opacity="0.4"/>`,
    piel: `<circle cx="150" cy="300" r="105" ${TRAZO}/><line x1="150" y1="270" x2="150" y2="330" stroke="#C9A96E" stroke-width="1.5" opacity="0.6"/><line x1="120" y1="300" x2="180" y2="300" stroke="#C9A96E" stroke-width="1.5" opacity="0.6"/>`,
    documento: `<path ${TRAZO.replace('stroke-dasharray="7 6" ', '')} d="M40 110h40M40 110v40M260 110h-40M260 110v40M40 490h40M40 490v-40M260 490h-40M260 490v-40"/><rect x="40" y="110" width="220" height="380" fill="none" stroke="#C9A96E" stroke-width="1" opacity="0.3"/>`,
  };

  // ─── Estilos (una vez) ────────────────────────────────────────────
  function estilos() {
    if (doc.getElementById('fotos-estilos')) return;
    const st = doc.createElement('style'); st.id = 'fotos-estilos';
    st.textContent = `
      .fotos-aviso { display:flex; gap:10px; align-items:flex-start; font-size:12px; color:var(--text-2); line-height:1.5; padding:12px 14px; border:1px solid var(--border-dim); border-radius:14px; background:var(--black-2); }
      .fotos-aviso b { color:var(--text-1); font-weight:600; }
      .fotos-cats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
      .fotos-cat { display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 6px 12px; border-radius:16px; border:1px solid var(--border-dim); background:linear-gradient(160deg,var(--black-3),var(--black-2)); color:var(--text-1); font:500 12px var(--font-sans); cursor:pointer; text-align:center; transition:transform .15s, border-color .15s; }
      .fotos-cat span { font-size:24px; line-height:1; }
      .fotos-cat small { color:var(--text-3); font-size:10.5px; }
      .fotos-cat:active { transform:scale(.97); border-color:var(--gold); }
      .fotos-barra { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
      .fotos-filtros { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
      .fotos-filtros::-webkit-scrollbar { display:none; }
      .fotos-filtros .filtro-labs-btn { white-space:nowrap; }
      .fotos-mes { font-size:12px; color:var(--text-2); margin:18px 2px 8px; }
      .fotos-rejilla { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
      .fotos-celda { position:relative; aspect-ratio:3/4; border-radius:10px; overflow:hidden; background:var(--black-3); border:none; padding:0; cursor:pointer; }
      .fotos-celda img { width:100%; height:100%; object-fit:cover; display:block; transition:filter .25s; }
      .fotos-privado .fotos-celda img, .fotos-privado .fotos-comp img { filter:blur(16px) saturate(.6); }
      .fotos-celda i { position:absolute; left:6px; bottom:6px; font-style:normal; font-size:10px; color:#fff; background:rgba(0,0,0,.55); padding:2px 6px; border-radius:8px; }
      .fotos-vacio { text-align:center; color:var(--text-3); font-size:13px; padding:26px 10px; }
      .fotos-comp { position:relative; aspect-ratio:3/4; border-radius:16px; overflow:hidden; background:var(--black-3); touch-action:none; user-select:none; }
      .fotos-comp img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; pointer-events:none; }
      .fotos-comp .despues { clip-path:inset(0 0 0 50%); }
      .fotos-comp .linea { position:absolute; top:0; bottom:0; left:50%; width:2px; margin-left:-1px; background:var(--gold); box-shadow:0 0 12px rgba(201,169,110,.8); pointer-events:none; }
      .fotos-comp .linea::after { content:'⟷'; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:38px; height:38px; border-radius:50%; background:var(--gold); color:var(--black); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; }
      .fotos-comp .etq { position:absolute; top:10px; font-size:11px; color:#fff; background:rgba(0,0,0,.6); padding:4px 9px; border-radius:10px; pointer-events:none; }
      .fotos-comp .etq.izq { left:10px; } .fotos-comp .etq.der { right:10px; }
      .fotos-comp input[type=range] { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:ew-resize; margin:0; }
      .fotos-delta { text-align:center; font-size:13px; color:var(--gold); margin-top:10px; }
      .fotos-modal { position:fixed; inset:0; z-index:1000; background:#000; display:flex; flex-direction:column; color:#fff; font-family:var(--font-sans); }
      .fotos-modal[hidden] { display:none; }
      .fotos-cam-vista { position:relative; flex:1; overflow:hidden; background:#000; }
      .fotos-cam-vista video, .fotos-cam-vista .fantasma { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      .fotos-cam-vista .fantasma { opacity:.35; pointer-events:none; }
      .fotos-cam-vista svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
      .fotos-espejo { transform:scaleX(-1); }
      .fotos-cam-arriba { position:absolute; top:0; left:0; right:0; padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 30px; background:linear-gradient(rgba(0,0,0,.7),transparent); display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
      .fotos-cam-arriba b { font-size:15px; font-weight:600; } .fotos-cam-arriba small { display:block; font-size:12px; color:rgba(255,255,255,.75); margin-top:3px; max-width:260px; }
      .fotos-cam-abajo { padding:18px 20px calc(env(safe-area-inset-bottom,0px) + 22px); display:flex; justify-content:space-around; align-items:center; background:#000; }
      .fotos-redondo { width:46px; height:46px; border-radius:50%; border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.08); color:#fff; font-size:19px; cursor:pointer; }
      .fotos-redondo[aria-pressed=true] { background:var(--gold); color:#000; border-color:var(--gold); }
      .fotos-obturador { width:74px; height:74px; border-radius:50%; border:4px solid #fff; background:var(--gold); cursor:pointer; box-shadow:0 0 0 4px rgba(201,169,110,.35); }
      .fotos-obturador:active { transform:scale(.94); }
      .fotos-ver { flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden; padding-top:env(safe-area-inset-top,0px); }
      .fotos-ver img { max-width:100%; max-height:100%; object-fit:contain; }
      .fotos-ver-pie { padding:14px 18px calc(env(safe-area-inset-bottom,0px) + 18px); background:#0a0a0a; display:flex; flex-direction:column; gap:10px; }
      .fotos-ver-pie .meta { font-size:13px; color:rgba(255,255,255,.8); }
      .fotos-ver-pie textarea { width:100%; box-sizing:border-box; background:#1a1a1a; color:#fff; border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:9px 11px; font:13px var(--font-sans); resize:none; }
      .fotos-ver-pie .fila { display:flex; gap:8px; flex-wrap:wrap; }
      .fotos-msg { font-size:12px; min-height:16px; }
    `;
    doc.head.appendChild(st);
  }

  const $ = id => doc.getElementById(id);
  const tt = x => (ctx && ctx.tt ? ctx.tt(x) : x);
  const esc = x => (ctx && ctx.esc ? ctx.esc(x) : String(x));
  function mesLargo(clave) {
    try { const t = new Date(clave + '-15T12:00:00').toLocaleDateString(raiz.getLanguage ? raiz.getLanguage() : 'es', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
    catch (e) { return clave; }
  }
  function fechaCorta(iso) {
    try { return new Date(iso).toLocaleDateString(raiz.getLanguage ? raiz.getLanguage() : 'es', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return String(iso).slice(0, 10); }
  }
  function mensaje(id, texto, error) { const m = $(id); if (!m) return; m.textContent = texto ? tt(texto) : ''; m.style.color = error ? '#E2574B' : 'var(--text-2)'; }

  // ─── Carga y pintado de la pestaña ────────────────────────────────
  function liberarUrls() { Object.values(urls).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} }); urls = {}; }
  async function cargar() {
    const codigo = ctx.codigo();
    if (!codigo) return;
    try {
      const todos = await listarDe(codigo);
      liberarUrls();
      fotos = todos.map(r => { urls[r.id] = URL.createObjectURL(r.miniatura); return { id: r.id, categoria: r.categoria, fecha: r.fecha, nota: r.nota || '' }; });
      mensaje('fotos-estado', '');
    } catch (e) {
      fotos = [];
      mensaje('fotos-estado', 'Este teléfono no permite guardar fotos en la app (almacenamiento bloqueado). Revisa que no estés en modo incógnito.', true);
    }
    pintar();
  }

  function pintar() {
    $('fotos-tab').classList.toggle('fotos-privado', !visibles);
    $('fotos-mostrar').textContent = tt(visibles ? '🙈 Ocultar' : '👁 Mostrar');
    $('fotos-mostrar').style.display = fotos.length ? '' : 'none';
    // Filtros: solo categorías con fotos.
    const usadas = CATEGORIAS.filter(c => fotos.some(f => f.categoria === c.id));
    if (filtro !== 'todas' && !usadas.some(c => c.id === filtro)) filtro = 'todas';
    $('fotos-filtros').innerHTML = usadas.length > 1
      ? ['todas'].concat(usadas.map(c => c.id)).map(id => `<button type="button" class="filtro-labs-btn${filtro === id ? ' activo' : ''}" data-filtro="${id}">${id === 'todas' ? esc(tt('Todas')) : POR_ID[id].icono + ' ' + esc(tt(POR_ID[id].nombre))}</button>`).join('')
      : '';
    const lista = filtro === 'todas' ? fotos : fotos.filter(f => f.categoria === filtro);
    const g = agruparPorMes(lista);
    $('fotos-galeria').innerHTML = g.length
      ? g.map(m => `<div class="fotos-mes">${esc(mesLargo(m.clave))}</div><div class="fotos-rejilla">${m.fotos.map(f => `<button type="button" class="fotos-celda" data-ver="${f.id}" aria-label="${esc(tt(POR_ID[f.categoria] ? POR_ID[f.categoria].nombre : 'Foto'))} ${esc(fechaCorta(f.fecha))}"><img src="${urls[f.id]}" alt=""><i>${POR_ID[f.categoria] ? POR_ID[f.categoria].icono : '📷'} ${esc(fechaCorta(f.fecha))}</i></button>`).join('')}</div>`).join('')
      : `<div class="fotos-vacio">${esc(tt('Aún no tienes fotos. Elige arriba qué quieres fotografiar.'))}</div>`;
    pintarComparar();
  }

  // ─── Antes y después ──────────────────────────────────────────────
  function categoriasComparables() { return CATEGORIAS.filter(c => fotos.filter(f => f.categoria === c.id).length >= 2); }
  async function pintarComparar() {
    const caja = $('fotos-comparar');
    const cats = categoriasComparables();
    if (!cats.length) { caja.style.display = 'none'; return; }
    caja.style.display = '';
    if (!comparar || !cats.some(c => c.id === comparar.categoria)) {
      const par = parPorDefecto(fotos, cats[0].id);
      comparar = { categoria: cats[0].id, antesId: par.antes.id, despuesId: par.despues.id };
    }
    $('fotos-comp-cats').innerHTML = cats.length > 1 ? cats.map(c => `<button type="button" class="filtro-labs-btn${c.id === comparar.categoria ? ' activo' : ''}" data-comp="${c.id}">${c.icono} ${esc(tt(c.nombre))}</button>`).join('') : '';
    const antes = fotos.find(f => f.id === comparar.antesId), despues = fotos.find(f => f.id === comparar.despuesId);
    if (!antes || !despues) return;
    // Imagen completa (no miniatura) para comparar con detalle.
    try {
      const [a, d] = await Promise.all([leer(antes.id), leer(despues.id)]);
      const ia = $('fotos-comp-antes'), id = $('fotos-comp-despues');
      if (ia.dataset.url) URL.revokeObjectURL(ia.dataset.url);
      if (id.dataset.url) URL.revokeObjectURL(id.dataset.url);
      ia.src = ia.dataset.url = URL.createObjectURL(a.imagen);
      id.src = id.dataset.url = URL.createObjectURL(d.imagen);
    } catch (e) { mensaje('fotos-estado', 'No pudimos abrir las fotos para comparar.', true); return; }
    $('fotos-comp-etq-antes').textContent = tt('Antes') + ' · ' + fechaCorta(antes.fecha);
    $('fotos-comp-etq-despues').textContent = tt('Después') + ' · ' + fechaCorta(despues.fecha);
    const n = diasEntre(antes.fecha, despues.fecha);
    $('fotos-delta').textContent = n === 0 ? tt('Mismo día') : '+' + n + ' ' + tt(n === 1 ? 'día de diferencia' : 'días de diferencia');
    moverComparador(50);
  }
  function moverComparador(pct) {
    $('fotos-comp-despues').style.clipPath = `inset(0 0 0 ${pct}%)`;
    $('fotos-comp-linea').style.left = pct + '%';
    $('fotos-comp-rango').value = pct;
  }

  // ─── Cámara guiada ────────────────────────────────────────────────
  let cam = { stream: null, categoria: null, frontal: false, fantasma: true };
  function detenerCamara() { if (cam.stream) cam.stream.getTracks().forEach(t => t.stop()); cam.stream = null; }
  async function abrirCamara(categoria) {
    const c = POR_ID[categoria]; if (!c) return;
    cam.categoria = categoria; cam.frontal = c.camara === 'user';
    $('fotos-cam-titulo').textContent = c.icono + ' ' + tt(c.nombre);
    $('fotos-cam-consejo').textContent = tt(c.consejo);
    $('fotos-cam-guia').innerHTML = GUIAS[c.guia] || '';
    // Foto fantasma: la más reciente de esta categoría.
    const previa = fotos.filter(f => f.categoria === categoria).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
    const fant = $('fotos-cam-fantasma');
    if (fant.dataset.url) { URL.revokeObjectURL(fant.dataset.url); delete fant.dataset.url; }
    fant.removeAttribute('src'); fant.style.display = 'none';
    $('fotos-cam-fant-btn').style.display = previa ? '' : 'none';
    if (previa) { try { const r = await leer(previa.id); fant.src = fant.dataset.url = URL.createObjectURL(r.imagen); } catch (e) {} }
    $('fotos-camara').hidden = false;
    doc.body.style.overflow = 'hidden';
    await encenderCamara();
  }
  async function encenderCamara() {
    detenerCamara();
    const video = $('fotos-cam-video');
    mensaje('fotos-cam-msg', '');
    if (!raiz.navigator.mediaDevices || !raiz.navigator.mediaDevices.getUserMedia) { usarSelector(); return; }
    try {
      cam.stream = await raiz.navigator.mediaDevices.getUserMedia({ video: { facingMode: cam.frontal ? 'user' : 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      video.srcObject = cam.stream; await video.play().catch(() => {});
      video.classList.toggle('fotos-espejo', cam.frontal);
      const fant = $('fotos-cam-fantasma');
      fant.classList.toggle('fotos-espejo', cam.frontal);
      fant.style.display = fant.getAttribute('src') && cam.fantasma ? '' : 'none';
      $('fotos-cam-fant-btn').setAttribute('aria-pressed', cam.fantasma ? 'true' : 'false');
    } catch (e) {
      // Sin permiso o sin cámara: el selector del teléfono (sin silueta).
      usarSelector(e && e.name === 'NotAllowedError'
        ? 'No diste permiso para la cámara. Puedes darlo en los ajustes del teléfono; mientras tanto, elige o toma la foto con el selector.'
        : 'No pudimos abrir la cámara aquí. Elige o toma la foto con el selector del teléfono.');
    }
  }
  function usarSelector(texto) {
    if (texto) mensaje('fotos-cam-msg', texto, true);
    const inp = $('fotos-input');
    inp.setAttribute('capture', cam.frontal ? 'user' : 'environment');
    inp.value = '';
    inp.click();
  }
  function cerrarCamara() {
    detenerCamara();
    $('fotos-camara').hidden = true;
    doc.body.style.overflow = '';
  }
  async function disparar() {
    const video = $('fotos-cam-video');
    if (!cam.stream || !video.videoWidth) { usarSelector(); return; }
    const vista = $('fotos-cam-vista');
    const rc = recorteCover(video.videoWidth, video.videoHeight, vista.clientWidth, vista.clientHeight);
    try {
      const p = await procesar(video, video.videoWidth, video.videoHeight, rc, cam.frontal);
      cerrarCamara();
      abrirRevision(p);
    } catch (e) { mensaje('fotos-cam-msg', 'No se pudo tomar la foto. Intenta de nuevo.', true); }
  }
  function desdeArchivo(archivo) {
    if (!archivo) return;
    const img = new Image();
    const u = URL.createObjectURL(archivo);
    img.onload = async () => {
      try { const p = await procesar(img, img.naturalWidth, img.naturalHeight, null, false); cerrarCamara(); abrirRevision(p); }
      catch (e) { mensaje('fotos-cam-msg', 'No pudimos leer esa imagen.', true); }
      finally { URL.revokeObjectURL(u); }
    };
    img.onerror = () => { URL.revokeObjectURL(u); mensaje('fotos-cam-msg', 'No pudimos leer esa imagen.', true); };
    img.src = u;
  }

  // ─── Revisar antes de guardar / ver una foto guardada ─────────────
  let enVista = null; // { nueva: {imagen,miniatura,w,h} } | { id }
  function abrirVisor({ src, meta, nota, nueva }) {
    const im = $('fotos-ver-img');
    if (im.dataset.url) URL.revokeObjectURL(im.dataset.url);
    im.src = im.dataset.url = src;
    $('fotos-ver-meta').textContent = meta;
    $('fotos-ver-nota').value = nota || '';
    $('fotos-ver-guardar').style.display = nueva ? '' : 'none';
    $('fotos-ver-repetir').style.display = nueva ? '' : 'none';
    $('fotos-ver-borrar').style.display = nueva ? 'none' : '';
    $('fotos-ver-borrar').textContent = tt('Eliminar');
    $('fotos-ver-borrar').dataset.confirmar = '';
    $('fotos-ver-comparar').style.display = !nueva && fotos.filter(f => f.categoria === (enVista && enVista.categoria)).length >= 2 ? '' : 'none';
    mensaje('fotos-ver-msg', '');
    $('fotos-visor').hidden = false;
    doc.body.style.overflow = 'hidden';
  }
  function cerrarVisor() { $('fotos-visor').hidden = true; doc.body.style.overflow = ''; enVista = null; }
  function abrirRevision(p) {
    enVista = { nueva: p, categoria: cam.categoria };
    const c = POR_ID[cam.categoria];
    abrirVisor({ src: URL.createObjectURL(p.imagen), meta: c.icono + ' ' + tt(c.nombre) + ' · ' + fechaCorta(new Date().toISOString()), nota: '', nueva: true });
  }
  async function verGuardada(id) {
    try {
      const r = await leer(id);
      enVista = { id, categoria: r.categoria };
      const c = POR_ID[r.categoria] || { icono: '📷', nombre: 'Foto' };
      abrirVisor({ src: URL.createObjectURL(r.imagen), meta: c.icono + ' ' + tt(c.nombre) + ' · ' + fechaCorta(r.fecha), nota: r.nota, nueva: false });
    } catch (e) { mensaje('fotos-estado', 'No pudimos abrir esa foto.', true); }
  }
  async function guardarNueva() {
    if (!enVista || !enVista.nueva) return;
    const btn = $('fotos-ver-guardar'); btn.disabled = true;
    const p = enVista.nueva;
    const reg = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), codigo: ctx.codigo(), categoria: enVista.categoria, fecha: new Date().toISOString(), nota: $('fotos-ver-nota').value.trim().slice(0, 300), imagen: p.imagen, miniatura: p.miniatura, w: p.w, h: p.h };
    try {
      await guardar(reg);
      // Pide al navegador que no borre estas fotos para liberar espacio.
      try { if (raiz.navigator.storage && raiz.navigator.storage.persist) raiz.navigator.storage.persist(); } catch (e) {}
      cerrarVisor(); filtro = 'todas'; visibles = true;
      await cargar();
      // Si ya hay dos de esta categoría, el comparador muestra la primera y la nueva.
      const par = parPorDefecto(fotos, reg.categoria);
      if (par) { comparar = { categoria: reg.categoria, antesId: par.antes.id, despuesId: par.despues.id }; pintarComparar(); }
    } catch (e) {
      mensaje('fotos-ver-msg', e && e.name === 'QuotaExceededError' ? 'Tu teléfono no tiene espacio para guardar la foto.' : 'No se pudo guardar la foto en este teléfono.', true);
    } finally { btn.disabled = false; }
  }
  async function guardarNota() {
    if (!enVista || !enVista.id) return;
    try { const r = await leer(enVista.id); r.nota = $('fotos-ver-nota').value.trim().slice(0, 300); await guardar(r); const f = fotos.find(x => x.id === r.id); if (f) f.nota = r.nota; mensaje('fotos-ver-msg', 'Nota guardada.'); }
    catch (e) { mensaje('fotos-ver-msg', 'No se pudo guardar la nota.', true); }
  }
  async function borrarActual() {
    const btn = $('fotos-ver-borrar');
    if (!btn.dataset.confirmar) { btn.dataset.confirmar = '1'; btn.textContent = tt('¿Seguro? Eliminar'); return; }
    try { await borrar(enVista.id); cerrarVisor(); comparar = null; await cargar(); }
    catch (e) { mensaje('fotos-ver-msg', 'No se pudo eliminar la foto.', true); }
  }

  // ─── Montaje ──────────────────────────────────────────────────────
  function montarModales() {
    if ($('fotos-camara')) return;
    const cont = doc.createElement('div');
    cont.innerHTML = `
      <div class="fotos-modal" id="fotos-camara" hidden role="dialog" aria-modal="true" aria-labelledby="fotos-cam-titulo">
        <div class="fotos-cam-vista" id="fotos-cam-vista">
          <video id="fotos-cam-video" playsinline muted></video>
          <img class="fantasma" id="fotos-cam-fantasma" alt="">
          <svg id="fotos-cam-guia" viewBox="0 0 300 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>
          <div class="fotos-cam-arriba"><div><b id="fotos-cam-titulo"></b><small id="fotos-cam-consejo"></small><small class="fotos-msg" id="fotos-cam-msg"></small></div>
            <button type="button" class="fotos-redondo" id="fotos-cam-cerrar" aria-label="Cerrar">✕</button></div>
        </div>
        <div class="fotos-cam-abajo">
          <button type="button" class="fotos-redondo" id="fotos-cam-galeria" aria-label="Elegir de la galería">🖼</button>
          <button type="button" class="fotos-obturador" id="fotos-cam-disparar" aria-label="Tomar foto"></button>
          <span style="display:flex;gap:10px;">
            <button type="button" class="fotos-redondo" id="fotos-cam-fant-btn" aria-pressed="true" aria-label="Mostrar foto anterior encima" title="Foto anterior encima">👻</button>
            <button type="button" class="fotos-redondo" id="fotos-cam-girar" aria-label="Cambiar cámara">🔄</button>
          </span>
        </div>
        <input type="file" id="fotos-input" accept="image/*" hidden>
      </div>
      <div class="fotos-modal" id="fotos-visor" hidden role="dialog" aria-modal="true">
        <div class="fotos-ver"><img id="fotos-ver-img" alt=""></div>
        <div class="fotos-ver-pie">
          <div class="meta" id="fotos-ver-meta"></div>
          <textarea id="fotos-ver-nota" rows="2" maxlength="300" placeholder="Nota (opcional): qué notas, molestias, contexto…"></textarea>
          <div class="fotos-msg" id="fotos-ver-msg"></div>
          <div class="fila">
            <button type="button" class="filtro-labs-btn activo" id="fotos-ver-guardar">Guardar foto</button>
            <button type="button" class="filtro-labs-btn" id="fotos-ver-repetir">Repetir</button>
            <button type="button" class="filtro-labs-btn" id="fotos-ver-comparar">Comparar con la primera</button>
            <button type="button" class="filtro-labs-btn" id="fotos-ver-borrar">Eliminar</button>
            <button type="button" class="filtro-labs-btn" id="fotos-ver-cerrar">Cerrar</button>
          </div>
        </div>
      </div>`;
    while (cont.firstElementChild) doc.body.appendChild(cont.firstElementChild);

    $('fotos-cam-cerrar').onclick = cerrarCamara;
    $('fotos-cam-disparar').onclick = disparar;
    $('fotos-cam-galeria').onclick = () => { const inp = $('fotos-input'); inp.removeAttribute('capture'); inp.value = ''; inp.click(); };
    $('fotos-cam-girar').onclick = () => { cam.frontal = !cam.frontal; encenderCamara(); };
    $('fotos-cam-fant-btn').onclick = () => {
      cam.fantasma = !cam.fantasma;
      const f = $('fotos-cam-fantasma');
      f.style.display = cam.fantasma && f.getAttribute('src') ? '' : 'none';
      $('fotos-cam-fant-btn').setAttribute('aria-pressed', cam.fantasma ? 'true' : 'false');
    };
    $('fotos-input').onchange = e => desdeArchivo(e.target.files && e.target.files[0]);
    $('fotos-ver-guardar').onclick = guardarNueva;
    $('fotos-ver-repetir').onclick = () => { const c = enVista && enVista.categoria; cerrarVisor(); if (c) abrirCamara(c); };
    $('fotos-ver-cerrar').onclick = () => { if (enVista && enVista.id) guardarNota(); cerrarVisor(); };
    $('fotos-ver-borrar').onclick = borrarActual;
    $('fotos-ver-comparar').onclick = () => {
      // La que se está viendo contra el otro extremo de la serie, en orden cronológico.
      const par = parPorDefecto(fotos, enVista.categoria);
      const vista = fotos.find(f => f.id === enVista.id);
      if (par && vista) {
        const otra = par.antes.id === vista.id ? par.despues : par.antes;
        const [a, d] = String(otra.fecha) <= String(vista.fecha) ? [otra, vista] : [vista, otra];
        comparar = { categoria: enVista.categoria, antesId: a.id, despuesId: d.id };
      }
      cerrarVisor(); visibles = true; pintar();
      setTimeout(() => $('fotos-comparar').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };
    $('fotos-ver-nota').onblur = () => { if (enVista && enVista.id) guardarNota(); };
  }

  function iniciar(opciones) {
    ctx = opciones;
    estilos();
    montarModales();
    $('fotos-cats').innerHTML = CATEGORIAS.map(c => `<button type="button" class="fotos-cat" data-cat="${c.id}"><span>${c.icono}</span>${esc(tt(c.nombre))}</button>`).join('');
    $('fotos-cats').onclick = e => { const b = e.target.closest('[data-cat]'); if (b) abrirCamara(b.dataset.cat); };
    $('fotos-filtros').onclick = e => { const b = e.target.closest('[data-filtro]'); if (b) { filtro = b.dataset.filtro; pintar(); } };
    $('fotos-galeria').onclick = e => { const b = e.target.closest('[data-ver]'); if (b) verGuardada(b.dataset.ver); };
    $('fotos-mostrar').onclick = () => { visibles = !visibles; pintar(); };
    $('fotos-comp-cats').onclick = e => {
      const b = e.target.closest('[data-comp]'); if (!b) return;
      const par = parPorDefecto(fotos, b.dataset.comp);
      if (par) { comparar = { categoria: b.dataset.comp, antesId: par.antes.id, despuesId: par.despues.id }; pintarComparar(); }
    };
    $('fotos-comp-rango').oninput = e => moverComparador(+e.target.value);
    if (iniciado) { cargar(); return; }
    iniciado = true;
    raiz.addEventListener('i18n:change', () => { if (ctx) { $('fotos-cats').innerHTML = CATEGORIAS.map(c => `<button type="button" class="fotos-cat" data-cat="${c.id}"><span>${c.icono}</span>${esc(tt(c.nombre))}</button>`).join(''); pintar(); } });
    cargar();
  }
  // Al salir de la pestaña las fotos vuelven a difuminarse.
  function alCambiarTab(tab) { if (tab !== 'fotos' && visibles) { visibles = false; if (ctx) pintar(); } }

  raiz.FotosPaciente = Object.assign(api, { iniciar, alCambiarTab, recargar: () => ctx && cargar() });
})(typeof window !== 'undefined' ? window : globalThis);
