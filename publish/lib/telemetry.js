import { InfluxDB, Point } from '@influxdata/influxdb-client'

const influx = new InfluxDB({
  url: 'https://eu-central-1-1.aws.cloud2.influxdata.com',
  // spark-publish-write
  token: 'Zkqa_s7mI0W_WKI6DUmu-iRnQkCvwNaQfbPK_zT7I6iYYaC2C1kokdlhO2jb4tjRcAJQHQXAGnrdD3vqlMZ63g=='
})
export const writeClient = influx.getWriteApi(
  'Filecoin Station', // org
  'spark-publish', // bucket
  'ns' // precision
)

setInterval(() => {
  writeClient.flush().catch(console.error)
}, 10_000).unref()

export const record = (name, fn) => {
  const point = new Point(name)
  fn(point)
  writeClient.writePoint(point)
}

export const close = () => writeClient.close()
