# spark-api
[SPARK](https://github.com/filecoin-station/spark) API

[![CI](https://github.com/filecoin-station/spark-api/actions/workflows/ci.yml/badge.svg)](https://github.com/filecoin-station/spark-api/actions/workflows/ci.yml)

## Routes

### `POST /retrieval`

Start a new retrieval.

Response:

```typescript
{
  id: String,
  cid: String,
  providerAddress: String,
  protocol: 'graphsync'|'bitswap'
}
```

### `PATCH /retrieval/:id`

_TODO_

## Development

1. Set up [PostgreSQL](https://www.postgresql.org/) with default settings:
  - Port: 5432
  - User: _your user name_
  - Password: _blank_
  - Database: _same as user name_
1. `npm start`

## Deployment

Pushes to `main` will be deployed automatically.

Perform manual devops using [Fly.io](https://fly.io):

```bash
$ fly deploy
```
