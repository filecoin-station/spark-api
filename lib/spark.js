import { validate } from './lib/validate.js'
import { satisfies } from 'compare-versions'
import assert from 'http-assert'

export const validateMeasurement = measurement => {
  validate(measurement, 'sparkVersion', { type: 'string', required: false })
  assert(
    typeof measurement.sparkVersion === 'string' && satisfies(measurement.sparkVersion, '>=1.9.0'),
    410, 'OUTDATED CLIENT'
  )

  validate(measurement, 'cid', { type: 'string', required: true })
  validate(measurement, 'providerAddress', { type: 'string', required: true })
  validate(measurement, 'protocol', { type: 'string', required: true })
  
  validate(measurement, 'timeout', { type: 'boolean', required: false })
  validate(measurement, 'startAt', { type: 'date', required: true })
  validate(measurement, 'statusCode', { type: 'number', required: false })
  validate(measurement, 'firstByteAt', { type: 'date', required: false })
  validate(measurement, 'endAt', { type: 'date', required: false })
  validate(measurement, 'byteLength', { type: 'number', required: false })
  validate(measurement, 'attestation', { type: 'string', required: false })
  validate(measurement, 'carTooLarge', { type: 'boolean', required: false })
  validate(measurement, 'carChecksum', { type: 'string', required: false })
  validate(measurement, 'indexerResult', { type: 'string', required: false })
}

export const sanitizeMeasurement = ({
  measurement,
  sparkRoundNumber,
  inetGroup
}) => ({
  sparkVersion: measurement.sparkVersion,
  zinniaVersion: measurement.zinniaVersion,
  cid: measurement.cid,
  providerAddress: measurement.providerAddress,
  protocol: measurement.protocol,
  participantAddress: measurement.participantAddress,
  timeout: measurement.timeout || false,
  startAt: parseOptionalDate(measurement.startAt),
  statusCode: measurement.statusCode,
  firstByteAt: parseOptionalDate(measurement.firstByteAt),
  endAt: parseOptionalDate(measurement.endAt),
  byteLength: measurement.byteLength,
  attestation: measurement.attestation,
  inetGroup,
  carTooLarge: measurement.carTooLarge ?? false,
  carChecksum: measurement.carChecksum,
  indexerResult: measurement.indexerResult,
  sparkRoundNumber
})

/**
 * Parse a date string field that may be `undefined` or `null`.
 *
 * - undefined -> undefined
 * - null -> undefined
 * - "iso-date-string" -> new Date("iso-date-string")
 *
 * @param {string | null | undefined} str
 * @returns {Date | undefined}
 */
const parseOptionalDate = (str) => {
  if (str === undefined || str === null) return undefined
  return new Date(str)
}
