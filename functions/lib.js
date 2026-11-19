// Everything here is plain logic with no Firebase in it, so it can be tested on its own.

// Which model does what. Change a name here and deploy again to switch models.
const MODELS = { claude: 'claude-sonnet-5-5', gpt: 'gpt-6.1-sol', fast: 'claude-haiku-5-5' };
const LIMITS = { perUserPerDay: 150, researchPerUserPerDay: 2500, first: 120, follow: 60 };

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+\n/g, '\n').trim().slice(0, max || 2000);
const line = (label, v) => (clean(v) ? `- ${label}: ${clean(v)}\n` : '');
const TONES = {
  direct: 'direct, straight to the point', friendly: 'warm, person to person', expert: 'shows knowledge of their trade',
  formal: 'polite and reserved', brief: 'very short, three or four sentences', curious: 'opens with a question about their situation',
};

// What the AI is told about the vector: only facts the team has written down.
function brief(ctx) {
  const { company = {}, direction = {}, audience = {}, topic = {}, card = {} } = ctx;
  const s = (p) => p.s || {};
  let out = 'SENDER COMPANY\n' + line('Name', company.name) + line('Website', s(company).website) + line('About', s(company).desc);
  out += '\nSERVICE\n' + line('Name', direction.name) + line('About', s(direction).desc) + line('Good fit when', s(direction).criteria);
  out += '\nAUDIENCE\n' + line('Name', audience.name) + line('Job titles', s(audience).titles) + line('Seniority', (s(audience).seniority || []).join(', '))
    + line('Regions', s(audience).regions) + line('Their pains', s(audience).pains) + line('Notes', s(audience).notes);
  out += '\nTOPIC AND BRIEF\n' + line('Topic', topic.name) + line('Hook', s(topic).hook) + line('What we offer', s(topic).offer)
    + line('Tone', (s(topic).tones || []).map((x) => TONES[x] || x).join('; ')) + line('What we ask for at the end', s(topic).cta)
    + line('Proof', s(topic).proof) + line('Never write', s(topic).avoid) + line('Sample of the style we like', s(topic).sample) + line('Keywords', s(topic).keywords);
  out += '\nCAMPAIGN\n' + line('Title', card.title) + line('Notes', card.notes);
  if (card.type === 'contact') out += line('This letter goes to one person', [card.title, card.jobTitle, card.company].filter(Boolean).join(', '));
  if (card.who) out += line('This variant is for job titles containing', card.who);
  if (card.checkQ) out += line('Every recipient was checked and fits this criterion', card.checkQ)
    + '- {{project}} holds the name of a matching project of their company and is empty for some recipients. Put any phrase that uses it inside double square brackets, for example: [[ I saw your work on {{project}}. ]] The bracketed phrase is dropped when the name is missing, so the letter must read well without it.\n';
  const docs = (ctx.docs || []).filter((d) => clean(d.url)).slice(0, 8);
  if (docs.length) out += '\nMATERIALS FROM OUR LIBRARY (you may give one of these links when it supports the point; copy the address exactly)\n'
    + docs.map((d) => `- ${clean(d.title, 200)}: ${clean(d.url, 500)}\n`).join('');
  return out;
}

const RULES = `Rules for the letter:
- Plain text only: no markdown, no bullet lists, no emoji, no exclamation marks. At most one link, and only an address that appears in the brief or in the library materials.
- Use only facts from the brief. Never invent clients, numbers, awards or meetings that are not there.
- Keep placeholders such as {{firstName}} and {{company}} exactly as written; use {{firstName}} in the greeting.
- Do not add a signature or a sign-off name: the signature is appended automatically.
- One clear ask at the end, the one from the brief if it is given.
- No spam wording ("guarantee", "free", "act now", "limited offer") and no flattery.
- Write in English.`;

const JSON_LETTER = 'Reply with JSON only, no other text: {"subject": "...", "body": "..."}';

