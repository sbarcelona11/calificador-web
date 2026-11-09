// Servidor estatico minimo para uso local sin Docker: node serve.js  (PORT opcional, por defecto 8081)
const http = require('http'), fs = require('fs'), path = require('path');
const file = path.join(__dirname, 'dist/index.html'), port = process.env.PORT || 8081;
const headers = {
  'Content-Type': 'text/html; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src data:; base-uri 'none'; form-action 'none'"
};
http.createServer((q, s) => {
  if (q.url !== '/' && q.url !== '/index.html') { s.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); s.end('Not found'); return; }
  s.writeHead(200, headers); fs.createReadStream(file).pipe(s);
}).listen(port, () => console.log('http://localhost:' + port));
