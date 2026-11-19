// Sign-in and shared data in Firebase. The app keeps working on its in-memory state;
// this layer loads that state from Firestore and writes back only the documents that changed.
const Cloud = (function () {
  const LISTS = ['params', 'vectors', 'cards', 'gdocs', 'leads', 'taken'];
  let db, auth, hooks, subs = [], shadow = {}, loaded = {}, held = {}, parts = {}, dirty = false, timer = null, role = null;
  const now = () => new Date().toISOString();

  function init(config, h) {
    hooks = h;
    firebase.initializeApp(config);
    auth = firebase.auth(); db = firebase.firestore();
    auth.onAuthStateChanged((u) => {
      stop();
      if (!u) { hooks.auth({ status: 'out' }); return; }
      enter(u).catch((e) => hooks.auth({ status: 'out', err: e.message }));
    });
    window.addEventListener('pagehide', flush);
  }
  function stop() { subs.forEach((f) => f()); subs = []; shadow = {}; loaded = {}; held = {}; parts = {}; dirty = false; role = null; clearTimeout(timer); }

  // First sign-in creates the user. Whoever signs in first becomes the admin; everyone else waits for approval.
  async function enter(u) {
    const ref = db.collection('users').doc(u.uid), meta = db.collection('meta').doc('app');
    let m = await meta.get();
    const snap = await ref.get();
    if (!snap.exists) {
      let r = 'pending';
      if (!m.exists) {
        try { await meta.set({ adminUid: u.uid, created: now() }); r = 'admin'; m = await meta.get(); } catch (e) { r = 'pending'; }
      }
      await ref.set({ name: u.displayName || '', email: u.email || '', photo: u.photoURL || '', role: r, created: now() });
    }
    // The first person who signed in is the super admin for good; everyone learns who that is, nobody can change it.
    const ownerUid = m.exists ? m.data().adminUid : '', sup = ownerUid === u.uid;
    subs.push(ref.onSnapshot((s) => {
      const d = s.data() || {};
      if (d.role !== 'admin' && d.role !== 'user') { subs.slice(1).forEach((f) => f()); subs = subs.slice(0, 1); role = null; hooks.auth({ status: 'pending', uid: u.uid, role: 'pending', super: false, ownerUid, user: d }); return; }
      const first = role === null, changed = role !== d.role; role = d.role;
      if (changed) { subs.slice(1).forEach((f) => f()); subs = subs.slice(0, 1); shadow = {}; loaded = {}; held = {}; parts = {}; listen(u.uid, d.role, sup); }
      if (first || changed) hooks.auth({ status: 'in', uid: u.uid, role: d.role, super: sup, ownerUid, user: d });
    }, fail));
  }

  // The super admin reads everything; admins and operators read what their id is listed on.
  function listen(uid, r, sup) {
    const all = (c) => db.collection(c), has = (c, v) => all(c).where('acl', 'array-contains', v), mine = (c) => (sup ? all(c) : has(c, uid));
    const docs = (s) => s.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    // A list can be fed by several queries; it is passed on once every one of them has answered.
    const on = (name, queries) => {
      parts[name] = queries.map(() => null);
      queries.forEach((q, i) => subs.push(q.onSnapshot((s) => {
        parts[name][i] = docs(s);
        if (parts[name].every(Boolean)) { const seen = {}; take(name, [].concat(...parts[name]).filter((d) => !seen[d.id] && (seen[d.id] = 1))); }
      }, (e) => { parts[name][i] = parts[name][i] || []; if (!loaded[name] && parts[name].every(Boolean)) take(name, [].concat(...parts[name])); fail(e); })));
    };
    // Companies and directions come only if this person was given access; audiences and topics ('*') are shared.
    on('params', sup ? [all('params')] : [has('params', '*'), has('params', uid)]);
    on('vectors', [mine('vectors')]); on('cards', [mine('cards')]); on('gdocs', [mine('gdocs')]); on('leads', [mine('leads')]); on('users', [all('users')]);
    on('taken', [sup ? all('taken') : all('taken').where('owner', '==', uid)]);
    if (r === 'admin') on('guards', [all('guards')]);
    else subs.push(db.collection('guards').doc(uid).onSnapshot((s) => take('guards', s.exists ? [Object.assign({ id: uid }, s.data())] : []), () => take('guards', [])));
    subs.push(db.collection('workspace').doc('shared').onSnapshot((s) => take('workspace', s.exists ? s.data() : null), fail));
  }
  // A snapshot that arrives while local edits are waiting to be written is held back, so it cannot overwrite them.
  function take(name, data) {
    if (dirty) { held[name] = data; return; }
    apply(name, data);
  }
  function apply(name, data) {
    hooks.data(name, data);
    loaded[name] = true;
    if (name !== 'users' && name !== 'guards') shadow[name] = strings(hooks.collect()[name]);
  }
  const strings = (docs) => { const m = {}; Object.keys(docs || {}).forEach((id) => { m[id] = JSON.stringify(docs[id]); }); return m; };
  const ready = () => LISTS.concat('workspace').every((n) => loaded[n]);

  function schedule() { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 700); }
  function flush() {
    clearTimeout(timer);
    if (!dirty || !db || !ready()) return;
    dirty = false;
    const cur = hooks.collect(), ops = [];
    LISTS.concat('workspace').forEach((name) => {
      const next = strings(cur[name]), prev = shadow[name] || {};
      Object.keys(next).forEach((id) => { if (next[id] !== prev[id]) ops.push(['set', name, id, JSON.parse(next[id])]); });
      Object.keys(prev).forEach((id) => { if (!(id in next)) ops.push(['del', name, id]); });
      shadow[name] = next;
    });
    const waiting = held; held = {};
    Object.keys(waiting).forEach((name) => apply(name, waiting[name]));
    // "Already in work" markers go in their own batch, so a clash there can never block saving the real data.
    [ops.filter((o) => o[1] !== 'taken'), ops.filter((o) => o[1] === 'taken')].forEach((group) => {
      for (let i = 0; i < group.length; i += 400) {
        const b = db.batch();
        group.slice(i, i + 400).forEach((o) => { const ref = db.collection(o[1]).doc(o[2]); if (o[0] === 'set') b.set(ref, o[3]); else b.delete(ref); });
        b.commit().catch(fail);
      }
    });
  }
  function fail(e) { if (hooks.error) hooks.error(e); }

  return {
    init, schedule, flush,
    signIn() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch((e) => hooks.auth({ status: 'out', err: e.message })); },
    signOut() { flush(); auth.signOut(); },
    setRole(uid, r) { db.collection('users').doc(uid).update({ role: r }).catch(fail); },
    setGuard(uid, list) { db.collection('guards').doc(uid).set({ list }).catch(fail); },
    // Who already works with this contact (a user id), or null. Reads one marker by its exact id; markers cannot be listed.
    // Asks the server to write, polish or check a letter. The AI keys stay on the server.
    ai(payload) { return firebase.app().functions('europe-west1').httpsCallable('ai', { timeout: 130000 })(payload).then((r) => r.data); },
    // Asks the server to open a company's website and look for the given words.
    research(payload) { return firebase.app().functions('europe-west1').httpsCallable('research', { timeout: 250000 })(payload).then((r) => r.data); },
    fn(name, payload, ms) { return firebase.app().functions('europe-west1').httpsCallable(name, { timeout: ms || 70000 })(payload).then((r) => r.data); },
    mailTest(payload) { return firebase.app().functions('europe-west1').httpsCallable('mailTest', { timeout: 70000 })(payload).then((r) => r.data); },
    criterion(payload) { return firebase.app().functions('europe-west1').httpsCallable('criterion', { timeout: 70000 })(payload).then((r) => r.data); },
    find(payload) { return firebase.app().functions('europe-west1').httpsCallable('find', { timeout: 310000 })(payload).then((r) => r.data); },
    takenBy(id) { return db.collection('taken').doc(id).get().then((s) => (s.exists ? s.data().owner : null)).catch(() => null); },
  };
})();
