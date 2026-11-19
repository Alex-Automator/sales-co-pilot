// Server part of VECTOR. Runs in Cloud Functions for Firebase; the API keys live in Secret Manager
// and never reach the browser or the repository.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
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

// criterion({ vid }) -> { criterion, tag, terms }: what must be true of a company, taken from the topic brief.
exports.criterion = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60, memory: '256MiB' }, async (req) => {
  const { uid, v } = await guard(req);
  await countUse(uid, 'n', lib.LIMITS.perUserPerDay);
  try { return await lib.criterion(fetch, ANTHROPIC_API_KEY.value(), Object.assign(await vectorCtx(v), { card: {} })); }
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
  const sig = [box.sig, box.footOn && box.foot].filter(Boolean).join('\n\n');
  try {
    const r = await lib.sendMail(fetch, { from: box.email, to, subject: 'VECTOR: test letter from ' + box.email,
      body: 'This is a test letter from VECTOR.\n\nIf you are reading it, the program can send mail from ' + box.email + '.\nЦе тестовий лист із VECTOR: надсилання з цієї скриньки працює.' + (sig ? '\n\n' + sig : '') });
    return { ok: true, to, id: r.id };
  } catch (e) {
    console.error('mailTest failed', box.email, e.message);
    throw new HttpsError('internal', e.message.slice(0, 400));
  }
});

// ---------- Campaign run ----------
const TEST_MAX = 5, WATCH_EVERY = 5 * 60000;

// The caller must be approved and must have the campaign card.
async function cardGuard(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const uid = req.auth.uid, d = req.data || {};
  const [user, meta, card] = await Promise.all([db().collection('users').doc(uid).get(), db().collection('meta').doc('app').get(), db().collection('cards').doc(String(d.cardId || '-')).get()]);
  if (!user.exists || !['admin', 'user'].includes(user.data().role)) throw new HttpsError('permission-denied', 'Your access is not approved yet.');
  if (!card.exists) throw new HttpsError('not-found', 'The card is not saved yet. Try again in a few seconds.');
  const superAdmin = meta.exists && meta.data().adminUid === uid;
  if (!superAdmin && !(card.data().acl || []).includes(uid)) throw new HttpsError('permission-denied', 'You have no access to this card.');
  return { uid, d, card: card.data(), superAdmin, user: user.data() };
}
const sendsOf = (cardId) => db().collection('sends').where('cid', '==', cardId).get();

// campaignStart({ cardId, gap }) -> { total }. For now only a test run: at most five recipients, letters a few minutes apart.
exports.campaignStart = onCall({ timeoutSeconds: 60, memory: '256MiB' }, async (req) => {
  const { uid, d, card, superAdmin, user } = await cardGuard(req);
  if (card.type !== 'campaign') throw new HttpsError('failed-precondition', 'This is not a campaign card.');
  const [old, vec, leadSnap] = await Promise.all([sendsOf(d.cardId), db().collection('vectors').doc(String(card.vid)).get(), db().collection('leads').where('cid', '==', d.cardId).get()]);
  if (old.docs.some((x) => x.data().status === 'active')) throw new HttpsError('failed-precondition', 'This campaign is already running. Stop it first.');
  if (!vec.exists) throw new HttpsError('not-found', 'The vector of this card was not found.');
  const v = vec.data(), co = await param(v.company), boxes = (co.s || {}).mailboxes || [];
  const mine = boxes.filter((m) => superAdmin || m.owner === uid), want = (card.seq || {}).from;
  const box = mine.find((m) => m.email === want) || mine.find((m) => m.primary) || mine[0];
  if (!box) throw new HttpsError('failed-precondition', 'Add your mailbox in the company settings first.');
  const leads = leadSnap.docs.map((x) => x.data()), optOn = card.optOut == null ? !!(v.opt && v.opt.on) : !!card.optOut;
  const gapMin = Math.max(2, Math.min(120, Math.round(+d.gap) || 10)), now = Date.now();
  let plan;
  try { plan = lib.planRun({ card, leads, from: box.email, sig: box.sig || '', foot: optOn ? (v.opt && v.opt.text) || '' : '', myName: user.name || '', start: now, gapMs: gapMin * 60000 }); }
  catch (e) { throw new HttpsError('failed-precondition', e.message); }
  if (!plan.length) throw new HttpsError('failed-precondition', 'There is no recipient with an address.');
  if (plan.length > TEST_MAX) throw new HttpsError('failed-precondition', `A test run takes at most ${TEST_MAX} recipients; this card has ${plan.length}. Leave the others out or make a separate test card.`);
  await countUse(uid, 'm', 30);
  const batch = db().batch();
  old.docs.forEach((x) => batch.delete(x.ref));
  plan.forEach((p) => batch.set(db().collection('sends').doc(`${d.cardId}_${p.lead}`), Object.assign(p, { cid: d.cardId, vid: card.vid, cardTitle: card.title || '', cardVec: card.vec || {}, acl: card.acl || [], owner: uid,
    status: 'active', i: 0, due: now, test: true, startedAt: now, watchUntil: now + p.steps.length * gapMin * 60000 + 3 * 3600000, errs: 0 })));
  await batch.commit();
  return { total: plan.length, from: box.email, gap: gapMin };
});

