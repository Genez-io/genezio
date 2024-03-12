export function generateNodeClusterHandler() {
    return `
import http from "http";
import { handler as userHandler } from "./index.mjs";

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

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      if (body === "") {
        res.end(JSON.stringify({ message: "No body" }));
        return;
      }

      const requestContext = {
        http: {
          method: "POST",
          path: "/",
          protocol: "1.1",
          sourceIp: "::1",
          userAgent: req.headers["user-agent"],
        }
      }

      const jsonParsedBody = {
        body: body,
        requestContext: requestContext
      };

      userHandler(jsonParsedBody).then((response) => {
        res.end(response.body);
      })
    } catch (error) {
    }
  });
})

server.listen(port, () => {
})

export { server }
    
`;
}
