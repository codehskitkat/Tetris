(function () {
  // --- CONFIG ---
  const DUEL_QUEUE_PATH = 'duel_queue';
  const ACTIVE_DUELS_PATH = 'active_duels';
  const TOURNAMENT_QUEUE_PATH = 'tournament_queue';
  const TOURNAMENTS_PATH = 'tournaments';
  const USERS_PATH = 'users'; // your users/ node
  const DUEL_INACTIVITY_MS = 5000; // Lowered: if opponent doesn't update pieces in this time, they lose
  const PIECE_PUSH_THROTTLE_MS = 1000/60;
  const COUNTDOWN_MS = 1000;
  const MIN_TOURNAMENT_PLAYERS = 2;
  const PREVIEW_CELL = 18;
  const PREVIEW_COLS = 10, PREVIEW_ROWS = 20;
  const PREVIEW_W = PREVIEW_COLS * PREVIEW_CELL;
  const PREVIEW_H = PREVIEW_ROWS * PREVIEW_CELL;
  let _tournamentFinishedLocally = false;
 
  
  let diddyWin = false;
    let _duelFinishedLocally = false;

  function getDB() {
    if (typeof db !== 'undefined') return db;
    if (window.firebase && firebase.database) return firebase.database();
    throw new Error('Firebase Realtime Database (db) not found.');
  }
  function getLocalUser() {
    if (typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.username) return { username: CURRENT_USER.username };
    if (typeof getLocalAuth === 'function') {
      const a = getLocalAuth();
      if (a && a.username) return { username: a.username };
    }
    return null;
  }
  
  
  function safeKey(name) { return encodeURIComponent(String(name)).replace(/\./g, '%2E'); }
  function readUserStats(username) {
    const dbRef = getDB().ref(USERS_PATH + '/' + safeKey(username));
    return dbRef.once('value').then(snap => {
      const v = snap.val() || {};
      return {
        duelWins: v.duelWins || 0,
        duelLosses: v.duelLosses || 0,
        tourWins: v.tournamentWins || 0,
        tourLosses: v.tournamentLosses || 0
      };
    });
  }
  async function incrementUserStat(username, field, delta = 1) {
    const key = safeKey(username);
    const ref = getDB().ref(`${USERS_PATH}/${key}/${field}`);
    await ref.transaction(cur => (cur || 0) + delta);
  }
  function now() { return Date.now(); }

  function createDropdownAt(x, y, htmlContent) {
    const root = document.createElement('div');
    root.className = 'mp-dropdown';
    Object.assign(root.style, {
      position: 'absolute',
      zIndex: 10050,
      left: x + 'px',
      top: y + 'px',
      background: 'linear-gradient(180deg, rgba(6,8,12,0.98), rgba(12,14,20,0.98))',
      padding: '10px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.06)',
      color: '#fff',
      pointerEvents: 'auto',
      minWidth: '280px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.6)'
    });
    root.innerHTML = htmlContent || '';
    document.body.appendChild(root);
    root.dismiss = () => { if (root.parentNode) root.parentNode.removeChild(root); };
    return root;
  }
  function getMenuCanvasRect() {
    const canvas = document.getElementById('game') || document.querySelector('canvas');
    if (!canvas) return { left: 60, top: 60 };
    return canvas.getBoundingClientRect();
  }
  function injectDuelButtonHandler() {
    const list = window.__imageButtons || [];
    const bounds = window.duelBtnBounds || null;
    let btn = null;
    if (bounds) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (Math.abs((b.x + b.w / 2) - (bounds.x + bounds.w / 2)) < 6 &&
          Math.abs((b.y + b.h / 2) - (bounds.y + bounds.h / 2)) < 6) {
          btn = b; break;
        }
      }
    }
    if (!btn) {
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        if (String(b.img && b.img.src || '').includes('139512b6')) { btn = b; break; }
      }
    }
    if (!btn) {
      if (list.length) btn = list[list.length - 1];
    }
    if (!btn) return console.warn('Duel button not found to inject handler.');
    const orig = btn.onClick;
    btn.onClick = function (obj) {
      try { if (typeof orig === 'function') orig(obj); } catch (e) { }
    };
  }
  if (typeof window.showMenu === 'function') {
    const orig = window.showMenu.bind(window);
    window.showMenu = function (...args) {
      orig(...args);
      setTimeout(() => {
        try { injectDuelButtonHandler(); } catch (e) { console.warn('injectDuelButtonHandler error', e); }
      }, 80);
    };
  } else {
    let tries = 0;
    const t = setInterval(() => { tries++; if (tries > 30) clearInterval(t); try { injectDuelButtonHandler(); } catch (e) { } }, 300);
  }

  let currentDropdown = null;
