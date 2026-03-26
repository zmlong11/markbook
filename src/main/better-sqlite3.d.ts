declare module "better-sqlite3" {
  namespace BetterSqlite3 {
    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface Statement<TBindParameters extends unknown[] = unknown[], TResult = unknown> {
      run(...params: TBindParameters): RunResult;
      get(...params: TBindParameters): TResult | undefined;
      all(...params: TBindParameters): TResult[];
    }

    interface Database {
      pragma(command: string): unknown;
      exec(sql: string): this;
      prepare<TResult = unknown>(sql: string): Statement<unknown[], TResult>;
      transaction<TArgs extends unknown[], TResult>(
        fn: (...args: TArgs) => TResult
      ): (...args: TArgs) => TResult;
    }
  }

  const BetterSqlite3: {
    new (filename: string): BetterSqlite3.Database;
  };

  export = BetterSqlite3;
}
