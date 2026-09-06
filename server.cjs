const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.env.PORT || 3000);
http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(path.join(__dirname, 'index.html'), (error, html) => {
    res.writeHead(error ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(error ? 'Could not load page' : html);
  });
}).listen(port, '0.0.0.0', () => console.log(`Local: http://localhost:${port}`));