// attach to window so you can call it from anywhere
window.showDuelTournamentWindow = function showDuelTournamentWindow() {
  try { if (currentDropdown) currentDropdown.dismiss(); } catch (e) { /* ignore */ }

  const rect = getMenuCanvasRect();
  const x = rect.left + 60;
  const y = rect.top + 160;
  const user = getLocalUser();
  const uname = user ? user.username : 'guest';

  const windowEl = document.createElement('div');
  windowEl.className = 'mp-window';
  Object.assign(windowEl.style, {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    minWidth: '300px',
    maxWidth: '420px',
    background: '#0f1724',
    color: '#fff',
    borderRadius: '10px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    padding: '12px',
    zIndex: 100100,
    userSelect: 'none',
    cursor: 'default',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
  });

  windowEl.innerHTML = `
    <div id="mp-window-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:grab;">
      <div style="font-weight:900;font-size:13px">DUEL / TOURNAMENT</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="mp-window-close" class="mp-btn" style="padding:6px 8px;border-radius:8px;cursor:pointer;background:transparent;border:1px solid rgba(255,255,255,0.06)">✕</button>
      </div>
    </div>

    <div id="mp-window-body" style="display:flex;flex-direction:column;gap:8px;">
      <div id="mp-stats" style="opacity:0.9;font-size:12px">loading stats…</div>
      <div style="display:flex;gap:8px;">
        <button id="mp-join-duel" class="mp-btn" style="flex:1;padding:8px;border-radius:8px;cursor:pointer">Join Duel</button>
        <button id="mp-join-tourn" class="mp-btn" style="flex:1;padding:8px;border-radius:8px;cursor:pointer">Join Tournament</button>
      </div>
      <div style="font-size:12px;opacity:0.85">Tournament needs at least ${MIN_TOURNAMENT_PLAYERS} players to start.</div>
    </div>
  `;

  document.body.appendChild(windowEl);

  const windowObj = {
    el: windowEl,
    dismiss() {
      try {
        document.removeEventListener('pointerdown', outsideHandler);
        windowEl.removeEventListener('pointerdown', headerPointerDown);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('keydown', onKeyDown);
      } catch (e) { /* ignore */ }
      if (windowEl.parentNode) windowEl.parentNode.removeChild(windowEl);
      if (currentDropdown === windowObj) currentDropdown = null;
    },
    contains(el) { return windowEl.contains(el); }
  };

  // replace currentDropdown so existing code expecting that still works
  currentDropdown = windowObj;

  if (user) {
    readUserStats(uname).then(s => {
      const statsEl = windowEl.querySelector('#mp-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div style="display:flex;gap:8px;justify-content:space-between;">
            <div style="min-width:120px">
              <div style="font-size:11px;opacity:0.8">DUEL</div>
              <div style="font-weight:800">${s.duelWins}W / ${s.duelLosses}L</div>
            </div>
            <div style="min-width:120px">
              <div style="font-size:11px;opacity:0.8">TOURNAMENT</div>
              <div style="font-weight:800">${s.tourWins}W / ${s.tourLosses}L</div>
            </div>
          </div>`;
      }
    }).catch(() => {
      const statsEl = windowEl.querySelector('#mp-stats');
      if (statsEl) statsEl.textContent = 'failed to load stats';
    });
  } else {
    const statsEl = windowEl.querySelector('#mp-stats');
    if (statsEl) statsEl.innerHTML = `<div style="opacity:0.8">Sign in to track wins/losses</div>`;
  }

  const joinDuelBtn = windowEl.querySelector('#mp-join-duel');
  const joinTournBtn = windowEl.querySelector('#mp-join-tourn');
  const closeBtn = windowEl.querySelector('#mp-window-close');

  joinDuelBtn.addEventListener('click', () => {
    if (!getLocalUser()) {
      Swal.fire({ title: 'Sign in', text: 'Please sign in to duel (keeps wins/losses)', icon: 'info' });
      return;
    }
    windowObj.dismiss();
    DuelManager.joinQueue();
  });

  joinTournBtn.addEventListener('click', () => {
    if (!getLocalUser()) {
      Swal.fire({ title: 'Sign in', text: 'Please sign in to join tournaments', icon: 'info' });
      return;
    }
    windowObj.dismiss();
    TournamentManager.joinQueue();
  });

closeBtn.addEventListener('click', () => {

window._destroyQueueOverlay();
});


  const outsideHandler = (ev) => {
    if (!currentDropdown) return;
    if (!windowObj.contains(ev.target)) windowObj.dismiss();
    document.removeEventListener('pointerdown', outsideHandler);
  };
  setTimeout(() => document.addEventListener('pointerdown', outsideHandler), 0);

  const onKeyDown = (ev) => {
    if (ev.key === 'Escape') windowObj.dismiss();
  };
  document.addEventListener('keydown', onKeyDown);

  const header = windowEl.querySelector('#mp-window-header');
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

if (closeBtn) {
  // make sure it sits above and receives pointer events
  closeBtn.style.zIndex = '100101';
  // prevent header's pointerdown from stealing the event
  closeBtn.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    // Allow the button to act normally (we won't call preventDefault here — let click happen)
  });
}

// --- replace headerPointerDown with this version ---
const headerPointerDown = (ev) => {
  // only handle primary button
  if (ev.button !== undefined && ev.button !== 0) return;

  // If the event originated from the close button or other interactive child, skip dragging.
  // Use closest so we cover icon children etc.
  if (ev.target && ev.target.closest && ev.target.closest('#mp-window-close')) {
    return;
  }

  // Optional: if you want to restrict draggable region to header itself (not any child)
  // if (ev.target !== header) return;

  dragging = true;
  const rectNow = windowEl.getBoundingClientRect();
  dragOffsetX = ev.clientX - rectNow.left;
  dragOffsetY = ev.clientY - rectNow.top;
  if (header.setPointerCapture) header.setPointerCapture(ev.pointerId);
  header.style.cursor = 'grabbing';
  ev.preventDefault();
};

  const onPointerMove = (ev) => {
    if (!dragging) return;
    let newLeft = ev.clientX - dragOffsetX;
    let newTop = ev.clientY - dragOffsetY;

    const pad = 8;
    const ww = Math.max(window.innerWidth - pad, pad);
    const hh = Math.max(window.innerHeight - pad, pad);
    const elRect = windowEl.getBoundingClientRect();
    newLeft = Math.min(Math.max(newLeft, pad - 10), ww - elRect.width);
    newTop  = Math.min(Math.max(newTop, pad - 10), hh - elRect.height);

    windowEl.style.left = `${newLeft}px`;
    windowEl.style.top  = `${newTop}px`;
  };

  const onPointerUp = (ev) => {
    if (!dragging) return;
    dragging = false;
    header.releasePointerCapture && header.releasePointerCapture(ev.pointerId);
    header.style.cursor = 'grab';
  };

  header.addEventListener('pointerdown', headerPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);

  return windowObj;
};

// keep original name for compatibility if other code calls showDuelTournamentDropdown()
window.showDuelTournamentDropdown = window.showDuelTournamentWindow;



  // --- Minimal TETROMINO data for duel canvases (self-contained) ---
  const TETROMINOS = {
    I: [[[1, 1, 1, 1]], [[1], [1], [1], [1]]],
    O: [[[1, 1], [1, 1]]],
    T: [[[0, 1, 0], [1, 1, 1]], [[1, 0], [1, 1], [1, 0]], [[1, 1, 1], [0, 1, 0]], [[0, 1], [1, 1], [0, 1]]],
    J: [[[1, 0, 0], [1, 1, 1]], [[1, 1], [1, 0], [1, 0]], [[1, 1, 1], [0, 0, 1]], [[0, 1], [0, 1], [1, 1]]],
    L: [[[0, 0, 1], [1, 1, 1]], [[1, 0], [1, 0], [1, 1]], [[1, 1, 1], [1, 0, 0]], [[1, 1], [0, 1], [0, 1]]],
    S: [[[1, 1, 0], [0, 1, 1]], [[0, 1], [1, 1], [1, 0]]],
    Z: [[[0, 1, 1], [1, 1, 0]], [[1, 0], [1, 1], [0, 1]]]
  };
  const TETRO_TYPES = Object.keys(TETROMINOS);
  const TETRO_COLORS = ['#00f0f0', '#ffd700', '#a020f0', '#0000ff', '#ff7f00', '#00ff00', '#ff0000'];

  function randTetromino() {
    const t = TETRO_TYPES[Math.floor(Math.random() * TETRO_TYPES.length)];
    const rots = TETROMINOS[t];
    const rot = 0;
    const shape = rots[rot].map(row => row.slice());
    const color = TETRO_COLORS[TETRO_TYPES.indexOf(t)] || '#fff';
    return { type: t, rotationIndex: rot, shape, color, x: 3, y: 0 };
  }
  function snapshotPiece(piece) {
    if (!piece) return null;
    return {
      type: piece.type,
      rotationIndex: piece.rotationIndex,
      shape: piece.shape,
      color: piece.color,
      x: piece.x,
      y: piece.y
    };
  }
// ---- Replace DuelCanvasGame with this updated class ----

// ----- Replace DuelCanvasGame with this version (drop-in) -----
// --------------------
// DuelCanvasGame (full class, updated to use per-canvas effects)
// --------------------
class DuelCanvasGame {
constructor({ container, onGameOver, onStateUpdate, cell = PREVIEW_CELL, seed = null, debug = false }) {
  this.cell = cell;
  this.cols = PREVIEW_COLS;
  this.rows = PREVIEW_ROWS;
  this.width = this.cols * this.cell;
  this.height = this.rows * this.cell;
  this.container = container;
  this.onGameOver = onGameOver;
  this.onStateUpdate = onStateUpdate;
  this.debug = !!debug;

  // state
  this.grid = null;
  this.current = null;
  this.next = null;
  this.hold = null;
  this.holdUsed = false;
  this.isGameOver = false;
  this.lines = 0;
  this.score = 0;

  // speed / level
  this.level = 1;
  this.linesClearedThisLevel = 0;
  this.linesNeededForLevelUp = 10;
  this.fallSpeed = 500;

  // repeat helpers (match main game: immediate action then interval)
  this._repeatTimers = {};
  this._repeatInterval = 100; // match game.js KEY_REPEAT_INTERVAL

  this.lastUpdateAt = now();

  this.initDOM();

  this.collisionLock = 0;
  this.LOCK_LIMIT = 3;

  // seed + PRNG (keep seed string for inspection/debug)
  this.seed = String(seed != null ? seed : ('seed-' + Math.floor(Math.random() * 1e9)));

  // provide safe fallback xfnv1a / mulberry32 if missing (small, well-known impls)
  if (typeof xfnv1a !== 'function') {
    window.xfnv1a = function(str) {
      for(var i = 0, h = 2166136261 >>> 0; i < str.length; i++){
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
      }
      return function() { h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; return (h >>> 0); };
    };
  }
  if (typeof mulberry32 !== 'function') {
    window.mulberry32 = function(a) {
      return function() {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967295;
      };
    };
  }

  // create PRNG and ensure outputs are 0..1 floats
  try {
    const seedFn = xfnv1a(this.seed);
    this._prng = mulberry32(seedFn());
  } catch (e) {
    // fallback to Math.random (non-deterministic) but still works
    console.warn('seeded PRNG failed, falling back to Math.random', e);
    this._prng = () => Math.random();
  }

  // helper wrapper to guarantee float [0,1)
  this.rand = () => {
    try {
      const v = this._prng();
      // if impl returns integer outside [0,1), normalize
      if (typeof v === 'number') {
        if (v <= 1 && v >= 0) return v;
        // assume 32-bit int
        return (v >>> 0) / 4294967295;
      }
    } catch (e) {}
    return Math.random();
  };

  this.reset();
  this.bindKeys();

  if (this.debug) {
    console.log('[DuelCanvasGame] seed:', this.seed);
    // show initial 14 pieces (two 7-bags) without consuming them permanently:
    const tmpBagIndex = this._bagIndex;
    const tmpBag = this._bag ? this._bag.slice() : null;
    const preview = [];
    for (let i = 0; i < 14; i++) {
      preview.push(this._nextFromBag());
    }
    // restore
    if (tmpBag) this._bag = tmpBag;
    this._bagIndex = tmpBagIndex;
    console.log('[DuelCanvasGame] next 14 piece types (peek):', preview);
  }
}

initDOM() {
  // root becomes a horizontal layout: canvas on the left, a small sidebar on the right
  const SCALE = 1.6;

  this.root = document.createElement('div');
  this.root.style.display = 'flex';
  this.root.style.flexDirection = 'row';
  this.root.style.alignItems = 'flex-start';
  this.root.style.gap = (8 * SCALE) + 'px';
  this.root.style.userSelect = 'none';

  // left column holds the main preview canvas and the HUD row under it
  const leftCol = document.createElement('div');
  leftCol.style.display = 'flex';
  leftCol.style.flexDirection = 'column';
  leftCol.style.alignItems = 'flex-start';
  leftCol.style.gap = (6 * SCALE) + 'px';

  // preview canvas (main duel area)
  this.canvas = document.createElement('canvas');
  // backing store doubled
  this.canvas.width = this.width * SCALE;
  this.canvas.height = this.height * SCALE;
  // CSS size doubled
  this.canvas.style.width = (this.width * SCALE) + 'px';
  this.canvas.style.height = (this.height * SCALE) + 'px';
  this.canvas.style.background = 'rgba(0,0,0,0.45)';
  this.canvas.style.border = '1px solid rgba(255,255,255,0.03)';
  this.canvas.style.borderRadius = (6 * SCALE) + 'px';
  this.canvas.style.display = 'block';
  this.ctx = this.canvas.getContext('2d');

  // HUD row (compact) under the canvas (left column)
  this.hudRow = document.createElement('div');
  this.hudRow.style.display = 'flex';
  this.hudRow.style.width = (this.width * SCALE) + 'px';
  this.hudRow.style.justifyContent = 'space-between';
  this.hudRow.style.alignItems = 'center';
  this.hudRow.style.color = '#fff';
  this.hudRow.style.fontSize = (12 * SCALE) + 'px';
  this.ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  this.leftHud = document.createElement('div');
  this.leftHud.style.display = 'flex';
  this.leftHud.style.flexDirection = 'column';
  this.leftHud.style.alignItems = 'flex-start';
  this.leftHud.style.gap = (2 * SCALE) + 'px';

  this.levelEl = document.createElement('div'); this.levelEl.textContent = 'Level: 1'; this.levelEl.style.fontWeight = '700'; this.levelEl.style.fontSize = (12 * SCALE) + 'px';
  this.linesEl = document.createElement('div'); this.linesEl.textContent = 'Lines: 0'; this.linesEl.style.fontWeight = '600'; this.linesEl.style.fontSize = (12 * SCALE) + 'px';
  this.leftHud.appendChild(this.levelEl); this.leftHud.appendChild(this.linesEl);

  // NOTE: we no longer put nextCanvas in the hudRow; it lives in the side bar
  this.hudRow.appendChild(this.leftHud);

  leftCol.appendChild(this.canvas);
  leftCol.appendChild(this.hudRow);

  // right sidebar: vertical bar that shows NEXT preview and player name (keeps things aligned)
  const sideBar = document.createElement('div');
  sideBar.style.display = 'flex';
  sideBar.style.flexDirection = 'column';
  sideBar.style.alignItems = 'center';
  sideBar.style.gap = (8 * SCALE) + 'px';
  sideBar.style.minWidth = Math.max(72 * SCALE, Math.floor(this.cell * 4 * SCALE)) + 'px';
  sideBar.style.boxSizing = 'border-box';

  // next preview canvas (kept in sidebar to the right of the main canvas)
  const PREVIEW_N = Math.max(this.cell * 4, 64);
  const scaledN = Math.max(this.cell * 4 * SCALE, 64 * SCALE);
  this.nextCanvas = document.createElement('canvas');
  this.nextCanvas.width = scaledN;
  this.nextCanvas.height = scaledN;
  this.nextCanvas.style.width = scaledN + 'px';
  this.nextCanvas.style.height = scaledN + 'px';
  this.nextCanvas.style.background = 'transparent';
  this.nextCanvas.style.border = '1px solid rgba(255,255,255,0.04)';
  this.nextCanvas.style.borderRadius = (6 * SCALE) + 'px';
  this.nextCanvas.style.display = 'block';
  this.nextCtx = this.nextCanvas.getContext('2d');

  sideBar.appendChild(this.nextCanvas);

  // name element (player name) under the next preview in the sidebar
  this.nameEl = document.createElement('div');
  this.nameEl.style.fontSize = (12 * SCALE) + 'px';
  this.nameEl.style.fontWeight = '700';
  this.nameEl.style.color = '#fff';
  this.nameEl.style.textAlign = 'center';
  sideBar.appendChild(this.nameEl);

  // assemble
  this.root.appendChild(leftCol);
  this.root.appendChild(sideBar);

  if (this.container) this.container.appendChild(this.root);
}


  rand() { return this._prng ? this._prng() : Math.random(); }

  // fills and shuffles bag deterministically
_refillBag() {
  // Prefer explicit TETRO_TYPES array if available (keeps order consistent across clients)
  let types;
  if (Array.isArray(typeof TETRO_TYPES !== 'undefined' ? TETRO_TYPES : null)) {
    types = TETRO_TYPES.slice();
  } else if (typeof TETROMINOS_90_DEGREE !== 'undefined') {
    types = Object.keys(TETROMINOS_90_DEGREE);
  } else {
    types = Object.keys(TETROMINOS);
  }

  const bag = types.slice();
  // Fisher-Yates using seeded rand()
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(this.rand() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  this._bag = bag;
  this._bagIndex = 0;
}

_nextFromBag() {
  if (!this._bag || this._bagIndex >= this._bag.length) this._refillBag();
  return this._bag[this._bagIndex++];
}

  setName(n) { this.nameEl.textContent = n || ''; }

  destroy() {
    this.unbindKeys();
    try { if (this.effects && typeof this.effects.destroy === 'function') this.effects.destroy(); } catch (e) {}
    try { if (this.root.parentNode) this.root.parentNode.removeChild(this.root); } catch (e) {}
  }

  // Input handling (owns repeat timers, immediate first action + interval)
  bindKeys() {
    this._onKeyDown = (e) => {
      if (e && e.repeat) return;
      const k = (e.key || '').toLowerCase();
      const code = e.keyCode;

      const startRepeat = (id, action) => {
        if (this._repeatTimers[id]) return;
        action(); // immediate action (matches main game)
        this._repeatTimers[id] = setInterval(action, this._repeatInterval);
      };
      if (k === 'arrowleft' || code === 37) startRepeat('left', () => this.movePiece(-1));
      else if (k === 'arrowright' || code === 39) startRepeat('right', () => this.movePiece(1));
      else if (k === 'arrowdown' || code === 40) startRepeat('down', () => this.dropPiece(true));
      else if (code === 32 || k === ' ') this.hardDrop();
      else if (k === 'z') this.rotatePiece();
      else if (k === 'x') this.rotatePieceBackwards();
          else if (k === 'arrowup' || code === 38) this.rotatePiece(); // <-- added
     // else if (k === 'c') { if (!this.isGameOver) this.holdPiece(); }
      else if (k === 'p') { if (typeof togglePause === 'function') togglePause(); }
      else if (k === 'r') { if (typeof restartGame === 'function') restartGame(); }
    };

    this._onKeyUp = (e) => {
      const code = e.keyCode;
      const k = (e.key || '').toLowerCase();
      const stop = (id) => {
        const t = this._repeatTimers[id];
        if (!t) return;
        clearInterval(t);
        delete this._repeatTimers[id];
      };
      if (k === 'arrowleft' || code === 37) stop('left');
      if (k === 'arrowright' || code === 39) stop('right');
      if (k === 'arrowdown' || code === 40) stop('down');
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    this._listening = true;
  }

  unbindKeys() {
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) document.removeEventListener('keyup', this._onKeyUp);
    this._listening = false;
    Object.values(this._repeatTimers).forEach(t => clearInterval(t));
    this._repeatTimers = {};
  }

  // Rendering (grid lines, cells, ghost + current piece)
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // plate
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, this.width, this.height);

    // grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.cols; x++) {
      const px = x * this.cell + 0.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this.height); ctx.stroke();
    }
    for (let y = 0; y <= this.rows; y++) {
      const py = y * this.cell + 0.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.width, py); ctx.stroke();
    }

    // placed blocks
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const v = this.grid[r][c];
        if (v) this._drawCellAt(ctx, c, r, v);
      }
    }

    // ghost + current
    if (this.current) {
      const gy = this.computeGhostY(this.current);
      if (gy !== null) this._drawPiece(ctx, { ...this.current, y: gy }, true);
      this._drawPiece(ctx, this.current, false);
    }

    // HUD text
    if (this.levelEl) this.levelEl.textContent = 'Level: ' + this.level;
    if (this.linesEl) this.linesEl.textContent = 'Lines: ' + this.lines;
    this.drawNextPreview();
  }

  _drawCellAt(ctx, c, r, color) {
    const x = c * this.cell, y = r * this.cell;
    ctx.fillStyle = this._colorToRGBA(color);
    ctx.fillRect(x + 1, y + 1, this.cell - 2, this.cell - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, this.cell - 2, this.cell - 2);
  }

  _drawPiece(ctx, piece, ghost) {
    if (!piece) return;
    const shape = piece.shape;
    const color = piece.color;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = (piece.x + c) * this.cell, y = (piece.y + r) * this.cell;
        if (y < -this.cell) continue;
        if (ghost) {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(x + 1, y + 1, this.cell - 2, this.cell - 2);
        } else {
          ctx.fillStyle = this._colorToRGBA(color);
          ctx.fillRect(x + 1, y + 1, this.cell - 2, this.cell - 2);
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1, y + 1, this.cell - 2, this.cell - 2);
        }
      }
    }
  }

  drawNextPreview() {
    const ctx = this.nextCtx;
    const size = this.nextCanvas.width;
    ctx.clearRect(0, 0, size, size);
    if (!this.next) return;
    const shape = this.next.shape;
    const color = this.next.color;
    const cell = Math.floor(size / Math.max(shape.length, shape[0].length));
    const offsetX = Math.floor((size - (shape[0].length * cell)) / 2);
    const offsetY = Math.floor((size - (shape.length * cell)) / 2);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = offsetX + c * cell, y = offsetY + r * cell;
        ctx.fillStyle = this._colorToRGBA(color);
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }
  }

  // collisions & ghost (mirror main game)
  collidesAt(shape, px, py) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = px + c, y = py + r;
        if (x < 0 || x >= this.cols || y >= this.rows) return true;
        if (y >= 0 && this.grid[y][x]) return true;
      }
    }
    return false;
  }

  computeGhostY(piece) {
    if (!piece) return null;
    let gy = piece.y;
    while (!this.collidesAt(piece.shape, piece.x, gy + 1)) gy++;
    return gy;
  }

  // piece movement/rotation (mirror main game)
  movePiece(dx) {
    this.current.x += dx;
    if (this.collidesAt(this.current.shape, this.current.x, this.current.y)) {
      this.current.x -= dx;
    } else {
      if (typeof playMovePieceSfx === 'function') playMovePieceSfx();
      this.reportState();
    }
    this.render();
  }

// Clockwise rotation
rotateMatrixCW(m) {
    const res = [];
    for (let c = 0; c < m[0].length; c++) {
        const row = [];
        for (let r = m.length - 1; r >= 0; r--) row.push(m[r][c]);
        res.push(row);
    }
    return res;
}

// Counter-clockwise rotation
rotateMatrixCCW(m) {
    const res = [];
    for (let c = m[0].length - 1; c >= 0; c--) {
        const row = [];
        for (let r = 0; r < m.length; r++) row.push(m[r][c]);
        res.push(row);
    }
    return res;
}

// Try rotating with kicks
tryRotate(newShape) {
    const origShape = this.current.shape;
    const origX = this.current.x;
    const origY = this.current.y;

    const kicks = [
        [0, 0], [1, 0], [-1, 0], [0, -1],
        [1, -1], [-1, -1], [2, 0], [-2, 0]
    ];

    for (let i = 0; i < kicks.length; i++) {
        const [dx, dy] = kicks[i];
        this.current.shape = newShape;
        this.current.x = origX + dx;
        this.current.y = origY + dy;
        if (!this.collidesAt(this.current.shape, this.current.x, this.current.y)) {
            if (typeof playRotateSfx === 'function') playRotateSfx();
            this.reportState();
            return true;
        }
    }

    // Revert if all kicks fail
    this.current.shape = origShape;
    this.current.x = origX;
    this.current.y = origY;
    return false;
}

// Rotate clockwise
rotatePiece() {
    const newShape = this.rotateMatrixCW(cloneShape(this.current.shape));
    this.tryRotate(newShape);
    this.render();
}

// Rotate counter-clockwise
rotatePieceBackwards() {
    const newShape = this.rotateMatrixCCW(cloneShape(this.current.shape));
    this.tryRotate(newShape);
    this.render();
}


  drop(isUser = false) { this.dropPiece(isUser); }

  dropPiece(isUser = false) {
    this.current.y++;

    if (this.collidesAt(this.current.shape, this.current.x, this.current.y)) {
      // undo move
      this.current.y--;

      // increment lock counter (piece touching the stack)
      this.collisionLock++;

      if (this.collisionLock >= this.LOCK_LIMIT) {
        // reached threshold -> place piece
        this.collisionLock = 0;
        this.placePiece();

        const cleared = this.clearLines();
        if (cleared > 0) this.score += cleared * 100;
        this.updateStats();
        this.reportState();

        // If you spawn a new piece inside placePiece, you may want to
        // check immediate-collision spawn → game over. Example if you
        // have a spawnPiece() or onGameOver() handler:
        if (typeof this.spawnPiece === 'function') {
          this.spawnPiece();
          if (this.collidesAt(this.current.shape, this.current.x, this.current.y)) {
            // handle game-over; replace with your actual handler name if present
            if (typeof this.onGameOver === 'function') this.onGameOver();
          }
        }
      } else {
        // still within lock delay — don't place yet.
        // optional: play bump sfx for feedback:
        // if (isUser && typeof playBumpSfx === 'function') playBumpSfx();
        this.reportState();
      }
    } else {
      // no collision -> reset lock counter
      this.collisionLock = 0;
      if (isUser && typeof playMovePieceSfx === 'function') playMovePieceSfx();
      this.reportState();
    }

    this.render();
  }

  hardDrop() {
    while (!this.collidesAt(this.current.shape, this.current.x, this.current.y + 1)) this.current.y++;
    this.placePiece();
    if (typeof playHardDropSfx === 'function') playHardDropSfx();
    const cleared = this.clearLines();
    if (cleared > 0) this.score += cleared * 100;
    this.updateStats();
    this.reportState();
    this.render();
  }

  placePiece() {
    const shape = this.current.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = this.current.x + c, y = this.current.y + r;
        if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) this.grid[y][x] = this.current.color;
        else if (y < 0) { this.endGame(); return; }
      }
    }
    this.holdUsed = false;
    this.current = this.next || this._randTet();
    this.current.x = Math.floor((this.cols - this.current.shape[0].length) / 2);
    this.current.y = 0;
    this.next = this._randTet();
    if (this.collidesAt(this.current.shape, this.current.x, this.current.y)) { this.endGame(); return; }
    this.reportState();
  }

  holdPiece() {
    if (this.holdUsed) return;
    const snapshot = { shape: cloneShape(this.current.shape), color: this.current.color, type: this.current.type };
    if (!this.hold) {
      this.hold = snapshot;
      this.current = this.next || this._randTet();
      this.current.x = Math.floor((this.cols - this.current.shape[0].length) / 2);
      this.current.y = 0;
      this.next = this._randTet();
    } else {
      const tmp = this.hold;
      this.hold = snapshot;
      this.current = { shape: cloneShape(tmp.shape), color: tmp.color, type: tmp.type, x: Math.floor((this.cols - tmp.shape[0].length) / 2), y: 0 };
    }
    this.holdUsed = true;
    if (typeof playHoldSfx === 'function') playHoldSfx();
    if (window.__tetrisHUD && typeof window.__tetrisHUD.drawHold === 'function') window.__tetrisHUD.drawHold(this.hold);
    if (window.__tetrisHUD && typeof window.__tetrisHUD.drawNext === 'function') window.__tetrisHUD.drawNext(this.next);
    this.reportState();
    this.render();
  }

  // clear lines and visual effects (mirror game.js)
  clearLines() {
    const clearedRows = [];
    for (let y = this.rows - 1; y >= 0; y--) {
      if (this.grid[y].every(v => v !== 0)) {
        clearedRows.push(y);
        this.grid.splice(y, 1);
        this.grid.unshift(new Array(this.cols).fill(0));
        y++;
      }
    }
    const count = clearedRows.length;
    if (count > 0) {
      // use seeded rand here
      if (this.rand() < 0.1) {
        if (typeof playDrippyShoes === 'function') {
          for (let i = 0; i < Math.min(4, count); i++) playDrippyShoes();
        }
      }
      if (count === 1 && typeof playOneLineClearSfx === 'function') playOneLineClearSfx();
      if (count === 2 && typeof playTwoLineClearSfx === 'function') playTwoLineClearSfx();
      if (count === 3 && typeof playThreeLineClearSfx === 'function') playThreeLineClearSfx();
      if (count === 4 && typeof playFourLineClearSfx === 'function') playFourLineClearSfx();

      this.lines += count;
      this.linesClearedThisLevel += count;
      this.score += count * 100;

      if (this.linesClearedThisLevel >= this.linesNeededForLevelUp) {
        this.level++;
        this.linesClearedThisLevel = 0;
        this.updateSpeed();
      }

      if (window.__tetrisHUD && typeof window.__tetrisHUD.floating === 'function') window.__tetrisHUD.floating('+' + (count * 100));
      this.updateStats();

      // trigger per-canvas effects (rows are already collected in clearedRows)
      try {
        if (this.effects && typeof this.effects.triggerClear === 'function' && clearedRows && clearedRows.length) {
          const rowsAsc = clearedRows.slice().sort((a,b) => a - b);
          this.effects.triggerClear(rowsAsc, count);
        }
      } catch (e) { console.warn('effects trigger failed', e); }
    }
    return count;
  }

  updateSpeed() {
    const baseInterval = 1000;        // ms at level 0
    const percentPerLevel = 1;        // 1 per level (same as your game)
    const minInterval = 10;           // minimum fall speed
    const cappedLevel = Math.min(this.level, 20);

    const multiplier = 1 + cappedLevel * percentPerLevel;
    this.fallSpeed = Math.max(minInterval, Math.round(baseInterval / multiplier));
    if (typeof this.onSpeedChange === 'function') this.onSpeedChange(this.fallSpeed);
  }

  updateStats() {
    if (window.__tetrisHUD && typeof window.__tetrisHUD.updateStats === 'function') {
      window.__tetrisHUD.updateStats({ lines: this.lines, level: this.level, score: this.score });
    }
    if (this.levelEl) this.levelEl.textContent = 'Level: ' + this.level;
    if (this.linesEl) this.linesEl.textContent = 'Lines: ' + this.lines;
  }

  endGame() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    // per-canvas game over effect
    try { if (this.effects && typeof this.effects.triggerGameOver === 'function') this.effects.triggerGameOver(this.score); } catch (e) {}
    this.reportState();
    if (typeof this.onGameOver === 'function') this.onGameOver({ lines: this.lines, score: this.score });
  }

  getStateSnapshot() {
    return {
      current: snapshotPiece(this.current),
      next: snapshotPiece(this.next),
      hold: this.hold ? { shape: this.hold.shape, color: this.hold.color, type: this.hold.type } : null,
      grid: this.grid.map(row => row.map(cell => cell ? cell : 0)),
      lines: this.lines,
      score: this.score,
      level: this.level,
      isGameOver: !!this.isGameOver,
      lastActiveAt: now(),
      seed: this.seed // include seed for debugging/inspection
    };
  }

  reportState() {
    this.lastUpdateAt = now();
    if (typeof this.onStateUpdate === 'function') this.onStateUpdate(this.getStateSnapshot());
  }

  // helpers & reset
  reset() {
    this.grid = Array.from({ length: this.rows }, () => new Array(this.cols).fill(0));
    this.current = this._randTet();
    this.current.x = Math.floor((this.cols - this.current.shape[0].length) / 2);
    this.current.y = 0;
    this.next = this._randTet();
    this.hold = null;
    this.holdUsed = false;
    this.isGameOver = false;
    this.lines = 0;
    this.score = 0;
    this.level = 1;
    this.linesClearedThisLevel = 0;
    this.updateSpeed();
    this.render();
    this.reportState();
  }

_randTet() {
  // keep the same canonical types order used in _refillBag
  let canonicalTypes;
  if (Array.isArray(typeof TETRO_TYPES !== 'undefined' ? TETRO_TYPES : null)) canonicalTypes = TETRO_TYPES;
  else if (typeof TETROMINOS_90_DEGREE !== 'undefined') canonicalTypes = Object.keys(TETROMINOS_90_DEGREE);
  else canonicalTypes = Object.keys(TETROMINOS);

  const t = this._nextFromBag();
  // find rotations mapping for this tetromino key
  const rots = (typeof TETROMINOS_90_DEGREE !== 'undefined' && TETROMINOS_90_DEGREE[t]) ? TETROMINOS_90_DEGREE[t] : TETROMINOS[t];
  const rot = 0;
  const shape = rots[rot].map(row => row.slice());

  // color resolution: prefer COLORS/TETRO_COLORS with TETRO_TYPES order, but fallback gracefully
  let color = '#ffffff';
  const idx = canonicalTypes.indexOf(t);
  if (typeof COLORS !== 'undefined' && Array.isArray(COLORS)) {
    color = COLORS[idx] || color;
  } else if (typeof TETRO_COLORS !== 'undefined' && Array.isArray(TETRO_COLORS)) {
    // if TETRO_TYPES exists, use that mapping; else fallback to idx
    if (Array.isArray(typeof TETRO_TYPES !== 'undefined' ? TETRO_TYPES : null)) {
      const colorIndex = TETRO_TYPES.indexOf(t);
      color = TETRO_COLORS[colorIndex] || color;
    } else {
      color = TETRO_COLORS[idx] || color;
    }
  }

  return { type: t, rotationIndex: rot, shape, color, x: 3, y: 0 };
}

  _colorToRGBA(col) {
    if (!col) return 'rgba(255,255,255,0.95)';
    if (typeof col === 'string') return col;
    try {
      if (typeof colorToRGBA === 'function') return colorToRGBA(col);
      if (col.toRGBA) return col.toRGBA();
      if (col.r !== undefined && col.g !== undefined && col.b !== undefined) {
        const a = col.a !== undefined ? col.a : 1;
        return `rgba(${col.r},${col.g},${col.b},${a})`;
      }
    } catch (e) {}
    return '#fff';
  }
}


// -------------------------
// SFX helpers (place before DuelCanvasGame)
// -------------------------
const __DUEL_SFX = {
  // base Audio objects (used for cloning when simultaneous playback is wanted)
  base: {
    drippy: new Audio("https://codehs.com/uploads/b4c98f373b2ff8b18559607a22797050"),
    move:   new Audio("https://codehs.com/uploads/9719a2ca8db05076dcbfbf418bf53294"),
    hard:   new Audio("https://codehs.com/uploads/0e80cd439832c2f7035e7b25f70c04f3"),
    death:  new Audio("https://codehs.com/uploads/eb23c4aab950e9e55b24a4a9f49d915b"),
    one:    new Audio("https://codehs.com/uploads/359a7cac0155bce37dc1e3ebeb4593f8"),
    two:    new Audio("https://codehs.com/uploads/679684299960679023a3cc7a1693fe32"),
    three:  new Audio("https://codehs.com/uploads/5cdf041be591135cba385d3dce72f86b"),
    four:   new Audio("https://codehs.com/uploads/be96b0a77254f21878d41f381cb28adb")
  }
};

// configure base objects (preload/volume)
Object.values(__DUEL_SFX.base).forEach(a => {
  try { a.preload = "auto"; } catch(e) {}
  try { a.volume = 0.6; } catch(e) {}
  // Keep them unloaded by browser policy until first user gesture; this only marks preferences
});

// small helper to play (clones node so quick repeats won't cut off)
function _playFromBase(name, vol) {
  try {
    const base = __DUEL_SFX.base[name];
    if (!base) return;
    // clone to allow overlapping plays
    const inst = base.cloneNode();
    if (vol !== undefined) inst.volume = vol;
    inst.play().catch(() => {/* play may be blocked until user gesture */});
  } catch (e) { /* ignore */ }
}

// exported SFX functions (matching names used in DuelCanvasGame)
function playDrippyShoes() { _playFromBase('drippy', 0.6); }
function playMovePieceSfx()  { _playFromBase('move', 0.6); }
function playHardDropSfx()   { _playFromBase('hard', 0.6); }
function playDeathSfx()      { _playFromBase('death', 0.6); }
function playOneLineClearSfx(){ _playFromBase('one', 0.6); }
function playTwoLineClearSfx(){ _playFromBase('two', 0.6); }
function playThreeLineClearSfx(){ _playFromBase('three', 0.6); }
function playFourLineClearSfx(){ _playFromBase('four', 0.6); }

// Small reasonable defaults for rotate/hold sounds (you didn't provide URLs for these).
// Reuse the 'move' sfx but with slightly lower volume so they're distinct.
function playRotateSfx() { _playFromBase('move', 0.45); }
function playHoldSfx()   { _playFromBase('move', 0.45); }

// -------------------------
// If you already have DuelCanvasGame in scope, update the class as follows:
//  - Ensure the sfx functions above are defined before the class is evaluated
//  - I added a call to playDeathSfx() inside endGame()
//  - clearLines inside your DuelCanvasGame already contained the drippy logic; left as-is
// -------------------------

// (Below: only the small edit to endGame; if you want a full class paste, use your original with this snippet)
DuelCanvasGame.prototype._endGame_withSfx = DuelCanvasGame.prototype.endGame;
DuelCanvasGame.prototype.endGame = function() {
  // call sfx (do this before the original endGame logic so HUD/effects still run)
  try { playDeathSfx(); } catch(e) {}
  // then run original behavior
  if (typeof this._endGame_withSfx === 'function') {
    this._endGame_withSfx();
  } else {
    // fallback: perform original inline end behavior if method was not present
    if (this.isGameOver) return;
    this.isGameOver = true;
    try { if (this.effects && typeof this.effects.triggerGameOver === 'function') this.effects.triggerGameOver(this.score); } catch (e) {}
    this.reportState();
    if (typeof this.onGameOver === 'function') this.onGameOver({ lines: this.lines, score: this.score });
  }
};


// ----------------- end DuelCanvasGame replacement -----------------


// helpers in scope (keep these)
function rotateMatrixGeneric(m, clockwise = true) {
  const H = m.length, W = m[0].length;
  const res = Array.from({ length: W }, () => new Array(H));
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (clockwise) res[c][H - 1 - r] = m[r][c];
      else res[W - 1 - c][r] = m[r][c];
    }
  }
  return res;
}
function cloneShape(shape) { return shape.map(r => r.slice()); }
function snapshotPiece(p) { if (!p) return null; return { shape: cloneShape(p.shape), color: p.color, x: p.x, y: p.y, type: p.type || null }; }



function showTetrisDueler(targetContainer, playerName, snapshot) {
  if (!targetContainer) return;

  // Scale factor (2x)
  const SCALE = 1.6;
  const scaledCell = PREVIEW_CELL * SCALE;
  const scaledW = PREVIEW_W * SCALE;
  const scaledH = PREVIEW_H * SCALE;
  const scaledN = Math.max(scaledCell * 4, 64 * SCALE);

  // ensure the container uses a horizontal layout so canvas and next-preview appear side-by-side
  targetContainer.style.display = 'flex';
  targetContainer.style.flexDirection = 'row';
  targetContainer.style.alignItems = 'flex-start';
  targetContainer.style.gap = (8 * SCALE) + 'px';

  // main canvas (grid preview)
  let mainCanvas = targetContainer.querySelector('.dueler-main-canvas');
  let nameEl = targetContainer.querySelector('.dueler-name');
  // right-side next preview canvas
  let nextCanvas = targetContainer.querySelector('.dueler-next-canvas');

  if (!mainCanvas) {
    mainCanvas = document.createElement('canvas');
    mainCanvas.className = 'dueler-main-canvas';
    // pixel backing doubled
    mainCanvas.width = scaledW;
    mainCanvas.height = scaledH;
    // CSS size doubled
    mainCanvas.style.width = scaledW + 'px';
    mainCanvas.style.height = scaledH + 'px';
    // match DuelCanvasGame plate style
    mainCanvas.style.background = 'rgba(0,0,0,0.45)';
    mainCanvas.style.borderRadius = (6 * SCALE) + 'px';
    mainCanvas.style.border = '1px solid rgba(255,255,255,0.03)';
    mainCanvas.style.display = 'block';
    mainCanvas.style.marginTop = (-30 * SCALE) + 'px';
    targetContainer.appendChild(mainCanvas);
  } else {
    // ensure existing canvas has doubled backing and CSS size (in case previously created)
    mainCanvas.width = scaledW;
    mainCanvas.height = scaledH;
    mainCanvas.style.width = scaledW + 'px';
    mainCanvas.style.height = scaledH + 'px';
  }

  // --- create or find a right-side "stack" that contains nextCanvas + name ---
  let sideStack = targetContainer.querySelector('.dueler-side-stack');

  if (!sideStack) {
    sideStack = document.createElement('div');
    sideStack.className = 'dueler-side-stack';
    // stack vertically and center items
    sideStack.style.display = 'flex';
    sideStack.style.flexDirection = 'column';
    sideStack.style.alignItems = 'center';
    sideStack.style.gap = (6 * SCALE) + 'px';
    // preserve your existing vertical offset if you need it
    sideStack.style.marginTop = (-30 * SCALE) + 'px';
    targetContainer.appendChild(sideStack);
  }

  // main canvas still appended directly to targetContainer (left)
  if (!mainCanvas.parentElement) targetContainer.insertBefore(mainCanvas, sideStack);

  // nextCanvas: ensure it's inside the side stack
  if (!nextCanvas) {
    nextCanvas = document.createElement('canvas');
    nextCanvas.className = 'dueler-next-canvas';
    nextCanvas.width = scaledN;
    nextCanvas.height = scaledN;
    nextCanvas.style.width = scaledN + 'px';
    nextCanvas.style.height = scaledN + 'px';
    nextCanvas.style.background = 'transparent';
    nextCanvas.style.borderRadius = (6 * SCALE) + 'px';
    nextCanvas.style.border = '1px solid rgba(255,255,255,0.04)';
    nextCanvas.style.display = 'block';
    // remove its individual marginTop — sideStack controls vertical placement
    nextCanvas.style.margin = '0';
    sideStack.appendChild(nextCanvas);
  } else {
    // ensure existing next canvas uses scaled sizes
    nextCanvas.width = scaledN;
    nextCanvas.height = scaledN;
    nextCanvas.style.width = scaledN + 'px';
    nextCanvas.style.height = scaledN + 'px';
    if (nextCanvas.parentElement !== sideStack) sideStack.appendChild(nextCanvas);
  }

  // nameEl: make sure it lives under the next canvas inside the same stack
  if (!nameEl) {
    nameEl = document.createElement('div');
    nameEl.className = 'dueler-name';
    nameEl.style.fontSize = (12 * SCALE) + 'px';    // doubled font size
    nameEl.style.fontWeight = '700';
    nameEl.style.color = '#fff';
    nameEl.style.textAlign = 'center';
    nameEl.style.width = nextCanvas ? nextCanvas.style.width : (64 * SCALE) + 'px';
    nameEl.style.marginTop = (4 * SCALE) + 'px';
    sideStack.appendChild(nameEl);
  } else {
    // ensure styling updated
    nameEl.style.fontSize = (12 * SCALE) + 'px';
    nameEl.style.width = nextCanvas ? nextCanvas.style.width : (64 * SCALE) + 'px';
    if (nameEl.parentElement !== sideStack) sideStack.appendChild(nameEl);
  }

  nameEl.textContent = playerName || '';

  // ---------------- Render (match DuelCanvasGame visuals) ----------------
  const ctx = mainCanvas.getContext('2d');
  ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);

  // If no snapshot, clear next and stop
  if (!snapshot || !snapshot.grid) {
    const nctx = nextCanvas.getContext('2d');
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    return;
  }

  const grid = snapshot.grid;

  // draw plate (background) — note: use full pixel backing
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);

  // subtle grid lines across the whole plate (like DuelCanvasGame)
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= PREVIEW_COLS; x++) {
    const px = x * scaledCell + 0.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, mainCanvas.height); ctx.stroke();
  }
  for (let y = 0; y <= PREVIEW_ROWS; y++) {
    const py = y * scaledCell + 0.5;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(mainCanvas.width, py); ctx.stroke();
  }

  // helper to draw a single placed cell (matches _drawCellAt)
  function _drawCellAt(cctx, c, r, color) {
    const x = c * scaledCell, y = r * scaledCell;
    cctx.fillStyle = (typeof color === 'string') ? color : (color && color.toRGBA ? color.toRGBA() : '#fff');
    cctx.fillRect(x + (1 * SCALE), y + (1 * SCALE), scaledCell - (2 * SCALE), scaledCell - (2 * SCALE));
    cctx.strokeStyle = 'rgba(0,0,0,0.25)';
    cctx.lineWidth = 1;
    cctx.strokeRect(x + (1 * SCALE), y + (1 * SCALE), scaledCell - (2 * SCALE), scaledCell - (2 * SCALE));
  }

  // draw placed blocks from snapshot.grid
  for (let r = 0; r < PREVIEW_ROWS; r++) {
    for (let c = 0; c < PREVIEW_COLS; c++) {
      const v = grid[r][c];
      if (v) _drawCellAt(ctx, c, r, v);
    }
  }

  // compute ghost Y (mirror your inline function but reuse snapshot)
  function computeGhostY(piece) {
    if (!piece) return null;
    const shape = piece.shape;
    let y = piece.y || 0;
    function collides(shape, px, py) {
      for (let rr = 0; rr < shape.length; rr++) {
        for (let cc = 0; cc < shape[rr].length; cc++) {
          if (!shape[rr][cc]) continue;
          const x = px + cc;
          const yy = py + rr;
          if (x < 0 || x >= PREVIEW_COLS || yy >= PREVIEW_ROWS) return true;
          if (yy >= 0 && grid[yy] && grid[yy][x]) return true;
        }
      }
      return false;
    }
    while (!collides(shape, piece.x, y + 1)) y++;
    return y;
  }

  // helper to draw a piece (ghost toggle)
  function _drawPiece(cctx, piece, ghost) {
    if (!piece) return;
    const shape = piece.shape;
    const color = piece.color || '#fff';
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = (piece.x + c) * scaledCell;
        const y = (piece.y + r) * scaledCell;
        if (y < -scaledCell) continue;
        if (ghost) {
          cctx.fillStyle = 'rgba(255,255,255,0.06)';
          cctx.fillRect(x + (1 * SCALE), y + (1 * SCALE), scaledCell - (2 * SCALE), scaledCell - (2 * SCALE));
        } else {
          cctx.fillStyle = (typeof color === 'string') ? color : (color && color.toRGBA ? color.toRGBA() : '#fff');
          cctx.fillRect(x + (1 * SCALE), y + (1 * SCALE), scaledCell - (2 * SCALE), scaledCell - (2 * SCALE));
          cctx.strokeStyle = 'rgba(0,0,0,0.25)';
          cctx.lineWidth = 1;
          cctx.strokeRect(x + (1 * SCALE), y + (1 * SCALE), scaledCell - (2 * SCALE), scaledCell - (2 * SCALE));
        }
      }
    }
  }

  // ghost + current (if present in snapshot)
  if (snapshot.current) {
    const gy = computeGhostY(snapshot.current);
    if (gy !== null) _drawPiece(ctx, { ...snapshot.current, y: gy }, true);
    _drawPiece(ctx, snapshot.current, false);
  }

  // draw the NEXT piece (if available) into the nextCanvas (match drawNextPreview)
  const nctx = nextCanvas.getContext('2d');
  const size = nextCanvas.width;
  nctx.clearRect(0, 0, size, size);
  if (snapshot.next) {
    const shape = snapshot.next.shape;
    const color = snapshot.next.color || '#fff';
    const cell = Math.floor(size / Math.max(shape.length, (shape[0] && shape[0].length) || 1));
    const offsetX = Math.floor((size - (shape[0].length * cell)) / 2);
    const offsetY = Math.floor((size - (shape.length * cell)) / 2);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < (shape[r].length || 0); c++) {
        if (!shape[r][c]) continue;
        const x = offsetX + c * cell, y = offsetY + r * cell;
        nctx.fillStyle = (typeof color === 'string') ? color : (color && color.toRGBA ? color.toRGBA() : '#fff');
        nctx.fillRect(x + (1 * SCALE), y + (1 * SCALE), cell - (2 * SCALE), cell - (2 * SCALE));
        nctx.strokeStyle = 'rgba(255,255,255,0.08)';
        nctx.strokeRect(x + (1 * SCALE), y + (1 * SCALE), cell - (2 * SCALE), cell - (2 * SCALE));
      }
    }
  }
}


  
  
  
  
  
/* ===== Spectator + Per-Game Viewer (paste inside your top-level IIFE) ===== */
(function () {
  if (document.documentElement._mp_spectator_added_v2) return;
  document.documentElement._mp_spectator_added_v2 = true;

  // helper: safe query for mp-window injection without exposing globals
  /**
   * Injects a "Spectate" button into a target window element.
   * Returns the created button or null if injection did not occur.
   */
  const tryInjectSpectateBtn = (windowEl) => {
    if (!windowEl) return null;

    // prevent double-injection
    if (windowEl.__mpSpectateInjected) {
      return windowEl.querySelector('#mp-spectate-btn') || null;
    }

    try {
      // find a sensible container to append into
      const row =
        windowEl.querySelector('div[style*="display:flex;gap:8px;"]') ||
        windowEl.querySelector('#mp-window-body') ||
        windowEl;

      if (!row) return null;
      if (row.querySelector && row.querySelector('#mp-spectate-btn')) {
        windowEl.__mpSpectateInjected = true;
        return row.querySelector('#mp-spectate-btn');
      }

      // create button
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'mp-spectate-btn';
      btn.classList.add('mp-btn', 'mp-spectate-btn');
      btn.textContent = 'Spectate';
      btn.setAttribute('aria-label', 'Open spectate overlay');

      // inline styles kept minimal so it's self-contained; you can move these to CSS
      Object.assign(btn.style, {
        padding: '8px 10px',
        borderRadius: '8px',
        cursor: 'pointer',
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.06)',
        fontSize: '13px',
        lineHeight: '1',
        marginLeft: '6px',
        color: 'inherit',
      });

      // click handling: stop propagation, dismiss dropdown if present, then open overlay
      const onClick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          // defensive optional chaining in case currentDropdown doesn't exist
          if (typeof currentDropdown?.dismiss === 'function') currentDropdown.dismiss();
        } catch (err) {
          // swallow dismissal errors silently
        }

        // call global overlay opener if available
        if (typeof openSpectatorOverlay === 'function') {
          openSpectatorOverlay();
        } else {
          console.warn('openSpectatorOverlay is not defined');
        }
      };

      btn.addEventListener('click', onClick, { passive: false });

      // place the button next to joinDuel if present, otherwise append to the row
      const joinDuel = windowEl.querySelector('#mp-join-duel');
      if (joinDuel?.parentNode) joinDuel.parentNode.appendChild(btn);
      else row.appendChild(btn);

      // mark as injected to avoid duplicates
      windowEl.__mpSpectateInjected = true;

      // return the created button so caller can manipulate it if desired
      return btn;
    } catch (e) {
      // keep this lightweight — log the error for debugging
      console.warn('spectate inject error', e);
      return null;
    }
  };


  // watch for mp-window creation
  const mo = new MutationObserver((changes) => {
    for (const ch of changes) {
      for (const n of ch.addedNodes) {
        try {
          if (!(n instanceof HTMLElement)) continue;
          const win = n.classList && (n.classList.contains('mp-window') ? n : (n.querySelector && n.querySelector('.mp-window')));
          if (win) tryInjectSpectateBtn(win);
        } catch (e) {}
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // immediate try
  (function tryNow() { const ex = document.querySelector('.mp-window'); if (ex) tryInjectSpectateBtn(ex); })();

  // Local closures to keep state private
  let specOverlay = null; // spectate grid overlay (object will include .currentViewing)
  let specRefs = { activeRef: null, tourRef: null, activeHandler: null, tourHandler: null };
  let viewer = { root: null, ref: null, handler: null, hiddenParentVisible: null };

  // open spectate grid
  function openSpectatorOverlay() {
    if (specOverlay) return;

    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
      zIndex: 2147483647, background: 'rgba(6,8,12,0.95)', color: '#fff',
      display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px', boxSizing: 'border-box',
      overflow: 'auto'
    });

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' });

    const title = document.createElement('div');
    title.textContent = 'Spectate — Live Games';
    Object.assign(title.style, { fontWeight: '900', fontSize: '16px' });

    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', gap: '8px' });

    const refresh = document.createElement('button');
    refresh.textContent = 'Refresh';
    Object.assign(refresh.style, { padding: '6px 10px', cursor: 'pointer' });
    refresh.addEventListener('click', fetchAndRenderOnce);

    const close = document.createElement('button');
    close.textContent = 'Close';
    Object.assign(close.style, { padding: '6px 10px', cursor: 'pointer' });
    close.addEventListener('click', closeSpectatorOverlay);

    actions.appendChild(refresh);
    actions.appendChild(close);
    header.appendChild(title);
    header.appendChild(actions);

    const info = document.createElement('div');
    Object.assign(info.style, { opacity: '0.9', fontSize: '12px' });
    info.textContent = 'Click any tile to enter that game. Back from the viewer returns you here. Eliminated tournament players are hidden.';

    const gridWrap = document.createElement('div');
    Object.assign(gridWrap.style, { display: 'grid', gap: '8px', alignContent: 'start', gridAutoRows: 'min-content', justifyContent: 'center' });

    root.appendChild(header);
    root.appendChild(info);
    root.appendChild(gridWrap);
    document.body.appendChild(root);

    // store currentViewing flag so renderCombined won't wipe per-game detail views
    specOverlay = { root, gridWrap, currentViewing: null };

    // attach firebase listeners
    try {
      const db = getDB();
      specRefs.activeRef = db.ref(ACTIVE_DUELS_PATH);
      specRefs.tourRef = db.ref(TOURNAMENTS_PATH);

      specRefs.activeHandler = specRefs.activeRef.on('value', snap => {
        const active = snap.val() || {};
        try { specRefs.tourRef.once('value').then(ts => renderCombined(active, ts.val() || {})).catch(() => renderCombined(active, {})); } catch(e) { renderCombined(active, {}); }
      });
      specRefs.tourHandler = specRefs.tourRef.on('value', snap => {
        const tours = snap.val() || {};
        try { specRefs.activeRef.once('value').then(as => renderCombined(as.val() || {}, tours)).catch(() => renderCombined({}, tours)); } catch(e) { renderCombined({}, tours); }
      });
    } catch (e) { console.warn('spectator attach failed', e); }

    fetchAndRenderOnce();
    window.addEventListener('resize', onSpecResize);
  }

  function closeSpectatorOverlay() {
    if (!specOverlay) return;
    try { if (specRefs.activeRef && specRefs.activeHandler) specRefs.activeRef.off('value', specRefs.activeHandler); } catch (e) {}
    try { if (specRefs.tourRef && specRefs.tourHandler) specRefs.tourRef.off('value', specRefs.tourHandler); } catch (e) {}
    try { window.removeEventListener('resize', onSpecResize); } catch (e) {}
    try { specOverlay.root.parentNode.removeChild(specOverlay.root); } catch (e) {}
    specOverlay = null;
    specRefs = { activeRef: null, tourRef: null, activeHandler: null, tourHandler: null };
    // ensure viewer also closed
    closeGameViewer();
  }
  
  const STALE_MS = 10000; // 10s
  const _staleTrack = {
    sig: {},   // map key -> last signature string
    last: {}   // map key -> timestamp millis of last change
  };
  // helper that builds a stable signature for players object (so ordering doesn't matter)
  function makePlayersSignature(playersObj) {
    if (!playersObj) return '';
    const parts = [];
    for (const pk in playersObj) {
      const p = playersObj[pk] || {};
      // prefer state for signature if present
      const payload = (p.state !== undefined) ? p.state : p;
      let s;
      try { s = JSON.stringify(payload); } catch (e) { s = String(payload); }
      parts.push(pk + ':' + s);
    }
    parts.sort(); // deterministic ordering
    return parts.join('|');
  }

  function onSpecResize() { fetchAndRenderOnce(); }

  async function fetchAndRenderOnce() {
    try {
      const db = getDB();
      const [aSnap, tSnap] = await Promise.all([ db.ref(ACTIVE_DUELS_PATH).once('value'), db.ref(TOURNAMENTS_PATH).once('value') ]);
      renderCombined(aSnap.val() || {}, tSnap.val() || {});
    } catch (e) { console.warn('spectator fetch failed', e); }
  }
  
  async function fetchAndShowGamePlayers(kind, id) {
    if (!specOverlay) return;
    // mark that we're showing a per-game detail so renderCombined won't clobber it
    specOverlay.currentViewing = { kind, id };
    const gridWrap = specOverlay.gridWrap;
    gridWrap.innerHTML = '';

    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.gap = '12px';
    headerRow.style.marginBottom = '8px';

    const title = document.createElement('div');
    title.textContent = (kind === 'duel' ? 'Duel' : 'Tournament') + ' — ' + id;
    title.style.fontWeight = '900';
    title.style.fontSize = '15px';

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Back to Games';
    backBtn.style.padding = '6px 10px';
    backBtn.style.cursor = 'pointer';
    backBtn.addEventListener('click', () => {
      // clear currentViewing then re-render using last snapshots if available (faster), otherwise fetch fresh
      if (specOverlay) specOverlay.currentViewing = null;
      if (__lastActiveSnap || __lastTourSnap) renderCombined(__lastActiveSnap, __lastTourSnap);
      else fetchAndRenderOnce();
    });

    headerRow.appendChild(title);
    headerRow.appendChild(backBtn);
    gridWrap.appendChild(headerRow);

    const info = document.createElement('div');
    info.textContent = 'Players in this game (eliminated tournament players are hidden).';
    info.style.opacity = '0.9';
    info.style.marginBottom = '8px';
    gridWrap.appendChild(info);

    // fetch players from DB live once
    try {
      const db = getDB();
      let refPath = '';
      if (kind === 'duel') refPath = `${ACTIVE_DUELS_PATH}/${id}/players`;
      else refPath = `${TOURNAMENTS_PATH}/${id}/players`;

      const snap = await db.ref(refPath).once('value');
      const playersObj = snap.val() || {};

      // build list of players (filter elim for tournaments)
      const players = [];
      for (const k in playersObj) {
        const p = playersObj[k] || {};
        if (kind === 'tournament' && p.alive === false) continue;
        players.push({ username: p.username, alive: p.alive !== false, state: p.state || null });
      }

      if (players.length === 0) {
        const note = document.createElement('div');
        note.textContent = 'No (visible) players in this game.';
        note.style.opacity = '0.9';
        note.style.padding = '12px';
        gridWrap.appendChild(note);
      } else {
        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '8px';

        players.forEach(p => {
          const row = document.createElement('div');
          Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.02)' });

          const left = document.createElement('div');
          left.style.display = 'flex';
          left.style.flexDirection = 'column';
          left.style.gap = '2px';
          const name = document.createElement('div');
          name.textContent = p.username || '(anon)';
          name.style.fontWeight = '800';
          const meta = document.createElement('div');
          meta.style.fontSize = '12px';
          meta.style.opacity = '0.85';
          // show small snapshot info if present
          const lines = (p.state && p.state.lines) ? `Lines: ${p.state.lines}` : '';
          const score = (p.state && p.state.score) ? `Score: ${p.state.score}` : '';
          meta.textContent = [lines, score].filter(Boolean).join(' • ');
          left.appendChild(name);
          left.appendChild(meta);

          const right = document.createElement('div');
          right.style.display = 'flex';
          right.style.gap = '8px';
          right.style.alignItems = 'center';

          const aliveDot = document.createElement('div');
          aliveDot.style.width = '10px';
          aliveDot.style.height = '10px';
          aliveDot.style.borderRadius = '50%';
          aliveDot.style.background = p.alive ? '#2ecc71' : '#9a9a9a';
          aliveDot.title = p.alive ? 'Alive' : 'Eliminated';

          right.appendChild(aliveDot);

          row.appendChild(left);
          row.appendChild(right);
          list.appendChild(row);
        });

        gridWrap.appendChild(list);
      }

      // controls at bottom: Enter Game Viewer, Back to Games
      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.justifyContent = 'flex-end';
      controls.style.gap = '8px';
      controls.style.marginTop = '12px';

      const enterBtn = document.createElement('button');
      enterBtn.textContent = 'Enter Game Viewer';
      enterBtn.style.padding = '8px 12px';
      enterBtn.style.cursor = 'pointer';
      enterBtn.addEventListener('click', () => {
        // when opening full viewer, clear the per-game detail flag
        if (specOverlay) specOverlay.currentViewing = null;
        openGameViewer(kind, id);
      });

      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh Players';
      refreshBtn.style.padding = '8px 12px';
      refreshBtn.style.cursor = 'pointer';
      refreshBtn.addEventListener('click', () => fetchAndShowGamePlayers(kind, id));

      controls.appendChild(refreshBtn);
      controls.appendChild(enterBtn);
      gridWrap.appendChild(controls);

    } catch (e) {
      console.warn('fetch players failed', e);
      const err = document.createElement('div');
      err.textContent = 'Failed to load players for this game.';
      err.style.padding = '12px';
      gridWrap.appendChild(err);
      // still show Back to Games
      const backOnly = document.createElement('div');
      backOnly.style.marginTop = '12px';
      const backBtnOnly = document.createElement('button');
      backBtnOnly.textContent = 'Back to Games';
      backBtnOnly.style.padding = '6px 10px';
      backBtnOnly.addEventListener('click', () => { if (specOverlay) specOverlay.currentViewing = null; if (__lastActiveSnap || __lastTourSnap) renderCombined(__lastActiveSnap, __lastTourSnap); else fetchAndRenderOnce(); });
      backOnly.appendChild(backBtnOnly);
      gridWrap.appendChild(backOnly);
    }
  }

  // Build tiles & render; tiles are clickable to open per-game viewer
  let __lastActiveSnap = null;
  let __lastTourSnap = null;

  async function renderCombined(activeDuels, tournaments) {
    // keep last snapshots so Back/refresh can reuse them
    __lastActiveSnap = activeDuels || {};
    __lastTourSnap = tournaments || {};

    // if specOverlay is showing a per-game detail view, don't overwrite it
    if (specOverlay && specOverlay.currentViewing) {
      // keep snapshots updated (done above) but skip DOM rebuild so user's "View" stays open
      return;
    }

    if (!specOverlay) return;
    const gridWrap = specOverlay.gridWrap;
    gridWrap.innerHTML = '';

    // Build games list (one entry per duel/tournament)
    const games = [];

    // Active duels
    for (const duelId in (activeDuels || {})) {
      const d = activeDuels[duelId];
      if (!d || !d.players) continue;

      // stale-check: compute players signature
      const duelKey = `duel|${duelId}`;
      const duelSig = makePlayersSignature(d.players);
      const now = Date.now();
      if (_staleTrack.sig[duelKey] !== duelSig) {
        _staleTrack.sig[duelKey] = duelSig;
        _staleTrack.last[duelKey] = now;
      } else {
        // unchanged since last time, check stale timeout
        if ((now - (_staleTrack.last[duelKey] || 0)) >= STALE_MS) {
          // attempt to remove stale duel from DB
          try {
            const db = getDB();
            db.ref(`${ACTIVE_DUELS_PATH}/${duelId}`).remove().then(() => {
              console.log(`[spectator] removed stale duel ${duelId}`);
            }).catch((err) => {
              console.warn(`[spectator] failed to remove stale duel ${duelId}`, err);
            });
          } catch (e) {
            console.warn('[spectator] stale removal failed', e);
          }
          // skip adding this game to UI
          continue;
        }
      }

      const players = [];
      for (const pk in d.players) {
        const p = d.players[pk] || {};
        players.push({ username: p.username, state: p.state || null });
      }
      if (players.length) games.push({ kind: 'duel', id: duelId, players });
    }

    // Tournaments (skip eliminated players)
    for (const tid in (tournaments || {})) {
      const t = tournaments[tid];
      if (!t || !t.players) continue;

      // stale-check for tournament similarly
      const tourKey = `tour|${tid}`;
      const tourSig = makePlayersSignature(t.players);
      const now = Date.now();
      if (_staleTrack.sig[tourKey] !== tourSig) {
        _staleTrack.sig[tourKey] = tourSig;
        _staleTrack.last[tourKey] = now;
      } else {
        if ((now - (_staleTrack.last[tourKey] || 0)) >= STALE_MS) {
          try {
            const db = getDB();
            db.ref(`${TOURNAMENTS_PATH}/${tid}`).remove().then(() => {
              console.log(`[spectator] removed stale tournament ${tid}`);
            }).catch((err) => {
              console.warn(`[spectator] failed to remove stale tournament ${tid}`, err);
            });
          } catch (e) {
            console.warn('[spectator] stale removal failed', e);
          }
          continue; // skip rendering stale tournament
        }
      }

      const players = [];
      for (const pk in t.players) {
        const p = t.players[pk] || {};
        if (p.alive === false) continue; // hide eliminated
        players.push({ username: p.username, state: p.state || null });
      }
      if (players.length) games.push({ kind: 'tournament', id: tid, players });
    }

    // If no games, show helpful UI and allow opening an empty viewer
    if (games.length === 0) {
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.alignItems = 'center';
      wrap.style.justifyContent = 'center';
      wrap.style.gap = '12px';
      wrap.style.padding = '18px';
      const msg = document.createElement('div');
      msg.textContent = 'No active games right now.';
      msg.style.opacity = '0.9';
      const openBtn = document.createElement('button');
      openBtn.textContent = 'Open Empty Viewer';
      openBtn.style.padding = '8px 12px';
      openBtn.addEventListener('click', () => openGameViewer(null, null));
      wrap.appendChild(msg);
      wrap.appendChild(openBtn);
      gridWrap.appendChild(wrap);
      return;
    }

    // Render list of game buttons (one card per game)
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '8px';
    list.style.alignItems = 'stretch';

    games.forEach(game => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px', borderRadius: '8px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.28))',
        border: '1px solid rgba(255,255,255,0.04)'
      });

      // summary: "GAME {id}: Alice vs Bob vs Carol"
      const playersNames = (game.players || []).map(p => p.username || '(anon)');
      const summary = document.createElement('div');
      summary.style.fontWeight = '700';
      summary.style.fontSize = '13px';
      summary.style.color = '#fff';
      summary.textContent = `GAME ${game.id}: ${playersNames.join(' vs ')}`;

      // actions: View (shows players list for this game)
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';

      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'View';
      viewBtn.style.padding = '6px 10px';
      viewBtn.style.cursor = 'pointer';
      viewBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        // fetch latest players for this game (fresh)
        fetchAndShowGamePlayers(game.kind, game.id);
      });

      actions.appendChild(viewBtn);
      card.appendChild(summary);
      card.appendChild(actions);
      list.appendChild(card);
    });

    gridWrap.appendChild(list);
  }

  // Open focused viewer for a single game (duel or tournament). If gameType/gameId are null, open empty viewer
  function openGameViewer(gameType, gameId) {
    // hide spectate overlay (if present) so viewer is focused
    const hiddenSpec = specOverlay ? specOverlay.root.style.display : null;
    if (specOverlay) specOverlay.root.style.display = 'none';

    // clear any per-game detail flag (we're moving to the focused viewer)
    if (specOverlay) specOverlay.currentViewing = null;

    // close existing viewer first
    closeGameViewer();

    const root = document.createElement('div');
    Object.assign(root.style, {
      position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
      zIndex: 2147483648, background: 'rgba(4,6,8,0.98)', color: '#fff',
      display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px', boxSizing: 'border-box', overflow: 'auto'
    });

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' });
    const title = document.createElement('div');
    title.style.fontWeight = '900'; title.style.fontSize = '16px';
    title.textContent = gameType ? `${gameType === 'duel' ? 'Duel' : 'Tournament'} — ${gameId}` : 'Viewer (empty)';
    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', gap: '8px' });

    const back = document.createElement('button');
    back.textContent = 'Back to Spectate';
    Object.assign(back.style, { padding: '6px 10px', cursor: 'pointer' });
    back.addEventListener('click', () => {
      closeGameViewer();
      if (specOverlay) specOverlay.root.style.display = hiddenSpec === null ? '' : hiddenSpec;
    });

    const closeAll = document.createElement('button');
    closeAll.textContent = 'Close';
    Object.assign(closeAll.style, { padding: '6px 10px', cursor: 'pointer' });
    closeAll.addEventListener('click', () => {
      closeGameViewer();
      closeSpectatorOverlay();
    });

    actions.appendChild(back);
    actions.appendChild(closeAll);
    header.appendChild(title);
    header.appendChild(actions);

    const gridWrap = document.createElement('div');
    Object.assign(gridWrap.style, { display: 'grid', gap: '12px', alignContent: 'start' });

    root.appendChild(header);
    root.appendChild(gridWrap);
    document.body.appendChild(root);

    viewer.root = root;
    viewer.gridWrap = gridWrap;
    viewer.hiddenParentVisible = hiddenSpec;

    // if null game, just show placeholder & return (still allow back)
    if (!gameType || !gameId) {
      const msg = document.createElement('div');
      msg.textContent = 'Empty viewer — no game ID provided.';
      Object.assign(msg.style, { padding: '18px', opacity: 0.9 });
      gridWrap.appendChild(msg);
      return;
    }

    // attach a listener for this game only
    try {
      const db = getDB();
      if (gameType === 'duel') {
        viewer.ref = db.ref(ACTIVE_DUELS_PATH + '/' + gameId + '/players');
      } else {
        viewer.ref = db.ref(TOURNAMENTS_PATH + '/' + gameId + '/players');
      }
      // on value, render all player perspectives (skip eliminated tournament players)
      viewer.handler = viewer.ref.on('value', snap => {
        const players = snap.val() || {};
        const pcs = [];
        for (const k in players) {
          const p = players[k] || {};
          if (gameType === 'tournament' && p.alive === false) continue; // skip eliminated
          pcs.push({ username: p.username, state: p.state || null });
        }
        renderGameView(gameType, gameId, pcs);
      });
    } catch (e) {
      console.warn('viewer attach failed', e);
      const err = document.createElement('div');
      err.textContent = 'Failed to attach to game feed.';
      Object.assign(err.style, { padding: '18px', opacity: 0.9 });
      gridWrap.appendChild(err);
    }
  }

  function closeGameViewer() {
    try {
      if (viewer.ref && viewer.handler) viewer.ref.off('value', viewer.handler);
    } catch (e) {}
    try { if (viewer.root && viewer.root.parentNode) viewer.root.parentNode.removeChild(viewer.root); } catch (e) {}
    viewer = { root: null, ref: null, handler: null, hiddenParentVisible: null };
    // restore spectate overlay if it was hidden
    if (specOverlay && specOverlay.root) specOverlay.root.style.display = '';
  }

  // render all perspectives for one game into viewer.gridWrap
  function renderGameView(gameType, gameId, playerSnapshots) {
    if (!viewer || !viewer.gridWrap) return;
    const wrap = viewer.gridWrap;
    wrap.innerHTML = '';

    if (!playerSnapshots || playerSnapshots.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No players in this game yet.';
      Object.assign(empty.style, { padding: '18px', opacity: 0.9 });
      wrap.appendChild(empty);
      return;
    }

    // compute grid for players
    const total = playerSnapshots.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
    const rows = Math.ceil(total / cols);
    const gap = 12;
    const availW = Math.max(300, window.innerWidth - 48);
    const availH = Math.max(200, window.innerHeight - 160);
    const aspect = (typeof PREVIEW_ROWS !== 'undefined' && typeof PREVIEW_COLS !== 'undefined') ? (PREVIEW_ROWS / PREVIEW_COLS) : (20/10);

    let tileW = Math.floor((availW - (cols - 1) * gap) / cols);
    let tileH = Math.floor(tileW * aspect);
    const maxTileH = Math.floor((availH - (rows - 1) * gap) / rows);
    if (tileH > maxTileH) { tileH = maxTileH; tileW = Math.floor(tileH / aspect); }

    wrap.style.gridTemplateColumns = `repeat(${cols}, ${tileW}px)`;
    wrap.style.gridAutoRows = `${tileH}px`;
    wrap.style.justifyContent = 'center';

    playerSnapshots.forEach(p => {
      const holder = document.createElement('div');
      Object.assign(holder.style, {
        width: tileW + 'px', height: tileH + 'px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.28))',
        border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px',
        padding: '6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '6px'
      });

      const canvasWrap = document.createElement('div');
      Object.assign(canvasWrap.style, { flex: '1', display: 'flex', alignItems: 'stretch', justifyContent: 'stretch' });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(160, tileW - 12);
      canvas.height = Math.max(tileH - 28, Math.round(canvas.width * aspect));
      canvas.style.width = (tileW - 12) + 'px';
      canvas.style.height = (tileH - 28) + 'px';
      canvas.style.display = 'block';
      canvas.style.borderRadius = '6px';
      canvas.style.background = 'transparent';
      canvasWrap.appendChild(canvas);

      const lbl = document.createElement('div');
      Object.assign(lbl.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: '700', color: '#fff' });
      const name = document.createElement('div'); name.textContent = p.username || '(anon)';
      const meta = document.createElement('div'); meta.style.fontSize = '11px'; meta.style.opacity = '0.9';
      meta.textContent = gameType === 'duel' ? `Duel ${gameId}` : `Tournament ${gameId}`;
      lbl.appendChild(name); lbl.appendChild(meta);

      holder.appendChild(canvasWrap);
      holder.appendChild(lbl);
      wrap.appendChild(holder);

      // draw snapshot or placeholder
      try {
        const ctx = canvas.getContext('2d');
        if (!p.state || !p.state.grid) {
          ctx.clearRect(0,0,canvas.width,canvas.height);
          ctx.fillStyle = 'rgba(255,255,255,0.02)';
          ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.font = '12px system-ui, -apple-system, "Segoe UI", Roboto, Arial';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('No state yet', canvas.width/2, canvas.height/2 - 6);
          ctx.fillText('(waiting)', canvas.width/2, canvas.height/2 + 10);
        } else {
          drawSnapshotInto(p.state, ctx, canvas.width, canvas.height);
        }
      } catch (e) { console.warn('viewer draw fail', e); }
    });
  }

  // shared small renderer (used by both spectator grid and viewer) — closure-local
  function drawSnapshotInto(snapshot, ctx, w, h) {
    try {
      ctx.clearRect(0,0,w,h);
      const grid = snapshot.grid || [];
      const rows = Math.max(grid.length, PREVIEW_ROWS || 20);
      const cols = Math.max((grid[0] && grid[0].length) || PREVIEW_COLS || 10, PREVIEW_COLS || 10);

      const pad = 2;
      const cellW = Math.floor((w - pad*2) / cols);
      const cellH = Math.floor((h - pad*2) / rows);
      const cell = Math.max(4, Math.min(cellW, cellH));
      const offsetX = Math.floor((w - (cols * cell)) / 2);
      const offsetY = Math.floor((h - (rows * cell)) / 2);

      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0,0,w,h);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const v = (grid[r] && grid[r][c]) ? grid[r][c] : 0;
          const x = offsetX + c * cell;
          const y = offsetY + r * cell;
          if (v) {
            ctx.fillStyle = v;
            ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.02)';
            ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
          }
        }
      }

      // ghost piece
      if (snapshot.current) {
        const shape = snapshot.current.shape || [];
        let gy = snapshot.current.y || 0;
        function collides(shape2, px, py) {
          for (let rr = 0; rr < shape2.length; rr++) {
            for (let cc = 0; cc < (shape2[rr] || []).length; cc++) {
              if (!shape2[rr][cc]) continue;
              const x = px + cc, y = py + rr;
              if (x < 0 || x >= cols || y >= rows) return true;
              if (y >= 0 && grid[y] && grid[y][x]) return true;
            }
          }
          return false;
        }
        while (!collides(shape, snapshot.current.x, gy + 1)) gy++;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < (shape[r] || []).length; c++) {
            if (!shape[r][c]) continue;
            const x = offsetX + (snapshot.current.x + c) * cell;
            const y = offsetY + (gy + r) * cell;
            ctx.fillRect(x, y, cell - 1, cell - 1);
          }
        }
      }

      // current piece
      if (snapshot.current) {
        const p = snapshot.current;
        const shape = p.shape || [];
        const color = p.color || '#fff';
        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < (shape[r] || []).length; c++) {
            if (!shape[r][c]) continue;
            const x = offsetX + (p.x + c) * cell;
            const y = offsetY + (p.y + r) * cell;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cell - 1, cell - 1);
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.strokeRect(x, y, cell - 1, cell - 1);
          }
        }
      }
    } catch (e) { console.warn('drawSnapshotInto error', e); }
  }

})();



// --- TOURNAMENT MANAGER (drop-in replacement) ---
// --- TOURNAMENT MANAGER (fully updated: kicks local losers like duels, queue countdown + ready-to-start) ---
const TournamentManager = (function () {
  const dbRoot = getDB();
  let myTQueueKey = null;
  let localTournamentId = null;
  let tournamentGame = null;
  let tournamentOverlay = null;
  let playersListener = null;
  let parentListener = null;
  let pushThrottleTimer = null;
  let lastPushAt = 0;
  let _watchdog = null;
  let _localEliminated = false; // <-- local-eliminated flag to avoid double-kick races

  // New: UI + state for queue overlay & start flow
  let queueOverlay = null;
  let queueRefListener = null;
  let startNodeListener = null;
  const START_WAIT_MS = 60 * 1000; // 60 seconds wait
  const START_DB_PATH = TOURNAMENT_QUEUE_PATH + '_start'; // ephemeral coordination node

  // timers / intervals
  let countdownInterval = null;
  let pendingCreateTimer = null;
  let _tournamentFinishedLocally = false;
  let diddyWin = false;
  let endedPoll = null;
  
  function generateSeed() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return String(a[0]);
      }
    } catch (e) { /* ignore */ }
    return String(Math.floor(Math.random() * 0xffffffff));
  }
  // xfnv1a -> 32-bit hash for arbitrary string seeds
  function xfnv1a(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
      h >>>= 0;
    }
    return h >>> 0;
  }
  // mulberry32 PRNG (returns function() -> 0..1)
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61) >>> 0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // join the tournament queue
  function joinQueue() {
    const me = getLocalUser();
    if (!me) { Swal.fire('Please sign in to join tournaments'); return; }
    if (myTQueueKey) {
      Swal.fire({ title: 'Already queued', text: 'You are already in the tournament queue', icon: 'info', timer: 1200, showConfirmButton: false });
      return;
    }
    const qRef = dbRoot.ref(TOURNAMENT_QUEUE_PATH).push();
    myTQueueKey = qRef.key;
    // Include ready flag so UI can toggle it
    qRef.set({ username: me.username, joinedAt: now(), ready: false }).catch(()=>{});

    Swal.fire({ title: 'Queued', text: 'Waiting for tournament to start…', icon: 'info', timer: 1500, showConfirmButton: false });

    // start watching queue (ensures earliest client creates tournament)
    startWatchingQueueLocal();

    // ensure removal on unload
    window.addEventListener('beforeunload', () => { _removeLocalTournamentQueueEntryIfAny().catch(()=>{}); }, { once: true });
  }

  async function _removeLocalTournamentQueueEntryIfAny() {
    try {
      const me = getLocalUser();
      if (!me || !me.username) return;
      // Primary fast-path: remove by stored key
      if (myTQueueKey) {
        try { await dbRoot.ref(TOURNAMENT_QUEUE_PATH + '/' + myTQueueKey).remove(); } catch (e) {}
        myTQueueKey = null;
        // also clear any local queue overlay
        destroyQueueOverlay();
        return;
      }
      // Fallback: scan for any entries matching username
      const snap = await dbRoot.ref(TOURNAMENT_QUEUE_PATH).once('value');
      const val = snap.val() || {};
      for (const k of Object.keys(val)) {
        const v = val[k];
        if (v && v.username === me.username) {
          try { await dbRoot.ref(TOURNAMENT_QUEUE_PATH + '/' + k).remove(); } catch (e) {}
          if (myTQueueKey === k) myTQueueKey = null;
        }
      }
      destroyQueueOverlay();
    } catch (e) {}
  }

  // START: queue overlay and watchers
  function startWatchingQueueLocal() {
    // Listen to queue path for UI updates
    const qRef = dbRoot.ref(TOURNAMENT_QUEUE_PATH);
    if (queueRefListener) {
      qRef.off('value', queueRefListener);
      queueRefListener = null;
    }
    queueRefListener = qRef.on('value', snap => {
      const val = snap.val() || {};
      // if we no longer have a queued key, ditch overlay and listener
      if (!myTQueueKey) {
        // still update overlay if other people are queued, but if user isn't queued we don't force showing UI
        destroyQueueOverlay();
      } else {
        ensureQueueOverlay();
        updateQueueOverlay(val);
      }
      // After any queue state change, also check start node consistency
      checkAndCleanupStaleStartNode().catch(()=>{});
    });

    // Listen to any pending "start" coordination node for this queue
    const startRef = dbRoot.ref(START_DB_PATH);
    if (startNodeListener) {
      startRef.off('value', startNodeListener);
      startNodeListener = null;
    }
    startNodeListener = startRef.on('value', snap => {
      const startObj = snap.val();
      if (!startObj) {
        // no pending start — ensure overlay shows no countdown
        if (queueOverlay) showQueueCountdown(null);
        return;
      }
      // If startObj exists, update the overlay countdown
      const { startAt, selected = [], initiator } = startObj;
      ensureQueueOverlay();
      showQueueCountdown(startAt);
      // If the initiator is us, we will manage finalization when startAt passes or all ready
      if (initiator === myTQueueKey) {
        // ensure we have a timer to attempt create when startAt passes
        scheduleCreateWhenDue(startObj);
      }
    });
  }

  // Ensure queue overlay exists (creates DOM if missing)
  function ensureQueueOverlay() {
    if (queueOverlay) return;
    const ov = document.createElement('div');
    Object.assign(ov.style, {
      position: 'fixed',
      left: '10px',
      bottom: '10px',
      zIndex: 2147483000,
      padding: '8px',
      borderRadius: '8px',
      background: 'rgba(6,8,12,0.9)',
      border: '1px solid rgba(255,255,255,0.03)',
      color: '#fff',
      fontFamily: 'sans-serif',
      minWidth: '220px',
      maxWidth: '360px',
      boxSizing: 'border-box'
    });

    const header = document.createElement('div');
    header.textContent = 'Tournament Queue';
    header.style.fontWeight = '800';
    header.style.marginBottom = '6px';
    ov.appendChild(header);

    const countdown = document.createElement('div');
    countdown.id = 'tq-countdown';
    countdown.style.fontWeight = '900';
    countdown.style.marginBottom = '6px';
    ov.appendChild(countdown);

    const list = document.createElement('div');
    list.id = 'tq-list';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '4px';
    ov.appendChild(list);

    const actions = document.createElement('div');
    actions.style.marginTop = '8px';
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.justifyContent = 'flex-end';

    const leaveBtn = document.createElement('button');
    leaveBtn.textContent = 'Leave Queue';
    Object.assign(leaveBtn.style, { cursor: 'pointer' });
    leaveBtn.addEventListener('click', () => { _removeLocalTournamentQueueEntryIfAny().catch(()=>{}); });
    actions.appendChild(leaveBtn);

    ov.appendChild(actions);

    document.body.appendChild(ov);
    queueOverlay = { element: ov, listEl: list, countdownEl: countdown, headerEl: header };
  }

  function destroyQueueOverlay() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    if (pendingCreateTimer) { clearTimeout(pendingCreateTimer); pendingCreateTimer = null; }
    if (queueOverlay && queueOverlay.element) {
      try { queueOverlay.element.parentNode.removeChild(queueOverlay.element); } catch (e) {}
      queueOverlay = null;
    }
  }

  // Update queue overlay from DB snapshot value
  function updateQueueOverlay(queueVal) {
    if (!queueOverlay) return;
    const listEl = queueOverlay.listEl;
    listEl.innerHTML = '';
    const entries = Object.keys(queueVal).map(k => ({ key: k, data: queueVal[k] })).sort((a,b) => (a.data.joinedAt || 0) - (b.data.joinedAt || 0));
    entries.forEach(({ key, data }) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '6px';

      const name = document.createElement('div');
      name.textContent = data && data.username ? data.username : 'unknown';
      name.style.fontWeight = (key === myTQueueKey) ? '900' : '700';
      row.appendChild(name);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '6px';

      // ready indicator
      const readyBadge = document.createElement('div');
      readyBadge.textContent = (data && data.ready) ? 'Ready' : 'Not Ready';
      readyBadge.style.fontSize = '12px';
      readyBadge.style.opacity = (data && data.ready) ? '1' : '0.6';
      readyBadge.style.fontWeight = '700';
      right.appendChild(readyBadge);

      // If this row is our entry, show toggle button
      if (key === myTQueueKey) {
        const btn = document.createElement('button');
        btn.textContent = (data && data.ready) ? 'Unready' : 'Ready';
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', async () => {
          try {
            await dbRoot.ref(TOURNAMENT_QUEUE_PATH + '/' + key + '/ready').set(!(data && data.ready));
          } catch (e) {}
        });
        right.appendChild(btn);
      }

      row.appendChild(right);
      listEl.appendChild(row);
    });
  }

  // Show countdown in queue overlay (startAt is epoch ms or null to hide)
  function showQueueCountdown(startAt) {
    if (!queueOverlay) return;
    if (!startAt) {
      queueOverlay.countdownEl.textContent = '';
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      return;
    }
    function tick() {
      const remaining = Math.max(0, Math.ceil((startAt - now()) / 1000));
      queueOverlay.countdownEl.textContent = `Starting in: ${remaining}s`;
      if (remaining <= 0) {
        queueOverlay.countdownEl.textContent = `Starting...`;
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      }
    }
    tick();
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    countdownInterval = setInterval(() => {
      tick();
    }, 950);
  }

  // schedule creation when startAt passes (only executed by initiator)
  function scheduleCreateWhenDue(startObj) {
    if (!startObj || !startObj.startAt) return;
    if (pendingCreateTimer) { clearTimeout(pendingCreateTimer); pendingCreateTimer = null; }
    const delay = Math.max(0, startObj.startAt - now());
    pendingCreateTimer = setTimeout(async () => {
      try {
        // On timer expiry, re-read start node and queue to ensure still valid
        const sSnap = await dbRoot.ref(START_DB_PATH).once('value');
        const sVal = sSnap.val();
        if (!sVal) return;
        // If another client acquired the lock already, do nothing
        if (sVal.lockedBy && sVal.lockedBy !== myTQueueKey) return;
        // If start still valid and we are initiator, try to create tournament (may be created early already)
        if (sVal.initiator === myTQueueKey) {
          await attemptCreateTournamentFromStartNode(sVal);
        } else {
          // If we're not the initiator but lock is not set, let the initiator proceed naturally
        }
      } catch (e) { console.warn('scheduleCreateWhenDue fail', e); }
    }, delay + 50);
  }

  // Check start node against current queue: if start node references players not present any more, delete it.
  async function checkAndCleanupStaleStartNode() {
    try {
      const sSnap = await dbRoot.ref(START_DB_PATH).once('value');
      const sVal = sSnap.val();
      if (!sVal) return;
      const qSnap = await dbRoot.ref(TOURNAMENT_QUEUE_PATH).once('value');
      const qVal = qSnap.val() || {};
      const selected = sVal.selected || [];
      // if any selected key no longer present in queue, remove the start node
      for (const k of selected) {
        if (!qVal[k]) {
          try { await dbRoot.ref(START_DB_PATH).remove(); } catch (e) {}
          return;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Attempt to create tournament according to a start node (initiator only)
  async function attemptCreateTournamentFromStartNode(startObj) {
    if (!startObj || !startObj.selected || !Array.isArray(startObj.selected)) return;
    const startRef = dbRoot.ref(START_DB_PATH);

    try {
      // 1) Try to acquire a short-lived lock on the start node so only one creator proceeds.
      const lockResult = await new Promise((resolve) => {
        startRef.transaction(curr => {
          // If start node was removed or changed, abort
          if (!curr) return;
          // If already locked by someone, leave it unchanged -> transaction will fail to commit for this writer
          if (curr.lockedBy) return;
          // Lock it for this client
          curr.lockedBy = myTQueueKey;
          curr.lockedAt = now();
          return curr;
        }, (err, committed, snap) => {
          resolve({ err, committed, snapVal: snap ? snap.val() : null });
        }, false);
      });

      if (!lockResult || !lockResult.committed) {
        // somebody else raced to lock / start node removed — bail out
        return;
      }
      // Confirm we own the lock
      const lockedVal = lockResult.snapVal || {};
      if (lockedVal.lockedBy !== myTQueueKey) return;

      // 2) Re-read the queue and tournaments to validate current state (defensive)
      const qSnap = await dbRoot.ref(TOURNAMENT_QUEUE_PATH).once('value');
      const qVal = qSnap.val() || {};
      const selectedKeys = (startObj.selected || []).slice();
      const players = selectedKeys.map(k => qVal[k]).filter(Boolean);
      if (players.length < MIN_TOURNAMENT_PLAYERS) {
        // cancel start if players dropped; try to remove start node
        try { await startRef.remove(); } catch(e) {}
        return;
      }

      // ensure none are already in an active tournament (re-check the serverside tournaments)
      const tSnap = await dbRoot.ref(TOURNAMENTS_PATH).once('value');
      const tVals = tSnap.val() || {};
      for (const tid in tVals) {
        const t = tVals[tid];
        if (t && t.players) {
          const ps = Object.values(t.players).map(p => p.username);
          for (const p of players) {
            if (ps.includes(p.username)) {
              // someone already in tournament -> cancel start and remove start node
              try { await startRef.remove(); } catch (e) {}
              return;
            }
          }
        }
      }

      // 3) Create tournament (we hold the lock) — now include seed so all participants use same piece sequence
      const newRef = dbRoot.ref(TOURNAMENTS_PATH).push();
      const tid = newRef.key;
      const playersObj = {};
      for (const p of players) {
        playersObj[safeKey(p.username)] = { username: p.username, joinedAt: p.joinedAt, lastActiveAt: now(), state: null, alive: true };
      }

      // generate a seed for the whole tournament so every client uses the same random stream
      const seed = generateSeed();

      const tournamentObj = {
        createdAt: now(),
        status: 'running',
        seed: seed,
        players: playersObj,
        createdFromStart: startObj // optional diagnostic trace
      };
      await newRef.set(tournamentObj);

      // 4) Remove the queue entries for the selected keys
      for (const k of selectedKeys) {
        try { await dbRoot.ref(TOURNAMENT_QUEUE_PATH + '/' + k).remove(); } catch (e) {}
        if (myTQueueKey === k) myTQueueKey = null;
      }

      // defensive sweep: remove any other queue entries that match usernames now in the tournament
      try {
        const qSnap2 = await dbRoot.ref(TOURNAMENT_QUEUE_PATH).once('value');
        const allQ = qSnap2.val() || {};
        for (const qk of Object.keys(allQ)) {
          const qv = allQ[qk];
          if (qv && playersObj[safeKey(qv.username)]) {
            try { await dbRoot.ref(TOURNAMENT_QUEUE_PATH + '/' + qk).remove(); } catch(e) {}
            if (myTQueueKey === qk) myTQueueKey = null;
          }
        }
      } catch(e){}

      // 5) Cleanup the start node (we locked it so safe to remove)
      try { await startRef.remove(); } catch (e) {}

      // 6) Start local host behavior for the creator (pass seed so game pieces match)
      startTournamentAs(tid, Object.values(playersObj).map(p => p.username), seed).catch(()=>{});

    } catch (err) {
      console.error('tournament create failed (locked path)', err);
      // best-effort cleanup
      try { await startRef.remove(); } catch(e){}
    }
  }

  // Only earliest queued client creates the tournament (modified to create start node + countdown & ready button)
  function watchTournamentQueue() {
    // Legacy/global function remains for compatibility: we only need local watcher (startWatchingQueueLocal) for when a user is queued.
    // For clients not queued, they don't do leader election here.
    // Keep it as no-op or a passive listener if desired.
  }

  // New: job that decides to create a start node (earliest queued client triggers the start countdown)
  async function maybeInitiateStartIfEarliest(queueVal) {
    try {
      const keys = Object.keys(queueVal || {});
      if (!myTQueueKey) return;
      if (keys.length < MIN_TOURNAMENT_PLAYERS) return;

      // sort by joinedAt ascending
      const queueAll = keys.sort((a, b) => (queueVal[a].joinedAt || 0) - (queueVal[b].joinedAt || 0));
      if (queueAll[0] !== myTQueueKey) return; // only earliest creates start node

      // pick first MIN_TOURNAMENT_PLAYERS players
      const selected = queueAll.slice(0, MIN_TOURNAMENT_PLAYERS);
      const players = selected.map(k => queueVal[k]).filter(Boolean);
      if (players.length < MIN_TOURNAMENT_PLAYERS) return;

      // ensure none are already in an active tournament
      const tRef = dbRoot.ref(TOURNAMENTS_PATH);
      const tSnap = await tRef.once('value');
      const tVals = tSnap.val() || {};
      for (const tid in tVals) {
        const t = tVals[tid];
        if (t && t.players) {
          const ps = Object.values(t.players).map(p => p.username);
          for (const p of players) {
            if (ps.includes(p.username)) return; // someone already in tournament -> don't start
          }
        }
      }

      // check if a start node already exists (someone else may have set it)
      const startSnap = await dbRoot.ref(START_DB_PATH).once('value');
      const startVal = startSnap.val();
      if (startVal && startVal.initiator && startVal.initiator !== myTQueueKey) {
        // another initiator already started; do nothing.
        return;
      }

      // Create start node with startAt and selected keys
      const startAt = now() + START_WAIT_MS;
      const startObj = { startAt, initiator: myTQueueKey, selected };
      await dbRoot.ref(START_DB_PATH).set(startObj);

      // schedule local create just in case (scheduleCreateWhenDue will pick it up)
      scheduleCreateWhenDue(startObj);

      // Also, listen for ready changes: if all 'selected' players have ready === true in queue entries, create immediately
      // We'll rely on the startNodeListener + scheduleCreateWhenDue + attemptCreateTournamentFromStartNode to run when appropriate.
    } catch (e) {
      console.warn('maybeInitiateStartIfEarliest err', e);
    }
  }

  // When start node exists and someone toggles ready, earliest initiator should check for all ready and create immediately
  async function checkAllReadyAndMaybeCreate(startVal) {
    if (!startVal || !startVal.selected || !Array.isArray(startVal.selected)) return;
    try {
      const qSnap = await dbRoot.ref(TOURNAMENT_QUEUE_PATH).once('value');
      const qVal = qSnap.val() || {};
      const selectedKeys = startVal.selected;
      // collect readiness
      const readiness = selectedKeys.map(k => !!(qVal[k] && qVal[k].ready));
      const allReady = readiness.every(v => v === true);
      if (allReady && startVal.initiator === myTQueueKey) {
        // fast-create tournament immediately
        await attemptCreateTournamentFromStartNode(startVal);
      }
    } catch (e) { /* ignore */ }
  }

  // Global watcher so every participant starts local tournament UI
  function watchTournamentsGlobal() {
    const ref = dbRoot.ref(TOURNAMENTS_PATH);
    ref.on('child_added', async snap => {
      const tid = snap.key;
      const t = snap.val();
      if (!t || !t.players) return;
      const me = getLocalUser();
      if (!me) return;
      const meSafe = safeKey(me.username);

      // If DB says we already forfeited, or localStorage has a pending forfeit, do not start.
      const myEntry = t.players[meSafe];
      const hasLocalPending = !!(localStorage && (() => {
        try { return localStorage.getItem('tournament_forfeit_' + tid); } catch(e) { return null; }
      })());
      if ((myEntry && myEntry.forfeited === true) || hasLocalPending) {
        // be sure DB reflects forfeited/dead status (best-effort)
        try { await _tryMarkPlayerForfeited(tid, me.username); } catch (e) { /* ignore */ }
        return;
      }

      // NEW: if the user's own DB state already indicates game-over, don't start the UI.
      // (you already push isGameOver when the game ends, so this prevents a refresh respawn)
      if (myEntry && myEntry.state && myEntry.state.isGameOver === true) {
        // ensure alive flag is false in DB (best-effort) and bail out
        try { await dbRoot.ref(TOURNAMENTS_PATH + '/' + tid + '/players/' + meSafe + '/alive').set(false); } catch (e) { /* ignore */ }
        return;
      }

      // avoid double-start
      if (localTournamentId === tid) return;

      if (t.players[meSafe]) {
        // Before starting local UI, ensure we're removed from the queue (prevents 'already queued' rejoin bug)
        try { await _removeLocalTournamentQueueEntryIfAny(); } catch (e) {}
        // start local UI. Pass seed from server if present so pieces match across clients.
        startTournamentAs(tid, Object.keys(t.players).map(k => t.players[k].username), t.seed).catch(()=>{});
      }
    });

    // Also, watch queue globally so earliest can initiate start when queue changes (for people who are queued)
    // But only when the local client is queued we need to do anything; otherwise no-op.
    const qRef = dbRoot.ref(TOURNAMENT_QUEUE_PATH);
    qRef.on('value', snap => {
      const val = snap.val() || {};
      // if user is queued, reflect UI & let earliest decide start
      if (myTQueueKey) {
        ensureQueueOverlay();
        updateQueueOverlay(val);
        // earliest check
        maybeInitiateStartIfEarliest(val).catch(()=>{});
      } else {
        // not queued: still cleanup overlay
        destroyQueueOverlay();
      }
      // Also monitor any start node and if this client is the initiator check readiness
      dbRoot.ref(START_DB_PATH).once('value').then(snapStart => {
        const sVal = snapStart.val();
        if (sVal) {
          // if start exists, update countdown UI
          ensureQueueOverlay();
          showQueueCountdown(sVal.startAt);
          if (sVal.initiator === myTQueueKey) {
            scheduleCreateWhenDue(sVal);
          }
          // If any change in queue occurs, check all-ready
          checkAllReadyAndMaybeCreate(sVal).catch(()=>{});
        } else {
          if (queueOverlay) showQueueCountdown(null);
        }
      }).catch(()=>{});
    });
  }

  // existing _tryMarkPlayerForfeited (unchanged)
  async function _tryMarkPlayerForfeited(tournamentId, username) {
    if (!tournamentId || !username) return;
    const safe = safeKey(username);
    // mark localStorage as fallback (so on reload we still treat as forfeited)
    try { localStorage.setItem('tournament_forfeit_' + tournamentId, '1'); } catch (e) {}
    // best-effort DB update (may fail during unload)
    try {
      await dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId + '/players/' + safe).update({ forfeited: true, alive: false });
    } catch (e) {
      // ignore, localStorage will handle the fallback
    }
  }

  // flush pending forfeits from localStorage to DB if present for given tournament
  async function _flushPendingForfeitIfAny(tournamentId, username) {
    if (!tournamentId || !username) return;
    try {
      if (!localStorage.getItem('tournament_forfeit_' + tournamentId)) return;
    } catch (e) { return; }
    await _tryMarkPlayerForfeited(tournamentId, username);
    try { localStorage.removeItem('tournament_forfeit_' + tournamentId); } catch (e) {}
  }

  // Start local tournament UI & local game for tournament participant
  // Added seedFromServer so all players use the same seeded sequence
  async function startTournamentAs(tournamentId, playerNames, seedFromServer) {
    // Ensure queued entry removed ASAP (fixes "already in queue" when joining tournament after countdown)
    try { await _removeLocalTournamentQueueEntryIfAny(); } catch (e) {}

    window.tetrisAPI.showMenu();

    diddyWin = false;
    // guard
    if (localTournamentId) {
      console.warn('Already in tournament, ignoring startTournamentAs');
      return;
    }
    localTournamentId = tournamentId;
    _localEliminated = false; // reset flag for this run
    _tournamentFinishedLocally = false;

    // create overlay UI (local canvas + players list)
    const ov = document.createElement('div');
    Object.assign(ov.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 2147,
      padding: '10px',
      borderRadius: '8px',
      background: 'rgba(6,8,12,0.96)',
      border: '1px solid rgba(255,255,255,0.04)',
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start'
    });

    // left: local canvas container
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '6px';

    // right: players list (names only)
    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.gap = '6px';
    right.style.minWidth = '140px';
    right.style.maxHeight = '60vh';
    right.style.overflowY = 'auto';
    right.style.padding = '6px';
    right.style.borderLeft = '1px solid rgba(255,255,255,0.02)';

    // title
    const title = document.createElement('div');
    title.textContent = 'Tournament';
    title.style.fontWeight = '900';
    title.style.color = '#fff';
    title.style.marginBottom = '6px';
    right.appendChild(title);

    // player entries container
    const playersContainer = document.createElement('div');
    playersContainer.style.display = 'flex';
    playersContainer.style.flexDirection = 'column';
    playersContainer.style.gap = '4px';
    right.appendChild(playersContainer);

    // 'Quit' button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Quit';
    Object.assign(closeBtn.style, { position: 'absolute', right: '10px', top: '6px', cursor: 'pointer' });
    closeBtn.addEventListener('click', () => cleanupLocalTournament(true));
    ov.appendChild(closeBtn);

    ov.appendChild(left);
    ov.appendChild(right);
    document.body.appendChild(ov);

    tournamentOverlay = { element: ov, leftContainer: left, playersContainer };

    async function showCountdownOverlay(count = 3) {
      return new Promise((resolve) => {
        let current = count;
        Swal.fire({
          title: '',
          html: `
            <div id="mp-countdown"
                 style="
                    font-size:120px;
                    font-weight:900;
                    color:#fff;
                    text-shadow:0 0 20px rgba(0,0,0,0.8);
                    line-height:1;
                    letter-spacing:4px;
                 ">
              ${current}
            </div>
          `,
          background: 'transparent',
          showConfirmButton: false,
          allowOutsideClick: false,
          allowEscapeKey: false,
          backdrop: 'rgba(0,0,0,0.75)',
          didOpen: () => {
            const swalContainer = document.querySelector('.swal2-container');
            if (swalContainer) swalContainer.style.zIndex = '99999';
            const swalPopup = document.querySelector('.swal2-popup');
            if (swalPopup) {
              swalPopup.style.background = 'transparent';
              swalPopup.style.boxShadow = 'none';
              swalPopup.style.overflow = 'hidden';
            }
            const swalHtml = document.querySelector('.swal2-html-container');
            if (swalHtml) {
              swalHtml.style.overflow = 'hidden';
              swalHtml.style.padding = '0';
              swalHtml.style.margin = '0';
            }
            const container = Swal.getHtmlContainer?.() || swalHtml;
            const el = container ? container.querySelector('#mp-countdown') : null;

            const iv = setInterval(() => {
              current--;
              if (el) {
                el.textContent = String(current > 0 ? current : 'GO!');
                if (current <= 0) {
                  el.style.color = '#0f0';
                  el.style.fontSize = '140px';
                  el.style.transition = 'all 0.3s ease';
                }
              }
              if (current <= 0) {
                clearInterval(iv);
                setTimeout(() => {
                  try { Swal.close(); } catch (e) {}
                  resolve();
                }, 600);
              }
            }, COUNTDOWN_MS);
          }
        });
      });
    }

    function fadeOutMenuSongInterval(durationMs = 1000, stepMs = 50) {
      const steps = Math.max(1, Math.round(durationMs / stepMs));
      const volStep = (window.menuSong.volume || 1) / steps;
      const id = setInterval(() => {
        const next = Math.max(0, window.menuSong.volume - volStep);
        window.menuSong.volume = next;
        if (next <= 0.0001) {
          clearInterval(id);
          window.menuSong.volume = 0;
          window.menuSong.pause();
          window.menuSong.currentTime = 0;
        }
      }, stepMs);
    }

    // usage
    fadeOutMenuSongInterval(1000, 50);

    let countdownSfx = new Audio("https://codehs.com/uploads/28d03d9824a477eb9158ded1478f7057");
    countdownSfx.play();
    countdownSfx.volume = 0.6;
    await showCountdownOverlay(3);

    window.duelSong = new Audio("https://codehs.com/uploads/6277e79338f86293e04dea7b84c1486e");
    window.duelSong.volume = 0.6;
    window.duelSong.loop = true;
    window.duelSong.play();

    // create local DuelCanvasGame inside leftContainer
    // make the onGameOver callback async so we can persist forfeits reliably

    // --- fetch seed if not passed ---
    let seed = seedFromServer;
    if (!seed) {
      try {
        const snap = await dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId).once('value');
        const t = snap.val() || {};
        if (t && t.seed) seed = t.seed;
      } catch (e) { /* ignore */ }
    }
    if (!seed) seed = 'fallback-' + generateSeed();

    tournamentGame = new DuelCanvasGame({
      container: left,
      onGameOver: async (res) => {
        // mark local as dead in DB and push final snapshot
        if (!_localEliminated) {
          _localEliminated = true;
          try {
            // persist forfeited state so reloads won't restart UI
            const me = getLocalUser();
            if (localTournamentId && me && me.username) {
              await _tryMarkPlayerForfeited(localTournamentId, me.username);
            }
          } catch (e) { /* ignore */ }

          try { reportLocalState(true); } catch(e){/* ignore */ }

          // show immediate feedback then remove local UI (do NOT delete the tournament DB node;
          // we only close the local player's UI like a duel loss)
          try {
            Swal.fire({ title: 'Eliminated', text: 'You have been eliminated from the tournament', icon: 'error' });
          } catch(e) {}

          // cleanup local UI and listeners (do not remove tournament DB by default)
          cleanupLocalTournament(false);
        }
      },
      onStateUpdate: (state) => {
        const nowMs = now();
        if (nowMs - lastPushAt > PIECE_PUSH_THROTTLE_MS) {
          pushLocalState(state);
          lastPushAt = nowMs;
        } else {
          if (pushThrottleTimer) clearTimeout(pushThrottleTimer);
          pushThrottleTimer = setTimeout(() => pushLocalState(state), PIECE_PUSH_THROTTLE_MS);
        }
      },
      seed: seed
    });

    // set name on the local preview
    const me = getLocalUser();
    tournamentGame.setName(me ? me.username : 'you');

    // speed change wiring (same as duels)
    tournamentGame.onSpeedChange = (speedMs) => {
      if (TournamentManager._localDropInterval) { clearInterval(TournamentManager._localDropInterval); TournamentManager._localDropInterval = null; }
      TournamentManager._localDropInterval = setInterval(() => { if (tournamentGame) tournamentGame.drop(false); }, speedMs);
    };
    if (TournamentManager._localDropInterval) clearInterval(TournamentManager._localDropInterval);
    TournamentManager._localDropInterval = setInterval(() => { if (tournamentGame) tournamentGame.drop(false); }, tournamentGame.fallSpeed);

    // push an immediate initial state
    reportLocalState(false);

    // listen to tournament players updates
    const playersRef = dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId + '/players');
    playersListener = playersRef.on('value', snap => {
      const playersObj = snap.val() || {};
      // update players list UI: bright white if alive, grey if dead
      playersContainer.innerHTML = '';
      const order = playerNames.slice(); // preserve original ordering if possible

      order.forEach((pname) => {
        const safe = safeKey(pname);
        const p = playersObj[safe] || null;
        const el = document.createElement('div');
        el.textContent = pname;
        el.style.fontWeight = '800';
        el.style.fontSize = '13px';
        el.style.opacity = (p && p.alive) ? '1' : '0.45';
        el.style.color = (p && p.alive) ? '#ffffff' : '#9a9a9a';
        playersContainer.appendChild(el);
      });

      // --- if the DB says we are dead/marked not alive, kick local player out immediately ---
      try {
        const meLocal = getLocalUser();
        if (meLocal && meLocal.username) {
          const mySafe = safeKey(meLocal.username);
          const myEntry = playersObj[mySafe];
          if (myEntry && myEntry.alive === false && !_localEliminated) {
            _localEliminated = true;
            try {
              // persist forfeited if not already
              if (localTournamentId && meLocal && meLocal.username) {
                _tryMarkPlayerForfeited(localTournamentId, meLocal.username).catch(()=>{});
              }
            } catch(e){}
            try { Swal.fire({ title: 'Eliminated', text: 'You have been eliminated from the tournament', icon: 'error' }); } catch(e){}
            cleanupLocalTournament(false);
            // continue to let finalize flow occur
          }
        }
      } catch (e) { /* ignore defensive errors */ }

      // check if tournament has finished (only one alive or none)
      const pkeys = Object.keys(playersObj);
      const alive = pkeys.filter(k => playersObj[k] && playersObj[k].alive && !(playersObj[k].state && playersObj[k].state.isGameOver === true));
      if (alive.length <= 1) {
        // pick winner
        const winnerKey = alive[0] || null;
        const winnerName = winnerKey ? playersObj[winnerKey].username : null;
        // finalize remotely by awarding stats and deleting the tournament node
        finalizeTournament(tournamentId, winnerName).catch(e => console.warn('finalizeTournament failed', e));
      }
    });

    // parent listener to detect removal/abort
    const parentRef = dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId);
    parentListener = parentRef.on('value', snap => {
      if (!snap.exists()) {
        // tournament removed externally -> cleanup
        cleanupLocalTournament();
      }
    });

    // watchdog (inactivity)
    _watchdog = setInterval(() => tournamentWatchdog(tournamentId), 1500);

    // ensure that if the tab unloads while in tournament we persist a forfeit locally
    window.addEventListener('beforeunload', () => {
      try {
        const me = getLocalUser();
        if (localTournamentId && me && me.username) {
          _tryMarkPlayerForfeited(localTournamentId, me.username).catch(()=>{});
        }
      } catch(e){}
    }, { once: true });

    // start ended polling fallback (every 2s)
    if (endedPoll) { clearInterval(endedPoll); endedPoll = null; }
    endedPoll = setInterval(async () => {
      try {
        if (!localTournamentId) return;
        const snap = await dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId).once('value');
        if (!snap.exists()) {
          // tournament removed => cleanup
          cleanupLocalTournament();
          return;
        }
        const t = snap.val() || {};
        // If explicit ended flag or status indicates finished, cleanup
        if (t.ended === true || t.status === 'finished' || t.finished) {
          cleanupLocalTournament();
        }
      } catch (e) {
        // ignore transient DB errors
      }
    }, 1000);
  }

  async function finalizeTournament(tournamentId, winnerName) {
    if (diddyWin) { return; } diddyWin = true;

    try {
      // allow any client to attempt finalize (transaction prevents double-award)
      if (_tournamentFinishedLocally) return;

      if (!tournamentId) {
        console.warn('finalizeTournament: missing tournamentId');
        return;
      }

      // helper fade-in function preserved exactly as before
      function fadeInMenuSongInterval(durationMs = 1000, stepMs = 50) {
        const steps = Math.max(1, Math.round(durationMs / stepMs));
        const volStep = (0.01) * steps;
        const id = setInterval(() => {
          const next = Math.max(0, (window.menuSong && window.menuSong.volume) ? window.menuSong.volume + volStep : volStep);
          try { if (window.menuSong) window.menuSong.volume = next; } catch (e) {}
          if (next <= 0.6) {
            clearInterval(id);
            try {
              if (window.menuSong) {
                window.menuSong.volume = 0.6;
                window.menuSong.play();
              }
            } catch (e) {}
          }
        }, stepMs);
      }

      // helper to show appropriate audio + sweetalert for the local user
      function showFinishAlertsForLocalUser(me, winnerNameLocal) {
        try {
          if (!me) return;
          if (winnerNameLocal && me.username === winnerNameLocal) {
            try { new Audio("https://codehs.com/uploads/b9c961b3ed77751ef2f04b1540e954de").play(); } catch (e) {}
            Swal.fire({
              title: 'You won the tournament!',
              text: `Congratulations — you are the champion.`,
              icon: 'success'
            });
          } else {
            // lost (or anonymous winner)
            try { new Audio("https://codehs.com/uploads/eb23c4aab950e9e55b24a4a9f49d915b").play(); } catch (e) {}
            Swal.fire({
              title: 'You lost',
              text: winnerNameLocal ? `Winner: ${winnerNameLocal}` : 'The tournament has ended.',
              icon: 'error'
            });
          }
        } catch (e) {
          console.warn('showFinishAlertsForLocalUser failed', e);
        }
      }

      // Attempt to mark the tournament finished atomically on server to prevent races
      const finishedRef = dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId + '/finished');
      finishedRef.transaction(current => {
        if (current && current.winner) {
          // already finished -> abort
          return;
        }
        return { winner: winnerName || null, at: now() };
      }, async (err, committed, snapshot) => {
        if (err) {
          console.error('finalizeTournament transaction error', err);
          return;
        }

        // If someone else already finished it, do not re-award — just local UI/cleanup
        if (!committed) {
          _tournamentFinishedLocally = true;

          // restore menu song as in your original
          fadeInMenuSongInterval(1000, 50);

          // stop tournament/duel music if present
          try { if (window.duelSong) { window.duelSong.pause(); window.duelSong.currentTime = 0; } } catch (e) {}

          // show local notification (best-effort) using the new helper
          try {
            const me = getLocalUser();
            showFinishAlertsForLocalUser(me, winnerName);
          } catch (e) {
            console.warn('showing finish swal (not committed) failed', e);
          }

          // ensure tournament is marked finished on server (best-effort) and cleanup locally
          try {
            await dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId).update({
              status: 'finished',
              ended: true,
              endedAt: now(),
              endedBy: (getLocalUser && getLocalUser().username) || null
            });
          } catch (e) {}

          // schedule removal after a grace period so clients can observe ended flag
          setTimeout(() => {
            try { dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId).remove().catch(()=>{}); } catch(e) {}
          }, 8000);

          return cleanupLocalTournament();
        }

        // We committed the transaction — canonical finalizer: award stats + mark finished + remove record after delay
        _tournamentFinishedLocally = true;

        // restore menu song
        fadeInMenuSongInterval(1000, 50);

        // stop tournament/duel music if present
        try { if (window.duelSong) { window.duelSong.pause(); window.duelSong.currentTime = 0; } } catch (e) {}

        // award stats (winner + losses for others)
        try {
          if (winnerName) {
            try { await incrementUserStat(winnerName, 'tournamentWins', 1); } catch (e) {}
          }
          const snap = await dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId + '/players').once('value');
          const players = snap.val() || {};
          for (const k of Object.keys(players)) {
            const p = players[k];
            if (!p) continue;
            if (p.username !== winnerName) {
              try { await incrementUserStat(p.username, 'tournamentLosses', 1); } catch (e) {}
            }
          }
        } catch (e) {
          console.warn('award stats failed', e);
        } finally {
          // mark finished + ended flag so clients can detect it
          try {
            await dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId).update({
              status: 'finished',
              ended: true,
              endedAt: now(),
              endedBy: (getLocalUser && getLocalUser().username) || null
            });
          } catch (e) {}

          // remove tournament record after a short grace period (so clients can read ended flag)
          setTimeout(() => {
            try { dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId).remove().catch(()=>{}); } catch(e) {}
          }, 8000);

          // remove any localStorage forfeit keys associated with this tournament
          try { localStorage.removeItem('tournament_forfeit_' + tournamentId); } catch(e){}

          // local notification + sounds: show the same Swal as the duel flow
          try {
            const me = getLocalUser();
            showFinishAlertsForLocalUser(me, winnerName);
          } catch (e) {
            console.warn('showing finish swal (committed) failed', e);
          }

          cleanupLocalTournament();
        }
      }, false);
    } catch (err) {
      console.error('finalizeTournament error', err);
    }
  }

  // push local snapshot under tournament players path
  function pushLocalState(state) {
    if (!localTournamentId || !state) return;
    const me = getLocalUser();
    if (!me) return;
    const safe = safeKey(me.username);
    dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId + '/players/' + safe + '/state').set(state).catch(err => console.error('push tournament state err', err));
    // also mark lastActiveAt and alive status (if isGameOver true)
    const aliveFlag = !(state && state.isGameOver);
    dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId + '/players/' + safe + '/alive').set(aliveFlag).catch(()=>{});
    dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId + '/players/' + safe + '/lastActiveAt').set(now()).catch(()=>{});
  }

  // push initial (or final) state with optional isGameOver
  function reportLocalState(isGameOverFlag) {
    if (!localTournamentId || !tournamentGame) return;
    const snap = tournamentGame.getStateSnapshot();
    if (typeof isGameOverFlag === 'boolean') snap.isGameOver = isGameOverFlag;
    const me = getLocalUser();
    if (!me) return;
    const safe = safeKey(me.username);
    dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId + '/players/' + safe + '/state').set(snap).catch(err => console.error('reportLocalState failed', err));
    dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId + '/players/' + safe + '/alive').set(!snap.isGameOver).catch(()=>{});
    dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId + '/players/' + safe + '/lastActiveAt').set(now()).catch(()=>{});
  }

  // watchdog: detect inactivity and mark player dead if needed
  async function tournamentWatchdog(tournamentId) {
    if (!tournamentId) return;
    try {
      const snap = await dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId + '/players').once('value');
      const players = snap.val() || {};
      const me = getLocalUser();
      if (!me) return;
      const meSafe = safeKey(me.username);
      if (!players[meSafe]) {
        // we're no longer part of it
        cleanupLocalTournament();
        return;
      }
      // check each player for lastActiveAt; if inactive, mark alive false
      for (const k of Object.keys(players)) {
        const p = players[k];
        const lastAt = (p && p.lastActiveAt) || 0;
        if (lastAt && (now() - lastAt) > DUEL_INACTIVITY_MS) {
          // mark them dead (if not already)
          if (p.alive) {
            try { await dbRoot.ref(TOURNAMENTS_PATH + '/' + tournamentId + '/players/' + k + '/alive').set(false); } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.warn('tournament watchdog failed', e);
    }
  }

  // cleanup local tournament UI / listeners
  async function cleanupLocalTournament(forceRemove = false) {
    if (TournamentManager._localDropInterval) { clearInterval(TournamentManager._localDropInterval); TournamentManager._localDropInterval = null; }
    if (_watchdog) { clearInterval(_watchdog); _watchdog = null; }
    try {
      if (playersListener && localTournamentId) {
        dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId + '/players').off('value', playersListener);
      }
    } catch(e) {}
    playersListener = null;
    try {
      if (parentListener && localTournamentId) {
        dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId).off('value', parentListener);
      }
    } catch(e) {}
    parentListener = null;
    if (tournamentGame) { tournamentGame.destroy(); tournamentGame = null; }
    if (tournamentOverlay && tournamentOverlay.element) {
      try { tournamentOverlay.element.parentNode.removeChild(tournamentOverlay.element); } catch (e) {}
      tournamentOverlay = null;
    }
    // clear any local timers
    if (pendingCreateTimer) { clearTimeout(pendingCreateTimer); pendingCreateTimer = null; }
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    if (endedPoll) { clearInterval(endedPoll); endedPoll = null; }

    // If forced, remove tournament record (host should be the one to remove normally)
    if (localTournamentId && forceRemove) {
      try { await dbRoot.ref(TOURNAMENTS_PATH + '/' + localTournamentId).remove(); } catch (e) {}
    }

    // Ensure we aren't still considered queued locally (safety)
    try {
      await _removeLocalTournamentQueueEntryIfAny();
    } catch (e) {}

    // Also be sure local flag cleared
    myTQueueKey = null;
    destroyQueueOverlay();

    localTournamentId = null;
  }

  // start global watcher immediately
  try { watchTournamentsGlobal(); } catch (e) { /* ignore */ }

  // Helper: detect if any local forfeit keys exist (used in recover)
  function hasAnyLocalForfeit() {
    try {
      if (!localStorage) return false;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf && k.indexOf('tournament_forfeit_') === 0) return true;
      }
    } catch (e) {}
    return false;
  }

  // Start local queue watching when page loads in case user was queued previously (recover)
  (async function recoverQueuedState() {
    try {
      // If we have an in-memory key (myTQueueKey persisted?), nothing to do.
      // Otherwise check DB for any entry matching our username and claim it locally.
      const me = getLocalUser();
      if (!me) return;
      const snap = await dbRoot.ref(TOURNAMENT_QUEUE_PATH).once('value');
      const val = snap.val() || {};
      for (const k of Object.keys(val)) {
        const v = val[k];
        if (v && v.username === me.username) {
          // Do not re-adopt if we're already in an active tournament (or we have a pending forfeit)
          try {
            // Check tournaments for membership
            const tSnap = await dbRoot.ref(TOURNAMENTS_PATH).once('value');
            const tVal = tSnap.val() || {};
            let alreadyInTournament = false;
            for (const tid of Object.keys(tVal)) {
              const t = tVal[tid] || {};
              // ignore ended/finished tournaments
              if (t.ended === true || t.status === 'finished' || t.finished) continue;
              const players = t.players || {};
              if (players[safeKey(me.username)]) {
                alreadyInTournament = true;
                break;
              }
            }
            // also respect any localStorage forfeits
            const hasForfeit = hasAnyLocalForfeit();
            if (alreadyInTournament || hasForfeit) {
              // don't adopt a queue key — instead cleanup the queue entry server-side
              try { await dbRoot.ref(TOURNAMENT_QUEUE_PATH + '/' + k).remove(); } catch (e) {}
              continue;
            }
          } catch (e) { /* ignore and fall through */ }

          // adopt this key as ours
          myTQueueKey = k;
          startWatchingQueueLocal();
          break;
        }
      }
    } catch (e) {}
  })();

  // Also watch START node and create-on-ready behavior: when start node changes we check readiness.
  try {
    const startRef = dbRoot.ref(START_DB_PATH);
    startRef.on('value', snap => {
      const sVal = snap.val();
      if (sVal) {
        // update overlay countdown if needed
        ensureQueueOverlay();
        showQueueCountdown(sVal.startAt);
        // if initiator is this client, ensure scheduled create
        if (sVal.initiator === myTQueueKey) {
          scheduleCreateWhenDue(sVal);
        }
        // Check if all ready and maybe create immediately
        checkAllReadyAndMaybeCreate(sVal).catch(()=>{});
      } else {
        // clear countdown UI
        if (queueOverlay) showQueueCountdown(null);
      }
    });
  } catch (e) {}

  // When queue entries change, respond: if we're queued then maybe start as earliest
  try {
    const queueRef = dbRoot.ref(TOURNAMENT_QUEUE_PATH);
    queueRef.on('value', snap => {
      const val = snap.val() || {};
      if (myTQueueKey) {
        ensureQueueOverlay();
        updateQueueOverlay(val);
        maybeInitiateStartIfEarliest(val).catch(()=>{});
      } else {
        // if not queued, but someone else started a start node and we are one of selected and in DB, we should still show UI
        // no-op here, START_DB handler covers countdown/showing
      }
    });
  } catch (e) {}

  // Utility function: If a start node exists and its selected players all have ready true, initiator will create immediately.
  // We already call checkAllReadyAndMaybeCreate from start node and queue listeners.

  // Expose public API
  return {
    joinQueue,
    _localDropInterval: null,
    // Expose function so tests/other code can programmatically remove queue entry
    _removeLocalTournamentQueueEntryIfAny
  };
})();




  // --- DUEL MANAGER ---
// --- REPLACED DUEL MANAGER (drop-in replacement) ---
const DuelManager = (function () {
  const dbRoot = getDB();
  let myQueueKey = null;
  let activeDuelRef = null;      // ref to players (used to listen for opponent state)
  let activeDuelParentRef = null; // ref to parent duel node (used to detect deletion)
  let localDuelId = null;
  let duelGame = null;
  let remoteListener = null;
  let parentListener = null;
  let pushThrottleTimer = null;
  let lastPushAt = 0;
  let opponentId = null; // username of opponent
  let duelOverlay = null;

  function generateSeed() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return String(a[0]);
      }
    } catch (e) { /* ignore */ }
    return String(Math.floor(Math.random() * 0xffffffff));
  }
  // xfnv1a -> 32-bit hash for arbitrary string seeds
  function xfnv1a(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
      h >>>= 0;
    }
    return h >>> 0;
  }
  // mulberry32 PRNG (returns function() -> 0..1)
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61) >>> 0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Prevent joining twice
function joinQueue() {
  const me = getLocalUser();
  if (!me) { Swal.fire('Please sign in to duel'); return; }
  if (myQueueKey) {
    Swal.fire({ title: 'Already queued', text: 'You are already in the duel queue', icon: 'info', timer: 1200, showConfirmButton: false });
    return;
  }

  const qRef = dbRoot.ref(DUEL_QUEUE_PATH).push();
  myQueueKey = qRef.key;
  qRef.set({ username: me.username, joinedAt: now() });

  // show a small notice
  Swal.fire({ title: 'Queued', text: 'Waiting for an opponent…', icon: 'info', timer: 1500, showConfirmButton: false });

  // existing pairing watcher (unchanged)
  watchQueue();

  // attach the overlay watcher so the queue overlay appears while we're queued
  try { _attachQueueOverlayWatcher(); } catch (e) { /* ignore */ }

  // ensure we remove local queue entry on unload (best-effort)
  if (!_beforeUnloadAttached) {
    window.addEventListener('beforeunload', () => { _removeLocalQueueEntryIfAny(); });
    _beforeUnloadAttached = true;
  }
}


// Queue overlay helpers (place inside DuelManager scope)
let _queueOverlayAttached = false;
let _queueOverlayRef = null;
let _queueOverlay = null;
let _beforeUnloadAttached = false;

function _ensureQueueOverlay() {
  if (_queueOverlay) return _queueOverlay;
  const root = document.createElement('div');
  root.id = 'mp-queue-overlay';
  Object.assign(root.style, {
    position: 'fixed', right: '12px', bottom: '12px',
    width: '240px', maxHeight: '60vh', overflowY: 'auto',
    zIndex: 2147483646,
    background: 'linear-gradient(180deg, rgba(6,8,12,0.96), rgba(12,14,20,0.94))',
    border: '1px solid rgba(255,255,255,0.04)', borderRadius: '8px',
    padding: '8px', color: '#fff', fontFamily: 'system-ui, Arial, sans-serif',
    boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
  });

  const title = document.createElement('div');
  title.textContent = 'Duel Queue';
  Object.assign(title.style, { fontWeight: 800, fontSize: '13px', marginBottom: '6px' });
  root.appendChild(title);

  const list = document.createElement('div');
  list.className = 'mp-queue-list';
  root.appendChild(list);

  const hint = document.createElement('div');
  hint.textContent = 'Click × to remove yourself from the queue';
  Object.assign(hint.style, { fontSize: '11px', opacity: 0.8, marginTop: '8px' });
  root.appendChild(hint);

  document.body.appendChild(root);
  _queueOverlay = { root, list, title, hint };
  return _queueOverlay;
}

// destroy the duel/tournament window + any leftover mp-window nodes
window._destroyQueueOverlay = function _destroyQueueOverlay() {
  try {
    // detach firebase listener if present
    try {
      if (_queueOverlayRef && typeof _queueOverlayRef.off === 'function') {
        _queueOverlayRef.off('value');
      }
    } catch (e) { console.warn('_queueOverlayRef.off failed', e); }

    // mark as detached so watcher can reattach later
    _queueOverlayAttached = false;
    _queueOverlayRef = null;

    // if we have an overlay object with a root node, remove it
    try {
      if (_queueOverlay && _queueOverlay.root) {
        const root = _queueOverlay.root;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    } catch (e) { /* ignore */ }

    // remove any leftover DOM overlays (queue overlay + window fallback)
    document.querySelectorAll('.mp-queue-overlay, .mp-window, .mp-queue-overlay-root').forEach(el => {
      try { el.remove(); } catch (err) { /* ignore individual removal errors */ }
    });

    // clear references so GC can collect
    _queueOverlay = null;

    // If currentDropdown is the mp-window object created for queue UI, clear it.
    try {
      if (currentDropdown && currentDropdown.el && currentDropdown.el.classList && currentDropdown.el.classList.contains('mp-window')) {
        currentDropdown = null;
      }
    } catch (e) { /* ignore */ }

    // NOTE: do NOT touch `myQueueKey` here — only clear it where you remove the server entry.
  } catch (err) {
    console.warn('_destroyQueueOverlay top-level error', err);
  }
};



function _renderQueueOverlay(val) {
  const snapshot = val || {};
  const me = getLocalUser();
  const meName = me && me.username;
  const keys = Object.keys(snapshot || {});
  const amQueued = keys.some(k => (snapshot[k] || {}).username === meName);

  // If local user is no longer queued, clear myQueueKey and destroy overlay
  if (myQueueKey && !(snapshot && snapshot[myQueueKey])) {
    // local DB entry disappeared (removed by user or remote) -> clear local marker
    myQueueKey = null;
  }



  const ov = _ensureQueueOverlay();
  const sorted = keys.map(k => ({ key: k, v: snapshot[k] }))
    .filter(x => x.v)
    .sort((a, b) => (a.v.joinedAt || 0) - (b.v.joinedAt || 0));

  ov.list.innerHTML = '';
  sorted.forEach((item, idx) => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: '8px', padding: '6px 4px', borderRadius: '4px'
    });
    if ((item.v.username || '').toLowerCase() === (meName || '').toLowerCase()) {
      row.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))';
    }

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.justifyContent = 'center';
    const name = document.createElement('div');
    name.textContent = item.v.username || 'anon';
    name.style.fontWeight = 700;
    name.style.fontSize = '13px';
    const subt = document.createElement('div');
    subt.style.fontSize = '11px';
    subt.style.opacity = 0.85;
    const d = new Date(item.v.joinedAt || Date.now());
    subt.textContent = `#${idx + 1} • joined ${d.toLocaleTimeString()}`;
    left.appendChild(name);
    left.appendChild(subt);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '6px';

    const rem = document.createElement('button');
    rem.title = 'Remove from queue';
    rem.textContent = '×';
    Object.assign(rem.style, {
      cursor: 'pointer', border: 'none', background: 'transparent',
      color: 'rgba(255,255,255,0.9)', fontSize: '18px', lineHeight: '1',
      padding: '2px 6px', borderRadius: '4px'
    });

    // ONLY allow local user to remove their own entry
    rem.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const currentMe = getLocalUser();
      const currentName = currentMe && currentMe.username;
      if (!currentName) {
        Swal.fire({ title: 'Not signed in', text: 'Sign in to remove your entry', icon: 'info', timer: 1200, showConfirmButton: false });
        return;
      }
      if (item.v.username == currentName) {
                  _destroyQueueOverlay();
        // user tried to remove someone else's entry — don't allow
        Swal.fire({ title: 'Left queue', text: 'You have been removed from the queue', icon: 'success', timer: 1000, showConfirmButton: false });
      }


        await dbRoot.ref(DUEL_QUEUE_PATH + '/' + item.key).remove();

        if (myQueueKey === item.key) myQueueKey = null;

        // optional feedback
    });

    right.appendChild(rem);
    row.appendChild(left);
    row.appendChild(right);
    ov.list.appendChild(row);
  });
}

