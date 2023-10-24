import { base64url } from 'multiformats/bases/base64'

// See https://stackoverflow.com/a/36760050/69868
const IPV4_REGEX = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.){3}(25[0-5]|(2[0-4]|1\d|[1-9]|)\d)$/

/**
 * @param {import('pg').Client} client
 * @param {import('node:http').IncomingMessage} req
 * @param {Date} [now]
 * @returns {string}
 */
export const mapRequestToInetGroup = async (pgClient, req, now = new Date()) => {
  const subnet = mapRequestToSubnet(req)
  if (!subnet) return 'ipv6'
  const group = await mapSubnetToInetGroup(pgClient, subnet, now)
  return group
}

/**
 * @param {import('pg').Client} client
 * @param {string} subnet
 * @param {Date} [now]
 * @returns {Promise<string>}
 */
export const mapSubnetToInetGroup = async (pgClient, subnet, now = new Date()) => {
  const { rows: [found] } = await pgClient.query(
    'SELECT id FROM inet_groups WHERE subnet = $1',
    [subnet]
  )
  if (found) return found.id

  for (let remainingRetries = 5; remainingRetries > 0; remainingRetries--) {
    const group = generateUniqueGroupId(now)
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
        INSERT INTO inet_groups (id, subnet, created_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (subnet) DO UPDATE SET id = inet_groups.id
        RETURNING id
       `, [
        group,
        subnet,
        now
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
 * @param {Date} [now]
 * @returns {Promise<string>}
 */
const generateUniqueGroupId = (now) => {
  const data = new ArrayBuffer(8)

  const prefix = new Uint8Array(data, 0, 2)

  // To reduce the likelihood of generating the same group values for different subnets,
  // and also to make it easier to diagnose invalid use of groups (e.g. after they should
  // have been expired), let's prefix the group with a single byte derived from the number
  // of hours elapsed since the Unix epoch.
  // 251 is the largest prime number that fits into a single byte.
  prefix[0] = now.getTime() / 3600_000 % 251

  // We are running this code in more than one process. To reduce possible clashes, let's
  // add another byte derived from the millisecond time.
  prefix[1] = now.getTime() % 251

  // Finally, add six random bytes
  globalThis.crypto.getRandomValues(new Uint8Array(data, 2, 6))

  return base64url.encode(new Uint8Array(data))
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
