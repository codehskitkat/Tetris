// game.js — Updated Tetris (HUD replicated to match original layout + cool CSS)
// Drop-in replacement for your original game.js

(() => {
  // ——— GLOBALS ———
  let startBtnBounds;     // Main‐menu "Start Tetris" button bounds
  let menuBtnBounds;      // In‐game "Menu" button bounds
  let gameInterval = null;
  let fallSpeed = 500;    // Milliseconds between automatic drops
  let drawnShapes = [];   // All shapes drawn by drawGrid (for removal)
  let startingLevel = 1;
  const GRID_WIDTH = 10;
  const GRID_HEIGHT = 20;
  const CELL_SIZE = 30;
  
let linesClearedThisLevel = 0; // Tracks lines cleared since the last level-up
const linesNeededForLevelUp = 10; // The number of lines needed to level up

function makeImageButton({ imageUrl, x, y, w, h, onClick, hoverScale = 1.1 }) {
  // global registry for buttons + single dispatcher installation
  window.__imageButtons = window.__imageButtons || [];

  // create visible image
  const img = new WebImage(imageUrl);
  img.setSize(w, h);
  img.setPosition(x, y);
  add(img);

  // invisible rectangle to keep object count & (optionally) for hit-testing if you prefer
  const rect = new Rectangle(w, h);
  rect.setPosition(x, y);
  rect.setColor("rgba(0,0,0,0)");
  add(rect);

  const btnObj = {
    img, rect, x, y, w, h,
    onClick, hoverScale, origW: w, origH: h,
    _hover: false,
    setPosition: (nx, ny) => {
      btnObj.x = nx; btnObj.y = ny;
      img.setPosition(nx, ny);
      rect.setPosition(nx, ny);
    },
    remove: () => {
      const i = window.__imageButtons.indexOf(btnObj);
      if (i !== -1) window.__imageButtons.splice(i, 1);
      try { remove(img); } catch(e) {}
      try { remove(rect); } catch(e) {}
    }
  };

  window.__imageButtons.push(btnObj);

  // install central click + hover dispatchers once (and keep references so they can be rebound)
  if (!window.__imageButtonsDispatcherInstalled) {
    // click dispatcher: call topmost matching button (reverse so newest overlays older)
    window.__imageButtonsClickDispatcher = function (e) {
      const mx = e.getX(), my = e.getY();
      const list = window.__imageButtons.slice().reverse();
      for (let btn of list) {
        if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
          try { if (typeof btn.onClick === 'function') btn.onClick(btn); } catch (err) { console.error(err); }
          break;
        }
      }
    };
    try { mouseClickMethod(window.__imageButtonsClickDispatcher); } catch(e) { /* tolerant */ }

    // hover dispatcher: grow/shrink image
    window.__imageButtonsHoverDispatcher = function (e) {
      const mx = e.getX(), my = e.getY();
      for (let btn of window.__imageButtons) {
        const inside = (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h);
        if (inside && !btn._hover) {
          btn._hover = true;
          const newW = btn.origW * btn.hoverScale;
          const newH = btn.origH * btn.hoverScale;
          btn.img.setSize(newW, newH);
          btn.img.setPosition(btn.x - (newW - btn.origW)/2, btn.y - (newH - btn.origH)/2);
        } else if (!inside && btn._hover) {
          btn._hover = false;
          btn.img.setSize(btn.origW, btn.origH);
          btn.img.setPosition(btn.x, btn.y);
        }
      }
    };
    try { mouseMoveMethod(window.__imageButtonsHoverDispatcher); } catch(e) { /* tolerant */ }

    window.__imageButtonsDispatcherInstalled = true;
  }

  // return the full button object (includes x,y,w,h + helpers)
  return btnObj;
}
// --- end helper ---

function playDrippyShoes() {
    let calebAntonioRuthDiaz = new Audio("https://codehs.com/uploads/b4c98f373b2ff8b18559607a22797050");
    calebAntonioRuthDiaz.play();
}

function playMovePieceSfx() {
    const movePieceSfx = new Audio("https://codehs.com/uploads/9719a2ca8db05076dcbfbf418bf53294");
    movePieceSfx.preload = "auto";
    movePieceSfx.volume = 0.6;
    movePieceSfx.play();
}


function playHardDropSfx() {
    const hardDropSfx = new Audio("https://codehs.com/uploads/0e80cd439832c2f7035e7b25f70c04f3");
    hardDropSfx.preload = "auto";
    hardDropSfx.volume = 0.6;
    hardDropSfx.play();
}

function playDeathSfx() {
    const deathSfx = new Audio("https://codehs.com/uploads/eb23c4aab950e9e55b24a4a9f49d915b");
    deathSfx.preload = "auto";
    deathSfx.volume = 0.6;
    deathSfx.play();
}


function playOneLineClearSfx() {
    const oneLineClearSfx = new Audio("https://codehs.com/uploads/359a7cac0155bce37dc1e3ebeb4593f8");
    oneLineClearSfx.preload = "auto";
    oneLineClearSfx.volume = 0.6; 
    oneLineClearSfx.play();
}

function playTwoLineClearSfx() {
    const twoLineClearSfx = new Audio("https://codehs.com/uploads/679684299960679023a3cc7a1693fe32");
    twoLineClearSfx.preload = "auto";
    twoLineClearSfx.volume = 0.6; 
    twoLineClearSfx.play();
}

function playThreeLineClearSfx() {
    const threeLineClearSfx = new Audio("https://codehs.com/uploads/5cdf041be591135cba385d3dce72f86b");
    threeLineClearSfx.preload = "auto";
    threeLineClearSfx.volume = 0.6; 
    threeLineClearSfx.play();
}

function playFourLineClearSfx() {
    const fourLineClearSfx = new Audio("https://codehs.com/uploads/be96b0a77254f21878d41f381cb28adb");
    fourLineClearSfx.preload = "auto";
    fourLineClearSfx.volume = 0.6; 
    fourLineClearSfx.play();
}

// if you only target browsers, this is fine:
window.menuSong = new Audio("https://codehs.com/uploads/62259bb39d127201d01804cdc76d3ba2");
window.menuSong.preload = "auto";
window.menuSong.volume = 0.6;







setInterval(() => {
  if (window.menuSong.currentTime >= window.menuSong.duration - 4.1) {
    window.menuSong.currentTime = window.menuSong.duration / 2 - 2;
  }
}, 50);



window.menuSongPlayed = false;

const TETROMINOS_90_DEGREE = {
  I: [
    // 0°
    [[1,1,1,1]],
    // 90°
    [[1],[1],[1],[1]],
    // 180°
    [[1,1,1,1]],
    // 270°
    [[1],[1],[1],[1]]
  ],
  O: [
    // 0°
    [[1,1],[1,1]],
    // 90°
    [[1,1],[1,1]],
    // 180°
    [[1,1],[1,1]],
    // 270°
    [[1,1],[1,1]]
  ],
  T: [
    // 0°
    [[0,1,0],[1,1,1]],
    // 90°
    [[1,0],[1,1],[1,0]],
    // 180°
    [[1,1,1],[0,1,0]],
    // 270°
    [[0,1],[1,1],[0,1]]
  ],
  J: [
    // 0°
    [[1,0,0],[1,1,1]],
    // 90°
    [[1,1],[1,0],[1,0]],
    // 180°
    [[1,1,1],[0,0,1]],
    // 270°
    [[0,1],[0,1],[1,1]]
  ],
  L: [
    // 0°
    [[0,0,1],[1,1,1]],
    // 90°
    [[1,0],[1,0],[1,1]],
    // 180°
    [[1,1,1],[1,0,0]],
    // 270°
    [[1,1],[0,1],[0,1]]
  ],
  S: [
    // 0°
    [[1,1,0],[0,1,1]],
    // 90°
    [[0,1],[1,1],[1,0]],
    // 180°
    [[1,1,0],[0,1,1]],
    // 270°
    [[0,1],[1,1],[1,0]]
  ],
  Z: [
    // 0°
    [[0,1,1],[1,1,0]],
    // 90°
    [[1,0],[1,1],[0,1]],
    // 180°
    [[0,1,1],[1,1,0]],
    // 270°
    [[1,0],[1,1],[0,1]]
  ]
};

  let COLORS = [
      Color.CYAN,   // I
      Color.YELLOW, // O
      Color.PURPLE, // T
      Color.BLUE,   // J
      Color.ORANGE, // L
      Color.GREEN,  // S
      Color.RED     // Z
  ];

  const TETROMINO_TYPES = Object.keys(TETROMINOS_90_DEGREE);
  const DEFAULT_TETROMINO_COLORS = COLORS.slice();
  const TETROMINO_COLOR_STORAGE_KEY = 'tetris_tetromino_colors';
  const TETROMINO_MODE_STORAGE_KEY = 'tetris_tetromino_mode';
  const RGB_TETROMINO_COLORS = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#8000ff', '#ff1493'];
  const RGB_TETROMINO_SPEED_STORAGE_KEY = 'tetris_rgb_cycle_ms';
  const RGB_AFTER_PLACE_STORAGE_KEY = 'tetris_rgb_after_place_cycle';
  const CUSTOM_CYCLE_STORAGE_KEY = 'tetris_custom_cycle_v1';
  let rgbCycleMs = 140;
  let rgbMode = false;
  let rgbCycleAfterPlace = false;
  let customCycleColors = [];
  let customCycleEnabled = false;

  function clampRgbSpeed(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return 140;
    return Math.max(60, Math.min(1000, Math.round(n)));
  }

  function setRgbCycleMs(ms) {
    rgbCycleMs = clampRgbSpeed(ms);
    window.__tetrominoRgbSpeed = rgbCycleMs;
    try { localStorage.setItem(RGB_TETROMINO_SPEED_STORAGE_KEY, String(rgbCycleMs)); } catch (e) {}
    return rgbCycleMs;
  }

  function setTetrominoMode(mode) {
    rgbMode = (mode === 'rgb');
    window.__tetrominoMode = rgbMode ? 'rgb' : 'static';
    try { localStorage.setItem(TETROMINO_MODE_STORAGE_KEY, window.__tetrominoMode); } catch (e) {}
  }

  function setRgbCycleAfterPlace(enabled) {
    rgbCycleAfterPlace = !!enabled;
    window.__tetrominoRgbAfterPlace = rgbCycleAfterPlace;
    try { localStorage.setItem(RGB_AFTER_PLACE_STORAGE_KEY, rgbCycleAfterPlace ? '1' : '0'); } catch (e) {}
    return rgbCycleAfterPlace;
  }

  function shouldAnimateRgbBoard() {
    return gameActive && (!paused || rgbCycleAfterPlace);
  }

  function isRgbCell(cell) {
    return !!(cell && typeof cell === 'object' && cell.__rgbCell);
  }

  function getGridCellColor(cell) {
    if (!cell) return cell;
    if (isRgbCell(cell)) {
      return getRgbColorForType(cell.type);
    }
    if (typeof cell === 'object') {
      return typeof cell.color === 'string' ? cell.color : (cell.baseColor || 'gray');
    }
    return cell;
  }

  function getRgbColorForType(type) {
    const idx = TETROMINO_TYPES.indexOf(type);
    if (idx < 0) return 'gray';
    const step = Math.floor(Date.now() / rgbCycleMs);
    const palette = (customCycleEnabled && customCycleColors.length > 0)
      ? customCycleColors
      : RGB_TETROMINO_COLORS;
    return palette[(step + idx) % palette.length];
  }


  function normalizeTetrominoColors(input) {
    const fallback = DEFAULT_TETROMINO_COLORS.slice();
    if (!Array.isArray(input)) return fallback;
    return fallback.map((def, i) => {
      const value = input[i];
      return (typeof value === 'string' && value.trim()) ? value.trim() : def;
    });
  }

  function getTetrominoColorForType(type) {
    if (rgbMode) return getRgbColorForType(type);
    const idx = TETROMINO_TYPES.indexOf(type);
    return COLORS[idx] ?? 'gray';
  }

  function applyTetrominoColorsToPieces() {
    try {
      if (currentPiece && currentPiece.type) currentPiece.color = getTetrominoColorForType(currentPiece.type);
      if (nextPiece && nextPiece.type) nextPiece.color = getTetrominoColorForType(nextPiece.type);
      if (holdPiece && holdPiece.type) holdPiece.color = getTetrominoColorForType(holdPiece.type);
    } catch (e) {}
    try {
      if (window.__tetrisHUD && typeof window.__tetrisHUD.drawNext === 'function') window.__tetrisHUD.drawNext(nextPiece);
      if (window.__tetrisHUD && typeof window.__tetrisHUD.drawHold === 'function') window.__tetrisHUD.drawHold(holdPiece);
    } catch (e) {}
    // Only redraw the board during active gameplay.
    // When the player is back in the menu, this prevents the last game frame from being repainted over the UI.
    try {
      if (shouldAnimateRgbBoard() && typeof currentPiece !== 'undefined' && currentPiece && typeof drawGrid === 'function') {
        drawGrid();
      }
    } catch (e) {}
  }

  try {
    const savedTetrominoColors = JSON.parse(localStorage.getItem(TETROMINO_COLOR_STORAGE_KEY) || 'null');
    if (savedTetrominoColors) COLORS = normalizeTetrominoColors(savedTetrominoColors);
  } catch (e) {}
  try {
    const savedMode = localStorage.getItem(TETROMINO_MODE_STORAGE_KEY);
    setTetrominoMode(savedMode === 'rgb' ? 'rgb' : 'static');
  } catch (e) {
    setTetrominoMode('static');
  }
  try {
    const savedRgbSpeed = localStorage.getItem(RGB_TETROMINO_SPEED_STORAGE_KEY);
    setRgbCycleMs(savedRgbSpeed != null ? savedRgbSpeed : rgbCycleMs);
  } catch (e) {
    setRgbCycleMs(rgbCycleMs);
  }
  try {
    const savedAfterPlace = localStorage.getItem(RGB_AFTER_PLACE_STORAGE_KEY);
    setRgbCycleAfterPlace(savedAfterPlace === '1' || savedAfterPlace === 'true');
  } catch (e) {
    setRgbCycleAfterPlace(false);
  }
  try {
    const savedCycle = JSON.parse(localStorage.getItem(CUSTOM_CYCLE_STORAGE_KEY) || 'null');
    if (savedCycle && Array.isArray(savedCycle.colors) && savedCycle.colors.length > 0) {
      customCycleColors = savedCycle.colors.filter(c => typeof c === 'string' && c.startsWith('#'));
      customCycleEnabled = !!savedCycle.enabled;
      if (customCycleEnabled) setTetrominoMode('rgb');
    }
  } catch (e) {}

  window.__tetrominoPieceTypes = TETROMINO_TYPES.slice();
  window.__tetrominoDefaultColors = DEFAULT_TETROMINO_COLORS.slice();
  window.__tetrominoRgbColors = RGB_TETROMINO_COLORS.slice();
  window.__tetrominoRgbSpeed = rgbCycleMs;
  window.__tetrominoMode = rgbMode ? 'rgb' : 'static';
  window.__tetrominoColors = COLORS.slice();
  window.__getTetrominoColors = function() {
    return COLORS.slice();
  };
  window.__setTetrominoColors = function(nextColors, options = {}) {
    COLORS = normalizeTetrominoColors(nextColors);
    window.__tetrominoColors = COLORS.slice();
    try { localStorage.setItem(TETROMINO_COLOR_STORAGE_KEY, JSON.stringify(COLORS)); } catch (e) {}
    if (typeof options.rgbMode === 'boolean') {
      setTetrominoMode(options.rgbMode ? 'rgb' : 'static');
    }
    try { localStorage.setItem(TETROMINO_MODE_STORAGE_KEY, window.__tetrominoMode || 'static'); } catch (e) {}
    if (!options.silent) applyTetrominoColorsToPieces();
    return COLORS.slice();
  };
  window.__setTetrominoRgbSpeed = function(ms) {
    return setRgbCycleMs(ms);
  };
  window.__getTetrominoRgbSpeed = function() {
    return rgbCycleMs;
  };
  window.__setTetrominoRgbAfterPlace = function(enabled) {
    return setRgbCycleAfterPlace(enabled);
  };
  window.__getTetrominoRgbAfterPlace = function() {
    return rgbCycleAfterPlace;
  };
  window.__setCustomCycle = function(colors, enabled) {
    customCycleColors = Array.isArray(colors) ? colors.filter(c => typeof c === 'string' && c.startsWith('#')) : customCycleColors;
    customCycleEnabled = !!enabled;
    if (customCycleEnabled) setTetrominoMode('rgb');
    try { localStorage.setItem(CUSTOM_CYCLE_STORAGE_KEY, JSON.stringify({ colors: customCycleColors, enabled: customCycleEnabled })); } catch (e) {}
    applyTetrominoColorsToPieces();
  };
  window.__getCustomCycle = function() {
    return { colors: customCycleColors.slice(), enabled: customCycleEnabled };
  };
  window.__tetrominoPresets = {
    default: DEFAULT_TETROMINO_COLORS.slice(),
    neon: ['#00e5ff', '#fff44f', '#d946ef', '#3b82f6', '#ff8a00', '#35f28c', '#ff4d4d'],
    rgb: RGB_TETROMINO_COLORS.slice(),
    retro: ['#4dd0e1', '#f5d76e', '#b39ddb', '#6c8cff', '#ffb347', '#8fd694', '#ff7f7f']
  };

  // ——— HUD & GRID COLOR CALLBACKS ———
  window.__tetrisUpdateHudColor = function(color) {
    if (color !== undefined) window.__tetrisHudColor = color;
    if (hudPanelShape) hudPanelShape.setColor(window.__tetrisHudColor || Color.BLUE);
    try {
      const gameCanvas = document.getElementById('game');
      const ctx = gameCanvas && gameCanvas.getContext && gameCanvas.getContext('2d');
      if (!gameActive && ctx && gameCanvas) {
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
      } else if (typeof drawGrid === 'function') {
        drawGrid();
      }
    } catch (e) {}
  };
  window.__tetrisRedrawGrid = function() {
    try {
      const gameCanvas = document.getElementById('game');
      const ctx = gameCanvas && gameCanvas.getContext && gameCanvas.getContext('2d');
      if (!gameActive && ctx && gameCanvas) {
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        return;
      }
    } catch (e) {}
    if (typeof drawGrid === 'function') drawGrid();
  };

  let grid, currentPiece, nextPiece;
  let linesCleared = 0, level = 1, isGameOver = false, score = 0;
  window.level = level
  let paused = false, pauseText = null;
  let gameActive = false;

  // Hold variables
  let holdPiece = null;   // { shape: [...], color: ... } or null
  let holdUsed = false;   // true if player has used hold for the currently active piece (prevents repeat holds until piece placed)
  let rgbAnimationTicker = null;
  let hudPanelShape = null; // module-level reference to the HUD side panel rectangle

  // === REPEAT: immediate continuous move while key held ===
  const KEY_REPEAT_INTERVAL = 100; // ms between repeated moves (tweak for feel)
  let repeatIntervals = {}; // key string -> interval id
  let keyHeld = {}; // key string -> bool

  // ensure we only register keyup once
  let keyUpRegistered = false;

  function startRgbTicker() {
    if (rgbAnimationTicker) return;
    rgbAnimationTicker = setInterval(() => {
      if (!rgbMode) return;
      if (shouldAnimateRgbBoard()) {
        applyTetrominoColorsToPieces();
      }
    }, 60);
  }
  startRgbTicker();

  function startRepeat(keyCode, action) {
      if (keyHeld[keyCode]) return;
      keyHeld[keyCode] = true;
      action();
      repeatIntervals[keyCode] = setInterval(() => {
          if (!keyHeld[keyCode]) {
              clearInterval(repeatIntervals[keyCode]);
              delete repeatIntervals[keyCode];
              return;
          }
          action();
      }, KEY_REPEAT_INTERVAL);
  }

  function stopRepeat(keyCode) {
      keyHeld[keyCode] = false;
      if (repeatIntervals[keyCode]) {
          clearInterval(repeatIntervals[keyCode]);
          delete repeatIntervals[keyCode];
      }
  }
  
window.tryPlayMenuSong = function tryPlayMenuSong() {
  if (window.menuSongPlayed) return;
  window.menuSongPlayed = true;

  // attempt to play; catch any Promise rejection (some browsers still block)
  window.menuSong.play().catch(err => {
    console.warn("menuSong.play() failed:", err);
      window.menuSongPlayed = false;
    // It's fine — the user gesture happened, so future gesture should succeed.
  });
}

// Add lightweight listeners that run once and then remove themselves.
// Using pointerdown covers mouse/touch/pen in most modern browsers.
document.addEventListener("pointerdown", tryPlayMenuSong, { once: true });
document.addEventListener("touchstart", tryPlayMenuSong, { once: true }); // older mobile fallback
document.addEventListener("keydown", tryPlayMenuSong, { once: true });    // keyboard first interaction

  function clearAllRepeats() {
      for (let k in repeatIntervals) {
          clearInterval(repeatIntervals[k]);
      }
      repeatIntervals = {};
      keyHeld = {};
  }
  // === END REPEAT ===

  // ——— HOVER VARIABLES ———
  let startImg;            // the WebImage for "Click to Start"
  let imgOrigW, imgOrigH;  // to remember its original size
  let hoverGrow = false;   // are we currently "grown"?

  // ensure canvas exists
  const c = document.querySelector("canvas#game") || document.querySelector("canvas");
  if (!c) throw new Error("Canvas element is required (id=game)");

  // -------------- HUD: create (hidden in menu) ----------------
  (function createHUD() {
    if (window.__tetrisHUDCreated) return;
    window.__tetrisHUDCreated = true;

    // inject compact HUD CSS that mirrors the original panel layout (100px panel)
    const css = `
:root {
  --hud-w: 100px;
  --hud-pad: 8px;
  --hud-bg: rgba(8,10,14,0.78);
  --accent: linear-gradient(180deg,#6ee7b7,#7dd3fc);
  --glass-border: rgba(255,255,255,0.06);
  --cell-size: ${CELL_SIZE}px;
}
#tetris-hud-overlay { position: fixed; left:0; top:0; width:0; height:0; pointer-events:none; z-index:9998; }
#tetris-hud {
  pointer-events: auto;
  position: absolute;
  width: calc(var(--hud-w));
  min-height: 140px;
  padding: var(--hud-pad);
  box-sizing: border-box;
  border-radius: 6px;
  color: #eef2f7;
  border: 1px solid var(--glass-border);
  font-family: "Segoe UI", Roboto, system-ui, -apple-system, Arial;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap:6px;
  align-items: flex-start;
  justify-content: flex-start;
}
#tetris-hud .next-label { font-weight:600; font-size:11px; opacity:0.9; margin-bottom:4px; }
#hud-next-canvas { width: calc(var(--cell-size) * 2.5); height: calc(var(--cell-size) * 2.5); border-radius:4px; background: rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.03); }
#hud-hold-canvas { width: calc(var(--cell-size) * 2.5); height: calc(var(--cell-size) * 2.5); border-radius:4px; background: rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.03); }
.hud-row { width:100%; display:flex; justify-content:space-between; align-items:center; }
.hud-row .label { color: rgba(255,255,255,0.78); font-size:11px; }
.hud-row .value { font-weight:800; font-size:15px; color:#fff; text-shadow: 0 6px 18px rgba(125,211,252,0.04); }
.hud-levelbar { width:100%; height:6px; background: rgba(255,255,255,0.03); border-radius:4px; overflow:hidden; border:1px solid rgba(255,255,255,0.02); }
.hud-levelbar .fill { height:100%; width:0%; background: linear-gradient(90deg,#6ee7b7,#7dd3fc); transition: width 280ms ease; }
.hud-controls { width:100%; display:flex; gap:6px; justify-content:center; margin-top:4px; }
.hud-btn { font-size:11px; padding:6px 6px; border-radius:6px; border:1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.02); color:#eaf6ff; cursor:pointer; }
.hud-floating { position: absolute; left: 0%; transform: translateX(-50%); top: -20px; pointer-events:none; font-weight:800; color:#6ee7b7; animation: hud-pop .9s forwards; text-shadow:0 6px 18px rgba(0,0,0,0.45); }
@keyframes hud-pop { 0% { opacity:0; transform:translateX(-50%) translateY(6px) scale(.96); } 40% { opacity:1; transform:translateX(-50%) translateY(-8px) scale(1.06); } 100% { opacity:0; transform:translateX(-50%) translateY(-34px); } }
@media (max-width:720px){ #tetris-hud { display:none; } }
`;
    const s = document.createElement('style');
    s.innerHTML = css;
    document.head.appendChild(s);

    // create overlay and HUD DOM
    let overlay = document.getElementById('tetris-hud-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'tetris-hud-overlay';
      document.body.appendChild(overlay);
    }

    let hud = document.getElementById('tetris-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'tetris-hud';
      hud.innerHTML = `


        <div style="height:6px"></div>

        <div class="next-block" style="width:100%;display:flex;flex-direction:column;align-items:flex-start;">
          <div class="next-label">NEXT</div>
          <canvas id="hud-next-canvas" width="76" height="76" aria-label="next piece"></canvas>
        </div>
        
        <div class="hold-block" style="width:100%;display:flex;flex-direction:column;align-items:flex-start;">
          <div class="next-label">HOLD</div>
          <canvas id="hud-hold-canvas" width="76" height="76" aria-label="held piece"></canvas>
        </div>

        <div style="height:6px"></div>

        <div class="hud-row"><div class="label">LINES</div><div id="hud-lines" class="value">0</div></div>
        <div class="hud-row"><div class="label">LEVEL</div><div id="hud-level" class="value">1</div></div>
        <div class="hud-row"><div class="label">SCORE</div><div id="hud-score" class="value">0</div></div>

        <div style="height:6px"></div>
        <div class="hud-levelbar" aria-hidden="true"><div id="hud-level-fill" class="fill"></div></div>

        <div class="hud-controls" aria-hidden="true">
          <!-- keep Menu button on canvas; these are small helpers (optional) -->
          <button id="hud-pause-btn" class="hud-btn">Pause</button>
        </div>
      `;
      overlay.appendChild(hud);
    }

    // sizing function: align HUD to the canvas panel (right side, panel width 100)
    function sizeHUD() {
      const canvas = document.getElementById('game') || window._engineCanvas;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      overlay.style.left = rect.left + 'px';
      overlay.style.top = rect.top + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      // place HUD exactly starting at GRID_WIDTH*CELL_SIZE + small offset
      // compute panel's left position relative to canvas left
      const panelLeft = GRID_WIDTH * CELL_SIZE; // px inside canvas coordinate
      const hudEl = document.getElementById('tetris-hud');
      if (!hudEl) return;
      // set absolute position: overlay is at canvas top-left, so hud left = panelLeft + 6 px
      hudEl.style.left = (panelLeft - 15) + 'px';
      hudEl.style.top = '6px';
      hudEl.style.setProperty('--cell-size', CELL_SIZE + 'px');

      // scale next canvas to fit (we want approx 2.5 cells)
      const nextCanvas = document.getElementById('hud-next-canvas');
      if (nextCanvas) {
        const s = Math.round(CELL_SIZE * 2.5);
        nextCanvas.width = s;
        nextCanvas.height = s;
        nextCanvas.style.width = s + 'px';
        nextCanvas.style.height = s + 'px';
      }

      const holdCanvas = document.getElementById('hud-hold-canvas');
      if (holdCanvas) {
        const s2 = Math.round(CELL_SIZE * 2.5);
        holdCanvas.width = s2;
        holdCanvas.height = s2;
        holdCanvas.style.width = s2 + 'px';
        holdCanvas.style.height = s2 + 'px';
      }
    }

    window.addEventListener('resize', sizeHUD);
    window.addEventListener('scroll', sizeHUD);
    setTimeout(sizeHUD, 60);
    setTimeout(sizeHUD, 300);

    // HUD buttons (pause behavior)
    const pauseBtn = document.getElementById('hud-pause-btn');
    pauseBtn.addEventListener('click', () => {
      if (typeof togglePause === 'function') togglePause();
    });

    // Expose HUD functions to global so the main game code can call them
    window.__tetrisHUD = {
      show: () => { const el = document.getElementById('tetris-hud'); if (el) el.style.display = 'flex'; },
      hide: () => { const el = document.getElementById('tetris-hud'); if (el) el.style.display = 'none'; },
      sizeHUD,
      updateStats: ({lines, level, score}) => {
        const L = document.getElementById('hud-lines');
        const V = document.getElementById('hud-level');
        const S = document.getElementById('hud-score');
        const fill = document.getElementById('hud-level-fill');
        if (L) L.textContent = String(lines || 0);
        if (V) V.textContent = String(level || 1);
        if (S) S.textContent = String(score || 0);
        if (fill) {
          const progress = ((lines || 0) % 10) * 10;
          fill.style.width = Math.min(100, progress) + '%';
        }
      },
      drawNext: (nextPiece) => {
        const cvs = document.getElementById('hud-next-canvas');
        if (!cvs || !nextPiece) {
          // clear canvas if no next
          if (cvs) {
            const ctx = cvs.getContext('2d');
            ctx.clearRect(0,0,cvs.width,cvs.height);
          }
          return;
        }
        const ctx = cvs.getContext('2d');
        ctx.clearRect(0,0,cvs.width,cvs.height);

        const shape = nextPiece.shape;
        const cols = shape[0].length, rows = shape.length;
        const pad = Math.max(4, Math.floor(cvs.width * 0.06));
        const avail = Math.min(cvs.width, cvs.height) - pad*2;
        const cell = Math.floor(avail / Math.max(cols, rows));
        const totalW = cell * cols;
        const totalH = cell * rows;
        const startX = Math.floor((cvs.width - totalW)/2);
        const startY = Math.floor((cvs.height - totalH)/2);

        // subtle bg
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(0,0,cvs.width,cvs.height);

        for (let r=0;r<rows;r++){
          for (let c=0;c<cols;c++){
            if (shape[r][c]) {
              const color = nextPiece.color || '#ffffff';
              ctx.fillStyle = colorToRGBA(color);
              ctx.fillRect(startX + c*cell + 1, startY + r*cell + 1, cell-2, cell-2);
              ctx.strokeStyle = 'rgba(255,255,255,0.08)';
              ctx.lineWidth = 1;
              ctx.strokeRect(startX + c*cell + 1, startY + r*cell + 1, cell-2, cell-2);
            }
          }
        }
      },
      drawHold: (held) => {
        const cvs = document.getElementById('hud-hold-canvas');
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        ctx.clearRect(0,0,cvs.width,cvs.height);
        if (!held) return;
        const shape = held.shape;
        const cols = shape[0].length, rows = shape.length;
        const pad = Math.max(4, Math.floor(cvs.width * 0.06));
        const avail = Math.min(cvs.width, cvs.height) - pad*2;
        const cell = Math.floor(avail / Math.max(cols, rows));
        const totalW = cell * cols;
        const totalH = cell * rows;
        const startX = Math.floor((cvs.width - totalW)/2);
        const startY = Math.floor((cvs.height - totalH)/2);

        // subtle bg
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(0,0,cvs.width,cvs.height);

        for (let r=0;r<rows;r++){
          for (let c=0;c<cols;c++){
            if (shape[r][c]) {
              const color = held.color || '#ffffff';
              ctx.fillStyle = colorToRGBA(color);
              ctx.fillRect(startX + c*cell + 1, startY + r*cell + 1, cell-2, cell-2);
              ctx.strokeStyle = 'rgba(255,255,255,0.08)';
              ctx.lineWidth = 1;
              ctx.strokeRect(startX + c*cell + 1, startY + r*cell + 1, cell-2, cell-2);
            }
          }
        }
      },
      floating: (text) => {
        const hudEl = document.getElementById('tetris-hud');
        if (!hudEl) return;
        const f = document.createElement('div');
        f.className = 'hud-floating';
        f.textContent = text;
        hudEl.appendChild(f);
        setTimeout(()=>{ if (f.parentNode) f.parentNode.removeChild(f); }, 900);
      }
    };

    // Start hidden: menu should not show HUD
    window.__tetrisHUD.hide();
  })();
  // -------------- end HUD creation ----------------

  // Boot
  showMenu();

  // ——— MENU FUNCTIONS ———
function showMenu() {
    

        
        
  if (window.__imageButtonsClickDispatcher) {
    try { mouseClickMethod(window.__imageButtonsClickDispatcher); } catch(e) { console.warn(e); }
  }
  if (window.__imageButtonsHoverDispatcher) {
    try { mouseMoveMethod(window.__imageButtonsHoverDispatcher); } catch(e) { console.warn(e); }
  }
    
  // ensure we're not in active game state
  gameActive = false;
    let paused = true;
    
        clearInterval(gameInterval);
    gameInterval = null;
    
    keyDownMethod(null);

  // remove previous canvas objects and any leftover image buttons
  if (typeof removeAllImageButtons === "function") {
    try { removeAllImageButtons(); } catch (e) { console.warn("removeAllImageButtons failed:", e); }
  }
  try { removeAll(); } catch (e) { /* ignore if removeAll not present */ }

  // clear any leftover gameplay frame before drawing the menu
  try {
    const gameCanvas = document.getElementById('game');
    if (gameCanvas) {
      gameCanvas.style.visibility = 'visible';
      const ctx = gameCanvas.getContext && gameCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    }
  } catch (e) {}

  // attempt to start the menu music (this wrapper tolerates browser policies)
  try { tryPlayMenuSong(); } catch (e) { /* ignore */ }

  // reset gameplay state variables
  setSize(400, 600);
  linesCleared = 0;
  level = 1;   // use the selected starting level from the menu
  startingLevel = 1;
  window.level = level;
  score = 0;
  fallSpeed = 500;
  isGameOver = false;
  paused = false;
  

  const cx = getWidth() / 2;
  const cy = getHeight() / 2;


  // show HTML overlay backdrop if present
  const tbg = document.getElementById('tetris-bg');
  if (tbg) tbg.style.display = 'block';

  // button geometry (keeps consistent with your previous scale)
  const btnW = 1920 * 0.11;
  const btnH = 1080 * 0.11;
  const btnX = 15;
  const startBtnY = 185;
  const lvlsBtnY = startBtnY + btnH + 12; // put levels below start with small gap


  // Start button using makeImageButton helper
  const startButton = makeImageButton({
    imageUrl: "https://codehs.com/uploads/b6d2c9c9ecf7e9a17d096475e0a96543",
    x: btnX,
    y: startBtnY,
    w: btnW,
    h: btnH,
    hoverScale: 1.10,
    onClick: () => {
      tryPlayMenuSong();
      // cleanup menu buttons & visuals, then go to gameplay
      if (typeof removeAllImageButtons === "function") {
        try { removeAllImageButtons(); } catch (e) { console.warn(e); }
      }
      try { removeAll(); } catch (e) {}
      // rebind game click handler inside showTetris
      startingLevel = 1;
      showTetris();
    }
  });

  startImg = startButton.img;
  imgOrigW = btnW;
  imgOrigH = btnH;
  // read position/size from the returned button object (keeps in sync if hover moves it)
  startBtnBounds = { x: startButton.x, y: startButton.y, w: startButton.w, h: startButton.h };

  // Levels button (swap imageUrl with whatever image you want)
  const lvlsButton = makeImageButton({
    imageUrl: "https://codehs.com/uploads/97b67b69be660bca31466053552dbde3",
    x: 173,
    y: 185 + 50 + 50,
    w: btnW,
    h: btnH,
    hoverScale: 1.10,
    onClick: () => {
      tryPlayMenuSong();
      if (typeof showLevels === "function") {
        showLevels();
      } else {
        // fallback behavior: log; keep menu open
        console.log("Levels button clicked — implement showLevels()");
      }
    }
  });

  // keep levels globals if other code expects them
  LvlsImg = lvlsButton.img;
  LvlsBtnBounds = { x: lvlsButton.x, y: lvlsButton.y, w: lvlsButton.w, h: lvlsButton.h };

  // ---------- Top5 button (inlined here per your request) ----------
  try {
    const top5BtnW = btnW;
    const top5BtnH = btnH;
    const top5BtnX = btnX;
    const top5BtnY = startBtnY + btnH * 2 + 24; // below start and levels

    const top5Button = makeImageButton({
      imageUrl: "https://codehs.com/uploads/928437beb6b9aaf6f7183cd95a567b29", // replace with your Top5 image URL if you have one
    x: 15 + 4,
    y: 185 + 50 + 50 + 50 + 50 + 8,
      w: btnW,
      h: btnH,
      hoverScale: 1.10,
      onClick: () => {
        tryPlayMenuSong();
        // open Top5 overlay (function should exist in the Firebase script you dropped in)
        if (typeof fetchAndShowTop5 === 'function') {
          fetchAndShowTop5();
        } else {
          console.log('Top5 requested but fetchAndShowTop5() not present.');
        }
      }
    });

    // expose bounds if needed elsewhere
    window.top5BtnBounds = { x: top5Button.x, y: top5Button.y, w: top5Button.w, h: top5Button.h };
  } catch (e) {
    console.warn('Top5 button creation failed:', e);
  }
  
    try {

    const duelButton = makeImageButton({
      imageUrl: "https://codehs.com/uploads/139512b6fbbac52b236998de1270b741", // replace with your Top5 image URL if you have one
    x: 15 + 27 + 50 + 1,
    y: 185 - 3 + 25 + 50 + 50 + 50 + 50 + 50 + 50 + 8,
      w: btnW,
      h: btnH,
      hoverScale: 1.10,
onClick: () => {
  try { tryPlayMenuSong(); } catch(e){}
   window.showDuelTournamentDropdown();
}

    });

    // expose bounds if needed elsewhere
    window.duelBtnBounds = { x: duelButton.x, y: duelButton.y, w: duelButton.w, h: duelButton.h };
  } catch (e) {
    console.warn('Top5 button creation failed:', e);
  }

  // hide gameplay HUD while in menu
  if (window.__tetrisHUD && typeof window.__tetrisHUD.hide === 'function') {
    window.__tetrisHUD.hide();
  }
}




  function handleMenuClick(e) {
      const mx = e.getX(), my = e.getY();
      const b = startBtnBounds;
        tryPlayMenuSong();
      if (mx>=b.x && mx<=b.x+b.w && my>=b.y && my<=b.y+b.h) {
          mouseClickMethod(null);
          mouseMoveMethod(null);
          showTetris();
      }
  }

  function handleMenuHover(e) {
      const mx = e.getX(), my = e.getY();

      // use dynamic bounds (based on current size & pos)
      const bx = startImg.getX();
      const by = startImg.getY();
      const bw = startImg.getWidth();
      const bh = startImg.getHeight();

      const inside = (mx >= bx && mx <= bx + bw &&
                      my >= by && my <= by + bh);

      if (inside) {
          if (!hoverGrow) {
              hoverGrow = true;
              // grow image by 10%
              const newW = imgOrigW * 1.1;
              const newH = imgOrigH * 1.1;
              startImg.setSize(newW, newH);
              startImg.setPosition(
                  bx - (newW - imgOrigW) / 2,
                  by - (newH - imgOrigH) / 2
              );
          }
      } else {
          if (hoverGrow) {
              hoverGrow = false;
              // reset to original (close to your original code's sizes)
              startImg.setSize(imgOrigW, imgOrigH);
              startImg.setPosition(startBtnBounds.x, startBtnBounds.y);
          }
      }
  }

  // ——— SWITCH TO GAME ———
function showTetris() {
    

  // remove any menu buttons first so their event listeners / visuals unregister cleanly
  if (typeof removeAllImageButtons === "function") {
    try { removeAllImageButtons(); } catch (e) { console.warn("removeAllImageButtons failed:", e); }
  }
  
    try { closeLevelsDropdown(); } catch(e){}

  // remove all canvas objects (grid, menu images, etc.)
  try { removeAll(); } catch (e) { /* ignore if not available */ }

  // make sure gameplay canvas is visible again
  try {
    const gameCanvas = document.getElementById('game');
    if (gameCanvas) gameCanvas.style.visibility = 'visible';
  } catch (e) {}

  // hide any HTML overlay background
  const tbg = document.getElementById('tetris-bg');
  if (tbg) tbg.style.display = 'none';

  // reset drawing state and start game
  drawnShapes = [];
  startTetris();

  // set game click handler (game logic expects mouseClickMethod to be set for gameplay)
  if (typeof mouseClickMethod === "function") {
    try { mouseClickMethod(handleGameClick); } catch (e) { console.warn("mouseClickMethod(handleGameClick) failed:", e); }
  }

  // show HUD now (only in gameplay)
  if (window.__tetrisHUD && typeof window.__tetrisHUD.show === 'function') {
    if (window.__tetrisHUD.sizeHUD) window.__tetrisHUD.sizeHUD();
    window.__tetrisHUD.show();
  }

  gameActive = true;
    let paused = false;

}

  function handleGameClick(e) {
      const mx = e.getX(), my = e.getY();
      const b = menuBtnBounds;
      if (b && mx>=b.x && mx<=b.x+b.w && my>=b.y && my<=b.y+b.h) {
          if (gameInterval !== null) {
              clearInterval(gameInterval);
              gameInterval = null;
          }
          mouseClickMethod(null);
          showMenu();
      }
  }
  
  

  
  function closeLevelsDropdown() {
  const root = document.getElementById('tetris-levels-dropdown');
  if (root) root.remove();
  if (window.__tetrisLevelsOutsideHandler) {
    document.removeEventListener('pointerdown', window.__tetrisLevelsOutsideHandler);
    window.__tetrisLevelsOutsideHandler = null;
  }
}

function showLevels() {
  closeLevelsDropdown();

  const canvas = document.getElementById('game') || document.querySelector('canvas');
  const canvasRect = canvas ? canvas.getBoundingClientRect() : { left: 60, top: 60 };
  const btn = (typeof LvlsBtnBounds !== 'undefined' && LvlsBtnBounds) ? LvlsBtnBounds : { x: 173, y: 285, w: 120, h: 60 };

  // Load pixel font if not already loaded
  if (!document.getElementById('tetris-font')) {
    const link = document.createElement('link');
    link.id = 'tetris-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    document.head.appendChild(link);
  }

  const root = document.createElement('div');
  root.id = 'tetris-levels-dropdown';
  Object.assign(root.style, {
    position: 'absolute',
    zIndex: 10010,
    left: (canvasRect.left + btn.x) + 'px',
    top: (canvasRect.top + btn.y + (btn.h || 60) + 8) + 'px',
    background: '#000000e6',
    padding: '14px',
    borderRadius: '6px',
    boxShadow: '0 0 20px rgba(0,255,255,0.4)',
    minWidth: '170px',
    pointerEvents: 'auto',
    fontFamily: '"Press Start 2P", monospace',
    color: '#fff',
    border: '2px solid #0ff',
    textAlign: 'center'
  });

  // Title
  const title = document.createElement('div');
  title.textContent = 'START LEVEL';
  Object.assign(title.style, {
    fontSize: '10px',
    marginBottom: '12px',
    color: '#0ff',
    textShadow: '0 0 6px #0ff, 0 0 12px #0ff'
  });
  root.appendChild(title);

  // Grid
  const list = document.createElement('div');
  Object.assign(list.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '6px'
  });
  root.appendChild(list);

  // Tetromino colors for buttons
  const tetroColors = ['#0ff', '#ff0', '#f0f', '#0f0', '#f00', '#ffa500', '#1e90ff'];
  const levels = [5, 10, 15, 20];

  for (let i = 0; i < levels.length; i++) {
    let level = levels[i];
    const b = document.createElement('button');
    b.textContent = String(level);
    b.dataset.level = String(level);
    Object.assign(b.style, {
      padding: '10px 0',
      borderRadius: '2px',
      border: '2px solid #333',
      background: (level === startingLevel) ? '#0ff' : '#111',
      color: (level === startingLevel) ? '#000' : '#fff',
      cursor: 'pointer',
      fontSize: '10px',
      textShadow: '0 0 4px #000',
      transition: 'all 0.12s ease',
      boxShadow: (level === startingLevel) ? '0 0 10px #0ff' : 'inset 0 0 4px #000'
    });

    const neon = tetroColors[i % tetroColors.length];

    b.addEventListener('mouseenter', () => {
      b.style.background = neon;
      b.style.color = '#000';
      b.style.boxShadow = `0 0 12px ${neon}, 0 0 20px ${neon}`;
    });
    b.addEventListener('mouseleave', () => {
      b.style.background = (parseInt(b.dataset.level, 10) === startingLevel) ? '#0ff' : '#111';
      b.style.color = (parseInt(b.dataset.level, 10) === startingLevel) ? '#000' : '#fff';
      b.style.boxShadow = (parseInt(b.dataset.level, 10) === startingLevel)
        ? '0 0 10px #0ff'
        : 'inset 0 0 4px #000';
    });

    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const lvl = parseInt(b.dataset.level, 10) || 1;
      startingLevel = lvl;

      // Update all buttons
      list.querySelectorAll('button').forEach(btn => {
        btn.style.background = '#111';
        btn.style.color = '#fff';
        btn.style.boxShadow = 'inset 0 0 4px #000';
      });
      b.style.background = '#0ff';
      b.style.color = '#000';
      b.style.boxShadow = '0 0 10px #0ff';

      level = startingLevel;
      window.level = level;
      if (applyBtn) applyBtn.textContent = '▶ START ' + startingLevel;

      if (window.__tetrisHUD?.floating) {
        window.__tetrisHUD.floating('Start Level: ' + lvl);
      }
    });

    list.appendChild(b);
  }

  // Bottom row
  const row = document.createElement('div');
  Object.assign(row.style, {
    marginTop: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '6px'
  });

  const makeMiniBtn = (text, neon) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      flex: 1,
      padding: '8px 4px',
      borderRadius: '2px',
      border: '2px solid #333',
      background: '#111',
      cursor: 'pointer',
      fontSize: '9px',
      color: '#fff',
      textShadow: '0 0 4px #000',
      transition: 'all 0.12s ease'
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.background = neon;
      btn.style.color = '#000';
      btn.style.boxShadow = `0 0 12px ${neon}, 0 0 20px ${neon}`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#111';
      btn.style.color = '#fff';
      btn.style.boxShadow = 'none';
    });
    return btn;
  };

  const cancelBtn = makeMiniBtn('CLOSE', '#f0f');
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeLevelsDropdown();
  });

  const applyBtn = makeMiniBtn('▶ START ' + startingLevel, '#0ff');
  applyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    level = startingLevel;
    window.level = level;
    updateSpeed();
    closeLevelsDropdown();

    if (typeof window.showTetris === 'function') {
      try { window.showTetris(); } catch (err) { console.error(err); }
    } else if (typeof showTetris === 'function') {
      try { showTetris(); } catch (err) { console.error(err); }
    }

    if (window.__tetrisHUD?.floating) {
      window.__tetrisHUD.floating('Start Level: ' + startingLevel);
    }
  });

  row.appendChild(cancelBtn);
  row.appendChild(applyBtn);
  root.appendChild(row);

  document.body.appendChild(root);

  window.__tetrisLevelsOutsideHandler = function (ev) {
    if (!root.contains(ev.target)) closeLevelsDropdown();
  };
  document.addEventListener('pointerdown', window.__tetrisLevelsOutsideHandler);
}


  // ——— TETRIS SETUP ———
  function startTetris() {
      if (gameInterval !== null) clearInterval(gameInterval);

    gameActive = true;
    try {
      const gameCanvas = document.getElementById('game');
      if (gameCanvas) gameCanvas.style.visibility = 'visible';
    } catch (e) {}
    
        if (typeof menuSong !== "undefined" && menuSong) {
        try {
            // Preferred: fully stop playback and reset to start
          //  menuSong.pause();
          //  menuSong.currentTime = 0;
            // If you prefer to keep it playing but silent, use:
            // menuSong.muted = true;
        } catch (err) {
            console.warn("Could not mute/menuSong:", err);
        }
    }
      // draw the right-side panel rectangle like original
      hudPanelShape = new Rectangle(100, GRID_HEIGHT * CELL_SIZE);
      hudPanelShape.setPosition(GRID_WIDTH*CELL_SIZE, 0);
      hudPanelShape.setColor(window.__tetrisHudColor || Color.BLUE);
      add(hudPanelShape);

      setSize(GRID_WIDTH*CELL_SIZE + 100, GRID_HEIGHT*CELL_SIZE);
      initGrid();
      // reset hold state at start
      holdPiece = null;
      holdUsed = false;

      nextPiece = randomPiece();
      try { applyTetrominoColorsToPieces(); } catch (e) {}
      spawnPiece();

      // Update HUD initially (only if HUD exists)
      if (window.__tetrisHUD && typeof window.__tetrisHUD.updateStats === 'function') {
        window.__tetrisHUD.updateStats({lines: linesCleared, level: level, score: score});
        window.__tetrisHUD.drawNext(nextPiece);
        window.__tetrisHUD.drawHold(holdPiece);
      }

      isGameOver = false;
      paused = false;

      gameInterval = setInterval(updateGame, fallSpeed);
      keyDownMethod(handleKeyDown);

      // register keyup once (prefer engine keyUpMethod if available)
      if (!keyUpRegistered) {
          if (typeof keyUpMethod === "function") {
              keyUpMethod(handleKeyUp);
          } else {
              document.addEventListener("keyup", handleKeyUp);
          }
          keyUpRegistered = true;
      }

      drawGrid();
      updateSpeed();
  }

  // ——— DRAWING ———
 function drawGrid() {
    if (!gameActive) {
      try {
        const gameCanvas = document.getElementById('game');
        const ctx = gameCanvas && gameCanvas.getContext && gameCanvas.getContext('2d');
        if (ctx && gameCanvas) ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
      } catch (e) {}
      return;
    }
    // remove previous drawnShapes
    for (let s of drawnShapes) remove(s);
    drawnShapes = [];

    const bg = new Rectangle(GRID_WIDTH*CELL_SIZE, GRID_HEIGHT*CELL_SIZE);
    bg.setPosition(0,0);
    bg.setColor(window.__tetrisCanvasBg || Color.BLACK);
    add(bg); drawnShapes.push(bg);

    drawBackgroundGrid();

    const div = new Line(GRID_WIDTH*CELL_SIZE,0, GRID_WIDTH*CELL_SIZE, GRID_HEIGHT*CELL_SIZE);
    div.setColor(window.__tetrisHudColor || Color.BLUE);
    add(div); drawnShapes.push(div);
    
        if (window.__tetrisOpts?.ghost !== false) drawGhostPiece(currentPiece);


    for (let y=0; y<GRID_HEIGHT; y++) {
        for (let x=0; x<GRID_WIDTH; x++) {
            if (grid[y][x]) drawCell(x,y,getGridCellColor(grid[y][x]));
        }
    }

    const shape = currentPiece.shape;
    for (let r=0; r<shape.length; r++) {
        for (let c=0; c<shape[r].length; c++) {
            if (shape[r][c]) {
                drawCell(currentPiece.x + c, currentPiece.y + r, currentPiece.color);
            }
        }
    }

    // --- NOTE: Next preview & stats removed from canvas and moved to HTML HUD ---

    // menu button (unchanged — remains on canvas at bottom-right)
    const mbW=60, mbH=30;
    const mbX = getWidth()-mbW-20, mbY = getHeight()-mbH-10;
    const mRect = new Rectangle(mbW,mbH);
    mRect.setPosition(mbX,mbY);
    mRect.setColor(Color.GRAY);


    const mText = new Text("Menu","12pt Arial");
    mText.setPosition(mbX+mbW/2 - 18, mbY + mbH/2 - 6);
    mText.setColor(Color.BLACK);


    menuBtnBounds = { x:mbX, y:mbY, w:mbW, h:mbH };
    mouseClickMethod(handleGameClick);
}


  function drawBackgroundGrid() {
    const gridColor = window.__tetrisGridColor || '#444444';
    for (let x=0; x<=GRID_WIDTH; x++) {
        const v = new Line(x*CELL_SIZE,0,x*CELL_SIZE,GRID_HEIGHT*CELL_SIZE);
        v.setColor(gridColor);
        add(v); drawnShapes.push(v);
    }
    for (let y=0; y<=GRID_HEIGHT; y++) {
        const h = new Line(0,y*CELL_SIZE,GRID_WIDTH*CELL_SIZE,y*CELL_SIZE);
        h.setColor(gridColor);
        add(h); drawnShapes.push(h);
    }
  }

  function drawCell(x,y,color) {
      const r = new Rectangle(CELL_SIZE,CELL_SIZE);
      r.setPosition(x*CELL_SIZE, y*CELL_SIZE);
      r.setColor(color);
      r.setBorderColor(window.__tetrisOutlineColor || Color.BLACK);
      add(r); drawnShapes.push(r);
  }

  // ——— GAME LOOP & CONTROLS ———
  function updateGame() {
      if (!paused && !isGameOver) dropPiece(false);
  }

  function getKeybind(action) {
    const kb = window.__tetrisKeybinds;
    const defaults = {
      moveLeft: 'ArrowLeft', moveRight: 'ArrowRight', softDrop: 'ArrowDown',
      rotateCW: 'ArrowUp', rotateCCW: 'x', hardDrop: ' ',
      hold: 'c', pause: 'p', restart: 'r'
    };
    return (kb && kb[action]) ? kb[action] : defaults[action];
  }

  function handleKeyDown(e) {
    if (window.chatFocused) return;
    // ignore native autorepeat events — we control repeating
    if (e && e.repeat) return;

    const key = e.key;
    if (!key) return;

    if (isGameOver) {
      if (key === getKeybind('restart') || key.toLowerCase() === getKeybind('restart').toLowerCase()) restartGame();
      return;
    }

    if (!paused) {
      if (key === getKeybind('moveLeft')) {
        startRepeat(key, () => movePiece(-1));
      } else if (key === getKeybind('moveRight')) {
        startRepeat(key, () => movePiece(1));
      } else if (key === getKeybind('softDrop')) {
        startRepeat(key, () => dropPiece(true));
      } else if (key === getKeybind('rotateCW')) {
        rotatePiece();
      } else if (key === getKeybind('hardDrop')) {
        hardDrop();
      } else if (key.toLowerCase() === getKeybind('rotateCCW').toLowerCase()) {
        rotatePieceBackwards();
      } else if (key.toLowerCase() === getKeybind('hold').toLowerCase()) {
        if (gameActive && !paused && !isGameOver) holdCurrentPiece();
      }
      if (key.toLowerCase() === getKeybind('restart').toLowerCase()) restartGame();
    }
    if (key.toLowerCase() === getKeybind('pause').toLowerCase()) togglePause();
  }

  function handleKeyUp(e) {
    if (!e || !e.key) return;
    stopRepeat(e.key);
  }
  
  

    function movePiece(dx) {
      currentPiece.x += dx;
    
      if (collides()) {
        // undo move if invalid
        currentPiece.x -= dx;
      } else {
        // only play sound when the move is valid
        playMovePieceSfx();
      }
    
      drawGrid();
    }


    // modified dropPiece
