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
    return await lib.run(fetch, { claude: ANTHROPIC_API_KEY.value().trim(), gpt: OPENAI_API_KEY.value().trim() }, ctx);
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
  try { return await lib.criterion(fetch, ANTHROPIC_API_KEY.value().trim(), ctx); }
  catch (e) { console.error('criterion failed', e.message); throw new HttpsError('internal', e.message.slice(0, 300)); }
});

// research({ vid, website, company, criterion, terms }) -> { s: yes | no | unsure, ev, proj, url, by }.
exports.research = onCall({ secrets: [ANTHROPIC_API_KEY, OPENAI_API_KEY], timeoutSeconds: 240, memory: '256MiB' }, async (req) => {
  const { uid, d } = await guard(req);
  await countUse(uid, 'r', lib.LIMITS.researchPerUserPerDay);
  try {
    return await lib.research(fetch, { claude: ANTHROPIC_API_KEY.value().trim(), gpt: OPENAI_API_KEY.value().trim() }, { website: d.website, company: d.company, criterion: d.criterion, terms: d.terms });
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
  try { return await lib.find(fetch, { claude: ANTHROPIC_API_KEY.value().trim() }, Object.assign(await vectorCtx(v), { card: {}, request: d.request, n: d.n, skip: Array.isArray(d.skip) ? d.skip.slice(0, 200) : [] })); }
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
    const r = await lib.sendMail(fetch, { from: box.email, fromName: box.name || (user.data() || {}).name || '', to, sigHtml: box.sigHtml || '', subject: 'VECTOR: test letter from ' + box.email,
      sig, body: 'This is a test letter from VECTOR.\n\nIf you are reading it, the program can send mail from ' + box.email + '.\nЦе тестовий лист із VECTOR: надсилання з цієї скриньки працює.' });
    return { ok: true, to, id: r.id };
  } catch (e) {
    console.error('mailTest failed', box.email, e.message);
    throw new HttpsError('internal', e.message.slice(0, 400));
  }
});

// ---------- Campaign run ----------
// runs/{cardId}: one record per running campaign (mailbox, signature, pace, the queue of first letters).
// sends/{cardId_leadId}: one record per recipient (ready letters, how many went out, the thread, the state).
// mailstate/{mailbox}: when the mailbox last sent and how many new letters it sent today.
// None of these collections can be read or written from the browser.

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
const rulesNow = async () => { const s = await db().collection('workspace').doc('shared').get(); return Object.assign({ start: 3, step: 2, cap: 10, gapMin: 10, gapMax: 20, from: 9, to: 17, workdays: true, jitter: true, coldSecondary: true }, (s.exists && s.data().send) || {}); };
const inChunks = async (items, n, fn) => { for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(fn)); };

// campaignStart({ cardId, tz }) -> { queued, already, from }.
// Starting again adds only people who have not been written to yet: nobody gets the first letter twice.
exports.campaignStart = onCall({ timeoutSeconds: 120, memory: '512MiB' }, async (req) => {
  const { uid, d, card, superAdmin, user } = await cardGuard(req);
  if (card.type !== 'campaign') throw new HttpsError('failed-precondition', 'This is not a campaign card.');
  const [old, vec, leadSnap, rules] = await Promise.all([sendsOf(d.cardId), db().collection('vectors').doc(String(card.vid)).get(), db().collection('leads').where('cid', '==', d.cardId).get(), rulesNow()]);
  if (!vec.exists) throw new HttpsError('not-found', 'The vector of this card was not found.');
  const v = vec.data(), co = await param(v.company), boxes = (co.s || {}).mailboxes || [];
  const mine = boxes.filter((m) => superAdmin || m.owner === uid), want = (card.seq || {}).from;
  const box = mine.find((m) => m.email === want) || mine.find((m) => m.primary) || mine[0];
  if (!box) throw new HttpsError('failed-precondition', 'Add your mailbox in the company settings first.');
  if (rules.coldSecondary && box.primary) throw new HttpsError('failed-precondition', `RULE_PRIMARY ${box.email}`);
  const unitMs = lib.UNIT[(card.seq || {}).unit] || lib.UNIT.d;
  let plan;
  try { plan = lib.planRun({ card, leads: leadSnap.docs.map((x) => x.data()), myName: user.name || '', unitMs }); } catch (e) { throw new HttpsError('failed-precondition', e.message); }
  const have = {}; old.docs.forEach((x) => { if (x.data().status !== 'queued') have[x.id] = 1; });
  const fresh = plan.filter((p) => !have[`${d.cardId}_${p.lead}`]);
  if (!fresh.length) throw new HttpsError('failed-precondition', plan.length ? 'Everyone on the list has already been written to.' : 'There is no recipient with an address.');
  // Before anything is queued: can the server really send from this mailbox?
  try { await lib.mailToken(fetch, box.email, 'https://www.googleapis.com/auth/gmail.send'); }
  catch (e) { throw new HttpsError('failed-precondition', 'MAIL_ACCESS ' + e.message.slice(0, 300)); }
  await countUse(uid, 'm', 30);
  const optOn = card.optOut == null ? !!(v.opt && v.opt.on) : !!card.optOut, now = Date.now(), ids = fresh.map((p) => `${d.cardId}_${p.lead}`);
  for (let i = 0; i < fresh.length; i += 400) {
    const batch = db().batch();
    fresh.slice(i, i + 400).forEach((p) => batch.set(db().collection('sends').doc(`${d.cardId}_${p.lead}`), Object.assign(p, { cid: d.cardId, status: 'queued', i: 0, due: lib.FAR, errs: 0, queuedAt: now })));
    await batch.commit();
  }
  const runRef = db().collection('runs').doc(d.cardId), prev = await runRef.get();
  const queue = (prev.exists && prev.data().status === 'active' ? (prev.data().queue || []).filter((x) => !ids.includes(x)) : []).concat(ids);
  await runRef.set({ cid: d.cardId, vid: card.vid, owner: uid, acl: card.acl || [], cardTitle: card.title || '', cardVec: card.vec || {}, from: box.email, fromName: box.name || user.name || '', sig: box.sig || '', sigHtml: box.sigHtml || '',
    foot: optOn ? (v.opt && v.opt.text) || '' : '', tz: String(d.tz || 'UTC').slice(0, 60), unitMs, status: 'active', startedAt: prev.exists ? prev.data().startedAt || now : now, updatedAt: now, queue });
  return { queued: fresh.length, already: plan.length - fresh.length, from: box.email };
});

