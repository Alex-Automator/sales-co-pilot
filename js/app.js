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
  const sigOf = (co, email) => { const m = ((co && co.s.mailboxes) || []).find((x) => x.email === email) || {}; return [m.sig, m.footOn && m.foot].filter(Boolean).join('\n\n'); };
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
    S.zones.company.forEach((co) => { if (co.access || co.managers) co.acl = uniq(Object.keys(co.access || {}).concat(managersOf(co))); });
    S.vectors.forEach((v) => { const co = item('company', v.company); if (co && (v.owner === au.uid || manages(co))) v.acl = uniq([v.owner].concat(v.members || [], managersOf(co))); });
    S.zones.direction.forEach((d) => { const co = item('company', d.company); if (co && co.acl) d.acl = co.acl.slice(); });
    ['audience', 'topic'].forEach((z) => S.zones[z].forEach((it) => { if (!it.acl) it.acl = ['*']; }));
    const aclFor = (c, type) => {
      const v = S.vectors.find((x) => x.id === c.vid), co = v && item('company', v.company); if (!v || !co) return c.acl || [];
      const a = (v.acl || [v.owner]).slice();
      if (type !== 'task' && co.access) Object.keys(co.access).forEach((u) => { if (co.access[u] === 'shared' && !a.includes(u)) a.push(u); });
      return a;
    };
    S.cards.forEach((c) => { c.acl = aclFor(c, c.type); if (!c.owner) { const v = S.vectors.find((x) => x.id === c.vid); if (v) c.owner = v.owner; } });
    S.gdocs.forEach((g) => { g.acl = aclFor(g, 'doc'); });
    S.leads.forEach((l) => { l.acl = aclFor(l, 'lead'); });
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
  // Website check: one request per company website, at most three at a time; the answer is written to every recipient of that company.
  function siteCheck(cid) {
    const c = S.cards.find((x) => x.id === cid), q = ((c && c.check) || {}).q || ''; if (!c || !q.trim() || ui.site) return;
    const mine = () => S.leads.filter((l) => l.cid === cid), fresh = (l) => l.chk && l.chk.q === q && l.chk.s !== 'err';
    const queue = [], seen = {};
    mine().forEach((l) => { const h = hostOf(l.f.website); if (!h) { if (!fresh(l)) l.chk = { s: 'nosite', q }; return; } if (!fresh(l) && !seen[h]) { seen[h] = 1; queue.push({ h, website: l.f.website, company: l.f.company || '' }); } });
    ui.site = { total: queue.length, done: 0, stop: false }; commit();
    const next = () => {
      const job = queue.shift(); if (!job || ui.site.stop) { if (!--ui.site.live) { ui.site = null; commit(); } return; }
      Cloud.research({ vid: c.vid, website: job.website, company: job.company, question: q }).catch((e) => { const m = String(e && e.message || e); if (/limit|access|approved|Sign in/i.test(m)) { ui.site.stop = true; ui.err = m; ui.errAi = true; } return { s: 'err', ev: m }; })
        .then((r) => { mine().forEach((l) => { if (hostOf(l.f.website) === job.h) l.chk = { s: r.s, ev: r.ev || '', proj: r.proj || '', url: r.url || '', q }; }); ui.site.done++; commit(); next(); });
    };
    ui.site.live = Math.min(3, queue.length) || 1; for (let i = 0; i < ui.site.live; i++) next();
  }
  function vSiteCheck(c, all) {
    if (c.type !== 'campaign' || !all.length) return '';
    const q = (c.check || {}).q || '', n = { yes: 0, no: 0, nosite: 0, err: 0 }; let off = 0, todo = 0;
    all.forEach((l) => { if (l.off) off++; if (l.chk && l.chk.q === q) n[l.chk.s]++; else todo++; });
    const checked = all.length - todo, toDrop = all.filter((l) => !l.off && l.chk && l.chk.q === q && (l.chk.s === 'no' || l.chk.s === 'nosite')).length;
    return `<div class="sitebox"><div class="bh">${t('siteTitle')}</div><p class="sub small">${t('siteNote')}</p>
      <div class="acts tight"><input class="in grow" data-chkq placeholder="data center, data centre, mission critical" value="${esc(q)}" ${ui.site ? 'disabled' : ''}>
        ${ui.site ? `<span class="sub small">${t('siteRun')} ${ui.site.done} / ${ui.site.total}</span><button class="btn ghost sm" data-act="siteStop">${t('stop')}</button>`
        : `<button class="btn sm" data-act="siteGo" ${CLOUD && q.trim() ? '' : 'disabled'} title="${CLOUD ? '' : t('aiDemoOnly')}">${t(todo || n.err ? 'siteGo' : 'siteAgain')}</button>`}</div>
      ${checked ? `<p class="sitesum"><span class="ok">${t('site_yes')}: ${n.yes}</span><span>${t('site_no')}: ${n.no}</span><span>${t('site_nosite')}: ${n.nosite}</span>${n.err ? `<span>${t('site_err')}: ${n.err}</span>` : ''}${off ? `<span>${t('siteOff')}: ${off}</span>` : ''}</p>
        <div class="acts tight">${toDrop && !ui.site ? `<button class="btn ghost sm" data-act="siteDrop">${t('siteDrop')} (${toDrop})</button>` : ''}${off ? `<button class="link small" data-act="siteBack">${t('siteBack')}</button>` : ''}</div>` : ''}</div>`;
  }
  const chkCell = (l, q) => { const k = l.chk && l.chk.q === q ? l.chk : null; if (!k) return ''; const tip = esc([k.ev, k.url].filter(Boolean).join(' · '));
    return k.s === 'yes' ? `<span class="chk yes" title="${tip}">✓ ${esc(k.proj || t('site_yes'))}</span>` : `<span class="chk" title="${tip}">${t('site_' + k.s)}</span>`; };
  function vRecipients(c) {
    const all = S.leads.filter((l) => l.cid === c.id), q = ui.lq.trim().toLowerCase(), cq = (c.check || {}).q || '';
    const list = all.filter((l) => !q || [leadName(l), l.f.company, l.f.email, l.f.jobTitle].join(' ').toLowerCase().includes(q));
    const rows = list.slice(0, 200).map((l) => `<tr class="${l.off ? 'off' : ''}"><td>${esc(leadName(l))}</td><td>${esc(l.f.jobTitle || '')}</td><td>${esc(l.f.company || '')}</td><td>${esc(l.f.email)}</td>
      <td>${chkCell(l, cq)}${l.off ? ` <button class="link" data-act="leadOn" data-id="${l.id}">${t('leadOn')}</button>` : ''}</td>
      <td>${blockedWhy(l) ? `<span class="blk" title="${t(blockedWhy(l) === 'admin' ? 'blockedAdmin' : 'blockedTaken')}">${t('blockedBadge')}</span>` : l.card ? `<span class="ty">${t('hasCard')}</span>` : `<button class="link" data-act="leadCard" data-id="${l.id}">${t('toCard')}</button>`}</td>
      <td><button class="link" data-act="leadDel" data-id="${l.id}">×</button></td></tr>`).join('');
    const imp = ui.imp ? `<p class="hint">${ui.imp.err ? t(ui.imp.err) : `${ui.imp.added} ${t('impAdded')} · ${ui.imp.dup} ${t('impDup')} · ${ui.imp.bad} ${t('impBad')}`}</p>` : '';
    return `<textarea class="in" rows="4" data-leadpaste placeholder="${t('pasteHint')}"></textarea>
      <div class="acts tight"><button class="btn sm" data-act="leadImport">${t('importBtn')}</button><label class="btn ghost sm filebtn">${t('uploadCsv')}<input type="file" accept=".csv,.tsv,.txt,text/csv" data-leadfile hidden></label></div>
      <p class="sub small">${t('sheetLater')}</p>${imp}${ui.checkLeft ? `<p class="sub small">${t('checking')}: ${ui.checkLeft} ${t('left')}</p>` : ''}
      ${vSiteCheck(c, all)}${all.length ? `<div class="acts tight"><input class="in search" data-lq placeholder="${t('searchLeads')}" value="${esc(ui.lq)}"><span class="sub small">${Math.min(200, list.length)} ${t('shown')} ${t('ofTotal')} ${all.length}</span>
        <button class="btn ghost sm danger" data-act="leadClear">${ui.delArm ? t('delSure') : t('removeAll')}</button></div>
      <table class="ltable"><tr><th>${t('name')}</th><th>${t('jobTitle')}</th><th>${t('company')}</th><th>${t('email')}</th><th>${t('siteCol')}</th><th></th><th></th></tr>${rows}</table>` : ''}`;
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
  function importLeads(c, text) {
    const rows = parseTable(text), norm = (h) => String(h).toLowerCase().replace(/[^a-z]/g, '');
    let hi = -1, map = null;
    for (let i = 0; i < Math.min(5, rows.length) && hi < 0; i++) {
      const m = {}; rows[i].forEach((h, j) => { const n = norm(h); Object.keys(LEAD_COLS).forEach((k) => { if (!(k in m) && LEAD_COLS[k].includes(n)) m[k] = j; }); });
      if ('email' in m) { hi = i; map = m; }
    }
    if (hi < 0) { ui.imp = { err: 'needHeader' }; render(); return; }
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
      S.leads.push({ id: uid('L'), cid: c.id, vid: c.vid, company, owner: au.uid, acl: (c.acl || []).slice(), ord: n++, f, blocked: '', okEmail: CLOUD ? '' : f.email });
    });
    ui.imp = res; commit(); checkLeads();
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
    const ok = S.leads.filter((x) => x.cid === c.id && !blockedWhy(x) && !x.off), l = ok.find((x) => x.chk && x.chk.proj) || ok[0];
    return l ? Object.assign({}, l.f, { project: (l.chk || {}).proj || '' }) : { firstName: 'Anna', lastName: 'Berg', company: 'Example AS', jobTitle: 'CEO', city: 'Oslo' };
  }
  // A phrase in [[double brackets]] is kept only when every field inside it has a value for this recipient.
  const optional = (text, r) => String(text || '').replace(/[ \t]*\[\[([\s\S]*?)\]\]/g, (m, inner) => ((inner.match(/\{\{\s*\w+\s*\}\}/g) || []).every((x) => r[x.replace(/[{}\s]/g, '')]) ? ' ' + inner.trim() : '')).replace(/^ +/gm, '');
  const fillVars = (text, r) => optional(text, r).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k === 'myName' ? S.user.name : k === 'signature' ? r.signature || '' : r[k]) || (k === 'signature' ? '' : m));
  // The signature of the chosen mailbox goes at the end of every letter, unless the text places {{signature}} itself.
  const withSig = (body, sig) => (!sig || /\{\{\s*signature\s*\}\}/.test(body) ? body : body.replace(/\s+$/, '') + '\n\n{{signature}}');
  function vSequence(c) {
    const seq = seqOf(c), v = S.vectors.find((x) => x.id === c.vid), co = v ? item('company', v.company) : null, mbs = myMailboxes(co);
    const from = mbs.length ? `<select class="in" data-seqfrom>${mbs.map((m) => `<option ${((seq.from || primaryMailbox(co)) === m.email) ? 'selected' : ''}>${esc(m.email)}</option>`).join('')}</select>` : `<span class="sub">${t('noMailbox')}</span>`;
    const list = stepsOf(c), vs = varsOf(seq), k = curVar(seq), nextV = ['B', 'C'].find((x) => !seq.alt[x]);
    const cnt = {}; S.leads.filter((l) => l.cid === c.id && !blockedWhy(l) && !l.off).forEach((l, n) => { const x = variantOf(seq, l, n); cnt[x] = (cnt[x] || 0) + 1; });
    const vtabs = c.type !== 'campaign' ? '' : `<div class="vtabs">${vs.map((x) => `<button class="chip ${x === k ? 'on' : ''}" data-act="seqTab" data-v="${x}">${t('variant')} ${x} · ${cnt[x] || 0}</button>`).join('')}
        ${nextV ? `<button class="chip dash" data-act="seqTabAdd" title="${t('variantHint')}">+ ${t('variant')} ${nextV}</button>` : ''}${k !== 'A' ? `<button class="link small" data-act="seqTabDel">${t('removeVariant')} ${k}</button>` : ''}</div>
      ${vs.length < 2 ? '' : `<div class="row2 vset"><label class="fl"><span>${t('splitHow')}</span><select class="in" data-seqsplit><option value="even" ${seq.split !== 'role' ? 'selected' : ''}>${t('split_even')}</option><option value="role" ${seq.split === 'role' ? 'selected' : ''}>${t('split_role')}</option></select></label>
        ${seq.split === 'role' ? `<label class="fl"><span>${t('whoFor')} ${k}</span><input class="in" data-seqwho placeholder="CEO, Owner, Founder" value="${esc(whoOf(seq, k))}"></label>` : '<span></span>'}</div>
        <p class="sub small">${t(seq.split === 'role' ? 'splitRoleNote' : 'splitEvenNote')}</p>`}`;
    const head2 = `<div class="row2 vset"><label class="fl"><span>${t('sendLang')}</span><select class="in" data-seqlang>${LANGS.map((l) => `<option value="${l}" ${seq.lang === l ? 'selected' : ''}>${esc(langName(l))}</option>`).join('')}</select></label><span></span></div>
      ${seq.lang !== 'en' ? `<p class="sub small">${t('langNote').replace('{l}', langName(seq.lang))}</p>` : ''}`;
    const done = list.filter((x) => x.status === 'approved').length, smp = Object.assign({}, sampleFor(c), { signature: sigOf(co, seq.from || primaryMailbox(co)) });
    // AI buttons work only in the real program: the keys live on the server, the demo has none.
    const aiBtn = (i, op, eng, label, off) => { const me = `${i}|${op}|${eng}`; return `<button class="btn ghost sm" data-act="aiGo" data-i="${i}" data-op="${op}" data-eng="${eng}" ${!CLOUD || ui.busy || off ? 'disabled' : ''} title="${CLOUD ? t('eng_' + eng) : t('aiDemoOnly')}">${ui.busy === me ? t('aiBusy') : label}</button>`; };
    const revBox = (st, i) => { const r = st.review; if (!r) return ''; const diff = r.body && (r.body !== st.body || (r.subject || '') !== (st.subject || ''));
      return `<div class="revbox ${r.ok ? 'ok' : ''}"><b>${t(r.ok ? 'revOk' : 'revFix')} · ${t('eng_' + r.by)}</b>${r.issues && r.issues.length ? `<ul>${r.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${diff ? `<small>${t('revSuggest')}</small>${r.subject ? `<b class="rs">${esc(r.subject)}</b>` : ''}<pre>${esc(r.body)}</pre>` : ''}
        <div class="acts tight">${diff ? `<button class="btn sm" data-act="seqApply" data-i="${i}">${t('revApply')}</button>` : ''}<button class="btn ghost sm" data-act="seqRevHide" data-i="${i}">${t('dismiss')}</button></div></div>`; };
    const steps = list.map((st, i) => { const mode = modeOf(st, k); return `<div class="step st-${st.status}" data-step="${i}"><div class="sth"><b>${t('letter')} ${k}${i + 1}</b>${i ? `<span class="ty">${t('ifSilent')}</span>` : ''}
        <label class="dayl" title="${t('dayHint')}">${t('dayN')} <input class="in" type="number" min="0" data-seq="${i}|day" value="${+st.day || 0}" ${i === 0 ? 'disabled' : ''}></label>
        <span class="stt">${t('seq_' + st.status)}</span>${i > 0 && i === list.length - 1 ? `<button class="link" data-act="seqDel" data-i="${i}">×</button>` : ''}</div>
      <select class="in modesel" data-stepmode="${i}" title="${t('whoWrites')}">${['claude', 'gpt', 'manual'].map((m) => `<option value="${m}" ${mode === m ? 'selected' : ''}>${t('mode_' + m)}</option>`).join('')}</select>
      <input class="in" data-seq="${i}|subject" placeholder="${i ? t('subjectRe').replace('{k}', k) : t('subject')}" value="${esc(st.subject)}">
      <textarea class="in" rows="${i ? 4 : 6}" data-seq="${i}|body" placeholder="${i ? (mode === 'manual' ? t('followPhManual') : t('followPh')) : t('body')}">${esc(st.body)}</textarea>
      <div class="vars">${SEQ_VARS.map((x) => `<button class="chip" data-act="seqVar" data-i="${i}" data-v="${x}">{{${x}}}</button>`).join('')}</div>
      <div class="acts tight">${mode === 'manual' ? aiBtn(i, 'polish', 'claude', t('polishClaude'), !st.body.trim()) + aiBtn(i, 'polish', 'gpt', t('polishGpt'), !st.body.trim())
        : aiBtn(i, 'draft', mode, i ? t('aiFollow') : t('aiDraft')) + aiBtn(i, 'review', mode === 'gpt' ? 'claude' : 'gpt', t('aiReview'), !st.body.trim())}
        <button class="btn ghost sm" data-act="seqPreview" data-i="${i}">${t('preview')}</button>
        <button class="btn sm" data-act="seqApprove" data-i="${i}" ${st.status === 'approved' || stepReady(st, i) ? '' : 'disabled'}>${st.status === 'approved' ? t('unapprove') : t('approve')}</button></div>
      ${revBox(st, i)}${ui.prev === i ? `<div class="prevbox"><small>${t('previewFor')} ${esc([smp.firstName, smp.lastName].filter(Boolean).join(' '))}</small><b>${esc(fillVars(st.subject || 'Re: ' + list[0].subject, smp))}</b><pre>${esc(fillVars(withSig(st.body, smp.signature), smp))}</pre></div>` : ''}</div>`; }).join('');
    return `<div class="seqhead"><label class="fromf"><span>${t('fromMailbox')}</span>${from}</label><span class="ty">${done} / ${list.length} ${t('approvedOf')}</span></div>
      ${head2}${vtabs}${steps}${list.length < 5 ? `<button class="add" data-act="seqAdd">+ ${t('letter')} ${k}${list.length + 1} · ${t('addFollow')}</button>` : ''}<p class="sub small">${t('chainNote')} ${t('seqNote')}</p>`;
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
    const tabList = c.type === 'campaign' ? ['details', 'recipients', 'sequence'] : c.type === 'contact' ? ['details', 'sequence'] : [];
    const tab = tabList.includes(ui.ctab) ? ui.ctab : 'details';
    const nLeads = S.leads.filter((l) => l.cid === c.id).length;
    const tabs = tabList.length ? `<div class="tabs ctabs">${tabList.map((x) => `<button class="${tab === x ? 'on' : ''}" data-act="ctab" data-v="${x}">${t('tab' + x[0].toUpperCase() + x.slice(1))}${x === 'recipients' ? ` · ${nLeads}` : ''}</button>`).join('')}</div>` : '';
    return `<div class="overlay" data-act="closeBg"><div class="modal ${tabList.length ? 'wide' : ''}" role="dialog"><button class="mclose" data-act="closeAny" aria-label="Close">×</button>
      <div class="mleft">${tabs}${tab === 'recipients' ? vRecipients(c) : tab === 'sequence' ? vSequence(c) : `${photo}
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
        <textarea class="in" rows="3" data-mbsig="${i}" placeholder="${t('mbSignature')}">${esc(m.sig || '')}</textarea>
        ${m.sig ? '' : `<button class="link small" data-act="mbSigPlain" data-i="${i}">${t('sigPlain')}</button>`}
        <button class="tog" data-act="mbFoot" data-i="${i}"><span class="sw ${m.footOn ? 'on' : ''}"><i></i></span><span>${t('footOn')}<small>${t('footHint')}</small></span></button>
        ${m.footOn ? `<textarea class="in" rows="3" data-mbfoot="${i}" placeholder="${t('footPh')}">${esc(m.foot || '')}</textarea>` : ''}</div>`)).join('');
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
      + sIn(it, 'avoid', t('briefAvoid'), 1, t('ph_avoid')) + sIn(it, 'sample', t('briefSample'), 1, t('ph_sample')) + sIn(it, 'keywords', t('topicKeywords'));
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
        <div class="kvs">${ZONES.map((z) => `<div class="kv"><span>${t('zone_' + z)}</span><b>${esc((item(z, v[z]) || {}).name || '—')}</b></div>`).join('')}</div>`;
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
      const q = (ui.cq || '').trim().toLowerCase();
      const rows = S.cards.filter((c) => c.type === 'contact' || c.type === 'company')
        .filter((c) => !q || [c.title, c.f.company, c.f.email].join(' ').toLowerCase().includes(q)).sort((a, b) => a.title.localeCompare(b.title))
        .map((c) => `<tr class="crowt" data-act="open" data-id="${c.id}"><td><span class="tyi">${svg(TYPE_ICONS[c.type])}</span> ${esc(c.title)}</td><td>${esc(c.type === 'contact' ? c.f.company || '' : c.f.country || '')}</td><td>${esc(c.f.email || c.f.website || '')}</td>
          <td><i class="sdot" style="background:${stageColor(c.stage)}"></i>${t('st_' + c.stage)}</td><td>${esc((item('company', (c.vec || {}).company) || {}).name || '')}</td><td>${CLOUD ? esc(userName(c.owner)) : t('you')}</td><td>${blockedWhy(c) ? `<span class="blk">${t('blockedBadge')}</span>` : ''}</td></tr>`).join('');
      body = `<p class="sub">${t('clientsReal')}</p><input class="in search wide" data-cq placeholder="${t('searchClients')}" value="${esc(ui.cq || '')}">`
        + (rows ? `<table class="ctable"><tr><th>${t('name')}</th><th>${t('company')}</th><th>${t('email')}</th><th>${t('stage')}</th><th>${t('zone_company')}</th><th>${t('ownerCol')}</th><th></th></tr>${rows}</table>` : `<p class="later">${t('noClients')}</p>`);
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
    ctab(d) { ui.ctab = d.v; ui.imp = null; ui.prev = -1; ui.delArm = false; render(); },
    leadImport() { const el = document.querySelector('[data-leadpaste]'); if (el && el.value.trim()) importLeads(cur(), el.value); },
    siteGo() { siteCheck(ui.open); },
    siteStop() { if (ui.site) ui.site.stop = true; render(); },
    // Leaving people out is the user's decision: the check only proposes it.
    siteDrop() { const c = cur(), q = (c.check || {}).q || ''; S.leads.forEach((l) => { if (l.cid === c.id && l.chk && l.chk.q === q && (l.chk.s === 'no' || l.chk.s === 'nosite')) l.off = true; }); commit(); },
    siteBack() { const c = cur(); S.leads.forEach((l) => { if (l.cid === c.id) l.off = false; }); commit(); },
    leadOn(d) { const l = S.leads.find((x) => x.id === d.id); if (l) l.off = false; commit(); },
    leadDel(d) { S.leads = S.leads.filter((l) => l.id !== d.id); commit(); },
    leadClear() { if (!ui.delArm) { ui.delArm = true; render(); return; } const id = ui.open; S.leads = S.leads.filter((l) => l.cid !== id); ui.delArm = false; ui.imp = null; commit(); },
    leadCard(d) {
      const l = S.leads.find((x) => x.id === d.id), c = cur(); if (!l) return;
      const k = { id: uid('k'), vid: c.vid, owner: au.uid, acl: (c.acl || []).slice(), ord: Date.now(), type: 'contact', stage: 'new', title: leadName(l), vec: Object.assign({}, c.vec), parent: c.id,
        f: { jobTitle: l.f.jobTitle || '', company: l.f.company || '', email: l.f.email, phone: l.f.phone || '', linkedin: l.f.linkedin || '' }, next: { text: '', date: '' },
        awaiting: false, auto: { follow: false, reply: false, notify: true, draft: true }, notes: '', photo: '', blocked: l.blocked || '', okEmail: l.okEmail || '' };
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
    mbFoot(d) {
      const it = curParam(), m = it.s.mailboxes[+d.i]; m.footOn = !m.footOn;
      if (m.footOn && !m.foot) m.foot = 'Not relevant? Reply "no" and I will not write again.\n' + it.name;
      commit();
    },
    seqApprove(d) { const st = stepsOf(cur())[+d.i]; st.status = st.status === 'approved' ? 'draft' : 'approved'; commit(); },
    // The answer may arrive after the data was refreshed from the cloud, so the letter is found again by its ids.
    aiGo(d) {
      const c = cur(), q = seqOf(c), k = curVar(q), list = stepsOf(c), i = +d.i, st = list[i], f = c.f || {};
      if (ui.busy || !CLOUD) return; ui.busy = `${i}|${d.op}|${d.eng}`; render();
      const find = () => { const c2 = S.cards.find((x) => x.id === c.id), q2 = c2 && c2.seq; if (!q2) return null; return (k === 'A' ? q2.steps : (q2.alt[k] || {}).steps || []).find((x) => x.id === st.id); };
      Cloud.ai({ op: d.op, engine: d.eng, vid: c.vid, step: i, ui: S.lang, letter: { subject: st.subject, body: st.body }, first: { subject: list[0].subject, body: list[0].body },
        card: { title: c.title, notes: c.notes || '', type: c.type, jobTitle: f.jobTitle || '', company: f.company || '', who: varsOf(q).length > 1 && q.split === 'role' ? whoOf(q, k) : '',
          checkQ: S.leads.some((l) => l.cid === c.id && l.chk && l.chk.s === 'yes') ? (c.check || {}).q || '' : '' } })
        .then((r) => {
          ui.busy = ''; const s2 = find(); if (!s2) { render(); return; }
          if (d.op === 'review') { s2.review = { ok: !!r.ok, issues: r.issues || [], subject: r.subject || '', body: r.body || '', by: r.engine }; if (r.ok && s2.status === 'draft') s2.status = 'reviewed'; }
          else { s2.subject = i > 0 && d.op === 'draft' ? '' : r.subject || s2.subject; s2.body = r.body; s2.status = 'draft'; s2.by = r.engine; s2.review = null; }
          commit();
        })
        .catch((e) => { ui.busy = ''; ui.err = String(e && e.message ? e.message : e); ui.errAi = true; render(); });
    },
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
    if (el.hasAttribute('data-chkq') && c) { c.check = { q: el.value }; save(); return; }
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
    if (p && el.dataset.mbfoot) { p.s.mailboxes[+el.dataset.mbfoot].foot = el.value; save(); return; }
    if (p && el.dataset.mbsig) { p.s.mailboxes[+el.dataset.mbsig].sig = el.value; save(); return; }
    if (p && el.dataset.s) { p.s[el.dataset.s] = el.value; save(); return; }
    if (p && el.hasAttribute('data-pname')) { p.name = el.value; save(); return; }
    if (!c) return;
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
    if (el.hasAttribute('data-chkq') && c) { render(); return; }
    if (el.dataset.stepmode && c) { stepsOf(c)[+el.dataset.stepmode].mode = el.value; commit(); return; }
    if (el.hasAttribute('data-seqlang') && c) { seqOf(c).lang = el.value; commit(); return; }
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