let collisionLock = 0;
const LOCK_LIMIT = 5;

// updated dropPiece
function dropPiece(isUser = false) {
  currentPiece.y++;

  if (collides()) {
    currentPiece.y--;
    // increment lock counter (piece is touching the stack)
    collisionLock++;

    if (collisionLock >= LOCK_LIMIT) {
      // reached the 3-collision threshold -> place
      collisionLock = 0;
      placePiece();
      let cleared = clearLines();
      updateStats();
      spawnPiece();

      // if the newly spawned piece immediately collides -> game over
      if (collides()) return stopGame();
    } else {
      // still within lock delay — don't place yet.
      // (optional) you can play a "bump" sound here to indicate the hit
      // if (isUser) playBumpSfx();
    }
  } else {
    // no collision -> reset lock counter
    collisionLock = 0;
    if (isUser) {
      playMovePieceSfx();
    }
  }

  drawGrid();
}



  function hardDrop() {
      while (!collides()) currentPiece.y++;
      currentPiece.y--;
      placePiece();
      playHardDropSfx();
      let cleared = clearLines();
      updateStats();
      spawnPiece();
      if (collides()) return stopGame();
      drawGrid();
  }

  function collides() {
      for (let r=0; r<currentPiece.shape.length; r++) {
          for (let c=0; c<currentPiece.shape[r].length; c++) {
              if (currentPiece.shape[r][c]) {
                  let x = currentPiece.x+c, y=currentPiece.y+r;
                  if (x<0||x>=GRID_WIDTH||y>=GRID_HEIGHT) return true;
                  if (y>=0 && grid[y][x]) return true;
              }
          }
      }
      return false;
  }

  function placePiece() {
      const rgbCell = rgbMode && rgbCycleAfterPlace;
      for (let r=0; r<currentPiece.shape.length; r++) {
          for (let c=0; c<currentPiece.shape[r].length; c++) {
              if (currentPiece.shape[r][c]) {
                  let x=currentPiece.x+c, y=currentPiece.y+r;
                  if (y>=0 && y<GRID_HEIGHT) {
                      grid[y][x] = rgbCell
                        ? { __rgbCell: true, type: currentPiece.type, color: currentPiece.color, baseColor: currentPiece.color }
                        : currentPiece.color;
                  }
              }
          }
      }

      // after placing a piece, the player gets hold back (typical Tetris behavior)
      holdUsed = false;
  }

  // Hold helper — clones a shape matrix
  function cloneShape(shape) {
      return shape.map(row => row.slice());
  }

  // ===== Replace existing clearLines() with this =====
  function clearLines() {
      const clearedRows = [];
      for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
          if (grid[y].every(c => c !== 0)) {
              clearedRows.push(y);
              grid.splice(y, 1);
              grid.unshift(new Array(GRID_WIDTH).fill(0));
              y++; // re-check same index after splice
          }
      }

      const count = clearedRows.length;
      if (count > 0) {
        if (Math.random() < 0.1) { // 1 out of 10 chance
            if (count > 0) {
              playDrippyShoes();
            }
            if (count > 1) {
              playDrippyShoes();
            }
            if (count > 2) {
              playDrippyShoes();
            }
            if (count > 3) {
              playDrippyShoes();
            }
        }
        
// A base bonus for clearing one line
const baseOneLineBonus = 100;
// A percentage increase per level (e.g., 10%)
const percentageIncrease = 0.1;

// Calculate the bonus for a given count and level
if (count === 1) {
  score += Math.round(baseOneLineBonus + (baseOneLineBonus * (level - 1) * percentageIncrease));
  playOneLineClearSfx();
} else if (count === 2) {
  const baseTwoLineBonus = 300;
  score += Math.round(baseTwoLineBonus + (baseTwoLineBonus * (level - 1) * percentageIncrease));
  playTwoLineClearSfx();
} else if (count === 3) {
  const baseThreeLineBonus = 600;
  score += Math.round(baseThreeLineBonus + (baseThreeLineBonus * (level - 1) * percentageIncrease));
  playThreeLineClearSfx();
} else if (count === 4) {
  const baseFourLineBonus = 1000;
  score += Math.round(baseFourLineBonus + (baseFourLineBonus * (level - 1) * percentageIncrease));
  playFourLineClearSfx();
}
            


linesCleared += count;
linesClearedThisLevel += count;

updateHighScore(score);

if (linesClearedThisLevel >= linesNeededForLevelUp) {
    level++;
    window.level = level;
    linesClearedThisLevel = 0; // Reset for the new level
    updateSpeed();
}


          // trigger visual effects (rows array sorted top->bottom)
          if (window.__tetrisEffects && typeof window.__tetrisEffects.triggerClear === "function") {
              const asc = clearedRows.slice().sort((a,b)=>a-b);
              window.__tetrisEffects.triggerClear(asc, count);
          }

          // HUD floating points
          if (window.__tetrisHUD && typeof window.__tetrisHUD.floating === 'function') {
    let points = null;


    if (count === 1) {
        points = 100;
    } else if (count === 2) {
        points = 300;
    } else if (count === 3) {
        points = 600;
    } else if (count === 4) {
        points = 1000;
    }
        
        // Calculate the score multiplier based on the level.
        // We'll use a 10% increase per level.
        const levelMultiplier = 1 + (level - 1) * 0.1;
        
        // Apply the multiplier to the points.
        const finalScore = points * levelMultiplier;
        
                points = Math.round(finalScore);
        
        // Display the final score.
        window.__tetrisHUD.floating('+' + Math.round(points));

            updateStats();
            
      }
      return count;
  }
  }


