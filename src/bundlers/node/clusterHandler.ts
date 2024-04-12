export const clusterWrapperCode = `import http from "http";
import { handler as userHandler } from "./index.mjs";
import url from "url";
import querystring from "querystring"

const port = process.argv[2];
const server = http.createServer()
server.on('request', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const chunks = [];
  req.on('data', chunk => {
    chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const body = Buffer.concat(chunks);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      const parsed_url = url.parse(req.url)
      const requestContext = {
        http: {
          method: req.method,
          path: parsed_url.pathname,
          protocol: req.protocol,
          sourceIp: req.socket.remoteAddress,
          userAgent: req.headers["user-agent"],
        }
      }

      userHandler({
        headers: req.headers,
        body: body,
        requestContext,
        queryStringParameters: querystring.parse(parsed_url.query),
      }).then((response) => {
        res.end(response.body)
      })
    }
    catch (error) {
      console.log(error)
      res.end("400 bad request")
    }
  });
})

server.listen(port, () => {
})

export { server }

`;
