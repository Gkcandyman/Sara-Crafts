const http = require('http');
const app = require('./app');

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';

http.createServer((req, res) => {
  app(req, res).catch(error => {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Server error', message: error.message }));
  });
}).listen(PORT, HOST, () => {
  console.log(`Sara Crafts website running at http://${HOST}:${PORT}`);
});
