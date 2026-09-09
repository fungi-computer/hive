// Node SQLite host for source laws. This is not Cloudflare runtime evidence.
export function sqliteTestOwner(db, afterExecute = () => {}) {
  return {
    sql: { exec(statement, ...bindings) {
      if (statement.startsWith('CREATE TABLE')) {
        db.exec(statement);
        return { toArray: () => [] };
      }
      const rows = db.prepare(statement).all(...bindings);
      afterExecute(statement);
      return { toArray: () => rows };
    } },
    transactionSync(operation) {
      db.exec('BEGIN');
      try {
        const result = operation();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
