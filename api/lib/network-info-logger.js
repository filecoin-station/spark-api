const stationIdsSeen = new Set()
setInterval(() => { stationIdsSeen.clear() }, 1000 * 60 * 60 * 24) // clear every day

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} stationId
 * @param {string} inetGroup
 * @param {function} recordTelemetryFn
 */
export const logNetworkInfo = async (headers, stationId, recordTelemetryFn) => {
  try {
    if (stationIdsSeen.has(stationId)) return

    stationIdsSeen.add(stationId)
    recordTelemetryFn('network-info', point => {
      point.stringField('cf-ipcity', headers['cf-ipcity'])
      point.stringField('cf-ipcountry', headers['cf-ipcountry'])
      point.stringField('cf-ipcontinent', headers['cf-ipcontinent'])
      point.stringField('cf-iplongitude', headers['cf-iplongitude'])
      point.stringField('cf-iplatitude', headers['cf-iplatitude'])
      point.stringField('cf-region', headers['cf-region'])
      point.stringField('cf-region-code', headers['cf-region-code'])
      point.stringField('cf-timezone', headers['cf-timezone'])
    })
  } catch (err) {
    console.error('Error recording network info', err)
  }
}