function draftPrompt(ctx) {
  const follow = ctx.step > 0;
  const system = `You write short B2B outreach letters that a busy executive would actually answer. You write as a person, not as a marketing department.\n\n${RULES}`;
  let user = brief(ctx) + '\n';
  if (follow) {
    user += `TASK\nThe client has not replied. Write reminder number ${ctx.step} in the same thread, as a continuation of the first letter below. `
      + `At most ${LIMITS.follow} words, two or three sentences, a new angle rather than a repeat, and one easy step towards a short call. `
      + 'Leave "subject" empty: the reminder goes out as a reply in the same thread.\n\n'
      + `FIRST LETTER\nSubject: ${clean(ctx.first && ctx.first.subject, 300)}\n${clean(ctx.first && ctx.first.body, 4000)}\n\n`;
  } else {
    user += `TASK\nWrite the first letter of this campaign. At most ${LIMITS.first} words in the body. Subject: three to six words, lower-key, no clickbait.\n\n`;
  }
  return { system, user: user + JSON_LETTER };
}

function polishPrompt(ctx) {
  const system = `You are an editor of B2B outreach letters. The author wrote the letter by hand; keep the author's meaning, structure and voice. Fix grammar, cut filler, make it clearer and shorter where possible. Do not add new claims.\n\n${RULES}`;
  const user = brief(ctx) + `\nLETTER TO POLISH\nSubject: ${clean(ctx.letter.subject, 300)}\n${clean(ctx.letter.body, 6000)}\n\n`
    + (ctx.step > 0 ? 'This is a reminder in the same thread; an empty subject is fine.\n' : '') + JSON_LETTER;
  return { system, user };
}

function revisePrompt(ctx) {
  const system = `You rewrite a B2B outreach letter according to the author's comment. Change what the comment asks for and keep the rest as close to the current text as possible.\n\n${RULES}`;
  const user = brief(ctx) + `\nCURRENT LETTER\nSubject: ${clean(ctx.letter.subject, 300)}\n${clean(ctx.letter.body, 6000)}\n\nAUTHOR'S COMMENT (may be in Ukrainian)\n${clean(ctx.comment, 1500)}\n\n`
    + (ctx.step > 0 ? 'This is a reminder in the same thread; keep the subject empty.\n' : '') + JSON_LETTER;
  return { system, user };
}

function reviewPrompt(ctx) {
  const lang = ctx.ui === 'uk' ? 'Ukrainian' : 'English';
  const system = `You are a strict second reader of B2B outreach letters written by another AI. You look for what would make the letter fail: claims that are not in the brief, spam wording, vagueness, more than one ask, a wrong tone, broken placeholders, excess length (first letter up to ${LIMITS.first} words, reminders up to ${LIMITS.follow}), grammar slips.\n\n${RULES}`;
  const user = brief(ctx) + `\nLETTER TO CHECK (${ctx.step > 0 ? 'reminder number ' + ctx.step + ', an empty subject is correct' : 'first letter'})\nSubject: ${clean(ctx.letter.subject, 300)}\n${clean(ctx.letter.body, 6000)}\n\n`
    + `Reply with JSON only, no other text: {"ok": true or false, "issues": ["..."], "subject": "...", "body": "..."}\n`
    + `"ok" is true only if the letter can be sent as it is. "issues": up to five short remarks written in ${lang}; an empty list if there are none. `
    + '"subject" and "body": your corrected version of the letter in English, or the original text if nothing needs to change.';
  return { system, user };
}

// Models sometimes wrap JSON in text or a code fence; take the first complete object.
function parseJson(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The AI returned no JSON');
  return JSON.parse(s.slice(a, b + 1));
}
const letterOf = (o) => ({ subject: clean(o.subject, 300), body: clean(o.body, 6000) });

async function post(fetchFn, url, headers, body) {
  const r = await fetchFn(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) { const e = new Error(`${new URL(url).hostname} answered ${r.status}: ${text.slice(0, 300)}`); e.status = r.status; throw e; }
  return JSON.parse(text);
}

