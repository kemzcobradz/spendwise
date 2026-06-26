/**
 * SpendWise - shared data server
 * No npm install needed. Just run:  node server.js
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const PORT      = 3000;
const HTML_FILE = path.join(__dirname, 'expense-tracker.html');
const DATA_FILE = path.join(__dirname, 'spendwise-data.json');

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { txs: [], products: [], budget: null, settings: {} }; }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  Object.values(ifaces).forEach(list => {
    list.forEach(i => { if (i.family === 'IPv4' && !i.internal) ips.push(i.address); });
  });
  return ips;
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  // GET /api/data
  if (url === '/api/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readData()));
    return;
  }

  // POST /api/data
  if (url === '/api/data' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      writeData(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // GET /api/lazada?q=... - proxy to Omkar Cloud (avoids browser CORS)
  if (url === '/api/lazada' && req.method === 'GET') {
    const params = new URLSearchParams(req.url.split('?')[1] || '');
    const query  = params.get('q') || '';
    const data   = readData();
    const apiKey = (data.settings && data.settings.omkarKey) ? data.settings.omkarKey : '';

    if (!query) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing ?q= parameter' }));
      return;
    }

    const options = {
      hostname: 'lazada-scraper.omkar.cloud',
      path: '/lazada/catalog/search?search_query=' + encodeURIComponent(query) + '&marketplace=ph',
      method: 'GET',
      headers: { 'API-Key': apiKey }
    };

    const proxyReq = https.request(options, proxyRes => {
      let body = '';
      proxyRes.on('data', chunk => { body += chunk; });
      proxyRes.on('end', () => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(body);
      });
    });
    proxyReq.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    proxyReq.end();
    return;
  }

  // GET / - serve HTML
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    try {
      const html = fs.readFileSync(HTML_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Could not read expense-tracker.html');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('\nSpendWise server running!');
  console.log('  Local:   http://localhost:' + PORT);
  ips.forEach(ip => console.log('  Network: http://' + ip + ':' + PORT));
  console.log('  Data:    spendwise-data.json');
  console.log('  Ctrl+C to stop\n');
});