function _attachQueueOverlayWatcher() {
  if (_queueOverlayAttached) return;
  _queueOverlayAttached = true;
  _queueOverlayRef = dbRoot.ref(DUEL_QUEUE_PATH);
  _queueOverlayRef.on('value', snap => {
    try { _renderQueueOverlay(snap.val()); } catch (e) { console.warn('queue overlay render failed', e); }
  });
}

async function _removeLocalQueueEntryIfAny() {
  try {
    const me = getLocalUser();
    if (!me || !me.username) return;
    // If we have myQueueKey, try remove directly (faster)
    if (myQueueKey) {
      try { await dbRoot.ref(DUEL_QUEUE_PATH + '/' + myQueueKey).remove(); } catch (e) { /* ignore */ }
      myQueueKey = null;
      _destroyQueueOverlay();
      return;
    }
    const snap = await dbRoot.ref(DUEL_QUEUE_PATH).once('value');
    const val = snap.val() || {};
    for (const k of Object.keys(val)) {
      const v = val[k];
      if (v && v.username === me.username) {
        try { await dbRoot.ref(DUEL_QUEUE_PATH + '/' + k).remove(); } catch (e) { /* ignore */ }
        if (myQueueKey === k) myQueueKey = null;
      }
    }
    _destroyQueueOverlay();
  } catch (err) { /* ignore */ }
}


  // Only earliest in queue creates the active duel
  function watchQueue() {
    const qRef = dbRoot.ref(DUEL_QUEUE_PATH);
    qRef.on('value', async snap => {
      const val = snap.val() || {};
      const keys = Object.keys(val);
      if (!myQueueKey) return;
      if (keys.length < 2) return;

      // sort by joinedAt ascending
      const queueAll = keys.sort((a, b) => (val[a].joinedAt || 0) - (val[b].joinedAt || 0));
      // ensure only the earliest node performs the pairing creation
      if (queueAll[0] !== myQueueKey) return;

      // find the first other entry after the earliest
      const pairKey = queueAll.find(k => k !== myQueueKey);
      if (!pairKey) return;

      try {
        const a = val[myQueueKey], b = val[pairKey];
        if (!a || !b) return;

        // Ensure neither player is already in an active duel
        const activeRef = dbRoot.ref(ACTIVE_DUELS_PATH);
        const actSnap = await activeRef.once('value');
        const actVals = actSnap.val() || {};
        for (const duelId in actVals) {
          const duel = actVals[duelId];
          if (duel && duel.players) {
            const ps = Object.values(duel.players).map(p => p.username);
            if (ps.includes(a.username) || ps.includes(b.username)) {
              // somebody already active — bail
              return;
            }
          }
        }

        // create active duel record (both players appear under players)
        const duelRef = dbRoot.ref(ACTIVE_DUELS_PATH).push();
        const duelId = duelRef.key;
        const seed = generateSeed();
        const p1 = { id: myQueueKey, username: a.username, joinedAt: a.joinedAt };
        const p2 = { id: pairKey, username: b.username, joinedAt: b.joinedAt };
        const duelObj = {
          createdAt: now(),
          seed: seed,
          status: 'starting',
          players: {
            [safeKey(p1.username)]: { username: p1.username, joinedAt: p1.joinedAt, lastActiveAt: now(), state: null },
            [safeKey(p2.username)]: { username: p2.username, joinedAt: p2.joinedAt, lastActiveAt: now(), state: null }
          }
        };
        await duelRef.set(duelObj);

        // remove queue entries for both
        await dbRoot.ref(DUEL_QUEUE_PATH + '/' + myQueueKey).remove();
        await dbRoot.ref(DUEL_QUEUE_PATH + '/' + pairKey).remove();

        // start duel locally for the initiator (pass seed)
        startDuelAs(duelId, p1.username, p2.username, seed);
      } catch (err) {
        console.error('pair attempt failed', err);
      }
    });
  }

  // Global watcher: ensures the non-initiating client will also start the duel when an active duel is created for them.
  // Call this once at script init (immediately invoked below).
  function watchActiveDuelsGlobal() {
    const ref = dbRoot.ref(ACTIVE_DUELS_PATH);
    ref.on('child_added', snap => {
      const duelId = snap.key;
      const duel = snap.val();
      if (!duel || !duel.players) return;
      const me = getLocalUser();
      if (!me) return;
      const meSafe = safeKey(me.username);
      if (duel.players[meSafe]) {
        // If we already have localDuelId, ignore to prevent duplicate starts
        if (localDuelId === duelId) return;
        // extract the two usernames and start the duel locally
        const playerKeys = Object.keys(duel.players);
        if (playerKeys.length >= 2) {
          const names = playerKeys.map(k => duel.players[k].username);
          // ensure we pass both usernames (order doesn't matter)
          startDuelAs(duelId, names[0], names[1]).catch(() => { /* swallow */ });
        }
      }
    });
  }

  // Start duel: guard against duplicate starts
  async function startDuelAs(duelId, usernameA, usernameB, seedFromServer) {
          _duelFinishedLocally = false;
      window.tetrisAPI.showMenu();
      
      _destroyQueueOverlay();
              diddyWin = false;
    // prevent double-start on same client
    if (localDuelId) {
      console.warn('startDuelAs called but localDuelId already set. ignoring duplicate start.');
      return;
    }

    localDuelId = duelId;
    const me = getLocalUser();
    if (!me) { console.warn('no local user when starting duel'); return; }
    const meName = me.username;
    opponentId = (meName === usernameA) ? usernameB : usernameA;
    openDuelOverlay(meName, opponentId);

    // Listen to active duel players to show opponent preview
    activeDuelRef = getDB().ref(ACTIVE_DUELS_PATH + '/' + duelId + '/players');
    remoteListener = activeDuelRef.on('value', snap => {
      const players = snap.val() || {};
      const k = safeKey(opponentId);
      const opp = players[k] || {};
      if (opp && opp.state) {
        if (duelOverlay && duelOverlay.rightContainer) {
          showTetrisDueler(duelOverlay.rightContainer, opponentId, opp.state);
        }
        try { if (typeof window.__mp_renderOpponentOnMain === 'function') window.__mp_renderOpponentOnMain(opp.state, opponentId); } catch (e) { }
      } else {
        try { if (typeof window.__mp_clearOpponentOnMain === 'function') window.__mp_clearOpponentOnMain(); } catch (e) { }
      }
      // check for finished games in players' state
      for (const key in players) {
        const p = players[key];
        if (p && p.state && p.state.isGameOver) {
          checkDuelOutcome(players);
        }
      }
    });

    // Also listen for the parent duel node being removed (opponent closed / forced remove)
    activeDuelParentRef = getDB().ref(ACTIVE_DUELS_PATH + '/' + duelId);
    parentListener = activeDuelParentRef.on('value', snap => {
      if (!snap.exists()) {
        // The duel parent record no longer exists — likely opponent forced removal (closed). Treat as opponent left -> you win.
        const meLocal = getLocalUser();
        if (!meLocal) { cleanupLocalDuel(); return; }
        // If duelGame already ended via finishDuel we should not double-award; guard in finishDuel by checking localDuelId
        try {
          finishDuel(meLocal.username, opponentId);
        } catch (e) { /* swallow */ }
      }
    });
    
    
        // fetch seed if not provided
    let seed = seedFromServer;
    if (!seed) {
      try {
        const snap = await getDB().ref(ACTIVE_DUELS_PATH + '/' + duelId).once('value');
        const duel = snap.val() || {};
        if (duel.seed) seed = duel.seed;
      } catch (e) { /* ignore */ }
    }
    if (!seed) seed = 'fallback-' + generateSeed();

    // Countdown
async function showCountdownOverlay(count = 3) {
  return new Promise((resolve) => {
    let current = count;
    Swal.fire({
      title: '',
      html: `
        <div id="mp-countdown"
             style="
                font-size:120px;
                font-weight:900;
                color:#fff;
                text-shadow:0 0 20px rgba(0,0,0,0.8);
                line-height:1;
                letter-spacing:4px;
             ">
          ${current}
        </div>
      `,
      background: 'transparent',
      showConfirmButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      backdrop: 'rgba(0,0,0,0.75)',
didOpen: () => {
  // force z-index and transparent popup
  const swalContainer = document.querySelector('.swal2-container');
  if (swalContainer) swalContainer.style.zIndex = '99999';
  
  const swalPopup = document.querySelector('.swal2-popup');
  if (swalPopup) {
    swalPopup.style.background = 'transparent';
    swalPopup.style.boxShadow = 'none';
    swalPopup.style.overflow = 'hidden'; // prevent scrollbars
  }

  const swalHtml = document.querySelector('.swal2-html-container');
  if (swalHtml) {
    swalHtml.style.overflow = 'hidden';  // prevent scrollbar
    swalHtml.style.padding = '0';        // remove default spacing
    swalHtml.style.margin = '0';
  }

  const container = Swal.getHtmlContainer?.() || swalHtml;
  const el = container ? container.querySelector('#mp-countdown') : null;

  const iv = setInterval(() => {
    current--;
    if (el) {
      el.textContent = String(current > 0 ? current : 'GO!');
      if (current <= 0) {
        el.style.color = '#0f0';
        el.style.fontSize = '140px';
        el.style.transition = 'all 0.3s ease';
      }
    }
    if (current <= 0) {
      clearInterval(iv);
      setTimeout(() => {
        try { Swal.close(); } catch (e) {}
        resolve();
      }, 600);
    }
  }, COUNTDOWN_MS);
}
    });
  });
}

function fadeOutMenuSongInterval(durationMs = 1000, stepMs = 50) {
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  const volStep = (window.menuSong.volume || 1) / steps;
  const id = setInterval(() => {
    const next = Math.max(0, window.menuSong.volume - volStep);
    window.menuSong.volume = next;
    if (next <= 0.0001) {
      clearInterval(id);
      window.menuSong.volume = 0;
      window.menuSong.pause();
      window.menuSong.currentTime = 0;
    }
  }, stepMs);
}

// usage
fadeOutMenuSongInterval(1000, 50);


        let countdownSfx = new Audio("https://codehs.com/uploads/28d03d9824a477eb9158ded1478f7057");
    countdownSfx.play();
    countdownSfx.volume = 0.6;
await showCountdownOverlay(3);

window.duelSong = new Audio("https://codehs.com/uploads/6277e79338f86293e04dea7b84c1486e");
window.duelSong.volume = 0.6;
window.duelSong.loop = true;
window.duelSong.play();




    // create local game instance
    duelGame = new DuelCanvasGame({
      container: duelOverlay.leftContainer,
      onGameOver: (res) => {
        reportLocalState(true);
        finalizeDuelLocalEnded();
      },
      onStateUpdate: (state) => {
        const nowMs = now();
        if (nowMs - lastPushAt > PIECE_PUSH_THROTTLE_MS) {
          pushLocalState(state);
          lastPushAt = nowMs;
        } else {
          if (pushThrottleTimer) clearTimeout(pushThrottleTimer);
          pushThrottleTimer = setTimeout(() => pushLocalState(state), PIECE_PUSH_THROTTLE_MS);
        }
      },
            seed: seed
    });
    duelGame.setName(meName);

    // --- NEW: wire speed change so DuelManager adjusts gravity interval ---
    duelGame.onSpeedChange = (speedMs) => {
      if (DuelManager._localDropInterval) { clearInterval(DuelManager._localDropInterval); DuelManager._localDropInterval = null; }
      DuelManager._localDropInterval = setInterval(() => { if (duelGame) duelGame.drop(false); }, speedMs);
    };

    // start initial gravity using duelGame.fallSpeed (so level affects gravity immediately)
    if (DuelManager._localDropInterval) clearInterval(DuelManager._localDropInterval);
    DuelManager._localDropInterval = setInterval(() => { if (duelGame) duelGame.drop(false); }, duelGame.fallSpeed);

    // start watchdog to detect inactivity
    DuelManager._watchdog = setInterval(checkOpponentActivity, 1500);

    // Immediately push an initial state for ourselves
    reportLocalState(false);
  }

  function checkDuelOutcome(players) {
    const keys = Object.keys(players);
    if (keys.length < 2) return;
    const pA = players[keys[0]].state || {};
    const pB = players[keys[1]].state || {};
    if (pA.isGameOver && pB.isGameOver) {
      const winnerIsA = (pA.lines || 0) > (pB.lines || 0);
      const winnerKey = winnerIsA ? keys[0] : keys[1];
      const loserKey = winnerIsA ? keys[1] : keys[0];
      const winnerName = players[winnerKey].username;
      const loserName = players[loserKey].username;
      finishDuel(winnerName, loserName);
    } else if (pA.isGameOver && !pB.isGameOver) {
      const winnerName = players[keys[1]].username;
      const loserName = players[keys[0]].username;
      finishDuel(winnerName, loserName);
    } else if (pB.isGameOver && !pA.isGameOver) {
      const winnerName = players[keys[0]].username;
      const loserName = players[keys[1]].username;
      finishDuel(winnerName, loserName);
    }
  }
 