function stopGame() {
    clearInterval(gameInterval);
    gameInterval = null;
    isGameOver = true;
    playDeathSfx();
    
    // clear repeats when game stops
    clearAllRepeats();

    window.__tetrisEffects.triggerGameOver(score);
};



function collidesAt(shape, px, py) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const x = px + c;
      const y = py + r;
      if (x < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) return true;
      if (y >= 0 && grid[y][x]) return true;
    }
  }
  return false;
}

/**
 * Compute the Y coordinate (row) where the piece would land if dropped straight down.
 * Returns the final top-left y (so the piece's blocks are at y + r).
 */
function computeGhostY(piece) {
  if (!piece) return null;
  const shape = piece.shape;
  let gy = piece.y;
  // step down until the next row would collide
  while (!collidesAt(shape, piece.x, gy + 1)) {
    gy++;
    // safety cap (shouldn't be needed but prevents infinite loops if grid is corrupted)
    if (gy > GRID_HEIGHT + 4) break;
  }
  return gy;
}

/**
 * Draw ghost (outline / translucent blocks) for piece showing where it will land.
 * Adds shapes to drawnShapes so your existing clear-on-redraw works.
 */
function drawGhostPiece(piece) {
  if (!piece) return;
  const shape = piece.shape;
  const gy = computeGhostY(piece);

  // if ghost would be at the same position as current piece (e.g. immediately blocked),
  // still draw it (user likes to see exact landing), or skip if you prefer.
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const x = piece.x + c;
      const y = gy + r;
      // don't draw cells above the visible playfield
      if (y < 0 || x < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) continue;

      const ghostRect = new Rectangle(CELL_SIZE, CELL_SIZE);
      ghostRect.setPosition(x * CELL_SIZE, y * CELL_SIZE);
      // subtle translucent fill + clearer border so it's visible but not distracting
      ghostRect.setColor('rgba(255,255,255,0.04)');         // small subtle fill
      try { ghostRect.setBorderColor('rgba(255,255,255,0.12)'); } catch (e) { /* engine may not support border color */ }
      // If your engine supports alpha on the existing color constants, use them instead.
      add(ghostRect);
      drawnShapes.push(ghostRect);

      // optional: draw an inner faint stroke for clearer outline on some engines
      // create a tiny inner rectangle to act like a stroke (thin)
      const inner = new Rectangle(Math.max(1, CELL_SIZE - 6), Math.max(1, CELL_SIZE - 6));
      inner.setPosition(x * CELL_SIZE + 3, y * CELL_SIZE + 3);
      inner.setColor('rgba(255,255,255,0)'); // fully transparent fill
      try { inner.setBorderColor('rgba(255,255,255,0.14)'); } catch (e) {}
      add(inner);
      drawnShapes.push(inner);
    }
  }
}


