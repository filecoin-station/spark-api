// This file is shared with voyager-api/voyager-publish
// Helpers in this file must not have anything project-specific like measurement fields

import { Point } from '../lib/telemetry.js'

export const { DATABASE_URL } = process.env

export const logger = {
  log () {},
  error (...args) {
    console.error(...args)
  }
}

export const createTelemetryRecorderStub = () => {
  /** @type {Point[]} */
  const telemetry = []
  /**
   *
   * @param {string} measurementName
   * @param {(point: Point) => void} fn
   */
  const recordTelemetry = (measurementName, fn) => {
    const point = new Point(measurementName)
    fn(point)
    // TODO
    // debug('recordTelemetry(%s): %o', measurementName, point.fields)
    telemetry.push(point)
  }

  return { recordTelemetry, telemetry }
}
