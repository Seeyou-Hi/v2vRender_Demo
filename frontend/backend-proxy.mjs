import http from 'node:http';
import https from 'node:https';

export function proxyRender(req, res, target) {
  const route = req.url.slice('/api/render'.length);
  const pathname = new URL(route, 'http://localhost').pathname;
  const allowed = req.method === 'GET'
    ? /^\/(?:health|prompt-policy|(?:jobs|streams)\/[0-9a-f]{32}(?:\/output\.mp4|\/chunks\/\d{6}\.mp4|\/frames(?:\/\d{6}\.(?:png|jpg))?)?)$/.test(pathname)
    : req.method === 'POST' && /^\/(?:uploads\/(?:mp4|npy|png|jpg|jpeg)|jobs|streams|streams\/[0-9a-f]{32}\/(?:frames\/\d{6}|finish|cancel))$/.test(pathname);
  const fail = (status, message) => {
    if (res.destroyed) return;
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: message }));
  };
  if (!allowed) { fail(404, '未知的渲染接口'); return; }
  let destination;
  try {
    const base = new URL(target);
    if (!['http:', 'https:'].includes(base.protocol)) throw Error('protocol');
    destination = new URL(base.pathname.replace(/\/$/, '') + route, base.origin);
  } catch { fail(502, 'KREA_BACKEND_URL 配置无效'); return; }
  const headers = {};
  for (const name of ['content-type', 'content-length', 'content-encoding', 'range']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  const upstream = (destination.protocol === 'https:' ? https : http).request(destination, {
    method: req.method, headers,
  }, response => {
    const outgoing = { 'Cache-Control': 'no-store' };
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      if (response.headers[name]) outgoing[name] = response.headers[name];
    }
    res.writeHead(response.statusCode, outgoing);
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  upstream.setTimeout(route === '/health' ? 5000 : 120000, () => upstream.destroy(Error('timeout')));
  upstream.on('error', () => fail(502, '无法连接渲染后端，请检查 Krea 服务与 KREA_BACKEND_URL'));
  req.on('aborted', () => upstream.destroy());
  req.on('error', () => upstream.destroy());
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  req.pipe(upstream);
}