// Clockwise rotation (90°)
function rotateMatrixCW(m) {
    const res = [];
    for (let c = 0; c < m[0].length; c++) {
        const row = [];
        for (let r = m.length - 1; r >= 0; r--) row.push(m[r][c]);
        res.push(row);
    }
    return res;
}

// Counter-clockwise rotation (90°)
function rotateMatrixCCW(m) {
    const res = [];
    for (let c = m[0].length - 1; c >= 0; c--) {
        const row = [];
        for (let r = 0; r < m.length; r++) row.push(m[r][c]);
        res.push(row);
    }
    return res;
}

// Attempt rotation with small kicks
function tryRotate(newShape) {
    const origShape = currentPiece.shape;
    const origX = currentPiece.x;
    const origY = currentPiece.y;

    const kicks = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, -1],
        [1, -1],
        [-1, -1],
        [2, 0],
        [-2, 0],
    ];

    for (let i = 0; i < kicks.length; i++) {
        const [dx, dy] = kicks[i];
        currentPiece.shape = newShape;
        currentPiece.x = origX + dx;
        currentPiece.y = origY + dy;
        if (!collides()) {
            return true; // rotation + kick successful
        }
    }

    // no valid position, revert
    currentPiece.shape = origShape;
    currentPiece.x = origX;
    currentPiece.y = origY;
    return false;
}

