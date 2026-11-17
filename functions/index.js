// Server part of VECTOR. Runs in Cloud Functions for Firebase; the API keys live in Secret Manager
// and never reach the browser or the repository.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const lib = require('./lib');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

const db = () => admin.firestore();
const param = async (id) => { if (!id) return {}; const s = await db().collection('params').doc(String(id)).get(); return s.exists ? s.data() : {}; };

// A daily cap per person, so that a mistake or a stuck button cannot spend the balance.
async function countUse(uid) {
  const ref = db().collection('usage').doc(`${uid}_${new Date().toISOString().slice(0, 10)}`);
  await db().runTransaction(async (tx) => {
    const n = ((await tx.get(ref)).data() || {}).n || 0;
    if (n >= lib.LIMITS.perUserPerDay) throw new HttpsError('resource-exhausted', 'Daily AI limit reached. It resets tomorrow.');
    tx.set(ref, { n: n + 1, at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

// ai({ op, engine, vid, step, ui, letter, first, card }) -> a letter, or a review with a corrected letter.
exports.ai = onCall({ secrets: [ANTHROPIC_API_KEY, OPENAI_API_KEY], timeoutSeconds: 120, memory: '256MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = req.auth.uid, d = req.data || {};
  if (!['draft', 'polish', 'review'].includes(d.op) || !['claude', 'gpt'].includes(d.engine)) throw new HttpsError('invalid-argument', 'Unknown request.');

  // Only people the admin approved, and only for vectors they have access to.
  const [user, meta, vec] = await Promise.all([db().collection('users').doc(uid).get(), db().collection('meta').doc('app').get(), db().collection('vectors').doc(String(d.vid || '')).get()]);
  if (!user.exists || !['admin', 'user'].includes(user.data().role)) throw new HttpsError('permission-denied', 'Your access is not approved yet.');
  if (!vec.exists) throw new HttpsError('not-found', 'The vector is not saved yet. Try again in a few seconds.');
  const v = vec.data(), superAdmin = meta.exists && meta.data().adminUid === uid;
  if (!superAdmin && !(v.acl || []).includes(uid)) throw new HttpsError('permission-denied', 'You have no access to this vector.');

  await countUse(uid);
  const [company, direction, audience, topic] = await Promise.all([param(v.company), param(v.direction), param(v.audience), param(v.topic)]);
  const letter = d.letter || {}, first = d.first || {}, card = d.card || {};
  const ctx = { op: d.op, engine: d.engine, step: Math.max(0, Math.min(4, +d.step || 0)), ui: d.ui === 'uk' ? 'uk' : 'en', company, direction, audience, topic, letter, first,
    card: { title: card.title, notes: card.notes, type: card.type, jobTitle: card.jobTitle, company: card.company, who: card.who } };
  if (d.op !== 'draft' && !String(letter.body || '').trim()) throw new HttpsError('invalid-argument', 'The letter is empty.');
  if (d.op === 'draft' && ctx.step > 0 && !String(first.body || '').trim()) throw new HttpsError('failed-precondition', 'Write the first letter of this variant before its reminders.');

  try {
    return await lib.run(fetch, { claude: ANTHROPIC_API_KEY.value(), gpt: OPENAI_API_KEY.value() }, ctx);
  } catch (e) {
    console.error('ai failed', d.op, d.engine, e.message);
    throw new HttpsError('internal', e.message.slice(0, 300));
  }
});
