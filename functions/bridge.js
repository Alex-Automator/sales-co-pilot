// The bridge between VECTOR and Claude: a small MCP server (Streamable HTTP, tools only).
// Claude connects to it as a custom connector and acts with the rights of the person whose key it carries.
// Everything here goes through the same access rules as the program itself; nothing is sent to anyone from this file.
const crypto = require('crypto');

const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'vector-sales-co-pilot', title: 'VECTOR — Sales-co-pilot', version: '0.3.0' };
const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const newKey = () => 'vk_' + crypto.randomBytes(32).toString('base64url');

const INSTRUCTIONS = `VECTOR is the B2B sales program of the person you are talking to. You act in it as their sales and marketing director: you look at what is there, propose what to do next and prepare it. You work with their rights and see only what they see.

How VECTOR is organised
- A Sales Vector is four parameters chosen together: Company (who sells) -> Direction (what is sold) -> Audience (who decides at the client) -> Topic (the reason to write: its hook, offer, tone and the criterion a client company must meet).
- Each vector has a board with stages: new, contacted, replied, meeting, proposal, negotiation, signed, lost.
- Cards on the board: contact (one person), company (one target company), campaign (one letter chain to many people, with variants A/B/C and reminders), task.
- Letters are sent by the VECTOR server from the company's mailboxes under the sending rules (daily limits, pauses, the recipient's working hours). You never send anything yourself.

How to work
- Start every conversation with vector_overview: it shows the companies, parameters and vectors and how busy each one is. Read a topic's settings (get_parameter) before judging or writing letters for it.
- Say what you found in plain words, in the language the person writes in. Give ids only when they help.
- When information is missing for a good vector or a good campaign (who exactly the client is, what is offered, what proof there is, which mailbox, what the next step should be), ask. One or two precise questions at a time; never invent facts about the person's companies, prices, clients or results.
- Client replies and contact details are confidential business data: use them only for the task at hand.
- Nothing is launched without the person's explicit go-ahead in this conversation ("Поїхали" or equally clear words). Preparing is fine; launching is their decision.`;

// ---------- Tool definitions ----------
const obj = (properties, required) => ({ type: 'object', properties, required: required || [], additionalProperties: false });
const str = (description) => ({ type: 'string', description });
const TOOLS = [
  { name: 'vector_overview', title: 'Overview of VECTOR', read: true,
    description: 'The starting point of every conversation. Returns who you act for, their companies with directions, audiences and topics, every sales vector with the number of cards in each stage and running campaigns, and what needs attention (replies waiting for an answer, paused campaigns).',
    inputSchema: obj({}) },
  { name: 'get_parameter', title: 'Settings of a parameter', read: true,
    description: 'Full settings of one company, direction, audience or topic by id. For a topic: the hook, offer, tone, call to action, proof, things to avoid, sample letter and the criterion a client company must meet. For a company: its mailboxes (addresses only). Read the topic before writing or judging letters for it.',
    inputSchema: obj({ id: str('Id of the parameter, from vector_overview.') }, ['id']) },
  { name: 'get_vector', title: 'Board of a vector', read: true,
    description: 'One sales vector: its four parameters and every card on its board (id, type, title, stage, next step, whether a reply is waiting, email and company for contacts).',
    inputSchema: obj({ vector_id: str('Id of the vector, from vector_overview.') }, ['vector_id']) },
  { name: 'get_card', title: 'A card in full', read: true,
    description: 'Everything about one card: fields, notes, next step, tags. For a campaign also its letters (variants A/B/C with their chains and approval state), the mailbox, how many recipients there are and how the run is going.',
    inputSchema: obj({ card_id: str('Id of the card.') }, ['card_id']) },
  { name: 'list_recipients', title: 'Recipients of a campaign', read: true,
    description: 'The people in a campaign list: name, email, company, job title, country, tags, the result of the criterion check and whether the person is left out. Returns up to 100 at a time.',
    inputSchema: obj({ card_id: str('Id of the campaign card.'), offset: { type: 'integer', minimum: 0, description: 'Skip this many people (default 0).' }, only: { type: 'string', enum: ['all', 'fits', 'unsure', 'no', 'left_out'], description: 'Filter by the criterion check or by being left out (default all).' } }, ['card_id']) },
  { name: 'campaign_status', title: 'How a campaign is going', read: true,
    description: 'The run of a campaign: letters sent, who replied, bounced or is waiting, the next letters, why people in the queue wait (working hours, daily limits), and whether the campaign is paused.',
    inputSchema: obj({ card_id: str('Id of the campaign card.') }, ['card_id']) },
  { name: 'get_conversation', title: 'Correspondence with a contact', read: true,
    description: 'The letters exchanged with one contact (the card must be a contact that was written to from VECTOR): who wrote what and when, without quoted tails. Use it before proposing an answer.',
    inputSchema: obj({ card_id: str('Id of the contact card.') }, ['card_id']) },
  { name: 'find', title: 'Find a person or company', read: true,
    description: 'Searches cards and campaign recipients by a piece of a name, email, company or website. Use it to check whether someone is already in VECTOR before creating anything.',
    inputSchema: obj({ query: str('At least 2 characters.') }, ['query']) },
];
const publicTool = (t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
  annotations: { title: t.title, readOnlyHint: !!t.read, destructiveHint: false, idempotentHint: !!t.read, openWorldHint: !!t.send } });

