// Escáner de códigos de barras con la cámara del celular.
//
// Usa la librería html5-qrcode (Apache 2.0, copiada en vendor/). Cuando el navegador trae
// lector de códigos propio (Chrome en Android) lo usa; si no (iPhone), lee el código por software.
// Todo corre en el celular: no usa servidores ni hace lecturas extra en Firebase.
// La librería se descarga recién la primera vez que alguien abre el escáner.

const LIB = './vendor/html5-qrcode.min.js';
let libP = null;
let open = null; // escáner abierto (solo uno a la vez)

function loadLib() {
  if (window.__Html5QrcodeLibrary__) return Promise.resolve(window.__Html5QrcodeLibrary__);
  if (!libP) {
    libP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = LIB;
      s.onload = () => (window.__Html5QrcodeLibrary__ ? res(window.__Html5QrcodeLibrary__) : rej(new Error('lib')));
      s.onerror = () => { libP = null; s.remove(); rej(new Error('lib')); };
      document.head.appendChild(s);
    });
  }
  return libP;
}

// ---------- sonido de confirmación ----------
// Un solo "pip" de caja de supermercado al leer bien, y dos tonos graves si algo falla.
// El navegador solo deja sonar después de un toque del usuario: se habilita con el primer toque.
let AC = null;
function audio() {
  if (!AC) { try { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); } catch (e) { AC = null; } }
  if (AC && AC.state !== 'running') { try { AC.resume().catch(() => {}); } catch (e) { /* nada */ } }
  return AC;
}
['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, audio, { once: true, passive: true }));
function tone(ac, t, f, d, vol) {
  const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
  o.type = 'square'; o.frequency.value = f;
  lp.type = 'lowpass'; lp.frequency.value = 5000;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.setValueAtTime(vol, t + d - 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
}
export function beep(ok = true) {
  try { if (navigator.vibrate) navigator.vibrate(ok ? 70 : [60, 80, 60]); } catch (e) { /* sin vibración */ }
  const ac = audio(); if (!ac) return;
  try {
    const t = ac.currentTime + 0.01;
    if (ok) tone(ac, t, 1900, 0.12, 0.32);
    else { tone(ac, t, 380, 0.14, 0.3); tone(ac, t + 0.2, 380, 0.14, 0.3); }
  } catch (e) { /* sin sonido */ }
}

export function canScan() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

// Mismo código escrito de otra forma: UPC-A (12 dígitos) y EAN-13 con un 0 adelante son el mismo producto.
export function codeVariants(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return [];
  const v = [c];
  if (/^\d{12}$/.test(c)) v.push('0' + c);
  if (/^0\d{12}$/.test(c)) v.push(c.slice(1));
  return v;
}
export function findByCode(list, code) {
  const v = codeVariants(code);
  return list.find((x) => x.s && v.includes(String(x.s).trim().toLowerCase())) || null;
}

// Ícono de cámara para los botones.
export const CAM_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M16 8v8"/></svg>';

// Botón cuadrado al lado de un campo de búsqueda / código.
export function scanButton(al) {
  if (!canScan()) return '';
  return '<button type="button" data-al="' + al + '" aria-label="Escanear con la cámara" title="Escanear con la cámara" ' +
    'style="flex:none;width:52px;height:52px;border:0;border-radius:14px;background:var(--btn);color:var(--btnink);display:flex;align-items:center;justify-content:center;cursor:pointer">' + CAM_SVG + '</button>';
}

// opts:
//   title: texto de arriba
//   multi: true = queda abierto para escanear varios productos seguidos (caja)
//   onCode(code) -> { ok, msg, close }  (ok=false muestra el mensaje como aviso)
//   onClose(): se llama al cerrar
//   box: elemento donde mostrar la cámara dentro de la página (carga rápida), en vez de pantalla completa.
//        Queda abierta escaneando; devuelve pause()/resume() para ignorar lecturas mientras se completa un formulario.
export function openScanner(opts) {
  if (open) return;
  const inline = !!opts.box;
  const o = document.createElement('div');
  if (inline) {
    o.style.cssText = 'background:#000;color:#fff;border-radius:18px;overflow:hidden;font-family:inherit';
    o.innerHTML = '<div id="scnv" style="width:100%"></div><div style="padding:8px 12px 10px;text-align:center"><div id="scnm" style="display:inline-block;font-weight:700;font-size:14px;padding:6px 12px;border-radius:10px">Preparando la cámara…</div><small id="scnk" style="display:block;opacity:.7;font-size:12px"></small></div>';
    opts.box.innerHTML = ''; opts.box.appendChild(o);
  } else {
  o.style.cssText = 'position:fixed;inset:0;z-index:90;background:#000;color:#fff;display:flex;flex-direction:column;font-family:inherit';
  o.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 12px">' +
      '<b style="font-size:17px;line-height:1.2">' + escH(opts.title || 'Escaneá el código') + '</b>' +
      '<button type="button" data-scx="1" style="flex:none;border:0;border-radius:99px;padding:10px 18px;background:#fff;color:#111;font:inherit;font-weight:800;cursor:pointer">' + (opts.multi ? 'Listo' : 'Cerrar') + '</button>' +
    '</div>' +
    '<div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;min-height:0"><div id="scnv" style="width:100%;max-width:560px"></div></div>' +
    '<div style="padding:14px 16px calc(18px + env(safe-area-inset-bottom,0px));text-align:center;min-height:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">' +
      '<div id="scnm" style="font-weight:700;font-size:16px;padding:10px 16px;border-radius:14px;max-width:520px">Preparando la cámara…</div>' +
      '<small id="scnk" style="opacity:.7;font-size:13px"></small>' +
    '</div>';
  document.body.appendChild(o);
  }
  const msgEl = o.querySelector('#scnm'), subEl = o.querySelector('#scnk');
  const say = (t, kind) => {
    msgEl.textContent = t;
    msgEl.style.background = kind === 'ok' ? '#1D3FAF' : kind === 'warn' ? '#FFD6AA' : 'transparent';
    msgEl.style.color = kind === 'warn' ? '#102468' : '#fff';
  };

  audio(); // habilita el sonido con este toque (iPhone)

  let h = null, closed = false;
  const st = { open: true };
  open = st;
  const close = () => {
    if (closed) return; closed = true; open = null;
    document.removeEventListener('keydown', onKey);
    const done = () => { o.remove(); if (opts.onClose) opts.onClose(); };
    st.paused = true;
    if (h) { Promise.resolve().then(() => h.stop()).catch(() => {}).then(() => { try { h.clear(); } catch (e) { /* nada */ } done(); }); }
    else done();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  if (!inline) { document.addEventListener('keydown', onKey); o.querySelector('[data-scx]').onclick = close; }

  // Para no sumar dos veces el mismo producto mientras sigue frente a la cámara:
  // el mismo código vuelve a contar recién cuando dejó de verse un ratito.
  const seen = {};           // código -> última vez que se vio
  let lastAccept = 0, count = 0;
  const onRead = (raw) => {
    if (closed || st.paused) return;
    const code = String(raw || '').trim(), now = Date.now();
    if (!code) return;
    const prev = seen[code]; seen[code] = now;
    if (prev && now - prev < 900) return;       // sigue a la vista: es la misma unidad
    if (now - lastAccept < 600) return;          // recién leímos otro
    lastAccept = now;
    let r;
    try { r = opts.onCode(code) || {}; } catch (e) { r = { ok: false, msg: 'Algo falló. Probá de nuevo.' }; }
    beep(r.ok !== false);
    if (r.ok !== false) count++;
    say(r.msg || code, r.ok === false ? 'warn' : 'ok');
    if (opts.multi) subEl.textContent = count ? (inline ? 'Seguí escaneando' : 'Seguí escaneando o tocá Listo') : '';
    if (!inline && (r.close || !opts.multi)) { if (r.ok !== false || r.close) setTimeout(close, r.ok === false ? 900 : 250); }
  };

  loadLib().then((L) => {
    if (closed) return;
    const F = L.Html5QrcodeSupportedFormats;
    const formats = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'ITF', 'CODABAR', 'QR_CODE'].map((k) => F[k]).filter((x) => x != null);
    h = new L.Html5Qrcode('scnv', { formatsToSupport: formats, verbose: false, useBarCodeDetectorIfSupported: true, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    const box = (w, hh) => { const bw = Math.floor(w * 0.86); return { width: bw, height: Math.max(80, Math.floor(Math.min(hh * 0.6, bw * 0.55))) }; };
    const conf = { fps: 12, qrbox: box, disableFlip: true }; if (inline) conf.aspectRatio = 1.6;
    return h.start({ facingMode: 'environment' }, conf, onRead, () => {})
      .then(() => { if (closed) { h.stop().catch(() => {}); return; } say('Apuntá la cámara al código de barras', ''); });
  }).catch((e) => {
    if (closed) return;
    const n = String((e && (e.name || e.message)) || e || '');
    let m = 'No pude abrir la cámara. Probá de nuevo.';
    if (/lib/.test(n)) m = 'No pude cargar el escáner. Revisá la conexión a internet y probá de nuevo.';
    else if (/NotAllowed|Permission|denied/i.test(n)) m = 'Para escanear, permití el uso de la cámara (tocá el candado o los ajustes del navegador) y volvé a intentar.';
    else if (/NotFound|Requested device not found|no camera/i.test(n)) m = 'No encontré una cámara en este dispositivo.';
    else if (/NotReadable|in use|Could not start/i.test(n)) m = 'La cámara la está usando otra app. Cerrala y probá de nuevo.';
    else if (/secure|https/i.test(n)) m = 'La cámara solo funciona con la app abierta en https://pekeronapp.com.';
    say(m, 'warn');
    beep(false);
  });
  return {
    close,
    say,
    pause() { st.paused = true; },
    resume() { st.paused = false; Object.keys(seen).forEach((k) => { seen[k] = Date.now(); }); }
  };
}

function escH(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