// Clockwise rotation
function rotatePiece() {
    tryRotate(rotateMatrixCW(currentPiece.shape));
    drawGrid();
}

// Counter-clockwise rotation
function rotatePieceBackwards() {
    tryRotate(rotateMatrixCCW(currentPiece.shape));
    drawGrid();
}


function updateSpeed() {
  if (gameInterval !== null) clearInterval(gameInterval);

  const baseInterval = 1000;       // ms at level 0
  const percentPerLevel = 1;    // 1% per level (change if you want 0.5% etc)
  const minInterval = 10;          // safety floor (ms) to avoid 0 or negative

  const cappedLevel = Math.min(level, 20); // cap level at 20
  const multiplier = 1 + cappedLevel * (percentPerLevel); 
  const raw = baseInterval / multiplier;          // smaller = faster

  fallSpeed = Math.max(minInterval, Math.round(raw));
  gameInterval = setInterval(updateGame, fallSpeed);
}

  // ——— STATS & PAUSE & RESTART ———
  function updateStats() {
      // update HTML HUD when present
      if (window.__tetrisHUD && typeof window.__tetrisHUD.updateStats === 'function') {
          window.__tetrisHUD.updateStats({ lines: linesCleared, level: level, score: score });
      }
  }

function restartGame() {
    // remove any DOM/CSS gameover overlay first
    if (window.__tetrisEffects && typeof window.__tetrisEffects.clearGameOver === 'function') {
        window.__tetrisEffects.clearGameOver();
    }

    clearInterval(gameInterval);
    gameInterval = null;
    // clear any repeating timers
    clearAllRepeats();
    removeAll();
    linesCleared = 0;
    level = startingLevel || 1;  // respect selected starting level on restart
    window.level = level;
    score = 0;
    updateSpeed();
    isGameOver = false;
    paused = false;
    showTetris();
}


