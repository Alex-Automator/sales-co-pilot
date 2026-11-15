// Sales-Co-pilot, revision 2 of the first screen: interface on demo data, saved in the browser.
// No sign-in, mail, Sheets or AI yet: those arrive in later stages (see docs/SPEC.md).
(function () {
  const KEY = 'sales-co-pilot-v2';
  let S = load();
  let ui = { open: null, edit: null, q: '', ftype: 'all', fdue: false, zone: 'company', dbtab: 'library', delArm: false, adding: null, fresh: null, popped: null };

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 2) return s; } catch (e) {}
    return demoState();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  const t = (k) => (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const today = () => new Date().toISOString().slice(0, 10);
  const stageColor = (s) => (STAGES.find((x) => x[0] === s) || STAGES[0])[1];
  const stageIdx = (s) => STAGES.findIndex((x) => x[0] === s);
  const item = (zone, id) => S.zones[zone].find((x) => x.id === id);
  const closed = (c) => c.stage === 'signed' || c.stage === 'lost';
  const isDue = (c) => c.next && c.next.date && c.next.date <= today() && !closed(c);
  const initials = (s) => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const activeVector = () => S.vectors.find((v) => v.id === S.active);
  const inVector = (c, v) => ZONES.every((z) => c.vec[z] === v[z]);
  const tally = (cs) => ({ reply: cs.filter((c) => c.awaiting && !closed(c)).length, due: cs.filter(isDue).length });
  const primaryMailbox = (co) => { const m = (co && co.s.mailboxes) || []; return (m.find((x) => x.primary) || m[0] || {}).email || ''; };
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

  // ---------- views ----------
  function top() {
    const tabs = ['vector', 'board', 'analytics', 'database'].map((v) =>
      `<button class="tab ${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}" ${v === 'board' && !activeVector() ? 'disabled' : ''}>${t(v)}</button>`).join('');
    const av = activeVector();
    const crumb = S.view === 'board' && av ? ZONES.map((z) => esc((item(z, av[z]) || {}).name || '—')).join(' › ') : '';
    return `<header class="top"><div class="logo"><span class="dot"></span>Sales-Co-pilot</div><nav>${tabs}</nav>
      <div class="crumb" title="${crumb}">${crumb}</div>
      <div class="right"><button class="lang" data-act="lang"><b class="${S.lang === 'en' ? 'on' : ''}">EN</b> <b class="${S.lang === 'uk' ? 'on' : ''}">UA</b></button></div></header>`;
  }

  function chevron(v, opts) {
    return ZONES.map((z, i) => {
      const it = item(z, v[z]);
      if (!it) return `<span class="seg empty" style="--i:${i}"><span class="sn">${i + 1} · ${t('zone_' + z)}</span></span>`;
      const act = opts.draft ? `data-act="unpick" data-zone="${z}" title="${esc(it.name)} — ${t('clear')}"` : `title="${esc(it.name)}"`;
      return `<span class="seg ${ui.popped === z && opts.draft ? 'pop' : ''}" style="--i:${i}" ${act}>${pic(z, it, 'sm')}<span class="sn">${esc(it.name)}</span></span>`;
    }).join('');
  }

  function vVector() {
    const rows = S.vectors.map((v) => {
      const n = tally(S.cards.filter((c) => inVector(c, v)));
      return `<div class="vrow ${ui.fresh === v.id ? 'fresh' : ''}">
        <button class="chev" data-act="openVector" data-id="${v.id}">${chevron(v, {})}</button>
        <span class="cnt">${pills(n)}</span>
        <button class="btn sm" data-act="openVector" data-id="${v.id}">${t('openBoard')}</button>
        <button class="dots" data-act="editVector" data-id="${v.id}" title="${t('edit')}">⋯</button></div>`;
    }).join('') || `<p class="sub pad">${t('noVectors')}</p>`;

    const zones = ZONES.map((z, i) => {
      const list = z === 'direction' ? S.zones.direction.filter((d) => d.company === S.draft.company) : S.zones[z];
      const items = list.map((it) => `<div class="pi ${S.draft[z] === it.id ? 'sel' : ''}" role="button" tabindex="0" data-act="pick" data-zone="${z}" data-id="${it.id}" title="${esc(it.name)}">
          ${pic(z, it)}<span class="pn">${esc(it.name)}</span><span class="cnt">${pills(tally(S.cards.filter((c) => c.vec[z] === it.id)), true)}</span>
          <button class="dots" data-act="editParam" data-zone="${z}" data-id="${it.id}" title="${t('edit')}">⋯</button></div>`).join('');
      const hint = z === 'direction' && !S.draft.company ? `<p class="sub pad">${t('pickCompanyFirst')}</p>` : '';
      const canAdd = z !== 'direction' || S.draft.company;
      const adding = !canAdd ? '' : ui.adding === z
        ? `<input class="in addin" data-add="${z}" placeholder="${t('addNew')}" autofocus>`
        : `<button class="add" data-act="addItem" data-zone="${z}">${t('add')}</button>`;
      return `<section class="zone"><div class="vh">${i + 1} · ${t('zone_' + z)}</div><div class="zlist">${items}${hint}${adding}</div></section>`;
    }).join('');

    const ready = draftComplete(), dup = ready && sameVector(S.draft);
    return `<main class="vscreen">
      <section class="vtop"><div class="vhead"><h1>${t('vectorsTitle')}</h1><p class="sub">${t('vectorsSub')}</p></div><div class="vlist">${rows}</div></section>
      <section class="vnew"><div class="builder"><div class="bl"><b>${t('newVectorTitle')}</b><span class="sub">${t('newVectorSub')}</span></div>
        <div class="chev draft ${ready ? 'ready' : ''}">${chevron(S.draft, { draft: true })}</div>
        <button class="btn" data-act="fixVector" ${ready && !dup ? '' : 'disabled'}>${dup ? t('vectorExists') : t('fixVector')}</button></div>
        <div class="zones">${zones}</div></section></main>`;
  }

  function cardHtml(c) {
    const badges = [];
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
    return `<article class="card" draggable="true" data-card="${c.id}" data-act="open" data-id="${c.id}" style="border-left-color:${stageColor(c.stage)}">
      <div class="ct"><span class="ty">${t('type_' + c.type)}</span><span class="bd">${badges.join('')}</span></div>
      <div class="cn">${esc(c.title) || '—'}</div>${sub ? `<div class="cs">${esc(sub)}</div>` : ''}</article>`;
  }

  function vBoard() {
    const av = activeVector();
    if (!av) { S.view = 'vector'; return vVector(); }
    const q = ui.q.trim().toLowerCase();
    const cards = S.cards.filter((c) => inVector(c, av))
      .filter((c) => ui.ftype === 'all' || c.type === ui.ftype).filter((c) => !ui.fdue || isDue(c))
      .filter((c) => !q || (c.title + ' ' + Object.values(c.f).join(' ')).toLowerCase().includes(q));
    const chips = ['all'].concat(TYPES).map((x) =>
      `<button class="chip ${ui.ftype === x ? 'on' : ''}" data-act="ftype" data-v="${x}">${x === 'all' ? t('allTypes') : t('type_' + x)}</button>`).join('');
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
      <button class="btn sm" data-act="addCard" data-stage="new">${t('newCard')}</button></div><main class="board">${cols}</main>`;
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
      <p class="sub small">${t('photoHint')}${c.photo ? ` · <button class="link" data-act="rmPhoto">${t('removePhoto')}</button>` : ''}</p>` : '';
    const opts = (list, cur, pre) => list.map((x) => `<option value="${x}" ${x === cur ? 'selected' : ''}>${t(pre + x)}</option>`).join('');
    return `<div class="overlay" data-act="closeBg"><div class="modal" role="dialog">
      <div class="mleft">${photo}
        <label class="fl"><span>${c.type === 'contact' ? t('name') : t('title')}</span><input class="in big" data-top="title" value="${esc(c.title)}"></label>
        ${F.map((x) => field(c, x[0], x[1], x[2])).join('')}
        <label class="fl"><span>${t('notes')}</span><textarea class="in" data-top="notes" rows="5">${esc(c.notes)}</textarea></label>
      </div>
      <div class="mright">
        <div class="row2"><label class="fl"><span>${t('type')}</span><select class="in" data-top="type">${opts(TYPES, c.type, 'type_')}</select></label>
        <label class="fl"><span>${t('stage')}</span><select class="in" data-top="stage">${opts(STAGES.map((x) => x[0]), c.stage, 'st_')}</select></label></div>
        <div class="box"><div class="bh">${t('nextStep')}</div><input class="in" data-next="text" value="${esc(c.next.text)}">
          <label class="fl"><span>${t('nextDate')}</span><input class="in" type="date" data-next="date" value="${esc(c.next.date)}"></label>
          <button class="tog" data-act="awaiting"><span class="sw ${c.awaiting ? 'on' : ''}"><i></i></span><span>${t('awaiting')}</span></button></div>
        <div class="box"><div class="bh">${t('autopilot')}</div>${tog(c, 'follow', t('apFollow'))}${tog(c, 'reply', t('apReply'))}${tog(c, 'draft', t('apDraft'))}${tog(c, 'notify', t('apNotify'))}</div>
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
      const boxes = (it.s.mailboxes || []).map((m, i) => `<div class="lrow"><button class="radio ${m.primary ? 'on' : ''}" data-act="mbPrimary" data-i="${i}" title="${t('primary')}"></button>
        <span class="lt">${esc(m.email)}</span>${m.primary ? `<span class="ty">${t('primary')}</span>` : ''}<button class="link" data-act="mbRemove" data-i="${i}">×</button></div>`).join('');
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
  function vEditModal() {
    const e = ui.edit; if (!e) return '';
    let left, right;
    if (e.kind === 'param') {
      const it = item(e.zone, e.id); if (!it) return '';
      const used = S.vectors.filter((v) => v[e.zone] === it.id).length;
      left = `<div class="bh">${t('zone_' + e.zone)}</div><div class="imgrow"><div class="photo sq" tabindex="0" data-photo title="${t('imageHint')}">${pic(e.zone, it, 'xl')}</div>
          <div><label class="btn ghost sm filebtn">${t('uploadImage')}<input type="file" accept="image/*" data-file hidden></label>
          ${it.img ? ` <button class="btn ghost sm" data-act="rmImg">${t('removeImage')}</button>` : ''}<p class="sub small">${t('imageHint')}</p></div></div>
        <label class="fl"><span>${t('name')}</span><input class="in big" data-pname value="${esc(it.name)}"></label>${paramSettings(e.zone, it)}`;
      right = `<div class="box"><div class="bh">${t('access')}</div><p class="sub">${t('accessNote')}</p></div>
        <div class="box"><div class="bh">${t('usedIn')}</div><b class="bigN">${used}</b></div>
        <div class="acts"><button class="btn ghost sm danger" data-act="delParam" ${used ? 'disabled' : ''} title="${used ? t('cannotDelete') : ''}">${ui.delArm ? t('delSure') : t('del')}</button>
        <button class="btn sm" data-act="closeEdit">${t('close')}</button></div>${used ? `<p class="sub small">${t('cannotDelete')}</p>` : ''}`;
    } else {
      const v = S.vectors.find((x) => x.id === e.id); if (!v) return '';
      left = `<div class="bh">${t('vector')}</div><div class="chev stack">${chevron(v, {})}</div>
        <div class="kvs">${ZONES.map((z) => `<div class="kv"><span>${t('zone_' + z)}</span><b>${esc((item(z, v[z]) || {}).name || '—')}</b></div>`).join('')}</div>`;
      right = `<div class="box"><div class="bh">${t('owner')}</div><b>${t('you')}</b></div><div class="box"><div class="bh">${t('access')}</div><p class="sub">${t('accessNote')}</p></div>
        <div class="box"><div class="bh">${t('vectorCards')}</div><b class="bigN">${S.cards.filter((c) => inVector(c, v)).length}</b></div>
        <div class="acts"><button class="btn ghost sm danger" data-act="delVector">${ui.delArm ? t('delSure') : t('del')}</button><button class="btn sm" data-act="closeEdit">${t('close')}</button></div>`;
    }
    return `<div class="overlay" data-act="closeBg"><div class="modal" role="dialog"><div class="mleft">${left}</div><div class="mright">${right}</div></div></div>`;
  }

  function vAnalytics() {
    const contacts = S.cards.filter((c) => c.type === 'contact');
    const at = (cs, s) => cs.filter((c) => c.stage !== 'lost' && stageIdx(c.stage) >= stageIdx(s)).length;
    const rate = (cs) => { const a = cs.filter((c) => c.stage !== 'new'); return a.length ? Math.round(100 * at(a, 'replied') / a.length) : 0; };
    const need = S.cards.filter((c) => (c.awaiting && !closed(c)) || isDue(c)).length;
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
    const health = S.zones.company.map((c) => `<div class="mh2"><i></i><span><b>${esc(primaryMailbox(c) || c.name)}</b><br><small>${t('stageLater')}</small></span></div>`).join('');
    return `<main class="body"><div class="kpis">${kp}</div><div class="an">
      <section class="box"><div class="bh">${t('effortBy')} <span class="seg2">${seg}</span></div>
      <table><tr><th></th><th>${t('contacted')}</th><th>${t('replies')}</th><th>${t('meetings')}</th><th>${t('signed')}</th><th>${t('kRate')}</th></tr>${rows}</table>
      <p class="hint"><b>${t('bestVector')}:</b> ${best ? `${esc(best.name)} — ${best.m}` : t('noData')}</p></section>
      <section class="box"><div class="bh">${t('mailHealth')}</div>${health}<p class="sub small">${t('mailHealthNote')}</p></section></div></main>`;
  }

  function vDatabase() {
    const tabs = ['library', 'generator', 'documents', 'clients'].map((x) =>
      `<button class="chip ${ui.dbtab === x ? 'on' : ''}" data-act="dbtab" data-v="${x}">${t(x)}</button>`).join('');
    let body;
    if (ui.dbtab === 'library') {
      const rows = S.docs.slice().sort((a, b) => a.priority - b.priority).map((d) =>
        `<tr><td><span class="pr">${d.priority}</span></td><td>${esc(d.title)}</td><td>${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url)}</a>` : '—'}</td>
         <td>${esc((item('company', d.company) || {}).name || '')}</td><td><button class="link" data-act="rmDoc" data-id="${d.id}">×</button></td></tr>`).join('');
      body = `<p class="sub">${t('libSub')}</p><table><tr><th>${t('priority')}</th><th>${t('docTitle')}</th><th>${t('docUrl')}</th><th>${t('company')}</th><th></th></tr>${rows}</table>
        <form class="docform" data-docform><input class="in" name="title" placeholder="${t('docTitle')}" required><input class="in" name="url" placeholder="https://…">
        <select class="in" name="priority"><option>1</option><option>2</option><option>3</option></select><button class="btn sm">${t('addDoc')}</button></form>`;
    } else {
      const k = { generator: 'genSub', documents: 'docsSub', clients: 'clientsSub' }[ui.dbtab];
      body = `<div class="later"><span class="ty">${t('stageLater')}</span><p>${t(k)}</p></div>`;
    }
    return `<main class="body"><div class="tools flat">${tabs}</div><section class="box">${body}</section></main>`;
  }

  function render() {
    const view = { vector: vVector, board: vBoard, analytics: vAnalytics, database: vDatabase }[S.view] || vVector;
    const html = view();
    document.documentElement.lang = S.lang === 'uk' ? 'uk' : 'en';
    document.getElementById('app').innerHTML = top() + html +
      `<footer class="demo">${t('demo')} · <button class="link" data-act="reset">${t('reset')}</button></footer>` + vCardModal() + vEditModal();
    const af = document.querySelector('[autofocus]'); if (af) af.focus();
    ui.fresh = null; ui.popped = null;
  }
  function commit() { save(); render(); }

  // ---------- actions ----------
  const cur = () => S.cards.find((c) => c.id === ui.open);
  const curParam = () => (ui.edit && ui.edit.kind === 'param' ? item(ui.edit.zone, ui.edit.id) : null);
  const A = {
    view(d) { S.view = d.v; ui.adding = null; commit(); },
    lang() { S.lang = S.lang === 'en' ? 'uk' : 'en'; commit(); },
    pick(d) {
      if (S.draft[d.zone] === d.id) delete S.draft[d.zone]; else { S.draft[d.zone] = d.id; ui.popped = d.zone; }
      if (d.zone === 'company') delete S.draft.direction;
      commit();
    },
    unpick(d) { delete S.draft[d.zone]; if (d.zone === 'company') delete S.draft.direction; commit(); },
    fixVector() {
      if (!draftComplete() || sameVector(S.draft)) return;
      const v = { id: uid('v'), owner: 'me' }; ZONES.forEach((z) => { v[z] = S.draft[z]; });
      S.vectors.unshift(v); S.draft = {}; ui.fresh = v.id; commit();
      const top = document.querySelector('.vtop'); if (top) top.scrollTop = 0;
    },
    openVector(d) { S.active = d.id; S.view = 'board'; ui.q = ''; commit(); },
    editVector(d) { ui.edit = { kind: 'vector', id: d.id }; ui.delArm = false; render(); },
    editParam(d) { ui.edit = { kind: 'param', zone: d.zone, id: d.id }; ui.delArm = false; render(); },
    closeEdit() { ui.edit = null; render(); },
    delVector() {
      if (!ui.delArm) { ui.delArm = true; render(); return; }
      S.vectors = S.vectors.filter((v) => v.id !== ui.edit.id); if (S.active === ui.edit.id) S.active = ''; ui.edit = null; commit();
    },
    delParam() {
      if (!ui.delArm) { ui.delArm = true; render(); return; }
      const e = ui.edit; S.zones[e.zone] = S.zones[e.zone].filter((x) => x.id !== e.id);
      if (S.draft[e.zone] === e.id) delete S.draft[e.zone]; ui.edit = null; commit();
    },
    rmImg() { curParam().img = ''; commit(); },
    mbPrimary(d) { curParam().s.mailboxes.forEach((m, i) => { m.primary = i === +d.i; }); commit(); },
    mbRemove(d) { const m = curParam().s.mailboxes; m.splice(+d.i, 1); if (m.length && !m.some((x) => x.primary)) m[0].primary = true; commit(); },
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
    closeBg(d, e) { if (e.target.classList.contains('overlay')) { ui.open = null; ui.edit = null; render(); } },
    auto(d) { const c = cur(); c.auto[d.k] = !c.auto[d.k]; commit(); },
    awaiting() { const c = cur(); c.awaiting = !c.awaiting; commit(); },
    rmPhoto() { cur().photo = ''; commit(); },
    clone() {
      const c = cur(); const n = JSON.parse(JSON.stringify(c));
      n.id = uid('k'); n.title = c.title + ' (2)'; S.cards.push(n); ui.open = n.id; commit();
    },
    del() {
      if (!ui.delArm) { ui.delArm = true; render(); return; }
      S.cards = S.cards.filter((c) => c.id !== ui.open); ui.open = null; commit();
    },
    rmDoc(d) { S.docs = S.docs.filter((x) => x.id !== d.id); commit(); },
    reset() { S = demoState(); ui.open = null; ui.edit = null; commit(); },
  };

  function newParam(zone, name) {
    const it = { id: uid(zone[0]), name, img: '', s: {} };
    if (zone === 'company') it.s = { website: '', signature: name, mailboxes: [] };
    if (zone === 'direction') { it.company = S.draft.company; it.s = { desc: '', criteria: [] }; }
    S.zones[zone].push(it); return it;
  }
  // Store a pasted or uploaded picture, scaled down, on the open card or parameter.
  function takeImage(file) {
    const c = cur(), p = curParam(); if (!file || (!c && !p)) return;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 200 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      if (p) p.img = cv.toDataURL('image/png'); else c.photo = cv.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src); commit();
    };
    img.src = URL.createObjectURL(file);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'A') return;
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
      S.cards.push({ id: uid('k'), type: 'task', stage: el.dataset.addcard, title: v, vec, f: {}, next: { text: '', date: '' },
        awaiting: false, auto: { follow: false, reply: false, notify: true, draft: true }, notes: '', photo: '' });
      commit();
    } else if (el.dataset.listadd && p) {
      const k = el.dataset.listadd; p.s[k] = p.s[k] || [];
      p.s[k].push(k === 'mailboxes' ? { email: v, primary: !p.s[k].length } : v); commit();
      const n = document.querySelector(`[data-listadd="${k}"]`); if (n) n.focus();
    }
  });
  // Field edits save without re-rendering, so typing is never interrupted.
  document.addEventListener('input', (e) => {
    const el = e.target, c = cur(), p = curParam();
    if (el.hasAttribute('data-search')) { ui.q = el.value; const pos = el.selectionStart; render(); const n = document.querySelector('[data-search]'); n.focus(); n.setSelectionRange(pos, pos); return; }
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
    if (c && (el.dataset.top === 'type' || el.dataset.top === 'stage')) { c[el.dataset.top] = el.value; commit(); }
  });
  document.addEventListener('submit', (e) => {
    if (!e.target.hasAttribute('data-docform')) return;
    e.preventDefault(); const f = new FormData(e.target), av = activeVector();
    S.docs.push({ id: uid('x'), title: f.get('title'), url: f.get('url'), priority: +f.get('priority'), company: av ? av.company : '' }); commit();
  });
  // Drag a card to another stage.
  let drag = null;
  document.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-card]'); if (c) { drag = c.dataset.card; e.dataTransfer.effectAllowed = 'move'; } });
  document.addEventListener('dragover', (e) => { const col = e.target.closest('.col'); if (col && drag) { e.preventDefault(); col.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { const col = e.target.closest('.col'); if (col) col.classList.remove('over'); });
  document.addEventListener('drop', (e) => {
    const col = e.target.closest('.col'); if (!col || !drag) return;
    e.preventDefault(); const c = S.cards.find((x) => x.id === drag); drag = null;
    if (c) { c.stage = col.dataset.stage; commit(); }
  });
  document.addEventListener('paste', (e) => {
    if (!document.querySelector('[data-photo]')) return;
    const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith('image/')); if (!f) return;
    e.preventDefault(); takeImage(f);
  });

  render();
})();