// campaignStatus({ cardId }) -> { rows } for the progress table.
exports.campaignStatus = onCall({ timeoutSeconds: 30, memory: '256MiB' }, async (req) => {
  const { d } = await cardGuard(req);
  const snap = await sendsOf(d.cardId);
  return { now: Date.now(), rows: snap.docs.map((x) => x.data()).map((x) => ({ to: x.to, name: x.name, variant: x.variant, sent: x.i, of: x.steps.length, status: x.status, next: x.status === 'active' && x.i < x.steps.length ? x.due : 0, err: x.err || '', from: x.from })) };
});

// campaignStop({ cardId }) -> { stopped }.
exports.campaignStop = onCall({ timeoutSeconds: 30, memory: '256MiB' }, async (req) => {
  const { d } = await cardGuard(req);
  const snap = await sendsOf(d.cardId), batch = db().batch(); let n = 0;
  snap.docs.forEach((x) => { if (x.data().status === 'active') { batch.update(x.ref, { status: 'stopped', due: lib.FAR, endedAt: Date.now() }); n++; } });
  await batch.commit();
  return { stopped: n };
});

// A reply turns the recipient into a contact card on the board, in the Replied column, linked to its campaign.
async function replyCard(d, ref) {
  const id = 'k' + ref.id.replace(/[^a-zA-Z0-9]/g, '').slice(-14) + Date.now().toString(36);
  await db().collection('cards').doc(id).set({ id, vid: d.vid, owner: d.owner, acl: d.acl || [], ord: Date.now(), type: 'contact', stage: 'replied', title: d.name || d.company || d.to, vec: d.cardVec || {}, parent: d.cid,
    f: { jobTitle: d.jobTitle || '', company: d.company || '', email: d.to, phone: '', linkedin: '' }, next: { text: 'Answer the reply', date: new Date().toISOString().slice(0, 10) }, awaiting: true,
    auto: { follow: false, reply: false, notify: true, draft: true }, notes: `Replied to the campaign "${d.cardTitle}" (variant ${d.variant}, after letter ${d.i}).`, photo: '', blocked: '', okEmail: d.to, tags: d.tags || [] });
  await db().collection('leads').doc(d.lead).set({ card: id, replied: true }, { merge: true }).catch(() => {});
}

// Every two minutes: send what is due, look for replies, stop chains that got one.
exports.tick = onSchedule({ schedule: 'every 2 minutes', timeoutSeconds: 110, memory: '256MiB' }, async () => {
  const now = Date.now(), snap = await db().collection('sends').where('due', '<=', now).orderBy('due').limit(25).get(), tokens = {};
  for (const doc of snap.docs) {
    const d = doc.data();
    try {
      const out = await lib.advance(fetch, tokens, d, Date.now(), WATCH_EVERY);
      await doc.ref.update(out);
      if (out.status === 'replied') await replyCard(d, doc.ref);
    } catch (e) {
      console.error('send failed', doc.id, e.message);
      const errs = (d.errs || 0) + 1;
      await doc.ref.update(errs >= 3 ? { status: 'error', due: lib.FAR, errs, err: e.message.slice(0, 300) } : { due: Date.now() + 3 * 60000, errs, err: e.message.slice(0, 300) });
    }
  }
});
