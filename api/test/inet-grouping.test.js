import assert from 'node:assert'
import { setTimeout } from 'node:timers/promises'
import pg from 'pg'
import {
  mapRequestToInetGroup,
  mapRequestToSubnet,
  mapSubnetToInetGroup,
  logNetworkInfo
} from '../lib/inet-grouping.js'
import { Request as FakeRequest } from 'light-my-request/lib/request.js'
import { migrate } from '../../migrations/index.js'
import { Point } from '../../common/telemetry.js'

const { DATABASE_URL } = process.env

const telemetry = []
const recordTelemetry = (measurementName, fn) => {
  const point = new Point(measurementName)
  fn(point)
  telemetry.push(point)
}

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

  it('maps all IPv6 address to the same inet_group', async () => {
    const group = await mapRequestToInetGroup(pgClient, createRequestFromAddress('bf27:c63a:689a:da7c:8150:6e23:1045:045d'))
    assert.strictEqual(group, 'ipv6')
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
    const group = await mapSubnetToInetGroup(pgClient, '127.0.0.0/24')
    assert.match(group, /^[a-zA-Z0-9_-]{12}$/)

    const { rows } = await pgClient.query('SELECT id, subnet FROM inet_groups')
    assert.deepStrictEqual(rows, [
      {
        id: group,
        subnet: '127.0.0.0/24'
      }
    ])
  })

  it('maps an already seen subnet', async () => {
    const first = await mapSubnetToInetGroup(pgClient, '127.0.0.0/24')
    await setTimeout(100)
    const second = await mapSubnetToInetGroup(pgClient, '127.0.0.0/24')
    assert.strictEqual(first, second)

    const { rows } = await pgClient.query('SELECT id, subnet FROM inet_groups')
    assert.deepStrictEqual(rows, [
      {
        id: first,
        subnet: '127.0.0.0/24'
      }
    ])
  })
})

describe('logNetworkInfo', () => {
  let today
  beforeEach(async () => {
    telemetry.splice(0)
    await pgClient.query('DELETE FROM network_info_update_history')

    // Run all tests inside a transaction to ensure `now()` always returns the same value
    // See https://dba.stackexchange.com/a/63549/125312
    // This avoids subtle race conditions when the tests are executed around midnight.
    await pgClient.query('BEGIN TRANSACTION')
    today = await getCurrentDate()
  })

  const headers = {
    'cf-ipcity': 'city2',
    'cf-ipcountry': 'country2',
    'cf-ipcontinent': 'continent2',
    'cf-iplongitude': 'longitude2',
    'cf-iplatitude': 'latitude2',
    'cf-region': 'region2',
    'cf-region-code': 'region-code2',
    'cf-timezone': 'timezone2'
  }

  it('should record new network info and update history table if not present for the day', async () => {
    givenNetworkInfoUpdateHistory(pgClient, today, 'station-id1')
    await logNetworkInfo(pgClient, headers, 'station-id2', 'group-id2', recordTelemetry)

    const expectedFields = {
      station_id: '"station-id2"',
      inet_group: '"group-id2"'
    }
    for (const header in headers) {
      expectedFields[header] = `"${headers[header]}"`
    }
    assert.strictEqual(telemetry.length, 1)
    assert.strictEqual(telemetry[0].name, 'network-info')
    assert.deepStrictEqual(telemetry[0].fields, expectedFields)

    const { rows } = await pgClient.query('SELECT * FROM network_info_update_history')
    assert.strictEqual(rows.length, 2)
  })

  it('should not record new network info nor update history table if present for the day', async () => {
    givenNetworkInfoUpdateHistory(pgClient, today, 'station-id1')
    await logNetworkInfo(pgClient, headers, 'station-id1', 'group-id1', recordTelemetry)
    assert.deepStrictEqual(telemetry, [])

    const { rows } = await pgClient.query('SELECT * FROM network_info_update_history')
    assert.strictEqual(rows.length, 1)
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

const givenNetworkInfoUpdateHistory = async (pgClient, day, stationId) => {
  await pgClient.query(`
    INSERT INTO network_info_update_history (day, station_id)
    VALUES ($1, $2)
    ON CONFLICT (day, station_id) DO NOTHING
  `, [day, stationId])
}

const getCurrentDate = async () => {
  const { rows: [{ today }] } = await pgClient.query('SELECT now()::DATE::TEXT as today')
  return today
}
