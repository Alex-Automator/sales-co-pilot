// The bridge between VECTOR and Claude: a small MCP server (Streamable HTTP, tools only).
// Claude connects to it as a custom connector and acts with the rights of the person whose key it carries.
// Everything here goes through the same access rules as the program itself; nothing is sent to anyone from this file.
const crypto = require('crypto');

const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'vector-sales-co-pilot', title: 'VECTOR — Sales-co-pilot', version: '0.9.1' };
const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const newKey = () => 'vk_' + crypto.randomBytes(32).toString('base64url');

const INSTRUCTIONS = `VECTOR is the B2B sales program of the person you talk to. You are their sales and marketing director in it: you look, propose, prepare, and launch only on their word. You act with their rights.

Three rules above all
1. Nothing is sent without the person's clear go-ahead in this conversation ("Поїхали" or equally clear words). Before a launch: launch_check, tell them in a few lines what will go out (to whom, how many, from which mailbox, the first letter), ask "Поїхали?". Praise of a text, silence or an earlier go-ahead for something else is not a go-ahead. If they say stop, call stop_sending first.
2. Never invent facts about their companies, prices, clients or results. When something needed for a good vector, campaign or letter is missing, ask one or two precise questions.
3. You cannot change sending rules, access rights, the forbidden list or mailboxes (except a mailbox's sender name), and you delete nothing. Those the person does in VECTOR.

How VECTOR is organised
A Sales Vector = Company (who sells) > Direction (what is sold) > Audience (who decides at the client) > Topic (the reason to write: hook, offer, tone, the criterion a client must meet). Each vector has a board: new, contacted, replied, meeting, proposal, negotiation, signed, lost. Cards: contact (one person), company, campaign (one letter chain to many people, variants A/B/C, reminders), task. The VECTOR server sends the letters by the sending rules (daily limits, pauses, the recipient's working hours).

How to work
- Start with vector_overview. Read a topic (get_parameter) before judging or writing letters for it. Answer in the person's language, in plain words; ids only when they help.
- Which company writes: the person owns several. Choose by the company profiles and directions in the overview, never by the name. If two fit, name both with reasons and ask. If a profile is empty, say so and offer to draft it (website + their answer about the boundary between their companies), then set_company_profile after they agree.
- Check the past before writing to anyone: find (cards in VECTOR) and find_correspondence (their real mailboxes). Say with whom, when and how it ended.
- Reuse what exists. Propose a new vector by naming its four parameters before creating it. Agree a topic's hook in words before setting or changing it, and say when other vectors use that topic.
- Lists of people may live in their Google Drive: use your Drive or Sheets connector, say which file you found (name, date, rows, columns), wait for their confirmation, then add_recipients.
- Letters: write them yourself from the topic, the library links (get_vector) and what they told you. Show the exact text. Save as drafts; mark approved only after they approved that exact text. Campaign fields: {{firstName}} {{lastName}} {{company}} {{jobTitle}} {{city}} {{project}} {{myName}}; a phrase that depends on a field some people lack goes in [[double brackets]]. No signature: it is added automatically. A letter to one contact needs no fields.
- Client replies and contact details are confidential: use them only for the task at hand.`;

