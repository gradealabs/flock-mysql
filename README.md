# Flock MySQL

Flock MySQL is a Flock plugin for MySQL.

## Install

```
npm install gradealabs/flock-mysql
```

## Usage

```js
// .flockrc.js
const { DefaultMigrator, NodeModuleMigrationProvider } = require('@gradealabs/flock')
const { DataAccessProvider, TemplateProvider } = require('@gradealabs/flock-mysql')

const migrationDir = 'migrations'
const migrationTableName = 'migration'
const connectionOptions = {
  host: 'localhost',
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD
}
const dap = new DataAccessProvider({ migrationTableName, connectionOptions })
const mp = new NodeModuleMigrationProvider({ migrationDir })

exports.migrator = new DefaultMigrator(mp, dap)
exports.migrationDir = migrationDir
exports.templateProvider = new TemplateProvider()

```

## API

Flock mysql exports implementations of Flock's `DataAccessProvider` and `TemplateProvider`
as `DataAccessProvider` and `TemplateProvider` classes.

The `DataAccessProvider` class will connect to your MySQL DB by reading
the properties from `connectionOptions`. This object is the same options object
accepted by the [mysql](https://npmjs.org/mysql) module's [createConnection](https://www.npmjs.com/package/mysql#connection-options) function.

*NOTE: The only difference with the connection options is that `flock-mysql`
defaults the timezone option to `Z` instead of `local`.*

```js
class DataAccessProvider implements Flock.DataAccessProvider {
  constructor ({
    migrationTableName = 'migration',
    acquireLock = true,
    connectionOptions = /* REQUIRED */ } = {})
}
```

Additionally, by default the `DataAccessProvider` will attempt to acquire an
application lock immediately after connecting to the database. This behaviour
can be overridden by setting the `acquireLock` option to `false`. Acquiring a
lock helps to prevent concurrent migrations from occuring.

See: https://devcenter.heroku.com/articles/release-phase