async function askClaude(fetchFn, key, p, model) {
  const d = await post(fetchFn, 'https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    Object.assign({ model: model || MODELS.claude, max_tokens: 2000, system: p.system, messages: [{ role: 'user', content: p.user }] }, p.search ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: p.search }] } : {}));
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function askGpt(fetchFn, key, p) {
  const auth = { authorization: 'Bearer ' + key };
  try {
    const d = await post(fetchFn, 'https://api.openai.com/v1/responses', auth, Object.assign({ model: MODELS.gpt, instructions: p.system, input: p.user, max_output_tokens: 4000 }, p.search ? { tools: [{ type: 'web_search' }] } : {}));
    if (typeof d.output_text === 'string' && d.output_text) return d.output_text;
    return (d.output || []).flatMap((o) => o.content || []).map((c) => c.text || '').join('');
  } catch (e) {
    if (e.status !== 404 || p.search) throw e;
    const d = await post(fetchFn, 'https://api.openai.com/v1/chat/completions', auth,
      { model: MODELS.gpt, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }] });
    return d.choices[0].message.content;
  }
}

// op: draft | polish | review. engine: claude | gpt (who does this particular step).
async function run(fetchFn, keys, ctx) {
  const p = ctx.op === 'review' ? reviewPrompt(ctx) : ctx.op === 'polish' ? polishPrompt(ctx) : ctx.op === 'revise' ? revisePrompt(ctx) : draftPrompt(ctx);
  const text = ctx.engine === 'gpt' ? await askGpt(fetchFn, keys.gpt, p) : await askClaude(fetchFn, keys.claude, p);
  const o = parseJson(text);
  if (ctx.op !== 'review') return Object.assign(letterOf(o), { engine: ctx.engine });
  return Object.assign(letterOf(o), { ok: o.ok === true, issues: (Array.isArray(o.issues) ? o.issues : []).slice(0, 5).map((x) => clean(x, 300)), engine: ctx.engine });
}

// ---------- Website check: does the company's own site show the kind of work we are looking for? ----------

// Only ordinary public web addresses: no local names, no bare IP addresses, no odd ports.
function safeUrl(raw, base) {
  let u; try { u = new URL(/^https?:\/\//i.test(String(raw).trim()) || base ? String(raw).trim() : 'https://' + String(raw).trim(), base); } catch (e) { return null; }
  const h = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || (u.port && !['80', '443'].includes(u.port))) return null;
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h) || h.endsWith('.goog') || h === 'metadata.google.internal') return null;
  u.hash = ''; return u;
}
const site = (u) => u.hostname.replace(/^www\./, '');

function pageText(html) {
  return String(html || '').replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;|&#39;/g, "'").replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Links on the same site, best candidates first: pages about projects and markets, and anything that mentions the search words.
function pageLinks(html, base, terms) {
  const out = {}, re = /<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(String(html || '')))) {
    const u = safeUrl(m[1], base.href); if (!u || site(u) !== site(base) || /\.(pdf|jpe?g|png|gif|zip|mp4|docx?|xlsx?)$/i.test(u.pathname)) continue;
    const label = (pageText(m[2]) + ' ' + u.pathname).toLowerCase(); let score = 0;
    if (/project|portfolio|our-work|work\b|case|experience/.test(label)) score += 3;
    if (/market|sector|industr|expertise|service|capabilit|solution/.test(label)) score += 2;
    terms.forEach((t) => { if (label.includes(t) || label.replace(/[-_/]/g, ' ').includes(t)) score += 6; });
    if (score && u.href !== base.href) out[u.href] = Math.max(out[u.href] || 0, score);
  }
  return Object.keys(out).sort((a, b) => out[b] - out[a]);
}

