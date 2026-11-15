// Sales-Co-pilot, revision 1: interface on demo data, saved in the browser.
// No sign-in, mail, Sheets or AI yet: those arrive in later stages (see docs/SPEC.md).
(function () {
  const KEY = 'sales-co-pilot-v1';
  let S = load();
  let ui = { open: null, wiz: null, q: '', ftype: 'all', fdue: false, zone: 'company', dbtab: 'library', delArm: false, adding: null };

  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch (e) {}
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

  function zoneItems(zone) {
    if (zone === 'direction') return S.zones.direction.filter((d) => d.company === S.sel.company);
    return S.zones[zone];
  }
  function counts(zone, id) {
    const cs = S.cards.filter((c) => c.vec[zone] === id);
    return { reply: cs.filter((c) => c.awaiting && !closed(c)).length, due: cs.filter(isDue).length };
  }
  function boardCards() {
    const q = ui.q.trim().toLowerCase();
    return S.cards.filter((c) => ZONES.every((z) => c.vec[z] === S.sel[z]))
      .filter((c) => ui.ftype === 'all' || c.type === ui.ftype)
      .filter((c) => !ui.fdue || isDue(c))
      .filter((c) => !q || (c.title + ' ' + Object.values(c.f).join(' ')).toLowerCase().includes(q));
  }
  const selComplete = () => ZONES.every((z) => item(z, S.sel[z])) && item('direction', S.sel.direction).company === S.sel.company;

  // ---------- views ----------
  function top() {
    const tabs = ['vector', 'board', 'analytics', 'database'].map((v) =>
      `<button class="tab ${S.view === v ? 'on' : ''}" data-act="view" data-v="${v}">${t(v)}</button>`).join('');
    const crumb = S.view === 'board' ? ZONES.map((z) => esc((item(z, S.sel[z]) || {}).name || '—')).join(' › ') : '';
    return `<header class="top"><div class="logo"><span class="dot"></span>Sales-Co-pilot</div><nav>${tabs}</nav>
      <div class="crumb">${crumb}</div>
      <div class="right"><button class="lang" data-act="lang"><b class="${S.lang === 'en' ? 'on' : ''}">EN</b> <b class="${S.lang === 'uk' ? 'on' : ''}">UA</b></button></div></header>`;
  }

  function vVector() {
    const cols = ZONES.map((z, i) => {
      const items = zoneItems(z).map((it) => {
        const n = counts(z, it.id);
        return `<button class="vi ${S.sel[z] === it.id ? 'sel' : ''}" data-act="pick" data-zone="${z}" data-id="${it.id}">
          <span class="vn">${esc(it.name)}</span><span class="cnt">
          <span class="c1 ${n.reply ? '' : 'z'}">${n.reply} ${t('toReply')}</span><span class="c2 ${n.due ? '' : 'z'}">${n.due} ${t('due')}</span></span></button>`;
      }).join('') || `<p class="sub pad">${t('noDirections')}</p>`;
      const adding = ui.adding === z
        ? `<input class="in addin" data-add="${z}" placeholder="${t('addNew')}" autofocus>`
        : `<button class="add" data-act="addItem" data-zone="${z}">${t('add')}</button>`;
      return `<section class="vcol"><div class="vh">${i + 1} · ${t('zone_' + z)}</div>${items}${adding}</section>`;
    }).join('');
    const co = item('company', S.sel.company);
    const ok = selComplete();
    return `<main class="body"><div class="headrow"><div><h1>${t('whereToday')}</h1><p class="sub">${t('whereSub')}</p></div>
      <button class="btn ghost" data-act="wizOpen">${t('newVector')}</button></div>
      <div class="vec">${cols}</div>
      <div class="foot"><span class="mb">${co ? `${t('sendingAs')} <b>${esc(co.mailbox || '—')}</b> · ${t('signature')} “${esc(co.signature || co.name)}”` : ''}</span>
      <span>${ok ? '' : `<span class="sub">${t('pickAll')}</span> `}<button class="btn" data-act="view" data-v="board" ${ok ? '' : 'disabled'}>${t('openBoard')}</button></span></div></main>`;
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
    if (!selComplete()) { S.view = 'vector'; return vVector(); }
    const cards = boardCards();
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
  function vModal() {
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

  function vWizard() {
    const w = ui.wiz; if (!w) return '';
    const z = ZONES[w.step];
    const list = (z === 'direction' ? S.zones.direction.filter((d) => d.company === w.sel.company) : S.zones[z]);
    const items = list.map((it) => `<button class="vi ${w.sel[z] === it.id ? 'sel' : ''}" data-act="wizPick" data-id="${it.id}"><span class="vn">${esc(it.name)}</span></button>`).join('');
    return `<div class="overlay"><div class="modal wiz" role="dialog"><div class="wbody">
      <div class="bh">${t('step')} ${w.step + 1} ${t('of')} 4</div><h2>${t('zone_' + z)}</h2><p class="sub">${t('chooseOrAdd')}</p>
      <div class="wlist">${items}</div><input class="in" data-wizadd placeholder="${t('addNew')}">
      <div class="acts"><button class="btn ghost sm" data-act="wizClose">${t('cancel')}</button>
        ${w.step ? `<button class="btn ghost sm" data-act="wizBack">${t('back')}</button>` : ''}
        <button class="btn sm" data-act="wizNext" ${w.sel[z] ? '' : 'disabled'}>${w.step === 3 ? t('finish') : t('next')}</button></div></div></div></div>`;
  }

  function vAnalytics() {
    const contacts = S.cards.filter((c) => c.type === 'contact');
    const at = (cs, s) => cs.filter((c) => c.stage !== 'lost' && stageIdx(c.stage) >= stageIdx(s)).length;
    const rate = (cs) => { const a = cs.filter((c) => c.stage !== 'new').length; return a ? Math.round(100 * at(cs.filter((c) => c.stage !== 'new'), 'replied') / a) : 0; };
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
    const health = S.zones.company.map((c) => `<div class="mh2"><i></i><span><b>${esc(c.mailbox || c.name)}</b><br><small>${t('stageLater')}</small></span></div>`).join('');
    return `<main class="body"><div class="kpis">${kp}</div><div class="an">
      <section class="box"><div class="bh">${t('effortBy')} <span class="seg">${seg}</span></div>
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
      `<footer class="demo">${t('demo')} · <button class="link" data-act="reset">${t('reset')}</button></footer>` + vModal() + vWizard();
    const af = document.querySelector('[autofocus]'); if (af) af.focus();
  }
  function commit() { save(); render(); }

  // ---------- actions ----------
  const A = {
    view(d) { S.view = d.v; ui.adding = null; commit(); },
    lang() { S.lang = S.lang === 'en' ? 'uk' : 'en'; commit(); },
    pick(d) {
      S.sel[d.zone] = d.id;
      if (d.zone === 'company') { const f = S.zones.direction.find((x) => x.company === d.id); S.sel.direction = f ? f.id : ''; }
      commit();
    },
    addItem(d) { ui.adding = d.zone; render(); },
    addCard(d) { ui.adding = 'st:' + d.stage; render(); },
    ftype(d) { ui.ftype = d.v; render(); },
    fdue() { ui.fdue = !ui.fdue; render(); },
    zone(d) { ui.zone = d.v; render(); },
    dbtab(d) { ui.dbtab = d.v; render(); },
    open(d) { ui.open = d.id; ui.delArm = false; render(); },
    close() { ui.open = null; render(); },
    closeBg(d, e) { if (e.target.classList.contains('overlay')) A.close(); },
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
    reset() { S = demoState(); ui.open = null; commit(); },
    wizOpen() { ui.wiz = { step: 0, sel: {} }; render(); },
    wizClose() { ui.wiz = null; render(); },
    wizPick(d) { const w = ui.wiz; w.sel[ZONES[w.step]] = d.id; if (w.step === 0) delete w.sel.direction; render(); },
    wizBack() { ui.wiz.step--; render(); },
    wizNext() {
      const w = ui.wiz;
      if (w.step < 3) { w.step++; render(); return; }
      S.sel = { ...w.sel }; ui.wiz = null; S.view = 'board'; commit();
    },
  };
  const cur = () => S.cards.find((c) => c.id === ui.open);

  function addZoneItem(zone, name, companyId) {
    const it = { id: uid(zone[0]), name };
    if (zone === 'company') { it.mailbox = ''; it.signature = name; }
    if (zone === 'direction') it.company = companyId;
    S.zones[zone].push(it); return it;
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    if (el.tagName === 'A') return;
    const fn = A[el.dataset.act]; if (fn) fn(el.dataset, e);
  });
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key === 'Escape') { if (ui.adding) { ui.adding = null; render(); } else if (ui.open) A.close(); else if (ui.wiz) A.wizClose(); return; }
    if (e.key !== 'Enter' || !el.value || !el.value.trim()) return;
    const v = el.value.trim();
    if (el.dataset.add) {
      const it = addZoneItem(el.dataset.add, v, S.sel.company); S.sel[el.dataset.add] = it.id;
      if (el.dataset.add === 'company') S.sel.direction = '';
      ui.adding = null; commit();
    } else if (el.dataset.addcard) {
      S.cards.push({ id: uid('k'), type: 'task', stage: el.dataset.addcard, title: v, vec: { ...S.sel }, f: {}, next: { text: '', date: '' },
        awaiting: false, auto: { follow: false, reply: false, notify: true, draft: true }, notes: '', photo: '' });
      commit();
    } else if (el.hasAttribute('data-wizadd')) {
      const w = ui.wiz, z = ZONES[w.step]; const it = addZoneItem(z, v, w.sel.company);
      w.sel[z] = it.id; if (w.step === 0) delete w.sel.direction; commit();
    }
  });
  // Field edits save without re-rendering, so typing is never interrupted.
  document.addEventListener('input', (e) => {
    const el = e.target, c = cur();
    if (el.hasAttribute('data-search')) { ui.q = el.value; const pos = el.selectionStart; render(); const n = document.querySelector('[data-search]'); n.focus(); n.setSelectionRange(pos, pos); return; }
    if (!c) return;
    if (el.dataset.f) c.f[el.dataset.f] = el.value;
    else if (el.dataset.next) c.next[el.dataset.next] = el.value;
    else if (el.dataset.top === 'title' || el.dataset.top === 'notes') c[el.dataset.top] = el.value;
    else return;
    save();
  });
  document.addEventListener('change', (e) => {
    const el = e.target, c = cur();
    if (c && (el.dataset.top === 'type' || el.dataset.top === 'stage')) { c[el.dataset.top] = el.value; commit(); }
  });
  document.addEventListener('submit', (e) => {
    if (!e.target.hasAttribute('data-docform')) return;
    e.preventDefault(); const f = new FormData(e.target);
    S.docs.push({ id: uid('x'), title: f.get('title'), url: f.get('url'), priority: +f.get('priority'), company: S.sel.company }); commit();
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
  // Paste a photo into an open contact or company card.
  document.addEventListener('paste', (e) => {
    const c = cur(); if (!c || !document.querySelector('[data-photo]')) return;
    const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith('image/')); if (!f) return;
    e.preventDefault(); const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 200 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      c.photo = cv.toDataURL('image/jpeg', 0.85); URL.revokeObjectURL(img.src); commit();
    };
    img.src = URL.createObjectURL(f);
  });

  render();
})();
