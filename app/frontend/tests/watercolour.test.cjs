const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

function mount({ reduced = false, paused = false, compact = false, contextAvailable = true } = {}) {
  let draws = 0, fillCount = 0, clock = 1000, nextFrame = 0, cleanup;
  const frames = new Map(), hostEvents = new Map(), documentEvents = new Map();
  const stateWrites = [];
  const ctx = new Proxy({
    clearRect() { draws++; }, fill() { fillCount++; },
    createLinearGradient() { return { addColorStop() {} }; },
    createPattern() { return {}; },
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const host = {
    addEventListener(name, fn, options) { hostEvents.set(name, { fn, options }); },
    removeEventListener(name) { hostEvents.delete(name); },
  };
  const canvas = {
    parentElement: { parentElement: host },
    getContext() { return contextAvailable ? ctx : null; },
    getBoundingClientRect() { return { width: 800, height: 400, left: 0, top: 0 }; },
  };
  const document = {
    hidden: false,
    createElement() { return { getContext: () => ctx }; },
    addEventListener(name, fn) { documentEvents.set(name, fn); },
    removeEventListener(name) { documentEvents.delete(name); },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/components/WatercolorCanvas.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = {
    exports: {}, document, devicePixelRatio: 1,
    performance: { now: () => clock },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    require(name) {
      if (name === 'react') return { useRef: () => ({ current: canvas }), useState: v => [v, v => stateWrites.push(v)], useEffect: fn => { cleanup = fn(); } };
      if (name.includes('useReducedMotion')) return { useReducedMotion: () => reduced };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      throw new Error('Unexpected dependency: ' + name);
    },
  };
  vm.runInNewContext(compiled, sandbox);
  sandbox.exports.default({ compact, paused });
  return {
    frames, hostEvents, documentEvents, document, stateWrites,
    get draws() { return draws; }, get fills() { return fillCount; },
    tick(ms = 100) { clock += ms; const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(clock)); },
    point(pointerType = 'mouse') { clock += 100; hostEvents.get('pointermove').fn({ clientX: 440, clientY: 300, pointerType }); },
    cleanup() { cleanup?.(); },
  };
}
test('painting responds to mouse and touch through passive parent listeners', () => {
  const app = mount();
  assert.equal(app.hostEvents.get('pointermove').options.passive, true);
  app.tick(); const initial = app.fills;
  app.point(); assert.ok(app.fills > initial + 35, 'pointer adds pigment passes beyond the base landscape');
  const mouse = app.fills; app.point('touch'); assert.ok(app.fills > mouse + 35);
  app.cleanup(); assert.equal(app.frames.size, 0); assert.equal(app.hostEvents.size, 0);
});
test('reduced motion paints a still view without an ongoing frame loop', () => {
  const app = mount({ reduced: true }); app.tick();
  assert.ok(app.draws > 0); assert.equal(app.frames.size, 0);
  const before = app.draws; app.point(); app.tick();
  assert.ok(app.draws > before); assert.equal(app.frames.size, 0); app.cleanup();
});
test('manual pause disables motion and new pigment', () => {
  const app = mount({ paused: true }); app.tick(); const before = app.draws;
  app.point(); assert.equal(app.draws, before); assert.equal(app.frames.size, 0); app.cleanup();
});
test('hidden pages cancel animation and visible pages resume', () => {
  const app = mount(); assert.equal(app.frames.size, 1);
  app.document.hidden = true; app.documentEvents.get('visibilitychange')(); assert.equal(app.frames.size, 0);
  app.document.hidden = false; app.documentEvents.get('visibilitychange')(); assert.equal(app.frames.size, 1); app.cleanup();
});
test('compact page-header washes finish rather than continuously animate', () => {
  const app = mount({ compact: true }); for (let i = 0; i < 35; i++) app.tick();
  assert.equal(app.frames.size, 0); app.cleanup();
});
test('unavailable Canvas activates the SVG fallback', () => {
  const app = mount({ contextAvailable: false }); assert.deepEqual(app.stateWrites, [true]); assert.equal(app.frames.size, 0);
});
