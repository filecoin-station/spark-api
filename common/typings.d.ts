import { Point } from '@influxdata/influxdb-client'

export type RecordTelemetryFn = (
  name: string,
  fn: (point: Point) => void
) => void
