import Sentry from '@sentry/node'
Sentry.init({
  dsn: 'https://4a55431b256641f98f6a51651526831f@o1408530.ingest.sentry.io/4505199717122048',
  release: pkg.version,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: 0.1
});