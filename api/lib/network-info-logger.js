const stationIdsSeen = new Set()

export const clearNetworkInfoStationIdsSeen = () => {
  stationIdsSeen.clear()
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} stationId
 * @param {import('../../common/typings.js').RecordTelemetryFn} recordTelemetry
 */
export const logNetworkInfo = async (headers, stationId, recordTelemetry) => {
  try {
    if (stationIdsSeen.has(stationId)) return

    stationIdsSeen.add(stationId)
    recordTelemetry('network-info', point => {
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