async function finishDuel(winnerName, loserName) {
  if (diddyWin) { return; } 
  diddyWin = true;

  try {
    // local guard to avoid re-processing on this client
    if (_duelFinishedLocally) return;

    // require a duel id (prefer localDuelId)
    const duelId = localDuelId;
    if (!duelId) {
      console.warn('finishDuel: no localDuelId found — aborting to avoid duplicates');
      return;
    }

    // helper fade-in function exactly as your original
    function fadeInMenuSongInterval(durationMs = 1000, stepMs = 50) {
      const steps = Math.max(1, Math.round(durationMs / stepMs));
      const volStep = (0.01) * steps;
      const id = setInterval(() => {
        const next = Math.max(0, (window.menuSong && window.menuSong.volume) ? window.menuSong.volume + volStep : volStep);
        try { if (window.menuSong) window.menuSong.volume = next; } catch (e) {}
        if (next <= 0.6) {
          clearInterval(id);
          try {
            if (window.menuSong) {
              window.menuSong.volume = 0.6;
              window.menuSong.play();
            }
          } catch (e) {}
        }
      }, stepMs);
    }

    // helper to show appropriate audio + sweetalert for the local user
    function showFinishAlertsForLocalUser(me, winnerNameLocal, loserNameLocal) {
      try {
        if (!me) return;
        if (me.username === winnerNameLocal) {
          try { new Audio("https://codehs.com/uploads/b9c961b3ed77751ef2f04b1540e954de").play(); } catch (e) {}
          Swal.fire({
            title: 'You won!',
            text: `You defeated ${loserNameLocal}`,
            icon: 'success'
          });
        } else if (me.username === loserNameLocal) {
          try { new Audio("https://codehs.com/uploads/eb23c4aab950e9e55b24a4a9f49d915b").play(); } catch (e) {}
          Swal.fire({
            title: 'You lost',
            text: `Winner: ${winnerNameLocal}`,
            icon: 'error'
          });
        }
      } catch (e) {
        console.warn('showFinishAlertsForLocalUser failed', e);
      }
    }

    const finishedRef = getDB().ref(ACTIVE_DUELS_PATH + '/' + duelId + '/finished');

    // Atomic transaction: only one client wins this commit
    finishedRef.transaction(current => {
      if (current && current.winner) {
        // another client already finished it — abort
        return;
      }
      return { winner: winnerName, loser: loserName, at: now() };
    }, async (err, committed/*bool*/, snapshot) => {
      if (err) {
        console.error('finishDuel transaction error', err);
        return;
      }

      // Always mark local as finished to avoid re-processing UI
      _duelFinishedLocally = true;

      // restore menu song (your original behavior)
      fadeInMenuSongInterval(1000, 50);

      // stop duel music
      try { if (window.duelSong) { window.duelSong.pause(); window.duelSong.currentTime = 0; } } catch (e) {}

      // if someone else already finished it — do local UI cleanup but DO NOT award
      if (!committed) {
        // show UI to local user (best-effort)
        try {
          const me = getLocalUser();
          showFinishAlertsForLocalUser(me, winnerName, loserName);
        } catch (e) {
          console.warn('showing finish swal (not committed) failed', e);
        }

        // mark duel as finished status on server (best-effort)
        try { await getDB().ref(ACTIVE_DUELS_PATH + '/' + duelId).update({ status: 'finished', endedAt: now() }); } catch (e) {}

        return cleanupLocalDuel();
      }

      // We committed the transaction — canonical finisher (this client)
      // award stats (only the client that committed the transaction executes this)
      try {
        await incrementUserStat(winnerName, 'duelWins', 1);
        await incrementUserStat(loserName, 'duelLosses', 1);
      } catch (e) { console.warn('award failed', e); }

      // remove active duel record (matching your original)
      try { await getDB().ref(ACTIVE_DUELS_PATH + '/' + duelId).remove(); } catch (e) { /* ignore */ }

      // local UI + sounds: show Swal to local user (winner or loser)
      try {
        const me = getLocalUser();
        showFinishAlertsForLocalUser(me, winnerName, loserName);
      } catch (e) {
        console.warn('showing finish swal (committed) failed', e);
      }

      // cleanup local duel
      cleanupLocalDuel();
    }, false);
  } catch (err) {
    console.error('finishDuel error', err);
  }
}



  function finalizeDuelLocalEnded() {
    reportLocalState(true);
  }

  function reportLocalState(isGameOverFlag) {
    if (!localDuelId || !duelGame) return;
    const snap = duelGame.getStateSnapshot();
    if (typeof isGameOverFlag === 'boolean') snap.isGameOver = isGameOverFlag;
    const me = getLocalUser();
    if (!me) return;
    const safe = safeKey(me.username);
    const ref = getDB().ref(ACTIVE_DUELS_PATH + '/' + localDuelId + '/players/' + safe + '/state');
    ref.set(snap).catch(err => console.error('push local state failed', err));
  }
  function pushLocalState(state) {
    if (!localDuelId || !state) return;
    const me = getLocalUser();
    if (!me) return;
    const safe = safeKey(me.username);
    getDB().ref(ACTIVE_DUELS_PATH + '/' + localDuelId + '/players/' + safe + '/state').set(state).catch(err => console.error('push state err', err));
  }

  // watchdog:
  async function checkOpponentActivity() {
    if (!localDuelId) return;
    try {
      const snap = await getDB().ref(ACTIVE_DUELS_PATH + '/' + localDuelId + '/players').once('value');
      const players = snap.val() || {};
      const me = getLocalUser();
      if (!me) return;
      const meKey = safeKey(me.username);
      const allKeys = Object.keys(players || {});
      // find otherKey (if present)
      const otherKey = allKeys.find(k => k !== meKey);
      if (!otherKey) {
        // opponent missing -> treat as left/closed, award win to local
        await finishDuel(me.username, opponentId || 'opponent');
        return;
      }
      const other = players[otherKey];
      const otherState = other && other.state;
      if (!otherState || !otherState.lastActiveAt) {
        return;
      }
      const lastAt = otherState.lastActiveAt || 0;
      const elapsed = now() - lastAt;
      if (elapsed > DUEL_INACTIVITY_MS) {
        const meName = me.username;
        const oppName = other.username;
        await finishDuel(meName, oppName);
      }
    } catch (err) {
      console.warn('watchdog failed', err);
    }
  }

  function openDuelOverlay(localName, remoteName) {
    const ov = document.createElement('div');
    ov.style.position = 'fixed';
    ov.style.left = '50%'; ov.style.top = '50%';
    ov.style.transform = 'translate(-50%,-50%)';
    ov.style.zIndex = 2147;
    ov.style.padding = '12px';
    ov.style.borderRadius = '8px';
    ov.style.background = 'rgba(6,8,12,0.96)';
    ov.style.border = '1px solid rgba(255,255,255,0.04)';
    ov.style.display = 'flex';
    ov.style.gap = '12px';
    ov.style.alignItems = 'center';

    const left = document.createElement('div');
    const right = document.createElement('div');
    // make each player container a horizontal layout (canvas + sidebar)
    left.style.display = right.style.display = 'flex';
    left.style.flexDirection = right.style.flexDirection = 'row';
    left.style.alignItems = right.style.alignItems = 'flex-start';
    left.style.gap = right.style.gap = '6px';

    const vs = document.createElement('div');
    vs.textContent = 'VS';
    vs.style.color = '#fff';
    vs.style.fontWeight = '900';
    vs.style.fontSize = '14px';
    vs.style.marginTop = '12px';

    ov.appendChild(left);
    ov.appendChild(vs);
    ov.appendChild(right);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Quit';
    Object.assign(closeBtn.style, { position: 'absolute', right: '10px', top: '6px', cursor: 'pointer' });
    closeBtn.addEventListener('click', () => {
      // player chose to quit: remove active duel record and cleanup
                  window.menuSong.volume = 0.6;
      window.menuSong.play();
      
      window.duelSong.pause();
      window.duelSong.currentTime = 0;
      cleanupLocalDuel(true);
    });
    ov.appendChild(closeBtn);

    document.body.appendChild(ov);

    duelOverlay = {
      element: ov,
      leftContainer: left,
      rightContainer: right
    };
  }

  async function cleanupLocalDuel(forceRemove = false) {
    if (DuelManager._localDropInterval) { clearInterval(DuelManager._localDropInterval); DuelManager._localDropInterval = null; }
    if (DuelManager._watchdog) { clearInterval(DuelManager._watchdog); DuelManager._watchdog = null; }
    if (activeDuelRef && remoteListener) {
      try { getDB().ref(ACTIVE_DUELS_PATH + '/' + localDuelId + '/players').off('value', remoteListener); } catch (e) { }
      remoteListener = null;
      activeDuelRef = null;
    }
    if (activeDuelParentRef && parentListener) {
      try { activeDuelParentRef.off('value', parentListener); } catch (e) { }
      parentListener = null;
      activeDuelParentRef = null;
    }
    if (duelGame) { duelGame.destroy(); duelGame = null; }
    if (duelOverlay && duelOverlay.element) {
      try { duelOverlay.element.parentNode.removeChild(duelOverlay.element); } catch (e) { }
      duelOverlay = null;
    }
    if (typeof window.__mp_clearOpponentOnMain === 'function') window.__mp_clearOpponentOnMain();
    // remove active duel record if forced (player quit)
    if (localDuelId && forceRemove) {
      try { await getDB().ref(ACTIVE_DUELS_PATH + '/' + localDuelId).remove(); } catch (e) { }
    }
    localDuelId = null;
        _duelFinishedLocally = false;
    opponentId = null;
    try { getDB().ref(DUEL_QUEUE_PATH).off(); } catch (e) { }
    myQueueKey = null;
  }

  // start global watcher now
  try { watchActiveDuelsGlobal(); } catch (e) { /* ignore */ }

  return {
    joinQueue,
    _localDropInterval: null,
    _watchdog: null
  };
})();


  // --- TOURNAMENT MANAGER ---
  // ... (no changes from your original for brevity; omitted for this fix)

  // --- final notes logging ---
  console.log('multiplayer.js loaded: Duel & Tournament features attached.');
})();


// --- Insert after showTetrisDueler() function (unchanged) ---