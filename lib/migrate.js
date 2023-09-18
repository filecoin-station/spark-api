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
  console.log(
    'Migrating DB schema from version %s to version %s',
    await postgrator.getDatabaseVersion(),
    await postgrator.getMaxVersion()
  )

  await postgrator.migrate()

  console.log('Migrated DB schema to version', await postgrator.getDatabaseVersion())
}