const termsOf = (q) => String(q || '').toLowerCase().split(/[,;\n]/).map((x) => x.trim()).filter((x) => x.length > 2).slice(0, 12);
function snippets(text, terms, max) {
  const low = text.toLowerCase(), out = [];
  terms.forEach((t) => { let i = low.indexOf(t), n = 0; while (i >= 0 && n < 3 && out.length < (max || 8)) { out.push(text.slice(Math.max(0, i - 220), i + t.length + 260).trim()); i = low.indexOf(t, i + t.length + 400); n++; } });
  return out;
}

async function getPage(fetchFn, url) {
  let u = url;
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetchFn(u.href, { redirect: 'manual', signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; VECTOR-research/0.1)', accept: 'text/html' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = safeUrl(r.headers.get('location'), u.href); if (!u) throw new Error('unsafe redirect'); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (!/html|text/i.test(r.headers.get('content-type') || 'text/html')) return { url: u, html: '' };
    return { url: u, html: (await r.text()).slice(0, 600000) };
  }
  throw new Error('too many redirects');
}

// Turns the topic brief into one checkable statement about a company, a tag and the words to look for.
async function criterion(fetchFn, key, ctx) {
  const p = {
    system: 'You prepare a filter for a list of companies before an outreach campaign. From the brief you derive the one fact that must be true of a company for the planned opening line to make sense.',
    user: brief(ctx) + '\nReply with JSON only: {"criterion": "one plain sentence in English, e.g. The company has built or is building data centers", '
      + '"tag": "two or three lowercase words joined by hyphens, e.g. data-center", "terms": ["up to ten lowercase words or phrases, with spelling variants, that would appear on a website of a company that fits"]}',
  };
  const o = parseJson(await askClaude(fetchFn, key, p, MODELS.fast));
  return { criterion: clean(o.criterion, 300), tag: clean(o.tag, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), terms: (Array.isArray(o.terms) ? o.terms : []).map((x) => clean(x, 40).toLowerCase()).filter(Boolean).slice(0, 10) };
}

// First pass: the company's own website. Returns yes with evidence, or null when the site does not settle it.
async function siteLook(fetchFn, key, start, company, crit, terms) {
  let home; try { home = await getPage(fetchFn, start); } catch (e) { return { open: false }; }
  const found = [], look = (pg) => snippets(pageText(pg.html), terms, 4).forEach((x) => found.push({ url: pg.url.href, text: x }));
  look(home);
  const pages = await Promise.all(pageLinks(home.html, home.url, terms).slice(0, 4).map((l) => getPage(fetchFn, new URL(l)).catch(() => null)));
  pages.filter(Boolean).forEach(look);
  if (!found.length) return { open: true };
  const p = {
    system: 'You check whether a company\'s own website shows that a statement about the company is true. You answer strictly from the excerpts given. A menu item or a list of markets the company serves counts as valid evidence; a news item about someone else does not.',
    user: `Company: ${clean(company, 200)}\nStatement to check: ${clean(crit, 300)}\n\nExcerpts from the website:\n` + found.slice(0, 10).map((f, i) => `[${i + 1}] ${f.url}\n${f.text}`).join('\n\n').slice(0, 9000)
      + '\n\nReply with JSON only: {"fit": true or false, "evidence": "one short sentence in English saying what the site shows", "project": "the name of one specific matching project of this company, or an empty string if no project is named", "source": number of the excerpt you relied on}',
  };
  const o = parseJson(await askClaude(fetchFn, key, p, MODELS.fast));
  if (o.fit !== true) return { open: true };
  return { open: true, hit: { ev: clean(o.evidence, 300), proj: clean(o.project, 120), url: found[Math.max(0, Math.min(found.length - 1, (+o.source || 1) - 1))].url } };
}

