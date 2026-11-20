// VECTOR (Sales-co-pilot) 0.1: interface on demo data, saved in the browser.
// No sign-in, mail, Sheets or AI yet: those arrive in later stages (see docs/SPEC.md).
(function () {
  const KEY = 'sales-co-pilot-v2', PKEY = 'vector-prefs-v1';
  // With Firebase loaded the program is real: sign-in and shared data. Without it (the preview) it runs on demo data.
  const CLOUD = !!(window.firebase && window.FIREBASE_CONFIG);
  const PREFS = ['lang', 'view', 'active', 'draft', 'widgets', 'guideSeen', 'show'];
  const au = { status: CLOUD ? 'loading' : 'in', uid: 'me', role: 'admin', super: !CLOUD, ownerUid: '', users: [], guards: {}, err: '' };
  let S = load();
  if (!S.send) S.send = defaultSend();
  let ui = { open: null, edit: null, q: '', ftype: 'all', fdue: false, zone: 'company', dbtab: 'library', delArm: false, adding: null, fresh: null, popped: null, menu: null, legendEdit: false, fcolor: '', ctab: 'details', lq: '', imp: null, prev: -1, checkLeft: 0, cal: 0, ai: !S.guideSeen, aiView: 'home', aiLog: [] };

  function load() {
    if (CLOUD) { const s = emptyState(); try { Object.assign(s, JSON.parse(localStorage.getItem(PKEY)) || {}); } catch (e) {} return s; }
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 2) { s.legend = s.legend || defaultLegend(); s.user = s.user || defaultUser(); s.widgets = s.widgets || WIDGETS.slice(); s.gdocs = s.gdocs || []; s.leads = s.leads || []; s.taken = s.taken || []; return s; } } catch (e) {}
    return demoState();
  }
  function save() {
    if (CLOUD) { try { const p = {}; PREFS.forEach((k) => { p[k] = S[k]; }); localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {} normalize(); Cloud.schedule(); return; }
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  const t = (k) => (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const today = () => new Date().toISOString().slice(0, 10);
  const stageColor = (s) => (STAGES.find((x) => x[0] === s) || STAGES[0])[1];
  const stageIdx = (s) => STAGES.findIndex((x) => x[0] === s);
  const item = (zone, id) => S.zones[zone].find((x) => x.id === id);
  const closed = (c) => c.stage === 'signed' || c.stage === 'lost' || !!c.done;
  // Everything the operator sees in widgets and in AI answers is limited to their own vectors.
  // "Show" filter: only mine, everything, or one person (admin). The admin starts on "only mine", operators on "everything".
  const showMode = () => S.show || (CLOUD && au.role === 'admin' ? 'mine' : 'all');
  const showUid = () => { const m = showMode(); return m === 'all' ? null : m === 'mine' ? au.uid : m; };
  const myVectors = () => { const u = showUid(); return u ? S.vectors.filter((v) => v.owner === u) : S.vectors; };
  // A parameter belongs to someone if they created it, were given the company, or use it in one of their vectors.
  function relevant(z, it) {
    const u = showUid(); if (!u || !CLOUD || S.draft[z] === it.id) return true;
    if (z === 'company' && it.access && it.access[u]) return true;
    return it.by === u || S.vectors.some((v) => v.owner === u && v[z] === it.id);
  }
  const myCards = () => { const vs = myVectors(); return S.cards.filter((c) => vs.some((v) => c.vid === v.id)); };
  const userName = (id) => { const u = au.users.find((x) => x.id === id); return u ? u.name || u.email : id === au.uid ? t('you') : '—'; };
  const ord = (a, b) => (a.ord || 0) - (b.ord || 0);
  const cardSub = (c) => (c.type === 'contact' ? [c.f.jobTitle, c.f.company].filter(Boolean).join(' · ') : c.next.text || '');
  const isDue = (c) => c.next && c.next.date && c.next.date <= today() && !closed(c);
  const initials = (s) => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const activeVector = () => S.vectors.find((v) => v.id === S.active);
  const inVector = (c, v) => c.vid === v.id;
  const tally = (cs) => ({ reply: cs.filter((c) => c.awaiting && !closed(c)).length, due: cs.filter(isDue).length });
  // A mailbox belongs to the operator who added it; operators see and use only their own, the admin sees all.
  const mineMb = (m) => (m.owner || '') === au.uid || (!CLOUD);
  // The signature of a mailbox, with its opt-out line and company details when those are switched on.
  const sigOf = (co, email) => (((co && co.s.mailboxes) || []).find((x) => x.email === email) || {}).sig || '';
  // The opt-out line is a setting of the vector (the default for its cards); a campaign card may switch it for itself.
  const OPT_TEXT = 'Not relevant? Reply "no" and I will not write again.';
  const optOf = (v) => (v && v.opt) || { on: false, text: '' };
  const optOn = (c, v) => (c && c.optOut != null ? !!c.optOut : !!optOf(v).on);
  const tailOf = (c, v, co, email) => [sigOf(co, email), optOn(c, v) && optOf(v).text].filter(Boolean).join('\n\n');
  const myMailboxes = (co) => ((co && co.s.mailboxes) || []).filter(mineMb);
  const primaryMailbox = (co) => { const m = myMailboxes(co); return (m.find((x) => x.primary) || m[0] || {}).email || ''; };
  const admin = () => au.role === 'admin';
  // Three levels: the super admin (first person who signed in) sees and manages everything; an admin manages
  // only the companies assigned to them; an operator works inside the access they were given.
  const sup = () => !CLOUD || au.super;
  const managersOf = (co) => (co && co.managers) || [];
  const manages = (co) => sup() || (admin() && managersOf(co).includes(au.uid));
  const uniq = (a) => a.filter((x, i) => x && a.indexOf(x) === i);
  const roleName = (u) => (u.id === au.ownerUid ? t('acc_super') : t('acc_' + u.role));
  const takenId = (company, email) => (company + '__' + String(email).trim().toLowerCase()).replace(/[\/\s]/g, '_');
  // Why a contact is closed for this operator: on the admin's forbidden list, or already in another manager's work.
  function blockedWhy(c) {
    if (c.type && c.type !== 'contact') return '';
    const email = String(c.f.email || '').trim().toLowerCase(); if (!email) return '';
    const hit = (au.guards[au.uid] || []).some((g) => { g = String(g).trim().toLowerCase().replace(/^@/, ''); return g && (email === g || email.endsWith('@' + g)); });
    return hit ? 'admin' : c.blocked === 'taken' ? 'taken' : '';
  }
  // Keeps the access lists that the server checks in step with the settings people actually edit.
  function normalize() {
    // A list with the same people in another order is left as it is, and only someone who manages a company
    // rewrites its list: otherwise an operator's program would try to "fix" the order and the server would refuse the save.
    const keep = (old, next) => (old && old.length === next.length && next.every((x) => old.includes(x)) ? old : next);
    S.zones.company.forEach((co) => { if ((co.access || co.managers) && (!CLOUD || manages(co) || !co.acl)) co.acl = keep(co.acl, uniq(Object.keys(co.access || {}).concat(managersOf(co)))); });
    S.vectors.forEach((v) => { const co = item('company', v.company); if (co && (v.owner === au.uid || manages(co))) v.acl = keep(v.acl, uniq([v.owner].concat(v.members || [], managersOf(co)))); });
    S.zones.direction.forEach((d) => { const co = item('company', d.company); if (co && co.acl && (!CLOUD || manages(co) || !d.acl)) d.acl = keep(d.acl, co.acl.slice()); });
    ['audience', 'topic'].forEach((z) => S.zones[z].forEach((it) => { if (!it.acl) it.acl = ['*']; }));
    const aclFor = (c, type) => {
      const v = S.vectors.find((x) => x.id === c.vid), co = v && item('company', v.company); if (!v || !co) return c.acl || [];
      const a = (v.acl || [v.owner]).slice();
      if (type !== 'task' && co.access) Object.keys(co.access).forEach((u) => { if (co.access[u] === 'shared' && !a.includes(u)) a.push(u); });
      return a;
    };
    S.cards.forEach((c) => { c.acl = keep(c.acl, aclFor(c, c.type)); if (!c.owner) { const v = S.vectors.find((x) => x.id === c.vid); if (v) c.owner = v.owner; } });
    S.gdocs.forEach((g) => { g.acl = keep(g.acl, aclFor(g, 'doc')); });
    S.leads.forEach((l) => { l.acl = keep(l.acl, aclFor(l, 'lead')); });
    // One marker per contact email, so another manager's program can tell the contact is already in work without seeing it.
    const mine = {};
    S.cards.forEach((c) => { const e = String(c.f.email || '').trim().toLowerCase(); if (c.type === 'contact' && c.owner === au.uid && e && !blockedWhy(c) && c.okEmail === e && c.vec && c.vec.company) mine[takenId(c.vec.company, e)] = { id: takenId(c.vec.company, e), company: c.vec.company, email: e, owner: au.uid }; });
    S.leads.forEach((l) => { const e = l.f.email; if (l.owner === au.uid && e && !blockedWhy(l) && l.okEmail === e && l.company) mine[takenId(l.company, e)] = { id: takenId(l.company, e), company: l.company, email: e, owner: au.uid }; });
    S.taken = (S.taken || []).filter((x) => x.owner !== au.uid).concat(Object.keys(mine).map((k) => mine[k]));
  }
  const draftComplete = () => ZONES.every((z) => item(z, S.draft[z]));
  const sameVector = (d) => S.vectors.find((v) => ZONES.every((z) => v[z] === d[z]));

  function pic(zone, it, cls) {
    const inner = it && it.img ? `<img class="mono" src="${it.img}" alt="">`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[zone]}</svg>`;
    return `<span class="pimg ${cls || ''}">${inner}</span>`;
  }
  // Counters: full words on vector rows, bare numbers (with a tooltip) inside the narrow zones.
  function pills(n, short) {
    const one = (cls, v, label) => (v ? `<span class="${cls}" title="${v} ${label}">${short ? v : v + ' ' + label}</span>` : '');
    return one('c1', n.reply, t('toReply')) + one('c2', n.due, t('due'));
  }

  const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const legendOf = (id) => S.legend.find((l) => l.id === id);
  const mi = (act, label, extra, off) => `<button class="mi" data-act="${act}" ${off ? 'disabled' : ''}><span>${label}</span>${extra ? `<small>${extra}</small>` : ''}</button>`;

  // ---------- views ----------
  function top() {
    const tabs = ['vector', 'board', 'analytics', 'database'].map((v) =>
      `<button class="tab ${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}" ${v === 'board' && !activeVector() ? 'disabled' : ''}>${t(v)}</button>`).join('');
    const av = activeVector();
    const crumb = S.view === 'board' && av ? ZONES.map((z) => esc((item(z, av[z]) || {}).name || '—')).join(' › ') : '';
    const u = S.user, ava = u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials(u.name));
    const langX = `<b class="${S.lang === 'en' ? 'on' : ''}">EN</b> / <b class="${S.lang === 'uk' ? 'on' : ''}">UA</b>`;
    const later = (n) => `${t('stage')} ${n}`;
    return `<header class="top"><div class="brand" tabindex="0"><div class="logo"><svg class="mark" viewBox="0 0 30 22"><path d="M0 0h7l7 11-7 11H0l7-11z" opacity=".45"/><path d="M11 0h9l10 11-10 11h-9l8-11z"/></svg><span class="bn"><b>VECTOR</b><small>Sales-co-pilot</small></span><span class="car">▾</span></div>
        <div class="menu"><div class="mh">${t('appSettings')}</div>${mi('lang', t('setLanguage'), langX)}${mi('legendOpen', t('setColors'), '', !activeVector())}
        ${CLOUD ? mi('usersOpen', t('setUsers'), '', au.role !== 'admin') : mi('', t('setUsers'), later(2), 1)}${mi('sendOpen', t('setSend'))}${mi('', t('setAI'), later(4), 1)}${CLOUD ? '' : `<hr>${mi('reset', t('reset'))}`}<div class="ver">${t('version')} ${VERSION}</div></div></div>
      <nav>${tabs}</nav><div class="crumb" title="${crumb}">${crumb}</div>
      <div class="right"><button class="aibtn ${ui.ai ? 'on' : ''}" data-act="aiToggle">${svg(UI_ICONS.spark)}<span>${t('aiHelper')}</span></button><button class="userbtn" data-act="userMenu"><span class="un"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span><span class="ava">${ava}</span></button>
        ${ui.menu === 'user' ? `<div class="menu show"><div class="mh">${esc(u.email)}${CLOUD ? ' · ' + (au.super ? t('acc_super') : t('acc_' + au.role)) : ''}</div>${CLOUD ? '' : mi('editProfile', t('myProfile'))}${mi('lang', t('setLanguage'), langX)}<hr>${CLOUD ? mi('signOut', t('signOut')) : mi('', t('signOut'), later(2), 1)}</div>` : ''}</div></header>`;
  }

  function chevron(v, opts) {
    return ZONES.map((z, i) => {
      const it = item(z, v[z]);
      if (!it) return `<span class="seg empty" style="--i:${i}" title="${opts.draft ? t('tip_' + z) : ''}"><span class="sn">${i + 1} · ${t('zone_' + z)}</span></span>`;
      const act = opts.draft ? `data-act="unpick" data-zone="${z}" title="${esc(it.name)} — ${t('clear')}"` : `title="${esc(it.name)}"`;
      return `<span class="seg ${ui.popped === z && opts.draft ? 'pop' : ''}" style="--i:${i}" ${act}>${pic(z, it, 'sm')}<span class="sn">${esc(it.name)}</span></span>`;
    }).join('');
  }

  function vVector() {
    const rows = myVectors().map((v) => {
      const n = tally(S.cards.filter((c) => inVector(c, v)));
      return `<div class="vrow ${ui.fresh === v.id ? 'fresh' : ''}">
        <button class="chev" data-act="openVector" data-id="${v.id}">${chevron(v, {})}</button>
        <span class="cnt">${CLOUD && v.owner !== au.uid ? `<small class="ownr">${esc(userName(v.owner))}</small>` : ''}${pills(n)}</span>
        <button class="btn sm" data-act="openVector" data-id="${v.id}">${t('openBoard')}</button>
        <button class="dots" data-act="editVector" data-id="${v.id}" title="${t('edit')}">⋯</button></div>`;
    }).join('') || `<p class="sub pad">${t('noVectors')}</p>`;

    const zones = ZONES.map((z, i) => {
      const list = (z === 'direction' ? S.zones.direction.filter((d) => d.company === S.draft.company) : S.zones[z]).filter((it) => relevant(z, it));
      const items = list.map((it) => `<div class="pi ${S.draft[z] === it.id ? 'sel' : ''}" role="button" tabindex="0" data-act="pick" data-zone="${z}" data-id="${it.id}" title="${esc(it.name)}">
          ${pic(z, it)}<span class="pn">${esc(it.name)}</span><span class="cnt">${pills(tally(S.cards.filter((c) => c.vec[z] === it.id)), true)}</span>
          <button class="dots" data-act="editParam" data-zone="${z}" data-id="${it.id}" title="${t('edit')}">⋯</button></div>`).join('');
      const hint = z === 'direction' && !S.draft.company ? `<p class="sub pad">${t('pickCompanyFirst')}</p>` : '';
      const canAdd = z !== 'direction' || S.draft.company;
      const adding = !canAdd ? '' : ui.adding === z
        ? `<input class="in addin" data-add="${z}" placeholder="${t('addNew')}" autofocus>`
        : `<button class="add" data-act="addItem" data-zone="${z}">${t('add')}</button>`;
      return `<section class="zone"><div class="vh tip" tabindex="0">${i + 1} · ${t('zone_' + z)}<span class="q">?</span><span class="tt">${t('tip_' + z)}</span></div><div class="zlist">${items}${hint}${adding}</div></section>`;
    }).join('');

    const ready = draftComplete(), dup = ready && sameVector(S.draft);
    const seed = CLOUD && au.super && ZONES.every((z) => !S.zones[z].length) ? `<div class="hello seed"><b>${t('seedTitle')}</b><button class="btn sm" data-act="seed">${t('seedBtn')}</button></div>` : '';
    return `<main class="vscreen">
      <section class="vtop"><div class="vhead"><div><h1>${t('vectorsTitle')}</h1><p class="sub">${t('vectorsSub')}</p></div>
        ${CLOUD ? `<label class="showf"><span>${t('showLabel')}</span><select class="in" data-show><option value="mine" ${showMode() === 'mine' ? 'selected' : ''}>${t('showMine')}</option><option value="all" ${showMode() === 'all' ? 'selected' : ''}>${t('showAll')}</option>${
          au.role !== 'admin' ? '' : au.users.filter((u) => u.id !== au.uid && u.role !== 'pending').map((u) => `<option value="${u.id}" ${showMode() === u.id ? 'selected' : ''}>${esc(u.name || u.email)}</option>`).join('')}</select></label>` : ''}</div><div class="vlist">${rows}</div></section>
      <section class="vnew">${seed}<div class="builder"><div class="bl"><b>${t('newVectorTitle')}</b><span class="sub">${t('newVectorSub')}</span></div>
        <div class="chev draft ${ready ? 'ready' : ''}">${chevron(S.draft, { draft: true })}</div>
        <button class="btn" data-act="fixVector" ${ready && !dup ? '' : 'disabled'}>${dup ? t('vectorExists') : t('fixVector')}</button></div>
        <div class="zones">${zones}</div></section></main>`;
  }

  function cardHtml(c) {
    const badges = [], why = blockedWhy(c);
    if (why) badges.push(`<span class="blk">${t('blockedBadge')}</span>`);
    if (c.awaiting && !closed(c)) badges.push(`<span class="rep">${t('replyWaiting')}</span>`);
    if (c.next && c.next.date && !closed(c)) {
      const cls = c.next.date < today() ? 'overdue' : '';
      const label = c.next.date < today() ? t('overdue') : c.next.date === today() ? t('today') : c.next.date.slice(5);
      badges.push(`<span class="due ${cls}">${label}</span>`);
    }
    if (c.auto && (c.auto.follow || c.auto.reply)) badges.push(`<span class="ai">${t('autopilot')}</span>`);
    const sub = c.type === 'contact' ? [c.f.jobTitle, c.f.company].filter(Boolean).join(' · ')
      : c.type === 'company' ? [c.f.country, c.f.website].filter(Boolean).join(' · ')
      : c.type === 'campaign' ? (c.f.dailyCap ? `${c.f.dailyCap} / day` : '') : (c.next.text || '');
    const si = stageIdx(c.stage), prev = STAGES[si - 1], next = STAGES[si + 1];
    const mv = `<div class="mv">${prev ? `<button data-act="moveCard" data-id="${c.id}" data-d="-1">‹ ${t('st_' + prev[0])}</button>` : '<span></span>'}${next ? `<button data-act="moveCard" data-id="${c.id}" data-d="1">${t('st_' + next[0])} ›</button>` : ''}</div>`;
    const lg = legendOf(c.color);
    const av = c.type === 'contact' || c.type === 'company'
      ? `<span class="cav">${c.photo ? `<img src="${c.photo}" alt="">` : esc(initials(c.type === 'contact' ? c.title : c.title))}</span>` : '';
    const due = c.next && c.next.date;
    const tk = c.type !== 'task' ? '' : `<button class="tk ${c.done ? 'ok' : due && due < today() ? 'late' : due === today() ? 'now' : ''}" data-act="taskDone" data-id="${c.id}" title="${t('taskDone')}">${svg(c.done ? UI_ICONS.check : due ? UI_ICONS.clock : UI_ICONS.ring)}</button>`;
    return `<article class="card t-${c.type} ${c.done ? 'done' : ''}" draggable="true" data-card="${c.id}" data-act="open" data-id="${c.id}" style="border-left-color:${stageColor(c.stage)};${lg ? `--cc:${lg.color}` : ''}" ${lg ? `title="${esc(lg.label)}"` : ''}>
      <div class="ct"><span class="tyw"><span class="tyi">${svg(TYPE_ICONS[c.type])}</span><span class="ty">${t('type_' + c.type)}</span></span><span class="bd">${badges.join('')}</span></div>
      <div class="crow">${av}<div><div class="cn">${esc(c.title) || '—'}</div>${sub ? `<div class="cs">${esc(sub)}</div>` : ''}</div></div>${tk}${mv}</article>`;
  }

  function vBoard() {
    const av = activeVector();
    if (!av) { S.view = 'vector'; return vVector(); }
    const q = ui.q.trim().toLowerCase();
    const cards = S.cards.filter((c) => inVector(c, av))
      .filter((c) => ui.ftype === 'all' || c.type === ui.ftype).filter((c) => !ui.fdue || isDue(c)).filter((c) => !ui.fcolor || c.color === ui.fcolor)
      .filter((c) => !q || (c.title + ' ' + Object.values(c.f).join(' ')).toLowerCase().includes(q));
    const chips = ['all'].concat(TYPES).map((x) =>
      `<button class="chip ${ui.ftype === x ? 'on' : ''}" data-act="ftype" data-v="${x}">${x === 'all' ? '' : `<span class="tyi">${svg(TYPE_ICONS[x])}</span>`}${x === 'all' ? t('allTypes') : t('type_' + x)}</button>`).join('');
    const legend = ui.legendEdit
      ? S.legend.map((l) => `<span class="lge"><input type="color" value="${l.color}" data-lgcolor="${l.id}" title="${t('colour')}"><input class="in" data-lgname="${l.id}" value="${esc(l.label)}" placeholder="${t('labelName')}"><button class="link" data-act="lgRemove" data-id="${l.id}">×</button></span>`).join('')
        + `<button class="add inl" data-act="lgAdd">${t('addColour')}</button><button class="btn sm" data-act="legendDone">${t('doneLegend')}</button>`
      : S.legend.map((l) => `<button class="lg ${ui.fcolor === l.id ? 'on' : ''}" data-act="fcolor" data-id="${l.id}" title="${t('legendHint')}"><i style="background:${l.color}"></i>${esc(l.label)}</button>`).join('')
        + `<button class="btn ghost sm" data-act="legendEdit">${t('editLegend')}</button>`;
    const cols = STAGES.map(([s, color]) => {
      const cs = cards.filter((c) => c.stage === s);
      const adding = ui.adding === 'st:' + s
        ? `<input class="in addin" data-addcard="${s}" placeholder="${t('cardTitle')}" autofocus>`
        : `<button class="add" data-act="addCard" data-stage="${s}">${t('add')}</button>`;
      return `<section class="col" data-stage="${s}"><div class="ch"><i style="background:${color}"></i>${t('st_' + s)}<span>${cs.length}</span></div>
        ${cs.map(cardHtml).join('')}${adding}</section>`;
    }).join('');
    return `<div class="tools"><input class="in search" data-search placeholder="${t('search')}" value="${esc(ui.q)}">${chips}
      <button class="chip ${ui.fdue ? 'on' : ''}" data-act="fdue">${t('dueToday')}</button>
      <button class="btn sm" data-act="addCard" data-stage="new">${t('newCard')}</button></div>
      <div class="bcrumb">${ZONES.map((z) => esc((item(z, av[z]) || {}).name || '—')).join(' › ')}</div>
      <div class="stagebar">${STAGES.map(([st, color]) => `<button data-act="gotoStage" data-stage="${st}"><i style="background:${color}"></i>${t('st_' + st)} <b>${cards.filter((c) => c.stage === st).length}</b></button>`).join('')}</div>
      <main class="board">${cols}</main>
      <div class="legend"><span class="ty">${t('colours')}</span>${legend}</div>`;
  }

  function field(c, key, label, area) {
    const v = esc(c.f[key] || '');
    return `<label class="fl"><span>${label}</span>${area
      ? `<textarea class="in" data-f="${key}" rows="3">${v}</textarea>` : `<input class="in" data-f="${key}" value="${v}">`}</label>`;
  }
  function tog(c, key, label) {
    return `<button class="tog" data-act="auto" data-k="${key}"><span class="sw ${c.auto[key] ? 'on' : ''}"><i></i></span><span>${label}</span></button>`;
  }
  // ---------- recipients of a campaign ----------
  const leadName = (l) => [l.f.firstName, l.f.lastName].filter(Boolean).join(' ') || l.f.email;
  const hostOf = (w) => String(w || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  const coKey = (l) => hostOf(l.f.website) || (l.f.company ? 'name:' + l.f.company.trim().toLowerCase() : '');
  // The criterion lives in the topic of the vector (the default for its campaigns); a campaign card may keep its own version.
  const termList = (x) => (Array.isArray(x) ? x : String(x || '').split(',')).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  const tagOf = (x) => String(x || '').trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9а-яіїєґ]+/gi, '-').replace(/^-|-$/g, '');
  const topicOf = (c) => { const v = c && S.vectors.find((x) => x.id === c.vid); return v ? item('topic', v.topic) : null; };
  function checkCfg(c) {
    if (c && c.check && String(c.check.crit || '').trim()) return { crit: c.check.crit, tag: tagOf(c.check.tag), terms: termList(c.check.terms), own: true };
    const tp = topicOf(c), s = (tp && tp.s) || {};
    return { crit: s.crit || '', tag: tagOf(s.tag), terms: termList(s.terms), own: false };
  }
  const critOf = (c) => checkCfg(c).crit;
  const chkOf = (l, crit) => (l.chk && crit && l.chk.c === crit ? l.chk : null);
  const sendable = (l) => !!l.f.email && !blockedWhy(l) && !l.off;
  // The criterion comes from the topic brief: AI proposes it once, the user confirms or edits it.
  // AI proposes the criterion from the topic brief. From a campaign it is saved in the card; from the topic settings, in the topic.
  function critSuggest(cid) {
    const c = S.cards.find((x) => x.id === cid); if (!c || !CLOUD || ui.critBusy) return;
    ui.critBusy = true; render();
    Cloud.criterion({ vid: c.vid }).then((r) => { ui.critBusy = false; const c2 = S.cards.find((x) => x.id === cid); if (c2) c2.check = { crit: r.criterion || '', tag: r.tag || '', terms: r.terms || [] }; commit(); })
      .catch((e) => { ui.critBusy = false; ui.err = String(e && e.message || e); ui.errAi = true; render(); });
  }
  const setTag = (l, tag, on) => { if (!tag) return; const s = (l.tags || []).filter((x) => x !== tag); if (on) s.push(tag); l.tags = s; };
  // The check: one request per company, three at a time. What is already known about a company from another campaign is reused.
  function runCheck(cid) {
    const c = S.cards.find((x) => x.id === cid), k = checkCfg(c), crit = k.crit || ''; if (!c || !crit.trim() || ui.site) return;
    const mine = () => S.leads.filter((l) => l.cid === cid), queue = [], seen = {};
    const known = {}; S.leads.forEach((l) => { const x = chkOf(l, crit); if (x && l.cid !== cid && (x.s === 'yes' || x.s === 'no')) known[coKey(l)] = x; });
    const put = (key, r) => mine().forEach((l) => { if (coKey(l) === key) { l.chk = { s: r.s, ev: r.ev || '', proj: r.proj || '', url: r.url || '', by: r.by || '', c: crit }; setTag(l, k.tag, r.s === 'yes'); } });
    mine().forEach((l) => { const key = coKey(l); if (!key || seen[key]) return; const x = chkOf(l, crit); if (x && !/failed|search:/i.test(x.ev || '')) return; seen[key] = 1;
      if (known[key]) put(key, known[key]); else queue.push({ key, website: l.f.website || '', company: l.f.company || '' }); });
    ui.site = { total: queue.length, done: 0, stop: false, live: Math.min(3, queue.length) || 1 }; commit();
    const next = () => {
      const job = queue.shift(); if (!job || ui.site.stop) { if (!--ui.site.live) { ui.site = null; commit(); } return; }
      Cloud.research({ vid: c.vid, website: job.website, company: job.company, criterion: crit, terms: k.terms || [] })
        .catch((e) => { const m = String(e && e.message || e); if (/limit|access|approved|Sign in/i.test(m)) { ui.site.stop = true; ui.err = m; ui.errAi = true; } return { s: 'unsure', ev: 'The check failed: ' + m }; })
        .then((r) => { put(job.key, r); ui.site.done++; commit(); next(); });
    };
    for (let i = 0, n = ui.site.live; i < n; i++) next();
  }
  // Asks the server for one letter. The answer may arrive after the data was refreshed from the cloud, so the letter is found again by its ids.
  // Turns the commonest server errors into plain words with the next step.
  function aiWhy(e) {
    const m = String(e && e.message ? e.message : e);
    if (/401|authentication|invalid x-api-key|Incorrect API key/i.test(m)) return t(/anthropic/i.test(m) ? 'errKeyClaude' : 'errKeyGpt') + ' ' + t('errKeyFix');
    if (/credit balance|insufficient_quota|billing|402/i.test(m)) return t(/anthropic/i.test(m) ? 'errMoneyClaude' : 'errMoneyGpt');
    if (/not_found_error|model.*(not exist|not found)|404/i.test(m)) return t('errModel') + ' ' + m;
    if (/429|rate.?limit|overloaded|529/i.test(m)) return t('errBusy');
    if (/NOT_FOUND|not-found|internal$/i.test(m) && !/api\./.test(m)) return t('errDeploy') + ' ' + m;
    return m;
  }
  function aiRun(cid, k, i, op, eng, comment) {
    const c = S.cards.find((x) => x.id === cid), q = seqOf(c), list = k === 'A' ? q.steps : q.alt[k].steps, st = list[i], f = c.f || {};
    if (ui.busy || !CLOUD) return Promise.reject(new Error('busy'));
    if (op === 'revise' && !String(comment).trim()) { ui.err = t('cmtEmpty'); ui.errAi = true; render(); return Promise.reject(new Error('empty')); }
    ui.busy = `${i}|${op}|${eng}`; render();
    const find = () => { const c2 = S.cards.find((x) => x.id === cid), q2 = c2 && c2.seq; if (!q2) return null; return (k === 'A' ? q2.steps : (q2.alt[k] || {}).steps || []).find((x) => x.id === st.id); };
    return Cloud.ai({ op, engine: eng, comment, vid: c.vid, step: i, ui: S.lang, letter: { subject: st.subject, body: st.body }, first: { subject: list[0].subject, body: list[0].body },
      card: { title: c.title, notes: c.notes || '', type: c.type, jobTitle: f.jobTitle || '', company: f.company || '', who: varsOf(q).length > 1 && q.split === 'role' ? whoOf(q, k) : '',
        checkQ: S.leads.some((l) => l.cid === cid && (chkOf(l, critOf(c)) || {}).s === 'yes') ? critOf(c) : '' } })
      .then((r) => {
        ui.busy = ''; const s2 = find(); if (!s2) { render(); return; }
        if (r.need) { s2.need = r.need; commit(); return; }
        s2.need = null;
        if (op === 'review') { s2.review = { ok: !!r.ok, issues: r.issues || [], subject: r.subject || '', body: r.body || '', by: r.engine }; if (r.ok && s2.status === 'draft') s2.status = 'reviewed'; }
        else { s2.subject = i > 0 ? (op === 'draft' ? '' : s2.subject) : r.subject || s2.subject; s2.body = r.body; s2.status = 'draft'; s2.by = r.engine; s2.review = null; }
        commit();
      }, (e) => { ui.busy = ''; ui.err = aiWhy(e); ui.errAi = true; render(); throw e; });
  }
  function vCriterion(c, all) {
    const k = checkCfg(c), crit = k.crit || '';
    const n = { yes: 0, unsure: 0, no: 0 }; let todo = 0, off = 0;
    all.forEach((l) => { if (l.off) off++; const x = chkOf(l, crit); if (x) n[x.s] = (n[x.s] || 0) + 1; else todo++; });
    const noIn = all.filter((l) => !l.off && (chkOf(l, crit) || {}).s === 'no').length;
    const cos = Object.keys(all.reduce((m, l) => { if (!chkOf(l, crit) && coKey(l)) m[coKey(l)] = 1; return m; }, {})).length;
    const chip = (v, label, cnt) => `<button class="chip ${ui.rf === v ? 'on' : ''}" data-act="rf" data-v="${v}">${label} · ${cnt}</button>`;
    return `<div class="sitebox"><div class="bh">${t('critTitle')}</div><p class="sub small">${t('critNote')}</p><p class="sub small">${t(k.own ? 'critOwn' : crit ? 'critFromTopic' : 'critNone')}</p>
      ${ui.critBusy ? `<p class="sub">${t('critBusy')}</p>` : `<label class="fl"><span>${t('critLabel')}</span><input class="in" data-crit="crit" value="${esc(crit)}" placeholder="${t('critPh')}" ${ui.site ? 'disabled' : ''}></label>
      <div class="row2"><label class="fl"><span>${t('critTag')}</span><input class="in" data-crit="tag" value="${esc(k.tag || '')}" placeholder="data-center" ${ui.site ? 'disabled' : ''}></label>
        <label class="fl"><span>${t('critTerms')}</span><input class="in" data-crit="terms" value="${esc((k.terms || []).join(', '))}" ${ui.site ? 'disabled' : ''}></label></div>
      <div class="acts tight">${ui.site ? `<span class="sub small">${t('siteRun')} ${ui.site.done} / ${ui.site.total}</span><button class="btn ghost sm" data-act="siteStop">${t('stop')}</button>`
        : `<button class="btn sm" data-act="siteGo" ${CLOUD && crit.trim() && all.length ? '' : 'disabled'} title="${CLOUD ? '' : t('aiDemoOnly')}">${t(todo ? 'siteGo' : 'siteAgain')}${todo ? ` (${todo})` : ''}</button>
          <button class="link small" data-act="critAi" ${CLOUD ? '' : 'disabled'} title="${CLOUD ? '' : t('aiDemoOnly')}">${t('critAi')}</button>${k.own ? `<button class="link small" data-act="critAgain">${t('critAgain')}</button>` : ''}`}</div>
      ${todo && !ui.site ? `<p class="sub small">${t('critCost').replace('{n}', cos).replace('{usd}', Math.max(1, Math.ceil(cos * 0.05)))}</p>` : ''}`}
      ${all.length ? `<div class="vtabs rfs">${chip('all', t('all'), all.length)}${chip('yes', t('site_yes'), n.yes)}${chip('unsure', t('site_unsure'), n.unsure)}${chip('no', t('site_no'), n.no)}${todo ? chip('todo', t('site_todo'), todo) : ''}${off ? chip('off', t('siteOff'), off) : ''}</div>
        <div class="acts tight">${noIn && !ui.site ? `<button class="btn ghost sm" data-act="siteDrop">${t('siteDrop')} (${noIn})</button>` : ''}${off ? `<button class="link small" data-act="siteBack">${t('siteBack')}</button>` : ''}
          <span class="grow"></span><button class="btn sm" data-act="listOk">${t('listOk')} →</button></div>` : ''}</div>`;
  }
  const chkCell = (l, crit) => { const x = chkOf(l, crit); if (!x) return '';
    return `<span class="chk ${x.s}">${x.s === 'yes' ? '✓ ' + esc(x.proj || t('site_yes')) : t('site_' + x.s)}</span>${x.ev ? `<small class="ev" title="${esc(x.ev)}">${esc(x.ev)}</small>` : ''}${x.url ? ` <a class="link small" href="${esc(x.url)}" target="_blank" rel="noopener">${t('source')}</a>` : ''}`; };
  function vRecipients(c) {
    const all = S.leads.filter((l) => l.cid === c.id), q = ui.lq.trim().toLowerCase(), crit = critOf(c), rf = ui.rf || 'all';
    const list = all.filter((l) => !q || [leadName(l), l.f.company, l.f.email, l.f.jobTitle, (l.tags || []).join(' ')].join(' ').toLowerCase().includes(q))
      .filter((l) => rf === 'all' || (rf === 'off' ? l.off : rf === 'todo' ? !chkOf(l, crit) : (chkOf(l, crit) || {}).s === rf));
    // Which variant of the letters each person gets (shown when the campaign has more than one).
    const sq = seqOf(c), multi = varsOf(sq).length > 1, vmap = {}; if (multi) all.filter(sendable).forEach((l, n) => { vmap[l.id] = variantOf(sq, l, n); });
    const rows = list.slice(0, 200).map((l) => `<tr class="${l.off ? 'off' : ''}"><td>${esc(l.f.company || '')}</td><td>${esc([l.f.firstName, l.f.lastName].filter(Boolean).join(' ') || '—')}${l.f.jobTitle ? `<small class="ev">${esc(l.f.jobTitle)}</small>` : ''}</td>
      <td>${l.f.email ? esc(l.f.email) : `<input class="in mini" data-lemail="${l.id}" placeholder="${t('addEmail')}">`}</td>
      ${multi ? `<td><b>${vmap[l.id] || '—'}</b></td>` : ''}<td class="wrapc">${chkCell(l, crit)}</td><td>${(l.tags || []).map((x) => `<span class="tagc">#${esc(x)}</span>`).join(' ')}</td>
      <td>${blockedWhy(l) ? `<span class="blk" title="${t(blockedWhy(l) === 'admin' ? 'blockedAdmin' : 'blockedTaken')}">${t('blockedBadge')}</span>` : l.card ? `<span class="ty">${t('hasCard')}</span>` : `<button class="link" data-act="leadCard" data-id="${l.id}">${t('toCard')}</button>`}</td>
      <td><button class="link" data-act="leadOff" data-id="${l.id}">${t(l.off ? 'leadOn' : 'leadOff')}</button> <button class="link" data-act="leadDel" data-id="${l.id}">×</button></td></tr>`).join('');
    if (!all.length) return `<p class="later">${t('noLeadsYet')}</p><div class="acts"><button class="btn sm" data-act="ctab" data-v="source">← ${t('tabSource')}</button></div>`;
    return `${vCriterion(c, all)}${ui.checkLeft ? `<p class="sub small">${t('checking')}: ${ui.checkLeft} ${t('left')}</p>` : ''}
      <div class="acts tight"><input class="in search" data-lq placeholder="${t('searchLeads')}" value="${esc(ui.lq)}"><span class="sub small">${Math.min(200, list.length)} ${t('shown')} ${t('ofTotal')} ${list.length}</span>
        <button class="btn ghost sm danger" data-act="leadClear">${ui.delArm ? t('delSure') : t('removeAll')}</button></div>
      <table class="ltable"><tr><th>${t('company')}</th><th>${t('name')}</th><th>${t('email')}</th>${multi ? `<th>${t('variant')}</th>` : ''}<th>${t('critCol')}</th><th>${t('tagsCol')}</th><th></th><th></th></tr>${rows}</table>`;
  }
  // Step 1: where the recipients come from: a pasted table, a file, or companies that AI finds on the web.
  function vSource(c) {
    const n = S.leads.filter((l) => l.cid === c.id).length;
    const imp = ui.imp ? `<p class="hint">${ui.imp.err ? t(ui.imp.err) : `${ui.imp.added} ${t('impAdded')} · ${ui.imp.dup} ${t('impDup')} · ${ui.imp.bad} ${t('impBad')}`}</p>` : '';
    const fnd = ui.found ? `<p class="hint">${ui.found.err ? esc(ui.found.err) : `${t('foundCo')}: ${ui.found.co} · ${t('foundMail')}: ${ui.found.mail}`}</p>` : '';
    return `<label class="fl"><span>${t('title')}</span><input class="in big" data-top="title" value="${esc(c.title)}"></label>
      <div class="sitebox"><div class="bh">${t('srcTable')}</div>
        <textarea class="in" rows="4" data-leadpaste placeholder="${t('pasteHint')}"></textarea>
        <div class="acts tight"><button class="btn sm" data-act="leadImport">${t('importBtn')}</button><label class="btn ghost sm filebtn">${t('uploadCsv')}<input type="file" accept=".csv,.tsv,.txt,text/csv" data-leadfile hidden></label></div>
        <p class="sub small">${t('sheetLater')}</p>${imp}</div>
      <div class="sitebox"><div class="bh">${t('srcFind')}</div><p class="sub small">${t('srcFindNote')}</p>
        <textarea class="in" rows="2" data-findq placeholder="${t('srcFindPh')}">${esc(ui.findq || '')}</textarea>
        <div class="acts tight"><select class="in nin" data-findn>${[5, 10, 15].map((x) => `<option ${+(ui.findn || 10) === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <button class="btn sm" data-act="findGo" ${CLOUD && !ui.finding ? '' : 'disabled'} title="${CLOUD ? '' : t('aiDemoOnly')}">${ui.finding ? t('aiBusy') : t('srcFindGo')}</button></div>${fnd}</div>
      <label class="fl"><span>${t('notes')}</span><textarea class="in" data-top="notes" rows="3">${esc(c.notes)}</textarea></label>
      <div class="acts"><span class="sub small">${t('tabRecipients')}: ${n}</span><span class="grow"></span><button class="btn sm" data-act="ctab" data-v="recipients" ${n ? '' : 'disabled'}>${t('tabRecipients')} →</button></div>`;
  }
  // Asks the server how the campaign is going; keeps asking while it runs and the Sending step is open.
  function runPoll(cid) {
    clearTimeout(runPoll.t);
    Cloud.fn('campaignStatus', { cardId: cid }, 30000).then((r) => {
      ui.run = Object.assign({ cid, at: Date.now() }, r); render();
      if (r.run && r.run.status === 'active') runPoll.t = setTimeout(() => { if (ui.open === cid && ui.ctab === 'send') runPoll(cid); }, 30000);
    }, (e) => { ui.run = { cid, err: runWhy(e) }; render(); });
  }
  function runWhy(e) {
    const m = String(e && e.message || e);
    if (/RULE_PRIMARY/.test(m)) return t('runPrimary').replace('{m}', m.split('RULE_PRIMARY ')[1] || '');
    if (/MAIL_READ/.test(m)) return t('runNoRead') + ' ' + m.replace(/.*MAIL_READ\s*/, '');
    if (/EMPTY_FIELDS/.test(m)) return t('runHoles') + ' ' + m.replace(/.*EMPTY_FIELDS\s*/, '').split(',').map((x) => { const [l, f, n] = x.split('|'); return t('runHole').replace('{l}', l).replace('{f}', '{{' + f + '}}').replace('{n}', n); }).join('; ') + '. ' + t('runHolesFix');
    if (/MAIL_ACCESS/.test(m)) return t('runNoAccess') + ' ' + m.replace(/.*MAIL_ACCESS\s*/, '');
    if (/not approved yet/.test(m)) return t('runNotApproved') + ' ' + m;
    if (/NOT_FOUND|not-found|^internal$/i.test(m)) return t('errDeploy');
    return m;
  }
  function vRun(c) {
    const r = ui.run && ui.run.cid === c.id ? ui.run : null; if (!r || (!r.run && !r.err)) return '';
    if (r.err && !r.run) return `<div class="revbox"><b>${t('runFailed')}</b><small>${esc(r.err)}</small></div>`;
    const n = r.counts || {}, live = r.run.status === 'active', bx = r.box || {}, time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sumRow = ['queued', 'active', 'replied', 'done', 'bounced', 'error', 'stopped'].filter((k) => n[k]).map((k) => `<span class="${k === 'replied' ? 'ok' : ''}">${t('run_' + k)}: ${n[k]}</span>`).join('');
    const why = !live ? '' : !bx.open ? t('runClosed') : bx.newToday >= bx.capToday && r.run.queue ? t('runCap').replace('{n}', bx.capToday) : bx.nextAt > r.now ? t('runNextAt') + ' ' + time(bx.nextAt) : t('runSoon');
    return `<div class="sitebox"><div class="bh">${t('runTitle')} · ${t(live ? 'run_active' : 'run_' + r.run.status)}</div>
      <p class="sitesum"><span>${t('runLetters')}: ${r.letters}</span>${sumRow}</p>${live ? `<p class="sub small">${esc(r.run.from)} · ${t('runToday')}: ${bx.newToday} / ${bx.capToday} · ${why}</p>` : ''}
      ${bx.readErr ? `<div class="revbox"><b>${t('runNoRead')}</b><small>${esc(bx.readErr)}</small></div>` : ''}
      <div class="acts tight">${live ? `<button class="btn ghost sm danger" data-act="runStop">${t('runStopBtn')}</button>` : ''}<button class="link small" data-act="runRefresh">${t('runRefresh')}</button></div>
      <table class="ltable"><tr><th>${t('email')}</th><th>${t('variant')}</th><th>${t('runSent')}</th><th>${t('runState')}</th><th>${t('runNext')}</th></tr>
      ${(r.rows || []).map((x) => `<tr><td>${esc(x.to)}</td><td>${esc(x.variant)}</td><td>${x.sent} / ${x.of}</td><td><span class="chk ${x.status === 'replied' ? 'yes' : x.status === 'error' || x.status === 'bounced' ? 'unsure' : ''}">${t('run_' + x.status)}</span>${x.err ? `<small class="ev" title="${esc(x.err)}">${esc(x.err)}</small>` : ''}</td><td>${x.next ? time(x.next) : ''}</td></tr>`).join('')}</table>
      ${live ? `<p class="sub small">${t('runLive')}</p>` : ''}</div>`;
  }
  // Step 4: from which mailbox, by which rules, and what is still missing before the start.
  function vSend(c) {
    const seq = seqOf(c), v = S.vectors.find((x) => x.id === c.vid), co = v ? item('company', v.company) : null, mbs = myMailboxes(co), s = S.send;
    const from = mbs.length ? `<select class="in" data-seqfrom>${mbs.map((m) => `<option ${((seq.from || primaryMailbox(co)) === m.email) ? 'selected' : ''}>${esc(m.email)}</option>`).join('')}</select>` : `<span class="sub">${t('noMailbox')}</span>`;
    const all = S.leads.filter((l) => l.cid === c.id), go = all.filter(sendable).length, crit = critOf(c), unchecked = crit ? all.filter((l) => !l.off && !chkOf(l, crit)).length : 0;
    const lets = [].concat(...varsOf(seq).map((k) => (k === 'A' ? seq.steps : seq.alt[k].steps))), okL = lets.filter((x) => x.status === 'approved').length;
    const live = ui.run && ui.run.cid === c.id && ui.run.run && ui.run.run.status === 'active', ready = CLOUD && go > 0 && okL === lets.length && mbs.length > 0, busy = ui.run && ui.run.cid === c.id && ui.run.busy;
    const fromNow = seq.from || primaryMailbox(co), prim = ((co && co.s.mailboxes) || []).find((m) => m.email === fromNow && m.primary) && s.coldSecondary;
    const li = (ok, text) => `<li class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${text}</li>`;
    const sum = t('sendSum').replace('{start}', s.start).replace('{step}', s.step).replace('{cap}', s.cap).replace('{a}', s.gapMin).replace('{b}', s.gapMax);
    return `<label class="fl"><span>${t('fromMailbox')}</span>${from}</label>
      <button class="tog" data-act="cardOpt"><span class="sw ${optOn(c, v) ? 'on' : ''}"><i></i></span><span>${t('footOn')}<small>${optOf(v).text ? esc(optOf(v).text.split('\n').join(' · ')) : t('cardOptEmpty')}</small></span></button>
      <div class="sitebox"><div class="bh">${t('setSend')} · ${t('risk_' + s.level)}</div><p class="sub small">${sum}</p><button class="link small" data-act="sendOpen">${t('openRules')}</button></div>
      <div class="sitebox"><div class="bh">${t('readyTitle')}</div><ul class="ready">
        ${li(go > 0, `${t('readyWho')}: ${go}`)}${li(!unchecked, unchecked ? `${t('readyUnchecked')}: ${unchecked}` : t('readyChecked'))}
        ${li(okL === lets.length, `${t('readyLetters')}: ${okL} / ${lets.length}`)}${li(mbs.length > 0, t('readyBox'))}</ul>
        ${prim ? `<p class="sub small errc">${t('runPrimary').replace('{m}', esc(fromNow))}</p>` : ''}</div>
      ${vRun(c)}
      <div class="acts">${CLOUD ? '' : `<span class="sub small">${t('aiDemoOnly')}</span>`}<span class="grow"></span>
        <button class="btn ${ui.runArm ? 'danger' : ''}" data-act="runStart" ${ready && !busy ? '' : 'disabled'}>${busy ? t('aiBusy') : ui.runArm ? t('startSure').replace('{n}', go).replace('{m}', esc(fromNow)) : t(live ? 'startMore' : 'startCampaign')}</button></div>
      <p class="sub small">${t('startNote')}</p>`;
  }
  // Reads rows copied from a spreadsheet (tabs) or a CSV file (commas or semicolons, quotes allowed).
  function parseTable(text) {
    const first = text.split(/\r?\n/)[0] || '', d = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"' && cell === '') q = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((x) => x.trim() !== ''));
  }
  const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|pm|gmx|mail|zoho|yandex|ya|ukr|i|meta|bigmir|email|inbox|fastmail|hey|tutanota|tuta|yahoo|ymail|rambler|bk|list)\.[a-z.]+$/i;
  function importLeads(c, text) {
    const rows = parseTable(text), norm = (h) => String(h).toLowerCase().replace(/[^a-z]/g, '');
    let hi = -1, map = null;
    for (let i = 0; i < Math.min(5, rows.length) && hi < 0; i++) {
      const m = {}; rows[i].forEach((h, j) => { const n = norm(h); Object.keys(LEAD_COLS).forEach((k) => { if (!(k in m) && LEAD_COLS[k].includes(n)) m[k] = j; }); });
      if ('email' in m) { hi = i; map = m; }
    }
    // No header row: the shortest form is accepted too, one person per line, a name and an address in any order.
    if (hi < 0) {
      const simple = String(text).split(/\r?\n/).map((ln) => { const m = ln.match(/[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+/); if (!m) return null;
        const name = ln.replace(m[0], ' ').replace(/[<>,;"'()\t|:]+/g, ' ').replace(/(^|\s)[-–—]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().split(' '); return [name[0] || '', name.slice(1).join(' '), m[0].replace(/[.]+$/, '')]; }).filter(Boolean);
      if (!simple.length) { ui.imp = { err: 'needHeader' }; render(); return; }
      rows.length = 0; simple.forEach((r) => rows.push(r)); map = { firstName: 0, lastName: 1, email: 2 }; hi = -1;
    }
    const v = S.vectors.find((x) => x.id === c.vid), company = v ? v.company : (c.vec || {}).company;
    const seen = {}; S.leads.forEach((l) => { if (l.company === company) seen[l.f.email] = 1; });
    S.cards.forEach((k) => { const e = String(k.f.email || '').trim().toLowerCase(); if (k.type === 'contact' && e && (k.vec || {}).company === company) seen[e] = 1; });
    const res = { added: 0, dup: 0, bad: 0 }; let n = Date.now();
    rows.slice(hi + 1).forEach((r) => {
      const f = {}; Object.keys(map).forEach((k) => { const val = String(r[map[k]] || '').trim(); if (val) f[k] = val; });
      f.email = String(f.email || '').toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) { res.bad++; return; }
      if (seen[f.email]) { res.dup++; return; }
      seen[f.email] = 1; res.added++;
      // A company address tells us the company's site; free mail services tell us nothing.
      const dom = f.email.split('@')[1]; if (!f.website && !FREE_MAIL.test(dom)) f.website = 'https://' + dom;
      S.leads.push({ id: uid('L'), cid: c.id, vid: c.vid, company, owner: au.uid, acl: (c.acl || []).slice(), ord: n++, f, blocked: '', okEmail: CLOUD ? '' : f.email });
    });
    ui.imp = res; if (res.added) { ui.ctab = 'recipients'; ui.rf = 'all'; } commit(); checkLeads();
  }
  // Asks the server, a few at a time, whether another manager already works with each new recipient.
  function checkLeads() {
    if (!CLOUD) return;
    const todo = S.leads.filter((l) => l.owner === au.uid && !l.blocked && l.okEmail !== l.f.email && l.company);
    ui.checkLeft = todo.length; if (!todo.length) { commit(); return; }
    Promise.all(todo.slice(0, 15).map((l) => Cloud.takenBy(takenId(l.company, l.f.email)).then((owner) => {
      if (owner && owner !== au.uid) l.blocked = 'taken'; else l.okEmail = l.f.email;
    }))).then(() => { save(); if (!typing()) render(); checkLeads(); });
  }

  // ---------- letters: one letter or a chain, written, checked and approved before anything is sent ----------
  const newStep = (day) => ({ id: uid('s'), day, subject: '', body: '', status: 'draft' });
  // Variants A, B, C are different letters for the same campaign, sent in parallel: split evenly to compare them,
  // or each to its own job titles. Every variant has its own chain: A1, then reminders A2, A3 while the client is silent.
  const seqOf = (c) => { if (!c.seq) c.seq = { from: '', steps: [newStep(0)] }; const s = c.seq; if (!s.lang) s.lang = 'en'; if (!s.alt) s.alt = {}; if (!s.split) s.split = 'even'; return s; };
  const varsOf = (s) => ['A'].concat(['B', 'C'].filter((k) => s.alt[k]));
  const curVar = (s) => (varsOf(s).includes(ui.var) ? ui.var : 'A');
  const stepsOf = (c) => { const s = seqOf(c), k = curVar(s); return k === 'A' ? s.steps : s.alt[k].steps; };
  const whoOf = (s, k) => (k === 'A' ? s.whoA : s.alt[k].who) || '';
  const words = (x) => String(x || '').toLowerCase().split(/[,;\n]/).map((w) => w.trim()).filter(Boolean);
  // Which variant a recipient gets: by job title when the campaign is split that way, otherwise in turn.
  function variantOf(s, lead, n) {
    const vs = varsOf(s); if (vs.length === 1) return 'A';
    if (s.split !== 'role') return vs[n % vs.length];
    const jt = String(lead.f.jobTitle || '').toLowerCase();
    return vs.find((k) => words(whoOf(s, k)).some((w) => jt.includes(w))) || 'A';
  }
  const modeOf = (st, k) => st.mode || { B: 'gpt', C: 'manual' }[k] || 'claude';
  const stepReady = (st, i) => !!(st.body.trim() && (i > 0 || st.subject.trim()));
  const langName = (code) => { try { const n = new Intl.DisplayNames([S.lang === 'uk' ? 'uk' : 'en'], { type: 'language' }).of(code); return n[0].toUpperCase() + n.slice(1); } catch (e) { return code; } };
  function sampleFor(c) {
    if (c.type === 'contact') { const p = c.title.split(' '); return { firstName: p[0], lastName: p.slice(1).join(' '), company: c.f.company, jobTitle: c.f.jobTitle, city: '' }; }
    const ok = S.leads.filter((x) => x.cid === c.id && sendable(x)), l = ok.find((x) => x.chk && x.chk.proj) || ok[0];
    return l ? Object.assign({}, l.f, { project: (l.chk || {}).proj || '' }) : { firstName: 'Anna', lastName: 'Berg', company: 'Example AS', jobTitle: 'CEO', city: 'Oslo' };
  }
  // A phrase in [[double brackets]] is kept only when every field inside it has a value for this recipient.
  const optional = (text, r) => String(text || '').replace(/[ \t]*\[\[([\s\S]*?)\]\]/g, (m, inner) => ((inner.match(/\{\{\s*\w+\s*\}\}/g) || []).every((x) => r[x.replace(/[{}\s]/g, '')]) ? ' ' + inner.trim() : '')).replace(/^ +/gm, '');
  const fillVars = (text, r) => optional(text, r).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k === 'myName' ? S.user.name : k === 'signature' ? r.signature || '' : r[k]) || (k === 'signature' ? '' : m));
  // The signature of the chosen mailbox goes at the end of every letter, unless the text places {{signature}} itself.
  const withSig = (body, sig) => (!sig || /\{\{\s*signature\s*\}\}/.test(body) ? body : body.replace(/\s+$/, '') + '\n\n{{signature}}');
  // A contact who already answered: the letters exchanged so far and an answer written here, sent in the same thread.
  const hasConvo = (c) => CLOUD && c.type === 'contact' && !!(c.parent || c.mail) && !!String(c.f.email || '').trim();
  function convoLoad(cid, quiet) {
    if (!quiet) { ui.convo = { cid, loading: true }; render(); }
    Cloud.fn('convo', { cardId: cid, op: 'read' }, 60000).then((r) => { if (ui.open !== cid) return; ui.convo = Object.assign({ cid }, r); render(); },
      (e) => { if (ui.open !== cid) return; ui.convo = { cid, err: convoWhy(e) }; render(); });
  }
  function convoWhy(e) {
    const m = String((e && e.message) || e);
    if (/NO_CONVO/.test(m)) return t('cvNone');
    if (/CONVO_OWNER/.test(m)) return t('cvOwner').replace('{m}', m.split('CONVO_OWNER ')[1] || '');
    if (/CONVO_VARS/.test(m)) return t('cvVars');
    if (/MAIL_READ/.test(m)) return t('runNoRead') + ' ' + m.replace(/.*MAIL_READ\s*/, '');
    if (/MAIL_ACCESS/.test(m)) return t('runNoAccess') + ' ' + m.replace(/.*MAIL_ACCESS\s*/, '');
    return aiWhy(e);
  }
  function vConvo(c) {
    const cv = ui.convo && ui.convo.cid === c.id ? ui.convo : null;
    if (!cv) { setTimeout(() => { if (ui.open === c.id && !(ui.convo && ui.convo.cid === c.id)) convoLoad(c.id); }, 0); return `<p class="sub">${t('cvLoading')}</p>`; }
    if (cv.loading) return `<p class="sub">${t('cvLoading')}</p>`;
    if (cv.err) return `<div class="revbox"><b>${t('cvFailed')}</b><small>${esc(cv.err)}</small><div class="acts tight"><button class="btn ghost sm" data-act="cvRefresh">${t('runRefresh')}</button></div></div>`;
    const when = (ms) => new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const seq = seqOf(c), own = c.reply != null ? c.reply : '', busy = ui.cvBusy;
    const msgs = (cv.messages || []).map((m) => `<div class="cvm ${m.me ? 'me' : ''}"><small>${m.me ? t('cvMe') : esc(String(m.from).replace(/<.*>/, '').replace(/"/g, '').trim() || cv.to)} · ${when(m.at)}${m.subject ? ' · ' + esc(m.subject) : ''}</small><pre>${esc(m.text || '')}</pre></div>`).join('') || `<p class="sub">${t('cvEmpty')}</p>`;
    const need = ui.cvNeed && ui.cvNeed.cid === c.id ? `<div class="revbox"><b>${t('needTitle')}</b><ul>${ui.cvNeed.list.map((q) => `<li>${esc(q)}</li>`).join('')}</ul><small>${t('cvNeedNote')}</small></div>` : '';
    return `<div class="seqhead"><span class="sub small">${t('cvWith')} ${esc(cv.to)} · ${t('fromMailbox')} ${esc(cv.box)}</span><button class="link small" data-act="cvRefresh">${t('runRefresh')}</button></div>
      <div class="cvlist">${msgs}</div>
      <div class="step"><div class="bh">${t('cvYour')}</div>
        <textarea class="in" rows="7" data-cvreply placeholder="${t('cvPh')}">${esc(own)}</textarea>
        <div class="acts tight"><button class="btn ghost sm" data-act="cvDraft" data-e="claude" ${busy ? 'disabled' : ''}>${busy === 'claude' ? t('aiBusy') : t('cvAi') + ' · Claude'}</button><button class="btn ghost sm" data-act="cvDraft" data-e="gpt" ${busy ? 'disabled' : ''}>${busy === 'gpt' ? t('aiBusy') : t('cvAi') + ' · ChatGPT'}</button>
          <span class="grow"></span>${ui.cvSent === c.id ? `<span class="sub small okc">${t('cvSent')}</span>` : ''}<button class="btn sm ${ui.cvArm ? 'danger' : ''}" data-act="cvSend" ${busy || !String(own).trim() ? 'disabled' : ''}>${busy === 'send' ? t('aiBusy') : ui.cvArm ? t('cvSendSure') : t('cvSend')}</button></div>
        <input class="in" data-cvnote value="${esc(ui.cvNote || '')}" placeholder="${t('cvNotePh')}">${need}
        <p class="sub small">${t('cvHint')}</p></div>`;
  }
  function vSequence(c) {
    if (hasConvo(c)) return vConvo(c);
    const seq = seqOf(c), v = S.vectors.find((x) => x.id === c.vid), co = v ? item('company', v.company) : null, mbs = myMailboxes(co);
    const from = mbs.length ? `<select class="in" data-seqfrom>${mbs.map((m) => `<option ${((seq.from || primaryMailbox(co)) === m.email) ? 'selected' : ''}>${esc(m.email)}</option>`).join('')}</select>` : `<span class="sub">${t('noMailbox')}</span>`;
    const list = stepsOf(c), vs = varsOf(seq), k = curVar(seq), nextV = ['B', 'C'].find((x) => !seq.alt[x]);
    const cnt = {}, whoGets = {}; S.leads.filter((l) => l.cid === c.id && sendable(l)).forEach((l, n) => { const x = variantOf(seq, l, n); cnt[x] = (cnt[x] || 0) + 1; (whoGets[x] = whoGets[x] || []).push([l.f.firstName, l.f.lastName].filter(Boolean).join(' ') || l.f.email); });
    const vtabs = c.type !== 'campaign' ? '' : `<div class="vtabs">${vs.map((x) => `<button class="chip ${x === k ? 'on' : ''}" data-act="seqTab" data-v="${x}">${t('variant')} ${x} · ${cnt[x] || 0}</button>`).join('')}
        ${nextV ? `<button class="chip dash" data-act="seqTabAdd" title="${t('variantHint')}">+ ${t('variant')} ${nextV}</button>` : ''}${k !== 'A' ? `<button class="link small" data-act="seqTabDel">${t('removeVariant')} ${k}</button>` : ''}</div>
      ${vs.length < 2 ? '' : `<div class="row2 vset"><label class="fl"><span>${t('splitHow')}</span><select class="in" data-seqsplit><option value="even" ${seq.split !== 'role' ? 'selected' : ''}>${t('split_even')}</option><option value="role" ${seq.split === 'role' ? 'selected' : ''}>${t('split_role')}</option></select></label>
        ${seq.split === 'role' ? `<label class="fl"><span>${t('whoFor')} ${k}</span><input class="in" data-seqwho placeholder="CEO, Owner, Founder" value="${esc(whoOf(seq, k))}"></label>` : '<span></span>'}</div>
        <p class="sub small">${t(seq.split === 'role' ? 'splitRoleNote' : 'splitEvenNote')}</p>
        <p class="sub small"><b>${t('variant')} ${k}:</b> ${esc((whoGets[k] || []).slice(0, 12).join(', ') || '—')}${(whoGets[k] || []).length > 12 ? ` … +${whoGets[k].length - 12}` : ''}</p>`}`;
    const head2 = `<div class="row2 vset"><label class="fl"><span>${t('sendLang')}</span><select class="in" data-seqlang>${LANGS.map((l) => `<option value="${l}" ${seq.lang === l ? 'selected' : ''}>${esc(langName(l))}</option>`).join('')}</select></label>
      <label class="fl"><span>${t('unitLabel')}</span><select class="in" data-sequnit>${['d', 'h', 'm'].map((u) => `<option value="${u}" ${(seq.unit || 'd') === u ? 'selected' : ''}>${t('unit_' + u)}</option>`).join('')}</select></label></div>
      ${seq.lang !== 'en' ? `<p class="sub small">${t('langNote').replace('{l}', langName(seq.lang))}</p>` : ''}`;
    const done = list.filter((x) => x.status === 'approved').length, smp = Object.assign({}, sampleFor(c), { signature: tailOf(c, v, co, seq.from || primaryMailbox(co)) });
    // AI buttons work only in the real program: the keys live on the server, the demo has none.
    const aiBtn = (i, op, eng, label, off) => { const me = `${i}|${op}|${eng}`; return `<button class="btn ghost sm" data-act="aiGo" data-i="${i}" data-op="${op}" data-eng="${eng}" ${!CLOUD || ui.busy || off ? 'disabled' : ''} title="${CLOUD ? t('eng_' + eng) : t('aiDemoOnly')}">${ui.busy === me ? t('aiBusy') : label}</button>`; };
    const revBox = (st, i) => { const r = st.review; if (!r) return ''; const diff = r.body && (r.body !== st.body || (r.subject || '') !== (st.subject || ''));
      return `<div class="revbox ${r.ok ? 'ok' : ''}"><b>${t(r.ok ? 'revOk' : 'revFix')} · ${t('eng_' + r.by)}</b>${r.issues && r.issues.length ? `<ul>${r.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${diff ? `<small>${t('revSuggest')}</small>${r.subject ? `<b class="rs">${esc(r.subject)}</b>` : ''}<pre>${esc(r.body)}</pre>` : ''}
        <div class="acts tight">${diff ? `<button class="btn sm" data-act="seqApply" data-i="${i}">${t('revApply')}</button>` : ''}<button class="btn ghost sm" data-act="seqRevHide" data-i="${i}">${t('dismiss')}</button></div></div>`; };
    const steps = list.map((st, i) => { const mode = modeOf(st, k); return `<div class="step st-${st.status}" data-step="${i}"><div class="sth"><b>${t('letter')} ${k}${i + 1}</b>${i ? `<span class="ty">${t('ifSilent')}</span>` : ''}
        <label class="dayl" title="${t('dayHint')}">${t('dayN_' + (seq.unit || 'd'))} <input class="in" type="number" min="0" data-seq="${i}|day" value="${+st.day || 0}" ${i === 0 ? 'disabled' : ''}></label>
        <span class="stt">${t('seq_' + st.status)}</span>${i > 0 && i === list.length - 1 ? `<button class="link" data-act="seqDel" data-i="${i}">×</button>` : ''}</div>
      <select class="in modesel" data-stepmode="${i}" title="${t('whoWrites')}">${['claude', 'gpt', 'manual'].map((m) => `<option value="${m}" ${mode === m ? 'selected' : ''}>${t('mode_' + m)}</option>`).join('')}</select>
      <input class="in" data-seq="${i}|subject" placeholder="${i ? t('subjectRe').replace('{k}', k) : t('subject')}" value="${esc(st.subject)}">
      <textarea class="in" rows="${i ? 4 : 6}" data-seq="${i}|body" placeholder="${i ? (mode === 'manual' ? t('followPhManual') : t('followPh')) : t('body')}">${esc(st.body)}</textarea>
      <div class="vars">${SEQ_VARS.map((x) => `<button class="chip" data-act="seqVar" data-i="${i}" data-v="${x}">{{${x}}}</button>`).join('')}</div>
      <div class="acts tight">${mode === 'manual' ? aiBtn(i, 'polish', 'claude', t('polishClaude'), !st.body.trim()) + aiBtn(i, 'polish', 'gpt', t('polishGpt'), !st.body.trim())
        : aiBtn(i, 'draft', mode, i ? t('aiFollow') : t('aiDraft')) + aiBtn(i, 'review', mode === 'gpt' ? 'claude' : 'gpt', t('aiReview'), !st.body.trim())}
        <button class="btn ghost sm" data-act="seqPreview" data-i="${i}">${t('preview')}</button>
        <button class="btn sm" data-act="seqApprove" data-i="${i}" ${st.status === 'approved' || stepReady(st, i) ? '' : 'disabled'}>${st.status === 'approved' ? t('unapprove') : t('approve')}</button></div>
      <div class="acts tight cmt"><input class="in grow" data-cmt="${i}" placeholder="${t('cmtPh')}" ${CLOUD ? '' : 'disabled'}>${aiBtn(i, 'revise', mode === 'gpt' ? 'gpt' : 'claude', t('cmtGo'), !st.body.trim())}</div>
      ${st.need && st.need.length ? `<div class="revbox"><b>${t('needTitle')}</b><ul>${st.need.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <textarea class="in" rows="3" data-needans="${i}" placeholder="${t('needPh')}"></textarea>
        <div class="acts tight"><button class="btn sm" data-act="needGo" data-i="${i}" ${ui.busy ? 'disabled' : ''}>${t('needGo')}</button><button class="btn ghost sm" data-act="needHide" data-i="${i}">${t('dismiss')}</button></div><small>${t('needNote')}</small></div>` : ''}
      ${revBox(st, i)}${ui.prev === i ? `<div class="prevbox"><small>${t('previewFor')} ${esc([smp.firstName, smp.lastName].filter(Boolean).join(' '))}</small><b>${esc(fillVars(st.subject || 'Re: ' + list[0].subject, smp))}</b><pre>${esc(fillVars(withSig(st.body, smp.signature), smp))}</pre></div>` : ''}</div>`; }).join('');
    const tp = topicOf(c), bs = (tp && tp.s) || {}, thin = !String(bs.offer || '').trim() && !String(bs.hook || '').trim() && !String(c.notes || '').trim();
    const briefHint = thin ? `<div class="revbox"><b>${t('thinTitle')}</b><small>${t('thinNote')}</small>${tp ? `<div class="acts tight"><button class="btn sm" data-act="editParam" data-zone="topic" data-id="${tp.id}">${t('thinOpen')}</button></div>` : ''}</div>` : '';
    const camp = c.type === 'campaign', will = camp ? S.leads.filter((l) => l.cid === c.id && sendable(l)).length : 0;
    return `<div class="seqhead">${camp ? `<span class="sub small">${t('willGet')}: ${will}</span><button class="btn ghost sm" data-act="seqAuto" ${CLOUD && !ui.busy ? '' : 'disabled'} title="${CLOUD ? t('seqAutoHint') : t('aiDemoOnly')}">${ui.auto ? t('aiBusy') + ' ' + ui.auto : t('seqAuto')}</button>`
      : `<label class="fromf"><span>${t('fromMailbox')}</span>${from}</label>`}<span class="ty">${done} / ${list.length} ${t('approvedOf')}</span></div>
      ${briefHint}${head2}${vtabs}${steps}${list.length < 5 ? `<button class="add" data-act="seqAdd">+ ${t('letter')} ${k}${list.length + 1} · ${t('addFollow')}</button>` : ''}<p class="sub small">${t('chainNote')} ${t('seqNote')}</p>
      ${camp ? `<div class="acts"><span class="sub small">${vs.map((x) => { const st = x === 'A' ? seq.steps : seq.alt[x].steps, ok = st.filter((y) => y.status === 'approved').length; return `${t('variant')} ${x}: ${ok} / ${st.length} ${t('approvedOf')}`; }).join(' · ')}</span><span class="grow"></span><button class="btn sm" data-act="ctab" data-v="send">${t('tabSend')} →</button></div>` : ''}`;
  }

  function vCardModal() {
    const c = S.cards.find((x) => x.id === ui.open); if (!c) return '';
    const F = {
      contact: [['jobTitle', t('jobTitle')], ['company', t('company')], ['email', t('email')], ['phone', t('phone')], ['linkedin', t('linkedin')]],
      company: [['website', t('website')], ['country', t('country')], ['phone', t('phone')], ['linkedin', t('linkedin')]],
      campaign: [['sheetUrl', t('sheetUrl')], ['dailyCap', t('dailyCap')]],
      task: [],
    }[c.type];
    const hasPhoto = c.type === 'contact' || c.type === 'company';
    const logoText = c.type === 'contact' ? initials(c.f.company || c.title) : initials(c.title);
    const photo = hasPhoto ? `<div class="photo" tabindex="0" data-photo title="${t('photoHint')}">${c.photo ? `<img src="${c.photo}" alt="">` : esc(logoText)}</div>
      <p class="sub small"><label class="link filebtn">${t('uploadImage')}<input type="file" accept="image/*" data-file hidden></label> · <span class="hint2">${t('photoHint')}</span>${c.photo ? ` · <button class="link" data-act="rmPhoto">${t('removePhoto')}</button>` : ''}</p>` : '';
    const opts = (list, cur, pre) => list.map((x) => `<option value="${x}" ${x === cur ? 'selected' : ''}>${t(pre + x)}</option>`).join('');
    const camp = c.type === 'campaign', tabList = camp ? ['source', 'recipients', 'sequence', 'send'] : c.type === 'contact' ? ['details', 'sequence'] : [];
    const tab = tabList.includes(ui.ctab) ? ui.ctab : camp ? 'source' : 'details';
    const sq = camp ? seqOf(c) : null, stepDone = !camp ? {} : { source: S.leads.some((l) => l.cid === c.id), recipients: !!c.listOk,
      sequence: varsOf(sq).every((k) => (k === 'A' ? sq.steps : sq.alt[k].steps)[0].status === 'approved'), send: false };
    const fromCamp = c.parent ? S.cards.find((x) => x.id === c.parent) : null;
    const nLeads = S.leads.filter((l) => l.cid === c.id).length;
    const tabs = tabList.length ? `<div class="tabs ctabs ${camp ? 'steps' : ''}">${tabList.map((x, i) => `<button class="${tab === x ? 'on' : ''} ${stepDone[x] ? 'done' : ''}" data-act="ctab" data-v="${x}">${camp ? `<i>${stepDone[x] ? '✓' : i + 1}</i>` : ''}${t('tab' + x[0].toUpperCase() + x.slice(1))}${x === 'recipients' ? ` · ${nLeads}` : ''}</button>`).join('')}</div>` : '';
    return `<div class="overlay" data-act="closeBg"><div class="modal ${tabList.length ? 'wide' : ''}" role="dialog"><button class="mclose" data-act="closeAny" aria-label="Close">×</button>
      <div class="mleft">${tabs}${tab === 'source' ? vSource(c) : tab === 'send' ? vSend(c) : tab === 'recipients' ? vRecipients(c) : tab === 'sequence' ? vSequence(c) : `${photo}
        ${fromCamp ? `<p class="sub small fromc">${t('fromCampaign')}: <button class="link" data-act="open" data-id="${fromCamp.id}">${esc(fromCamp.title)}</button>${(c.tags || []).map((x) => ` <span class="tagc">#${esc(x)}</span>`).join('')}</p>` : ''}
        <label class="fl"><span>${c.type === 'contact' ? t('name') : t('title')}</span><input class="in big" data-top="title" value="${esc(c.title)}"></label>
        ${F.map((x) => field(c, x[0], x[1], x[2])).join('')}
        <label class="fl"><span>${t('notes')}</span><textarea class="in" data-top="notes" rows="5">${esc(c.notes)}</textarea></label>`}
      </div>
      <div class="mright">
        <div class="row2"><label class="fl"><span>${t('type')}</span><select class="in" data-top="type">${opts(TYPES, c.type, 'type_')}</select></label>
        <label class="fl"><span>${t('stage')}</span><select class="in" data-top="stage">${opts(STAGES.map((x) => x[0]), c.stage, 'st_')}</select></label></div>
        <div class="fl"><span>${t('colour')}</span><div class="sws"><button class="swt none ${c.color ? '' : 'on'}" data-act="setColor" data-id="" title="${t('none')}"></button>${
          S.legend.map((l) => `<button class="swt ${c.color === l.id ? 'on' : ''}" style="--cc:${l.color}" data-act="setColor" data-id="${l.id}" title="${esc(l.label)}"></button>`).join('')}</div></div>
        <div class="box"><div class="bh">${t('nextStep')}</div><input class="in" data-next="text" value="${esc(c.next.text)}">
          <label class="fl"><span>${t('nextDate')}</span><input class="in" type="date" data-next="date" value="${esc(c.next.date)}"></label>
          <button class="tog" data-act="awaiting"><span class="sw ${c.awaiting ? 'on' : ''}"><i></i></span><span>${t('awaiting')}</span></button></div>
        ${blockedWhy(c) ? `<div class="box blkbox"><b>${t('blockedBadge')}</b><p>${t(blockedWhy(c) === 'admin' ? 'blockedAdmin' : 'blockedTaken')}</p></div>` : `<div class="box"><div class="bh">${t('autopilot')}</div>${tog(c, 'follow', t('apFollow'))}${tog(c, 'reply', t('apReply'))}${tog(c, 'draft', t('apDraft'))}${tog(c, 'notify', t('apNotify'))}</div>`}
        ${DOC_STAGES.includes(c.stage) && c.type !== 'task' ? `<div class="box docsbox"><div class="bh">${t('docsBox')}</div>${
          S.gdocs.filter((d) => d.card === c.id).map((d) => `<div class="lrow"><span class="num">${esc(d.no.slice(-2))}</span><span class="lt">${t('doc_' + d.type)}</span><span class="ty">${t('draft')}</span></div>`).join('')}
          <div class="row2 gen"><select class="in" data-doctype>${DOC_TYPES.map((x) => `<option value="${x}">${t('doc_' + x)}</option>`).join('')}</select><button class="btn sm" data-act="prepDoc">${t('prepare')}</button></div></div>` : ''}
        <div class="acts"><button class="btn ghost sm" data-act="clone">${t('clone')}</button>
          <button class="btn ghost sm danger" data-act="del">${ui.delArm ? t('delSure') : t('del')}</button>
          <button class="btn sm" data-act="close">${t('close')}</button></div>
      </div></div></div>`;
  }

  // Settings of one parameter (opened with the three dots).
  const sIn = (it, k, label, area, ph) => `<label class="fl"><span>${label}</span>${area
    ? `<textarea class="in" data-s="${k}" rows="3" placeholder="${esc(ph || '')}">${esc(it.s[k] || '')}</textarea>` : `<input class="in" data-s="${k}" placeholder="${esc(ph || '')}" value="${esc(it.s[k] || '')}">`}</label>`;
  const sSel = (it, k, label, vals, pre) => `<label class="fl"><span>${label}</span><select class="in" data-s="${k}"><option value=""></option>${
    vals.map((v) => `<option value="${v}" ${it.s[k] === v ? 'selected' : ''}>${t(pre + v)}</option>`).join('')}</select></label>`;
  function paramSettings(zone, it) {
    if (zone === 'company') {
      const boxes = (it.s.mailboxes || []).map((m, i) => (!manages(it) && !mineMb(m) ? '' : `<div class="mbx"><div class="lrow"><button class="radio ${m.primary ? 'on' : ''}" data-act="mbPrimary" data-i="${i}" title="${t('primary')}"></button>
        <span class="lt">${esc(m.email)}${CLOUD && m.owner !== au.uid ? ` <small class="ownr">${esc(userName(m.owner))}</small>` : ''}</span>${m.primary ? `<span class="ty">${t('primary')}</span>` : ''}<button class="link" data-act="mbRemove" data-i="${i}">×</button></div>
        <div class="acts tight"><button class="btn ghost sm" data-act="mbTest" data-i="${i}" ${CLOUD && !ui.mbBusy ? '' : 'disabled'} title="${CLOUD ? t('mbTestHint') : t('aiDemoOnly')}">${ui.mbBusy === m.email ? t('aiBusy') : t('mbTest')}</button>
          ${ui.mbRes && ui.mbRes.email === m.email ? `<span class="sub small ${ui.mbRes.ok ? 'okc' : 'errc'}">${esc(ui.mbRes.text)}</span>` : ''}</div>
        <input class="in" data-mbname="${i}" value="${esc(m.name || '')}" placeholder="${t('mbName')}" title="${t('mbNameHint')}">
        <textarea class="in" rows="3" data-mbsig="${i}" placeholder="${t('mbSignature')}">${esc(m.sig || '')}</textarea>
        <details class="sigh" ${m.sigHtml || ui.sigOpen === m.email ? 'open' : ''}><summary>${t('sigHtml')}</summary><p class="sub small">${t('sigHtmlNote')}</p>
          <textarea class="in mono" rows="4" data-mbsightml="${i}" placeholder="<table>…</table>">${esc(m.sigHtml || '')}</textarea>
          <div class="acts tight"><label class="btn ghost sm filebtn">${t('sigFile')}<input type="file" accept=".html,.htm,.txt,text/html,text/plain" data-mbsigfile="${i}" hidden></label>${m.sigHtml ? `<button class="link small" data-act="mbSigClear" data-i="${i}">${t('sigClear')}</button>` : ''}</div>
          ${m.sigHtml ? `<iframe class="sigprev" sandbox srcdoc="${esc('<body style="margin:8px;background:#fff">' + m.sigHtml + '</body>')}"></iframe>` : ''}</details>
        ${m.sig ? '' : `<button class="link small" data-act="mbSigPlain" data-i="${i}">${t('sigPlain')}</button>`}
        </div>`)).join('');
      return sIn(it, 'website', t('website')) + `<div class="fl"><span>${t('mailboxes')}</span>${boxes}<input class="in" data-listadd="mailboxes" placeholder="${t('addMailbox')}"><p class="sub small">${t('sigHint')}</p></div>`;
    }
    if (zone === 'direction') {
      const cr = (it.s.criteria || []).map((c, i) => `<div class="lrow"><span class="num">${i + 1}</span><span class="lt">${esc(c)}</span><button class="link" data-act="crRemove" data-i="${i}">×</button></div>`).join('');
      return sIn(it, 'desc', t('dirDesc'), 1) + `<div class="fl"><span>${t('criteria')}</span>${cr}<input class="in" data-listadd="criteria" placeholder="${t('addCriterion')}"><p class="sub small">${t('criteriaNote')}</p></div>`;
    }
    if (zone === 'audience') {
      const sen = SENIORITY.map((x) => `<button class="chip ${(it.s.seniority || []).includes(x) ? 'on' : ''}" data-act="senToggle" data-v="${x}">${x}</button>`).join('');
      return sIn(it, 'titles', t('audTitles')) + `<div class="fl"><span>${t('audSeniority')}</span><div class="chips">${sen}</div></div>`
        + `<div class="row2">${sSel(it, 'role', t('audRole'), ['decision', 'influence', 'user'], 'role_')}${sSel(it, 'tone', t('audTone'), ['formal', 'neutral', 'informal'], 'tone_')}</div>`
        + `<div class="row2">${sIn(it, 'regions', t('audRegions'))}${sIn(it, 'language', t('audLanguage'))}</div>` + sIn(it, 'pains', t('audPains'), 1) + sIn(it, 'notes', t('audNotes'), 1);
    }
    // The brief is what AI reads before it writes a letter in this vector: every field is a hint, none is required.
    const tones = TONES.map((x) => `<button class="chip ${(it.s.tones || []).includes(x) ? 'on' : ''}" data-act="toneToggle" data-v="${x}" title="${t('toneH_' + x)}">${t('tone2_' + x)}</button>`).join('');
    return `<div class="brief"><div class="bh">${t('briefTitle')}</div><p class="sub small">${t('briefNote')}</p></div>`
      + sIn(it, 'hook', t('topicHook'), 1, t('ph_hook')) + sIn(it, 'offer', t('briefOffer'), 1, t('ph_offer'))
      + `<div class="fl"><span>${t('briefTone')}</span><div class="chips">${tones}</div></div>`
      + sIn(it, 'cta', t('briefCta'), 0, t('ph_cta')) + sIn(it, 'proof', t('topicProof'), 0, t('ph_proof'))
      + sIn(it, 'avoid', t('briefAvoid'), 1, t('ph_avoid')) + sIn(it, 'sample', t('briefSample'), 1, t('ph_sample')) + sIn(it, 'keywords', t('topicKeywords'))
      + `<div class="brief"><div class="bh">${t('critTitle')}</div><p class="sub small">${t('topicCritNote')}</p></div>`
      + sIn(it, 'crit', t('critLabel'), 0, t('critPh')) + `<div class="row2">${sIn(it, 'tag', t('critTag'), 0, 'data-center')}${sIn(it, 'terms', t('critTerms'), 0, 'data center, data centre, mission critical')}</div>`
      + `<div class="acts tight"><button class="btn ghost sm" data-act="topicCrit" ${CLOUD && !ui.critBusy ? '' : 'disabled'} title="${CLOUD ? '' : t('aiDemoOnly')}">${ui.critBusy ? t('aiBusy') : t('critAi')}</button></div>`;
  }
  const accVal = (co, u) => (managersOf(co).includes(u.id) ? 'manage' : (co.access || {})[u.id] || '');
  const accSel = (co, u) => `<select class="in" data-cacc="${u.id}|${co.id}">${[['', 'accNone'], ['shared', 'accShared'], ['own', 'accOwn']].concat(sup() && u.role === 'admin' ? [['manage', 'accManage']] : [])
    .map((o) => `<option value="${o[0]}" ${accVal(co, u) === o[0] ? 'selected' : ''}>${t(o[1])}</option>`).join('')}</select>`;
  function vEditModal() {
    const e = ui.edit; if (!e) return '';
    let left, right;
    if (e.kind === 'users') {
      const mine = S.zones.company.filter(manages);
      const rows = au.users.slice().sort((a, b) => (a.created || '').localeCompare(b.created || '')).map((u) => {
        const isOwner = u.id === au.ownerUid, canRole = !isOwner && u.id !== au.uid && (sup() || u.role !== 'admin');
        const roles = sup() ? ['pending', 'user', 'admin'] : ['pending', 'user'];
        const sel = canRole ? `<select class="in" data-urole="${u.id}">${roles.map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t('acc_' + r)}</option>`).join('')}</select>` : `<span class="rolefix">${roleName(u)}</span>`;
        const showAcc = !isOwner && u.id !== au.uid && (u.role === 'user' || (u.role === 'admin' && sup()));
        return `<div class="urow"><span class="ava">${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials(u.name || u.email))}</span>
        <span class="lt"><b>${esc(u.name || '—')}</b><br><small>${esc(u.email)}</small></span>${sel}</div>
        ${!showAcc ? '' : `<div class="uacc"><div class="bh">${t('companiesAccess')}</div>${mine.map((co) => `<div class="lrow"><span class="lt">${esc(co.name)}</span>${accSel(co, u)}</div>`).join('')}
          <label class="fl"><span>${t('forbidden')}</span><textarea class="in" rows="3" data-guard="${u.id}" placeholder="name@company.com">${esc((au.guards[u.id] || []).join('\n'))}</textarea></label><p class="sub small">${t('forbiddenHint')}</p></div>`}`;
      }).join('');
      return `<div class="overlay" data-act="closeBg"><div class="modal one" role="dialog"><button class="mclose" data-act="closeAny" aria-label="Close">×</button><div class="mleft"><div class="bh">${t('usersTitle')}</div><p class="sub">${t('usersNote')}</p><p class="sub small">${t('rolesNote')}</p><p class="sub small">${t('modeNote')}</p>${rows}
        <div class="acts"><button class="btn sm" data-act="closeEdit">${t('close')}</button></div></div></div></div>`;
    }
    if (e.kind === 'send') {
      const s = S.send, can = !CLOUD || sup(), dis = can ? '' : 'disabled';
      const custom = Object.keys(RISK[s.level]).some((k) => s[k] !== RISK[s.level][k]);
      const num = (k) => `<input class="in nin" type="number" min="${SEND_LIMITS[k][0]}" max="${SEND_LIMITS[k][1]}" data-send="${k}" value="${+s[k]}" ${dis}>`;
      const row = (label, body) => `<div class="srow"><span class="lt">${label}</span><span class="sv">${body}</span></div>`;
      const tg = (k) => `<button class="tog" data-act="sendTog" data-k="${k}" ${dis}><span class="sw ${s[k] ? 'on' : ''}"><i></i></span><span>${t('send_' + k)}<small>${t('send_' + k + 'H')}</small></span></button>`;
      const lock = (k) => `<div class="tog lock"><span class="sw on"><i></i></span><span>${t(k)}<small>${t('sendLocked')}</small></span></div>`;
      const sum = t('sendSum').replace('{start}', s.start).replace('{step}', s.step).replace('{cap}', s.cap).replace('{a}', s.gapMin).replace('{b}', s.gapMax);
      return `<div class="overlay" data-act="closeBg"><div class="modal one" role="dialog"><button class="mclose" data-act="closeAny" aria-label="Close">×</button><div class="mleft">
        <div class="bh">${t('setSend')}</div><p class="sub">${t('sendNote')}</p>${can ? '' : `<p class="sub small">${t('sendAdminOnly')}</p>`}
        <div class="risk" style="--rc:${RISK_COLORS[s.level]}"><div class="rhead"><b>${t('risk_' + s.level)}</b>${custom ? `<span class="ty">${t('riskCustom')}</span>` : ''}</div>
          <input type="range" min="0" max="4" step="1" value="${s.level}" data-sendlevel ${dis} aria-label="${t('setSend')}">
          <div class="rends"><span>${t('riskLow')}</span><span>${t('riskHigh')}</span></div><p class="sub small">${t('riskH_' + s.level)}</p><p class="rsum">${sum}</p></div>
        <div class="bh sp2">${t('sendPerBox')}</div>
        ${row(t('sendStart'), num('start'))}${row(t('sendStep'), '+ ' + num('step'))}${row(t('sendCap'), num('cap'))}${row(t('sendGap'), num('gapMin') + ' – ' + num('gapMax'))}
        ${row(t('sendDomain'), num('perDomain'))}${row(t('sendBounce'), num('bounce') + ' %')}
        <div class="bh sp2">${t('sendWhen')}</div>
        ${row(t('sendHours'), num('from') + ' – ' + num('to'))}${tg('workdays')}${tg('jitter')}
        <div class="bh sp2">${t('sendHow')}</div>${tg('coldSecondary')}${tg('noTrack')}
        <div class="bh sp2">${t('sendAlways')}</div>${lock('lockApprove')}${lock('lockReply')}${lock('lockBounce')}${lock('lockStop')}
        <p class="sub small">${t('seqNote')}</p><div class="acts"><button class="btn sm" data-act="closeEdit">${t('close')}</button></div></div></div></div>`;
    }
    if (e.kind === 'profile') {
      const u = S.user;
      left = `<div class="bh">${t('profile')}</div><div class="imgrow"><div class="photo" tabindex="0" data-photo>${u.photo ? `<img src="${u.photo}" alt="">` : esc(initials(u.name))}</div>
          <div><label class="btn ghost sm filebtn">${t('uploadImage')}<input type="file" accept="image/*" data-file hidden></label>
          ${u.photo ? ` <button class="btn ghost sm" data-act="rmUserPhoto">${t('removeImage')}</button>` : ''}<p class="sub small">${t('photoHint')}</p></div></div>
        <label class="fl"><span>${t('name')}</span><input class="in big" data-u="name" value="${esc(u.name)}"></label>
        <label class="fl"><span>${t('email')}</span><input class="in" data-u="email" value="${esc(u.email)}"></label>`;
      right = `<div class="box"><div class="bh">${t('role')}</div><b>${t('admin')}</b></div><div class="box"><p class="sub">${t('profileNote')}</p></div>
        <div class="acts"><button class="btn sm" data-act="closeEdit">${t('close')}</button></div>`;
    } else if (e.kind === 'param') {
      const it = item(e.zone, e.id); if (!it) return '';
      const used = S.vectors.filter((v) => v[e.zone] === it.id).length;
      left = `<div class="bh">${t('zone_' + e.zone)}</div><div class="imgrow"><div class="photo sq" tabindex="0" data-photo title="${t('imageHint')}">${pic(e.zone, it, 'xl')}</div>
          <div><label class="btn ghost sm filebtn">${t('uploadImage')}<input type="file" accept="image/*" data-file hidden></label>
          ${it.img ? ` <button class="btn ghost sm" data-act="rmImg">${t('removeImage')}</button>` : ''}<p class="sub small">${t('imageHint')}</p></div></div>
        <label class="fl"><span>${t('name')}</span><input class="in big" data-pname value="${esc(it.name)}"></label>${paramSettings(e.zone, it)}`;
      const accBox = !CLOUD ? `<p class="sub">${t('accessNote')}</p>` : e.zone !== 'company' ? '' : !manages(it) ? `<p class="sub">${t('accessAdminOnly')}</p>`
        : au.users.filter((u) => u.id !== au.ownerUid && u.id !== au.uid && (u.role === 'user' || (u.role === 'admin' && sup()))).map((u) => `<div class="lrow col2"><span class="lt">${esc(u.name || u.email)}</span>${accSel(it, u)}</div>`).join('') + `<p class="sub small">${t('modeNote')}</p>`;
      right = `${accBox ? `<div class="box"><div class="bh">${t('access')}</div>${accBox}</div>` : ''}
        <div class="box"><div class="bh">${t('usedIn')}</div><b class="bigN">${used}</b></div>
        <div class="acts"><button class="btn ghost sm danger" data-act="delParam" ${used ? 'disabled' : ''} title="${used ? t('cannotDelete') : ''}">${ui.delArm ? t('delSure') : t('del')}</button>
        <button class="btn sm" data-act="closeEdit">${t('close')}</button></div>${used ? `<p class="sub small">${t('cannotDelete')}</p>` : ''}`;
    } else {
      const v = S.vectors.find((x) => x.id === e.id); if (!v) return '';
      left = `<div class="bh">${t('vector')}</div><div class="chev stack">${chevron(v, {})}</div>
        <div class="kvs">${ZONES.map((z) => `<div class="kv"><span>${t('zone_' + z)}</span><b>${esc((item(z, v[z]) || {}).name || '—')}</b></div>`).join('')}</div>
        <div class="brief"><div class="bh">${t('vecLetters')}</div>
          <button class="tog" data-act="vecOpt"><span class="sw ${optOf(v).on ? 'on' : ''}"><i></i></span><span>${t('footOn')}<small>${t('vecOptHint')}</small></span></button>
          ${optOf(v).on ? `<textarea class="in" rows="3" data-vopt placeholder="${t('footPh')}">${esc(optOf(v).text || '')}</textarea><p class="sub small">${t('footHint')}</p>` : ''}</div>`;
      const canShare = v.owner === au.uid || manages(item('company', v.company));
      const others = au.users.filter((u) => u.id !== v.owner && (u.role === 'admin' || u.role === 'user'));
      const share = !CLOUD ? `<p class="sub">${t('accessNote')}</p>` : (others.map((u) => `<button class="tog" data-act="vecMember" data-uid="${u.id}" ${canShare ? '' : 'disabled'}><span class="sw ${(v.members || []).includes(u.id) || u.role === 'admin' ? 'on' : ''}"><i></i></span><span>${esc(u.name || u.email)}${u.role === 'admin' ? ' · ' + t('acc_admin') : ''}</span></button>`).join('') || `<p class="sub">${t('noOthers')}</p>`)
        + (canShare ? '' : `<p class="sub small">${t('onlyOwner')}</p>`);
      right = `<div class="box"><div class="bh">${t('owner')}</div><b>${CLOUD ? esc(userName(v.owner)) : t('you')}</b></div><div class="box"><div class="bh">${CLOUD ? t('sharedWith') : t('access')}</div>${share}</div>
        <div class="box"><div class="bh">${t('vectorCards')}</div><b class="bigN">${S.cards.filter((c) => inVector(c, v)).length}</b></div>
        <div class="acts"><button class="btn ghost sm danger" data-act="delVector">${ui.delArm ? t('delSure') : t('del')}</button><button class="btn sm" data-act="closeEdit">${t('close')}</button></div>`;
    }
    return `<div class="overlay" data-act="closeBg"><div class="modal" role="dialog"><button class="mclose" data-act="closeAny" aria-label="Close">×</button><div class="mleft">${left}</div><div class="mright">${right}</div></div></div>`;
  }

  // ---------- widgets ----------
  function wAnalytics() {
    const contacts = myCards().filter((c) => c.type === 'contact');
    const at = (cs, s) => cs.filter((c) => c.stage !== 'lost' && stageIdx(c.stage) >= stageIdx(s)).length;
    const rate = (cs) => { const a = cs.filter((c) => c.stage !== 'new'); return a.length ? Math.round(100 * at(a, 'replied') / a.length) : 0; };
    const need = myCards().filter((c) => (c.awaiting && !closed(c)) || isDue(c)).length;
    const kp = [[at(contacts, 'meeting'), t('kMeetings'), 1], [at(contacts, 'signed'), t('kSigned'), 1], [rate(contacts) + '%', t('kRate')], [need, t('kNeed')]]
      .map((k) => `<div class="kpi ${k[2] ? 'main' : ''}"><b>${k[0]}</b><span>${k[1]}</span></div>`).join('');
    const seg = ZONES.map((z) => `<button class="chip ${ui.zone === z ? 'on' : ''}" data-act="zone" data-v="${z}">${t('zone_' + z)}</button>`).join('');
    let best = null;
    const rows = S.zones[ui.zone].map((it) => {
      const cs = contacts.filter((c) => c.vec[ui.zone] === it.id);
      const m = at(cs, 'meeting'), r = rate(cs);
      if (m && (!best || m > best.m)) best = { name: it.name, m };
      return `<tr><td>${esc(it.name)}</td><td>${cs.filter((c) => c.stage !== 'new').length}</td><td>${at(cs, 'replied')}</td><td>${m}</td><td>${at(cs, 'signed')}</td>
        <td><span class="bar"><i style="width:${r}%"></i></span>${r}%</td></tr>`;
    }).join('');
    return `<div class="kpis">${kp}</div><div class="bh sp">${t('effortBy')} <span class="seg2">${seg}</span></div>
      <table><tr><th></th><th>${t('contacted')}</th><th>${t('replies')}</th><th>${t('meetings')}</th><th>${t('signed')}</th><th>${t('kRate')}</th></tr>${rows}</table>
      <p class="hint"><b>${t('bestVector')}:</b> ${best ? `${esc(best.name)} — ${best.m}` : t('noData')}</p>`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function wCalendar() {
    const now = new Date(), first = new Date(now.getFullYear(), now.getMonth() + ui.cal, 1);
    const y = first.getFullYear(), m = first.getMonth(), days = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
    const key = (d) => `${y}-${pad(m + 1)}-${pad(d)}`;
    const ev = myCards().filter((c) => c.next && c.next.date && c.next.date.slice(0, 7) === key(1).slice(0, 7) && !c.done)
      .sort((a, b) => a.next.date.localeCompare(b.next.date));
    const loc = S.lang === 'uk' ? 'uk-UA' : 'en-GB';
    const wd = [...Array(7)].map((_, i) => `<span class="wd">${new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: 'short' })}</span>`).join('');
    let cells = '<span></span>'.repeat(lead);
    for (let d = 1; d <= days; d++) {
      const es = ev.filter((c) => c.next.date === key(d)), meet = es.some((c) => c.stage === 'meeting');
      cells += `<span class="day ${meet ? 'meet' : es.length ? 'other' : ''} ${key(d) === today() ? 'tod' : ''}" title="${esc(es.map((c) => c.title + (c.next.text ? ': ' + c.next.text : '')).join('\n'))}">${d}</span>`;
    }
    const list = ev.map((c) => `<button class="erow" data-act="open" data-id="${c.id}"><i class="${c.stage === 'meeting' ? 'meet' : 'other'}"></i><b>${c.next.date.slice(8)}</b><span>${esc(c.title)}${c.next.text ? ' · ' + esc(c.next.text) : ''}</span></button>`).join('')
      || `<p class="sub">${t('noEvents')}</p>`;
    return `<div class="calhead"><button class="dots" data-act="calPrev">‹</button><b>${first.toLocaleDateString(loc, { month: 'long', year: 'numeric' })}</b><button class="dots" data-act="calNext">›</button></div>
      <div class="cal">${wd}${cells}</div><div class="callegend"><span><i class="meet"></i>${t('calMeeting')}</span><span><i class="other"></i>${t('calOther')}</span></div><div class="elist">${list}</div>`;
  }
  function wImportant() {
    const cs = myCards().filter((c) => (c.awaiting && !closed(c)) || (isDue(c) && c.next.date < today()));
    return cs.map((c) => `<button class="erow" data-act="open" data-id="${c.id}"><span class="tyi">${svg(TYPE_ICONS[c.type])}</span><span><b>${esc(c.title)}</b> ${esc(cardSub(c))}</span>
      ${c.awaiting ? `<span class="rep">${t('replyWaiting')}</span>` : `<span class="due overdue">${t('overdue')}</span>`}</button>`).join('') || `<p class="sub">${t('impEmpty')}</p>`;
  }
  function wMail() {
    return S.zones.company.map((c) => `<div class="mh2"><i></i><span><b>${esc(primaryMailbox(c) || c.name)}</b><br><small>${t('stageLater')}</small></span></div>`).join('')
      + `<p class="sub small">${t('mailHealthNote')}</p>`;
  }
  function vWidgets() {
    const W = { analytics: [wAnalytics, 'wAnalytics'], calendar: [wCalendar, 'wCalendar'], important: [wImportant, 'wImportant'], mail: [wMail, 'wMail'] };
    return `<main class="body"><p class="sub dh">${t('dragHint')}</p><div class="wgrid">${S.widgets.filter((id) => W[id]).map((id) =>
      `<section class="box widget w-${id}" data-widget="${id}"><div class="bh wh" draggable="true" data-wgrip="${id}"><span><span class="grip">⠿</span>${t(W[id][1])}</span><span class="wmv"><button class="dots" data-act="wMove" data-id="${id}" data-d="-1">↑</button><button class="dots" data-act="wMove" data-id="${id}" data-d="1">↓</button></span></div>${W[id][0]()}</section>`).join('')}</div></main>`;
  }

  function vDatabase() {
    const tabs = ['library', 'documents', 'clients'].map((x) =>
      `<button class="chip ${ui.dbtab === x ? 'on' : ''}" data-act="dbtab" data-v="${x}">${t(x)}</button>`).join('');
    let body;
    if (ui.dbtab === 'library') {
      const rows = S.docs.slice().sort((a, b) => a.priority - b.priority).map((d) =>
        `<tr><td><span class="pr">${d.priority}</span></td><td>${esc(d.title)}</td><td>${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a>` : '—'}</td>
         <td>${esc((item('company', d.company) || {}).name || '')}</td><td><button class="link" data-act="rmDoc" data-id="${d.id}">×</button></td></tr>`).join('');
      body = `<p class="sub">${t('libSub')}</p><table><tr><th>${t('priority')}</th><th>${t('docTitle')}</th><th>${t('docUrl')}</th><th>${t('company')}</th><th></th></tr>${rows}</table>
        <form class="docform" data-docform><input class="in" name="title" placeholder="${t('docTitle')}" required><input class="in" name="url" placeholder="https://…">
        <select class="in" name="priority"><option>1</option><option>2</option><option>3</option></select><button class="btn sm">${t('addDoc')}</button></form>`;
    } else if (ui.dbtab === 'documents') {
      const rows = S.gdocs.map((d) => `<tr><td>${esc(d.no)}</td><td>${t('doc_' + d.type)}</td><td>${esc(d.client)}</td><td>${esc(d.date)}</td><td><span class="ty">${t('draft')}</span></td>
        <td><button class="link" data-act="rmGdoc" data-id="${d.id}">×</button></td></tr>`).join('');
      body = `<p class="sub">${t('docsSub')}</p>` + (rows ? `<table><tr><th>${t('docNo')}</th><th>${t('type')}</th><th>${t('client')}</th><th>${t('date')}</th><th>${t('status')}</th><th></th></tr>${rows}</table>` : `<p class="later">${t('noDocs')}</p>`);
    } else if (ui.dbtab === 'generator') {
      body = `<div class="genpanel"><span class="ty">${t('stageLater')}</span><h2>${t('genTitle')}</h2><p>${t('genHow')}</p>
        <div class="gtypes">${DOC_TYPES.map((x) => `<span class="gtype">${svg('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>')}${t('doc_' + x)}</span>`).join('')}</div><p class="sub">${t('genLater')}</p></div>`;
    } else {
      const q = (ui.cq || '').trim().toLowerCase(), tg = ui.ctag || '';
      const tagc = (x) => (x || []).map((y) => `<span class="tagc">#${esc(y)}</span>`).join(' ');
      const cards = S.cards.filter((c) => c.type === 'contact' || c.type === 'company'), leads = S.leads.filter((l) => !l.card);
      const tags = {}; cards.forEach((c) => (c.tags || []).forEach((x) => { tags[x] = (tags[x] || 0) + 1; })); leads.forEach((l) => (l.tags || []).forEach((x) => { tags[x] = (tags[x] || 0) + 1; }));
      const rows = cards.filter((c) => (!tg || (c.tags || []).includes(tg)) && (!q || [c.title, c.f.company, c.f.email].join(' ').toLowerCase().includes(q))).sort((a, b) => a.title.localeCompare(b.title))
        .map((c) => `<tr class="crowt" data-act="open" data-id="${c.id}"><td><span class="tyi">${svg(TYPE_ICONS[c.type])}</span> ${esc(c.title)}</td><td>${esc(c.type === 'contact' ? c.f.company || '' : c.f.country || '')}</td><td>${esc(c.f.email || c.f.website || '')}</td><td>${tagc(c.tags)}</td>
          <td><i class="sdot" style="background:${stageColor(c.stage)}"></i>${t('st_' + c.stage)}</td><td>${esc((item('company', (c.vec || {}).company) || {}).name || '')}</td><td>${CLOUD ? esc(userName(c.owner)) : t('you')}</td><td>${blockedWhy(c) ? `<span class="blk">${t('blockedBadge')}</span>` : ''}</td></tr>`).join('');
      const lrowsAll = leads.filter((l) => (!tg || (l.tags || []).includes(tg)) && (!q || [leadName(l), l.f.company, l.f.email].join(' ').toLowerCase().includes(q)));
      const lrows = lrowsAll.slice(0, 300).map((l) => { const cm = S.cards.find((x) => x.id === l.cid);
        return `<tr class="crowt" data-act="open" data-id="${l.cid}"><td>${esc(leadName(l) || '—')}</td><td>${esc(l.f.company || '')}</td><td>${esc(l.f.email || l.f.website || '')}</td><td>${tagc(l.tags)}</td>
          <td class="sub">${t('inCampaign')}: ${esc(cm ? cm.title : '')}</td><td>${esc((item('company', l.company) || {}).name || '')}</td><td>${CLOUD ? esc(userName(l.owner)) : t('you')}</td><td>${l.off ? `<span class="ty">${t('siteOff')}</span>` : ''}</td></tr>`; }).join('');
      const tchips = Object.keys(tags).length ? `<div class="vtabs"><button class="chip ${tg ? '' : 'on'}" data-act="ctag" data-v="">${t('all')}</button>${Object.keys(tags).sort().map((x) => `<button class="chip ${tg === x ? 'on' : ''}" data-act="ctag" data-v="${esc(x)}">#${esc(x)} · ${tags[x]}</button>`).join('')}</div>` : '';
      body = `<p class="sub">${t('clientsReal')}</p><input class="in search wide" data-cq placeholder="${t('searchClients')}" value="${esc(ui.cq || '')}">${tchips}`
        + (rows || lrows ? `<table class="ctable"><tr><th>${t('name')}</th><th>${t('company')}</th><th>${t('email')}</th><th>${t('tagsCol')}</th><th>${t('stage')}</th><th>${t('zone_company')}</th><th>${t('ownerCol')}</th><th></th></tr>${rows}${lrows}</table>
          ${lrowsAll.length > 300 ? `<p class="sub small">${t('shown')} 300 ${t('ofTotal')} ${lrowsAll.length}</p>` : ''}` : `<p class="later">${t('noClients')}</p>`);
    }
    return `<main class="body"><div class="tools flat">${tabs}<button class="btn sm gen ${ui.dbtab === 'generator' ? 'on' : ''}" data-act="dbtab" data-v="generator">${svg(UI_ICONS.spark)}${t('generate')}</button></div><section class="box">${body}</section></main>`;
  }

  // ---------- AI helper ----------
  function answer(q) {
    const cs = myCards();
    if (q === 'today') {
      const l = cs.filter((c) => (c.awaiting && !closed(c)) || isDue(c));
      return l.length ? l.map((c) => `• ${c.title}${c.awaiting ? ' — ' + t('replyWaiting') : c.next.text ? ' — ' + c.next.text : ''}`).join('\n') : t('ans_none');
    }
    if (q === 'meet') {
      const l = cs.filter((c) => c.stage === 'meeting');
      return l.length ? l.map((c) => `• ${c.next.date || '—'} · ${c.title}${c.f.company ? ', ' + c.f.company : ''}`).join('\n') : t('ans_none');
    }
    let best = null;
    myVectors().forEach((v) => { const n = cs.filter((c) => inVector(c, v) && c.type === 'contact' && c.stage !== 'lost' && stageIdx(c.stage) >= stageIdx('meeting')).length; if (n && (!best || n > best.n)) best = { v, n }; });
    return best ? `${t('ans_best')}: ${best.n}\n${ZONES.map((z) => (item(z, best.v[z]) || {}).name).join(' › ')}` : t('ans_bestNone');
  }
  function vAI() {
    if (!ui.ai) return '';
    let body;
    if (ui.aiView === 'guide') {
      body = `<button class="link" data-act="aiHome">${t('backHome')}</button><h2>${t('guideTitle')}</h2>${(GUIDE[S.lang] || GUIDE.en).map((g) => `<div class="gstep"><b>${g[0]}</b><p>${g[1]}</p></div>`).join('')}`;
    } else {
      const hello = S.guideSeen ? `<button class="mi" data-act="aiGuide"><span>${t('readGuide')}</span></button>`
        : `<div class="hello"><p>${t('aiHello')}</p><div class="acts"><button class="btn sm" data-act="aiGuide">${t('readGuide')}</button><button class="btn ghost sm" data-act="guideLater">${t('later')}</button></div></div>`;
      const log = ui.aiLog.map((x) => `<div class="bub q">${esc(t('qa_' + x))}</div><div class="bub a">${esc(answer(x))}</div>`).join('');
      body = `${hello}<div class="bh sp">${t('quick')}</div>${['today', 'meet', 'best'].map((q) => `<button class="chip" data-act="aiAsk" data-q="${q}">${t('qa_' + q)}</button>`).join('')}
        <div class="ailog">${log}</div><p class="sub small">${t('aiScope')}</p>`;
    }
    return `<aside class="aipanel"><div class="aihead"><b>${svg(UI_ICONS.spark)}${t('aiHelper')}</b><button class="dots" data-act="aiToggle">×</button></div>
      <div class="aibody">${body}</div><div class="aifoot"><input class="in" disabled placeholder="${t('aiSoon')}"></div></aside>`;
  }

  const MARK = '<svg class="mark" viewBox="0 0 30 22"><path d="M0 0h7l7 11-7 11H0l7-11z" opacity=".45"/><path d="M11 0h9l10 11-10 11h-9l8-11z"/></svg>';
  function vGate() {
    const body = au.status === 'loading' ? `<p class="sub">${t('loading')}</p>`
      : au.status === 'pending' ? `<h2>${t('gatePending')}</h2><p class="sub">${esc(S.user.email)}</p><p>${t('gatePendingSub')}</p><button class="btn ghost" data-act="signOut">${t('signOut')}</button>`
      : `<p>${t('gateSub')}</p><button class="btn" data-act="signIn">${t('gateSignIn')}</button>${au.err ? `<p class="err">${esc(au.err)}</p>` : ''}`;
    return `<main class="gate"><div class="gbox"><div class="logo">${MARK}<span class="bn"><b>VECTOR</b><small>Sales-co-pilot</small></span></div>${body}
      <button class="link" data-act="lang">EN / UA</button><div class="ver">${t('version')} ${VERSION}</div></div></main>`;
  }
  const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName); };

  function render() {
    if (au.status !== 'in') { document.getElementById('app').innerHTML = vGate(); return; }
    const view = { vector: vVector, board: vBoard, analytics: vWidgets, database: vDatabase }[S.view] || vVector;
    const html = view();
    const oldBoard = document.querySelector('.board'), keepX = oldBoard ? oldBoard.scrollLeft : 0;
    document.documentElement.lang = S.lang === 'uk' ? 'uk' : 'en';
    document.getElementById('app').innerHTML = top() + html +
      `<footer class="demo">VECTOR ${VERSION}${CLOUD ? ' · ' + esc(S.user.email) : ` · ${t('demo')} · <button class="link" data-act="reset">${t('reset')}</button>`}</footer>`
      + (ui.err ? `<div class="toast"><b>${t(ui.errAi ? 'aiErr' : 'saveErr')}</b><span>${esc(ui.err)}</span><button class="link" data-act="errClose">${t('dismiss')}</button></div>` : '') + vCardModal() + vEditModal() + vAI();
    const nb = document.querySelector('.board'); if (nb && keepX) nb.scrollLeft = keepX;
    const af = document.querySelector('[autofocus]'); if (af) af.focus();
    ui.fresh = null; ui.popped = null;
  }
  function commit() { save(); render(); }

  // ---------- actions ----------
  const cur = () => S.cards.find((c) => c.id === ui.open);
  const curParam = () => (ui.edit && ui.edit.kind === 'param' ? item(ui.edit.zone, ui.edit.id) : null);
  const A = {
    view(d) { S.view = d.v; ui.adding = null; commit(); },
    signIn() { au.err = ''; Cloud.signIn(); },
    signOut() { ui.menu = null; Cloud.signOut(); },
    usersOpen() { ui.edit = { kind: 'users' }; render(); },
    errClose() { ui.err = ''; ui.errAi = false; render(); },
    cvRefresh() { if (cur()) convoLoad(cur().id); },
    cvDraft(d) {
      const c = cur(); if (!c || ui.cvBusy) return; ui.cvBusy = d.e === 'gpt' ? 'gpt' : 'claude'; ui.cvNeed = null; ui.cvArm = false; render();
      Cloud.fn('convo', { cardId: c.id, op: 'draft', engine: ui.cvBusy, comment: ui.cvNote || '', draft: c.reply || '', ui: S.lang }, 130000).then((r) => {
        ui.cvBusy = ''; if (r.need) ui.cvNeed = { cid: c.id, list: r.need }; else { c.reply = r.body; save(); } render();
      }, (e) => { ui.cvBusy = ''; ui.err = convoWhy(e); ui.errAi = true; render(); });
    },
    // The first press arms the button, the second one sends: a letter cannot be taken back.
    cvSend() {
      const c = cur(); if (!c || ui.cvBusy || !String(c.reply || '').trim()) return;
      if (!ui.cvArm) { ui.cvArm = true; render(); return; }
      ui.cvArm = false; ui.cvBusy = 'send'; render();
      Cloud.fn('convo', { cardId: c.id, op: 'send', body: c.reply }, 70000).then((r) => {
        if (r && r.mail) c.mail = r.mail;
        ui.cvBusy = ''; ui.cvSent = c.id; c.reply = ''; c.awaiting = false; if (c.next && c.next.text === 'Answer the reply') c.next = { text: '', date: '' };
        commit(); convoLoad(c.id, true);
      }, (e) => { ui.cvBusy = ''; ui.err = convoWhy(e); ui.errAi = true; render(); });
    },
    seed() { S.zones = demoState().zones; let n = 0; ZONES.forEach((z) => S.zones[z].forEach((it) => { it.ord = ++n; it.by = au.uid; if (z === 'company') { it.s.mailboxes = []; it.access = {}; it.access[au.uid] = 'shared'; } })); commit(); },
    vecMember(d) {
      const v = S.vectors.find((x) => x.id === ui.edit.id); v.members = v.members || [];
      const i = v.members.indexOf(d.uid); if (i < 0) v.members.push(d.uid); else v.members.splice(i, 1);
      v.acl = [v.owner].concat(v.members);
      S.cards.concat(S.gdocs).forEach((c) => { if (c.vid === v.id) c.acl = v.acl.slice(); });
      commit();
    },
    moveCard(d) { const c = S.cards.find((x) => x.id === d.id), n = STAGES[stageIdx(c.stage) + +d.d]; if (n) { c.stage = n[0]; commit(); } },
    gotoStage(d) { const col = document.querySelector(`.col[data-stage="${d.stage}"]`); if (col) col.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); },
    wMove(d) { const i = S.widgets.indexOf(d.id), j = i + +d.d; if (i >= 0 && j >= 0 && j < S.widgets.length) { [S.widgets[i], S.widgets[j]] = [S.widgets[j], S.widgets[i]]; commit(); } },
    ctab(d) { ui.runArm = false; if (d.v === 'send' && CLOUD && cur() && cur().type === 'campaign') runPoll(ui.open);
      ui.ctab = d.v; ui.imp = null; ui.prev = -1; ui.delArm = false; render(); },
    leadImport() { const el = document.querySelector('[data-leadpaste]'); if (el && el.value.trim()) importLeads(cur(), el.value); },
    siteGo() { runCheck(ui.open); },
    siteStop() { if (ui.site) ui.site.stop = true; render(); },
    critAgain() { cur().check = null; commit(); },
    critAi() { critSuggest(ui.open); },
    // In the topic settings: AI reads the brief of this topic and fills in the criterion, the tag and the words.
    topicCrit() {
      const it = curParam(); if (!CLOUD || ui.critBusy) return; ui.critBusy = true; commit();
      setTimeout(() => Cloud.criterion({ topic: it.id }).then((r) => { ui.critBusy = false; it.s.crit = r.criterion || ''; it.s.tag = r.tag || ''; it.s.terms = (r.terms || []).join(', '); commit(); },
        (e) => { ui.critBusy = false; ui.err = String(e && e.message || e); ui.errAi = true; render(); }), 1800);
    },
    rf(d) { ui.rf = d.v; render(); },
    // Leaving people out is the user's decision: the check only proposes it.
    siteDrop() { const c = cur(), crit = critOf(c); S.leads.forEach((l) => { if (l.cid === c.id && (chkOf(l, crit) || {}).s === 'no') l.off = true; }); commit(); },
    siteBack() { const c = cur(); S.leads.forEach((l) => { if (l.cid === c.id) l.off = false; }); if (ui.rf === 'off') ui.rf = 'all'; commit(); },
    leadOff(d) { const l = S.leads.find((x) => x.id === d.id); if (l) l.off = !l.off; commit(); },
    listOk() { cur().listOk = true; ui.ctab = 'sequence'; commit(); },
    // AI looks for companies on the web; each becomes a recipient, with an address when the site shows one.
    findGo() {
      const c = cur(), q = (document.querySelector('[data-findq]') || {}).value || '', n = +((document.querySelector('[data-findn]') || {}).value || 10);
      if (!q.trim() || ui.finding) return; ui.findq = q; ui.findn = n; ui.finding = true; ui.found = null; render();
      const v = S.vectors.find((x) => x.id === c.vid), company = v ? v.company : (c.vec || {}).company;
      const have = {}; S.leads.forEach((l) => { if (l.cid === c.id) have[coKey(l)] = 1; });
      Cloud.find({ vid: c.vid, request: q, n, skip: Object.keys(have).filter((x) => !x.startsWith('name:')) }).then((r) => {
        ui.finding = false; const c2 = S.cards.find((x) => x.id === c.id); if (!c2) { render(); return; }
        const res = { co: 0, mail: 0 }, seen = {}; S.leads.forEach((l) => { if (l.company === company && l.f.email) seen[l.f.email] = 1; }); let ord = S.leads.length;
        (r.companies || []).forEach((x) => {
          if (have[hostOf(x.website)]) return; res.co++;
          const mails = (x.emails || []).filter((e) => !seen[e]); mails.forEach((e) => { seen[e] = 1; res.mail++; });
          (mails.length ? mails : ['']).forEach((e) => S.leads.push({ id: uid('L'), cid: c2.id, vid: c2.vid, company, owner: au.uid, acl: (c2.acl || []).slice(), ord: ord++, blocked: '', okEmail: CLOUD ? '' : e,
            f: { company: x.company, website: x.website, country: x.country || '', email: e, fit: x.why || '', source: 'AI search' } }));
        });
        ui.found = res; commit(); checkLeads();
      }).catch((e) => { ui.finding = false; ui.found = { err: String(e && e.message || e) }; render(); });
    },
    // Drafts every missing letter in turn: A1 by Claude, B1 by ChatGPT, then one reminder for each.
    seqAuto() {
      const c = cur(), q = seqOf(c); if (ui.busy || !CLOUD) return;
      if (!q.alt.B) q.alt.B = { who: '', steps: [newStep(0)] };
      ['A', 'B'].forEach((k) => { const st = k === 'A' ? q.steps : q.alt[k].steps; if (st.length < 2) st.push(newStep(4)); });
      const jobs = []; [0, 1].forEach((i) => ['A', 'B'].forEach((k) => { const st = (k === 'A' ? q.steps : q.alt[k].steps)[i]; if (!st.body.trim()) jobs.push([k, i]); }));
      commit(); const step = () => { const j = jobs.shift(); if (!j) { ui.auto = ''; render(); return; } ui.auto = j[0] + (j[1] + 1); ui.var = j[0];
        const st = (j[0] === 'A' ? seqOf(cur()).steps : seqOf(cur()).alt[j[0]].steps)[j[1]], m = modeOf(st, j[0]);
        aiRun(c.id, j[0], j[1], 'draft', m === 'gpt' ? 'gpt' : 'claude', '').then(step, () => { ui.auto = ''; render(); }); };
      step();
    },
    leadDel(d) { S.leads = S.leads.filter((l) => l.id !== d.id); commit(); },
    leadClear() { if (!ui.delArm) { ui.delArm = true; render(); return; } const id = ui.open; S.leads = S.leads.filter((l) => l.cid !== id); ui.delArm = false; ui.imp = null; commit(); },
    leadCard(d) {
      const l = S.leads.find((x) => x.id === d.id), c = cur(); if (!l) return;
      const k = { id: uid('k'), vid: c.vid, owner: au.uid, acl: (c.acl || []).slice(), ord: Date.now(), type: 'contact', stage: 'new', title: [l.f.firstName, l.f.lastName].filter(Boolean).join(' ') || l.f.company || l.f.email, vec: Object.assign({}, c.vec), parent: c.id,
        f: { jobTitle: l.f.jobTitle || '', company: l.f.company || '', email: l.f.email, phone: l.f.phone || '', linkedin: l.f.linkedin || '' }, next: { text: '', date: '' },
        awaiting: false, auto: { follow: false, reply: false, notify: true, draft: true }, notes: (l.chk && l.chk.ev) || '', photo: '', blocked: l.blocked || '', okEmail: l.okEmail || '', tags: (l.tags || []).slice() };
      S.cards.push(k); l.card = k.id; commit();
    },
    seqAdd() { const s = stepsOf(cur()); if (s.length < 5) s.push(newStep((+s[s.length - 1].day || 0) + (s.length === 1 ? 4 : 5))); commit(); },
    seqTab(d) { ui.var = d.v; ui.prev = -1; render(); },
    seqTabAdd() { const s = seqOf(cur()), k = ['B', 'C'].find((x) => !s.alt[x]); if (!k) return; s.alt[k] = { who: '', steps: [newStep(0)] }; ui.var = k; ui.prev = -1; commit(); },
    seqTabDel() { const s = seqOf(cur()), k = curVar(s); if (k === 'A') return; delete s.alt[k]; ui.var = 'A'; ui.prev = -1; commit(); },
    seqDel(d) { stepsOf(cur()).splice(+d.i, 1); ui.prev = -1; commit(); },
    sendOpen() { ui.edit = { kind: 'send' }; ui.menu = null; render(); },
    sendTog(d) { S.send[d.k] = !S.send[d.k]; commit(); },
    toneToggle(d) { const s = curParam().s; s.tones = s.tones || []; const i = s.tones.indexOf(d.v); if (i < 0) s.tones.push(d.v); else s.tones.splice(i, 1); commit(); },
    vecOpt() { const v = S.vectors.find((x) => x.id === ui.edit.id), o = optOf(v); v.opt = { on: !o.on, text: o.text || OPT_TEXT + '\n' + ((item('company', v.company) || {}).name || '') }; commit(); },
    cardOpt() { const c = cur(), v = S.vectors.find((x) => x.id === c.vid); c.optOut = !optOn(c, v); commit(); },
    // Starting sends real mail, so the button asks once more before it does.
    runStart() {
      const c = cur(); if (!CLOUD) return;
      if (!ui.runArm) { ui.runArm = true; render(); return; }
      ui.runArm = false; ui.run = { cid: c.id, busy: true }; if (c.stage === 'new') c.stage = 'contacted'; commit();
      setTimeout(() => Cloud.fn('campaignStart', { cardId: c.id, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }, 130000)
        .then(() => runPoll(c.id), (e) => { ui.run = { cid: c.id, err: runWhy(e) }; render(); }), 2200);
    },
    runStop() { const c = cur(); if (!ui.stopArm) { ui.stopArm = true; render(); setTimeout(() => { ui.stopArm = false; }, 6000); return; } ui.stopArm = false;
      Cloud.fn('campaignStop', { cardId: c.id }).then(() => runPoll(c.id), (e) => { ui.err = runWhy(e); ui.errAi = true; render(); }); },
    runRefresh() { runPoll(ui.open); },
    mbFoot(d) {
      const it = curParam(), m = it.s.mailboxes[+d.i]; m.footOn = !m.footOn;
      if (m.footOn && !m.foot) m.foot = 'Not relevant? Reply "no" and I will not write again.\n' + it.name;
      commit();
    },
    seqApprove(d) { const st = stepsOf(cur())[+d.i]; st.status = st.status === 'approved' ? 'draft' : 'approved'; commit(); },
    aiGo(d) { const el = document.querySelector(`[data-cmt="${d.i}"]`); aiRun(ui.open, curVar(seqOf(cur())), +d.i, d.op, d.eng, el ? el.value : '').catch(() => {}); },
    // The answers go into the notes of the card, which are part of what AI reads; then the letter is asked for again.
    needGo(d) {
      const c = cur(), q = seqOf(c), k = curVar(q), st = stepsOf(c)[+d.i], el = document.querySelector(`[data-needans="${d.i}"]`), a = el ? el.value.trim() : '';
      if (!a) { ui.err = t('needEmpty'); ui.errAi = true; render(); return; }
      c.notes = [c.notes, (st.need || []).map((x) => '- ' + x).join('\n'), a].filter((x) => String(x || '').trim()).join('\n'); st.need = null; commit();
      const m = modeOf(st, k); setTimeout(() => aiRun(c.id, k, +d.i, 'draft', m === 'gpt' ? 'gpt' : 'claude', '').catch(() => {}), 1500);
    },
    needHide(d) { stepsOf(cur())[+d.i].need = null; commit(); },
    seqApply(d) { const st = stepsOf(cur())[+d.i], r = st.review; if (!r) return; st.subject = r.subject; st.body = r.body; st.status = 'reviewed'; st.review = null; commit(); },
    seqRevHide(d) { stepsOf(cur())[+d.i].review = null; commit(); },
    seqPreview(d) { ui.prev = ui.prev === +d.i ? -1 : +d.i; render(); },
    seqVar(d) {
      const st = stepsOf(cur())[+d.i], el = document.querySelector(`[data-seq="${d.i}|body"]`), pos = el ? el.selectionStart : st.body.length;
      st.body = st.body.slice(0, pos) + '{{' + d.v + '}}' + st.body.slice(pos); st.status = 'draft'; commit();
    },
    taskDone(d) { const c = S.cards.find((x) => x.id === d.id); c.done = !c.done; commit(); },
    calPrev() { ui.cal--; render(); },
    calNext() { ui.cal++; render(); },
    aiToggle() { ui.ai = !ui.ai; if (!ui.ai && !S.guideSeen) { S.guideSeen = true; save(); } render(); },
    aiGuide() { ui.aiView = 'guide'; S.guideSeen = true; commit(); },
    aiHome() { ui.aiView = 'home'; render(); },
    guideLater() { S.guideSeen = true; ui.ai = false; commit(); },
    aiAsk(d) { ui.aiLog.push(d.q); render(); const l = document.querySelector('.aibody'); if (l) l.scrollTop = l.scrollHeight; },
    prepDoc() {
      const c = cur(), sel = document.querySelector('[data-doctype]');
      S.gdocs.push({ id: uid('g'), vid: c.vid, acl: (c.acl || []).slice(), ord: Date.now(), no: 'D-' + String(S.gdocs.length + 1).padStart(4, '0'), type: sel.value, card: c.id,
        client: c.type === 'contact' ? [c.title, c.f.company].filter(Boolean).join(', ') : c.title, date: today() });
      commit();
    },
    rmGdoc(d) { S.gdocs = S.gdocs.filter((x) => x.id !== d.id); commit(); },
    userMenu() { ui.menu = ui.menu === 'user' ? null : 'user'; render(); },
    editProfile() { ui.edit = { kind: 'profile' }; ui.menu = null; render(); },
    rmUserPhoto() { S.user.photo = ''; commit(); },
    legendOpen() { S.view = 'board'; ui.legendEdit = true; commit(); },
    legendEdit() { ui.legendEdit = true; render(); },
    legendDone() { ui.legendEdit = false; render(); },
    lgAdd() { S.legend.push({ id: uid('l'), color: '#6B7280', label: '' }); commit(); },
    lgRemove(d) { S.legend = S.legend.filter((l) => l.id !== d.id); S.cards.forEach((c) => { if (c.color === d.id) c.color = ''; }); if (ui.fcolor === d.id) ui.fcolor = ''; commit(); },
    fcolor(d) { ui.fcolor = ui.fcolor === d.id ? '' : d.id; render(); },
    setColor(d) { cur().color = d.id; commit(); },
    lang() { S.lang = S.lang === 'en' ? 'uk' : 'en'; commit(); },
    pick(d) {
      if (S.draft[d.zone] === d.id) delete S.draft[d.zone]; else { S.draft[d.zone] = d.id; ui.popped = d.zone; }
      if (d.zone === 'company') delete S.draft.direction;
      commit();
    },
    unpick(d) { delete S.draft[d.zone]; if (d.zone === 'company') delete S.draft.direction; commit(); },
    fixVector() {
      if (!draftComplete() || sameVector(S.draft)) return;
      const v = { id: uid('v'), owner: au.uid, members: [], acl: [au.uid], ord: Date.now() }; ZONES.forEach((z) => { v[z] = S.draft[z]; });
      S.vectors.unshift(v); S.draft = {}; ui.fresh = v.id; commit();
      const top = document.querySelector('.vtop'); if (top) top.scrollTop = 0;
    },
    openVector(d) { S.active = d.id; S.view = 'board'; ui.q = ''; commit(); },
    editVector(d) { ui.edit = { kind: 'vector', id: d.id }; ui.delArm = false; render(); },
    editParam(d) { ui.edit = { kind: 'param', zone: d.zone, id: d.id }; ui.delArm = false; render(); },
    closeEdit() { ui.edit = null; render(); },
    delVector() {
      if (!ui.delArm) { ui.delArm = true; render(); return; }
      const gone = ui.edit.id; S.vectors = S.vectors.filter((v) => v.id !== gone); S.cards = S.cards.filter((c) => c.vid !== gone); S.gdocs = S.gdocs.filter((g) => g.vid !== gone); S.leads = S.leads.filter((l) => l.vid !== gone); if (S.active === gone) S.active = ''; ui.edit = null; commit();
    },
    delParam() {
      if (!ui.delArm) { ui.delArm = true; render(); return; }
      const e = ui.edit; S.zones[e.zone] = S.zones[e.zone].filter((x) => x.id !== e.id);
      if (S.draft[e.zone] === e.id) delete S.draft[e.zone]; ui.edit = null; commit();
    },
    rmImg() { curParam().img = ''; commit(); },
    // Sends a test letter from this mailbox to the person's own sign-in address. Settings are saved first so the server sees the mailbox.
    mbTest(d) {
      const it = curParam(), m = it.s.mailboxes[+d.i]; if (ui.mbBusy || !CLOUD) return;
      ui.mbBusy = m.email; ui.mbRes = null; commit();
      setTimeout(() => Cloud.mailTest({ company: it.id, email: m.email })
        .then((r) => { ui.mbBusy = ''; ui.mbRes = { email: m.email, ok: true, text: t('mbTestOk') + ' ' + r.to }; render(); },
          (e) => { ui.mbBusy = ''; ui.mbRes = { email: m.email, ok: false, text: String(e && e.message || e) }; render(); }), 1800);
    },
    mbSigClear(d) { const m = curParam().s.mailboxes[+d.i]; m.sigHtml = ''; ui.sigOpen = m.email; commit(); },
    mbSigPlain(d) {
      const it = curParam(), m = it.s.mailboxes[+d.i], site = String(it.s.website || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      m.sig = [S.user.name, it.name, site].filter(Boolean).join('\n'); commit();
    },
    mbPrimary(d) { const ms = curParam().s.mailboxes, own = ms[+d.i].owner; ms.forEach((m, i) => { if (m.owner === own) m.primary = i === +d.i; }); commit(); },
    mbRemove(d) { const m = curParam().s.mailboxes, own = m[+d.i].owner; m.splice(+d.i, 1); const rest = m.filter((x) => x.owner === own); if (rest.length && !rest.some((x) => x.primary)) rest[0].primary = true; commit(); },
    crRemove(d) { curParam().s.criteria.splice(+d.i, 1); commit(); },
    senToggle(d) { const s = curParam().s; s.seniority = s.seniority || []; const i = s.seniority.indexOf(d.v); if (i < 0) s.seniority.push(d.v); else s.seniority.splice(i, 1); commit(); },
    addItem(d) { ui.adding = d.zone; render(); },
    addCard(d) { ui.adding = 'st:' + d.stage; render(); },
    ftype(d) { ui.ftype = d.v; render(); },
    fdue() { ui.fdue = !ui.fdue; render(); },
    zone(d) { ui.zone = d.v; render(); },
    dbtab(d) { ui.dbtab = d.v; render(); },
    ctag(d) { ui.ctag = d.v; render(); },
    open(d) { ui.open = d.id; ui.delArm = false; ui.ctab = 'details'; ui.imp = null; ui.prev = -1; ui.lq = ''; render(); },
    close() { ui.open = null; render(); },
    closeAny() { ui.open = null; ui.edit = null; render(); },
    closeBg(d, e) { if (e.target.classList.contains('overlay')) { ui.open = null; ui.edit = null; render(); } },
    auto(d) { const c = cur(); c.auto[d.k] = !c.auto[d.k]; commit(); },
    awaiting() { const c = cur(); c.awaiting = !c.awaiting; commit(); },
    rmPhoto() { cur().photo = ''; commit(); },
    clone() {
      const c = cur(); const n = JSON.parse(JSON.stringify(c));
      n.id = uid('k'); n.owner = au.uid; n.blocked = ''; n.ord = Date.now(); n.title = c.title + ' (2)'; S.cards.push(n); ui.open = n.id; commit();
    },
    del() {
      if (!ui.delArm) { ui.delArm = true; render(); return; }
      S.cards = S.cards.filter((c) => c.id !== ui.open); S.leads = S.leads.filter((l) => l.cid !== ui.open); ui.open = null; commit();
    },
    rmDoc(d) { S.docs = S.docs.filter((x) => x.id !== d.id); commit(); },
    reset() { S = demoState(); S.send = defaultSend(); S.leads = []; S.guideSeen = true; ui.aiLog = []; ui.open = null; ui.edit = null; ui.fcolor = ''; ui.legendEdit = false; commit(); },
  };

  function newParam(zone, name) {
    const it = { id: uid(zone[0]), name, img: '', s: {}, ord: Date.now(), by: au.uid };
    if (zone === 'company') { it.s = { website: '', signature: name, mailboxes: [] }; it.access = {}; it.access[au.uid] = 'shared'; it.acl = [au.uid]; }
    if (zone === 'audience' || zone === 'topic') it.acl = ['*'];
    if (zone === 'direction') { it.company = S.draft.company; it.s = { desc: '', criteria: [] }; it.acl = ((item('company', it.company) || {}).acl || [au.uid]).slice(); }
    S.zones[zone].push(it); return it;
  }
  // Store a pasted or uploaded picture, scaled down, on the open card or parameter.
  function takeImage(file) {
    const c = cur(), p = curParam(), prof = ui.edit && ui.edit.kind === 'profile'; if (!file || (!c && !p && !prof)) return;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 200 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      if (prof) S.user.photo = cv.toDataURL('image/jpeg', 0.85); else if (p) p.img = cv.toDataURL('image/png'); else c.photo = cv.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src); commit();
    };
    img.src = URL.createObjectURL(file);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (ui.menu && !e.target.closest('.right')) { ui.menu = null; if (!el) { render(); return; } }
    if (!el || el.tagName === 'A' || el.disabled) return;
    const fn = A[el.dataset.act]; if (fn) fn(el.dataset, e);
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Escape') {
      if (ui.adding) { ui.adding = null; render(); } else if (ui.open || ui.edit) { ui.open = null; ui.edit = null; render(); }
      return;
    }
    if (e.key !== 'Enter') return;
    if (el.classList && el.classList.contains('pi')) { el.click(); return; }
    if (!el.value || !el.value.trim() || el.tagName === 'TEXTAREA') return;
    const v = el.value.trim(), p = curParam();
    if (el.dataset.add) {
      const z = el.dataset.add, it = newParam(z, v); S.draft[z] = it.id; ui.popped = z;
      if (z === 'company') delete S.draft.direction;
      ui.adding = null; commit();
    } else if (el.dataset.addcard) {
      const av = activeVector(), vec = {}; ZONES.forEach((z) => { vec[z] = av[z]; });
      S.cards.push({ id: uid('k'), vid: av.id, owner: au.uid, acl: (av.acl || []).slice(), ord: Date.now(), type: 'task', stage: el.dataset.addcard, title: v, vec, f: {}, next: { text: '', date: '' },
        awaiting: false, auto: { follow: false, reply: false, notify: true, draft: true }, notes: '', photo: '' });
      commit();
    } else if (el.dataset.listadd && p) {
      const k = el.dataset.listadd; p.s[k] = p.s[k] || [];
      p.s[k].push(k === 'mailboxes' ? { email: v, owner: au.uid, primary: !p.s[k].some((m) => m.owner === au.uid) } : v); commit();
      const n = document.querySelector(`[data-listadd="${k}"]`); if (n) n.focus();
    }
  });
  // Field edits save without re-rendering, so typing is never interrupted.
  document.addEventListener('input', (e) => {
    const el = e.target, c = cur(), p = curParam();
    if (el.hasAttribute('data-search')) { ui.q = el.value; const pos = el.selectionStart; render(); const n = document.querySelector('[data-search]'); n.focus(); n.setSelectionRange(pos, pos); return; }
    if (el.hasAttribute('data-lq')) { ui.lq = el.value; const pos = el.selectionStart; render(); const n = document.querySelector('[data-lq]'); n.focus(); n.setSelectionRange(pos, pos); return; }
    if (el.dataset.crit && c) { const e = checkCfg(c), k = c.check = { crit: e.crit, tag: e.tag, terms: e.terms }; if (el.dataset.crit === 'terms') k.terms = termList(el.value); else if (el.dataset.crit === 'tag') k.tag = tagOf(el.value); else k.crit = el.value; save(); return; }
    if (el.hasAttribute('data-findq')) { ui.findq = el.value; return; }
    if (el.hasAttribute('data-vopt') && ui.edit) { const v = S.vectors.find((x) => x.id === ui.edit.id); v.opt = { on: true, text: el.value }; save(); return; }
    if (el.hasAttribute('data-cmt') || el.dataset.lemail || el.dataset.needans) return;
    if (el.hasAttribute('data-seqwho') && c) { const q = seqOf(c), k = curVar(q); if (k === 'A') q.whoA = el.value; else q.alt[k].who = el.value; save(); return; }
    if (el.dataset.seq && c) {
      const [i, k] = el.dataset.seq.split('|'), st = stepsOf(c)[+i]; st[k] = k === 'day' ? Math.max(0, +el.value || 0) : el.value;
      // Changing an approved letter sends it back to draft, so nothing unapproved can ever be sent.
      const box = el.closest('.step'), btn = box && box.querySelector('[data-act="seqApprove"]');
      if (k !== 'day' && st.status !== 'draft') { st.status = 'draft'; if (box) { box.className = 'step st-draft'; box.querySelector('.stt').textContent = t('seq_draft'); if (btn) btn.textContent = t('approve'); } }
      if (btn) btn.disabled = !stepReady(st, +i);
      document.querySelectorAll(`[data-act="aiGo"][data-i="${i}"]`).forEach((b) => { if (b.dataset.op !== 'draft') b.disabled = !CLOUD || !!ui.busy || !st.body.trim(); });
      save(); return;
    }
    if (el.hasAttribute('data-cq')) { ui.cq = el.value; const pos = el.selectionStart; render(); const n = document.querySelector('[data-cq]'); n.focus(); n.setSelectionRange(pos, pos); return; }
    if (el.dataset.u) { S.user[el.dataset.u] = el.value; save(); return; }
    if (el.dataset.lgname) { legendOf(el.dataset.lgname).label = el.value; save(); return; }
    if (el.dataset.lgcolor) { legendOf(el.dataset.lgcolor).color = el.value; save(); return; }
    if (p && el.dataset.mbsightml) { const m = p.s.mailboxes[+el.dataset.mbsightml]; m.sigHtml = el.value.slice(0, 80000); ui.sigOpen = m.email; save(); return; }
    if (p && el.dataset.mbfoot) { p.s.mailboxes[+el.dataset.mbfoot].foot = el.value; save(); return; }
    if (p && el.dataset.mbname) { p.s.mailboxes[+el.dataset.mbname].name = el.value.slice(0, 80); save(); return; }
    if (p && el.dataset.mbsig) { p.s.mailboxes[+el.dataset.mbsig].sig = el.value; save(); return; }
    if (p && el.dataset.s) { p.s[el.dataset.s] = el.value; save(); return; }
    if (p && el.hasAttribute('data-pname')) { p.name = el.value; save(); return; }
    if (!c) return;
    if (el.hasAttribute('data-cvreply')) { const was = !!String(c.reply || '').trim(); c.reply = el.value; ui.cvArm = false; ui.cvSent = ''; save(); if (was !== !!el.value.trim()) render(); return; }
    if (el.hasAttribute('data-cvnote')) { ui.cvNote = el.value; return; }
    if (el.dataset.f) c.f[el.dataset.f] = el.value;
    else if (el.dataset.next) c.next[el.dataset.next] = el.value;
    else if (el.dataset.top === 'title' || el.dataset.top === 'notes') c[el.dataset.top] = el.value;
    else return;
    save();
  });
  document.addEventListener('change', (e) => {
    const el = e.target, c = cur();
    if (el.hasAttribute('data-file')) { takeImage(el.files[0]); return; }
    if (el.hasAttribute('data-leadfile')) { const f = el.files[0]; if (f && c) f.text().then((txt) => importLeads(c, txt)); return; }
    if (el.hasAttribute('data-seqfrom') && c) { seqOf(c).from = el.value; commit(); return; }
    if (el.hasAttribute('data-seqsplit') && c) { seqOf(c).split = el.value; commit(); return; }
    if (el.hasAttribute('data-seqwho') && c) { render(); return; }
    if (el.dataset.crit && c) { render(); return; }
    if (el.dataset.mbsightml) { render(); return; }
    if (el.dataset.mbsigfile && el.files && el.files[0]) {
      const it = curParam(), i = +el.dataset.mbsigfile, rd = new FileReader();
      rd.onload = () => { const m = it.s.mailboxes[i]; m.sigHtml = String(rd.result || '').slice(0, 80000); ui.sigOpen = m.email; commit(); };
      rd.readAsText(el.files[0]); return;
    }
    if (el.dataset.lemail) { const l = S.leads.find((x) => x.id === el.dataset.lemail), e = el.value.trim().toLowerCase(); if (l && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { l.f.email = e; if (!CLOUD) l.okEmail = e; commit(); checkLeads(); } return; }
    if (el.dataset.stepmode && c) { stepsOf(c)[+el.dataset.stepmode].mode = el.value; commit(); return; }
    if (el.hasAttribute('data-seqlang') && c) { seqOf(c).lang = el.value; commit(); return; }
    if (el.hasAttribute('data-sequnit') && c) { seqOf(c).unit = el.value; commit(); return; }
    // The slider loads a ready set of limits; each number can then be changed, but never past the red zone.
    if (el.hasAttribute('data-sendlevel')) { S.send.level = +el.value; Object.assign(S.send, RISK[S.send.level]); commit(); return; }
    if (el.dataset.send) {
      const k = el.dataset.send, lim = SEND_LIMITS[k], s = S.send; s[k] = Math.min(lim[1], Math.max(lim[0], Math.round(+el.value) || lim[0]));
      if (s.start > s.cap) s.start = s.cap; if (s.gapMax <= s.gapMin) s.gapMax = s.gapMin + 1; if (s.to <= s.from) s.to = Math.min(24, s.from + 1);
      commit(); return;
    }
    if (el.hasAttribute('data-show')) { S.show = el.value; commit(); return; }
    if (el.dataset.urole) { const u = au.users.find((x) => x.id === el.dataset.urole); if (u) u.role = el.value; Cloud.setRole(el.dataset.urole, el.value); render(); return; }
    if (el.dataset.cacc) {
      const [u, cid] = el.dataset.cacc.split('|'), co = item('company', cid); co.access = co.access || {};
      co.managers = managersOf(co).filter((x) => x !== u);
      if (el.value === 'manage') { delete co.access[u]; co.managers.push(u); } else if (el.value) co.access[u] = el.value; else delete co.access[u];
      commit(); return;
    }
    if (el.dataset.guard) { const list = el.value.split('\n').map((x) => x.trim()).filter(Boolean); au.guards[el.dataset.guard] = list; Cloud.setGuard(el.dataset.guard, list); return; }
    // When a contact's email is entered, ask the server whether another manager already works with this person.
    if (c && el.dataset.f === 'email' && c.type === 'contact' && CLOUD) {
      const email = el.value.trim().toLowerCase(), company = (c.vec || {}).company;
      if (!email || !company) { c.blocked = ''; c.okEmail = ''; commit(); return; }
      Cloud.takenBy(takenId(company, email)).then((owner) => { c.blocked = owner && owner !== c.owner ? 'taken' : ''; c.okEmail = c.blocked ? '' : email; commit(); });
      return;
    }
    if (c && (el.dataset.top === 'type' || el.dataset.top === 'stage')) { c[el.dataset.top] = el.value; commit(); }
  });
  document.addEventListener('submit', (e) => {
    if (!e.target.hasAttribute('data-docform')) return;
    e.preventDefault(); const f = new FormData(e.target), av = activeVector();
    S.docs.push({ id: uid('x'), title: f.get('title'), url: f.get('url'), priority: +f.get('priority'), company: av ? av.company : '' }); commit();
  });
  // Drag a card to another stage.
  let drag = null, dragW = null;
  document.addEventListener('dragstart', (e) => {
    const c = e.target.closest('[data-card]'), w = e.target.closest('[data-wgrip]');
    if (c) { drag = c.dataset.card; dragW = null; e.dataTransfer.effectAllowed = 'move'; }
    else if (w) { dragW = w.dataset.wgrip; drag = null; e.dataTransfer.effectAllowed = 'move'; const box = w.closest('.widget'); if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(box, 20, 20); }
  });
  document.addEventListener('dragover', (e) => {
    const col = e.target.closest('.col'), w = e.target.closest('[data-widget]');
    if (col && drag) { e.preventDefault(); col.classList.add('over'); }
    if (w && dragW && w.dataset.widget !== dragW) { e.preventDefault(); w.classList.add('over'); }
  });
  document.addEventListener('dragleave', (e) => { const x = e.target.closest('.col,[data-widget]'); if (x && !x.contains(e.relatedTarget)) x.classList.remove('over'); });
  document.addEventListener('drop', (e) => {
    const col = e.target.closest('.col'), w = e.target.closest('[data-widget]');
    if (col && drag) { e.preventDefault(); const c = S.cards.find((x) => x.id === drag); drag = null; if (c) { c.stage = col.dataset.stage; commit(); } return; }
    if (w && dragW) {
      e.preventDefault(); const a = S.widgets.indexOf(dragW), b = S.widgets.indexOf(w.dataset.widget); dragW = null;
      if (a >= 0 && b >= 0) { [S.widgets[a], S.widgets[b]] = [S.widgets[b], S.widgets[a]]; commit(); }
    }
  });
  document.addEventListener('dragend', () => { drag = null; dragW = null; });
  document.addEventListener('paste', (e) => {
    if (!document.querySelector('[data-photo]')) return;
    const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith('image/')); if (!f) return;
    e.preventDefault(); takeImage(f);
  });

  if (CLOUD) {
    Cloud.init(window.FIREBASE_CONFIG, {
      auth(a) {
        Object.assign(au, { err: '' }, a);
        ui.adding = null; ui.q = ''; ui.ctab = 'details'; ui.imp = null;
        if (a.user) S.user = { name: a.user.name || '', email: a.user.email || '', photo: a.user.photo || '' };
        if (a.status !== 'in') { au.users = []; ui.open = null; ui.edit = null; } else { S.view = 'vector'; S.draft = {}; if (a.role !== 'admin' && S.show !== 'mine' && S.show !== 'all') S.show = ''; }
        render();
      },
      // Server data replaces the matching part of the state; the screen is not redrawn under someone who is typing.
      data(name, d) {
        if (name === 'params') ZONES.forEach((z) => { S.zones[z] = d.filter((p) => p.zone === z).sort(ord); });
        else if (name === 'vectors') S.vectors = d.sort((a, b) => ord(b, a));
        else if (name === 'cards') S.cards = d.sort(ord);
        else if (name === 'gdocs') S.gdocs = d.sort(ord);
        else if (name === 'leads') S.leads = d.sort(ord);
        else if (name === 'users') au.users = d;
        else if (name === 'guards') { au.guards = {}; d.forEach((g) => { au.guards[g.id] = g.list || []; }); }
        else if (name === 'taken') S.taken = d;
        else if (name === 'workspace') { S.legend = (d && d.legend) || S.legend; S.docs = (d && d.docs) || []; S.send = Object.assign(defaultSend(), d && d.send); }
        // Parameters created before access lists existed get them from the admin's program, once.
        if (name === 'params' && au.super) setTimeout(() => {
          let fixed = false;
          S.zones.company.forEach((co) => { if (!co.access) { co.access = {}; co.access[au.uid] = 'shared'; fixed = true; } });
          ZONES.forEach((z) => S.zones[z].forEach((it) => { if (!it.acl) fixed = true; if (!it.by) { it.by = au.uid; fixed = true; } }));
          if (fixed) save();
        }, 0);
        if (!typing()) render();
      },
      collect() {
        const out = { params: {}, vectors: {}, cards: {}, gdocs: {}, leads: {}, taken: {}, workspace: { shared: { legend: S.legend, docs: S.docs, send: S.send || defaultSend() } } };
        ZONES.forEach((z) => S.zones[z].forEach((it) => { out.params[it.id] = Object.assign({}, it, { zone: z }); }));
        S.vectors.forEach((v) => { out.vectors[v.id] = v; }); S.cards.forEach((c) => { out.cards[c.id] = c; }); S.gdocs.forEach((g) => { out.gdocs[g.id] = g; }); (S.taken || []).forEach((x) => { out.taken[x.id] = x; }); S.leads.forEach((l) => { out.leads[l.id] = l; });
        return out;
      },
      error(e) { ui.err = e && e.message ? e.message : String(e); ui.errAi = false; render(); },
    });
  }
  render();
})();
