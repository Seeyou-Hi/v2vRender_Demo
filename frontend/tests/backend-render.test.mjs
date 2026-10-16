import assert from 'node:assert/strict';
import test from 'node:test';
import { installBackendRendering, renderAPI, renderRequest, resolveRenderApi } from '../dist/backend-render.js';

function setup(t, respond) {
  const elements = new Map();
  function element() {
    return { value: '', checked: false, hidden: true, options: [], attributes: {}, ended: false,
      append(option) { this.options.push(option); }, replaceChildren() { this.options = []; },
      removeAttribute(key) { delete this.attributes[key]; }, getAttribute(key) { return this.attributes[key]; },
      set src(value) { this.attributes.src = value; }, get src() { return this.attributes.src; },
      pause() {}, load() {}, async play() {} };
  }
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const saved = { document: globalThis.document, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout };
  const timers = [], requests = [];
  globalThis.document = { getElementById: get, createElement: element };
  globalThis.setTimeout = callback => { timers.push(callback); };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return respond(url, options);
  };
  t.after(() => Object.assign(globalThis, saved));
  const controller = installBackendRendering();
  return { get, timers, requests, controller };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const id = 'b'.repeat(32);

test('render API follows the script mount path through a port-forwarding proxy', () => {
  assert.equal(resolveRenderApi('http://127.0.0.1:5175/backend-render.js'), '/api/render');
  assert.equal(resolveRenderApi('https://work.example/proxy/5175/backend-render.js?v=2'), '/proxy/5175/api/render');
  assert.equal(resolveRenderApi('https://work.example/user/demo/proxy/5175/backend-render.js'), '/user/demo/proxy/5175/api/render');
});

test('upload-release setting defaults off and follows the checkbox', t => {
  const { controller, get } = setup(t, () => json({}));
  assert.equal(controller.settings().releaseAfterUpload,false);
  get('stream-release-upload').checked=true;
  assert.equal(controller.settings().releaseAfterUpload,true);
});

test('HTML and plain-text proxy failures report endpoint and status without the npm hint', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('<html>Sign in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(renderRequest('/health'), error => error.message.includes('HTML') && error.message.includes('HTTP 200') && error.message.includes(`${renderAPI}/health`) && !error.message.includes('npm'));
  globalThis.fetch = async () => new Response('Not found', { status: 404 });
  await assert.rejects(renderRequest('/streams'), error => error.status === 404 && error.message.includes('HTTP 404'));
});

test('depth recording uploads only its control channel and receives ordered chunks and final download', async t => {
  let polls = 0;
  const { get, timers, requests, controller } = setup(t, (url, options) => {
    if (url.endsWith('/health')) return json({ backend: 'krea', gpus: 2 });
    if (url.endsWith('/uploads/mp4')) return json({ upload: `${id}.mp4` }, 201);
    if (url.endsWith('/jobs')) return json({ id }, 202);
    polls++;
    return json({ status: polls === 1 ? 'running' : 'completed', chunks: polls === 1 ? ['000000.mp4'] : ['000001.mp4', '000000.mp4'] });
  });
  get('backend-enabled').checked = true; get('backend-kind').value = 'depth';
  get('backend-variant').value = 'bf16';
  get('backend-enabled').onchange();
  assert.equal(get('record-view').value, 'viewport');
  assert.equal(get('sequence-fps').value, '5');
  const depth = new Blob(['depth']);
  await controller.submit([{ key: 'viewport/rgb', blob: new Blob(['rgb']) }, { key: 'viewport/depth', blob: depth }], controller.settings());
  await flush();
  assert.equal(requests.find(r => r.url.endsWith('/uploads/mp4')).options.body, depth);
  const job = JSON.parse(requests.find(r => r.url.endsWith('/jobs')).options.body);
  assert.equal(job.control_kind, 'depth'); assert.equal(job.control, `${id}.mp4`);
  assert.equal(get('backend-video').src, `${renderAPI}/jobs/${id}/chunks/000000.mp4`);
  assert.equal(controller.isBusy(), true);
  await timers.shift()(); await flush();
  assert.deepEqual(get('backend-chunk').options.map(o => o.value), ['000000.mp4', '000001.mp4']);
  assert.equal(controller.isBusy(), false);
  assert.equal(get('backend-download').hidden, false);
  assert.equal(get('backend-download').href, `${renderAPI}/jobs/${id}/output.mp4`);
  get('backend-full').onclick();
  assert.equal(get('backend-video').src, `${renderAPI}/jobs/${id}/output.mp4`);
});

