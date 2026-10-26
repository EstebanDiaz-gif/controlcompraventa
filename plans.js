// Configuración comercial por defecto. Se puede cambiar desde el panel de plataforma
// (se guarda en Firestore: platform/config) sin tocar el código.
export const DEFAULT_CONFIG = {
  currency: 'ARS',
  trialDays: 10,
  graceDays: 3, // días de cortesía después de que vence el acceso
  trialPlan: 'inicial', // plan cuyos límites rigen durante la prueba (decisión pendiente de confirmar)
  plans: {
    inicial: {
      name: 'Inicial', payUrl: 'https://mpago.la/11tidko', priceARS: 14999, priceUSD: 20, admins: 2, empleados: 4, sucursales: 1,
      features: ['productos', 'compras_ventas', 'stock', 'mayor_menor', 'movimientos', 'historial', 'informes_basicos', 'gastos']
    },
    profesional: {
      name: 'Profesional', payUrl: 'https://mpago.la/19EF6QE', priceARS: 24999, priceUSD: 50, admins: 4, empleados: 10, sucursales: 3,
      features: ['productos', 'compras_ventas', 'stock', 'mayor_menor', 'movimientos', 'historial', 'informes_basicos', 'gastos',
        'transferencias', 'informes_avanzados', 'filtros', 'analisis_gastos', 'pdf']
    },
    empresarial: {
      name: 'Empresarial', payUrl: 'https://mpago.la/1Dncr9a', priceARS: 55999, priceUSD: 80, admins: 10, empleados: 30, sucursales: 10,
      features: ['productos', 'compras_ventas', 'stock', 'mayor_menor', 'movimientos', 'historial', 'informes_basicos', 'gastos',
        'transferencias', 'informes_avanzados', 'filtros', 'analisis_gastos', 'pdf',
        'informes_consolidados', 'comparar_sucursales', 'finanzas_centralizadas', 'permisos_detallados', 'soporte_prioritario_preparado']
    }
  }
};
export const PLAN_IDS = ['inicial', 'profesional', 'empresarial'];

// Topes técnicos (protección frente a abuso accidental; no son límites comerciales)
export const TECH = { maxStoresPerCustomer: 10, maxStoresPerOwner: 5000, maxActiveInvites: 500, nameMax: 60, reasonMax: 300 };

export function mergeConfig(stored) {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (!stored || typeof stored !== 'object') return c;
  if (Number.isInteger(stored.trialDays) && stored.trialDays >= 0) c.trialDays = stored.trialDays;
  if (PLAN_IDS.includes(stored.trialPlan)) c.trialPlan = stored.trialPlan;
  if (Number.isInteger(stored.graceDays) && stored.graceDays >= 0 && stored.graceDays <= 30) c.graceDays = stored.graceDays;
  for (const id of PLAN_IDS) {
    const s = stored.plans && stored.plans[id];
    if (!s) continue;
    for (const k of ['priceARS', 'priceUSD', 'admins', 'empleados', 'sucursales']) if (Number.isInteger(s[k]) && s[k] >= 0) c.plans[id][k] = s[k];
    if (Array.isArray(s.features)) c.plans[id].features = s.features.filter(f => typeof f === 'string').slice(0, 60);
  }
  return c;
}

export function validateConfigInput(input) {
  if (!input || typeof input !== 'object') throw new Error('Configuración inválida.');
  const out = { trialDays: input.trialDays, trialPlan: input.trialPlan, plans: {} };
  if (input.graceDays !== undefined) { if (!Number.isInteger(input.graceDays) || input.graceDays < 0 || input.graceDays > 30) throw new Error('Los días de gracia deben ser un número entero entre 0 y 30.'); out.graceDays = input.graceDays; }
  if (!Number.isInteger(out.trialDays) || out.trialDays < 0 || out.trialDays > 365) throw new Error('Los días de prueba deben ser un número entero entre 0 y 365.');
  if (!PLAN_IDS.includes(out.trialPlan)) throw new Error('El plan de la prueba no es válido.');
  for (const id of PLAN_IDS) {
    const p = input.plans && input.plans[id];
    if (!p) throw new Error('Falta el plan ' + id + '.');
    const o = {};
    for (const k of ['priceARS', 'admins', 'empleados', 'sucursales']) {
      if (!Number.isInteger(p[k]) || p[k] < 0 || p[k] > 100000000) throw new Error('Valor inválido en ' + id + ' / ' + k + '.');
      o[k] = p[k];
    }
    if (p.priceUSD !== undefined) { if (!Number.isInteger(p.priceUSD) || p.priceUSD < 0 || p.priceUSD > 1000000) throw new Error('Valor inválido en ' + id + ' / priceUSD.'); o.priceUSD = p.priceUSD; }
    out.plans[id] = o;
  }
  return out;
}
