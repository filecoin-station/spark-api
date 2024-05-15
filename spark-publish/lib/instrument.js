import * as Sentry from '@sentry/node'

const { SENTRY_ENVIRONMENT = 'development' } = process.env

Sentry.init({
  dsn: 'https://b5bd47a165dcd801408bc14d9fcbc1c3@o1408530.ingest.sentry.io/4505861814878208',
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1
})
