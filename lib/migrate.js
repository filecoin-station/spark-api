import Postgrator from 'postgrator'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations'
)

export const migrate = async (client) => {
  const postgrator = new Postgrator({
    migrationPattern: join(migrationsDirectory, '*'),
    driver: 'pg',
    execQuery: (query) => client.query(query)
  })
  await postgrator.migrate()
}
