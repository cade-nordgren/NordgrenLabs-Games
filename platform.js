// Shared platform layer for every game: saves, identity, theme, and the small UI behaviours behind style.css.
// Saves are async on purpose: a server API can replace localStorage here without touching game code.
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

  const saves = {
    list: async game => read().filter(r => r.game === game).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    get: async id => read().find(r => r.id === id) || null,
    put: async record => {
      if (!valid(record)) throw new Error('Invalid save record');
      write([...read().filter(r => r.id !== record.id), record]);
      return record;
    },
    remove: async id => { write(read().filter(r => r.id !== id)); },
  };

  // ---- Identity. Prototype: a host page may define window.NL_IDENTITY; later this is the signed-in platform person.
  const identity = () => {
    const i = window.NL_IDENTITY;
    if (!i || typeof i.displayName !== 'string' || !i.displayName.trim()) return null;
    return { displayName: i.displayName.trim(), personPublicId: UUID.test(i.personPublicId) ? i.personPublicId : null };
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

  // ---- Top bar highlight: follows mouse hover and keyboard focus, jumps to the pressed item on touch, hidden otherwise.
  const topbar = nav => {
    const hl = nav.querySelector('.hl');
    let shown = false, timer;
    const hide = () => { clearTimeout(timer); hl.classList.remove('on'); shown = false; };
    const show = item => {
      clearTimeout(timer);
      if (!item || item.disabled) return hide();
      if (!shown) hl.classList.add('jump'); // appear in place rather than sliding in from the last item
      hl.style.setProperty('--x', item.offsetLeft + 'px');
      hl.style.setProperty('--w', item.offsetWidth + 'px');
      if (!shown) { void hl.offsetWidth; hl.classList.remove('jump'); }
      hl.classList.add('on');
      shown = true;
    };
    const focused = () => nav.querySelector('.item:focus-visible');
    nav.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') show(e.target.closest('.item')); });
    nav.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') focused() ? show(focused()) : hide(); });
    nav.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') show(e.target.closest('.item')); });
    nav.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') timer = setTimeout(hide, 250); });
    nav.addEventListener('pointercancel', hide);
    nav.addEventListener('focusin', e => { if (e.target.matches(':focus-visible')) show(e.target); });
    nav.addEventListener('focusout', e => { if (!nav.contains(e.relatedTarget)) hide(); });
    return hide;
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

  window.NL = { saves, identity, theme: { get, set }, topbar, segmented };
})();
