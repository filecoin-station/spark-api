import assert from 'node:assert'
import { mapRequestToInetGroup } from '../lib/inet-grouping.js'
import { Request as FakeRequest } from 'light-my-request/lib/request.js'

describe('mapRequestToInetGroup', () => {
  it('maps IPv4 address to /24 subnet', () => {
    const group = mapRequestToInetGroup(createRequestFromAddress('10.20.30.40'))
    assert.strictEqual(group, '10.20.30.0')
  })

  it('maps IPv4-inside-IPv6 to IPv4 /24 subnet', () => {
    const group = mapRequestToInetGroup(createRequestFromAddress('::ffff:127.0.0.1'))
    assert.strictEqual(group, '127.0.0.0')
  })

  it('rejects IPv6 addresses', () => {
    const group = mapRequestToInetGroup(createRequestFromAddress('bf27:c63a:689a:da7c:8150:6e23:1045:045d'))
    assert.strictEqual(group, undefined)
  })

  it('parses `Fly-Client-IP` request header', () => {
    const req = createRequestFromAddress('10.20.30.40', {
      'Fly-Client-IP': '1.2.3.4'
    })
    const group = mapRequestToInetGroup(req)
    assert.strictEqual(group, '1.2.3.0')
  })

  it('parses `fly-client-ip` request header', () => {
    const req = createRequestFromAddress('10.20.30.40', {
      'fly-client-ip': '1.2.3.4'
    })
    const group = mapRequestToInetGroup(req)
    assert.strictEqual(group, '1.2.3.0')
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
