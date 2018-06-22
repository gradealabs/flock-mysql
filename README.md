# Flock Postgres

Flock Postgres is a Flock plugin for Postgres.

## Install

```
npm install gradealabs/flock-pg
```

## Usage

```js
// .flockrc.js
const { DefaultMigrator, NodeModuleMigrationProvider } = require('@gradealabs/flock')
const { DataAccessProvider, TemplateProvider } = require('@gradealabs/flock-pg')

const migrationDir = 'migrations'
const migrationTableName = 'migration'
const dap = new DataAccessProvider({ migrationTableName })
const mp = new NodeModuleMigrationProvider({ migrationDir })

exports.migrator = new DefaultMigrator(mp, dap)
exports.migrationDir = migrationDir
exports.templateProvider = new TemplateProvider()

```

## API

Flock pg exports implementations of Flock's `DataAccessProvider` and `TemplateProvider`
as `DataAccessProvider` and `TemplateProvider` classes.

The `DataAccessProvider` class will connect to your Postgres DB by reading
the connection string from the `DATABASE_URL` environment variable. Optionally you
can override the behaviour by passing in the `connectionString` option to the
constructor.

```js
class DataAccessProvider implements Flock.DataAccessProvider {
  constructor ({
    migrationTableName = 'migration',
    acquireLock = true,
    connectionString = process.env.DATABASE_URL } = {})
}
```

Additionally, by default the `DataAccessProvider` will attempt to acquire an
application lock immediately after connecting to the database. This behaviour
can be overridden by setting the `acquireLock` option to `false`. Acquiring a
lock helps to prevent concurrent migrations from occuring.

See: https://devcenter.heroku.com/articles/release-phase