function togglePause() {
    // only allow toggling when a game is active and not already over
    if (!gameActive || isGameOver) return;

    paused = !paused;
    if (paused) {
        // stop the interval and repeats
        clearInterval(gameInterval);
        gameInterval = null;
        clearAllRepeats();

          window.__tetrisHUD.showPausedOverlay();

    } else {
        // hide the paused overlay
        if (pauseText) { try { remove(pauseText); } catch(e){}; pauseText = null; }
        if (window.__tetrisHUD && typeof window.__tetrisHUD.hidePausedOverlay === 'function') {
          window.__tetrisHUD.hidePausedOverlay();
        }
        // restart the interval
        gameInterval = setInterval(updateGame, fallSpeed);
    }

    // update pause button label in HUD (if present)
    if (window.__tetrisHUD) {
      const btn = document.getElementById('hud-pause-btn');
      if (btn) btn.textContent = 'Pause';
    }
}


  // ——— UTILITY ———
  function initGrid() {
      grid = [];
      for (let y=0; y<GRID_HEIGHT; y++) {
          grid.push(new Array(GRID_WIDTH).fill(0));
      }
  }

// A global variable to keep track of the last two pieces generated
let lastPieces = ['', ''];

// A global variable for the bag of pieces
let pieceBag = [];

// A function to fill the bag with a shuffled set of all piece types
function fillBag() {
  const types = Object.keys(TETROMINOS_90_DEGREE);
  // Shuffle the array using Fisher-Yates shuffle algorithm
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  pieceBag = types;
}

function randomPiece(spawnX = 3, spawnY = 0) {
  // If the bag is empty, fill it with a new shuffled set of pieces
  if (pieceBag.length === 0) {
    fillBag();
  }

  // Get the next piece from the bag
  let type = pieceBag.shift();

  // Check if the current piece is the same as the last two pieces
  if (type === lastPieces[0] && type === lastPieces[1]) {
    // If it is, put the current piece back at the end of the bag
    // and take the next piece instead.
    pieceBag.push(type);
    type = pieceBag.shift();
  }

  // Update the lastPieces array
  lastPieces.shift();
  lastPieces.push(type);

  const rotations = TETROMINOS_90_DEGREE[type];
  const rotationIndex = 0; // spawn in 0° orientation
  const shape = rotations[rotationIndex].map(row => row.slice()); // deep copy rows

  // Resolve color
  let color = getTetrominoColorForType(type);

  return {
    type,
    rotationIndex,
    shape,
    color,
    x: spawnX,
    y: spawnY
  };
}


  function spawnPiece() {
  collisionLock = 0;
      // currentPiece becomes nextPiece (if any), otherwise create new
      currentPiece = nextPiece || randomPiece();
      nextPiece = randomPiece();

      // center the newly spawned piece horizontally on the playfield
      const shape = currentPiece.shape;
      const shapeCols = shape[0].length;
      // place so the shape is centered; use Math.floor to be consistent with integer grid
      currentPiece.x = Math.floor((GRID_WIDTH - shapeCols) / 2);

      // set y to top (0)
      currentPiece.y = 0;

      // notify HUD about the new next piece & stats
      if (window.__tetrisHUD && typeof window.__tetrisHUD.drawNext === 'function') {
        window.__tetrisHUD.drawNext(nextPiece);
      }
      if (window.__tetrisHUD && typeof window.__tetrisHUD.updateStats === 'function') {
        window.__tetrisHUD.updateStats({ lines: linesCleared, level: level, score: score });
      }

      // when a new piece spawns, ensure holdUsed is false? No — we only reset holdUsed when a piece is placed.
      // but for safety at start of a game we've set holdUsed=false in startTetris/restart.
      if (window.__tetrisHUD && typeof window.__tetrisHUD.drawHold === 'function') {
        window.__tetrisHUD.drawHold(holdPiece);
      }
  }

  // Prevent arrow/space from scrolling the page
  document.addEventListener("keydown", e => {
      if ([32,37,38,39,40].includes(e.keyCode)) e.preventDefault();
  });

  // Ensure canvas can receive focus
  if (c) {
      c.setAttribute("tabindex","0");
      c.addEventListener("click",()=>c.focus());
  }

  // Expose a tiny API so HUD can control the game safely from outside the IIFE.
window.tetrisAPI = {
  showMenu: () => showMenu(),
  togglePause: () => togglePause(),
  stopGameInterval: () => { if (gameInterval !== null) { clearInterval(gameInterval); gameInterval = null; } },
  getGameState: () => ({ linesCleared, level, score, isGameOver, paused }),
  // allow effects overlay/button to restart the game
  restart: () => { try { restartGame(); } catch(e) { /* no-op */ } }
};

  // small helper used by HUD drawing to convert engine Color.* to CSS
  function colorToRGBA(col) {
    if (!col) return 'rgba(255,255,255,0.9)';
    if (typeof col === 'string') return col;
    try {
      if (col.toRGBA) return col.toRGBA();
      if (col.r !== undefined && col.g !== undefined && col.b !== undefined) {
        const a = col.a !== undefined ? col.a : 1;
        return `rgba(${col.r},${col.g},${col.b},${a})`;
      }
      if (col.toString) return String(col);
    } catch(e){}
    return '#fff';
  }

  // ——— HOLD: core logic ———
  function holdCurrentPiece() {
    // disallow hold if already used for this active piece
    if (holdUsed) {
      // optional feedback
      if (window.__tetrisHUD && typeof window.__tetrisHUD.floating === 'function') {
        window.__tetrisHUD.floating('Hold used');
      }
      return;
    }

    // prepare a snapshot of current piece to store (clone shape)
    const currentSnapshot = {
      type: currentPiece.type,
      shape: cloneShape(currentPiece.shape),
      color: currentPiece.color
    };

    if (!holdPiece) {
      // empty hold slot: move current piece to hold, spawn next piece
      holdPiece = currentSnapshot;
      // spawn next piece (this will set currentPiece = nextPiece)
      spawnPiece();
      // set hold used for this piece until it is placed
      holdUsed = true;
    } else {
      // swap current piece with held piece
      const temp = holdPiece;
      holdPiece = currentSnapshot;

      // adopt the held piece as the current piece
      currentPiece = {
        type: temp.type || null,
        shape: cloneShape(temp.shape),
        color: temp.color,
        x: Math.floor((GRID_WIDTH - temp.shape[0].length) / 2),
        y: 0
      };
      // mark hold used until this placed
      holdUsed = true;

      // if the swapped-in piece immediately collides, that's a game over
      if (collides()) {
        return stopGame();
      }
    }

    // update HUD hold preview and redraw
    if (window.__tetrisHUD && typeof window.__tetrisHUD.drawHold === 'function') {
      window.__tetrisHUD.drawHold(holdPiece);
    }
    if (window.__tetrisHUD && typeof window.__tetrisHUD.drawNext === 'function') {
      window.__tetrisHUD.drawNext(nextPiece);
    }

    // redraw board
    drawGrid();
  }

  // ——— end hold logic ———

})(); // end main Tetris IIFE