// campaignStatus({ cardId }) -> { run, counts, rows, box } for the progress table.
exports.campaignStatus = onCall({ timeoutSeconds: 30, memory: '256MiB' }, async (req) => {
  const { d } = await cardGuard(req);
  const [snap, run, rules] = await Promise.all([sendsOf(d.cardId), db().collection('runs').doc(d.cardId).get(), rulesNow()]);
  const all = snap.docs.map((x) => x.data()), counts = {}; let letters = 0;
  all.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; letters += x.i || 0; });
  const r = run.exists ? run.data() : null, now = Date.now(); let box = null;
  if (r) { const ms = await db().collection('mailstate').doc(r.from).get(), m = ms.exists ? ms.data() : {}, day = lib.localParts(now, r.tz).day;
    box = { from: r.from, nextAt: m.nextAt || 0, newToday: m.day === day ? m.newToday || 0 : 0, capToday: lib.capFor(rules, m.firstAt, now), open: lib.inWindow(rules, now, r.tz) }; }
  const order = { replied: 0, error: 1, bounced: 2, active: 3, queued: 4, done: 5, stopped: 6 };
  const rows = all.sort((a, b) => (order[a.status] - order[b.status]) || ((b.sentAt || []).slice(-1)[0] || 0) - ((a.sentAt || []).slice(-1)[0] || 0)).slice(0, 300)
    .map((x) => ({ to: x.to, name: x.name, variant: x.variant, sent: x.i, of: x.steps.length, status: x.status, next: x.status === 'active' && x.i < x.steps.length ? x.due : 0, err: x.err || '' }));
  return { now, run: r ? { status: r.status, from: r.from, queue: (r.queue || []).length, startedAt: r.startedAt } : null, counts, letters, total: all.length, rows, box };
});

// campaignStop({ cardId }) -> { stopped }. Nothing more goes out; letters already sent stay as they are.
exports.campaignStop = onCall({ timeoutSeconds: 60, memory: '256MiB' }, async (req) => {
  const { d } = await cardGuard(req);
  const snap = await sendsOf(d.cardId), live = snap.docs.filter((x) => ['active', 'queued'].includes(x.data().status)), now = Date.now();
  for (let i = 0; i < live.length; i += 400) { const batch = db().batch(); live.slice(i, i + 400).forEach((x) => batch.update(x.ref, { status: 'stopped', due: lib.FAR, endedAt: now })); await batch.commit(); }
  await db().collection('runs').doc(d.cardId).set({ status: 'stopped', queue: [], updatedAt: now }, { merge: true });
  return { stopped: live.length };
});

// A reply turns the recipient into a contact card on the board, in the Replied column, linked to its campaign.
async function replyCard(d, run, ref) {
  const id = 'k' + ref.id.replace(/[^a-zA-Z0-9]/g, '').slice(-14) + Date.now().toString(36);
  await db().collection('cards').doc(id).set({ id, vid: run.vid, owner: run.owner, acl: run.acl || [], ord: Date.now(), type: 'contact', stage: 'replied', title: d.name || d.company || d.to, vec: run.cardVec || {}, parent: d.cid,
    f: { jobTitle: d.jobTitle || '', company: d.company || '', email: d.to, phone: '', linkedin: '' }, next: { text: 'Answer the reply', date: new Date().toISOString().slice(0, 10) }, awaiting: true,
    auto: { follow: false, reply: false, notify: true, draft: true }, notes: `Replied to the campaign "${run.cardTitle}" (variant ${d.variant}, after letter ${d.i}).`, photo: '', blocked: '', okEmail: d.to, tags: d.tags || [] });
  await db().collection('leads').doc(d.lead).set({ card: id, replied: true }, { merge: true }).catch(() => {});
}

