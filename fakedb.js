// Base de datos en memoria que imita lo mínimo de Firestore Admin para probar la lógica.
export function makeEnv({ owners = [] } = {}) {
  const data = new Map();
  let lock = Promise.resolve();
  const clock = { t: Date.UTC(2026, 9, 13, 12, 0, 0) };
  let n = 0;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const write = (path, d, o) => data.set(path, o && o.merge ? { ...(data.get(path) || {}), ...clone(d) } : clone(d));
  const update = (path, d) => { if (!data.has(path)) throw new Error('update de un documento inexistente: ' + path); data.set(path, { ...data.get(path), ...clone(d) }); };
  const snap = (path) => { const v = data.get(path); return { id: path.split('/').pop(), exists: v !== undefined, data: () => (v === undefined ? undefined : clone(v)) }; };
  const qs = (path, filters, lim) => {
    const pre = path + '/';
    let docs = [...data.keys()].filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(snap).filter((s) => filters.every(([f, v]) => s.data()[f] === v));
    if (lim) docs = docs.slice(0, lim);
    return { docs, size: docs.length, forEach: (fn) => docs.forEach(fn) };
  };
  const docRef = (path) => ({ path, id: path.split('/').pop(), get: async () => snap(path), set: async (d, o) => write(path, d, o), update: async (d) => update(path, d), delete: async () => { data.delete(path); } });
  const collRef = (path, filters = [], lim = null) => ({ path, get: async () => qs(path, filters, lim), where: (f, _op, v) => collRef(path, [...filters, [f, v]], lim), limit: (k) => collRef(path, filters, k), doc: (id) => docRef(path + '/' + id) });
  const db = {
    doc: docRef, collection: collRef,
    runTransaction(fn) {
      const run = async () => {
        const writes = [];
        const tx = { get: async (r) => r.get(), set: (r, d, o) => writes.push(() => write(r.path, d, o)), update: (r, d) => writes.push(() => update(r.path, d)), delete: (r) => writes.push(() => data.delete(r.path)) };
        const res = await fn(tx);
        writes.forEach((w) => w());
        return res;
      };
      const p = lock.then(run); lock = p.catch(() => {}); return p;
    }
  };
  const deps = {
    db, now: () => clock.t, ts: (ms) => ({ _ts: ms }),
    genId: (len) => { n++; return n.toString(36).padStart(len, 'a').slice(-len); },
    isPlatformOwner: async (uid) => owners.includes(uid)
  };
  return { db, deps, clock, data, day: (k) => { clock.t += k * 86400000; } };
}
