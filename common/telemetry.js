import { InfluxDB, Point } from '@influxdata/influxdb-client'

const {
  INFLUXDB_TOKEN
} = process.env

if (!INFLUXDB_TOKEN) {
  console.warn('Warning: INFLUXDB_TOKEN was not provided by the environment')
}

const influx = new InfluxDB({
  url: 'https://eu-central-1-1.aws.cloud2.influxdata.com',
  token: INFLUXDB_TOKEN
})

const publishWriteClient = influx.getWriteApi(
  'Filecoin Station', // org
  'spark-publish', // bucket
  'ns' // precision
)

const networkInfoWriteClient = influx.getWriteApi(
  'Filecoin Station', // org
  'spark-network-info', // bucket
  's' // precision
)

setInterval(() => {
  publishWriteClient.flush().catch(console.error)
  networkInfoWriteClient.flush().catch(console.error)
}, 10_000).unref()

const recordFn = (client, name, fn) => {
  const point = new Point(name)
  fn(point)
  client.writePoint(point)
}

const recordPublishTelemetry = (name, fn) => recordFn(publishWriteClient, name, fn)
const recordNetworkInfoTelemetry = (name, fn) => recordFn(networkInfoWriteClient, name, fn)

export {
  publishWriteClient,
  networkInfoWriteClient,
  recordPublishTelemetry,
  recordNetworkInfoTelemetry
}
