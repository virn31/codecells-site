// lib/fotosClinicasUI.js — piezas de pantalla de las fotos clínicas,
// compartidas por el portal del médico (captura) y la app del paciente
// (solo ver). Las fotos las sube el MÉDICO (lib/fotosClinicas.js).
//   - CATEGORIAS: qué se fotografía, con silueta, cámara sugerida y consejo.
//   - camara({ categoria, fantasmaUrl }): cámara guiada a pantalla completa
//     con silueta y "foto fantasma" (la anterior de la misma categoría,
//     translúcida, para repetir la postura); revisión con nota antes de
//     aceptar. Resuelve { blob, w, h, nota } o null si se cancela.
//   - comparador(contenedor): antes/después con barra deslizable.
// La imagen se guarda SIN espejo aunque se tome con la cámara frontal: en
// una foto clínica izquierda y derecha deben ser las reales.
(function (raiz) {
  'use strict';

  const CATEGORIAS = [
    { id: 'cuerpo-frente', nombre: 'Cuerpo de frente', icono: '🧍', guia: 'cuerpo', camara: 'environment', consejo: 'De pie, brazos ligeramente separados. Misma luz y distancia cada vez.' },
    { id: 'cuerpo-perfil', nombre: 'Cuerpo de perfil', icono: '🚶', guia: 'perfil', camara: 'environment', consejo: 'De lado, mirando al frente, brazos relajados.' },
    { id: 'rostro', nombre: 'Rostro', icono: '🙂', guia: 'rostro', camara: 'environment', consejo: 'Sin maquillaje ni filtros, con luz de frente.' },
    { id: 'piel', nombre: 'Piel o lunar', icono: '🔍', guia: 'piel', camara: 'environment', consejo: 'A unos 15 cm, la zona en el centro del círculo y bien enfocada.' },
    { id: 'herida', nombre: 'Herida o cirugía', icono: '🩹', guia: 'piel', camara: 'environment', consejo: 'Limpia y con buena luz; que se vea completa dentro del círculo.' },
    // Estudio de imagen (ultrasonido, rayos X): sin silueta, se fotografía la pantalla o la impresión.
    { id: 'ultrasonido', nombre: 'Ultrasonido', icono: '🩻', guia: null, camara: 'environment', consejo: 'Imagen del estudio completa, sin reflejos. Que no se vean nombres ni datos de otras personas.' },
    { id: 'documento', nombre: 'Documento', icono: '📄', guia: 'documento', camara: 'environment', consejo: 'Receta o estudio en papel, plano y dentro del marco.' },
  ];
  const POR_ID = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));
  const LADO_MAX = 1600, CALIDAD = 0.85;

  // ─── Funciones puras (test/fotos-clinicas-ui.test.js) ───────────────
  function escalar(w, h, max) {
    const f = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) };
  }
  // Recorte de la imagen de la cámara igual a lo que se ve (object-fit: cover).
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
  function diasEntre(a, b) {
    const d = s => { const x = new Date(s); return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()); };
    return Math.round(Math.abs(d(b) - d(a)) / 864e5);
  }
  // La primera y la última de una categoría (null con menos de dos).
  function parPorDefecto(fotos, categoria) {
    const de = fotos.filter(f => f.categoria === categoria).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    return de.length >= 2 ? { antes: de[0], despues: de[de.length - 1] } : null;
  }

  const api = { CATEGORIAS, POR_ID, escalar, recorteCover, agruparPorMes, diasEntre, parPorDefecto };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ═══ Navegador ═══════════════════════════════════════════════════
  const doc = raiz.document;
  const $ = id => doc.getElementById(id);
  let tt = x => (raiz.t ? raiz.t(x) : x);
  function idioma() { return raiz.getLanguage ? raiz.getLanguage() : 'es'; }
  function fechaCorta(iso) { try { return new Date(iso).toLocaleDateString(idioma(), { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return String(iso).slice(0, 10); } }
  function mesLargo(clave) { try { const t = new Date(clave + '-15T12:00:00').toLocaleDateString(idioma(), { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); } catch (e) { return clave; } }

  const TRAZO = 'fill="none" stroke="#C9A96E" stroke-width="2.5" stroke-dasharray="7 6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"';
  const GUIAS = {
    cuerpo: `<circle cx="150" cy="78" r="36" ${TRAZO}/><path ${TRAZO} d="M132 112v14q-36 4-56 24q-14 14-16 46l-8 132q-1 14 10 16h8l10-112h7l4 100q4 92 8 140l3 96q1 12 14 12h14l6-106 5-88h10l5 88 6 106h14q13 0 14-12l3-96q4-48 8-140l4-100h7l10 112h8q11-2 10-16l-8-132q-2-32-16-46q-20-20-56-24v-14"/><line x1="150" y1="20" x2="150" y2="590" stroke="#C9A96E" stroke-width="1" opacity="0.35"/>`,
    perfil: `<ellipse cx="158" cy="78" rx="32" ry="38" ${TRAZO}/><path ${TRAZO} d="M150 115l-2 12q-30 10-32 48q-3 56 8 116q-6 40 3 70l7 110-3 90q0 14 18 14h36l-8-14-8-90 3-110q12-30 8-70q14-58 10-118q-4-36-24-46l3-12"/><line x1="150" y1="20" x2="150" y2="590" stroke="#C9A96E" stroke-width="1" opacity="0.35"/>`,
    rostro: `<ellipse cx="150" cy="270" rx="96" ry="128" ${TRAZO}/><line x1="62" y1="250" x2="238" y2="250" stroke="#C9A96E" stroke-width="1" opacity="0.4"/><line x1="150" y1="130" x2="150" y2="410" stroke="#C9A96E" stroke-width="1" opacity="0.4"/>`,
    piel: `<circle cx="150" cy="300" r="105" ${TRAZO}/><line x1="150" y1="270" x2="150" y2="330" stroke="#C9A96E" stroke-width="1.5" opacity="0.6"/><line x1="120" y1="300" x2="180" y2="300" stroke="#C9A96E" stroke-width="1.5" opacity="0.6"/>`,
    documento: `<path fill="none" stroke="#C9A96E" stroke-width="2.5" stroke-linecap="round" opacity="0.9" d="M40 110h40M40 110v40M260 110h-40M260 110v40M40 490h40M40 490v-40M260 490h-40M260 490v-40"/><rect x="40" y="110" width="220" height="380" fill="none" stroke="#C9A96E" stroke-width="1" opacity="0.3"/>`,
  };

  function estilos() {
    if ($('fcui-estilos')) return;
    const st = doc.createElement('style'); st.id = 'fcui-estilos';
    st.textContent = `
      .fcui-modal { position:fixed; inset:0; z-index:2000; background:#000; display:flex; flex-direction:column; color:#fff; font-family:'DM Sans',system-ui,sans-serif; }
      .fcui-modal[hidden] { display:none; }
      .fcui-vista { position:relative; flex:1; overflow:hidden; background:#000; }
      .fcui-vista video, .fcui-vista .fantasma { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      .fcui-vista .fantasma { opacity:.35; pointer-events:none; }
      .fcui-vista svg { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
      .fcui-espejo { transform:scaleX(-1); }
      .fcui-arriba { position:absolute; top:0; left:0; right:0; padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 30px; background:linear-gradient(rgba(0,0,0,.7),transparent); display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
      .fcui-arriba b { font-size:15px; font-weight:600; } .fcui-arriba small { display:block; font-size:12px; color:rgba(255,255,255,.75); margin-top:3px; max-width:280px; }
      .fcui-abajo { padding:18px 20px calc(env(safe-area-inset-bottom,0px) + 22px); display:flex; justify-content:space-around; align-items:center; background:#000; }
      .fcui-redondo { width:46px; height:46px; border-radius:50%; border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.08); color:#fff; font-size:19px; cursor:pointer; }
      .fcui-redondo[aria-pressed=true] { background:#C9A96E; color:#000; border-color:#C9A96E; }
      .fcui-obturador { width:74px; height:74px; border-radius:50%; border:4px solid #fff; background:#C9A96E; cursor:pointer; box-shadow:0 0 0 4px rgba(201,169,110,.35); }
      .fcui-obturador:active { transform:scale(.94); }
      .fcui-ver { flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden; padding-top:env(safe-area-inset-top,0px); }
      .fcui-ver img { max-width:100%; max-height:100%; object-fit:contain; }
      .fcui-pie { padding:14px 18px calc(env(safe-area-inset-bottom,0px) + 18px); background:#0a0a0a; display:flex; flex-direction:column; gap:10px; }
      .fcui-pie .meta { font-size:13px; color:rgba(255,255,255,.8); }
      .fcui-pie textarea { width:100%; box-sizing:border-box; background:#1a1a1a; color:#fff; border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:9px 11px; font:13px inherit; resize:none; }
      .fcui-fila { display:flex; gap:8px; flex-wrap:wrap; }
      .fcui-btn { font:500 12.5px inherit; padding:9px 15px; border-radius:20px; border:1px solid rgba(255,255,255,.2); background:#1a1a1a; color:#fff; cursor:pointer; }
      .fcui-btn.oro { background:#C9A96E; border-color:#C9A96E; color:#000; font-weight:600; }
      .fcui-btn:disabled { opacity:.5; }
      .fcui-msg { font-size:12px; min-height:16px; }
      .fcui-comp { position:relative; aspect-ratio:3/4; max-height:70vh; border-radius:16px; overflow:hidden; background:#1a1a1a; touch-action:none; user-select:none; margin:0 auto; }
      .fcui-comp img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; pointer-events:none; }
      .fcui-comp .linea { position:absolute; top:0; bottom:0; left:50%; width:2px; margin-left:-1px; background:#C9A96E; box-shadow:0 0 12px rgba(201,169,110,.8); pointer-events:none; }
      .fcui-comp .linea::after { content:'⟷'; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:38px; height:38px; border-radius:50%; background:#C9A96E; color:#000; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:700; }
      .fcui-comp .etq { position:absolute; top:10px; font-size:11px; color:#fff; background:rgba(0,0,0,.6); padding:4px 9px; border-radius:10px; pointer-events:none; }
      .fcui-comp .etq.izq { left:10px; } .fcui-comp .etq.der { right:10px; }
      .fcui-comp input[type=range] { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:ew-resize; margin:0; }
      .fcui-delta { text-align:center; font-size:13px; color:#C9A96E; margin-top:10px; }
    `;
    doc.head.appendChild(st);
  }

  // ─── Cámara guiada ────────────────────────────────────────────────
  function montarCamara() {
    if ($('fcui-camara')) return;
    const c = doc.createElement('div');
    c.innerHTML = `
      <div class="fcui-modal" id="fcui-camara" hidden role="dialog" aria-modal="true" aria-labelledby="fcui-titulo">
        <div class="fcui-vista" id="fcui-vista">
          <video id="fcui-video" playsinline muted></video>
          <img class="fantasma" id="fcui-fantasma" alt="">
          <svg id="fcui-guia" viewBox="0 0 300 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>
          <div class="fcui-arriba"><div><b id="fcui-titulo"></b><small id="fcui-consejo"></small><small class="fcui-msg" id="fcui-msg" style="color:#ff8a80;"></small></div>
            <button type="button" class="fcui-redondo" id="fcui-cerrar" aria-label="Cerrar">✕</button></div>
        </div>
        <div class="fcui-abajo">
          <button type="button" class="fcui-redondo" id="fcui-archivo" aria-label="Elegir archivo">🖼</button>
          <button type="button" class="fcui-obturador" id="fcui-disparar" aria-label="Tomar foto"></button>
          <span style="display:flex;gap:10px;">
            <button type="button" class="fcui-redondo" id="fcui-fant-btn" aria-pressed="true" aria-label="Foto anterior encima" title="Foto anterior encima">👻</button>
            <button type="button" class="fcui-redondo" id="fcui-girar" aria-label="Cambiar cámara">🔄</button>
          </span>
        </div>
        <input type="file" id="fcui-input" accept="image/*" hidden>
      </div>
      <div class="fcui-modal" id="fcui-revision" hidden role="dialog" aria-modal="true">
        <div class="fcui-ver"><img id="fcui-rev-img" alt=""></div>
        <div class="fcui-pie">
          <div class="meta" id="fcui-rev-meta"></div>
          <textarea id="fcui-rev-nota" rows="2" maxlength="300" placeholder="Nota clínica (opcional): zona, lado, evolución…"></textarea>
          <div class="fcui-fila">
            <button type="button" class="fcui-btn oro" id="fcui-rev-ok">Usar esta foto</button>
            <button type="button" class="fcui-btn" id="fcui-rev-repetir">Repetir</button>
            <button type="button" class="fcui-btn" id="fcui-rev-cancelar">Cancelar</button>
          </div>
        </div>
      </div>`;
    while (c.firstElementChild) doc.body.appendChild(c.firstElementChild);
  }

  // Abre la cámara; resuelve { blob, w, h, nota } o null.
  function camara({ categoria, fantasmaUrl }) {
    estilos(); montarCamara();
    const cat = POR_ID[categoria]; if (!cat) return Promise.resolve(null);
    return new Promise(resolver => {
      const st = { stream: null, frontal: cat.camara === 'user', fantasma: true, previa: null, terminado: false };
      const video = $('fcui-video'), fant = $('fcui-fantasma');
      const msg = t => { $('fcui-msg').textContent = t ? tt(t) : ''; };
      const detener = () => { if (st.stream) st.stream.getTracks().forEach(t => t.stop()); st.stream = null; };
      const fin = valor => {
        if (st.terminado) return; st.terminado = true; detener();
        $('fcui-camara').hidden = true; $('fcui-revision').hidden = true; doc.body.style.overflow = '';
        if (st.previa) URL.revokeObjectURL(st.previa.url);
        resolver(valor);
      };
      async function encender() {
        detener(); msg('');
        $('fcui-camara').hidden = false; $('fcui-revision').hidden = true; doc.body.style.overflow = 'hidden';
        if (!raiz.navigator.mediaDevices || !raiz.navigator.mediaDevices.getUserMedia) { msg('No pudimos abrir la cámara aquí. Elige la foto con el selector.'); return; }
        try {
          st.stream = await raiz.navigator.mediaDevices.getUserMedia({ video: { facingMode: st.frontal ? 'user' : 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
          video.srcObject = st.stream; await video.play().catch(() => {});
          video.classList.toggle('fcui-espejo', st.frontal); fant.classList.toggle('fcui-espejo', st.frontal);
        } catch (e) {
          msg(e && e.name === 'NotAllowedError' ? 'No hay permiso para la cámara. Permítelo en los ajustes del navegador o elige la foto con el selector.' : 'No pudimos abrir la cámara aquí. Elige la foto con el selector.');
        }
      }
      async function procesar(fuente, sw0, sh0, rc, espejo) {
        const r = rc || { sx: 0, sy: 0, sw: sw0, sh: sh0 };
        const m = escalar(r.sw, r.sh, LADO_MAX);
        const cv = doc.createElement('canvas'); cv.width = m.w; cv.height = m.h;
        const g = cv.getContext('2d');
        if (espejo) { g.translate(m.w, 0); g.scale(-1, 1); }
        g.drawImage(fuente, r.sx, r.sy, r.sw, r.sh, 0, 0, m.w, m.h);
        const blob = await new Promise((ok, mal) => cv.toBlob(b => b ? ok(b) : mal(new Error('toBlob')), 'image/jpeg', CALIDAD));
        return { blob, w: m.w, h: m.h };
      }
      function revisar(p) {
        detener();
        if (st.previa) URL.revokeObjectURL(st.previa.url);
        st.previa = { ...p, url: URL.createObjectURL(p.blob) };
        $('fcui-rev-img').src = st.previa.url;
        $('fcui-rev-meta').textContent = cat.icono + ' ' + tt(cat.nombre) + ' · ' + fechaCorta(new Date().toISOString());
        $('fcui-rev-nota').value = '';
        $('fcui-camara').hidden = true; $('fcui-revision').hidden = false;
      }
      $('fcui-titulo').textContent = cat.icono + ' ' + tt(cat.nombre);
      $('fcui-consejo').textContent = tt(cat.consejo);
      $('fcui-guia').innerHTML = GUIAS[cat.guia] || '';
      if (fantasmaUrl) { fant.src = fantasmaUrl; fant.style.display = ''; } else { fant.removeAttribute('src'); fant.style.display = 'none'; }
      $('fcui-fant-btn').style.display = fantasmaUrl ? '' : 'none';
      $('fcui-fant-btn').setAttribute('aria-pressed', 'true');
      $('fcui-cerrar').onclick = () => fin(null);
      $('fcui-rev-cancelar').onclick = () => fin(null);
      $('fcui-rev-repetir').onclick = () => encender();
      $('fcui-rev-ok').onclick = () => fin({ blob: st.previa.blob, w: st.previa.w, h: st.previa.h, nota: $('fcui-rev-nota').value.trim().slice(0, 300) });
      $('fcui-girar').onclick = () => { st.frontal = !st.frontal; encender(); };
      $('fcui-fant-btn').onclick = () => { st.fantasma = !st.fantasma; fant.style.display = st.fantasma ? '' : 'none'; $('fcui-fant-btn').setAttribute('aria-pressed', st.fantasma ? 'true' : 'false'); };
      $('fcui-archivo').onclick = () => { const i = $('fcui-input'); i.value = ''; i.click(); };
      $('fcui-input').onchange = e => {
        const archivo = e.target.files && e.target.files[0]; if (!archivo) return;
        const img = new Image(); const u = URL.createObjectURL(archivo);
        img.onload = async () => { try { revisar(await procesar(img, img.naturalWidth, img.naturalHeight, null, false)); } catch (er) { msg('No pudimos leer esa imagen.'); } finally { URL.revokeObjectURL(u); } };
        img.onerror = () => { URL.revokeObjectURL(u); msg('No pudimos leer esa imagen.'); };
        img.src = u;
      };
      $('fcui-disparar').onclick = async () => {
        if (!st.stream || !video.videoWidth) { $('fcui-archivo').click(); return; }
        const v = $('fcui-vista');
        try { revisar(await procesar(video, video.videoWidth, video.videoHeight, recorteCover(video.videoWidth, video.videoHeight, v.clientWidth, v.clientHeight), st.frontal)); }
        catch (e) { msg('No se pudo tomar la foto. Intenta de nuevo.'); }
      };
      encender();
    });
  }

  // ─── Comparador antes/después ─────────────────────────────────────
  // comparador(caja).mostrar(antes, despues) con { url, fecha }.
  function comparador(caja) {
    estilos();
    caja.innerHTML = `<div class="fcui-comp"><img class="a" alt=""><img class="d" alt=""><div class="linea"></div><span class="etq izq"></span><span class="etq der"></span><input type="range" min="0" max="100" value="50" aria-label="Deslizar para comparar"></div><div class="fcui-delta"></div>`;
    const ia = caja.querySelector('img.a'), id = caja.querySelector('img.d'), linea = caja.querySelector('.linea'), rango = caja.querySelector('input');
    const mover = pct => { id.style.clipPath = `inset(0 0 0 ${pct}%)`; linea.style.left = pct + '%'; rango.value = pct; };
    rango.oninput = e => mover(+e.target.value);
    return {
      mostrar(antes, despues) {
        ia.src = antes.url; id.src = despues.url;
        caja.querySelector('.etq.izq').textContent = tt('Antes') + ' · ' + fechaCorta(antes.fecha);
        caja.querySelector('.etq.der').textContent = tt('Después') + ' · ' + fechaCorta(despues.fecha);
        const n = diasEntre(antes.fecha, despues.fecha);
        caja.querySelector('.fcui-delta').textContent = n === 0 ? tt('Mismo día') : '+' + n + ' ' + tt(n === 1 ? 'día de diferencia' : 'días de diferencia');
        mover(50);
      },
    };
  }

  // Blob → 'data:image/jpeg;base64,…' (para subirla en JSON).
  function aDataUrl(blob) { return new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(r.error); r.readAsDataURL(blob); }); }

  raiz.FotosClinicasUI = Object.assign(api, { camara, comparador, aDataUrl, fechaCorta, mesLargo, estilos, usarTraductor: f => { tt = f; } });
})(typeof window !== 'undefined' ? window : globalThis);
