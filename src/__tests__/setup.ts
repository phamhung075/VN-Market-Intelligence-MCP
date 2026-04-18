/**
 * Bun test preload — loaded before any test file is evaluated.
 *
 * Sets DB_PATH to :memory: so every test run uses an in-memory SQLite
 * database regardless of the local .env file. This eliminates production-DB
 * bleed: no test can accidentally read or write the real on-disk database.
 *
 * Individual test files are responsible for their own beforeEach / afterEach
 * setup (closeDb + initDatabase). This preload only enforces the DB_PATH
 * invariant at the earliest possible point — before any module import.
 */
Bun.env["DB_PATH"] = ":memory:";
