// Cuenta del cliente en el menú (catálogo): registro con email y contraseña o con Google.
// El local elige en Clientes si lo pide: public/info.reg = 'opc' (opcional) u 'obl' (obligatorio antes del primer pedido).
// Usa una app de Firebase aparte ('cli'): así la sesión del cliente nunca pisa la del dueño si abre su propio menú
// en el mismo navegador donde usa Pekeron.
// Ficha del cliente en el local: stores/{sid}/cr/{uid} = { n, tel, em, mk (acepta promos por email), mkat, at, u }.
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const AUTH = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
// Navegadores dentro de apps (Instagram, Facebook, TikTok…): Google no deja entrar desde ahí.
export const enApp = () => /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Snapchat|Twitter/i.test(navigator.userAgent || '');
const MSG = {
  'auth/email-already-in-use': 'Ya hay una cuenta con ese email. Tocá "Ya tengo cuenta" para entrar.',
  'auth/invalid-credential': 'El email o la contraseña no coinciden.',
  'auth/wrong-password': 'El email o la contraseña no coinciden.',
  'auth/user-not-found': 'No hay ninguna cuenta con ese email. Tocá "Crear cuenta".',
  'auth/invalid-email': 'Ese email no parece válido. Revisalo.',
  'auth/missing-password': 'Escribí tu contraseña.',
  'auth/weak-password': 'La contraseña tiene que tener al menos 6 letras o números.',
  'auth/too-many-requests': 'Hubo muchos intentos seguidos. Esperá unos minutos y probá de nuevo.',
  'auth/network-request-failed': 'No hay internet. Revisá la conexión y probá de nuevo.',
  'auth/popup-blocked': 'Tu navegador bloqueó la ventana de Google. Probá de nuevo o usá email y contraseña.',
  'auth/operation-not-supported-in-this-environment': 'Desde acá no se puede entrar con Google. Usá email y contraseña.',
  'auth/web-storage-unsupported': 'Desde acá no se puede entrar con Google. Usá email y contraseña.',
  'auth/operation-not-allowed': 'Este tipo de cuenta todavía no está activado. Probá con la otra opción.',
  'auth/unauthorized-domain': 'Este tipo de cuenta todavía no está activado. Probá con la otra opción.'
};
const msgDe = (e) => MSG[e && e.code] || 'No se pudo. Probá de nuevo.';

