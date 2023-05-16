import { json } from 'http-responders'

export const handle = (req, res) => {
  if (req.url === '/retrieval') {
    json(res, { hello: 'world' })
    return
  }
  res.end('Hello World!')
}
