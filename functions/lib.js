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
  if (card.checkQ) out += line('Every recipient was checked: their company website mentions', card.checkQ)
    + '- {{project}} holds the name of a matching project found on their website and is empty for some recipients. Put any phrase that uses it inside double square brackets, for example: [[ I saw your work on {{project}}. ]] The bracketed phrase is dropped when the name is missing, so the letter must read well without it.\n';
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
    { model: model || MODELS.claude, max_tokens: 2000, system: p.system, messages: [{ role: 'user', content: p.user }] });
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function askGpt(fetchFn, key, p) {
  const auth = { authorization: 'Bearer ' + key };
  try {
    const d = await post(fetchFn, 'https://api.openai.com/v1/responses', auth, { model: MODELS.gpt, instructions: p.system, input: p.user, max_output_tokens: 4000 });
    if (typeof d.output_text === 'string' && d.output_text) return d.output_text;
    return (d.output || []).flatMap((o) => o.content || []).map((c) => c.text || '').join('');
  } catch (e) {
    if (e.status !== 404) throw e;
    const d = await post(fetchFn, 'https://api.openai.com/v1/chat/completions', auth,
      { model: MODELS.gpt, messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }] });
    return d.choices[0].message.content;
  }
}

// op: draft | polish | review. engine: claude | gpt (who does this particular step).
async function run(fetchFn, keys, ctx) {
  const p = ctx.op === 'review' ? reviewPrompt(ctx) : ctx.op === 'polish' ? polishPrompt(ctx) : draftPrompt(ctx);
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

// Returns { s: 'yes' | 'no' | 'nosite' | 'err', ev, proj, url }.
async function research(fetchFn, key, { website, company, question }) {
  const terms = termsOf(question), start = safeUrl(website || '');
  if (!start) return { s: 'nosite', ev: '', proj: '', url: '' };
  if (!terms.length) return { s: 'err', ev: 'No search words', proj: '', url: '' };
  let home; try { home = await getPage(fetchFn, start); } catch (e) { return { s: 'err', ev: 'Website did not open: ' + e.message, proj: '', url: start.href }; }
  const found = [], look = (pg) => snippets(pageText(pg.html), terms, 4).forEach((x) => found.push({ url: pg.url.href, text: x }));
  look(home);
  const links = pageLinks(home.html, home.url, terms).slice(0, 4);
  const pages = await Promise.all(links.map((l) => getPage(fetchFn, new URL(l)).catch(() => null)));
  pages.filter(Boolean).forEach(look);
  if (!found.length) return { s: 'no', ev: '', proj: '', url: home.url.href };
  const p = {
    system: 'You check whether a company\'s own website shows that the company itself has done a certain kind of work. You answer strictly from the excerpts given. A menu item or a generic list of industries counts as weak but valid evidence; a news item about someone else does not.',
    user: `Company: ${clean(company, 200)}\nWe are looking for: ${clean(question, 300)}\n\nExcerpts from the website:\n` + found.slice(0, 10).map((f, i) => `[${i + 1}] ${f.url}\n${f.text}`).join('\n\n').slice(0, 9000)
      + '\n\nReply with JSON only: {"fit": true or false, "evidence": "one short sentence in English saying what the site shows", "project": "the name of one specific matching project of this company, or an empty string if no project is named", "source": number of the excerpt you relied on}',
  };
  const o = parseJson(await askClaude(fetchFn, key, p, MODELS.fast));
  const src = found[Math.max(0, Math.min(found.length - 1, (+o.source || 1) - 1))];
  return { s: o.fit === true ? 'yes' : 'no', ev: clean(o.evidence, 300), proj: o.fit === true ? clean(o.project, 120) : '', url: src.url };
}

module.exports = { MODELS, LIMITS, brief, draftPrompt, polishPrompt, reviewPrompt, parseJson, run, research, safeUrl, pageText, pageLinks, snippets, termsOf };
