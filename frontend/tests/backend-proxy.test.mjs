import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createAppServer } from '../server.mjs';

const id = 'a'.repeat(32);
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };

test('same-origin proxy preserves uploads, job requests, chunks and errors', async t => {
  const requests = [];
  const backend = http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    requests.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(parts) });
    if (req.url.endsWith('.mp4')) { res.setHeader('Content-Type', 'video/mp4'); res.end('video-fixture'); return; }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/uploads/mp4') { res.writeHead(201); res.end(JSON.stringify({ upload: `${id}.mp4` })); return; }
    if ((req.url === '/jobs' || req.url === '/streams')) { res.writeHead(202); res.end(JSON.stringify({ id })); return; }
    res.end(JSON.stringify(req.url === '/health' ? { backend: 'krea' } : { status: 'completed' }));
  });
  const target = await listen(backend);
  t.after(() => close(backend));
  const frontend = createAppServer(target), origin = await listen(frontend);
  t.after(() => close(frontend));
  const call = (route, options) => fetch(origin + '/api/render' + route, options);
  assert.equal((await (await call('/health')).json()).backend, 'krea');
  const upload = await call('/uploads/mp4', { method: 'POST', body: new Blob(['depth-fixture'], { type: 'video/mp4' }) });
  assert.equal(upload.status, 201);
  assert.equal(requests.at(-1).body.toString(), 'depth-fixture');
  assert.equal(requests.at(-1).headers['content-length'], '13');
  const created = await call('/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ control: `${id}.mp4`, control_kind: 'depth' }) });
  assert.equal(created.status, 202);
  assert.equal(JSON.parse(requests.at(-1).body).control_kind, 'depth');
  assert.equal((await (await call(`/jobs/${id}`)).json()).status, 'completed');
  for (const route of [`/jobs/${id}/chunks/000000.mp4`, `/jobs/${id}/output.mp4`]) {
    const response = await call(route);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal(await response.text(), 'video-fixture');
  }
  assert.equal((await call('/streams', { method: 'POST', body: '{}' })).status, 202);
  assert.equal((await call(`/streams/${id}/frames/000000`, { method: 'POST', body: new Blob(['raw-rgb']) })).status, 200);
  assert.equal(requests.at(-1).body.toString(), 'raw-rgb');
  const {gzipSync, gunzipSync} = await import('node:zlib');
  const compressed = gzipSync(Buffer.from('depth-pixels'));
  assert.equal((await call(`/streams/${id}/frames/000001`, {method:'POST', headers:{'Content-Encoding':'gzip'}, body:compressed})).status, 200);
  assert.equal(requests.at(-1).headers['content-encoding'], 'gzip');
  assert.equal(gunzipSync(requests.at(-1).body).toString(), 'depth-pixels');
  assert.equal((await call('/prompt-policy')).status, 200);
  assert.equal(requests.at(-1).url, '/prompt-policy');
  assert.equal((await call('/uploads/png', {method:'POST',body:'image'})).status, 200);
  assert.equal(requests.at(-1).url, '/uploads/png');
  assert.equal((await call(`/streams/${id}/finish`, { method: 'POST', body: '{}' })).status, 200);
  assert.equal((await (await call(`/streams/${id}`)).json()).status, 'completed');
  assert.equal(await (await call(`/streams/${id}/chunks/000000.mp4`)).text(), 'video-fixture');
  const count = requests.length;
  assert.equal((await call('/jobs/invalid')).status, 404);
  assert.equal((await call('/health', { method: 'DELETE' })).status, 404);
  assert.equal(requests.length, count);
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('id="backend-enabled"'));
  await close(backend);
  const unavailable = await call('/health');
  assert.equal(unavailable.status, 502);
  assert.ok((await unavailable.json()).error.includes('无法连接'));
});