// ===== TETRIS EFFECTS PLUGIN (paste at end of game.js) =====
(function () {
  // ensure we only init once
  if (window.__tetrisEffects) return;

  // create overlay element (no HTML edits required)
  let overlay = document.querySelector('[data-tetris-effects]');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.setAttribute('data-tetris-effects', '');
    overlay.id = 'tetris-effects-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0px';
    overlay.style.top = '0px';
    overlay.style.width = '0px';
    overlay.style.height = '0px';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '9999';
    document.body.appendChild(overlay);
  }

  // reference to engine canvas
  const canvas = window._engineCanvas || document.getElementById('game');

  function sizeOverlay() {
    if (!canvas || !overlay) return;
    const rect = canvas.getBoundingClientRect();
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.position = 'fixed';
    // expose cell size CSS var if present
    if (typeof CELL_SIZE !== 'undefined') overlay.style.setProperty('--te-cell-size', CELL_SIZE + 'px');
  }

  // keep overlay aligned
  window.addEventListener('resize', sizeOverlay);
  window.addEventListener('scroll', sizeOverlay);
  setTimeout(sizeOverlay, 60);
  setTimeout(sizeOverlay, 300);

  // helper: cleanup when animation ends or fallback after delay
  function removeLater(el, fallbackDelay) {
    el.addEventListener('animationend', () => { if (el.parentNode) el.parentNode.removeChild(el); }, { once: true });
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, (fallbackDelay || 1200));
  }

  // short flash overlay
  function doFlash(color, dur) {
    const f = document.createElement('div');
    f.className = 'tetris-flash';
    f.style.background = color || 'rgba(255,255,255,0.12)';
    f.style.left = '0'; f.style.top = '0'; f.style.right = '0'; f.style.bottom = '0';
    f.style.opacity = '0';
    f.style.pointerEvents = 'none';
    overlay.appendChild(f);
    // trigger visible momentarily
    requestAnimationFrame(() => f.style.opacity = '1');
    setTimeout(() => f.style.opacity = '0', 60);
    removeLater(f, (dur || 220) + 80);
  }

  // create row glow strip
  function createRowGlow(rowIndex, delay) {
    const g = document.createElement('div');
    g.className = 'tetris-row-glow';
    const cell = (typeof CELL_SIZE !== 'undefined' ? CELL_SIZE : 30);
    const topPx = rowIndex * cell;
    g.style.top = (topPx - 2) + 'px';
    g.style.left = '0px';
    g.style.height = (cell + 4) + 'px';
    g.style.width = '100%';
    g.style.opacity = '0';
    g.style.animationDelay = (delay || 0) + 'ms';
    overlay.appendChild(g);
    removeLater(g, 900 + (delay || 0));
  }

  // particle burst using DOM squares
  function spawnParticlesForRows(rows, perRow) {
    const cols = typeof GRID_WIDTH !== 'undefined' ? GRID_WIDTH : 10;
    const cell = (typeof CELL_SIZE !== 'undefined' ? CELL_SIZE : 30);
    rows.forEach((row, ri) => {
      const baseY = row * cell + (cell/2);
      const count = perRow || Math.max(8, Math.floor(12 / Math.max(1, rows.length)));
      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'tetris-particle';
        const cx = (Math.random() * cols) * cell + (Math.random() * 6 - 3);
        p.style.left = (cx) + 'px';
        p.style.top = (baseY + (Math.random()*8 - 4)) + 'px';
        // color variants
        if (i % 3 === 0) p.classList.add('te-accent-1');
        else if (i % 3 === 1) p.classList.add('te-accent-2');
        else p.classList.add('te-accent-3');
        const dx = Math.round((Math.random() * 140 - 70)) + 'px';
        const dy = Math.round(-(Math.random() * 120 + 20)) + 'px';
        const rot = Math.round((Math.random() * 360 - 180)) + 'deg';
        p.style.setProperty('--te-dx', dx);
        p.style.setProperty('--te-dy', dy);
        p.style.setProperty('--te-rot', rot);
        const size = 4 + Math.round(Math.random() * 8);
        p.style.width = p.style.height = size + 'px';
        p.style.borderRadius = (size < 6 ? 1 : 3) + 'px';
        overlay.appendChild(p);
        removeLater(p, 900 + (ri * 40));
      }
    });
  }

  // floating score text
  function showFloatingScore(rows, count) {
    const s = document.createElement('div');
    s.className = 'tetris-floating-score';
    let levelss = window.level;
    let points = null;
    
    
    if (count === 1) {
        points = 100;
    } else if (count === 2) {
        points = 300;
    } else if (count === 3) {
        points = 600;
    } else if (count === 4) {
        points = 1000;
    }
        
        // Calculate the score multiplier based on the level.
        // We'll use a 10% increase per level.
        const levelMultiplier = 1 + (levelss - 1) * 0.1;
        
        // Apply the multiplier to the points.
        const finalScore = points * levelMultiplier;
        points =  Math.round(finalScore);
    s.textContent = (count > 1) ? `+${points} (${count} lines!)` : `+${points}`;
    const cell = (typeof CELL_SIZE !== 'undefined' ? CELL_SIZE : 30);
    // center horizontally and vertically above the group of cleared rows
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const midRow = (minRow + maxRow) / 2;
    s.style.left = (overlay.getBoundingClientRect().width / 2) + 'px';
    s.style.top = (midRow * cell + (cell/2)) + 'px';
    if (count >= 4) s.style.fontSize = 'clamp(20px, 3.6vw, 36px)';
    overlay.appendChild(s);
    setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, 1400);
  }

  // public trigger: rows should be ascending (top->bottom)
  function triggerClear(rows, count) {
    sizeOverlay();
    const opts = window.__tetrisOpts || {};
    // flash: stronger for 4 lines
    if (opts.flash !== false) doFlash(count >= 4 ? 'rgba(255,230,180,0.18)' : 'rgba(255,255,255,0.12)', 220);
    if (opts.rowGlow !== false) rows.forEach((r, i) => createRowGlow(r, i * 60));
    if (opts.particles !== false) spawnParticlesForRows(rows, 12);
    if (opts.floatingScore !== false) showFloatingScore(rows, count);
  }

  // export
  window.__tetrisEffects = {
    triggerClear
  };

  // safety: ensure overlay sizing after init
  setTimeout(sizeOverlay, 140);
})();





