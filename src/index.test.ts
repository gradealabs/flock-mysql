import * as Assert from 'assert'
import * as Path from 'path'
import { DataAccessProvider, MySqlDataAccess, MySqlQueryInterface, TemplateProvider } from './index'

describe('flock-mysql', function () {
  const dap = new DataAccessProvider({
    connectionOptions: {
      database: process.env.MYSQL_DATABASE,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD
    }
  })
  let da: MySqlDataAccess = null
  let qi: MySqlQueryInterface = null

  beforeEach(async function () {
    da = await dap.provide()
    qi = da['qi'] // the QueryInterface
  })

  afterEach(async function () {
    if (qi) {
      qi.query({
        sql: `DROP TABLE IF EXISTS ${da.migrationTableName}`
      })
    }
    if (da) {
      await da.close()
    }
  })

  describe('TemplateProvider', function () {
    it('should provide a template file name when given a migration type that matches a template name', async function () {
      const tp = new TemplateProvider()
      let fileName = await tp.provideFileName('create-table')
      Assert.strictEqual(fileName, Path.resolve(__dirname, './templates/create-table.ejs'))
      fileName = await tp.provideFileName('alter-table')
      Assert.strictEqual(fileName, Path.resolve(__dirname, './templates/alter-table.ejs'))
      fileName = await tp.provideFileName('other')
      Assert.strictEqual(fileName, Path.resolve(__dirname, './templates/other.ejs'))
    })

    it('should reject when given a migration type that does not match a template name', async function () {
      const tp = new TemplateProvider()
      try {
        await tp.provideFileName('nope')
      } catch (error) {
        Assert.strictEqual(error.code, 'UNSUPPORTED_MIGRATION_TYPE')
      }
    })
  })

  describe('DataAccessProvider#provide', function () {
    it('should connect to the DB and acquire application lock', async function () {
      Assert.strictEqual(dap.migrationTableName, 'migration')
    })
  })

  describe('PgDataAccess', function () {
    describe('#getMigratedMigrations', function () {
      it('should retrieve migrated migrations', async function () {
        await qi.query({
          sql:
            `CREATE TABLE IF NOT EXISTS \`${da.migrationTableName}\` (
              id varchar(512),
              created_at datetime DEFAULT NOW(),
              PRIMARY KEY(id)
            )`
        })
        await qi.query({
          sql: `INSERT INTO \`${da.migrationTableName}\` (id) VALUES(?)`,
          values: [ 'one' ]
        })
        const migrated = await da.getMigratedMigrations()
        Assert.deepStrictEqual(migrated.map(x => x.id), [ 'one' ])
        Assert.ok(migrated[0].migratedAt instanceof Date)
      })
    })

    describe('#migrate', function () {
      it('should migrate a migration', async function () {
        await da.migrate('two', qi => {
          /* do nothing */
          return Promise.resolve()
        })
        const migrated = await da.getMigratedMigrations()
        Assert.deepStrictEqual(migrated.map(x => x.id), [ 'two' ])
        Assert.ok(migrated[0].migratedAt instanceof Date)
      })
    })

    describe('#rollback', function () {
      it('should rollback a migration', async function () {
        await da.migrate('two', qi => {
          /* do nothing */
          return Promise.resolve()
        })
        await da.rollback('two', qi => {
          /* do nothing */
          return Promise.resolve()
        })
        const migrated = await da.getMigratedMigrations()
        Assert.strictEqual(migrated.length, 0)
      })
    })
  })
})
