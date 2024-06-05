import { base64url } from 'multiformats/bases/base64'

import { record } from './telemetry.js'

// See https://stackoverflow.com/a/36760050/69868
const IPV4_REGEX = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.){3}(25[0-5]|(2[0-4]|1\d|[1-9]|)\d)$/

/**
 * @param {import('pg').Client} client
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
export const mapRequestToInetGroup = async (pgClient, req) => {
  const subnet = mapRequestToSubnet(req)
  if (!subnet) return 'ipv6'
  const group = await mapSubnetToInetGroup(pgClient, subnet)
  return group
}

/**
 * @param {import('pg').Client} client
 * @param {string} subnet
 * @returns {Promise<string>}
 */
export const mapSubnetToInetGroup = async (pgClient, subnet) => {
  const { rows: [found] } = await pgClient.query(
    'SELECT id FROM inet_groups WHERE subnet = $1',
    [subnet]
  )
  if (found) return found.id

  for (let remainingRetries = 5; remainingRetries > 0; remainingRetries--) {
    const group = generateUniqueGroupId()
    try {
      // There is a race condition: between the time we looked up the existing group
      // and the time we execute this query, a handler for a different request from
      // the same subnet may have already defined the group for this subnet.
      // Solution: when insert fails with a conflict in the group id, use that existing group
      // instead of the value we generated ourselves.
      //
      // ON CONFLICT DO UPDATE is needed to tell PG to return the existing id on conflict
      // ON CONFLICT DO NOTHING would not return the existing id on conflict
      const { rows: [created] } = await pgClient.query(`
        INSERT INTO inet_groups (id, subnet)
        VALUES ($1, $2)
        ON CONFLICT (subnet) DO UPDATE SET id = inet_groups.id
        RETURNING id
       `, [
        group,
        subnet
      ])
      return created.id
    } catch (err) {
      if (err.code === 23505 && err.constraint === 'inet_groups_pkey') {
        // Retry with a different random id
        continue
      }
      throw err
    }
  }
  // We have exhausted allowed attempts
  throw new Error('Failed to generate a unique group id')
}

/**
 * @returns {string}
 */
const generateUniqueGroupId = () => {
  const data = new Uint8Array(8)
  globalThis.crypto.getRandomValues(data)
  return base64url.encode(data)
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {string | undefined}
 */
export const mapRequestToSubnet = (req) => {
  let addr = req.socket.remoteAddress

  const flyClientAddr = req.headers['fly-client-ip']
  if (flyClientAddr) addr = flyClientAddr

  // TODO accept the value in this header only when the request is coming from Cloudflare
  // Check that `req.socket.remoteAddress` matches one of the well-known Cloudflare's addresses
  // See https://www.cloudflare.com/en-gb/ips/
  const cfAddr = req.headers['cf-connecting-ip']
  if (cfAddr) addr = cfAddr

  if (!addr) return undefined

  if (addr.startsWith('::ffff:')) {
    // Some operating systems are wrapping the IPv4 address into IPv6
    // https://www.apnic.net/get-ip/faqs/what-is-an-ip-address/ipv6-address-types/
    addr = addr.slice(7)
  }

  if (!IPV4_REGEX.test(addr)) {
    return undefined
  }

  // Hide the last byte of the IPv4 address, change it to "0"
  // Also encode the subnet size
  addr = addr.slice(0, addr.lastIndexOf('.')) + '.0/24'

  return addr
}

export const logNetworkInfo = async (pgClient, req, stationId, inetGroup) => {
  // Update the station_id's network_info_update_history row if it's older than 10 minutes
  const { rows } = await pgClient.query(`
    INSERT INTO network_info_update_history (station_id, updated_at)
    VALUES ($1, NOW())
    ON CONFLICT (station_id) DO UPDATE
    SET updated_at = NOW()
    WHERE network_info.updated_at < NOW() - INTERVAL '10 minutes'
    RETURNING station_id
  `, [stationId])

  // Don't record to InfluxDB if we didn't update the row
  if (rows.length === 0) return

  record('network_info', point => {
    point.tag('station_id', stationId)
    point.tag('inet_group', inetGroup)

    point.tag('cf-ipcity', req.headers['cf-ipcity'])
    point.tag('cf-ipcountry', req.headers['cf-ipcountry'])
    point.tag('cf-ipcontinent', req.headers['cf-ipregion'])
    point.tag('cf-iplongitude', req.headers['cf-iplongitude'])
    point.tag('cf-iplatitude', req.headers['cf-iplatitude'])
    point.tag('cf-region', req.headers['cf-region'])
    point.tag('cf-region-code', req.headers['cf-region-code'])
    point.tag('cf-timezone', req.headers['cf-timezone'])
    point.timestamp(new Date())
  })
}
