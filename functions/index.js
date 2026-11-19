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
async function countUse(uid, field, limit) {
  const ref = db().collection('usage').doc(`${uid}_${new Date().toISOString().slice(0, 10)}`);
  await db().runTransaction(async (tx) => {
    const n = ((await tx.get(ref)).data() || {})[field] || 0;
    if (n >= limit) throw new HttpsError('resource-exhausted', 'Daily AI limit reached. It resets tomorrow.');
    tx.set(ref, { [field]: n + 1, at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

// Only people the admin approved, and only for vectors they have access to. Returns the vector.
async function guard(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = req.auth.uid, d = req.data || {};
  const [user, meta, vec] = await Promise.all([db().collection('users').doc(uid).get(), db().collection('meta').doc('app').get(), db().collection('vectors').doc(String(d.vid || '-')).get()]);
  if (!user.exists || !['admin', 'user'].includes(user.data().role)) throw new HttpsError('permission-denied', 'Your access is not approved yet.');
  if (!vec.exists) throw new HttpsError('not-found', 'The vector is not saved yet. Try again in a few seconds.');
  const v = vec.data(), superAdmin = meta.exists && meta.data().adminUid === uid;
  if (!superAdmin && !(v.acl || []).includes(uid)) throw new HttpsError('permission-denied', 'You have no access to this vector.');
  return { uid, d, v };
}

// ai({ op, engine, vid, step, ui, letter, first, card }) -> a letter, or a review with a corrected letter.
exports.ai = onCall({ secrets: [ANTHROPIC_API_KEY, OPENAI_API_KEY], timeoutSeconds: 120, memory: '256MiB' }, async (req) => {
  const { uid, d, v } = await guard(req);
  if (!['draft', 'polish', 'review', 'revise'].includes(d.op) || !['claude', 'gpt'].includes(d.engine)) throw new HttpsError('invalid-argument', 'Unknown request.');

  await countUse(uid, 'n', lib.LIMITS.perUserPerDay);
  const [company, direction, audience, topic, shared] = await Promise.all([param(v.company), param(v.direction), param(v.audience), param(v.topic), db().collection('workspace').doc('shared').get()]);
  // Library materials of this company (and the ones not tied to any company), most important first.
  const docs = ((shared.exists && shared.data().docs) || []).filter((x) => !x.company || x.company === v.company).sort((a, b) => (a.priority || 9) - (b.priority || 9));
  const letter = d.letter || {}, first = d.first || {}, card = d.card || {};
  const ctx = { op: d.op, engine: d.engine, comment: d.comment, step: Math.max(0, Math.min(4, +d.step || 0)), ui: d.ui === 'uk' ? 'uk' : 'en', company, direction, audience, topic, docs, letter, first,
    card: { title: card.title, notes: card.notes, type: card.type, jobTitle: card.jobTitle, company: card.company, who: card.who, checkQ: card.checkQ } };
  if (d.op !== 'draft' && !String(letter.body || '').trim()) throw new HttpsError('invalid-argument', 'The letter is empty.');
  if (d.op === 'revise' && !String(d.comment || '').trim()) throw new HttpsError('invalid-argument', 'Write a comment first.');
  if (d.op === 'draft' && ctx.step > 0 && !String(first.body || '').trim()) throw new HttpsError('failed-precondition', 'Write the first letter of this variant before its reminders.');

  try {
    return await lib.run(fetch, { claude: ANTHROPIC_API_KEY.value(), gpt: OPENAI_API_KEY.value() }, ctx);
  } catch (e) {
    console.error('ai failed', d.op, d.engine, e.message);
    throw new HttpsError('internal', e.message.slice(0, 300));
  }
});

const vectorCtx = async (v) => { const [company, direction, audience, topic] = await Promise.all([param(v.company), param(v.direction), param(v.audience), param(v.topic)]); return { company, direction, audience, topic }; };

// criterion({ vid }) or criterion({ topic }) -> { criterion, tag, terms }: what must be true of a company, taken from the topic brief.
exports.criterion = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' }, async (req) => {
  let uid, ctx;
  if (req.data && req.data.topic) {
    // Called from the topic settings: there may be no vector yet, so access is checked on the topic itself.
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
    uid = req.auth.uid;
    const [user, meta, tp] = await Promise.all([db().collection('users').doc(uid).get(), db().collection('meta').doc('app').get(), db().collection('params').doc(String(req.data.topic)).get()]);
    if (!user.exists || !['admin', 'user'].includes(user.data().role)) throw new HttpsError('permission-denied', 'Your access is not approved yet.');
    if (!tp.exists || tp.data().zone !== 'topic') throw new HttpsError('not-found', 'The topic is not saved yet. Try again in a few seconds.');
    const acl = tp.data().acl || [], superAdmin = meta.exists && meta.data().adminUid === uid;
    if (!superAdmin && !acl.includes(uid) && !acl.includes('*')) throw new HttpsError('permission-denied', 'You have no access to this topic.');
    ctx = { topic: tp.data(), card: {} };
  } else {
    const g = await guard(req); uid = g.uid; ctx = Object.assign(await vectorCtx(g.v), { card: {} });
  }
  await countUse(uid, 'n', lib.LIMITS.perUserPerDay);
  try { return await lib.criterion(fetch, ANTHROPIC_API_KEY.value(), ctx); }
  catch (e) { console.error('criterion failed', e.message); throw new HttpsError('internal', e.message.slice(0, 300)); }
});

// research({ vid, website, company, criterion, terms }) -> { s: yes | no | unsure, ev, proj, url, by }.
exports.research = onCall({ secrets: [ANTHROPIC_API_KEY, OPENAI_API_KEY], timeoutSeconds: 240, memory: '256MiB' }, async (req) => {
  const { uid, d } = await guard(req);
  await countUse(uid, 'r', lib.LIMITS.researchPerUserPerDay);
  try {
    return await lib.research(fetch, { claude: ANTHROPIC_API_KEY.value(), gpt: OPENAI_API_KEY.value() }, { website: d.website, company: d.company, criterion: d.criterion, terms: d.terms });
  } catch (e) {
    console.error('research failed', d.website, e.message);
    return { s: 'unsure', ev: ('The check failed: ' + e.message).slice(0, 240), proj: '', url: '', by: '' };
  }
});

// find({ vid, request, n, skip }) -> { companies: [{ company, website, country, why, emails }] }.
exports.find = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: '256MiB' }, async (req) => {
  const { uid, d, v } = await guard(req);
  if (!String(d.request || '').trim()) throw new HttpsError('invalid-argument', 'Describe which companies to look for.');
  await countUse(uid, 'f', 20);
  try { return await lib.find(fetch, { claude: ANTHROPIC_API_KEY.value() }, Object.assign(await vectorCtx(v), { card: {}, request: d.request, n: d.n, skip: Array.isArray(d.skip) ? d.skip.slice(0, 200) : [] })); }
  catch (e) { console.error('find failed', e.message); throw new HttpsError('internal', e.message.slice(0, 300)); }
});

// mailTest({ company, email }) -> sends one test letter from that mailbox to the caller's own sign-in address.
// It proves that the mail connection works for a mailbox; it cannot be used to write to anyone else.
exports.mailTest = onCall({ timeoutSeconds: 60, memory: '256MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = req.auth.uid, to = req.auth.token.email, d = req.data || {};
  if (!to) throw new HttpsError('failed-precondition', 'Your sign-in has no email address.');
  const [user, meta, co] = await Promise.all([db().collection('users').doc(uid).get(), db().collection('meta').doc('app').get(), db().collection('params').doc(String(d.company || '-')).get()]);
  if (!user.exists || !['admin', 'user'].includes(user.data().role)) throw new HttpsError('permission-denied', 'Your access is not approved yet.');
  const box = co.exists ? ((co.data().s || {}).mailboxes || []).find((m) => m.email === d.email) : null;
  if (!box) throw new HttpsError('not-found', 'This mailbox is not in the company settings (save the settings and try again).');
  const superAdmin = meta.exists && meta.data().adminUid === uid;
  if (!superAdmin && box.owner !== uid) throw new HttpsError('permission-denied', 'You can test only your own mailboxes.');
  await countUse(uid, 'm', 30);
  const sig = box.sig || '';
  try {
    const r = await lib.sendMail(fetch, { from: box.email, to, sigHtml: box.sigHtml || '', subject: 'VECTOR: test letter from ' + box.email,
      sig, body: 'This is a test letter from VECTOR.\n\nIf you are reading it, the program can send mail from ' + box.email + '.\nЦе тестовий лист із VECTOR: надсилання з цієї скриньки працює.' });
    return { ok: true, to, id: r.id };
  } catch (e) {
    console.error('mailTest failed', box.email, e.message);
    throw new HttpsError('internal', e.message.slice(0, 400));
  }
});
