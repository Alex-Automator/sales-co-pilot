// VECTOR (Sales-co-pilot) 0.1: interface on demo data, saved in the browser.
// No sign-in, mail, Sheets or AI yet: those arrive in later stages (see docs/SPEC.md).
(function () {
  const KEY = 'sales-co-pilot-v2', PKEY = 'vector-prefs-v1';
  // With Firebase loaded the program is real: sign-in and shared data. Without it (the preview) it runs on demo data.
  const CLOUD = !!(window.firebase && window.FIREBASE_CONFIG);
  const PREFS = ['lang', 'view', 'active', 'draft', 'widgets', 'guideSeen', 'show'];
  const au = { status: CLOUD ? 'loading' : 'in', uid: 'me', role: 'admin', users: [], guards: {}, err: '' };
  let S = load();
  let ui = { open: null, edit: null, q: '', ftype: 'all', fdue: false, zone: 'company', dbtab: 'library', delArm: false, adding: null, fresh: null, popped: null, menu: null, legendEdit: false, fcolor: '', cal: 0, ai: !S.guideSeen, aiView: 'home', aiLog: [] };

  function load() {
    if (CLOUD) { const s = emptyState(); try { Object.assign(s, JSON.parse(localStorage.getItem(PKEY)) || {}); } catch (e) {} return s; }
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 2) { s.legend = s.legend || defaultLegend(); s.user = s.user || defaultUser(); s.widgets = s.widgets || WIDGETS.slice(); s.gdocs = s.gdocs || []; return s; } } catch (e) {}
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
  const myMailboxes = (co) => ((co && co.s.mailboxes) || []).filter(mineMb);
  const primaryMailbox = (co) => { const m = myMailboxes(co); return (m.find((x) => x.primary) || m[0] || {}).email || ''; };
  const admin = () => au.role === 'admin';
  const takenId = (company, email) => (company + '__' + String(email).trim().toLowerCase()).replace(/[\/\s]/g, '_');
  // Why a contact is closed for this operator: on the admin's forbidden list, or already in another manager's work.
  function blockedWhy(c) {
    if (c.type !== 'contact') return '';
    const email = String(c.f.email || '').trim().toLowerCase(); if (!email) return '';
    const hit = (au.guards[au.uid] || []).some((g) => { g = String(g).trim().toLowerCase().replace(/^@/, ''); return g && (email === g || email.endsWith('@' + g)); });
    return hit ? 'admin' : c.blocked === 'taken' ? 'taken' : '';
  }
  // Keeps the access lists that the server checks in step with the settings people actually edit.
  function normalize() {
    S.zones.company.forEach((co) => { if (co.access) co.acl = Object.keys(co.access); });
    S.zones.direction.forEach((d) => { const co = item('company', d.company); if (co && co.acl) d.acl = co.acl.slice(); });
    ['audience', 'topic'].forEach((z) => S.zones[z].forEach((it) => { if (!it.acl) it.acl = ['*']; }));
    const aclFor = (c, type) => {
      const v = S.vectors.find((x) => x.id === c.vid); if (!v) return c.acl || [];
      const a = (v.acl || [v.owner]).slice(), co = item('company', v.company);
      if (type !== 'task' && co && co.access) Object.keys(co.access).forEach((u) => { if (co.access[u] === 'shared' && !a.includes(u)) a.push(u); });
      return a;
    };
    S.cards.forEach((c) => { c.acl = aclFor(c, c.type); if (!c.owner) { const v = S.vectors.find((x) => x.id === c.vid); if (v) c.owner = v.owner; } });
    S.gdocs.forEach((g) => { g.acl = aclFor(g, 'doc'); });
    // One marker per contact email, so another manager's program can tell the contact is already in work without seeing it.
    const mine = {};
    S.cards.forEach((c) => { const e = String(c.f.email || '').trim().toLowerCase(); if (c.type === 'contact' && c.owner === au.uid && e && !blockedWhy(c) && c.okEmail === e && c.vec && c.vec.company) mine[takenId(c.vec.company, e)] = { id: takenId(c.vec.company, e), company: c.vec.company, email: e, owner: au.uid }; });
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
        ${CLOUD ? mi('usersOpen', t('setUsers'), '', au.role !== 'admin') : mi('', t('setUsers'), later(2), 1)}${mi('', t('setMail'), later(3), 1)}${mi('', t('setAI'), later(4), 1)}${CLOUD ? '' : `<hr>${mi('reset', t('reset'))}`}<div class="ver">${t('version')} ${VERSION}</div></div></div>
      <nav>${tabs}</nav><div class="crumb" title="${crumb}">${crumb}</div>
      <div class="right"><button class="aibtn ${ui.ai ? 'on' : ''}" data-act="aiToggle">${svg(UI_ICONS.spark)}<span>${t('aiHelper')}</span></button><button class="userbtn" data-act="userMenu"><span class="un"><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span><span class="ava">${ava}</span></button>
        ${ui.menu === 'user' ? `<div class="menu show"><div class="mh">${esc(u.email)}${CLOUD ? ' · ' + t('acc_' + au.role) : ''}</div>${CLOUD ? '' : mi('editProfile', t('myProfile'))}${mi('lang', t('setLanguage'), langX)}<hr>${CLOUD ? mi('signOut', t('signOut')) : mi('', t('signOut'), later(2), 1)}</div>` : ''}</div></header>`;
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
    const seed = CLOUD && au.role === 'admin' && ZONES.every((z) => !S.zones[z].length) ? `<div class="hello seed"><b>${t('seedTitle')}</b><button class="btn sm" data-act="seed">${t('seedBtn')}</button></div>` : '';
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
  function vCardModal() {
    const c = S.cards.find((x) => x.id === ui.open); if (!c) return '';
    const F = {
      contact: [['jobTitle', t('jobTitle')], ['company', t('company')], ['email', t('email')], ['phone', t('phone')], ['linkedin', t('linkedin')]],
      company: [['website', t('website')], ['country', t('country')], ['phone', t('phone')], ['linkedin', t('linkedin')]],
      campaign: [['sheetUrl', t('sheetUrl')], ['dailyCap', t('dailyCap')], ['variantA', t('variantA'), 1], ['variantB', t('variantB'), 1], ['variantC', t('variantC'), 1]],
      task: [],
    }[c.type];
    const hasPhoto = c.type === 'contact' || c.type === 'company';
    const logoText = c.type === 'contact' ? initials(c.f.company || c.title) : initials(c.title);
    const photo = hasPhoto ? `<div class="photo" tabindex="0" data-photo title="${t('photoHint')}">${c.photo ? `<img src="${c.photo}" alt="">` : esc(logoText)}</div>
      <p class="sub small"><label class="link filebtn">${t('uploadImage')}<input type="file" accept="image/*" data-file hidden></label> · <span class="hint2">${t('photoHint')}</span>${c.photo ? ` · <button class="link" data-act="rmPhoto">${t('removePhoto')}</button>` : ''}</p>` : '';
    const opts = (list, cur, pre) => list.map((x) => `<option value="${x}" ${x === cur ? 'selected' : ''}>${t(pre + x)}</option>`).join('');
    return `<div class="overlay" data-act="closeBg"><div class="modal" role="dialog"><button class="mclose" data-act="closeAny" aria-label="Close">×</button>
      <div class="mleft">${photo}
        <label class="fl"><span>${c.type === 'contact' ? t('name') : t('title')}</span><input class="in big" data-top="title" value="${esc(c.title)}"></label>
        ${F.map((x) => field(c, x[0], x[1], x[2])).join('')}
        <label class="fl"><span>${t('notes')}</span><textarea class="in" data-top="notes" rows="5">${esc(c.notes)}</textarea></label>
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
  const sIn = (it, k, label, area) => `<label class="fl"><span>${label}</span>${area
    ? `<textarea class="in" data-s="${k}" rows="3">${esc(it.s[k] || '')}</textarea>` : `<input class="in" data-s="${k}" value="${esc(it.s[k] || '')}">`}</label>`;
  const sSel = (it, k, label, vals, pre) => `<label class="fl"><span>${label}</span><select class="in" data-s="${k}"><option value=""></option>${
    vals.map((v) => `<option value="${v}" ${it.s[k] === v ? 'selected' : ''}>${t(pre + v)}</option>`).join('')}</select></label>`;
  function paramSettings(zone, it) {
    if (zone === 'company') {
      const boxes = (it.s.mailboxes || []).map((m, i) => (!admin() && !mineMb(m) ? '' : `<div class="lrow"><button class="radio ${m.primary ? 'on' : ''}" data-act="mbPrimary" data-i="${i}" title="${t('primary')}"></button>
        <span class="lt">${esc(m.email)}${CLOUD && admin() && m.owner !== au.uid ? ` <small class="ownr">${esc(userName(m.owner))}</small>` : ''}</span>${m.primary ? `<span class="ty">${t('primary')}</span>` : ''}<button class="link" data-act="mbRemove" data-i="${i}">×</button></div>`)).join('');
      return sIn(it, 'website', t('website')) + `<div class="fl"><span>${t('mailboxes')}</span>${boxes}<input class="in" data-listadd="mailboxes" placeholder="${t('addMailbox')}"></div>` + sIn(it, 'signature', t('signatureText'), 1);
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
    return sIn(it, 'hook', t('topicHook'), 1) + sIn(it, 'keywords', t('topicKeywords')) + sIn(it, 'proof', t('topicProof'));
  }
  const accSel = (co, u) => `<select class="in" data-cacc="${u.id}|${co.id}">${[['', 'accNone'], ['shared', 'accShared'], ['own', 'accOwn']].map((o) => `<option value="${o[0]}" ${((co.access || {})[u.id] || '') === o[0] ? 'selected' : ''}>${t(o[1])}</option>`).join('')}</select>`;
  function vEditModal() {
    const e = ui.edit; if (!e) return '';
    let left, right;
    if (e.kind === 'users') {
      const rows = au.users.slice().sort((a, b) => (a.created || '').localeCompare(b.created || '')).map((u) => `<div class="urow"><span class="ava">${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials(u.name || u.email))}</span>
        <span class="lt"><b>${esc(u.name || '—')}</b><br><small>${esc(u.email)}</small></span>
        <select class="in" data-urole="${u.id}" ${u.id === au.uid ? 'disabled' : ''}>${['pending', 'user', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${t('acc_' + r)}</option>`).join('')}</select></div>
        ${u.role !== 'user' ? '' : `<div class="uacc"><div class="bh">${t('companiesAccess')}</div>${S.zones.company.map((co) => `<div class="lrow"><span class="lt">${esc(co.name)}</span>${accSel(co, u)}</div>`).join('')}
          <label class="fl"><span>${t('forbidden')}</span><textarea class="in" rows="3" data-guard="${u.id}" placeholder="name@company.com">${esc((au.guards[u.id] || []).join('\n'))}</textarea></label><p class="sub small">${t('forbiddenHint')}</p></div>`}`).join('');
      return `<div class="overlay" data-act="closeBg"><div class="modal one" role="dialog"><button class="mclose" data-act="closeAny" aria-label="Close">×</button><div class="mleft"><div class="bh">${t('usersTitle')}</div><p class="sub">${t('usersNote')}</p><p class="sub small">${t('modeNote')}</p>${rows}
        <div class="acts"><button class="btn sm" data-act="closeEdit">${t('close')}</button></div></div></div></div>`;
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
      const accBox = !CLOUD ? `<p class="sub">${t('accessNote')}</p>` : e.zone !== 'company' ? '' : !admin() ? `<p class="sub">${t('accessAdminOnly')}</p>`
        : au.users.filter((u) => u.role === 'user').map((u) => `<div class="lrow col2"><span class="lt">${esc(u.name || u.email)}</span>${accSel(it, u)}</div>`).join('') + `<p class="sub small">${t('modeNote')}</p>`;
      right = `${accBox ? `<div class="box"><div class="bh">${t('access')}</div>${accBox}</div>` : ''}
        <div class="box"><div class="bh">${t('usedIn')}</div><b class="bigN">${used}</b></div>
        <div class="acts"><button class="btn ghost sm danger" data-act="delParam" ${used ? 'disabled' : ''} title="${used ? t('cannotDelete') : ''}">${ui.delArm ? t('delSure') : t('del')}</button>
        <button class="btn sm" data-act="closeEdit">${t('close')}</button></div>${used ? `<p class="sub small">${t('cannotDelete')}</p>` : ''}`;
    } else {
      const v = S.vectors.find((x) => x.id === e.id); if (!v) return '';
      left = `<div class="bh">${t('vector')}</div><div class="chev stack">${chevron(v, {})}</div>
        <div class="kvs">${ZONES.map((z) => `<div class="kv"><span>${t('zone_' + z)}</span><b>${esc((item(z, v[z]) || {}).name || '—')}</b></div>`).join('')}</div>`;
      const canShare = au.role === 'admin' || v.owner === au.uid;
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
      + (ui.err ? `<div class="toast"><b>${t('saveErr')}</b><span>${esc(ui.err)}</span><button class="link" data-act="errClose">${t('dismiss')}</button></div>` : '') + vCardModal() + vEditModal() + vAI();
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
    errClose() { ui.err = ''; render(); },
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
      const gone = ui.edit.id; S.vectors = S.vectors.filter((v) => v.id !== gone); S.cards = S.cards.filter((c) => c.vid !== gone); S.gdocs = S.gdocs.filter((g) => g.vid !== gone); if (S.active === gone) S.active = ''; ui.edit = null; commit();
    },
    delParam() {
      if (!ui.delArm) { ui.delArm = true; render(); return; }
      const e = ui.edit; S.zones[e.zone] = S.zones[e.zone].filter((x) => x.id !== e.id);
      if (S.draft[e.zone] === e.id) delete S.draft[e.zone]; ui.edit = null; commit();
    },
    rmImg() { curParam().img = ''; commit(); },
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
    open(d) { ui.open = d.id; ui.delArm = false; render(); },
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
      S.cards = S.cards.filter((c) => c.id !== ui.open); ui.open = null; commit();
    },
    rmDoc(d) { S.docs = S.docs.filter((x) => x.id !== d.id); commit(); },
    reset() { S = demoState(); S.guideSeen = true; ui.aiLog = []; ui.open = null; ui.edit = null; ui.fcolor = ''; ui.legendEdit = false; commit(); },
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
    if (el.hasAttribute('data-cq')) { ui.cq = el.value; const pos = el.selectionStart; render(); const n = document.querySelector('[data-cq]'); n.focus(); n.setSelectionRange(pos, pos); return; }
    if (el.dataset.u) { S.user[el.dataset.u] = el.value; save(); return; }
    if (el.dataset.lgname) { legendOf(el.dataset.lgname).label = el.value; save(); return; }
    if (el.dataset.lgcolor) { legendOf(el.dataset.lgcolor).color = el.value; save(); return; }
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
    if (el.hasAttribute('data-show')) { S.show = el.value; commit(); return; }
    if (el.dataset.urole) { const u = au.users.find((x) => x.id === el.dataset.urole); if (u) u.role = el.value; Cloud.setRole(el.dataset.urole, el.value); render(); return; }
    if (el.dataset.cacc) {
      const [u, cid] = el.dataset.cacc.split('|'), co = item('company', cid); co.access = co.access || {};
      if (el.value) co.access[u] = el.value; else delete co.access[u];
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
        else if (name === 'users') au.users = d;
        else if (name === 'guards') { au.guards = {}; d.forEach((g) => { au.guards[g.id] = g.list || []; }); }
        else if (name === 'taken') S.taken = d;
        else if (name === 'workspace') { S.legend = (d && d.legend) || S.legend; S.docs = (d && d.docs) || []; }
        // Parameters created before access lists existed get them from the admin's program, once.
        if (name === 'params' && admin()) setTimeout(() => {
          let fixed = false;
          S.zones.company.forEach((co) => { if (!co.access) { co.access = {}; co.access[au.uid] = 'shared'; fixed = true; } });
          ZONES.forEach((z) => S.zones[z].forEach((it) => { if (!it.acl) fixed = true; if (!it.by) { it.by = au.uid; fixed = true; } }));
          if (fixed) save();
        }, 0);
        if (!typing()) render();
      },
      collect() {
        const out = { params: {}, vectors: {}, cards: {}, gdocs: {}, taken: {}, workspace: { shared: { legend: S.legend, docs: S.docs } } };
        ZONES.forEach((z) => S.zones[z].forEach((it) => { out.params[it.id] = Object.assign({}, it, { zone: z }); }));
        S.vectors.forEach((v) => { out.vectors[v.id] = v; }); S.cards.forEach((c) => { out.cards[c.id] = c; }); S.gdocs.forEach((g) => { out.gdocs[g.id] = g; }); (S.taken || []).forEach((x) => { out.taken[x.id] = x; });
        return out;
      },
      error(e) { ui.err = e && e.message ? e.message : String(e); render(); },
    });
  }
  render();
})();
