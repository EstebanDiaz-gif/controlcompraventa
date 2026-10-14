// Funciones de la nube (Firebase Cloud Functions v2). Región: São Paulo.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { randomInt } from 'node:crypto';
import * as H from './lib/handlers.js';

initializeApp();
const db = getFirestore();
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const deps = {
  db,
  now: () => Date.now(),
  ts: (ms) => Timestamp.fromMillis(ms),
  genId: (n) => Array.from({ length: n }, () => ALPHA[randomInt(ALPHA.length)]).join(''),
  // Se consulta en el servidor; el documento solo se puede crear a mano desde la consola de Firebase.
  isPlatformOwner: async (uid) => !!uid && (await db.doc(`platform_owners/${uid}`).get()).exists
};

const OPTS = { region: 'southamerica-east1', maxInstances: 10 };
const wrap = (fn) => onCall(OPTS, async (req) => {
  try {
    const a = req.auth;
    // uid y email salen SIEMPRE del token verificado; lo que mande el cliente no puede pisarlos.
    return await fn({ ...(req.data || {}), uid: a && a.uid, email: a && a.token && a.token.email });
  } catch (e) {
    if (e instanceof H.AppError) throw new HttpsError(e.code, e.message);
    console.error(e);
    throw new HttpsError('internal', 'Ocurrió un error. Probá de nuevo.');
  }
});

export const createStore = wrap((p) => H.createStore(deps, p));
export const createInvite = wrap((p) => H.createInvite(deps, p));
export const joinStore = wrap((p) => H.joinStore(deps, p));
export const ownerGrantBenefit = wrap((p) => H.ownerGrantBenefit(deps, p));
export const ownerRevokeBenefit = wrap((p) => H.ownerRevokeBenefit(deps, p));
export const ownerListStores = wrap((p) => H.ownerListStores(deps, p));
export const ownerStoreDetail = wrap((p) => H.ownerStoreDetail(deps, p));
export const ownerSetPlanConfig = wrap((p) => H.ownerSetPlanConfig(deps, p));
export const ownerMigrateLegacy = wrap((p) => H.ownerMigrateLegacy(deps, p));
