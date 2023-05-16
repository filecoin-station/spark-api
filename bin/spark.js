import http from 'node:http'
import { once } from 'node:events'
import { handle } from '../index.js'

const server = http.createServer(handle)
server.listen(8080)
await once(server, 'listening')
console.log('http://localhost:8080')
