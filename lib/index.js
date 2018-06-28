"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Path = require("path");
const MySql = require("mysql");
class TemplateProvider {
    constructor() {
        this.migrationTypes = ['create-table', 'alter-table', 'other'];
    }
    provideFileName(migrationType) {
        if (this.migrationTypes.indexOf(migrationType) >= 0) {
            return Promise.resolve(Path.join(__dirname, 'templates', migrationType + '.ejs'));
        }
        else {
            return Promise.reject(Object.assign(new Error(`Unsupported migration type [${migrationType}]`), { code: 'UNSUPPORTED_MIGRATION_TYPE' }));
        }
    }
}
exports.TemplateProvider = TemplateProvider;
class DataAccessProvider {
    constructor(options) {
        const { migrationTableName = 'migration', acquireLock = true, connectionOptions } = options;
        this.migrationTableName = migrationTableName;
        this.acquireLock = acquireLock;
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
        }, connectionOptions);
    }
    provide() {
        return __awaiter(this, void 0, void 0, function* () {
            const lock = 'flock-mysql';
            let locked = false;
            return new Promise((resolve, reject) => {
                const client = MySql.createConnection(this.connectionOptions);
                client.connect(error => {
                    error ? reject(error) : resolve(client);
                });
            }).then((client) => __awaiter(this, void 0, void 0, function* () {
                if (this.acquireLock) {
                    const advisoryLockResult = yield new Promise((resolve, reject) => {
                        client.query(`SELECT GET_LOCK('${lock}', 2000) as locked`, (error, result) => {
                            error ? reject(error) : resolve(result);
                        });
                    });
                    locked = advisoryLockResult[0].locked === 1;
                    if (!locked) {
                        yield new Promise((resolve, reject) => {
                            client.end(error => error ? reject(error) : resolve());
                        });
                        throw new Error(`Advisory lock "${lock}" could not be acquired.`);
                    }
                }
                return new MySqlDataAccess(client, this.migrationTableName, { lock: locked ? lock : null });
            }));
        });
    }
}
exports.DataAccessProvider = DataAccessProvider;
class MySqlDataAccess {
    constructor(client, migrationTableName, { lock = null } = {}) {
        this.client = client;
        this.qi = new MySqlQueryInterface(client);
        this.migrationTableName = migrationTableName;
        this.lock = lock;
    }
    getMigratedMigrations() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.qi.query({
                sql: `SELECT id, created_at FROM \`${this.migrationTableName}\``
            });
            return (result.rows || []).map(x => {
                return { id: x.id, migratedAt: x.created_at };
            });
        });
    }
    migrate(migrationId, action) {
        return __awaiter(this, void 0, void 0, function* () {
            const migrationTableExists = yield this.qi.tableExists(this.migrationTableName);
            const hasMigrated = migrationTableExists ? (yield this.hasMigrated(migrationId)) : false;
            if (hasMigrated) {
                return;
            }
            yield this.qi.query({ sql: 'BEGIN' });
            try {
                yield this.qi.query({
                    sql: `CREATE TABLE IF NOT EXISTS \`${this.migrationTableName}\` (
            id varchar(512),
            created_at datetime DEFAULT NOW(),
            PRIMARY KEY(id)
          )`
                });
                yield action(this.qi);
                yield this.qi.query({
                    sql: `INSERT INTO \`${this.migrationTableName}\` (id) VALUES(?)`,
                    values: [migrationId]
                });
                yield this.qi.query({ sql: 'COMMIT' });
            }
            catch (error) {
                yield this.qi.query({ sql: 'ROLLBACK' });
                throw error;
            }
        });
    }
    rollback(migrationId, action) {
        return __awaiter(this, void 0, void 0, function* () {
            const migrationTableExists = yield this.qi.tableExists(this.migrationTableName);
            if (!migrationTableExists) {
                return;
            }
            const hasMigrated = yield this.hasMigrated(migrationId);
            if (!hasMigrated) {
                return;
            }
            yield this.qi.query({ sql: 'BEGIN' });
            try {
                yield action(this.qi);
                yield this.qi.query({
                    sql: `DELETE FROM \`${this.migrationTableName}\` WHERE id = ?`,
                    values: [migrationId]
                });
                yield this.qi.query({ sql: 'COMMIT' });
            }
            catch (error) {
                yield this.qi.query({ sql: 'ROLLBACK' });
                throw error;
            }
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.lock) {
                yield this.qi.query({ sql: `SELECT RELEASE_LOCK('${this.lock}')` });
            }
            return this.client.end();
        });
    }
    hasMigrated(migrationId) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.qi.query({
                sql: `SELECT id FROM \`${this.migrationTableName}\` WHERE id = ?`,
                values: [migrationId]
            });
            return result.rowCount === 1;
        });
    }
}
exports.MySqlDataAccess = MySqlDataAccess;
class MySqlQueryInterface {
    constructor(client) {
        this.client = client;
    }
    query(queryObject) {
        return new Promise((resolve, reject) => {
            this.client.query(queryObject, (error, result) => {
                error ? reject(error) : resolve({
                    rowCount: result.length,
                    rows: [].slice.call(result)
                });
            });
        });
    }
    tableExists(tableName) {
        return __awaiter(this, void 0, void 0, function* () {
            // ANSI SQL compliant query. This should work for all RDMS.
            // NOTE: use schema_name() for MSSQL
            const result = yield this.query({
                sql: `SELECT table_name
        FROM   information_schema.tables
        WHERE  table_name = ?`,
                values: [tableName]
            });
            return result.rowCount === 1;
        });
    }
    columnExists(tableName, columnName) {
        return __awaiter(this, void 0, void 0, function* () {
            // ANSI SQL compliant query. This should work for all RDMS.
            // NOTE: use schema_name() for MSSQL
            const result = yield this.query({
                sql: `SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ?
        and column_name = ?`,
                values: [tableName, columnName]
            });
            return result.rowCount === 1;
        });
    }
    columnDataType(tableName, columnName) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.inspectColumn(tableName, columnName).then(col => {
                return col ? col.data_type : null;
            });
        });
    }
    inspectColumn(tableName, columnName) {
        return __awaiter(this, void 0, void 0, function* () {
            // ANSI SQL compliant query. This should work for all RDMS.
            // NOTE: use schema_name() for MSSQL
            const result = yield this.query({
                sql: `SELECT *
        FROM   information_schema.columns
        WHERE  table_name = ?
        AND column_name = ?`,
                values: [tableName, columnName]
            });
            return result.rowCount === 1 ? result.rows[0] : null;
        });
    }
}
exports.MySqlQueryInterface = MySqlQueryInterface;
