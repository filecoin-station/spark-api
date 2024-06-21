import { InfluxDB, Point } from '@influxdata/influxdb-client'

const influx = new InfluxDB({
  url: 'https://eu-central-1-1.aws.cloud2.influxdata.com',
  // spark-publish-write
  token: 'Zkqa_s7mI0W_WKI6DUmu-iRnQkCvwNaQfbPK_zT7I6iYYaC2C1kokdlhO2jb4tjRcAJQHQXAGnrdD3vqlMZ63g=='
})
const publishWriteClient = influx.getWriteApi(
  'Filecoin Station', // org
  'spark-publish', // bucket
  'ns' // precision
)

const apiWriteClient = influx.getWriteApi(
  'Filecoin Station', // org
  'spark-api', // bucket
  'ns' // precision
)

setInterval(() => {
  publishWriteClient.flush().catch(console.error)
  apiWriteClient.flush().catch(console.error)
}, 10_000).unref()

const recordFn = (client, name, fn) => {
  const point = new Point(name)
  fn(point)
  client.writePoint(point)
}

const recordPublishTelemetry = (name, fn) => recordFn(publishWriteClient, name, fn)
const recordApiTelemetry = (name, fn) => recordFn(apiWriteClient, name, fn)

export {
  Point,
  publishWriteClient,
  apiWriteClient,
  recordPublishTelemetry,
  recordApiTelemetry
}