// ---------- Tool definitions ----------
const obj = (properties, required) => ({ type: 'object', properties, required: required || [], additionalProperties: false });
const str = (description) => ({ type: 'string', description });
const TOOLS = [
  { name: 'vector_overview', title: 'Overview of VECTOR', read: true,
    description: 'The starting point of every conversation. Vectors and campaigns carry their creation date (created), newest campaigns first. Returns who you act for, their companies with directions, audiences and topics, every sales vector with the number of cards in each stage and running campaigns, and what needs attention (replies waiting for an answer, paused campaigns).',
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
const FIELDS = { email: str('Email address.'), company: str('Company the person works for.'), job_title: str('Job title.'), phone: str('Phone.'), linkedin: str('LinkedIn address.'), website: str('Website (company cards and recipients).'), country: str('Country (helps to write in the person\'s working hours).'), state: str('State or province.'), city: str('City.'), first_name: str('First name (recipients).'), last_name: str('Last name (recipients).') };
const LETTER = obj({ day: { type: 'integer', minimum: 0, description: 'When the letter goes, counted from the first letter in the interval unit of the card: 0 for the first letter, for example 3 and 7 for reminders.' }, subject: str('Subject. Leave empty in a reminder to continue the same conversation ("Re: …").'), body: str('Text without a signature.'),
  approved: { type: 'boolean', description: 'true only after the person approved this exact text in the conversation. Default false (a draft).' } }, ['day', 'body']);
TOOLS.push(
  { name: 'get_library', title: 'Library links', read: true,
    description: 'The Library of the Database: documents, videos and pages the person collected for letters (title, address, priority, company). Use them as proof and as links in letters instead of inventing any.',
    inputSchema: obj({}) },
  { name: 'find_correspondence', title: 'Find past correspondence in the mailboxes', read: true,
    description: 'Searches the person\'s own work mailboxes (the company mailboxes they own in VECTOR) for past correspondence with a company or a person: give a company name (Sweco), a domain (sweco.fi) or an email address. Returns conversations, newest first: subject, who took part, dates, how many letters, who wrote last and the beginning of the last letter. Use it before writing to someone, to learn whether you already talked, with whom and how it ended. Unlike find, this looks into real mail, including letters that never went through VECTOR. Open a conversation with read_correspondence.',
    inputSchema: obj({ query: str('Company name, domain or email address.'), mailbox: str('Optional: search only this mailbox. Default: all mailboxes the person owns.'), also_mentions: { type: 'boolean', description: 'Also include letters that only mention the name in their text (default: only letters from or to these people; mentions are added automatically when nothing else is found).' } }, ['query']) },
  { name: 'read_correspondence', title: 'Read one past conversation', read: true,
    description: 'The full text of one conversation found by find_correspondence: every letter with sender, date and text, without quoted tails.',
    inputSchema: obj({ mailbox: str('The mailbox, as returned by find_correspondence.'), thread: str('The thread id, as returned by find_correspondence.') }, ['mailbox', 'thread']) },
  { name: 'set_company_profile', title: 'Write the profile of a company',
    description: 'Saves what one of the person\'s companies does, so that you and VECTOR\'s own AI know which company should write to a client and what to say about it: about (what it does and sells), clients (who buys), when_to_use (when to write from this company rather than from the person\'s other companies — the boundary between them), not_doing, proof (cases, numbers, names). You may draft it from the company\'s website and what the person told you, but the boundary between their companies only they know: show the draft, let them correct it, save after they agree. Only the fields you pass are changed. The same tool also sets how the sender\'s name is written for one of the company\'s mailboxes (mailbox + sender_name); signatures and the list of mailboxes stay with the person.',
    inputSchema: obj({ company_id: str('Id of the company.'), about: str('What the company does and sells.'), clients: str('Who its clients are.'), when_to_use: str('When to write from this company and not from the others.'), not_doing: str('What it does not do.'), proof: str('Cases, numbers, names that can be mentioned.'), mailbox: str('Optional, together with sender_name: the address of one of this company\'s mailboxes that the person owns.'), sender_name: str('Optional, together with mailbox: how the person\'s name is written next to that address in letters, for example Alexander Naumov. Use Latin letters when the letters are in a Latin-script language; agree the spelling with the person first.') }, ['company_id']) },
  { name: 'create_parameter', title: 'Create a direction, audience or topic',
    description: 'Creates a new direction (what is sold; belongs to one company), audience (who decides at the client) or topic (the reason to write). Check vector_overview first so that you do not create a second copy of something that exists. Companies are created by the person in VECTOR, not here. Settings — direction: desc, criteria (list). Audience: role (decision, influence or user), tone (formal, neutral or informal), regions, language, pains, notes. Topic: hook, offer, tones (list of: direct, friendly, expert, formal, brief, curious), cta, proof, avoid, sample, keywords, crit (what a client company must have or do to be written to), tag, terms (words to look for on a site, comma separated).',
    inputSchema: obj({ kind: { type: 'string', enum: ['direction', 'audience', 'topic'] }, name: str('Short name shown on the screen.'), company_id: str('For a direction: the company it belongs to.'), settings: { type: 'object', description: 'Settings as listed in the description.', additionalProperties: true } }, ['kind', 'name']) },
  { name: 'update_parameter', title: 'Change a direction, audience or topic',
    description: 'Changes the name or some settings of a direction, audience or topic; settings you do not pass stay as they are. Agree a change of a topic\'s hook with the person first. The answer says how many vectors use this parameter: the change reaches all of them.',
    inputSchema: obj({ id: str('Id of the parameter.'), name: str('New name (optional).'), settings: { type: 'object', description: 'Only the settings to change; see create_parameter for the list.', additionalProperties: true } }, ['id']) },
  { name: 'create_vector', title: 'Create a sales vector',
    description: 'Fixes a sales vector from four existing parameters. If the same four are already a vector, returns that one. Name the four parameters to the person before creating.',
    inputSchema: obj({ company_id: str('Company.'), direction_id: str('Direction of that company.'), audience_id: str('Audience.'), topic_id: str('Topic.') }, ['company_id', 'direction_id', 'audience_id', 'topic_id']) },
  { name: 'create_card', title: 'Create a card',
    description: 'Creates a card on the board of a vector: contact (one person; the title is the name), company (a target company), campaign (letters to many people; add recipients and letters afterwards) or task. Use find first: do not create a second card for the same person. Nothing is sent by creating a card.',
    inputSchema: obj({ vector_id: str('Vector whose board gets the card.'), type: { type: 'string', enum: ['contact', 'company', 'campaign', 'task'] }, title: str('Name of the person or company, title of the campaign or task.'), stage: { type: 'string', enum: ['new', 'contacted', 'replied', 'meeting', 'proposal', 'negotiation', 'signed', 'lost'], description: 'Default new.' },
      fields: obj({ email: FIELDS.email, company: FIELDS.company, job_title: FIELDS.job_title, phone: FIELDS.phone, linkedin: FIELDS.linkedin, website: FIELDS.website, country: FIELDS.country }), notes: str('Notes: where the contact came from, what was said.'), next_step: str('What has to be done next.'), next_date: str('Date of the next step, YYYY-MM-DD.') }, ['vector_id', 'type', 'title']) },
  { name: 'update_card', title: 'Change a card',
    description: 'Changes a card: title, stage (moving it along the board), fields, notes, next step, the reply-waiting flag. For a campaign or a contact also: the mailbox letters go from (one of the company mailboxes), the opt-out line under the signature (true, false, or null to follow the vector), and for a campaign its own criterion (otherwise the topic\'s criterion is used). Only what you pass is changed.',
    inputSchema: obj({ card_id: str('Id of the card.'), title: str('New title.'), stage: { type: 'string', enum: ['new', 'contacted', 'replied', 'meeting', 'proposal', 'negotiation', 'signed', 'lost'] },
      fields: obj({ email: FIELDS.email, company: FIELDS.company, job_title: FIELDS.job_title, phone: FIELDS.phone, linkedin: FIELDS.linkedin, website: FIELDS.website, country: FIELDS.country }), notes: str('Replaces the notes.'), add_note: str('A line added to the end of the notes.'), next_step: str('Next step.'), next_date: str('YYYY-MM-DD, or empty to clear.'), reply_waiting: { type: 'boolean' },
      mailbox: str('Address of the mailbox to send from.'), opt_out_line: { type: ['boolean', 'null'] }, criterion: obj({ text: str('What a company must have or do.'), tag: str('Short tag for those who fit.'), terms: str('Words to look for, comma separated.') }) }, ['card_id']) },
  { name: 'add_recipients', title: 'Add people to a campaign',
    description: 'Adds people to the list of a campaign (up to 200 per call). An email is required for each; addresses already in the list and addresses on the forbidden list are skipped and reported. Country and state help to send in the person\'s working hours. Nothing is sent by adding.',
    inputSchema: obj({ card_id: str('Id of the campaign card.'), people: { type: 'array', maxItems: 200, items: obj({ first_name: FIELDS.first_name, last_name: FIELDS.last_name, email: FIELDS.email, company: FIELDS.company, job_title: FIELDS.job_title, website: FIELDS.website, country: FIELDS.country, state: FIELDS.state, city: FIELDS.city, phone: FIELDS.phone, linkedin: FIELDS.linkedin, variant: { type: 'string', enum: ['A', 'B', 'C', 'auto'], description: 'Which letter variant this person gets. Leave out or pass auto to let VECTOR decide: equal shares, and colleagues from one company get different variants.' } }, ['email']) } }, ['card_id', 'people']) },
  { name: 'update_recipient', title: 'Change a person in a campaign list',
    description: 'Leaves a person out of a campaign or returns them (left_out), sets which letter variant they get (variant), or corrects their fields. A person left out gets no further letters, also when the campaign is already running.',
    inputSchema: obj({ card_id: str('Id of the campaign card.'), recipient_id: str('Id of the person, from list_recipients.'), left_out: { type: 'boolean' }, variant: { type: 'string', enum: ['A', 'B', 'C', 'auto'], description: 'Which letter variant this person gets. Leave out or pass auto to let VECTOR decide: equal shares, and colleagues from one company get different variants.' }, fields: obj({ first_name: FIELDS.first_name, last_name: FIELDS.last_name, company: FIELDS.company, job_title: FIELDS.job_title, website: FIELDS.website, country: FIELDS.country, state: FIELDS.state, city: FIELDS.city, phone: FIELDS.phone, linkedin: FIELDS.linkedin }) }, ['card_id', 'recipient_id']) },
  { name: 'set_letters', title: 'Write the letters of a card',
    description: 'Saves the letters of a campaign or a contact card. Each variant you pass is replaced as a whole by the chain you give (first letter and reminders); variants you do not pass stay. Variant A always exists; B and C are parallel versions. Who gets which: a variant set on the person (add_recipients, update_recipient) wins; otherwise the job titles named in for_job_titles; otherwise equal shares, where colleagues from one company automatically get different variants. So one campaign is enough for several texts; list_recipients shows the variant each person will get. Show the text to the person before saving and keep letters as drafts until they approve that exact text. In a campaign that is already running the change applies only to people added later.',
    inputSchema: obj({ card_id: str('Id of the campaign or contact card.'), language: str('Language of sending, two letters, for example en.'), interval_unit: { type: 'string', enum: ['days', 'hours', 'minutes'], description: 'Unit of the day numbers. Days for real campaigns; minutes only for tests.' },
      variants: { type: 'array', minItems: 1, maxItems: 3, items: obj({ variant: { type: 'string', enum: ['A', 'B', 'C'] }, for_job_titles: str('Optional: job title words this variant is for, comma separated.'), letters: { type: 'array', minItems: 1, maxItems: 6, items: LETTER } }, ['variant', 'letters']) }, remove_variants: { type: 'array', items: { type: 'string', enum: ['B', 'C'] }, description: 'Variants to remove.' } }, ['card_id', 'variants']) },
);
const GO = str('The person\'s own words of go-ahead from this conversation, quoted exactly (for example "Поїхали"). Required. Never fill this in yourself: if the person has not clearly said to launch, do not call this tool — ask them.');
TOOLS.push(
  { name: 'launch_check', title: 'Is the card ready to launch?', read: true,
    description: 'Checks a campaign or a contact card before a launch and returns what would go out: from which mailbox, to how many people (and who, for a short list), the letters with their approval state, the opt-out line, and every problem that would stop the launch (letters not approved, no mailbox, people with an empty field the letter uses, nobody left to write to). Show this summary to the person and ask for their go-ahead.',
    inputSchema: obj({ card_id: str('Id of the campaign or contact card.') }, ['card_id']) },
  { name: 'start_sending', title: 'LAUNCH: start sending letters', send: true,
    description: 'Starts sending the approved letters of a campaign or a contact card to real people. This cannot be taken back. Call it only when (1) launch_check shows no problems, (2) you showed the person what will go out, and (3) the person then said clearly, in this conversation, to launch ("Поїхали" or equally clear words). After the start the VECTOR server sends by the sending rules: daily limits, pauses, the recipient\'s working hours; reminders go later unless the person replied. Also continues a campaign that was paused, and queues people added since the last start.',
    inputSchema: obj({ card_id: str('Id of the campaign or contact card.'), go_ahead: GO }, ['card_id', 'go_ahead']) },
  { name: 'stop_sending', title: 'Stop sending',
    description: 'Stops a running campaign or the chain of a contact: no more first letters and no more reminders. Letters already sent stay sent; replies to them are still noticed. Use it at once when the person asks to stop.',
    inputSchema: obj({ card_id: str('Id of the campaign or contact card.') }, ['card_id']) },
  { name: 'send_answer', title: 'SEND: answer a contact', send: true,
    description: 'Sends an answer to a contact in the existing conversation (the same mailbox, the same thread, the mailbox signature is added). It goes at once and cannot be taken back. Call it only after the person approved this exact text in this conversation and said to send it. Read the conversation first (get_conversation). No {{fields}}: write to the person in plain words.',
    inputSchema: obj({ card_id: str('Id of the contact card.'), body: str('The text of the answer, without a signature.'), go_ahead: GO }, ['card_id', 'body', 'go_ahead']) },
);
const publicTool = (t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
  annotations: { title: t.title, readOnlyHint: !!t.read, destructiveHint: !!t.send, idempotentHint: !!t.read, openWorldHint: !!t.send } });

class ToolError extends Error {}

// ---------- The server ----------
module.exports = function makeBridge({ db, lib, fetchFn, calls }) {
  const col = (n) => db().collection(n);
  const born = (x) => (x.createTime && x.createTime.toMillis ? { _ct: x.createTime.toMillis() } : {});
  const one = async (n, id) => { const s = await col(n).doc(String(id || '-')).get(); return s.exists ? Object.assign({ id: s.id }, born(s), s.data()) : null; };
  const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
  const made = (d) => day(d.at || d._ct);
  const clip = (x, n) => { const s = String(x == null ? '' : x); return s.length > n ? s.slice(0, n) + '…' : s; };
  const drop = (o) => { const out = {}; Object.keys(o).forEach((k) => { const v = o[k]; if (v !== '' && v != null && !(Array.isArray(v) && !v.length) && v !== false) out[k] = v; }); return out; };

  // Who is calling: the key in the Authorization header (or, where a header cannot be set, in the address after /k/).
  async function whoIs(req) {
    // The key is accepted wherever it was put: "Bearer vk_…", a bare "vk_…", another header such as X-Api-Key, or the address.
    const inHeaders = Object.keys(req.headers || {}).map((k) => (String(req.headers[k]).match(/vk_[\w-]{30,}/) || [])[0]).filter(Boolean)[0];
    const fromPath = (String(req.path || '').match(/\/k\/(vk_[\w-]{20,})/) || [])[1], key = inHeaders || fromPath || '';
    if (!key) { req.why = 'no key in the request'; return null; }
    const rec = await col('bridgekeys').doc(hashKey(key)).get(); if (!rec.exists || rec.data().off) { req.why = 'the key is not the current one'; return null; }
    const uid = rec.data().uid, [user, meta] = await Promise.all([col('users').doc(uid).get(), col('meta').doc('app').get()]);
    if (!user.exists || !['admin', 'user'].includes(user.data().role)) return null;
    const superAdmin = meta.exists && meta.data().adminUid === uid;
    if (!superAdmin) return null; // this version: the super admin only
    rec.ref.update({ last: Date.now(), calls: (rec.data().calls || 0) + 1 }).catch(() => {});
    return { uid, superAdmin, name: user.data().name || '', email: user.data().email || '' };
  }
  const sees = (me, d) => !!d && (me.superAdmin || (d.acl || []).includes(me.uid) || (d.acl || []).includes('*'));
  const mine = async (me, n) => { // every document of a collection this person may see
    if (me.superAdmin) return (await col(n).get()).docs.map((x) => Object.assign({ id: x.id }, born(x), x.data()));
    const [a, b] = await Promise.all([col(n).where('acl', 'array-contains', me.uid).get(), n === 'params' ? col(n).where('acl', 'array-contains', '*').get() : { docs: [] }]), seen = {};
    return a.docs.concat(b.docs).filter((x) => !seen[x.id] && (seen[x.id] = 1)).map((x) => Object.assign({ id: x.id }, born(x), x.data()));
  };
  const need = (x, what) => { if (!x) throw new ToolError(`${what} was not found or you have no access to it.`); return x; };
  const cardOf = async (me, id) => { const c = await one('cards', id); return need(sees(me, c) ? c : null, 'The card'); };
  const cardBrief = (c) => drop({ id: c.id, type: c.type, title: c.title, created: made(c), stage: c.stage, next_step: (c.next || {}).text, next_date: (c.next || {}).date, reply_waiting: !!c.awaiting, needs_attention: c.alert ? 'paused: too many bounced letters' : '',
    email: (c.f || {}).email, company: (c.f || {}).company, job_title: (c.f || {}).jobTitle, tags: c.tags, from_campaign: c.parent, done: c.type === 'task' ? !!c.done : undefined });
  const leadBrief = (l) => { const f = l.f || {}, ch = l.chk || {}; return drop({ id: l.id, name: [f.firstName, f.lastName].filter(Boolean).join(' '), email: f.email, company: f.company, job_title: f.jobTitle, website: f.website, country: f.country, state: f.state, city: f.city,
    tags: l.tags, variant_set: ['A', 'B', 'C'].includes(l.var) ? l.var : '', fits: ch.s === 'yes' ? 'yes' : ch.s === 'no' ? 'no' : ch.s === 'unsure' ? 'unsure' : '', evidence: clip(ch.ev, 240), left_out: !!l.off, blocked: l.blocked || '', has_card: l.card }); };
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
    // Times are shown in the time zone of the person who started the campaign, not in UTC.
    const zone = (() => { try { new Intl.DateTimeFormat('en', { timeZone: r.tz }); return r.tz; } catch (e) { return 'UTC'; } })();
    const when = (t) => (t && t < lib.FAR ? new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(t)) : '');
    const people = all.sort((a, b) => ((b.sentAt || []).slice(-1)[0] || 0) - ((a.sentAt || []).slice(-1)[0] || 0)).slice(0, 120).map((x) => drop({ email: x.to, name: x.name, variant: x.variant, letters_sent: `${x.i} of ${x.steps.length}`,
      state: x.status === 'active' ? 'in progress' : x.status, answer_kind: x.kind === 'auto' ? 'automatic answer' : '', last_letter: when((x.sentAt || []).slice(-1)[0]), next_letter: x.status === 'active' && x.i < x.steps.length ? when(x.due) : '', time_zone: x.tz || `${r.tz} (sender's, theirs unknown)`, problem: x.err }));
    return drop({ started: true, times_are_in: zone, state: r.paused ? 'paused: too many bounced letters' : r.status, paused: r.paused ? `${r.paused.bounced} of ${r.paused.sent} addresses bounced (limit ${r.paused.limit} %). The person has to look at the list and press "Continue the campaign".` : '',
      mailbox: r.from, started_at: when(r.startedAt), letters_sent: all.reduce((n, x) => n + (x.sentAt || []).length, 0), people: counts, waiting_in_queue: (r.queue || []).length,
      mailbox_pause_until: m.nextAt > now ? when(m.nextAt) : '', working_hours: `${rules.from}:00-${rules.to}:00 in the recipient's time zone${rules.workdays ? ', working days only' : ''}`, per_company_a_day: +rules.perDomain || 'no limit', recipients: people, shown: people.length, total: all.length });
  }

  const handlers = {
    async vector_overview(me) {
      const [params, vectors, cards, runs] = await Promise.all([mine(me, 'params'), mine(me, 'vectors'), mine(me, 'cards'), col('runs').where('status', '==', 'active').get()]);
      const byId = {}; params.forEach((p) => { byId[p.id] = p; });
      const running = {}; runs.docs.forEach((r) => { running[r.id] = r.data(); });
      const profile = (s) => { const o = drop({ does: clip(s.about, 500), clients: clip(s.clients, 300), write_from_it_when: clip(s.whenUse, 400), does_not_do: clip(s.notDo, 300), proof: clip(s.proof, 300) }); return Object.keys(o).length ? o : 'EMPTY: nothing is written about what this company does. Do not guess from the name: ask the person, or offer to draft the profile (set_company_profile).'; };
      const zone = (z) => params.filter((p) => p.zone === z).map((p) => drop({ id: p.id, name: p.name, company_id: z === 'direction' ? p.company : '', about: z === 'direction' ? clip((p.s || {}).desc, 300) : '', good_fit_when: z === 'direction' ? (p.s || {}).criteria : '', hook: z === 'topic' ? clip((p.s || {}).hook, 160) : '',
        website: z === 'company' ? (p.s || {}).website : '', profile: z === 'company' ? profile(p.s || {}) : '', mailboxes: z === 'company' ? (((p.s || {}).mailboxes) || []).map((b) => b.email) : '' }));
      const vs = vectors.map((v) => { const mineCards = cards.filter((c) => c.vid === v.id), stages = {}; mineCards.forEach((c) => { stages[c.stage] = (stages[c.stage] || 0) + 1; });
        return drop({ id: v.id, created: made(v), company: (byId[v.company] || {}).name, direction: (byId[v.direction] || {}).name, audience: (byId[v.audience] || {}).name, topic: (byId[v.topic] || {}).name,
          parameter_ids: { company: v.company, direction: v.direction, audience: v.audience, topic: v.topic }, cards_by_stage: stages,
          campaigns: mineCards.filter((c) => c.type === 'campaign').sort((x, y) => (y.at || y._ct || 0) - (x.at || x._ct || 0)).map((c) => drop({ id: c.id, title: c.title, created: made(c), running: !!running[c.id], paused: !!(running[c.id] && running[c.id].paused) })) }); });
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
      const list = cards.docs.map((x) => Object.assign({ id: x.id }, born(x), x.data())).filter((c) => sees(me, c));
      return { id: v.id, created: made(v), company: ps[0] && { id: ps[0].id, name: ps[0].name }, direction: ps[1] && { id: ps[1].id, name: ps[1].name }, audience: ps[2] && { id: ps[2].id, name: ps[2].name }, topic: ps[3] && { id: ps[3].id, name: ps[3].name, hook: clip(((ps[3].s) || {}).hook, 400) },
        opt_out_line: (v.opt || {}).on ? (v.opt || {}).text || 'on' : 'off', library_links: (await handlers.get_library(me)).links.filter((d) => !d.company || d.company === (ps[0] || {}).name).slice(0, 30), cards: list.slice(0, 300).map(cardBrief), total_cards: list.length };
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
      const off = Math.max(0, +a.offset || 0), all = (await col('leads').where('cid', '==', c.id).get()).docs.map((x) => Object.assign({ id: x.id }, x.data())).sort((x, y) => (x.ord || 0) - (y.ord || 0));
      const multi = ['B', 'C'].some((k) => ((c.seq || {}).alt || {})[k]), gets = multi ? lib.assignVariants(c.seq || {}, all.filter((l) => String((l.f || {}).email || '').trim() && !l.off && !l.blocked)) : {};
      return { total: leads.length, offset: off, recipients: leads.slice(off, off + 100).map((l) => Object.assign(leadBrief(l), multi && gets[l.id] ? { will_get_variant: gets[l.id] } : {})) };
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

  // ---------- Preparing: everything a person could click together before a launch ----------
  const nid = (p) => p + Math.random().toString(36).slice(2, 9);
  const txt = (x, n) => String(x == null ? '' : x).replace(/\r/g, '').trim().slice(0, n);
  const STAGE = ['new', 'contacted', 'replied', 'meeting', 'proposal', 'negotiation', 'signed', 'lost'], TONES = ['direct', 'friendly', 'expert', 'formal', 'brief', 'curious'];
  const SETTINGS = { direction: { desc: 4000, criteria: 'list' }, audience: { role: ['decision', 'influence', 'user'], tone: ['formal', 'neutral', 'informal'], regions: 400, language: 200, pains: 4000, notes: 4000 },
    topic: { hook: 4000, offer: 4000, tones: 'tones', cta: 1000, proof: 2000, avoid: 2000, sample: 6000, keywords: 600, crit: 1000, tag: 60, terms: 600 } };
  function settingsFor(kind, input) {
    const spec = SETTINGS[kind], out = {}, unknown = [];
    Object.keys(input || {}).forEach((k) => { const rule = spec[k], v = input[k];
      if (!rule) { unknown.push(k); return; }
      if (rule === 'list') out[k] = (Array.isArray(v) ? v : String(v).split('\n')).map((x) => txt(x, 300)).filter(Boolean).slice(0, 20);
      else if (rule === 'tones') out[k] = (Array.isArray(v) ? v : String(v).split(',')).map((x) => txt(x, 20).toLowerCase()).filter((x) => TONES.includes(x));
      else if (Array.isArray(rule)) { const x = txt(v, 20).toLowerCase(); if (x && !rule.includes(x)) throw new ToolError(`"${k}" must be one of: ${rule.join(', ')}.`); out[k] = x; }
      else out[k] = k === 'tag' ? txt(v, rule).toLowerCase().replace(/^#/, '').replace(/[^a-z0-9а-яіїєґ]+/gi, '-').replace(/^-|-$/g, '') : txt(v, rule); });
    if (unknown.length) throw new ToolError(`Unknown settings for a ${kind}: ${unknown.join(', ')}. Allowed: ${Object.keys(spec).join(', ')}.`);
    return out;
  }
  // The mailboxes this person owns, across the companies they see. Mail is read only from one's own mailboxes.
  const myBoxes = async (me) => { const out = []; (await mine(me, 'params')).filter((p) => p.zone === 'company').forEach((co) => (((co.s || {}).mailboxes) || []).forEach((b) => { if (b.owner === me.uid && b.email) out.push({ email: b.email, company: co.name }); })); return out; };
  const usedBy = async (zone, id) => (await col('vectors').where(zone, '==', id).get()).size;
  const banned = async (uid) => { const g = await col('guards').doc(String(uid)).get(); return ((g.exists && g.data().list) || []).map((x) => String(x).trim().toLowerCase().replace(/^@/, '')).filter(Boolean); };
  const isBanned = (list, email) => list.some((g) => email === g || email.endsWith('@' + g));
  const okMail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const cardFields = (type, f) => { const map = { contact: { job_title: 'jobTitle', company: 'company', email: 'email', phone: 'phone', linkedin: 'linkedin', country: 'country', website: 'website' }, company: { website: 'website', country: 'country', phone: 'phone', linkedin: 'linkedin', email: 'email' }, campaign: {}, task: {} }[type] || {}, out = {};
    Object.keys(f || {}).forEach((k) => { if (map[k]) out[map[k]] = k === 'email' ? txt(f[k], 200).toLowerCase() : txt(f[k], 400); }); return out; };
  const leadFields = (f) => { const map = { first_name: 'firstName', last_name: 'lastName', email: 'email', company: 'company', job_title: 'jobTitle', website: 'website', country: 'country', state: 'state', city: 'city', phone: 'phone', linkedin: 'linkedin' }, out = {};
    Object.keys(f || {}).forEach((k) => { if (map[k] && txt(f[k], 400)) out[map[k]] = k === 'email' ? txt(f[k], 200).toLowerCase() : txt(f[k], 400); }); return out; };
  const stepOf = (l, old) => ({ id: (old && old.id) || nid('s'), day: Math.max(0, Math.round(+l.day || 0)), subject: txt(l.subject, 300), body: txt(l.body, 8000), status: l.approved ? 'approved' : 'draft' });
  const LETTER_FIELDS = ['firstName', 'lastName', 'company', 'jobTitle', 'city', 'project', 'myName', 'signature'];

  Object.assign(handlers, {
    async get_library(me) {
      const sh = await col('workspace').doc('shared').get(), docs = (sh.exists && sh.data().docs) || [], params = await mine(me, 'params'), name = {}; params.forEach((p) => { name[p.id] = p.name; });
      return { links: docs.filter((d) => !d.company || name[d.company]).sort((a, b) => (a.priority || 9) - (b.priority || 9)).map((d) => drop({ title: d.title, address: d.url, priority: d.priority, company: name[d.company] || '' })) };
    },
    async find_correspondence(me, a) {
      const raw = txt(a.query, 80).replace(/["'(){}\[\]:<>\\]/g, ' ').replace(/\s+/g, ' ').trim(); if (raw.length < 2) throw new ToolError('Give a company name, a domain or an email address.');
      const boxes = await myBoxes(me), want = txt(a.mailbox, 200).toLowerCase(), use = want ? boxes.filter((b) => b.email.toLowerCase() === want) : boxes;
      if (!use.length) throw new ToolError(want ? `${a.mailbox} is not a mailbox you own in VECTOR. Yours: ${boxes.map((b) => b.email).join(', ') || 'none'}.` : 'You own no mailbox in VECTOR yet: add one in the company settings.');
      // "Sweco" also matches addresses at sweco.fi and sweco.com: Gmail compares the words inside an address.
      const term = /\s/.test(raw) ? `"${raw}"` : raw, people = `{from:${term} to:${term} cc:${term}}`, tokens = {}, found = [], failed = [];
      const look = async (q) => { for (const b of use) { try { (await lib.mailSearch(fetchFn, tokens, b.email, q + ' -in:chats', 8)).forEach((x) => found.push(Object.assign({ mailbox: b.email, company: b.company }, x))); } catch (e) { failed.push(`${b.email}: ${clip(e.message, 120)}`); } } };
      await look(a.also_mentions ? `{from:${term} to:${term} cc:${term} "${raw}"}` : people); let widened = false;
      if (!found.length && !a.also_mentions && !failed.length) { widened = true; await look(`"${raw}"`); }
      const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
      return drop({ searched_mailboxes: use.map((b) => b.email), could_not_read: failed, note: !found.length ? 'Nothing found in these mailboxes: no letters from or to such people and no mention of this name.' : widened ? 'No letters from or to people at this company; these conversations only mention the name.' : '',
        conversations: found.sort((x, y) => y.last - x.last).slice(0, 20).map((x) => drop({ mailbox: x.mailbox, thread: x.thread, subject: x.subject, people: x.people, letters: x.letters, first_letter: day(x.first), last_letter: day(x.last), last_word: x.lastFromUs ? 'ours (no answer after it)' : 'theirs: ' + clip(x.lastFrom.replace(/<.*>/, '').replace(/"/g, '').trim(), 60), last_letter_begins: x.snippet })) });
    },
    async read_correspondence(me, a) {
      const box = (await myBoxes(me)).find((b) => b.email.toLowerCase() === txt(a.mailbox, 200).toLowerCase()); if (!box) throw new ToolError('This is not a mailbox you own in VECTOR.');
      let msgs; try { msgs = await lib.mailThread(fetchFn, {}, box.email, a.thread); } catch (e) { throw new ToolError('The conversation could not be read: ' + clip(e.message, 160)); }
      if (!msgs.length) throw new ToolError('This conversation was not found in the mailbox.');
      return { mailbox: box.email, subject: msgs[0].subject, letters: msgs.slice(-25).map((m) => ({ from: m.me ? 'us' : clip(m.from, 120), to: clip(m.to, 200), at: new Date(m.at).toISOString().slice(0, 16) + 'Z', text: clip(m.text, 3500) })) };
    },
    async set_company_profile(me, a) {
      const co = await one('params', a.company_id); need(co && co.zone === 'company' && sees(me, co) ? co : null, 'The company');
      if (!me.superAdmin && !(co.managers || []).includes(me.uid)) throw new ToolError('Only the super admin or an admin of this company changes its profile.');
      const map = { about: ['about', 3000], clients: ['clients', 2000], when_to_use: ['whenUse', 2000], not_doing: ['notDo', 2000], proof: ['proof', 3000] }, up = {}, done = [];
      Object.keys(map).forEach((k) => { if (a[k] != null) { up['s.' + map[k][0]] = txt(a[k], map[k][1]); done.push(k); } });
      let sender = null;
      if (a.mailbox != null || a.sender_name != null) {
        const want = txt(a.mailbox, 200).toLowerCase(), name = txt(a.sender_name, 80).replace(/[\r\n<>"]/g, ' ').trim(); if (!want || !name) throw new ToolError('To set a sender name pass both mailbox and sender_name.');
        const boxes = (((co.s || {}).mailboxes) || []).map((b) => Object.assign({}, b)), box = boxes.find((b) => String(b.email).toLowerCase() === want);
        if (!box) throw new ToolError(`${a.mailbox} is not a mailbox of ${co.name}. Its mailboxes: ${boxes.map((b) => b.email).join(', ') || 'none'}.`);
        if (box.owner !== me.uid && !me.superAdmin) throw new ToolError(`${box.email} belongs to another person.`);
        sender = { mailbox: box.email, sender_name: name, was: box.name || '(empty: the name from the Google profile was used)' }; box.name = name; up['s.mailboxes'] = boxes; done.push('sender_name');
      }
      if (!done.length) throw new ToolError('Nothing to save: pass at least one of about, clients, when_to_use, not_doing, proof, or mailbox with sender_name.');
      await col('params').doc(co.id).update(up);
      return drop({ saved: done, company: co.name, sender, note: sender ? 'The name applies to campaigns started from now on; chains already running keep the old one.' : '' });
    },
    async create_parameter(me, a) {
      const kind = a.kind, name = txt(a.name, 120); if (!SETTINGS[kind]) throw new ToolError('kind must be direction, audience or topic. Companies are created by the person in VECTOR.'); if (!name) throw new ToolError('Give the parameter a name.');
      const same = (await mine(me, 'params')).find((p) => p.zone === kind && String(p.name).trim().toLowerCase() === name.toLowerCase() && (kind !== 'direction' || p.company === a.company_id));
      if (same) return { already_exists: true, id: same.id, kind, name: same.name, note: 'A parameter with this name exists. Use it, or pick another name if you really need a second one.' };
      const it = { id: nid(kind[0]), zone: kind, name, img: '', s: settingsFor(kind, a.settings), ord: Date.now(), by: me.uid };
      if (kind === 'direction') { const co = await one('params', a.company_id); need(co && co.zone === 'company' && sees(me, co) ? co : null, 'The company (company_id) of the direction'); it.company = co.id; it.s = Object.assign({ desc: '', criteria: [] }, it.s); it.acl = (co.acl || [me.uid]).slice(); } else it.acl = ['*'];
      await col('params').doc(it.id).set(it);
      return { created: true, id: it.id, kind, name, settings: drop(it.s) };
    },
    async update_parameter(me, a) {
      const p = await one('params', a.id); need(sees(me, p) ? p : null, 'The parameter');
      if (!SETTINGS[p.zone]) throw new ToolError('Company settings (mailboxes, signatures, access) are changed by the person in VECTOR, not here.');
      if (!me.superAdmin && p.by !== me.uid && p.zone !== 'audience' && p.zone !== 'topic') throw new ToolError('This parameter belongs to another person.');
      const patch = settingsFor(p.zone, a.settings), up = {}; Object.keys(patch).forEach((k) => { up['s.' + k] = patch[k]; });
      const name = a.name != null ? txt(a.name, 120) : ''; if (a.name != null && !name) throw new ToolError('The name cannot be empty.'); if (name) up.name = name;
      if (!Object.keys(up).length) throw new ToolError('Nothing to change: pass a name or settings.');
      await col('params').doc(p.id).update(up);
      const n = await usedBy(p.zone, p.id);
      return { changed: Object.keys(patch).concat(name ? ['name'] : []), id: p.id, kind: p.zone, used_by_vectors: n, note: n > 1 ? `This ${p.zone} is used by ${n} vectors: the change applies to all of them.` : '' };
    },
    async create_vector(me, a) {
      const ids = { company: a.company_id, direction: a.direction_id, audience: a.audience_id, topic: a.topic_id }, ps = {};
      for (const z of Object.keys(ids)) { const p = await one('params', ids[z]); ps[z] = need(p && p.zone === z && sees(me, p) ? p : null, `The ${z}`); }
      if (ps.direction.company !== ps.company.id) throw new ToolError(`The direction "${ps.direction.name}" belongs to another company. Pick a direction of "${ps.company.name}" or create one for it.`);
      const names = { company: ps.company.name, direction: ps.direction.name, audience: ps.audience.name, topic: ps.topic.name };
      const same = (await mine(me, 'vectors')).find((v) => Object.keys(ids).every((z) => v[z] === ids[z]));
      if (same) return Object.assign({ already_exists: true, id: same.id }, names);
      const v = Object.assign({ id: nid('v'), at: Date.now(), owner: me.uid, members: [], acl: [me.uid], ord: Date.now() }, ids);
      await col('vectors').doc(v.id).set(v);
      return Object.assign({ created: true, id: v.id }, names);
    },
    async create_card(me, a) {
      const v = await one('vectors', a.vector_id); need(sees(me, v) ? v : null, 'The vector');
      const type = a.type, title = txt(a.title, 200); if (!['contact', 'company', 'campaign', 'task'].includes(type)) throw new ToolError('type must be contact, company, campaign or task.'); if (!title) throw new ToolError('Give the card a title.');
      const f = cardFields(type, a.fields);
      if (f.email && !okMail(f.email)) throw new ToolError(`"${f.email}" does not look like an email address.`);
      if (f.email && isBanned(await banned(me.uid), f.email)) throw new ToolError(`${f.email} is on the forbidden list: this contact must not be written to.`);
      if (type === 'contact' && f.email) { const twin = (await col('cards').where('vid', '==', v.id).get()).docs.map((x) => Object.assign({ id: x.id }, x.data())).find((c) => c.type === 'contact' && String((c.f || {}).email || '').toLowerCase() === f.email);
        if (twin) return { already_exists: true, id: twin.id, title: twin.title, stage: twin.stage, note: 'A contact with this email is already on this board. Use that card.' }; }
      const date = txt(a.next_date, 10); if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolError('next_date must look like 2026-12-01.');
      const c = { id: nid('k'), at: Date.now(), vid: v.id, owner: me.uid, acl: (v.acl || [me.uid]).slice(), ord: Date.now(), type, stage: STAGE.includes(a.stage) ? a.stage : 'new', title, vec: { company: v.company, direction: v.direction, audience: v.audience, topic: v.topic }, f,
        next: { text: txt(a.next_step, 300), date }, awaiting: false, auto: { follow: false, reply: false, notify: true, draft: true }, notes: txt(a.notes, 6000), photo: '', blocked: '', okEmail: '', via: 'claude' };
      await col('cards').doc(c.id).set(c);
      return Object.assign({ created: true }, cardBrief(c), { vector_id: v.id, next: type === 'campaign' ? 'Now add recipients (add_recipients), write the letters (set_letters) and choose the mailbox (update_card).' : type === 'contact' ? 'To write to this person, save the letter with set_letters and choose the mailbox with update_card.' : '' });
    },
    async update_card(me, a) {
      const c = await cardOf(me, a.card_id), up = {}, done = [];
      if (a.title != null) { const t = txt(a.title, 200); if (!t) throw new ToolError('The title cannot be empty.'); up.title = t; done.push('title'); }
      if (a.stage != null) { if (!STAGE.includes(a.stage)) throw new ToolError('Unknown stage.'); up.stage = a.stage; done.push('stage'); }
      if (a.fields) { const f = cardFields(c.type, a.fields); if (f.email && !okMail(f.email)) throw new ToolError(`"${f.email}" does not look like an email address.`); if (f.email && isBanned(await banned(me.uid), f.email)) throw new ToolError(`${f.email} is on the forbidden list.`);
        Object.keys(f).forEach((k) => { up['f.' + k] = f[k]; }); if (Object.keys(f).length) done.push('fields'); }
      if (a.notes != null) { up.notes = txt(a.notes, 6000); done.push('notes'); }
      if (a.add_note) { up.notes = txt(((a.notes != null ? up.notes : c.notes) || '') + '\n' + txt(a.add_note, 2000), 6000); done.push('note added'); }
      if (a.next_step != null || a.next_date != null) { const date = a.next_date != null ? txt(a.next_date, 10) : (c.next || {}).date || ''; if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolError('next_date must look like 2026-12-01.');
        up.next = { text: a.next_step != null ? txt(a.next_step, 300) : (c.next || {}).text || '', date }; done.push('next step'); }
      if (a.reply_waiting != null) { up.awaiting = !!a.reply_waiting; done.push('reply waiting'); }
      if (a.opt_out_line !== undefined) { if (!['campaign', 'contact'].includes(c.type)) throw new ToolError('Only campaigns and contacts have an opt-out line.'); up.optOut = a.opt_out_line === null ? null : !!a.opt_out_line; done.push('opt-out line'); }
      if (a.criterion) { if (c.type !== 'campaign') throw new ToolError('Only a campaign has its own criterion.'); up.check = { crit: txt(a.criterion.text, 1000), tag: txt(a.criterion.tag, 60), terms: txt(a.criterion.terms, 600) }; done.push('criterion'); }
      if (a.mailbox != null) { if (!['campaign', 'contact'].includes(c.type)) throw new ToolError('Only campaigns and contacts send letters.');
        const v = await one('vectors', c.vid), co = v ? await one('params', v.company) : null, boxes = (((co || {}).s || {}).mailboxes) || [], want = txt(a.mailbox, 200).toLowerCase(), box = boxes.find((b) => String(b.email).toLowerCase() === want);
        if (!box) throw new ToolError(`${a.mailbox} is not a mailbox of ${(co || {}).name || 'this company'}. Its mailboxes: ${boxes.map((b) => b.email).join(', ') || 'none yet — the person adds them in the company settings'}.`);
        if (!me.superAdmin && box.owner !== me.uid) throw new ToolError(`${box.email} belongs to another person.`);
        const seq = Object.assign({ from: '', steps: [], alt: {}, lang: 'en', split: 'even' }, c.seq || {}); seq.from = box.email; up.seq = Object.assign(seq, up.seq || {}); done.push('mailbox'); }
      if (!done.length) throw new ToolError('Nothing to change.');
      await col('cards').doc(c.id).update(up);
      return { changed: done, card: cardBrief(Object.assign({}, c, up, up.next ? { next: up.next } : {})) };
    },
    async add_recipients(me, a) {
      const c = await cardOf(me, a.card_id); if (c.type !== 'campaign') throw new ToolError('People are added to a campaign card. For one person create a contact card.');
      const people = Array.isArray(a.people) ? a.people.slice(0, 200) : []; if (!people.length) throw new ToolError('Give at least one person with an email.');
      const have = (await col('leads').where('cid', '==', c.id).get()).docs.map((x) => x.data()), seen = {}; have.forEach((l) => { seen[String((l.f || {}).email || '').toLowerCase()] = 1; });
      if (have.length + people.length > 3000) throw new ToolError('A campaign list holds up to 3000 people.');
      const ban = await banned(me.uid), res = { added: 0, no_email: [], repeated: [], forbidden: [] }, batch = db().batch(); let ord = have.reduce((m, l) => Math.max(m, l.ord || 0), 0) + 1;
      people.forEach((p, i) => { const f = leadFields(p), who = f.email || [f.firstName, f.lastName].filter(Boolean).join(' ') || `person ${i + 1}`;
        if (!f.email || !okMail(f.email)) { res.no_email.push(who); return; } if (seen[f.email]) { res.repeated.push(f.email); return; } if (isBanned(ban, f.email)) { res.forbidden.push(f.email); return; }
        seen[f.email] = 1; const dom = f.email.split('@')[1]; if (!f.website && lib.companyDomain(f.email)) f.website = 'https://' + dom;
        const id = nid('L'); batch.set(col('leads').doc(id), Object.assign({ id, cid: c.id, vid: c.vid, company: (c.vec || {}).company || '', owner: me.uid, acl: (c.acl || [me.uid]).slice(), ord: ord++, f, blocked: '', okEmail: '', via: 'claude' }, ['A', 'B', 'C'].includes(p.variant) ? { var: p.variant } : {})); res.added++; });
      if (res.added) await batch.commit();
      return drop({ added: res.added, total_now: have.length + res.added, skipped_no_valid_email: res.no_email, skipped_already_in_list: res.repeated, skipped_forbidden: res.forbidden });
    },
    async update_recipient(me, a) {
      const c = await cardOf(me, a.card_id), l = await one('leads', a.recipient_id); need(l && l.cid === c.id ? l : null, 'The person in this campaign');
      const up = {}, f = leadFields(a.fields); delete f.email; Object.keys(f).forEach((k) => { up['f.' + k] = f[k]; }); if (a.left_out != null) up.off = !!a.left_out;
      if (a.variant != null) { if (!['A', 'B', 'C', 'auto'].includes(a.variant)) throw new ToolError('variant must be A, B, C or auto.'); const have = ['A'].concat(['B', 'C'].filter((k) => ((c.seq || {}).alt || {})[k])); if (a.variant !== 'auto' && !have.includes(a.variant)) throw new ToolError(`This campaign has no variant ${a.variant} yet (it has ${have.join(', ')}). Save its letters with set_letters first.`); up.var = a.variant === 'auto' ? '' : a.variant; }
      if (!Object.keys(up).length) throw new ToolError('Nothing to change.');
      await col('leads').doc(l.id).update(up);
      return { changed: true, recipient: leadBrief(Object.assign({}, l, { off: a.left_out != null ? !!a.left_out : l.off, var: up.var != null ? up.var : l.var, f: Object.assign({}, l.f, f) })) };
    },
    async set_letters(me, a) {
      const c = await cardOf(me, a.card_id); if (!['campaign', 'contact'].includes(c.type)) throw new ToolError('Letters belong to a campaign or a contact card.');
      const seq = Object.assign({ from: '', steps: [], alt: {}, lang: 'en', split: 'even' }, JSON.parse(JSON.stringify(c.seq || {}))); seq.alt = seq.alt || {};
      if (a.language) seq.lang = txt(a.language, 5).toLowerCase(); if (a.interval_unit) seq.unit = { days: 'd', hours: 'h', minutes: 'm' }[a.interval_unit] || seq.unit || 'd';
      const warn = [], vars = Array.isArray(a.variants) ? a.variants : [];
      if (c.type === 'contact' && vars.some((x) => x.variant !== 'A')) throw new ToolError('A contact card has one chain of letters: use variant A.');
      vars.forEach((x) => { const k = x.variant, letters = (x.letters || []).slice(0, 6); if (!['A', 'B', 'C'].includes(k) || !letters.length) throw new ToolError('Each variant needs a letter A, B or C and at least one letter.');
        const old = (k === 'A' ? seq.steps : (seq.alt[k] || {}).steps) || [], steps = letters.map((l, i) => stepOf(l, old[i])).sort((p, q) => p.day - q.day); steps[0].day = 0;
        steps.forEach((st, i) => { const label = k + (i + 1); if (!st.body) throw new ToolError(`Letter ${label} has no text.`); if (i === 0 && !st.subject) throw new ToolError(`The first letter ${label} needs a subject.`); if (i && st.day <= steps[i - 1].day) throw new ToolError(`Letter ${label} must go later than ${k}${i}: give it a larger day.`);
          const used = ((st.subject + ' ' + st.body).match(/\{\{\s*\w+\s*\}\}/g) || []).map((m) => m.replace(/[{}\s]/g, '')), bad = used.filter((u) => !LETTER_FIELDS.includes(u));
          if (bad.length) throw new ToolError(`Letter ${label} uses unknown fields: ${bad.map((b) => '{{' + b + '}}').join(', ')}. Allowed: ${LETTER_FIELDS.map((b) => '{{' + b + '}}').join(' ')}.`);
          if (c.type === 'contact' && used.filter((u) => u !== 'signature').length) warn.push(`Letter ${label} goes to one person: write the name and company in plain words instead of {{fields}}.`); });
        if (k === 'A') { seq.steps = steps; if (x.for_job_titles != null) seq.whoA = txt(x.for_job_titles, 300); } else seq.alt[k] = { steps, who: x.for_job_titles != null ? txt(x.for_job_titles, 300) : (seq.alt[k] || {}).who || '' }; });
      (a.remove_variants || []).forEach((k) => { if (k === 'B' || k === 'C') delete seq.alt[k]; });
      seq.split = ['A', 'B', 'C'].some((k) => (k === 'A' ? seq.whoA : (seq.alt[k] || {}).who)) ? 'role' : 'even';
      await col('cards').doc(c.id).update({ seq });
      const run = await col('runs').doc(c.id).get(); if (run.exists) warn.push('This campaign has already started: people already in the run keep the letters as they were; the new text applies to people added later.');
      return drop({ saved: true, letters: lettersOf(Object.assign({}, c, { seq })), notes: warn });
    },
  });

  // ---------- Launching: only with the person's go-ahead ----------
  // The same server functions the program's own buttons call, with the same checks. Their coded refusals become sentences Claude can act on.
  const WHY = [[/RULE_PRIMARY\s*(\S*)/, (m) => `The sending rules say cold letters go only from a secondary mailbox, and ${m[1]} is the main one. The person picks another mailbox or changes the rule in VECTOR.`],
    [/EMPTY_FIELDS\s*(.*)/, (m) => 'Some people have an empty field the letters use: ' + m[1].split(',').map((x) => { const [l, f, n] = x.split('|'); return `letter ${l} needs {{${f}}}, empty for ${n}`; }).join('; ') + '. Fill the field in, remove it from the letter, or put the phrase in [[double brackets]].'],
    [/MAIL_ACCESS\s*(.*)/, (m) => 'The server cannot send from this mailbox: the Google Workspace admin has to allow it. ' + m[1]], [/MAIL_READ\s*(.*)/, (m) => 'The server cannot read this mailbox, so replies would stay unseen. The Google Workspace admin has to add the gmail.readonly scope. ' + m[1]],
    [/NOBODY_LEFT\s*(\d+)\|(\d+)/, (m) => `Nobody is left to write to: ${m[1]} on the forbidden list, ${m[2]} repeated addresses.`], [/CONVO_VARS/, () => 'The answer still contains {{fields}} or [[brackets]]. Write the text as the person should read it.'],
    [/CONVO_OWNER\s*(\S*)/, (m) => `This conversation runs from ${m[1]}, a mailbox of another person.`], [/NO_CONVO/, () => 'There is no conversation with this contact yet: nothing to answer. To write first, save a letter with set_letters and launch it.']];
  const via = async (fn, me, data) => { try { return await fn({ auth: { uid: me.uid, token: { email: me.email } }, data }); } catch (e) { const msg = String(e.message || e), hit = WHY.find((w) => w[0].test(msg)); throw new ToolError(hit ? hit[1](msg.match(hit[0])) : msg.slice(0, 400)); } };
  const goAhead = (a) => { const g = txt(a.go_ahead, 200); if (g.length < 2) throw new ToolError('Not launched: the person has not given a go-ahead. Show them what will go out and ask.'); return g; };
  const zoneOf = async (me) => { const u = await one('users', me.uid); if (u && u.tz) return u.tz; const r = await col('runs').where('owner', '==', me.uid).get(); return (r.docs.map((x) => x.data()).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0] || {}).tz || 'UTC'; };

  Object.assign(handlers, {
    async launch_check(me, a) {
      const c = await cardOf(me, a.card_id), solo = c.type === 'contact'; if (c.type !== 'campaign' && !solo) throw new ToolError('Only a campaign or a contact card sends letters.');
      const v = await one('vectors', c.vid), co = v ? await one('params', v.company) : null, boxes = ((((co || {}).s || {}).mailboxes) || []).filter((b) => me.superAdmin || b.owner === me.uid), seq = c.seq || {}, problems = [];
      const box = boxes.find((b) => b.email === seq.from) || boxes.find((b) => b.primary) || boxes[0];
      if (!box) problems.push('No mailbox: the person adds one in the company settings, then choose it with update_card.'); else if (!seq.from) problems.push(`No mailbox chosen on the card; ${box.email} would be used. Set it with update_card to be explicit.`);
      const sh = await col('workspace').doc('shared').get(), rules = Object.assign({ coldSecondary: true }, (sh.exists && sh.data().send) || {});
      if (box && rules.coldSecondary && box.primary) problems.push(`The sending rules allow cold letters only from a secondary mailbox, and ${box.email} is the main one.`);
      const letters = lettersOf(solo ? Object.assign({}, c, { seq: Object.assign({}, seq, { alt: {} }) }) : c), all = letters.variants.reduce((x, y) => x.concat(y.letters), []);
      if (!all.length) problems.push('There are no letters yet (set_letters).'); const draft = all.filter((l) => !l.approved).map((l) => l.letter); if (draft.length) problems.push(`Not approved by the person yet: ${draft.join(', ')}. Show the text, get their approval, then save it with approved: true.`);
      let people = [];
      if (solo) { const e = String((c.f || {}).email || '').trim(); if (!e) problems.push('The contact has no email address.'); else people = [{ id: c.id, f: Object.assign({ firstName: String(c.title || '').split(/\s+/)[0] }, c.f) }]; }
      else people = (await col('leads').where('cid', '==', c.id).get()).docs.map((x) => x.data()).filter((l) => String((l.f || {}).email || '').trim() && !l.off && !l.blocked);
      const ban = await banned(me.uid), forbidden = people.filter((l) => isBanned(ban, String(l.f.email).toLowerCase())); people = people.filter((l) => !forbidden.includes(l));
      const sent = {}; (await col('sends').where('cid', '==', c.id).get()).docs.forEach((x) => { if (x.data().status !== 'queued') sent[String(x.data().to).toLowerCase()] = 1; });
      const fresh = people.filter((l) => !sent[String(l.f.email).toLowerCase()]); if (!fresh.length) problems.push(people.length ? 'Everyone on the list has already been written to.' : 'There is nobody to write to.');
      const holes = {}; all.forEach((l) => fresh.forEach((p) => lib.emptyVars(l.subject + '\n' + l.body, Object.assign({ myName: 'x', project: (p.chk || {}).proj || '' }, p.f)).forEach((f) => { const k = `${l.letter} needs {{${f}}}`; holes[k] = (holes[k] || 0) + 1; })));
      Object.keys(holes).forEach((k) => problems.push(`${k}, empty for ${holes[k]} of ${fresh.length}. Fill it in, drop it, or put the phrase in [[double brackets]].`));
      const run = await col('runs').doc(c.id).get(), notes = [], shares = {};
      // The rules as they are set right now, and when the letters would actually leave under them.
      const R = Object.assign({ start: 3, step: 2, cap: 10, gapMin: 10, gapMax: 20, from: 9, to: 17, workdays: true, perDomain: 2, bounce: 3, coldSecondary: true }, (sh.exists && sh.data().send) || {});
      const ms = box ? ((await col('mailstate').doc(box.email).get()).data() || {}) : {}, tzMe = await zoneOf(me), today = lib.localParts(Date.now(), tzMe).day, usedToday = ms.day === today ? ms.newToday || 0 : 0;
      const plan = []; let left = fresh.length, t = Date.now();
      for (let i = 0; i < 40 && left > 0; i++, t += 86400000) { const p = lib.localParts(t, tzMe); if (R.workdays && p.weekend) continue; const room = Math.max(0, lib.capFor(R, ms.firstAt, t) - (i === 0 ? usedToday : 0)), n = Math.min(left, room); if (n) plan.push({ date: p.day, first_letters: n }); left -= n; }
      const firstGap = all.filter((l) => l.letter.endsWith('2')).map((l) => l.day)[0], unit = { d: 'days', h: 'hours', m: 'minutes' }[seq.unit || 'd'];
      const ruleText = { new_letters_a_day_from_this_mailbox: `${lib.capFor(R, ms.firstAt, Date.now())} today (starts at ${R.start}, +${R.step} every week, never more than ${R.cap}); ${usedToday} already used today`, pause_between_letters: `${R.gapMin}-${R.gapMax} minutes`,
        hours: `${R.from}:00-${R.to}:00 in each recipient's own time zone${R.workdays ? ', Monday to Friday' : ', every day'}`, per_client_company_a_day: +R.perDomain || 'no limit', pause_when_bounced_share_over: R.bounce ? R.bounce + ' %' : 'off', cold_letters_only_from_secondary_mailbox: !!R.coldSecondary,
        timing: 'always human-like: each mailbox starts its day 5-90 minutes after the opening hour (differently every day), spreads the day\'s new letters over the working day, now and then writes one fewer than the limit, sends at uneven minutes and seconds, and reminders go at an uneven time of their day',
        who_changes_them: 'the person, in VECTOR (Sending rules)' };
      const forecast = fresh.length ? { first_letters_by_day: plan, all_first_letters_out_by: plan.length ? plan[plan.length - 1].date : '', reminders: firstGap ? `each person gets the reminder ${firstGap} ${unit} after their first letter, unless they replied; reminders do not count against the daily limit of new letters` : 'no reminders in this chain',
        may_take_longer_because: 'other campaigns from the same mailbox share the daily limit; a letter waits for the recipient\'s working hours; the per-company limit can move colleagues to the next day', dates_are_in: tzMe } : null;
      if (!solo && letters.variants.length > 1) { const pick = lib.assignVariants(c.seq || {}, people); fresh.forEach((l) => { shares[pick[l.id]] = (shares[pick[l.id]] || 0) + 1; }); }
      const sender = box ? box.name || me.name : '', lang = String(seq.lang || 'en').toLowerCase();
      if (sender && /[^\u0000-\u024f]/.test(sender) && !['uk', 'ru', 'bg', 'sr', 'kk', 'be'].includes(lang)) notes.push(`The sender name of ${box.email} is "${sender}" — not in Latin letters, while the letters are in "${lang}". Recipients read it next to the address. Offer the person a Latin spelling and save it with set_company_profile (company_id, mailbox, sender_name).`);
      return Object.assign({ ready: !problems.length }, drop({ problems, notes, variant_shares: shares, card: c.title, kind: solo ? 'one contact' : 'campaign', mailbox: box ? box.email : '', sender_name: box ? box.name || me.name : '', would_write_to: fresh.length, already_written_to: people.length - fresh.length, skipped_forbidden: forbidden.length,
        people: fresh.slice(0, 15).map((l) => drop({ name: [l.f.firstName, l.f.lastName].filter(Boolean).join(' '), email: l.f.email, company: l.f.company })), opt_out_line: (c.optOut == null ? !!((v || {}).opt || {}).on : !!c.optOut) ? ((v || {}).opt || {}).text || 'on' : 'off',
        letters, already_running: run.exists && run.data().status === 'active', paused: run.exists && run.data().paused ? 'paused: too many bounced letters; a start continues it' : '', sending_rules: ruleText, forecast }));
    },
    async start_sending(me, a) {
      const words = goAhead(a), c = await cardOf(me, a.card_id); await calls.countUse(me.uid, 'bl', 20);
      const r = await via(calls.start, me, { cardId: c.id, tz: await zoneOf(me) });
      if (c.stage === 'new') await col('cards').doc(c.id).update({ stage: 'contacted', runAt: Date.now() }).catch(() => {});
      return drop({ launched: true, go_ahead: words, queued_now: r.queued, already_in_the_run: r.already, continued_after_pause: !!r.resumed, retried_after_errors: r.revived, skipped_forbidden: r.forbidden, skipped_repeated: r.dupes, mailbox: r.from,
        what_happens_next: 'The server sends by the sending rules, not all at once. Use campaign_status to follow it. Replies appear as cards in the Replied column.' });
    },
    async stop_sending(me, a) { const c = await cardOf(me, a.card_id), r = await via(calls.stop, me, { cardId: c.id }); return { stopped: true, chains_stopped: r.stopped || 0, note: 'Letters already sent stay sent; replies to them are still noticed.' }; },
    async send_answer(me, a) {
      const words = goAhead(a), c = await cardOf(me, a.card_id), body = txt(a.body, 8000); if (!body) throw new ToolError('The answer is empty.');
      const r = await via(calls.convo, me, { cardId: c.id, op: 'send', body });
      return { sent: true, go_ahead: words, at: new Date(r.at).toISOString().slice(0, 16) + 'Z', note: 'The card no longer waits for an answer. When the person writes again, it will.' };
    },
  });

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
      case 'tools/list': console.log('bridge tools/list answered with ' + TOOLS.length + ' tools');
        return ok(Object.assign({ tools: TOOLS.map(publicTool) }, modern ? { ttlMs: 300000, cacheScope: 'private' } : {}));
      case 'tools/call': {
        const tool = TOOLS.find((t) => t.name === p.name), run = tool && handlers[tool.name];
        if (!run) return rpcErr(id, -32602, `Unknown tool: ${p.name}`);
        const started = Date.now();
        try {
          const out = await run(me, p.arguments || {});
          col('bridgelog').add({ uid: me.uid, tool: tool.name, write: !tool.read, at: started, ms: Date.now() - started, ok: true, card: (p.arguments || {}).card_id || (out && out.id) || '', what: tool.read ? '' : clip(JSON.stringify(p.arguments || {}), 600) }).catch(() => {});
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
    // One line per request in the server log (never the key itself): enough to see what Claude asked and why it was refused.
    const seen = () => console.log('bridge request ' + JSON.stringify({ method: req.method, path: req.path, rpc: Array.isArray(req.body) ? 'batch' : (req.body || {}).method || '', tool: ((req.body || {}).params || {}).name || '', auth: req.headers.authorization ? String(req.headers.authorization).split(' ')[0].slice(0, 12) + ' …(' + String(req.headers.authorization).length + ' chars)' : 'none',
      headers: Object.keys(req.headers || {}).filter((k) => !/^(x-forwarded|x-cloud|x-appengine|forwarded|traceparent|via|function-execution|x-client-data)/.test(k)).join(','), version: req.headers['mcp-protocol-version'] || '', agent: String(req.headers['user-agent'] || '').slice(0, 60), refused: req.why || '' }));
    if (req.method !== 'POST') { seen(); res.set('Allow', 'POST').status(405).json(rpcErr(null, -32000, 'This address accepts MCP requests by POST only.')); return; }
    let me; try { me = await whoIs(req); } catch (e) { console.error('bridge auth failed', e.message); res.status(503).json(rpcErr(null, -32000, 'VECTOR is not available right now.')); return; }
    seen();
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
