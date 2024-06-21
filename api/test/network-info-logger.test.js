import assert from 'node:assert'
import { Point } from '../../common/telemetry.js'
import { logNetworkInfo } from '../lib/network-info-logger.js'

const telemetry = []
const recordTelemetry = (measurementName, fn) => {
  const point = new Point(measurementName)
  fn(point)
  telemetry.push(point)
}

describe('logNetworkInfo', () => {
  beforeEach(async () => {
    telemetry.splice(0)
  })

  const headers1 = {
    'cf-ipcity': 'city1',
    'cf-ipcountry': 'country1',
    'cf-ipcontinent': 'continent1',
    'cf-iplongitude': 'longitude1',
    'cf-iplatitude': 'latitude1',
    'cf-region': 'region1',
    'cf-region-code': 'region-code1',
    'cf-timezone': 'timezone1'
  }
  const headers2 = {}
  for (const key in headers1) {
    headers2[key] = headers1[key].slice(0, -1) + '2'
  }
  const headers3 = {}
  for (const key in headers1) {
    headers3[key] = headers1[key].slice(0, -1) + '3'
  }

  it('should record new network info if not present for the day', async () => {
    await logNetworkInfo(headers1, 'station-id1', recordTelemetry)
    await logNetworkInfo(headers2, 'station-id2', recordTelemetry)
    await logNetworkInfo(headers3, 'station-id1', recordTelemetry)

    const expectedFields1 = {}
    for (const key in headers1) {
      expectedFields1[key] = `"${headers1[key]}"`
    }
    const expectedFields2 = {}
    for (const key in headers2) {
      expectedFields2[key] = `"${headers2[key]}"`
    }

    assert.strictEqual(telemetry.length, 2)
    assert.strictEqual(telemetry[0].name, 'network-info')
    assert.deepStrictEqual(telemetry[0].fields, expectedFields1)
    assert.strictEqual(telemetry[1].name, 'network-info')
    assert.deepStrictEqual(telemetry[1].fields, expectedFields2)
  })
})
