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
const Assert = require("assert");
const Path = require("path");
const index_1 = require("./index");
describe('flock-mysql', function () {
    const dap = new index_1.DataAccessProvider({
        connectionOptions: {
            database: process.env.MYSQL_DATABASE,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD
        }
    });
    let da = null;
    let qi = null;
    beforeEach(function () {
        return __awaiter(this, void 0, void 0, function* () {
            da = yield dap.provide();
            qi = da['qi']; // the QueryInterface
        });
    });
    afterEach(function () {
        return __awaiter(this, void 0, void 0, function* () {
            if (qi) {
                qi.query({
                    sql: `DROP TABLE IF EXISTS ${da.migrationTableName}`
                });
            }
            if (da) {
                yield da.close();
            }
        });
    });
    describe('TemplateProvider', function () {
        it('should provide a template file name when given a migration type that matches a template name', function () {
            return __awaiter(this, void 0, void 0, function* () {
                const tp = new index_1.TemplateProvider();
                let fileName = yield tp.provideFileName('create-table');
                Assert.strictEqual(fileName, Path.resolve(__dirname, './templates/create-table.ejs'));
                fileName = yield tp.provideFileName('alter-table');
                Assert.strictEqual(fileName, Path.resolve(__dirname, './templates/alter-table.ejs'));
                fileName = yield tp.provideFileName('other');
                Assert.strictEqual(fileName, Path.resolve(__dirname, './templates/other.ejs'));
            });
        });
        it('should reject when given a migration type that does not match a template name', function () {
            return __awaiter(this, void 0, void 0, function* () {
                const tp = new index_1.TemplateProvider();
                try {
                    yield tp.provideFileName('nope');
                }
                catch (error) {
                    Assert.strictEqual(error.code, 'UNSUPPORTED_MIGRATION_TYPE');
                }
            });
        });
    });
    describe('DataAccessProvider#provide', function () {
        it('should connect to the DB and acquire application lock', function () {
            return __awaiter(this, void 0, void 0, function* () {
                Assert.strictEqual(dap.migrationTableName, 'migration');
            });
        });
    });
    describe('PgDataAccess', function () {
        describe('#getMigratedMigrations', function () {
            it('should retrieve migrated migrations', function () {
                return __awaiter(this, void 0, void 0, function* () {
                    yield qi.query({
                        sql: `CREATE TABLE IF NOT EXISTS \`${da.migrationTableName}\` (
              id varchar(512),
              created_at datetime DEFAULT NOW(),
              PRIMARY KEY(id)
            )`
                    });
                    yield qi.query({
                        sql: `INSERT INTO \`${da.migrationTableName}\` (id) VALUES(?)`,
                        values: ['one']
                    });
                    const migrated = yield da.getMigratedMigrations();
                    Assert.deepStrictEqual(migrated.map(x => x.id), ['one']);
                    Assert.ok(migrated[0].migratedAt instanceof Date);
                });
            });
        });
        describe('#migrate', function () {
            it('should migrate a migration', function () {
                return __awaiter(this, void 0, void 0, function* () {
                    yield da.migrate('two', qi => {
                        /* do nothing */
                        return Promise.resolve();
                    });
                    const migrated = yield da.getMigratedMigrations();
                    Assert.deepStrictEqual(migrated.map(x => x.id), ['two']);
                    Assert.ok(migrated[0].migratedAt instanceof Date);
                });
            });
        });
        describe('#rollback', function () {
            it('should rollback a migration', function () {
                return __awaiter(this, void 0, void 0, function* () {
                    yield da.migrate('two', qi => {
                        /* do nothing */
                        return Promise.resolve();
                    });
                    yield da.rollback('two', qi => {
                        /* do nothing */
                        return Promise.resolve();
                    });
                    const migrated = yield da.getMigratedMigrations();
                    Assert.strictEqual(migrated.length, 0);
                });
            });
        });
    });
});
