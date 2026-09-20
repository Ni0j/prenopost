import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import config from './dist/config.js';

const root = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/dist/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return res.end(`export default ${JSON.stringify({ url: process.env.SUPABASE_URL || config.url, key: process.env.SUPABASE_PUBLISHABLE_KEY || config.key })};`);
  }
  const isIndex = pathname === '/' || pathname === '/index.html';
  const file = isIndex ? resolve('index.html') : resolve(root, '.' + pathname.slice('/dist'.length));
  if (!isIndex && (!pathname.startsWith('/dist/') || !file.startsWith(root + '/'))) { res.writeHead(404); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log(`Open http://localhost:${Number(process.env.PORT || 5173)}`));
