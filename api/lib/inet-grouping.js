import { base64url } from 'multiformats/bases/base64'

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

/**
 * @param {import('pg').Client} pgClient
 * @param {import('node:http').IncomingMessage} req
 * @param {string} stationId
 * @param {string} inetGroup
 * @param {function} recordTelemetryFn
 */
export const logNetworkInfo = async (pgClient, headers, stationId, inetGroup, recordTelemetryFn) => {
  const { rows } = await pgClient.query(`
    INSERT INTO network_info_update_history (day, station_id)
    VALUES (now(), $1)
    ON CONFLICT (day, station_id) DO NOTHING
    RETURNING station_id
  `, [stationId])

  // Don't record to InfluxDB or delete the row if we didn't write the row
  if (rows.length === 0) return

  // Empty the table of every day before today
  await pgClient.query(`
    DELETE FROM network_info_update_history
    WHERE day < NOW() - INTERVAL '1 day'
  `)

  recordTelemetryFn('network-info', point => {
    point.stringField('station_id', stationId)
    point.stringField('inet_group', inetGroup)

    point.stringField('cf-ipcity', headers['cf-ipcity'])
    point.stringField('cf-ipcountry', headers['cf-ipcountry'])
    point.stringField('cf-ipcontinent', headers['cf-ipcontinent'])
    point.stringField('cf-iplongitude', headers['cf-iplongitude'])
    point.stringField('cf-iplatitude', headers['cf-iplatitude'])
    point.stringField('cf-region', headers['cf-region'])
    point.stringField('cf-region-code', headers['cf-region-code'])
    point.stringField('cf-timezone', headers['cf-timezone'])
  })
}
