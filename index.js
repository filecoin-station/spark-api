import http from 'node:http'
import { once } from 'node:events'

const server = http.createServer((req, res) => {
  res.end('Hello World!')
})

server.listen(8080)
await once(server, 'listening')
console.log('http://localhost:8080')
