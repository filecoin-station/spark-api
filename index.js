import { json } from 'http-responders'

export const createHandler = async (client) => {
  const handler = async (req, res) => {
    if (req.url === '/retrieval') {
      const r = await client.query('SELECT $1::text as hello', ['world'])
      json(res, { hello: r.rows[0].hello })
      return
    }
    res.end('Hello World!')
  }

  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error(err)
      res.statusCode = 500
      res.end('Internal Server Error')
    })
  }
}
