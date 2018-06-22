import * as Path from 'path'
import * as MySql from 'mysql2'
import * as Flock from '@gradealabs/flock'

export class TemplateProvider implements Flock.TemplateProvider {
  readonly migrationTypes = [ 'create-table', 'alter-table', 'other' ]

  provideFileName (migrationType: string) {
    if (this.migrationTypes.indexOf(migrationType) >= 0) {
      return Promise.resolve(Path.join(__dirname, 'templates', migrationType + '.ejs'))
    } else {
      return Promise.reject(Object.assign(
        new Error(`Unsupported migration type [${migrationType}]`),
        { code: 'UNSUPPORTED_MIGRATION_TYPE' }
      ))
    }
  }
}

export class DataAccessProvider implements Flock.DataAccessProvider {
  readonly migrationTableName: string
  readonly acquireLock: boolean
  readonly connectionOptions: MySql.ConnectionConfig

  constructor (options: { migrationTableName?: string, acquireLock?: boolean, connectionOptions: MySql.ConnectionConfig }) {
    const { migrationTableName = 'migration', acquireLock = true, connectionOptions } = options
    this.migrationTableName = migrationTableName
    this.acquireLock = acquireLock
    this.connectionOptions = Object.assign({
      host: 'localhost',
      port: 3306,
      user: 'MySQL',
      charset: 'UTF8_GENERAL_CI',
      timezone: 'Z',
      connectionTimeout: 10000,
      insecureAuth: false,
      debug: false,
      trace: false
    }, connectionOptions)
  }

  async provide () {
    const lock = 'flock-mysql'
    let locked = false

    return new Promise<MySql.Connection>((resolve, reject) => {
      const client: MySql.Connection = MySql.createConnection(this.connectionOptions)
      client.connect(error => {
        error ? reject(error) : resolve(client)
      })
    }).then(async (client) => {
      if (this.acquireLock) {
        const advisoryLockResult = await new Promise((resolve, reject) => {
          client.query(`SELECT GET_LOCK('${lock}', 2000)`, (error, result) => {
            error ? reject(error) : resolve(result)
          })
        })
        locked = advisoryLockResult[0][`GET_LOCK('${lock}', 2000)`] === 1

        if (!locked) {
          await new Promise((resolve, reject) => {
            client.end(error => error ? reject(error) : resolve())
          })
          throw new Error(`Advisory lock "${lock}" could not be acquired.`)
        }
      }

      return new MySqlDataAccess(client, this.migrationTableName, { lock: locked ? lock : null })
    })
  }
}

export class MySqlDataAccess implements Flock.DataAccess {
  private client: MySql.Connection
  private qi: MySqlQueryInterface
  readonly migrationTableName: string
  readonly lock: string

  constructor (client: MySql.Connection, migrationTableName: string, { lock = null } = {}) {
    this.client = client
    this.qi = new MySqlQueryInterface(client)
    this.migrationTableName = migrationTableName
    this.lock = lock
  }

  async getMigratedMigrations () {
    const result = await this.qi.query({
      sql: `SELECT id, created_at FROM \`${this.migrationTableName}\``
    })
    return (result.rows || []).map(x => {
      return { id: x.id, migratedAt: x.created_at }
    })
  }

  async migrate (migrationId: string, action: (qi: Flock.QueryInterface) => Promise<void>) {
    const migrationTableExists = await this.qi.tableExists(this.migrationTableName)
    const hasMigrated = migrationTableExists ? (await this.hasMigrated(migrationId)) : false

    if (hasMigrated) {
      return
    }

    await this.qi.query({ sql: 'BEGIN' })
    try {
      await this.qi.query({
        sql:
          `CREATE TABLE IF NOT EXISTS \`${this.migrationTableName}\` (
            id varchar(512),
            created_at datetime DEFAULT NOW(),
            PRIMARY KEY(id)
          )`
      })
      await action(this.qi)
      await this.qi.query({
        sql: `INSERT INTO \`${this.migrationTableName}\` (id) VALUES(?)`,
        values: [ migrationId ]
      })
      await this.qi.query({ sql: 'COMMIT' })
    } catch (error) {
      await this.qi.query({ sql: 'ROLLBACK' })
      throw error
    }
  }

  async rollback (migrationId: string, action: (qi: Flock.QueryInterface) => Promise<void>) {
    const migrationTableExists = await this.qi.tableExists(this.migrationTableName)

    if (!migrationTableExists) {
      return
    }

    const hasMigrated = await this.hasMigrated(migrationId)

    if (!hasMigrated) {
      return
    }

    await this.qi.query({ sql: 'BEGIN' })
    try {
      await action(this.qi)
      await this.qi.query({
        sql: `DELETE FROM \`${this.migrationTableName}\` WHERE id = ?`,
        values: [ migrationId ]
      })
      await this.qi.query({ sql: 'COMMIT' })
    } catch (error) {
      await this.qi.query({ sql: 'ROLLBACK' })
      throw error
    }
  }

  async close () {
    if (this.lock) {
      await this.qi.query({ sql: `SELECT RELEASE_LOCK('${this.lock}')` })
    }
    return this.client.end()
  }

  private async hasMigrated (migrationId: string) {
    const result = await this.qi.query({
      sql: `SELECT id FROM \`${this.migrationTableName}\` WHERE id = ?`,
      values: [ migrationId ]
    })
    return result.rowCount === 1
  }
}

export class MySqlQueryInterface implements Flock.QueryInterface {
  client: MySql.Connection

  constructor (client) {
    this.client = client
  }

  query (queryObject: { sql: string, values?: any[], timeout?: number }): Promise<Flock.QueryResult> {
    return new Promise((resolve, reject) => {
      this.client.query(queryObject, (error, result) => {
        error ? reject(error) : resolve({
          rowCount: result.length,
          rows: [].slice.call(result)
        })
      })
    })
  }

  async tableExists (tableName: string) {
    // ANSI SQL compliant query. This should work for all RDMS.
    // NOTE: use schema_name() for MSSQL
    const result = await this.query({
      sql:
        `SELECT table_name
        FROM   information_schema.tables
        WHERE  table_name = ?`,
      values: [ tableName ]
    })
    return result.rowCount === 1
  }

  async columnExists (tableName: string, columnName: string) {
    // ANSI SQL compliant query. This should work for all RDMS.
    // NOTE: use schema_name() for MSSQL
    const result = await this.query({
      sql:
        `SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ?
        and column_name = ?`,
      values: [ tableName, columnName ]
    })
    return result.rowCount === 1
  }

  async columnDataType (tableName: string, columnName: string): Promise<string|null> {
    return this.inspectColumn(tableName, columnName).then(col => {
      return col ? col.data_type : null
    })
  }

  private async inspectColumn (tableName: string, columnName: string) {
    // ANSI SQL compliant query. This should work for all RDMS.
    // NOTE: use schema_name() for MSSQL
    const result = await this.query({
      sql:
        `SELECT *
        FROM   information_schema.columns
        WHERE  table_name = ?
        AND column_name = ?`,
      values: [ tableName, columnName ]
    })
    return result.rowCount === 1 ? result.rows[0] : null
  }
}