// X: cfg (firebaseConfig), sid(), info(), cli() → {n, t}, esc, onCambio()
export function createCuenta(X) {
  let P = null, A = null, au = null, db = null, CU = null, CR = null, listo = false;
  const modo = () => { const r = X.info() && X.info().reg; return r === 'opc' || r === 'obl' ? r : ''; };
  const yaEntro = () => { try { return localStorage.getItem('pk_cu') === '1'; } catch (e) { return false; } };
  function cargar() {
    if (P) return P;
    P = import(AUTH).then((m) => {
      A = m;
      const app = getApps().find((a) => a.name === 'cli') || initializeApp(X.cfg, 'cli');
      au = A.getAuth(app); db = getFirestore(app);
      try { au.languageCode = 'es'; } catch (e) { /* */ }
      return new Promise((res) => {
        A.onAuthStateChanged(au, (u) => {
          CU = u; CR = null;
          try { if (u) localStorage.setItem('pk_cu', '1'); else localStorage.removeItem('pk_cu'); } catch (e) { /* */ }
          const fin = () => { listo = true; res(); X.onCambio(); };
          if (!u) { fin(); return; }
          getDoc(doc(db, 'stores', X.sid(), 'cr', u.uid)).then((s) => {
            CR = s.exists() ? s.data() : null;
            const c = X.cli(); if (CR) { if (!c.n && CR.n) c.n = CR.n; if (!c.t && CR.tel) c.t = CR.tel; }
          }).catch(() => {}).then(fin);
        });
      });
    });
    return P;
  }
  // Se carga solo si el local pide registro o si este navegador ya entró antes.
  function iniciar() { css(); if (modo() || yaEntro()) cargar().catch(() => {}); }
  async function guardarPerfil(o) {
    const now = Date.now(), d = { n: String(o.n || '').slice(0, 60), tel: String(o.tel || '').slice(0, 24), em: String(CU.email || o.em || '').slice(0, 120), mk: !!o.mk, u: now };
    if (!CR || !CR.at) d.at = now;
    if (!CR || !!CR.mk !== d.mk) d.mkat = now;
    await setDoc(doc(db, 'stores', X.sid(), 'cr', CU.uid), d, { merge: true });
    CR = Object.assign({}, CR || {}, d);
  }
  // Html para el formulario del pedido.
  function formHtml(mesa) {
    const m = modo(); if (mesa || (!m && !CU)) return '';
    const esc = X.esc;
    if (CU && CR) return '<div class="cta-ok">✓ Pedís con tu cuenta <b>' + esc(CU.email || CR.em || '') + '</b> <button type="button" data-ctsal="1">Salir</button></div>';
    if (CU && !CR) return '<button type="button" class="cta-b" data-cta="1">Completá tus datos para terminar tu cuenta</button>';
    if (!listo) return '<div class="cta-ok" style="opacity:.7">Cargando…</div>';
    return '<div class="cta-inv"><b>' + (m === 'obl' ? '👋 Creá tu cuenta para hacer tu primer pedido' : '👋 Creá tu cuenta (opcional)') + '</b>' +
      '<span>Es un minuto y la próxima vez tu navegador te recuerda: no volvés a escribir nada.</span>' +
      '<button type="button" class="cta-b" data-cta="1">Crear cuenta o entrar</button></div>';
  }
  // ¿Hay que pedir la cuenta antes de mandar este pedido?
  const falta = (mesa) => !mesa && modo() === 'obl' && !(CU && CR);
  function salir() { if (au && confirm('¿Salir de tu cuenta en este celular?')) A.signOut(au).catch(() => {}); }

  // ---------- Ventana de registro / entrada ----------
  function abrir(alTerminar) {
    css();
    cargar().then(() => pintar(CU && !CR ? 'datos' : 'alta', alTerminar)).catch(() => alert('No se pudo cargar. Revisá tu internet.'));
  }
  function pintar(paso, alTerminar) {
    const esc = X.esc, c = X.cli(), t = (X.info() && X.info().name) || 'el local';
    let o = document.getElementById('ctadlg'); if (!o) { o = document.createElement('div'); o.id = 'ctadlg'; document.body.appendChild(o); }
    const promo = '<label class="cta-chk"><input type="checkbox" id="ct_mk"> Quiero recibir promos de ' + esc(t) + ' por email</label>';
    const google = enApp() ? '<div class="cta-nota">Para entrar con Google abrí este menú en Chrome o Safari (tocá ⋯ y "Abrir en el navegador").</div>' :
      '<div class="cta-o"><span>o</span></div><button type="button" class="cta-g" id="ct_g"><svg viewBox="0 0 48 48" width="20" height="20"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuar con Google</button>';
    let h = '<div class="cta-c"><button type="button" class="cta-x" data-ctx="1" aria-label="Cerrar">×</button>';
    if (paso === 'datos') {
      h += '<b class="cta-t">Un último paso</b><div class="cta-s">Así ' + esc(t) + ' sabe de quién es el pedido y te avisa cuando está listo.</div>' +
        '<form id="ct_f" novalidate><input class="edir" id="ct_n" placeholder="Tu nombre" maxlength="60" autocomplete="name" value="' + esc(c.n || (CU && CU.displayName) || '') + '">' +
        '<input class="edir" id="ct_t" type="tel" inputmode="tel" placeholder="Tu WhatsApp (ej: 381 555 1234)" maxlength="24" autocomplete="tel" value="' + esc(c.t || '') + '">' + promo +
        '<div class="cta-er" id="ct_er"></div><button class="cta-b" type="submit">Listo, seguir</button></form>';
    } else if (paso === 'entrar') {
      h += '<b class="cta-t">Entrá a tu cuenta</b><div class="cta-tabs"><button type="button" data-ctp="alta">Crear cuenta</button><button type="button" class="on">Ya tengo cuenta</button></div>' +
        '<form id="ct_f" novalidate><input class="edir" id="ct_e" type="email" inputmode="email" placeholder="Tu email" autocomplete="username email" maxlength="120">' +
        '<input class="edir" id="ct_p" type="password" placeholder="Tu contraseña" autocomplete="current-password" maxlength="80">' +
        '<div class="cta-er" id="ct_er"></div><button class="cta-b" type="submit">Entrar</button></form>' +
        '<button type="button" class="cta-l" id="ct_rp">Me olvidé la contraseña</button>' + google;
    } else {
      h += '<b class="cta-t">Creá tu cuenta</b><div class="cta-tabs"><button type="button" class="on">Crear cuenta</button><button type="button" data-ctp="entrar">Ya tengo cuenta</button></div>' +
        '<form id="ct_f" novalidate><input class="edir" id="ct_n" placeholder="Tu nombre" maxlength="60" autocomplete="name" value="' + esc(c.n || '') + '">' +
        '<input class="edir" id="ct_t" type="tel" inputmode="tel" placeholder="Tu WhatsApp (ej: 381 555 1234)" maxlength="24" autocomplete="tel" value="' + esc(c.t || '') + '">' +
        '<input class="edir" id="ct_e" type="email" inputmode="email" placeholder="Tu email" autocomplete="username email" maxlength="120">' +
        '<input class="edir" id="ct_p" type="password" placeholder="Creá una contraseña (6 o más)" autocomplete="new-password" maxlength="80">' + promo +
        '<div class="cta-er" id="ct_er"></div><button class="cta-b" type="submit">Crear cuenta y seguir</button></form>' + google;
    }
    h += '<div class="cta-priv">Tus datos los ve solo ' + esc(t) + '. Si aceptás las promos, te podés dar de baja cuando quieras desde cualquier mail.</div></div>';
    o.innerHTML = h; o.hidden = false;
    const $ = (i) => o.querySelector('#' + i), er = (m) => { $('ct_er').textContent = m || ''; };
    const cerrar = () => { o.hidden = true; o.innerHTML = ''; };
    const ok = () => { cerrar(); X.onCambio(); if (alTerminar) alTerminar(); };
    o.onclick = (e) => {
      if (e.target === o || (e.target.dataset && e.target.dataset.ctx)) { cerrar(); return; }
      const p = e.target.closest && e.target.closest('[data-ctp]'); if (p) pintar(p.dataset.ctp, alTerminar);
    };
    const datos = () => {
      const n = ($('ct_n') ? $('ct_n').value : '').trim(), tel = ($('ct_t') ? $('ct_t').value : '').replace(/[^\d+ ()-]/g, '').trim();
      if (!n) { er('Escribí tu nombre.'); $('ct_n').focus(); return null; }
      if (tel.replace(/\D/g, '').length < 6) { er('Escribí tu WhatsApp, así el local te puede avisar.'); $('ct_t').focus(); return null; }
      c.n = n; c.t = tel; return { n, tel, mk: !!($('ct_mk') && $('ct_mk').checked) };
    };
    const ocupado = (b, si, tx) => { b.disabled = si; if (tx) b.textContent = tx; };
    $('ct_f').onsubmit = (e) => {
      e.preventDefault(); er(''); const b = $('ct_f').querySelector('button[type=submit]'), tx0 = b.textContent;
      if (paso === 'datos') {
        const d = datos(); if (!d) return; ocupado(b, true, 'Guardando…');
        guardarPerfil(d).then(ok).catch(() => { ocupado(b, false, tx0); er('No se pudo guardar. Probá de nuevo.'); });
        return;
      }
      const em = $('ct_e').value.trim().toLowerCase(), pw = $('ct_p').value;
      if (paso === 'alta') {
        const d = datos(); if (!d) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { er('Escribí bien tu email.'); $('ct_e').focus(); return; }
        if (pw.length < 6) { er('La contraseña tiene que tener al menos 6 letras o números.'); $('ct_p').focus(); return; }
        ocupado(b, true, 'Creando tu cuenta…');
        A.createUserWithEmailAndPassword(au, em, pw).then((r) => { CU = r.user; return guardarPerfil(d); }).then(ok)
          .catch((e) => { ocupado(b, false, tx0); er(msgDe(e)); });
        return;
      }
      if (!em || !pw) { er('Escribí tu email y tu contraseña.'); return; }
      ocupado(b, true, 'Entrando…');
      A.signInWithEmailAndPassword(au, em, pw).then((r) => { CU = r.user; return getDoc(doc(db, 'stores', X.sid(), 'cr', r.user.uid)); })
        .then((s) => { CR = s.exists() ? s.data() : null; if (CR) { if (CR.n) c.n = CR.n; if (CR.tel) c.t = CR.tel; ok(); } else pintar('datos', alTerminar); })
        .catch((e) => { ocupado(b, false, tx0); er(msgDe(e)); });
    };
    if ($('ct_rp')) $('ct_rp').onclick = () => {
      const em = $('ct_e').value.trim(); if (!em) { er('Escribí tu email arriba y tocá de nuevo "Me olvidé la contraseña".'); $('ct_e').focus(); return; }
      A.sendPasswordResetEmail(au, em).then(() => er('Te mandamos un mail para crear una contraseña nueva. Revisá también spam.')).catch((e) => er(msgDe(e)));
    };
    if ($('ct_g')) $('ct_g').onclick = () => {
      er(''); const pv = new A.GoogleAuthProvider(); pv.setCustomParameters({ prompt: 'select_account' });
      A.signInWithPopup(au, pv).then((r) => { CU = r.user; return getDoc(doc(db, 'stores', X.sid(), 'cr', r.user.uid)); })
        .then((s) => {
          CR = s.exists() ? s.data() : null;
          if (CR && CR.tel) { c.n = c.n || CR.n; c.t = c.t || CR.tel; ok(); return; }
          if (!c.n && CU.displayName) c.n = CU.displayName;
          pintar('datos', alTerminar);
        })
        .catch((e) => { if (e && /popup-closed|cancelled-popup/.test(e.code || '')) return; er(msgDe(e)); });
    };
    const f0 = o.querySelector('input:not([value]),input[value=""]'); if (f0 && window.innerWidth > 700) f0.focus();
  }
  return { iniciar, formHtml, falta, abrir, salir, usuario: () => CU, perfil: () => CR, db: () => db, modo };
}