// Every two minutes: look for replies, then let each mailbox send at most one letter if the sending rules allow it.
exports.tick = onSchedule({ schedule: 'every 2 minutes', timeoutSeconds: 110, memory: '512MiB', maxInstances: 1 }, async () => {
  const now = Date.now(), tokens = {}, runs = {}, rules = await rulesNow();
  const runOf = async (cid) => { if (!(cid in runs)) { const r = await db().collection('runs').doc(cid).get(); runs[cid] = r.exists ? Object.assign({ ref: r.ref }, r.data()) : null; } return runs[cid]; };
  const fail = async (ref, d, e) => { console.error('send failed', ref.id, e.message); const errs = (d.errs || 0) + 1;
    await ref.update(errs >= 3 ? { status: 'error', due: lib.FAR, errs, err: e.message.slice(0, 300) } : { due: Date.now() + 4 * 60000, errs, err: e.message.slice(0, 300) }); };

  // 1. Threads whose time has come: a reply or a bounce ends the chain; otherwise the next letter waits for its mailbox.
  const due = await db().collection('sends').where('due', '<=', now).orderBy('due').limit(240).get(), follow = {};
  await inChunks(due.docs, 8, async (doc) => {
    const d = doc.data();
    try {
      const run = await runOf(d.cid);
      if (d.status !== 'active' || !run || run.status !== 'active') { await doc.ref.update({ due: lib.FAR }); return; }
      const st = d.threadId ? await lib.threadState(fetch, tokens, run.from, d.threadId) : '';
      if (st) { await doc.ref.update({ status: st, due: lib.FAR, endedAt: now }); if (st === 'replied') await replyCard(d, run, doc.ref); return; }
      if (d.i < d.steps.length) { (follow[run.from] = follow[run.from] || []).push({ doc, d, run }); return; }
      const plan = lib.watchPlan(run.unitMs);
      await doc.ref.update(now > (d.watchUntil || 0) ? { status: 'done', due: lib.FAR, endedAt: now } : { due: now + plan.every });
    } catch (e) { await fail(doc.ref, d, e); }
  });

  // 2. Each mailbox: one letter per run of this function, a reminder first, then the next person in the queue.
  const active = await db().collection('runs').where('status', '==', 'active').get(), byBox = {};
  active.docs.forEach((r) => { const x = Object.assign({ ref: r.ref }, r.data()); runs[x.cid] = runs[x.cid] || x; (byBox[x.from] = byBox[x.from] || []).push(runs[x.cid]); });
  Object.keys(follow).forEach((b) => { byBox[b] = byBox[b] || []; });
  for (const boxMail of Object.keys(byBox)) {
    const msRef = db().collection('mailstate').doc(boxMail), msSnap = await msRef.get(), ms = msSnap.exists ? msSnap.data() : {};
    if (now < (ms.nextAt || 0)) continue;
    const boxRuns = byBox[boxMail].sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)), tz = (boxRuns[0] || (follow[boxMail] || [])[0].run).tz;
    if (!lib.inWindow(rules, now, tz)) continue;
    const today = lib.localParts(now, tz).day, newToday = ms.day === today ? ms.newToday || 0 : 0;
    let job = (follow[boxMail] || []).sort((a, b) => a.d.due - b.d.due)[0], first = false;
    if (!job && newToday < lib.capFor(rules, ms.firstAt, now)) {
      const run = boxRuns.find((r) => (r.queue || []).length);
      if (run) { const id = run.queue[0], doc = await db().collection('sends').doc(id).get(); run.queue = run.queue.slice(1); await run.ref.update({ queue: run.queue, updatedAt: now });
        if (doc.exists && doc.data().status === 'queued') { job = { doc, d: doc.data(), run }; first = true; } }
    }
    if (!job) continue;
    try {
      await job.doc.ref.update(await lib.sendStep(fetch, tokens, job.d, job.run, Date.now()));
      await msRef.set({ firstAt: ms.firstAt || now, lastAt: now, nextAt: now + lib.gapFor(rules, Math.random()), day: today, newToday: newToday + (first ? 1 : 0) }, { merge: true });
    } catch (e) {
      await fail(job.doc.ref, job.d, e);
      if (first && (job.d.errs || 0) + 1 < 3) { job.run.queue = job.run.queue.concat([job.doc.id]); await job.run.ref.update({ queue: job.run.queue }); await job.doc.ref.update({ due: lib.FAR }); }
    }
  }
});
