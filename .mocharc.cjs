const MODULES = [
  'spark-api',
  'spark-publish'
]

module.exports = {
  spec: getSpec()
}

// Workaround for https://github.com/mochajs/mocha/issues/4100
function getSpec () {
  const isTestFile = (/** @type {string} */arg) => arg.endsWith('.js')
  if (process.argv.slice(2).some(isTestFile)) return []
  return MODULES.map(dir => `${dir}/test/**/*.js`)
}