/* ===== Enhanced "cool" paused overlay (paste after HUD/effects code) ===== */
(function installCoolPausedOverlay() {
  // ensure container object
  window.__tetrisHUD = window.__tetrisHUD || {};

  // inject enhanced CSS once
  if (!document.getElementById('tetris-paused-styles')) {
    const css = `
/* Paused overlay visuals (cool) */
#tetris-paused-overlay {
  position: fixed;
  left: 0; top: 0;
  width: 100vw; height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483647;
  pointer-events: none;
  background: rgba(6,8,12,0.28);
  backdrop-filter: blur(6px) saturate(120%);
  -webkit-backdrop-filter: blur(6px) saturate(120%);
  transition: background 260ms ease;
}
#tetris-paused-overlay.show { pointer-events: auto; background: rgba(3,5,8,0.32); }

.paused-card {
  position: relative;
  width: min(760px, 92%);
  padding: 28px;
  border-radius: 14px;
  overflow: hidden;
  transform: translateY(-8px) scale(.98);
  transition: transform 260ms cubic-bezier(.2,.9,.2,1), opacity 220ms ease;
  background:
    linear-gradient(180deg, rgba(6,8,12,0.95) 0%, rgba(10,12,18,0.86) 100%),
    radial-gradient(1200px 240px at 10% 10%, rgba(125,211,252,0.03), transparent 8%),
    radial-gradient(900px 200px at 90% 70%, rgba(110,231,183,0.03), transparent 8%);
  box-shadow: 0 30px 80px rgba(2,6,23,0.72), inset 0 -6px 30px rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.04);
}
#tetris-paused-overlay.show .paused-card { transform: translateY(0) scale(1); }

/* decorative animated blurred blobs */
.paused-blob {
  position: absolute;
  pointer-events: none;
  border-radius: 50%;
  filter: blur(44px);
  opacity: 0.16;
  mix-blend-mode: screen;
  transform-origin: center;
  will-change: transform, opacity;
}
.paused-blob.b1 { width:360px; height:360px; left: -10%; top: -18%; background: radial-gradient(circle at 30% 30%, rgba(125,211,252,0.95), rgba(125,211,252,0.18) 30%, transparent 60%); animation: blob-anim-1 8200ms infinite ease-in-out; }
.paused-blob.b2 { width:300px; height:300px; right: -8%; bottom: -12%; background: radial-gradient(circle at 70% 60%, rgba(255,210,102,0.9), rgba(255,210,102,0.12) 30%, transparent 60%); animation: blob-anim-2 7200ms infinite ease-in-out; }
.paused-blob.b3 { width:220px; height:220px; left: 50%; top: -6%; transform: translateX(-60%); background: radial-gradient(circle at 50% 50%, rgba(125,211,252,0.7), rgba(125,211,252,0.06) 40%, transparent 70%); animation: blob-anim-3 9200ms infinite ease-in-out; }

@keyframes blob-anim-1 {
  0% { transform: translateY(0) scale(1); opacity: .16; }
  50% { transform: translateY(12px) scale(1.05); opacity: .22; }
  100% { transform: translateY(0) scale(1); opacity: .16; }
}
@keyframes blob-anim-2 {
  0% { transform: translateX(0) scale(1); opacity: .12; }
  50% { transform: translateX(-10px) scale(1.06); opacity: .18; }
  100% { transform: translateX(0) scale(1); opacity: .12; }
}
@keyframes blob-anim-3 {
  0% { transform: translateX(-60%) translateY(0) scale(.98); opacity: .10; }
  50% { transform: translateX(-60%) translateY(-16px) scale(1.02); opacity: .16; }
  100% { transform: translateX(-60%) translateY(0) scale(.98); opacity: .10; }
}

/* scanlines (subtle retro touch) */
.paused-scanlines {
  position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 100% 6px;
  opacity: 0.03;
  pointer-events: none;
}

/* title + text */
.paused-title {
  font-family: "Segoe UI", Roboto, system-ui, -apple-system, Arial;
  font-weight: 900;
  font-size: clamp(28px, 6vw, 48px);
  margin: 2px 0 8px 0;
  letter-spacing: 1.5px;
  background: linear-gradient(90deg,#7dd3fc,#6ee7b7,#ffd166);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 10px 30px rgba(0,0,0,0.6);
}
.paused-sub {
  font-size: 14px;
  color: rgba(220,235,255,0.84);
  margin-bottom: 16px;
}

/* actions */
.paused-actions { display:flex; gap:12px; justify-content:center; margin-top:6px; }
.paused-btn {
  cursor: pointer;
  padding: 10px 16px;
  border-radius: 10px;
  min-width: 100px;
  font-weight: 800;
  border: 1px solid rgba(255,255,255,0.06);
  letter-spacing: 0.6px;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
  color: #fff;
  box-shadow: 0 8px 30px rgba(0,0,0,0.45);
  transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
  position: relative;
  overflow: visible;
}
.paused-btn:focus { outline: none; box-shadow: 0 10px 34px rgba(125,211,252,0.12); transform: translateY(-2px); }
.paused-btn:hover { transform: translateY(-4px); filter: brightness(1.06); box-shadow: 0 18px 40px rgba(125,211,252,0.08); }
.paused-btn.primary {
  background: linear-gradient(90deg,#6ee7b7,#7dd3fc);
  color: rgba(2,8,12,0.96);
  border: 1px solid rgba(255,255,255,0.22);
  box-shadow: 0 10px 36px rgba(125,211,252,0.14);
}
.paused-btn.secondary {
  background: rgba(255,255,255,0.02);
}

/* small neon accent line under title */
.paused-title::after {
  content: "";
  display:block;
  height: 6px;
  width: 44px;
  margin: 12px auto 0;
  border-radius: 99px;
  background: linear-gradient(90deg,#7dd3fc,#6ee7b7,#ffd166);
  filter: blur(10px);
  opacity: .9;
}

/* accessibility: center content on small screens */
@media (max-width:520px) {
  .paused-card { padding: 18px; border-radius: 10px; }
  .paused-sub { font-size: 13px; }
  .paused-actions { gap:8px; flex-direction: column; }
  .paused-btn { min-width: 100%; }
}
`;
    const st = document.createElement('style');
    st.id = 'tetris-paused-styles';
    st.innerHTML = css;
    document.head.appendChild(st);
  }

  // create overlay DOM (idempotent)
  function createOverlay() {
    let ov = document.getElementById('tetris-paused-overlay');
    if (ov) return ov;

    ov = document.createElement('div');
    ov.id = 'tetris-paused-overlay';
    ov.setAttribute('aria-hidden', 'true');
    ov.className = '';
    ov.innerHTML = `
      <div class="paused-card" role="dialog" aria-modal="true" aria-label="Paused">
        <div class="paused-blob b1" aria-hidden="true"></div>
        <div class="paused-blob b2" aria-hidden="true"></div>
        <div class="paused-blob b3" aria-hidden="true"></div>

        <div class="paused-scanlines" aria-hidden="true"></div>

        <div style="position:relative; z-index:2;">
          <div style="display:flex;align-items:center;justify-content:center;">
            <div class="paused-title">PAUSED</div>
          </div>
          <div class="paused-sub">You're terrible — your game is on hold. Press <strong>P</strong> to resume.</div>
          <div class="paused-actions">
            <button id="paused-resume-btn" class="paused-btn primary">Resume</button>
            <button id="paused-menu-btn" class="paused-btn secondary">Menu</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    // wire up buttons safely (idempotent)
    const resume = document.getElementById('paused-resume-btn');
    const menu = document.getElementById('paused-menu-btn');

// --- Replace existing resume/menu wiring with this ---
if (resume && !resume.__tetris_listened) {
  const resumeAction = () => {
    try {
      // Prefer global API (safe if installer ran before game IIFE)
      if (window.tetrisAPI && typeof window.tetrisAPI.togglePause === 'function') {
        window.tetrisAPI.togglePause();
      } else if (typeof togglePause === 'function') {
        // fallback if local function is available
        togglePause();
      } else {
        console.warn('togglePause not found (resume click).');
      }
    } catch (err) {
      console.error('Error calling togglePause on resume:', err);
    }

    // Ensure UI hide flow runs: call local hide(), or HUD method, with tiny delay to avoid DOM race.
    setTimeout(() => {
      try {
        if (typeof hide === 'function') hide();
        else if (window.__tetrisHUD && typeof window.__tetrisHUD.hidePausedOverlay === 'function') {
          window.__tetrisHUD.hidePausedOverlay();
        } else {
          // last-resort: find overlay and remove it
          const ov = document.getElementById('tetris-paused-overlay');
          if (ov) {
            ov.classList.remove('show');
            ov.style.pointerEvents = 'none';
            ov.setAttribute('aria-hidden', 'true');
            // give transition a moment then remove from layout
            setTimeout(()=>{ try { ov.style.display = 'none'; } catch(e){} }, 520);
          }
        }
      } catch (err) {
        console.error('Error hiding paused overlay after resume:', err);
      }
    }, 8);
  };

  resume.addEventListener('click', resumeAction);
  resume.__tetris_listened = true;
}

if (menu && !menu.__tetris_listened) {
  const menuAction = () => {
    try {
      // Prefer global API showMenu
      if (window.tetrisAPI && typeof window.tetrisAPI.showMenu === 'function') {
        window.tetrisAPI.showMenu();
      } else if (typeof showMenu === 'function') {
        showMenu();
      } else {
        console.warn('showMenu not found (menu click).');
      }
    } catch (err) {
      console.error('Error calling showMenu on menu click:', err);
    }

    // hide overlay UI exactly the same way as resume
    setTimeout(() => {
      try {
        if (typeof hide === 'function') hide();
        else if (window.__tetrisHUD && typeof window.__tetrisHUD.hidePausedOverlay === 'function') {
          window.__tetrisHUD.hidePausedOverlay();
        } else {
          const ov = document.getElementById('tetris-paused-overlay');
          if (ov) {
            ov.classList.remove('show');
            ov.style.pointerEvents = 'none';
            ov.setAttribute('aria-hidden', 'true');
            setTimeout(()=>{ try { ov.style.display = 'none'; } catch(e){} }, 520);
          }
        }
      } catch (err) {
        console.error('Error hiding paused overlay after menu click:', err);
      }
    }, 8);
  };

  menu.addEventListener('click', menuAction);
  menu.__tetris_listened = true;
}


    // keyboard accessibility: ESC also resumes
    if (!ov.__tetris_keybound) {
      ov.__tetris_keybound = true;
      document.addEventListener('keydown', (ev) => {
        if (!ov.classList.contains('show')) return;
        if (ev.key === 'Escape' || ev.key === 'Esc') {
          try { if (typeof togglePause === 'function') togglePause(); } catch(e){ console.error(e); }
        }
      });
    }

    return ov;
  }

  // show with proper display handling so removing 'show' actually hides element
  function show() {
    try {
      const ov = createOverlay();
      // Make visible in layout first
      ov.style.display = 'flex';
      ov.style.pointerEvents = 'auto';
      ov.setAttribute('aria-hidden', 'false');

      // force reflow so the subsequent class add triggers transition reliably
      // eslint-disable-next-line no-unused-expressions
      ov.offsetHeight;

      ov.classList.add('show');

      // focus resume button for accessibility
      const resume = document.getElementById('paused-resume-btn');
      if (resume) {
        setTimeout(() => {
          try { resume.focus(); } catch (e) {}
        }, 40);
      }
    } catch (err) {
      console.error('show paused overlay failed', err);
    }
  }

  // hide but wait for animation to finish then set display:none
  function hide() {
    try {
      const ov = document.getElementById('tetris-paused-overlay');
      if (!ov) return;

      // Move focus out first so we don't hide the currently focused control.
      const active = document.activeElement;
      if (active && ov.contains(active) && typeof active.blur === 'function') {
        active.blur();
      }

      // remove the visible class to start the hide transition
      ov.classList.remove('show');
      ov.style.pointerEvents = 'none';
      ov.setAttribute('aria-hidden', 'true');

      // prefer transitionend from the .paused-card for reliability
      const card = ov.querySelector('.paused-card');

      let settled = false;
      function finishHide() {
        if (settled) return;
        settled = true;
        try { ov.style.display = 'none'; } catch(e){}
        // ensure class cleaned up too
        ov.classList.remove('show');
      }

      if (card) {
        const onEnd = (ev) => {
          // ensure we respond only to relevant transitions (opacity/transform)
          if (ev.target !== card) return;
          finishHide();
          card.removeEventListener('transitionend', onEnd);
        };
        card.addEventListener('transitionend', onEnd);

        // fallback: if transitionend doesn't fire within 420ms, force hide
        setTimeout(finishHide, 520);
      } else {
        // no card found — immediate hide
        finishHide();
      }
    } catch (err) {
      console.error('hide paused overlay failed', err);
      try { const ov2 = document.getElementById('tetris-paused-overlay'); if (ov2) ov2.style.display = 'none'; } catch(e){}
    }
  }


  // expose (override existing on purpose to get the new cool look)
  window.__tetrisHUD.showPausedOverlay = show;
  window.__tetrisHUD.hidePausedOverlay = hide;

  // return for chaining if needed
  return { show, hide };
})();

// ===== TETRIS EFFECTS PLUGIN (REPLACEMENT - includes Game Over CSS effect) =====

(function(){
  // don't overwrite an actual working implementation
  if (window.__tetrisEffects && typeof window.__tetrisEffects.triggerGameOver === 'function') {
    console.log('triggerGameOver already present — leaving it alone.');
    return;
  }

  // ensure object exists
  if (!window.__tetrisEffects || typeof window.__tetrisEffects !== 'object') window.__tetrisEffects = {};

  // create overlay (or reuse)
  let overlay = document.querySelector('[data-tetris-effects]');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.setAttribute('data-tetris-effects', '');
    overlay.id = 'tetris-effects-overlay';
    document.body.appendChild(overlay);
  }
  // basic style
  Object.assign(overlay.style, {
    position: 'fixed', left:'0', top:'0', width:'100vw', height:'100vh',
    pointerEvents:'none', zIndex: 2147483646, fontFamily: 'Segoe UI, Roboto, system-ui, Arial'
  });

  // helper to clear previous card
  let _goEl = null;
  window.__tetrisEffects.clearGameOver = function(){
    if (_goEl && _goEl.parentNode) _goEl.parentNode.removeChild(_goEl);
    _goEl = null;
    overlay.style.pointerEvents = 'none';
  };

  // tiny confetti helper
  function spawnConfetti(count){
    const cvsRect = (window._engineCanvas || document.getElementById('game') || document.body).getBoundingClientRect();
    for (let i=0;i<count;i++){
      const p = document.createElement('div');
      Object.assign(p.style,{
        position:'absolute',
        width:(4+Math.random()*8)+'px',
        height:(4+Math.random()*8)+'px',
        left:(cvsRect.left + Math.random()*cvsRect.width)+'px',
        top:(cvsRect.top + Math.random()*cvsRect.height)+'px',
        background: ['#ff6b6b','#ffd166','#7dd3fc'][i%3],
        borderRadius: (Math.random()>0.6?'50%':'2px'),
        transform: `translateY(0) rotate(${Math.random()*360}deg)`,
        zIndex: 2147483647,
        pointerEvents:'none',
        opacity: '1',
        transition: 'transform 900ms cubic-bezier(.2,.8,.2,1), opacity 900ms linear'
      });
      document.body.appendChild(p);
      // animate out
      setTimeout(()=> {
        p.style.transform = `translate(${(Math.random()*400-200)|0}px, ${-(200 + Math.random()*300)|0}px) rotate(${(Math.random()*720-360)|0}deg) scale(.6)`;
        p.style.opacity = '0';
      }, 30 + Math.random()*200);
      setTimeout(()=> { if (p.parentNode) p.parentNode.removeChild(p); }, 1200 + Math.random()*400);
    }
  }

  // the actual polyfill
  window.__tetrisEffects.triggerGameOver = function(score){
    window.__tetrisEffects.clearGameOver();
    overlay.style.pointerEvents = 'auto';

    const wrapper = document.createElement('div');
    _goEl = wrapper;
    Object.assign(wrapper.style, {
      position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
      zIndex:2147483647, pointerEvents:'auto', textAlign:'center'
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      minWidth: '320px', maxWidth: '640px',
      padding: '22px', borderRadius:'12px',
      background:'linear-gradient(180deg, rgba(6,8,12,.9), rgba(12,14,20,.96))',
      color:'#fff', boxShadow:'0 20px 60px rgba(0,0,0,.6)', border:'1px solid rgba(255,255,255,0.04)'
    });

    const title = document.createElement('div');
    title.textContent = 'Game Over';
    Object.assign(title.style, { fontSize:'28px', fontWeight:800, marginBottom:'8px', background:'linear-gradient(90deg,#ff6b6b,#ffd166,#7dd3fc)', WebkitBackgroundClip:'text', color:'transparent' });

    const sc = document.createElement('div');
    sc.textContent = 'Score: ' + (typeof score === 'number' ? score : '--');
    Object.assign(sc.style, { fontSize:'16px', marginBottom:'10px', opacity:0.95 });

    const hint = document.createElement('div');
    hint.textContent = 'Press R or click Restart';
    Object.assign(hint.style, { fontSize:'13px', color:'#cfe9ff', marginBottom:'12px' });

    const actions = document.createElement('div');
    Object.assign(actions.style, { display:'flex', gap:'10px', justifyContent:'center' });

    const restartBtn = document.createElement('button');
    restartBtn.textContent = 'Restart';
    Object.assign(restartBtn.style, { padding:'8px 12px', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.03)', color:'#fff', fontWeight:700, cursor:'pointer' });
    restartBtn.addEventListener('click', ()=>{
      try { if (window.tetrisAPI && typeof window.tetrisAPI.restart === 'function') window.tetrisAPI.restart(); } catch(e){}
      window.__tetrisEffects.clearGameOver();
    });

    const menuBtn = document.createElement('button');
    menuBtn.textContent = 'Menu';
    Object.assign(menuBtn.style, { padding:'8px 12px', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', color:'#fff', fontWeight:700, cursor:'pointer' });
    menuBtn.addEventListener('click', ()=>{
      try { if (window.tetrisAPI && typeof window.tetrisAPI.showMenu === 'function') window.tetrisAPI.showMenu(); } catch(e){}
      window.__tetrisEffects.clearGameOver();
    });

    actions.appendChild(restartBtn);
    actions.appendChild(menuBtn);

    card.appendChild(title);
    card.appendChild(sc);
    card.appendChild(hint);
    card.appendChild(actions);

    wrapper.appendChild(card);
    document.body.appendChild(wrapper);

    // quick confetti
    spawnConfetti(28);

    // auto-clear after some time (but keep it interactive until cleared)
    setTimeout(()=>{ /* leave in place for manual clear */ }, 2000);

    console.log('Polyfilled triggerGameOver called with score=', score);
  };

  console.log('Polyfill installed: window.__tetrisEffects.triggerGameOver()');
})();