class ToolError extends Error {}

// ---------- The server ----------
module.exports = function makeBridge({ db, lib, fetchFn }) {
  const col = (n) => db().collection(n);
  const one = async (n, id) => { const s = await col(n).doc(String(id || '-')).get(); return s.exists ? Object.assign({ id: s.id }, s.data()) : null; };
  const clip = (x, n) => { const s = String(x == null ? '' : x); return s.length > n ? s.slice(0, n) + '…' : s; };
  const drop = (o) => { const out = {}; Object.keys(o).forEach((k) => { const v = o[k]; if (v !== '' && v != null && !(Array.isArray(v) && !v.length) && v !== false) out[k] = v; }); return out; };

  // Who is calling: the key in the Authorization header (or, where a header cannot be set, in the address after /k/).
  async function whoIs(req) {
    const h = String(req.headers.authorization || ''), fromPath = (String(req.path || '').match(/\/k\/(vk_[\w-]{20,})/) || [])[1];
    const key = /^Bearer\s+vk_/i.test(h) ? h.replace(/^Bearer\s+/i, '').trim() : fromPath || '';
    if (!key) return null;
    const rec = await col('bridgekeys').doc(hashKey(key)).get(); if (!rec.exists || rec.data().off) return null;
    const uid = rec.data().uid, [user, meta] = await Promise.all([col('users').doc(uid).get(), col('meta').doc('app').get()]);
    if (!user.exists || !['admin', 'user'].includes(user.data().role)) return null;
    const superAdmin = meta.exists && meta.data().adminUid === uid;
    if (!superAdmin) return null; // this version: the super admin only
    rec.ref.update({ last: Date.now(), calls: (rec.data().calls || 0) + 1 }).catch(() => {});
    return { uid, superAdmin, name: user.data().name || '', email: user.data().email || '' };
  }
  const sees = (me, d) => !!d && (me.superAdmin || (d.acl || []).includes(me.uid) || (d.acl || []).includes('*'));
  const mine = async (me, n) => { // every document of a collection this person may see
    if (me.superAdmin) return (await col(n).get()).docs.map((x) => Object.assign({ id: x.id }, x.data()));
    const [a, b] = await Promise.all([col(n).where('acl', 'array-contains', me.uid).get(), n === 'params' ? col(n).where('acl', 'array-contains', '*').get() : { docs: [] }]), seen = {};
    return a.docs.concat(b.docs).filter((x) => !seen[x.id] && (seen[x.id] = 1)).map((x) => Object.assign({ id: x.id }, x.data()));
  };
  const need = (x, what) => { if (!x) throw new ToolError(`${what} was not found or you have no access to it.`); return x; };
  const cardOf = async (me, id) => { const c = await one('cards', id); return need(sees(me, c) ? c : null, 'The card'); };
  const cardBrief = (c) => drop({ id: c.id, type: c.type, title: c.title, stage: c.stage, next_step: (c.next || {}).text, next_date: (c.next || {}).date, reply_waiting: !!c.awaiting, needs_attention: c.alert ? 'paused: too many bounced letters' : '',
    email: (c.f || {}).email, company: (c.f || {}).company, job_title: (c.f || {}).jobTitle, tags: c.tags, from_campaign: c.parent, done: c.type === 'task' ? !!c.done : undefined });
  const leadBrief = (l) => { const f = l.f || {}, ch = l.chk || {}; return drop({ id: l.id, name: [f.firstName, f.lastName].filter(Boolean).join(' '), email: f.email, company: f.company, job_title: f.jobTitle, website: f.website, country: f.country, state: f.state, city: f.city,
    tags: l.tags, fits: ch.s === 'yes' ? 'yes' : ch.s === 'no' ? 'no' : ch.s === 'unsure' ? 'unsure' : '', evidence: clip(ch.ev, 240), left_out: !!l.off, blocked: l.blocked || '', has_card: l.card }); };
  const lettersOf = (c) => { const seq = c.seq || {}, vars = { A: seq.steps || [] }; ['B', 'C'].forEach((k) => { if ((seq.alt || {})[k]) vars[k] = seq.alt[k].steps || []; });
    return { language: seq.lang || 'en', interval_unit: { d: 'days', h: 'hours', m: 'minutes' }[seq.unit || 'd'], split: seq.split || 'even',
      variants: Object.keys(vars).map((k) => ({ variant: k, for_job_titles: (k === 'A' ? seq.whoA : seq.alt[k].who) || '', letters: vars[k].map((st, i) => ({ letter: k + (i + 1), day: st.day || 0, approved: st.status === 'approved', subject: st.subject || '', body: st.body || '' })) })) }; };

  async function statusOf(card) {
    const [runSnap, snap, shared] = await Promise.all([col('runs').doc(card.id).get(), col('sends').where('cid', '==', card.id).get(), col('workspace').doc('shared').get()]);
    if (!runSnap.exists) return { started: false };
    const r = runSnap.data(), all = snap.docs.map((x) => x.data()), counts = {}, now = Date.now();
    all.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
    const rules = Object.assign({ from: 9, to: 17, workdays: true, perDomain: 2 }, (shared.exists && shared.data().send) || {});
    const ms = await col('mailstate').doc(String(r.from)).get(), m = ms.exists ? ms.data() : {};
    const when = (t) => (t && t < lib.FAR ? new Date(t).toISOString().slice(0, 16) + 'Z' : '');
    const people = all.sort((a, b) => ((b.sentAt || []).slice(-1)[0] || 0) - ((a.sentAt || []).slice(-1)[0] || 0)).slice(0, 120).map((x) => drop({ email: x.to, name: x.name, variant: x.variant, letters_sent: `${x.i} of ${x.steps.length}`,
      state: x.status === 'active' ? 'in progress' : x.status, answer_kind: x.kind === 'auto' ? 'automatic answer' : '', last_letter: when((x.sentAt || []).slice(-1)[0]), next_letter: x.status === 'active' && x.i < x.steps.length ? when(x.due) : '', time_zone: x.tz || `${r.tz} (sender's, theirs unknown)`, problem: x.err }));
    return drop({ started: true, state: r.paused ? 'paused: too many bounced letters' : r.status, paused: r.paused ? `${r.paused.bounced} of ${r.paused.sent} addresses bounced (limit ${r.paused.limit} %). The person has to look at the list and press "Continue the campaign".` : '',
      mailbox: r.from, started_at: when(r.startedAt), letters_sent: all.reduce((n, x) => n + (x.sentAt || []).length, 0), people: counts, waiting_in_queue: (r.queue || []).length,
      mailbox_pause_until: m.nextAt > now ? when(m.nextAt) : '', working_hours: `${rules.from}:00-${rules.to}:00 in the recipient's time zone${rules.workdays ? ', working days only' : ''}`, per_company_a_day: +rules.perDomain || 'no limit', recipients: people, shown: people.length, total: all.length });
  }

  const handlers = {
    async vector_overview(me) {
      const [params, vectors, cards, runs] = await Promise.all([mine(me, 'params'), mine(me, 'vectors'), mine(me, 'cards'), col('runs').where('status', '==', 'active').get()]);
      const byId = {}; params.forEach((p) => { byId[p.id] = p; });
      const running = {}; runs.docs.forEach((r) => { running[r.id] = r.data(); });
      const zone = (z) => params.filter((p) => p.zone === z).map((p) => drop({ id: p.id, name: p.name, hook: z === 'topic' ? clip((p.s || {}).hook, 160) : '', mailboxes: z === 'company' ? (((p.s || {}).mailboxes) || []).map((b) => b.email) : '' }));
      const vs = vectors.map((v) => { const mineCards = cards.filter((c) => c.vid === v.id), stages = {}; mineCards.forEach((c) => { stages[c.stage] = (stages[c.stage] || 0) + 1; });
        return drop({ id: v.id, company: (byId[v.company] || {}).name, direction: (byId[v.direction] || {}).name, audience: (byId[v.audience] || {}).name, topic: (byId[v.topic] || {}).name,
          parameter_ids: { company: v.company, direction: v.direction, audience: v.audience, topic: v.topic }, cards_by_stage: stages,
          campaigns: mineCards.filter((c) => c.type === 'campaign').map((c) => drop({ id: c.id, title: c.title, running: !!running[c.id], paused: !!(running[c.id] && running[c.id].paused) })) }); });
      const waiting = cards.filter((c) => c.awaiting).map((c) => ({ id: c.id, title: c.title, vector_id: c.vid, since: (c.next || {}).date || '' }));
      return { you_act_for: { name: me.name, role: me.superAdmin ? 'super admin (sees everything)' : 'user' }, today: new Date().toISOString().slice(0, 10),
        companies: zone('company'), directions: zone('direction'), audiences: zone('audience'), topics: zone('topic'), vectors: vs,
        needs_attention: { replies_waiting_for_an_answer: waiting, paused_campaigns: cards.filter((c) => c.type === 'campaign' && c.alert).map((c) => ({ id: c.id, title: c.title, vector_id: c.vid })) } };
    },
    async get_parameter(me, a) {
      const p = await one('params', a.id); need(sees(me, p) ? p : null, 'The parameter');
      const s = Object.assign({}, p.s || {});
      if (s.mailboxes) s.mailboxes = s.mailboxes.map((b) => drop({ email: b.email, sender_name: b.name, primary: !!b.primary, has_signature: !!(b.sig || b.sigHtml), yours: b.owner === me.uid }));
      Object.keys(s).forEach((k) => { if (typeof s[k] === 'string') s[k] = clip(s[k], 6000); });
      return { id: p.id, kind: p.zone, name: p.name, settings: drop(s) };
    },
    async get_vector(me, a) {
      const v = await one('vectors', a.vector_id); need(sees(me, v) ? v : null, 'The vector');
      const [ps, cards] = await Promise.all([Promise.all(['company', 'direction', 'audience', 'topic'].map((z) => one('params', v[z]))), col('cards').where('vid', '==', v.id).get()]);
      const list = cards.docs.map((x) => Object.assign({ id: x.id }, x.data())).filter((c) => sees(me, c));
      return { id: v.id, company: ps[0] && { id: ps[0].id, name: ps[0].name }, direction: ps[1] && { id: ps[1].id, name: ps[1].name }, audience: ps[2] && { id: ps[2].id, name: ps[2].name }, topic: ps[3] && { id: ps[3].id, name: ps[3].name, hook: clip(((ps[3].s) || {}).hook, 400) },
        opt_out_line: (v.opt || {}).on ? (v.opt || {}).text || 'on' : 'off', cards: list.slice(0, 300).map(cardBrief), total_cards: list.length };
    },
    async get_card(me, a) {
      const c = await cardOf(me, a.card_id), f = Object.assign({}, c.f || {});
      const out = Object.assign(cardBrief(c), { vector_id: c.vid, fields: drop(f), notes: clip(c.notes, 4000) });
      if (c.type === 'campaign') {
        const leads = (await col('leads').where('cid', '==', c.id).get()).docs.map((x) => x.data()), n = { total: leads.length, with_email: 0, left_out: 0, fits: 0, unsure: 0, no: 0, not_checked: 0 };
        leads.forEach((l) => { if (String((l.f || {}).email || '').trim()) n.with_email++; if (l.off) n.left_out++; const s = (l.chk || {}).s; if (s === 'yes') n.fits++; else if (s === 'unsure') n.unsure++; else if (s === 'no') n.no++; else n.not_checked++; });
        Object.assign(out, { mailbox: (c.seq || {}).from || '', criterion: String((c.check || {}).crit || '').trim() ? { text: c.check.crit, tag: c.check.tag || '', source: 'set on this card' } : { source: 'taken from the topic settings' }, recipients: n, letters: lettersOf(c), run: await statusOf(c).then((s) => (s.started ? drop({ state: s.state, letters_sent: s.letters_sent, people: s.people, waiting_in_queue: s.waiting_in_queue }) : { started: false })) });
      } else if (c.seq && ((c.seq.steps || []).length)) out.letters = lettersOf(c);
      return out;
    },
    async list_recipients(me, a) {
      const c = await cardOf(me, a.card_id); if (c.type !== 'campaign') throw new ToolError('This card is not a campaign.');
      let leads = (await col('leads').where('cid', '==', c.id).get()).docs.map((x) => Object.assign({ id: x.id }, x.data())).sort((x, y) => (x.ord || 0) - (y.ord || 0));
      const only = a.only || 'all', pick = { fits: 'yes', unsure: 'unsure', no: 'no' }[only];
      if (pick) leads = leads.filter((l) => (l.chk || {}).s === pick); if (only === 'left_out') leads = leads.filter((l) => l.off);
      const off = Math.max(0, +a.offset || 0);
      return { total: leads.length, offset: off, recipients: leads.slice(off, off + 100).map(leadBrief) };
    },
    async campaign_status(me, a) { const c = await cardOf(me, a.card_id); if (c.type !== 'campaign') throw new ToolError('This card is not a campaign.'); return statusOf(c); },
    async get_conversation(me, a) {
      const c = await cardOf(me, a.card_id), to = String((c.f || {}).email || '').trim().toLowerCase();
      if (c.type !== 'contact' || !to) throw new ToolError('This card is not a contact with an email address.');
      let m = c.mail && c.mail.box ? c.mail : null;
      if (!m && c.parent) { const [snap, run] = await Promise.all([col('sends').where('cid', '==', c.parent).get(), col('runs').doc(c.parent).get()]);
        const s = snap.docs.map((x) => x.data()).find((x) => String(x.to || '').toLowerCase() === to && (x.sentAt || []).length);
        if (s && run.exists) m = { box: run.data().from, threads: (s.threads || []).concat(s.threadId || []), since: s.sentAt[0] }; }
      if (!m) return { letters: [], note: 'Nobody has written to this person from VECTOR yet.' };
      const v = await one('vectors', c.vid), co = v ? await one('params', v.company) : null, box = ((((co || {}).s || {}).mailboxes) || []).find((x) => x.email === m.box);
      if (!me.superAdmin && (!box || box.owner !== me.uid)) throw new ToolError(`This conversation runs from ${m.box}, a mailbox of another person. Only its owner can read it.`);
      let msgs; try { msgs = await lib.convo(fetchFn, {}, m.box, to, m.since, m.threads); } catch (e) { throw new ToolError('The mailbox could not be read: ' + clip(e.message, 200)); }
      return { with: to, mailbox: m.box, reply_waiting: !!c.awaiting, letters: msgs.map((x) => ({ from: x.me ? 'us' : 'them', at: new Date(x.at).toISOString().slice(0, 16) + 'Z', subject: x.subject, text: x.text })) };
    },
    async find(me, a) {
      const q = String(a.query || '').trim().toLowerCase(); if (q.length < 2) throw new ToolError('Give at least 2 characters to search for.');
      const [cards, leads] = await Promise.all([mine(me, 'cards'), mine(me, 'leads')]);
      const hit = (...xs) => xs.some((x) => String(x || '').toLowerCase().includes(q));
      const cs = cards.filter((c) => hit(c.title, (c.f || {}).email, (c.f || {}).company, (c.f || {}).website)), ls = leads.filter((l) => { const f = l.f || {}; return hit(f.firstName, f.lastName, f.email, f.company, f.website); });
      return { cards: cs.slice(0, 40).map((c) => Object.assign(cardBrief(c), { vector_id: c.vid })), campaign_recipients: ls.slice(0, 40).map((l) => Object.assign(leadBrief(l), { campaign_card_id: l.cid })), more: Math.max(0, cs.length - 40) + Math.max(0, ls.length - 40) };
    },
  };

  // ---------- JSON-RPC over HTTP ----------
  const rpcErr = (id, code, message, data) => ({ jsonrpc: '2.0', id: id == null ? null : id, error: drop({ code, message, data }) });
  async function answer(me, msg, modern) {
    const id = msg.id, p = msg.params || {}, meta = modern ? { 'io.modelcontextprotocol/serverInfo': SERVER } : undefined;
    const ok = (result) => ({ jsonrpc: '2.0', id, result: Object.assign(modern ? { resultType: 'complete', _meta: meta } : {}, result) });
    switch (msg.method) {
      case 'initialize': { const want = String(p.protocolVersion || ''), v = VERSIONS.includes(want) && want !== '2026-07-28' ? want : '2025-06-18';
        return ok({ protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS }); }
      case 'server/discover': return ok({ supportedVersions: VERSIONS, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
      case 'ping': return ok({});
      case 'tools/list': return ok(Object.assign({ tools: TOOLS.map(publicTool) }, modern ? { ttlMs: 300000, cacheScope: 'private' } : {}));
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === p.name), run = tool && handlers[tool.name];
        if (!run) return rpcErr(id, -32602, `Unknown tool: ${p.name}`);
        const started = Date.now();
        try {
          const out = await run(me, p.arguments || {});
          col('bridgelog').add({ uid: me.uid, tool: tool.name, at: started, ms: Date.now() - started, ok: true, card: (p.arguments || {}).card_id || '' }).catch(() => {});
          return ok({ content: [{ type: 'text', text: clip(JSON.stringify(out), 140000) }], isError: false });
        } catch (e) {
          const known = e instanceof ToolError; if (!known) console.error('bridge tool failed', tool.name, e.message);
          col('bridgelog').add({ uid: me.uid, tool: tool.name, at: started, ms: Date.now() - started, ok: false, err: clip(e.message, 200) }).catch(() => {});
          return ok({ content: [{ type: 'text', text: known ? e.message : 'VECTOR could not do this right now. Try again in a minute; if it repeats, tell the person so.' }], isError: true });
        }
      }
      default: return rpcErr(id, -32601, `Method not found: ${msg.method}`);
    }
  }

  async function handle(req, res) {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.set('Allow', 'POST').status(405).json(rpcErr(null, -32000, 'This address accepts MCP requests by POST only.')); return; }
    let me; try { me = await whoIs(req); } catch (e) { console.error('bridge auth failed', e.message); res.status(503).json(rpcErr(null, -32000, 'VECTOR is not available right now.')); return; }
    if (!me) { res.set('WWW-Authenticate', 'Bearer realm="VECTOR"').status(401).json(rpcErr(null, -32000, 'The VECTOR key is missing, wrong or switched off. Create a new key in VECTOR (AI helper -> Connect Claude) and put it into the connector settings.')); return; }
    const body = req.body, modernHdr = String(req.headers['mcp-protocol-version'] || '') === '2026-07-28';
    const isModern = (m) => modernHdr || ((m.params || {})._meta || {})['io.modelcontextprotocol/protocolVersion'] === '2026-07-28';
    if (!body || typeof body !== 'object') { res.status(400).json(rpcErr(null, -32700, 'The request is not valid JSON.')); return; }
    const one1 = async (m) => { if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return m && m.id != null ? rpcErr(m.id, -32600, 'Invalid request.') : null; if (m.id == null) return null; return answer(me, m, isModern(m)); };
    if (Array.isArray(body)) { const out = (await Promise.all(body.map(one1))).filter(Boolean); if (!out.length) { res.status(202).end(); return; } res.status(200).json(out); return; }
    const out = await one1(body); if (!out) { res.status(202).end(); return; }
    res.status(200).json(out);
  }
  return { handle, hashKey, newKey, TOOLS, handlers, INSTRUCTIONS };
};
