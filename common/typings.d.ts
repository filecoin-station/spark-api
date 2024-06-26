export type RecordTelemetryFn = (
  name: string,
  fn: (point: Point) => void
) => void