const searchPrompt = (company, website, crit) => ({
  search: 3,
  system: 'You verify one statement about one company by searching the web. Rely only on what you find: the company\'s own pages, news, project lists, trade press. Make sure the evidence is about this company and not another one with a similar name.',
  user: `Company: ${clean(company, 200)}${website ? ' (' + clean(website, 200) + ')' : ''}\nStatement to check: ${clean(crit, 300)}\n\n`
    + 'Finish with JSON only: {"fit": "yes" | "no" | "unsure", "evidence": "one short sentence in English", "project": "name of one specific matching project, or an empty string", "url": "address of the page with the evidence, or an empty string"}\n'
    + '"yes" needs a concrete source. "no" means you searched and found nothing pointing to it. "unsure" means hints without a clear source.',
});
const verdict = (text) => { const o = parseJson(text), f = String(o.fit).toLowerCase(); return { fit: f === 'yes' || f === 'true' ? 'yes' : f === 'no' || f === 'false' ? 'no' : 'unsure', ev: clean(o.evidence, 300), proj: clean(o.project, 120), url: /^https?:\/\//.test(o.url || '') ? clean(o.url, 400) : '' }; };

// Returns { s: 'yes' | 'no' | 'unsure', ev, proj, url, by }.
// The website decides when it can; otherwise Claude searches the web, and ChatGPT searches again before anyone is ruled out.
async function research(fetchFn, keys, { website, company, criterion: crit, terms }) {
  const start = safeUrl(website || ''), words = (terms || []).map((x) => String(x).toLowerCase().trim()).filter((x) => x.length > 2).slice(0, 12);
  if (!clean(crit)) return { s: 'unsure', ev: 'No criterion', proj: '', url: '', by: '' };
  if (!start && !clean(company)) return { s: 'unsure', ev: 'No website and no company name', proj: '', url: '', by: '' };
  let siteNote = 'no website';
  if (start && words.length) {
    const r = await siteLook(fetchFn, keys.claude, start, company, crit, words).catch(() => ({ open: false }));
    if (r.hit) return Object.assign({ s: 'yes', by: 'site' }, r.hit);
    siteNote = r.open ? 'nothing on the website' : 'the website did not open';
  }
  const p = searchPrompt(company, start ? start.hostname : '', crit);
  let a, b, errs = [];
  try { a = verdict(await askClaude(fetchFn, keys.claude, p, MODELS.fast)); } catch (e) { errs.push('Claude search: ' + e.message); }
  if (a && a.fit === 'yes') return { s: 'yes', ev: a.ev, proj: a.proj, url: a.url, by: 'claude' };
  try { b = verdict(await askGpt(fetchFn, keys.gpt, p)); } catch (e) { errs.push('ChatGPT search: ' + e.message); }
  if (a && b && a.fit === 'no' && b.fit === 'no') return { s: 'no', ev: 'Two independent searches found nothing; ' + siteNote + '.', proj: '', url: '', by: 'both' };
  const best = b && b.fit === 'yes' ? b : [a, b].find((x) => x && x.fit === 'unsure') || a || b;
  const why = b && b.fit === 'yes' ? 'ChatGPT found this, Claude did not: ' : errs.length ? errs.join('; ').slice(0, 200) + '. ' : 'Not clear: ';
  return { s: 'unsure', ev: (why + (best ? best.ev : '')).trim(), proj: best && best.fit === 'yes' ? best.proj : '', url: best ? best.url : '', by: b && b.fit === 'yes' ? 'gpt' : 'both' };
}

// ---------- Finding companies: web search for names and sites, then whatever contact addresses the sites show ----------
const EMAIL = /[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
function emailsOf(html, host) {
  const out = {}; (String(html || '').replace(/%40/g, '@').match(EMAIL) || []).forEach((e) => {
    e = e.toLowerCase().replace(/^u003e/, '');
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e) || /sentry|wixpress|example\.|noreply|no-reply|@2x/.test(e)) return;
    out[e] = (e.endsWith('@' + host) || e.endsWith('.' + host) ? 2 : 0) + (/^(info|contact|hello|office|sales|estimating|bids?)@/.test(e) ? 1 : 0);
  });
  return Object.keys(out).sort((x, y) => out[y] - out[x]).slice(0, 3);
}
async function siteEmails(fetchFn, website) {
  const start = safeUrl(website || ''); if (!start) return [];
  try {
    const home = await getPage(fetchFn, start), host = site(home.url);
    let found = emailsOf(home.html, host);
    if (!found.length) {
      const link = pageLinks(home.html, home.url, ['contact', 'about', 'team']).filter((l) => /contact|about|team/i.test(l))[0];
      if (link) found = emailsOf((await getPage(fetchFn, new URL(link))).html, host);
    }
    return found;
  } catch (e) { return []; }
}
async function find(fetchFn, keys, ctx) {
  const n = Math.max(1, Math.min(15, +ctx.n || 10));
  const p = {
    search: 5,
    system: 'You look for real companies that match a description, using web search. You list only companies you actually found, each with its own official website. No directories, no invented names.',
    user: brief(ctx) + `\nREQUEST\n${clean(ctx.request, 800)}\n\nFind up to ${n} companies. Do not include: ${clean((ctx.skip || []).join(', '), 1500) || 'none'}.\n`
      + 'Finish with JSON only: {"companies": [{"company": "name", "website": "https://...", "country": "", "why": "one short sentence in English: why it matches"}]}',
  };
  const o = parseJson(await askClaude(fetchFn, keys.claude, p, MODELS.claude));
  const list = (Array.isArray(o.companies) ? o.companies : []).filter((c) => c && clean(c.company) && safeUrl(c.website || '')).slice(0, n);
  const mails = await Promise.all(list.map((c) => siteEmails(fetchFn, safeUrl(c.website).origin)));
  return { companies: list.map((c, i) => ({ company: clean(c.company, 120), website: safeUrl(c.website).origin, country: clean(c.country, 60), why: clean(c.why, 240), emails: mails[i] })) };
}

// ---------- Mail: sending through Gmail on behalf of a Workspace mailbox ----------
const MAILER = 'vector-mailer@vector-sales-co-pilot.iam.gserviceaccount.com';
const b64url = (x) => Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mimeWord = (x) => (/^[\x20-\x7e]*$/.test(x) ? x : '=?UTF-8?B?' + Buffer.from(x).toString('base64') + '?=');
// A plain-text letter in the form Gmail accepts.
function rawMail({ from, to, subject, body }) {
  const text = Buffer.from(String(body || '').replace(/\r?\n/g, '\r\n')).toString('base64').replace(/(.{76})/g, '$1\r\n');
  return b64url([`From: ${from}`, `To: ${to}`, `Subject: ${mimeWord(String(subject || ''))}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', text].join('\r\n'));
}
// The server has no key of the mailer account. It asks Google to sign a short-lived request in the mailer's name
// (allowed by the Token Creator role), and Google Workspace accepts it because of the domain-wide delegation.
async function mailToken(fetchFn, mailbox, scope) {
  const meta = await fetchFn('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  if (!meta.ok) throw new Error('The server could not identify itself to Google');
  const own = (await meta.json()).access_token, now = Math.floor(Date.now() / 1000);
  const signed = await post(fetchFn, `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${MAILER}:signJwt`, { authorization: 'Bearer ' + own },
    { payload: JSON.stringify({ iss: MAILER, sub: mailbox, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 }) });
  const r = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(signed.signedJwt) });
  const text = await r.text();
  if (!r.ok) throw new Error('Google Workspace refused access to ' + mailbox + ': ' + text.slice(0, 240));
  return JSON.parse(text).access_token;
}
async function sendMail(fetchFn, mail) {
  const token = await mailToken(fetchFn, mail.from, 'https://www.googleapis.com/auth/gmail.send');
  const d = await post(fetchFn, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { authorization: 'Bearer ' + token }, { raw: rawMail(mail) });
  return { id: d.id, threadId: d.threadId };
}

module.exports = { rawMail, sendMail, MAILER, MODELS, LIMITS, brief, draftPrompt, polishPrompt, reviewPrompt, revisePrompt, parseJson, run, research, criterion, find, emailsOf, safeUrl, pageText, pageLinks, snippets, termsOf };