test('failed connection permits retry, and failed inference stops polling', async t => {
  let offline = true;
  const { get, controller, timers } = setup(t, url => {
    if (offline) return json({ error: '无法连接后端' }, 502);
    if (url.endsWith('/health')) return json({ backend: 'krea', gpus: 2 });
    if (url.endsWith('/uploads/mp4')) return json({ upload: `${id}.mp4` });
    if (url.endsWith('/jobs')) return json({ id });
    return json({ status: 'failed', progress: { error: '模型加载失败' } });
  });
  await controller.submit([{ key: 'viewport/rgb', blob: new Blob(['rgb']) }], { kind: 'canny', variant: 'bf16', prompt: '' });
  assert.equal(controller.isBusy(), false); assert.equal(get('backend-retry').hidden, false);
  offline = false;
  await get('backend-retry').onclick(); await flush();
  assert.equal(controller.isBusy(), false);
  assert.equal(get('backend-status').textContent, '模型加载失败');
  assert.equal(timers.length, 0);
});

test('live session sends raw chunks before finish without a batch video upload', async t => {
  const { controller, requests, get } = setup(t, url => {
    if (url.endsWith('/health')) return json({ stream_input: true, fps: 16, supported_input_fps: [5, 16] });
    if (url.endsWith('/streams')) return json({ id, max_frames: 4800, input_fps: 5 });
    if (url.endsWith(`/streams/${id}`)) return json({ status: 'running', chunks: ['000000.mp4'] });
    return json({ next_sequence: 1 });
  });
  await controller.openStream({ kind: 'depth', variant: 'bf16', prompt: '' });
  assert.equal(JSON.parse(requests.find(r => r.url.endsWith('/streams')).options.body).input_fps, 5);
  assert.equal(JSON.parse(requests.find(r => r.url.endsWith('/streams')).options.body).input_format, 'rgb24');
  const raw = new Blob(['rgb24']);
  await controller.pushStream(0, raw);
  await flush();
  assert.equal(requests.find(r => r.url.endsWith('/frames/000000')).options.body, raw);
  assert.equal(requests.some(r => r.url.includes('/uploads/')), false);
  assert.equal(get('backend-video').src, `${renderAPI}/streams/${id}/chunks/000000.mp4`);
  await controller.finishStream();
  assert.equal(requests.at(-1).url, `${renderAPI}/streams/${id}/finish`);
});

for (const kind of ['depth', 'canny']) test('input format capability negotiation for ' + kind, async t => {
  const { controller, requests } = setup(t, url => {
    if (url.endsWith('/health')) return json({ stream_input: true, supported_input_fps: [5], supported_input_formats: ['rgb24', 'gray8'] });
    if (url.endsWith('/streams')) return json({ id, input_format: kind === 'depth' ? 'gray8' : 'rgb24' });
    return json({ status: 'running', chunks: [] });
  });
  await controller.openStream({ kind, variant: 'bf16_blocks' });
  assert.equal(JSON.parse(requests.find(r => r.url.endsWith('/streams')).options.body).input_format, kind === 'depth' ? 'gray8' : 'rgb24');
});


test('5 FPS capture refuses a legacy 16 FPS stream backend instead of changing playback speed', async t => {
  const { controller, requests } = setup(t, () => json({ stream_input: true, fps: 16 }));
  await assert.rejects(controller.openStream({ kind: 'depth', variant: 'bf16', prompt: '', inputFps: 5 }), /5 FPS/);
  assert.equal(requests.length, 1);
  assert.equal(controller.isBusy(), false);
});

test('cancelling a stream releases busy state and ignores old scheduled polls', async t => {
  const { controller, requests, timers } = setup(t, url => {
    if (url.endsWith('/health')) return json({stream_input:true, supported_input_fps:[5]});
    if (url.endsWith('/streams')) return json({id});
    return json({status:url.endsWith('/cancel')?'cancelled':'running',chunks:[]});
  });
  await controller.openStream({kind:'depth',variant:'bf16',prompt:''}); await flush();
  await controller.cancelStream(); assert.equal(controller.isBusy(),false);
  const count=requests.length; await timers.shift()(); await flush();
  assert.equal(requests.length,count);
});
