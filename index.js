import http from 'node:http'
import { once } from 'node:events'
import { json } from 'http-responders'

const server = http.createServer((req, res) => {
  if (req.url === '/retrieval') {
    json(res, { message: 'Hello World!' })
    return
  }
  res.end('Hello World!')
})

server.listen(8080)
await once(server, 'listening')
console.log('http://localhost:8080')
