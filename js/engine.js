// Minimal engine implementation to support the Tetris code's API.
// Exposes globals used by the original code: Rectangle, Text, Line, WebImage, Color,
// Keyboard, add, remove, removeAll, setSize, getWidth, getHeight,
// mouseClickMethod, mouseMoveMethod, keyDownMethod, showMenu is in game.js.

(function(global){
  // Canvas & context
  const canvas = document.getElementById('game');
  const container = document.getElementById('stage-container');
  const ctx = canvas.getContext('2d');

  // Scene objects (draw order preserved)
  let scene = [];

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  // Basic Color map
  const Color = {
    BLACK: "#000000",
    WHITE: "#ffffff",
    RED: "#ff3b30",
    GREEN: "#34c759",
    YELLOW: "#ffcc00",
    BLUE: "#007aff",
    PURPLE: "#af52de",
    CYAN: "#5ac8fa",
    ORANGE: "#ff9500",
    GRAY: "#aaaaaa"
  };

  // Keyboard key codes / helpers
  const Keyboard = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SPACE: 32
  };

  // Base Drawable
  class Drawable {
    constructor() {
      this._x = 0; this._y = 0;
      this._w = 0; this._h = 0;
      this._color = Color.WHITE;
      this._border = null;
      this._visible = true;
      this._anchor = { horizontal:0, vertical:0 };
    }
    setPosition(x,y){ this._x = x; this._y = y; return this; }
    setSize(w,h){ this._w = w; this._h = h; return this; }
    setColor(c){ this._color = c; return this; }
    setBorderColor(c){ this._border = c; return this; }
    setAnchor(a){ if (a && typeof a === 'object') this._anchor = a; return this; }
    getX(){ return this._x; }
    getY(){ return this._y; }
    getWidth(){ return this._w; }
    getHeight(){ return this._h; }
    // get bounding used by mouse checks (account for anchor)
    _getDrawPos(){
      return {
        x: this._x - this._w * (this._anchor.horizontal || 0),
        y: this._y - this._h * (this._anchor.vertical || 0)
      };
    }
  }

  class Rectangle extends Drawable {
    constructor(w,h){
      super();
      this._w = w||0; this._h = h||0;
    }
  }

  class Line extends Drawable {
    // Line(x1,y1,x2,y2)
    constructor(x1,y1,x2,y2){
      super();
      this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
      this._w = Math.abs(x2-x1);
      this._h = Math.abs(y2-y1);
    }
    // we keep setPosition as top-left of bounding box for compatibility
    setPosition(x,y){
      const dx = x - Math.min(this.x1,this.x2);
      const dy = y - Math.min(this.y1,this.y2);
      this.x1 += dx; this.x2 += dx; this.y1 += dy; this.y2 += dy;
      return this;
    }
  }

  class Text extends Drawable {
    constructor(text, font){
      super();
      this._text = text || "";
      this._font = font || "14pt Arial";
    }
    setText(t){ this._text = t; return this; }
    setFont(f){ this._font = f; return this; }
  }

  class WebImage extends Drawable {
    constructor(src){
      super();
      this._img = new Image();
      this._loaded = false;
      this._img.onload = () => {
        this._loaded = true;
        if (!this._w) this._w = this._img.width;
        if (!this._h) this._h = this._img.height;
      };
      this._img.src = src;
    }
    setSize(w,h){ super.setSize(w,h); return this; }
    getWidth(){ return this._w; }
    getHeight(){ return this._h; }
    getImage(){ return this._img; }
    isLoaded(){ return this._loaded; }
  }

  // Scene control
  function add(obj){
    scene.push(obj);
    return obj;
  }
  function remove(obj){
    const i = scene.indexOf(obj);
    if (i>=0) scene.splice(i,1);
  }
  function removeAll(){
    scene.length = 0;
  }

  // Canvas size helpers
  function setSize(w,h){
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    container.style.width = (w) + 'px';
    container.style.height = (h) + 'px';
  }
  function getWidth(){ return canvas.width; }
  function getHeight(){ return canvas.height; }

  // Input: mouse & keyboard event callbacks (user expects e.getX(), e.getY())
  let _mouseClickCallback = null;
  let _mouseMoveCallback = null;
  let _keyDownCallback = null;

  function mouseClickMethod(fn){
    _mouseClickCallback = fn;
  }
  function mouseMoveMethod(fn){
    _mouseMoveCallback = fn;
  }
  function keyDownMethod(fn){
    // note: multiple registrations will replace previous (same as original)
    _keyDownCallback = fn;
  }

  // Map DOM events to wrapper events expected by the Tetris code
  function _makeMouseEvent(e){
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    return {
      getX(){ return x; },
      getY(){ return y; },
      original: e
    };
  }

  canvas.addEventListener('click', (e) => {
    canvas.focus();
    if (_mouseClickCallback) _mouseClickCallback(_makeMouseEvent(e));
  });
  canvas.addEventListener('mousemove', (e) => {
    if (_mouseMoveCallback) _mouseMoveCallback(_makeMouseEvent(e));
  });

  window.addEventListener('keydown', (e) => {
    if (_keyDownCallback) _keyDownCallback(e);
  });

  // Rendering loop
  function render(){
    // clear
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // draw scene in order
    for (let obj of scene){
      if (!obj || !obj._visible) continue;
      if (obj instanceof Rectangle){
        const pos = obj._getDrawPos();
        ctx.fillStyle = obj._color || Color.WHITE;
        ctx.fillRect(pos.x, pos.y, obj._w, obj._h);
        if (obj._border) {
          ctx.strokeStyle = obj._border;
          ctx.strokeRect(pos.x+0.5, pos.y+0.5, obj._w-1, obj._h-1);
        }
      } else if (obj instanceof Line){
        ctx.beginPath();
        ctx.strokeStyle = obj._color || Color.WHITE;
        ctx.moveTo(obj.x1, obj.y1);
        ctx.lineTo(obj.x2, obj.y2);
        ctx.stroke();
      } else if (obj instanceof Text){
        ctx.font = obj._font || "14pt Arial";
        ctx.fillStyle = obj._color || Color.WHITE;
        // simple multi-line support
        const lines = (obj._text||"").split("\n");
        const pos = obj._getDrawPos();
        let y = pos.y;
        for (let i=0;i<lines.length;i++){
          const line = lines[i];
          // Adjust baseline to match the small "setPosition offsets" used in original code:
          ctx.textBaseline = 'top';
          ctx.fillText(line, pos.x, y);
          y += parseInt((obj._font||"14pt").match(/\d+/)||14) + 2;
        }
      } else if (obj instanceof WebImage){
        const pos = obj._getDrawPos();
        if (obj.isLoaded()){
          ctx.drawImage(obj.getImage(), pos.x, pos.y, obj._w, obj._h);
        } else {
          // placeholder until loaded
          ctx.fillStyle = "#222";
          ctx.fillRect(pos.x, pos.y, obj._w, obj._h);
        }
      } else {
        // fallback draw rectangle if unknown
        const pos = obj._getDrawPos ? obj._getDrawPos() : {x:obj._x||0,y:obj._y||0};
        ctx.fillStyle = obj._color||Color.WHITE;
        ctx.fillRect(pos.x, pos.y, obj._w||10, obj._h||10);
      }
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // Export to global
  global.Rectangle = Rectangle;
  global.Line = Line;
  global.Text = Text;
  global.WebImage = WebImage;
  global.Color = Color;
  global.Keyboard = Keyboard;

  global.add = add;
  global.remove = remove;
  global.removeAll = removeAll;
  global.setSize = setSize;
  global.getWidth = getWidth;
  global.getHeight = getHeight;
  global.mouseClickMethod = mouseClickMethod;
  global.mouseMoveMethod = mouseMoveMethod;
  global.keyDownMethod = keyDownMethod;

  // expose canvas for direct access if needed
  global._engineCanvas = canvas;

})(window);