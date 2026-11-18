// Shared platform layer for every game: saves, identity, theme, and the small UI behaviours behind style.css.
// Saves are async on purpose: signed out they live in localStorage, signed in on the games server, same four methods.
(() => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  // ---- Saves. Stored data is a trust boundary: anything not shaped like a v1 record is dropped.
  const SAVES = 'nl-games-saves-v1';
  const valid = r => !!r && typeof r === 'object' && r.schemaVersion === 1 && UUID.test(r.id)
    && typeof r.game === 'string' && (r.personPublicId === null || UUID.test(r.personPublicId))
    && typeof r.title === 'string' && (r.status === 'in_progress' || r.status === 'finished')
    && ISO.test(r.createdAt) && ISO.test(r.updatedAt) && !!r.state && typeof r.state === 'object';
  const read = () => {
    try {
      const all = JSON.parse(localStorage.getItem(SAVES));
      return Array.isArray(all) ? all.filter(valid) : [];
    } catch { return []; }
  };
  const write = all => localStorage.setItem(SAVES, JSON.stringify(all)); // throws when storage is full or blocked; callers reject

  const local = {
    list: async game => read().filter(r => r.game === game).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    get: async id => read().find(r => r.id === id) || null,
    put: async record => {
      if (!valid(record)) throw new Error('Invalid save record');
      write([...read().filter(r => r.id !== record.id), record]);
      return record;
    },
    remove: async id => { write(read().filter(r => r.id !== id)); },
  };

  // ---- Identity. With a publishable key from the server (config.js) this is the ClerkJS session;
  // without one, a host page may define window.NL_IDENTITY (the local test path).
  const key = window.NL_CONFIG?.clerkPublishableKey;
  let clerk = null, me = null, unlinked = false;
  const token = async () => { try { return (await clerk?.session?.getToken()) || null; } catch { return null; } };
  const signedIn = async () => {
    if (!window.Clerk) await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = `https://${atob(key.split('_')[2]).slice(0, -1)}/npm/@clerk/clerk-js@5.128.1/dist/clerk.browser.js`; // the key encodes "<frontend api host>$"
      s.crossOrigin = 'anonymous';
      s.dataset.clerkPublishableKey = key;
      s.onload = ok; s.onerror = fail;
      document.head.append(s);
    });
    await window.Clerk.load();
    clerk = window.Clerk;
    const at = clerk.user?.id ?? null;
    clerk.addListener(({ user }) => { if ((user?.id ?? null) !== at) location.reload(); }); // sign-in, sign-out or switch: start clean
    if (!clerk.user) return null;
    let personPublicId = null;
    try {
      const t = await token(), r = t && await fetch('/api/me', { headers: { Authorization: `Bearer ${t}` } });
      const id = r?.ok ? (await r.json()).personPublicId : null;
      unlinked = r?.status === 403; // signed in, but the Control Center has not linked a person yet
      if (UUID.test(id)) personPublicId = id; // 401, 403 or offline: no server saves
    } catch {}
    return { displayName: (clerk.user.firstName || clerk.user.username || '').trim(), personPublicId };
  };
  const identity = () => {
    if (typeof key === 'string') return me && { ...me };
    const i = window.NL_IDENTITY;
    if (!i || typeof i.displayName !== 'string' || !i.displayName.trim()) return null;
    return { displayName: i.displayName.trim(), personPublicId: UUID.test(i.personPublicId) ? i.personPublicId : null };
  };
  // Always resolves, never rejects: any failure or a 10 second wait counts as signed out.
  const ready = typeof key !== 'string' ? Promise.resolve(identity())
    : Promise.race([signedIn().catch(() => null), new Promise(ok => setTimeout(ok, 10000, null))]).then(i => { me = i; return identity(); });

  // ---- Server saves, for a signed-in person the server knows. A failure rejects; it never falls back to this
  // browser, which would split one person's saves in two.
  const api = async (path, init) => {
    const t = await token();
    if (!t) throw new Error('Not signed in');
    const r = await fetch('/api/saves' + path, { ...init, headers: { Authorization: `Bearer ${t}` } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Saves request failed (${r.status})`);
    return r.status === 204 ? null : r.json();
  };
  const remote = {
    list: async game => (await api('?game=' + encodeURIComponent(game))).filter(valid),
    get: async id => { const r = UUID.test(id) ? await api('/' + id) : null; return valid(r) ? r : null; },
    put: async record => {
      if (!valid(record)) throw new Error('Invalid save record');
      const r = await api('/' + record.id, { method: 'PUT', body: JSON.stringify(record) });
      if (!valid(r)) throw new Error('Save was not stored');
      return r;
    },
    remove: async id => { if (UUID.test(id)) await api('/' + id, { method: 'DELETE' }); },
  };
  // On sign-in, saves made in this browser while signed out move to the account. One that fails stays here for next time.
  const moved = ready.then(async i => {
    if (!i?.personPublicId) return false;
    for (const r of read()) try {
      const kept = await remote.get(r.id);
      if (!kept || kept.updatedAt < r.updatedAt) await remote.put(r); // never overwrite a newer copy on the server
      write(read().filter(x => x.id !== r.id));
    } catch {}
    return true;
  });
  const saves = Object.fromEntries(Object.keys(local).map(m => [m, async (...a) => ((await moved) ? remote : local)[m](...a)]));

  // Shared account control: renders nothing without a key, so the plain static preview stays as it was.
  const account = async box => {
    box.hidden = true;
    if (typeof key !== 'string') return;
    const i = await ready;
    if (!clerk) return; // ClerkJS did not load, so there is nothing to sign in with
    const p = text => { const e = document.createElement('p'); e.textContent = text; return e; };
    const b = document.createElement('button');
    b.className = 'btn';
    if (!clerk.user) {
      b.textContent = 'Sign in';
      b.onclick = () => { box.closest('dialog')?.close(); clerk.openSignIn(); }; // Clerk's modal would sit under an open sheet
      box.append(p('Sign in to keep saved games across devices.'), b);
    } else {
      b.textContent = 'Sign out';
      b.onclick = () => clerk.signOut();
      box.append(p(i?.displayName ? `Signed in as ${i.displayName}` : 'Signed in'));
      if (unlinked) {
        const a = document.createElement('a');
        a.href = 'https://admin.nordgrenlabs.com/';
        a.textContent = 'Control Center';
        const setup = p('Finish setting up your account in the ');
        setup.append(a, ' to keep saved games across devices.');
        box.append(setup);
      }
      box.append(b);
    }
    box.hidden = false;
  };

  // ---- Theme. Preference system|light|dark in localStorage; the resolved light|dark lives on <html data-theme>.
  const THEME = 'nl-games-theme', dark = matchMedia('(prefers-color-scheme: dark)');
  const stored = () => { try { return localStorage.getItem(THEME); } catch { return null; } };
  const get = () => { const p = stored(); return p === 'light' || p === 'dark' ? p : 'system'; };
  const apply = () => {
    const p = get();
    document.documentElement.dataset.theme = p === 'system' ? (dark.matches ? 'dark' : 'light') : p;
  };
  const set = p => {
    try { localStorage.setItem(THEME, p === 'light' || p === 'dark' ? p : 'system'); } catch {}
    apply();
  };
  if (stored() !== null && stored() !== get()) set('system'); // a corrupt stored value heals to system
  dark.addEventListener('change', apply);
  apply();

  // ---- Menu: the trigger opens and closes the items; Esc, a tap outside or choosing an item closes it,
  // except items marked data-keep-open (Undo, so several steps can be undone in a row).
  const menu = nav => {
    const trigger = nav.querySelector('.menu-trigger'), list = nav.querySelector('.menu-items');
    const isOpen = () => nav.classList.contains('open');
    const set = open => {
      nav.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', open);
      trigger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      list.inert = !open;
      if (open) [...list.children].filter(i => !i.hidden).forEach((item, k) => item.style.setProperty('--i', k + 1));
    };
    trigger.onclick = () => set(!isOpen());
    // Capture runs before the item's own handler, so a sheet it opens hands focus back to the trigger on close.
    list.addEventListener('click', e => {
      if (!e.target.closest('.item:not([data-keep-open])')) return;
      trigger.focus();
      set(false);
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { set(false); trigger.focus(); } });
    document.addEventListener('pointerdown', e => { if (isOpen() && !nav.contains(e.target)) set(false); });
    set(false);
  };

  // ---- Segmented control: wires the buttons once, returns a function that shows the chosen value.
  const segmented = (group, onPick) => {
    const buttons = [...group.querySelectorAll('button')];
    group.style.setProperty('--n', buttons.length);
    for (const b of buttons) b.onclick = () => { if (b.getAttribute('aria-pressed') !== 'true') onPick(b.value); };
    return value => buttons.forEach((b, i) => {
      b.setAttribute('aria-pressed', b.value === value);
      if (b.value === value) group.style.setProperty('--i', i);
    });
  };

  window.NL = { saves, identity, ready, account, theme: { get, set }, menu, segmented };
})();