let cssOk = false;
function css() {
  if (cssOk) return; cssOk = true;
  const s = document.createElement('style');
  s.textContent = '#ctadlg{position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}#ctadlg[hidden]{display:none}' +
    '.cta-c{position:relative;background:var(--bg,#fff);color:var(--ink,#16171c);width:100%;max-width:440px;max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:22px 18px calc(20px + env(safe-area-inset-bottom,0px));box-sizing:border-box}' +
    '@media (min-width:600px){#ctadlg{align-items:center}.cta-c{border-radius:24px}}' +
    '.cta-x{position:absolute;top:10px;right:12px;width:36px;height:36px;border:0;border-radius:50%;background:var(--soft,#f1f1ef);color:inherit;font-size:22px;line-height:1;cursor:pointer}' +
    '.cta-t{display:block;font-size:21px;font-weight:900;padding-right:40px}.cta-s{color:var(--mut,#73757c);font-size:14.5px;margin:4px 0 8px}' +
    '.cta-tabs{display:flex;gap:4px;background:var(--soft,#f1f1ef);border-radius:14px;padding:4px;margin:12px 0 4px}.cta-tabs button{flex:1;border:0;border-radius:11px;padding:10px 4px;background:transparent;color:inherit;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer}.cta-tabs button.on{background:var(--bg,#fff);box-shadow:0 1px 3px rgba(0,0,0,.15);font-weight:900}' +
    '.cta-b{display:block;width:100%;margin-top:12px;border:0;border-radius:14px;padding:15px;background:var(--b,#111);color:var(--bi,#fff);font:inherit;font-size:16px;font-weight:800;cursor:pointer}.cta-b:disabled{opacity:.6}' +
    '.cta-g{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:1.5px solid var(--line,#e5e5e5);border-radius:14px;padding:13px;background:#fff;color:#1f1f1f;font:inherit;font-size:15.5px;font-weight:700;cursor:pointer}' +
    '.cta-o{display:flex;align-items:center;gap:10px;margin:14px 0;color:var(--mut,#73757c);font-size:13px}.cta-o:before,.cta-o:after{content:"";flex:1;height:1px;background:var(--line,#e5e5e5)}' +
    '.cta-l{display:block;margin:12px auto 0;border:0;background:none;color:var(--mut,#73757c);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}' +
    '.cta-chk{display:flex;align-items:flex-start;gap:10px;margin:12px 2px 0;font-size:14.5px;line-height:1.35}.cta-chk input{width:20px;height:20px;margin:0;flex:none;accent-color:var(--b,#111)}' +
    '.cta-er{color:#B42318;font-size:14px;font-weight:600;margin-top:8px;min-height:1px}.cta-er:empty{margin:0}' +
    '.cta-priv,.cta-nota{color:var(--mut,#73757c);font-size:12.5px;margin-top:14px;line-height:1.4}.cta-nota{background:var(--soft,#f1f1ef);border-radius:12px;padding:10px 12px}' +
    '.cta-inv{background:var(--soft,#f1f1ef);border-radius:16px;padding:14px;margin:12px 0 4px}.cta-inv b{display:block;font-size:15.5px}.cta-inv span{display:block;color:var(--mut,#73757c);font-size:13.5px;margin-top:3px}.cta-inv .cta-b{margin-top:10px;padding:12px}' +
    '.cta-ok{font-size:13.5px;color:var(--mut,#73757c);margin:10px 0 2px}.cta-ok b{color:var(--ink,#16171c)}.cta-ok button{border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0 0 0 6px}';
  document.head.appendChild(s);
}
