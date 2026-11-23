// Shared platform layer for every game: saves, identity, theme, and the small UI behaviours behind style.css.
// Saves are async on purpose: they are written to this browser first and, for a signed-in person the games server knows,
// uploaded from there (the outbox), with the same four methods either way.
(() => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  // ---- Saves in this browser. Stored data is a trust boundary: anything not shaped like a v1 record is dropped.
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
  const newest = (a, b) => b.updatedAt.localeCompare(a.updatedAt);

  // ---- Identity. With a publishable key from the server (config.js) this is the ClerkJS session;
  // without one, a host page may define window.NL_IDENTITY (the local test path).
  const key = window.NL_CONFIG?.clerkPublishableKey;
  const signInOn = typeof key === 'string';
  const payload = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; } };
  const personIn = t => { const id = payload(t ?? '')?.nl_person_id; return UUID.test(id) ? id : null; };
  // The Worker let this page through on ClerkJS's __session cookie (docs/decisions/0003), so its person is known before
  // ClerkJS loads. Unverified here, it only chooses whose cached data to show; the server verifies every call.
  const cookiePerson = signInOn ? personIn(/(?:^|;\s*)__session=([^;]*)/.exec(document.cookie)?.[1]) : null;

  // Last known saves lists and name for one person, shown at once on the next load and then refreshed. Untrusted when read.
  const CACHE = 'nl-games-cache-v1';
  const cacheRead = who => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE));
      if (!UUID.test(who) || !c || c.personPublicId !== who) return null;
      const lists = {};
      for (const [game, list] of Object.entries(c.lists && typeof c.lists === 'object' ? c.lists : {})) {
        if (Array.isArray(list)) lists[game] = list.filter(r => valid(r) && r.personPublicId === who && r.game === game);
      }
      return { personPublicId: who, displayName: typeof c.displayName === 'string' ? c.displayName.slice(0, 100) : '', lists };
    } catch { return null; }
  };
  const cacheWrite = (who, change) => {
    if (!UUID.test(who)) return;
    try {
      const c = cacheRead(who) || { personPublicId: who, displayName: '', lists: {} };
      change(c);
      localStorage.setItem(CACHE, JSON.stringify(c));
    } catch {}
  };
  const cacheClear = () => { try { localStorage.removeItem(CACHE); } catch {} };

  let clerk = null, unlinked = false, leaving = false, settled = !signInOn;
  const early = cacheRead(cookiePerson);
  let me = early?.displayName ? { displayName: early.displayName, personPublicId: cookiePerson } : null;
  const token = async fresh => { try { return (await clerk?.session?.getToken(fresh ? { skipCache: true } : undefined)) || null; } catch { return null; } };
  const signedIn = async () => {
    if (!window.Clerk) await new Promise((ok, fail) => {
      const s = document.createElement('script');
      // Same pinned URL as site/signin.html, so the browser cache is shared; keep the two equal.
      s.src = `https://${atob(key.split('_')[2]).slice(0, -1)}/npm/@clerk/clerk-js@5.128.1/dist/clerk.browser.js`; // the key encodes "<frontend api host>$"
      s.crossOrigin = 'anonymous';
      s.dataset.clerkPublishableKey = key;
      s.onload = ok; s.onerror = fail;
      document.head.append(s);
    });
    await window.Clerk.load();
    clerk = window.Clerk;
    const at = clerk.user?.id ?? null;
    clerk.addListener(({ user }) => { // sign-in, sign-out or switch, here or in another tab: forget the cache and start clean
      if (leaving || (user?.id ?? null) === at) return;
      cacheClear();
      location.reload();
    });
    if (!clerk.user) return null;
    const t = await token();
    const personPublicId = personIn(t); // the server checks the same claim on every call
    unlinked = !!t && !personPublicId; // signed in, but the Control Center has not linked a person yet
    return { displayName: (clerk.user.firstName || clerk.user.username || '').trim(), personPublicId };
  };
  const identity = () => {
    if (signInOn) return me && { ...me };
    const i = window.NL_IDENTITY;
    if (!i || typeof i.displayName !== 'string' || !i.displayName.trim()) return null;
    return { displayName: i.displayName.trim(), personPublicId: UUID.test(i.personPublicId) ? i.personPublicId : null };
  };
  // Always resolves, never rejects: any failure or a 10 second wait counts as signed out.
  const ready = !signInOn ? Promise.resolve(identity())
    : Promise.race([signedIn().catch(() => null), new Promise(ok => setTimeout(ok, 10000, null))]).then(i => {
      me = i;
      settled = true;
      if (i?.personPublicId) cacheWrite(i.personPublicId, c => { c.displayName = i.displayName; });
      return identity();
    });
  // Whose saves this browser shows and writes now; known from the cookie before ClerkJS answers.
  const person = () => signInOn ? (me?.personPublicId ?? cookiePerson) : identity()?.personPublicId ?? null;
  const remoteOn = () => settled && !!clerk && !!me?.personPublicId;
  // Signed in as a person, the copies here are an outbox for the server rather than the store.
  const outbox = () => signInOn && person() !== null;
  const mine = r => r.personPublicId === null || r.personPublicId === person();

  // ---- The games server, for a signed-in person it knows. Calls run one at a time, so an upload and a delete of the
  // same save can never cross. A 401 means the cached token expired: refresh it and try once more.
  const api = async (path, init = {}) => {
    for (let attempt = 0; ; attempt++) {
      const t = await token(attempt > 0);
      if (!t) throw new Error('Not signed in');
      const r = await fetch('/api/saves' + path, { ...init, headers: { Authorization: `Bearer ${t}` } });
      if (r.status === 401 && attempt === 0) continue;
      if (r.status === 404) return null;
      if (!r.ok) throw Object.assign(new Error(`Saves request failed (${r.status})`), { status: r.status });
      return r.status === 204 ? null : r.json();
    }
  };
  let queue = Promise.resolve();
  const serial = fn => { const run = queue.then(fn); queue = run.catch(() => {}); return run; };

  // Why the server refused the last upload of a save, by id; a pending save without one is simply not uploaded yet.
  const refused = {};
  const flagged = r => ({ ...r, pending: refused[r.id] || true });
  const withLocal = (game, server) => {
    const all = new Map(server.map(r => [r.id, r]));
    for (const r of read()) {
      if (r.game === game && mine(r) && !(all.get(r.id)?.updatedAt >= r.updatedAt)) all.set(r.id, flagged(r));
    }
    return [...all.values()].sort(newest);
  };
  const localList = game => read().filter(r => r.game === game && mine(r)).sort(newest);

  // Uploads this browser's copies for the signed-in person: saves not yet confirmed, and saves made here before any
  // sign-in, which go to the first account. Another person's copies wait for that person. A copy is dropped only once
  // the server holds it or something newer, and only if no newer save replaced it here meanwhile.
  const sync = () => ready.then(async () => {
    if (!remoteOn()) return;
    const who = me.personPublicId;
    try { if (read().some(r => r.personPublicId === null)) write(read().map(r => r.personPublicId === null ? { ...r, personPublicId: who } : r)); } catch {}
    let changed = false;
    for (const { id } of read().filter(r => r.personPublicId === who)) await serial(async () => {
      const r = read().find(x => x.id === id && x.personPublicId === who);
      if (!r) return; // deleted meanwhile
      try {
        const kept = await api('/' + id);
        const stored = valid(kept) && kept.updatedAt >= r.updatedAt ? kept
          : await api('/' + id, { method: 'PUT', body: JSON.stringify(r) });
        if (!valid(stored)) throw new Error('Save was not stored');
        try { write(read().filter(x => !(x.id === id && x.updatedAt === r.updatedAt))); } catch {}
        delete refused[id];
        cacheWrite(who, c => {
          const list = c.lists[stored.game];
          if (list) c.lists[stored.game] = [stored, ...list.filter(x => x.id !== id)].sort(newest);
        });
      } catch (e) {
        const why = { 400: 'refused', 409: 'save_limit', 413: 'too_large' }[e.status];
        if (why) refused[id] = why; else delete refused[id];
      }
      changed = true;
    });
    if (changed) dispatchEvent(new Event('nl-saves'));
  });

  const saves = {
    // The server's list with this browser's pending copies on top, each marked `pending`. Rejects when the server
    // cannot be reached; `cached` has the last known list for that case.
    list: async game => {
      await ready;
      if (!remoteOn()) return localList(game);
      const server = (await serial(() => api('?game=' + encodeURIComponent(game)))).filter(valid);
      cacheWrite(me.personPublicId, c => { c.lists[game] = server; });
      return withLocal(game, server);
    },
    // At once, without the network: the last known list for this person plus pending copies, or null when nothing is
    // known yet (never an invented empty list).
    cached: game => {
      if (!outbox()) return localList(game);
      const list = cacheRead(person())?.lists[game];
      return list ? withLocal(game, list) : null;
    },
    get: async id => {
      const here = read().find(r => r.id === id && mine(r)) || null;
      await ready;
      if (!remoteOn() || !UUID.test(id)) return here;
      try {
        const there = await serial(() => api('/' + id));
        if (!valid(there)) return here;
        return here && here.updatedAt > there.updatedAt ? here : there;
      } catch (e) {
        const known = here || Object.values(cacheRead(person())?.lists ?? {}).flat().find(r => r.id === id);
        if (known) return known;
        throw e;
      }
    },
    // Written here first and uploaded in the background, so a save survives a failed upload, a closed tab or no network.
    put: async record => {
      if (!valid(record)) throw new Error('Invalid save record');
      const r = outbox() ? { ...record, personPublicId: person() } : record;
      write([...read().filter(x => x.id !== r.id), r]);
      delete refused[r.id];
      sync();
      return r;
    },
    // Signed in, a delete must reach the server, or the save would come back from there; it rejects if it cannot.
    remove: async id => {
      await ready;
      if (outbox() && !remoteOn()) throw new Error('Not signed in');
      await serial(async () => { // in the queue, so no upload of this save can start after it
        if (remoteOn() && UUID.test(id)) await api('/' + id, { method: 'DELETE' });
        write(read().filter(r => !(r.id === id && mine(r))));
      });
      delete refused[id];
      if (remoteOn()) cacheWrite(me.personPublicId, c => { for (const g in c.lists) c.lists[g] = c.lists[g].filter(r => r.id !== id); });
    },
  };
  sync(); // whatever an earlier visit could not upload
  addEventListener('online', sync);

  // ---- Shared account control: renders nothing without a key, so the plain static preview stays as it was.
  // It shows the cached name at once, a skeleton when there is none, and never waits forever.
  const account = async box => {
    box.hidden = true;
    if (!signInOn) return;
    const keep = [...box.children];
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const fill = (...nodes) => { box.replaceChildren(...keep, ...nodes); box.hidden = false; };
    const named = n => el('p', '', n ? `Signed in as ${n}` : 'Signed in');
    const button = (text, onclick) => { const b = el('button', 'btn', text); b.onclick = onclick; b.disabled = !onclick; return b; };
    box.setAttribute('aria-busy', 'true');
    if (me) fill(named(me.displayName), button('Sign out'));
    else fill(el('p', 'skeleton line'), el('div', 'skeleton button'));
    const i = await ready;
    box.removeAttribute('aria-busy');
    if (!clerk) return fill(el('p', '', 'Could not load your account.'), button('Try again', () => location.reload()));
    if (!clerk.user) { box.hidden = true; return; }
    const extra = [];
    if (unlinked) {
      const a = el('a', '', 'Control Center');
      a.href = 'https://admin.nordgrenlabs.com/';
      const setup = el('p', '', 'Finish setting up your account in the ');
      setup.append(a, ' to keep saved games across devices.');
      extra.push(setup);
    }
    // Back to this same address signed out, where the Worker shows the sign-in page.
    fill(named(i?.displayName), ...extra, button('Sign out', () => { leaving = true; cacheClear(); clerk.signOut({ redirectUrl: location.href }); }));
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

  // ---- Tap feedback: :active ends the moment a finger lifts, so the pressed look (.tapped in style.css) lingers a moment.
  const lingering = new WeakMap();
  document.addEventListener('pointerdown', e => {
    const t = e.target.closest?.('button, a, summary');
    if (!t || t.matches(':disabled')) return;
    clearTimeout(lingering.get(t));
    t.classList.add('tapped');
    const done = new AbortController();
    const lift = () => { done.abort(); lingering.set(t, setTimeout(() => t.classList.remove('tapped'), 350)); };
    addEventListener('pointerup', lift, { signal: done.signal });
    addEventListener('pointercancel', lift, { signal: done.signal });
  });

  // ---- Sheets swipe away like an iPhone's: drag a dialog.sheet down and let go past a third of it, or flick it.
  // A drag only starts when nothing under the finger is scrolled down, so long sheets still scroll first.
  // Not from a slider or a Dots board: a finger there is doing something else.
  let sheet = null, x0 = 0, y0 = 0, t0 = 0, dy = 0, dragging = false;
  const settle = (d, to, then) => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    d.style.transition = calm ? 'none' : 'transform .2s ease-out';
    d.style.transform = to;
    setTimeout(() => { then?.(); d.style.transition = d.style.transform = ''; }, calm ? 0 : 200);
  };
  document.addEventListener('touchstart', e => {
    sheet = e.touches.length === 1 ? e.target.closest?.('dialog.sheet[open]') : null;
    if (!sheet || e.target.closest('input[type=range], svg.board')) return void (sheet = null);
    for (let el = e.target; el && el !== sheet.parentNode; el = el.parentElement) if (el.scrollTop > 0) return void (sheet = null);
    ({ clientX: x0, clientY: y0 } = e.touches[0]); t0 = e.timeStamp; dy = 0; dragging = false;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!sheet) return;
    dy = e.touches[0].clientY - y0;
    if (!dragging) {
      const dx = Math.abs(e.touches[0].clientX - x0);
      if (dy < 8 && dx < 8) return;
      if (dy <= dx) return void (sheet = null); // sideways or upward: leave it to scrolling
      dragging = true;
    }
    e.preventDefault(); // the sheet moves instead of the page behind it
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  const drop = e => {
    const d = sheet; sheet = null;
    if (!d || !dragging) return;
    if (e.cancelable) e.preventDefault(); // no click on whatever the finger started on
    const flick = dy > 30 && dy / (e.timeStamp - t0) > 0.5;
    if (e.type === 'touchend' && (flick || dy > Math.min(140, d.offsetHeight / 3))) settle(d, 'translateY(110%)', () => d.close());
    else settle(d, 'translateY(0)');
  };
  document.addEventListener('touchend', drop, { passive: false });
  document.addEventListener('touchcancel', drop);

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

  // Session token for a game's own API calls (null when signed out or without sign-in); fresh skips ClerkJS's cache.
  const sessionToken = fresh => ready.then(() => token(fresh));
  window.NL = { saves, identity, ready, person, get settled() { return settled; }, account, theme: { get, set }, menu, segmented, token: sessionToken };
})();
