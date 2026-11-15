// Sign-in and shared data in Firebase. The app keeps working on its in-memory state;
// this layer loads that state from Firestore and writes back only the documents that changed.
const Cloud = (function () {
  const LISTS = ['params', 'vectors', 'cards', 'gdocs'];
  let db, auth, hooks, subs = [], shadow = {}, loaded = {}, held = {}, dirty = false, timer = null, role = null;
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
  function stop() { subs.forEach((f) => f()); subs = []; shadow = {}; loaded = {}; held = {}; dirty = false; role = null; clearTimeout(timer); }

  // First sign-in creates the user. Whoever signs in first becomes the admin; everyone else waits for approval.
  async function enter(u) {
    const ref = db.collection('users').doc(u.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      let r = 'pending';
      const meta = db.collection('meta').doc('app');
      if (!(await meta.get()).exists) {
        try { await meta.set({ adminUid: u.uid, created: now() }); r = 'admin'; } catch (e) { r = 'pending'; }
      }
      await ref.set({ name: u.displayName || '', email: u.email || '', photo: u.photoURL || '', role: r, created: now() });
    }
    subs.push(ref.onSnapshot((s) => {
      const d = s.data() || {};
      if (d.role !== 'admin' && d.role !== 'user') { subs.slice(1).forEach((f) => f()); subs = subs.slice(0, 1); role = null; hooks.auth({ status: 'pending', uid: u.uid, role: 'pending', user: d }); return; }
      const first = role === null, changed = role !== d.role; role = d.role;
      if (changed) { subs.slice(1).forEach((f) => f()); subs = subs.slice(0, 1); shadow = {}; loaded = {}; held = {}; listen(u.uid, d.role); }
      if (first || changed) hooks.auth({ status: 'in', uid: u.uid, role: d.role, user: d });
    }, fail));
  }

  function listen(uid, r) {
    const all = (c) => db.collection(c), mine = (c) => (r === 'admin' ? all(c) : all(c).where('acl', 'array-contains', uid));
    const on = (name, query) => subs.push(query.onSnapshot((s) => take(name, s.docs.map((d) => Object.assign({ id: d.id }, d.data()))), fail));
    on('params', all('params')); on('vectors', mine('vectors')); on('cards', mine('cards')); on('gdocs', mine('gdocs')); on('users', all('users'));
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
    if (name !== 'users') shadow[name] = strings(hooks.collect()[name]);
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
    for (let i = 0; i < ops.length; i += 400) {
      const b = db.batch();
      ops.slice(i, i + 400).forEach((o) => { const ref = db.collection(o[1]).doc(o[2]); if (o[0] === 'set') b.set(ref, o[3]); else b.delete(ref); });
      b.commit().catch(fail);
    }
  }
  function fail(e) { if (hooks.error) hooks.error(e); }

  return {
    init, schedule, flush,
    signIn() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch((e) => hooks.auth({ status: 'out', err: e.message })); },
    signOut() { flush(); auth.signOut(); },
    setRole(uid, r) { db.collection('users').doc(uid).update({ role: r }).catch(fail); },
  };
})();
