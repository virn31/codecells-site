// lib/fotosPaciente.js — pestaña "Fotos" de la app del paciente (mi-nivel.html).
//
// Las fotos las SUBE EL MÉDICO al expediente (decisión de Víctor 2026-10-27;
// lib/fotosClinicas.js). Aquí el paciente solo las VE (nova
// paciente_mis_fotos): galería por mes, antes/después de una misma
// categoría, y "Guardar en mi galería".
// - Galería difuminada hasta que el paciente toca "Mostrar" (y otra vez al
//   salir de la pestaña): son fotos clínicas en un teléfono que otros ven.
// - Guardar: en la app instalada (Capacitor) con el complemento Media, en el
//   álbum "CODE CELLS"; en el navegador, menú de compartir o descarga.
// - Las URL de Airtable vencen a las ~2 h: se piden de nuevo al abrir la
//   pestaña, nunca se guardan.
// Piezas comunes (categorías, comparador): lib/fotosClinicasUI.js.
(function (raiz) {
  'use strict';
  const doc = raiz.document;
  const UI = () => raiz.FotosClinicasUI;
  const $ = id => doc.getElementById(id);
  const ALBUM = 'CODE CELLS';

  let ctx = null;            // { esc, tt, postNova }
  let fotos = null;          // null = sin cargar; [] = vacío
  let filtro = 'todas';
  let visibles = false;
  let comparar = null;       // { categoria, antesId, despuesId }
  let comp = null;           // comparador montado
  let enVista = null;
  let iniciado = false;

  const tt = x => (ctx && ctx.tt ? ctx.tt(x) : x);
  const esc = x => (ctx && ctx.esc ? ctx.esc(x) : String(x));
  const cat = id => (UI().POR_ID[id] || { icono: '📷', nombre: 'Foto' });
  function mensaje(id, texto, error) { const m = $(id); if (!m) return; m.textContent = texto ? tt(texto) : ''; m.style.color = error ? '#E2574B' : 'var(--text-2)'; }

  function estilos() {
    if ($('fotos-estilos')) return;
    const st = doc.createElement('style'); st.id = 'fotos-estilos';
    st.textContent = `
      .fotos-aviso { display:flex; gap:10px; align-items:flex-start; font-size:12px; color:var(--text-2); line-height:1.5; padding:12px 14px; border:1px solid var(--border-dim); border-radius:14px; background:var(--black-2); }
      .fotos-aviso b { color:var(--text-1); font-weight:600; }
      .fotos-barra { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
      .fotos-filtros { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
      .fotos-filtros::-webkit-scrollbar { display:none; }
      .fotos-filtros .filtro-labs-btn { white-space:nowrap; }
      .fotos-mes { font-size:12px; color:var(--text-2); margin:18px 2px 8px; }
      .fotos-rejilla { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; }
      .fotos-celda { position:relative; aspect-ratio:3/4; border-radius:10px; overflow:hidden; background:var(--black-3); border:none; padding:0; cursor:pointer; }
      .fotos-celda img { width:100%; height:100%; object-fit:cover; display:block; transition:filter .25s; }
      .fotos-privado .fotos-celda img, .fotos-privado .fcui-comp img { filter:blur(16px) saturate(.6); }
      /* Difuminadas: tocar cualquiera las muestra (antes solo el botón de abajo, que no se veía). */
      .fotos-velo { display:none; position:absolute; inset:0; z-index:4; align-items:center; justify-content:center; background:transparent; border:none; padding:0; cursor:pointer; }
      .fotos-velo span { font:600 13px var(--font-sans); color:#fff; background:rgba(0,0,0,.6); border:1px solid rgba(255,255,255,.25); padding:9px 16px; border-radius:20px; }
      .fotos-privado .fotos-velo { display:flex; }
      .fotos-privado .fotos-celda i { display:none; }
      .fotos-celda i { position:absolute; left:6px; bottom:6px; font-style:normal; font-size:10px; color:#fff; background:rgba(0,0,0,.55); padding:2px 6px; border-radius:8px; }
      .fotos-vacio { text-align:center; color:var(--text-3); font-size:13px; padding:26px 10px; line-height:1.6; }
      .fotos-msg { font-size:12px; min-height:16px; }
    `;
    doc.head.appendChild(st);
  }

  // ─── Carga ────────────────────────────────────────────────────────
  async function cargar() {
    mensaje('fotos-estado', 'Cargando…');
    try {
      const x = await ctx.postNova({ action: 'paciente_mis_fotos' });
      if (!x.ok) { fotos = null; mensaje('fotos-estado', (x.d && x.d.error) || 'No pudimos cargar tus fotos.', true); pintar(); return; }
      fotos = (x.d.fotos || []).filter(f => f.url);
      mensaje('fotos-estado', '');
    } catch (e) { fotos = null; mensaje('fotos-estado', 'Sin conexión — no pudimos cargar tus fotos.', true); }
    pintar();
  }

  function pintar() {
    const tab = $('fotos-tab'); if (!tab) return;
    tab.classList.toggle('fotos-privado', !visibles);
    const lista = fotos || [];
    $('fotos-mostrar').textContent = tt(visibles ? '🙈 Ocultar' : '👁 Mostrar');
    $('fotos-mostrar').style.display = lista.length ? '' : 'none';
    const usadas = UI().CATEGORIAS.filter(c => lista.some(f => f.categoria === c.id));
    if (filtro !== 'todas' && !usadas.some(c => c.id === filtro)) filtro = 'todas';
    $('fotos-filtros').innerHTML = usadas.length > 1
      ? ['todas'].concat(usadas.map(c => c.id)).map(id => `<button type="button" class="filtro-labs-btn${filtro === id ? ' activo' : ''}" data-filtro="${id}">${id === 'todas' ? esc(tt('Todas')) : cat(id).icono + ' ' + esc(tt(cat(id).nombre))}</button>`).join('')
      : '';
    const visibles_ = filtro === 'todas' ? lista : lista.filter(f => f.categoria === filtro);
    const grupos = UI().agruparPorMes(visibles_);
    $('fotos-galeria').innerHTML = fotos === null ? ''
      : grupos.length ? grupos.map(m => `<div class="fotos-mes">${esc(UI().mesLargo(m.clave))}</div><div class="fotos-rejilla">${m.fotos.map(f => `<button type="button" class="fotos-celda" data-ver="${esc(f.id)}" aria-label="${esc(tt(cat(f.categoria).nombre))} ${esc(UI().fechaCorta(f.fecha))}"><img src="${esc(f.miniatura || f.url)}" alt="" loading="lazy" referrerpolicy="no-referrer"><i>${cat(f.categoria).icono} ${esc(UI().fechaCorta(f.fecha))}</i></button>`).join('')}</div>`).join('')
      : `<div class="fotos-vacio">${esc(tt('Aquí verás las fotos que tu médico agregue a tu expediente: tu evolución, una lesión, una herida.'))}</div>`;
    pintarComparar();
  }

  function pintarComparar() {
    const caja = $('fotos-comparar');
    const lista = fotos || [];
    const cats = UI().CATEGORIAS.filter(c => lista.filter(f => f.categoria === c.id).length >= 2);
    if (!cats.length) { caja.style.display = 'none'; return; }
    caja.style.display = '';
    if (!comparar || !cats.some(c => c.id === comparar.categoria) || !lista.some(f => f.id === comparar.antesId) || !lista.some(f => f.id === comparar.despuesId)) {
      const par = UI().parPorDefecto(lista, cats[0].id);
      comparar = { categoria: cats[0].id, antesId: par.antes.id, despuesId: par.despues.id };
    }
    $('fotos-comp-cats').innerHTML = cats.length > 1 ? cats.map(c => `<button type="button" class="filtro-labs-btn${c.id === comparar.categoria ? ' activo' : ''}" data-comp="${c.id}">${c.icono} ${esc(tt(c.nombre))}</button>`).join('') : '';
    if (!comp) {
      comp = UI().comparador($('fotos-comp-caja'));
      const velo = doc.createElement('button');
      velo.type = 'button'; velo.className = 'fotos-velo';
      velo.innerHTML = `<span>${esc(tt('🔒 Toca para ver'))}</span>`;
      velo.onclick = () => { visibles = true; pintar(); };
      $('fotos-comp-caja').querySelector('.fcui-comp').appendChild(velo);
    }
    comp.mostrar(lista.find(f => f.id === comparar.antesId), lista.find(f => f.id === comparar.despuesId));
  }

  // ─── Visor y guardar en la galería ────────────────────────────────
  function montarVisor() {
    if ($('fotos-visor')) return;
    const c = doc.createElement('div');
    c.innerHTML = `<div class="fcui-modal" id="fotos-visor" hidden role="dialog" aria-modal="true">
        <div class="fcui-ver"><img id="fotos-ver-img" alt="" referrerpolicy="no-referrer"></div>
        <div class="fcui-pie">
          <div class="meta" id="fotos-ver-meta"></div>
          <div class="meta" id="fotos-ver-nota" style="color:rgba(255,255,255,.65);white-space:pre-line;"></div>
          <div class="fcui-msg" id="fotos-ver-msg"></div>
          <div class="fcui-fila">
            <button type="button" class="fcui-btn oro" id="fotos-ver-guardar">⬇ Guardar en mi galería</button>
            <button type="button" class="fcui-btn" id="fotos-ver-comparar">Comparar con la primera</button>
            <button type="button" class="fcui-btn" id="fotos-ver-cerrar">Cerrar</button>
          </div>
        </div>
      </div>`;
    doc.body.appendChild(c.firstElementChild);
    $('fotos-ver-cerrar').onclick = cerrarVisor;
    $('fotos-ver-guardar').onclick = () => guardarEnGaleria(enVista);
    $('fotos-ver-comparar').onclick = () => {
      const lista = fotos || []; const vista = enVista;
      const par = UI().parPorDefecto(lista, vista.categoria);
      if (par) {
        const otra = par.antes.id === vista.id ? par.despues : par.antes;
        const [a, d] = String(otra.fecha) <= String(vista.fecha) ? [otra, vista] : [vista, otra];
        comparar = { categoria: vista.categoria, antesId: a.id, despuesId: d.id };
      }
      cerrarVisor(); visibles = true; pintar();
      setTimeout(() => $('fotos-comparar').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };
  }
  function abrirVisor(f) {
    montarVisor(); enVista = f;
    $('fotos-ver-img').src = f.url;
    $('fotos-ver-meta').textContent = cat(f.categoria).icono + ' ' + tt(cat(f.categoria).nombre) + ' · ' + UI().fechaCorta(f.fecha);
    $('fotos-ver-nota').textContent = f.nota || '';
    $('fotos-ver-comparar').style.display = (fotos || []).filter(x => x.categoria === f.categoria).length >= 2 ? '' : 'none';
    mensaje('fotos-ver-msg', '');
    $('fotos-visor').hidden = false; doc.body.style.overflow = 'hidden';
  }
  function cerrarVisor() { $('fotos-visor').hidden = true; doc.body.style.overflow = ''; enVista = null; }

  function nombreArchivo(f) { return `codecells-${String(f.fecha).slice(0, 10)}-${f.categoria}`; }
  async function guardarEnGaleria(f) {
    if (!f) return;
    const btn = $('fotos-ver-guardar'); btn.disabled = true;
    mensaje('fotos-ver-msg', 'Guardando…');
    try {
      const C = raiz.Capacitor;
      const Media = C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Media;
      if (Media) {
        // App instalada: directo a la galería, en el álbum "CODE CELLS".
        let album = ((await Media.getAlbums()).albums || []).find(a => a.name === ALBUM);
        if (!album) { await Media.createAlbum({ name: ALBUM }); album = ((await Media.getAlbums()).albums || []).find(a => a.name === ALBUM); }
        await Media.savePhoto({ path: f.url, albumIdentifier: album && album.identifier, fileName: nombreArchivo(f) });
        mensaje('fotos-ver-msg', '✓ Guardada en tu galería, en el álbum CODE CELLS.');
        return;
      }
      // Navegador: menú de compartir del teléfono (incluye "Guardar imagen") o descarga.
      const r = await fetch(f.url);
      if (!r.ok) throw new Error('descarga ' + r.status);
      const blob = await r.blob();
      const archivo = new File([blob], nombreArchivo(f) + '.jpg', { type: blob.type || 'image/jpeg' });
      if (raiz.navigator.canShare && raiz.navigator.canShare({ files: [archivo] })) {
        await raiz.navigator.share({ files: [archivo] });
        mensaje('fotos-ver-msg', '');
      } else {
        const u = URL.createObjectURL(blob); const a = doc.createElement('a');
        a.href = u; a.download = archivo.name; doc.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 10000);
        mensaje('fotos-ver-msg', '✓ Descargada.');
      }
    } catch (e) {
      if (e && e.name === 'AbortError') { mensaje('fotos-ver-msg', ''); return; }   // cerró el menú de compartir
      mensaje('fotos-ver-msg', 'No se pudo guardar. Mantén presionada la foto para guardarla.', true);
    } finally { btn.disabled = false; }
  }

  // ─── Montaje ──────────────────────────────────────────────────────
  function iniciar(opciones) {
    ctx = opciones;
    if (!UI()) { mensaje('fotos-estado', 'No pudimos cargar la sección de fotos.', true); return; }
    UI().usarTraductor(tt);
    estilos(); UI().estilos();
    if (!iniciado) {
      iniciado = true;
      $('fotos-filtros').onclick = e => { const b = e.target.closest('[data-filtro]'); if (b) { filtro = b.dataset.filtro; pintar(); } };
      // Difuminadas, el primer toque solo las muestra; ya visibles, abre la foto.
      $('fotos-galeria').onclick = e => {
        const b = e.target.closest('[data-ver]'); const f = b && (fotos || []).find(x => x.id === b.dataset.ver);
        if (!f) return;
        if (!visibles) { visibles = true; pintar(); return; }
        abrirVisor(f);
      };
      $('fotos-mostrar').onclick = () => { visibles = !visibles; pintar(); };
      $('fotos-comp-cats').onclick = e => {
        const b = e.target.closest('[data-comp]'); if (!b) return;
        const par = UI().parPorDefecto(fotos || [], b.dataset.comp);
        if (par) { comparar = { categoria: b.dataset.comp, antesId: par.antes.id, despuesId: par.despues.id }; pintarComparar(); }
      };
      raiz.addEventListener('i18n:change', () => { if (fotos) pintar(); });
    }
    fotos = null; comparar = null;
    cargar();
  }
  // Al entrar se recargan (las URL vencen); al salir, se vuelven a difuminar.
  function alCambiarTab(tab) {
    if (!ctx) return;
    if (tab === 'fotos') cargar();
    else if (visibles) { visibles = false; pintar(); }
  }

  raiz.FotosPaciente = { iniciar, alCambiarTab, recargar: () => ctx && cargar() };
})(window);
