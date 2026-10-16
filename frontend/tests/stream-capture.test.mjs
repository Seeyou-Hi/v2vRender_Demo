import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { StreamSender } from '../dist/stream-sender.js';

const source = await readFile(new URL('../dist/stream-capture.js', import.meta.url), 'utf8');
function setup(view, wristArm = '1', kind = 'depth', open = async () => {}, inputFormat = 'rgb24') {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', disabled: false, textContent: '' });
    return elements.get(id);
  };
  element('record-view').value = view;
  element('wrist-arm').value = wristArm;
  const calls = [], sent = [], comparison = [], released = [], controls = [element('record-view'), element('wrist-arm'), element('stream-release-upload')];
  let busy = false, opened = 0, disposed = 0, cancelled = 0;
  const context = { canStart: () => true, getCaptureCamera: () => 'live-camera',
    backend: {
      isBusy: () => busy, settings: () => ({ kind }),
      async openStream() { opened++; await open(); busy = true; return { max_frames: 4800, input_format: inputFormat }; },
      async pushStream(sequence, body) { sent.push({ sequence, body }); },
      async finishStream() { busy = false; }, async cancelStream() { cancelled++; busy = false; },
    },
  };
  const sandbox = { Uint8Array, Blob, performance, setTimeout, StreamSender,
    document: { hidden: false, getElementById: element, querySelectorAll: () => controls },
    window: { addEventListener() {} },
    streamComparison: { full: false, add(...args) { comparison.push(args); }, releaseUploaded(index) { released.push(index); } },
    createCaptureResources: () => ({ dispose() { disposed++; } }),
    async captureScene(options) {
      calls.push(options);
      const rgb = new Uint8Array(640 * 384 * 4), depthPreview = new Uint8Array(rgb.length);
      for (let i = 0; i < rgb.length; i += 4) { rgb.set([10, 20, 30, 255], i); depthPreview.set([42, 42, 42, 255], i); }
      return { frames: [{ rgb, depthPreview }],
        metadata: { cameras: { [options.views[0]]: { selected: options.views[0], wrist: options.wristArm } } } };
    },
  };
  // Execute the real controller with only GPU/DOM boundaries substituted.
  vm.createContext(sandbox);
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace('export function ', 'function ')
    + '\nthis.install = installStreamCapture;', sandbox);
  const controller = sandbox.install(context);
  return { element, calls, sent, comparison, released, controller, start: () => element('stream-start').onclick(),
    get opened() { return opened; }, get disposed() { return disposed; }, get cancelled() { return cancelled; } };
}
for (const view of ['ext1', 'ext2', 'wrist', 'viewport']) {
  test('stream captures selected ' + view + ' camera and sends matching depth', async () => {
    const s = setup(view);
    await s.start();
    assert.equal(s.element('record-view').value, view);
    assert.equal(s.element('record-view').disabled, true);
    s.controller.tick(0);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(Array.from(s.calls[0].views), [view]);
    assert.equal(s.calls[0].wristArm, 1);
    assert.equal(s.calls[0].getCaptureCamera(), 'live-camera');
    assert.equal(s.comparison[0][3].selected, view);
    await s.controller.stop();
    assert.equal(s.sent.length, 1);
    const pixels = new Uint8Array(await s.sent[0].body.arrayBuffer());
    assert.deepEqual(Array.from(pixels.slice(0, 3)), [42, 42, 42]);
    assert.equal(s.element('record-view').disabled, false);
    assert.equal(s.disposed, 1);
  });
}
test('multi-view is rejected before allocating capture or opening a backend stream', async () => {
  const s = setup('all');
  await s.start();
  assert.equal(s.opened, 0);
  assert.equal(s.element('record-view').value, 'all');
  assert.match(s.element('stream-status').textContent, /单视角/);
  assert.equal(s.disposed, 0);
});

test('successful full blocks and final tail release the matching global frame ranges', async () => {
  const s = setup('ext1'); await s.start();
  assert.equal(s.element('stream-release-upload').disabled, true);
  for (let i=0; i<23; i++) { s.controller.tick(i*200); await new Promise(resolve => setImmediate(resolve)); }
  assert.deepEqual(s.released, [8,20]);
  await s.controller.stop(); assert.deepEqual(s.released, [8,20,22]);
  assert.equal(s.element('stream-release-upload').disabled, false);
});

test('negotiated gray8 depth transmits one byte per pixel without altering control values', async () => {
  const s = setup('ext2', '0', 'depth', async () => {}, 'gray8');
  await s.start(); s.controller.tick(0); await new Promise(resolve => setImmediate(resolve));
  await s.controller.stop();
  const bytes = new Uint8Array(await s.sent[0].body.arrayBuffer());
  assert.equal(bytes.length, 640 * 384); assert.ok(bytes.every(v => v === 42));
  assert.equal(s.comparison[0][2].length, bytes.length * 4);
});
test('camera and wrist choice stay consistent while opening the stream; Canny receives RGB', async () => {
  let s;
  s = setup('wrist', '1', 'canny', async () => {
    s.element('record-view').value = 'ext2';
    s.element('wrist-arm').value = '0';
  });
  await s.start();
  s.controller.tick(0);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(s.calls[0].views), ['wrist']);
  assert.equal(s.calls[0].wristArm, 1);
  assert.equal(s.calls[0].saveDepth, false);
  await s.controller.stop();
  assert.deepEqual(Array.from(new Uint8Array(await s.sent[0].body.arrayBuffer()).slice(0, 3)), [10, 20, 30]);
});
