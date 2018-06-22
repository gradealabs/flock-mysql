import * as MySql from 'mysql2';
import * as Flock from '@gradealabs/flock';
export declare class TemplateProvider implements Flock.TemplateProvider {
    readonly migrationTypes: string[];
    provideFileName(migrationType: string): Promise<string>;
}
export declare class DataAccessProvider implements Flock.DataAccessProvider {
    readonly migrationTableName: string;
    readonly acquireLock: boolean;
    readonly connectionOptions: MySql.ConnectionConfig;
    constructor(options: {
        migrationTableName?: string;
        acquireLock?: boolean;
        connectionOptions: MySql.ConnectionConfig;
    });
    provide(): Promise<MySqlDataAccess>;
}
export declare class MySqlDataAccess implements Flock.DataAccess {
    private client;
    private qi;
    readonly migrationTableName: string;
    readonly lock: string;
    constructor(client: MySql.Connection, migrationTableName: string, { lock }?: {
        lock?: any;
    });
    getMigratedMigrations(): Promise<{
        id: any;
        migratedAt: any;
    }[]>;
    migrate(migrationId: string, action: (qi: Flock.QueryInterface) => Promise<void>): Promise<void>;
    rollback(migrationId: string, action: (qi: Flock.QueryInterface) => Promise<void>): Promise<void>;
    close(): Promise<any>;
    private hasMigrated;
}
export declare class MySqlQueryInterface implements Flock.QueryInterface {
    client: MySql.Connection;
    constructor(client: any);
    query(queryObject: {
        sql: string;
        values?: any[];
        timeout?: number;
    }): Promise<Flock.QueryResult>;
    tableExists(tableName: string): Promise<boolean>;
    columnExists(tableName: string, columnName: string): Promise<boolean>;
    columnDataType(tableName: string, columnName: string): Promise<string | null>;
    private inspectColumn;
}
