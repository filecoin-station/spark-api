// See https://stackoverflow.com/a/36760050/69868
const IPV4_REGEX = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.){3}(25[0-5]|(2[0-4]|1\d|[1-9]|)\d)$/

export const mapRequestToInetGroup = (/** @type {import('node:http').IncomingMessage} */ req) => {
  let addr = req.socket.remoteAddress

  const flyClientAddr = req.headers['fly-client-ip']
  if (flyClientAddr) addr = flyClientAddr

  if (addr?.startsWith('::ffff:')) {
    // Some operating systems are wrapping the IPv4 address into IPv6
    // https://www.apnic.net/get-ip/faqs/what-is-an-ip-address/ipv6-address-types/
    addr = addr.slice(7)
  }

  if (!IPV4_REGEX.test(addr)) {
    return undefined
  }

  // Hide the last byte of the IPv4 address, change it to "0"
  addr = addr.slice(0, addr.lastIndexOf('.')) + '.0'

  return addr
}
