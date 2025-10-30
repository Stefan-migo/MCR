const { createServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;

// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Try to create HTTPS server, fallback to HTTP if certificates don't exist
let httpsOptions;
let useHttps = false;

try {
  httpsOptions = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
  };
  useHttps = true;
  console.log('🔒 HTTPS certificates found');
} catch (error) {
  console.log('⚠️ HTTPS certificates not found, using HTTP');
  useHttps = false;
}

const protocol = useHttps ? 'https' : 'http';

app.prepare().then(() => {
  const requestHandler = async (req, res) => {
    try {
      // Be sure to pass `true` as the second argument to `url.parse`.
      // This tells it to parse the query portion of the URL.
      const parsedUrl = parse(req.url, true);
      const { pathname, query } = parsedUrl;

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  };

  const serverToUse = useHttps 
    ? createHttpsServer(httpsOptions, requestHandler)
    : createServer(requestHandler);

  serverToUse
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on ${protocol}://${hostname}:${port}`);
      console.log(`> Mobile access: ${protocol}://192.168.100.11:${port}`);
    });
});
