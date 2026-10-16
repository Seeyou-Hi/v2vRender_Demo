import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { proxyRender } from './backend-proxy.mjs';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };
export function createAppServer(backend = process.env.KREA_BACKEND_URL || 'http://127.0.0.1:8001') {
  return http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/render/')) { proxyRender(req, res, backend); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        res.writeHead(403); res.end(); return;
      }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('Not found');
    }
  });
}
export const server = createAppServer();
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  const port = Number(process.argv[2] || 5175);
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`ARMATURE: http://127.0.0.1:${port}\nPress Ctrl+C to stop.`));
}
