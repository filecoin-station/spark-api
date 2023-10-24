import assert from 'node:assert'
import pg from 'pg'
import { mapRequestToInetGroup, mapRequestToSubnet, mapSubnetToInetGroup } from '../lib/inet-grouping.js'
import { Request as FakeRequest } from 'light-my-request/lib/request.js'
import { migrate } from '../lib/migrate.js'

const { DATABASE_URL } = process.env

let pgClient

before(async () => {
  pgClient = new pg.Client({ connectionString: DATABASE_URL })
  await pgClient.connect()
  await migrate(pgClient)
})

after(async () => {
  await pgClient.end()
})

describe('mapRequestToInetGroup', () => {
  beforeEach(async () => {
    await pgClient.query('DELETE FROM inet_groups')
  })

  it('returns a randomly assigned group based on IPv4 /24 subnet', async () => {
    const first = await mapRequestToInetGroup(pgClient, createRequestFromAddress('10.20.30.1'))
    assert.match(first, /^.{12}$/)

    // Different address in the same /24 subnet
    const second = await mapRequestToInetGroup(pgClient, createRequestFromAddress('10.20.30.2'))
    assert.strictEqual(second, first)

    // Different /24 subnet
    const different = await mapRequestToInetGroup(pgClient, createRequestFromAddress('10.20.99.1'))
    assert.notStrictEqual(different, first)
  })
})

describe('mapRequestToSubnet', () => {
  it('maps IPv4 address to /24 subnet', () => {
    const group = mapRequestToSubnet(createRequestFromAddress('10.20.30.40'))
    assert.strictEqual(group, '10.20.30.0/24')
  })

  it('maps IPv4-inside-IPv6 to IPv4 /24 subnet', () => {
    const group = mapRequestToSubnet(createRequestFromAddress('::ffff:127.0.0.1'))
    assert.strictEqual(group, '127.0.0.0/24')
  })

  it('rejects IPv6 addresses', () => {
    const group = mapRequestToSubnet(createRequestFromAddress('bf27:c63a:689a:da7c:8150:6e23:1045:045d'))
    assert.strictEqual(group, undefined)
  })

  it('parses `Fly-Client-IP` request header', () => {
    const req = createRequestFromAddress('10.20.30.40', {
      'Fly-Client-IP': '1.2.3.4'
    })
    const group = mapRequestToSubnet(req)
    assert.strictEqual(group, '1.2.3.0/24')
  })

  it('parses `fly-client-ip` request header', () => {
    const req = createRequestFromAddress('10.20.30.40', {
      'fly-client-ip': '1.2.3.4'
    })
    const group = mapRequestToSubnet(req)
    assert.strictEqual(group, '1.2.3.0/24')
  })

  it('parses `CF-Connecting-IP', () => {
    const req = createRequestFromAddress('10.20.30.40', {
      'CF-Connecting-IP': '50.60.70.80'
    })
    const group = mapRequestToSubnet(req)
    assert.strictEqual(group, '50.60.70.0/24')
  })
})

describe('mapSubnetToInetGroup', () => {
  beforeEach(async () => {
    await pgClient.query('DELETE FROM inet_groups')
  })

  it('maps a newly seen subnet', async () => {
    const now = new Date('2023-10-24T10:20:30.456Z')
    const group = await mapSubnetToInetGroup(pgClient, '127.0.0.0/24', now)
    assert.match(group, /^uTa.{9}$/)

    const { rows } = await pgClient.query('SELECT * FROM inet_groups')
    assert.deepStrictEqual(rows, [
      {
        id: group,
        subnet: '127.0.0.0/24',
        created_at: now
      }
    ])
  })

  it('maps an already seen subnet', async () => {
    const now = new Date('2023-10-24T10:20:30.456Z')
    const first = await mapSubnetToInetGroup(pgClient, '127.0.0.0/24', now)
    const second = await mapSubnetToInetGroup(pgClient, '127.0.0.0/24', new Date())
    assert.strictEqual(first, second)

    const { rows } = await pgClient.query('SELECT * FROM inet_groups')
    assert.deepStrictEqual(rows, [
      {
        id: first,
        subnet: '127.0.0.0/24',
        created_at: now
      }
    ])
  })
})

const createRequestFromAddress = (remoteAddress, headers) => {
  return new FakeRequest({
    method: 'GET',
    url: '/',
    remoteAddress,
    headers
  })
}
