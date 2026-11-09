type TestEnvironment = Record<string, string | undefined>;

interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
}

function parseDatabaseTarget(value: string, variableName: string): DatabaseTarget {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL; its value is not shown.`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${variableName} must use the postgres or postgresql protocol.`);
  }

  if (["host", "port", "database", "dbname"].some((key) => url.searchParams.has(key))) {
    throw new Error(
      `${variableName} must specify its PostgreSQL host, port, and database in the URL itself, without connection-target overrides.`,
    );
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!url.hostname || !database) {
    throw new Error(`${variableName} must include a PostgreSQL host and database name.`);
  }

  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database,
  };
}

function sameDatabase(left: DatabaseTarget, right: DatabaseTarget): boolean {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

function assertNonProduction(environment: TestEnvironment): void {
  if (
    environment.NODE_ENV?.toLowerCase() === "production" ||
    environment.REPLIT_DEPLOYMENT ||
    environment.REPLIT_DEPLOYMENT_ID
  ) {
    throw new Error("API tests are disabled in production deployments.");
  }
}

function getConfiguredTestDatabase(environment: TestEnvironment): {
  url: string;
  target: DatabaseTarget;
} {
  assertNonProduction(environment);

  const url = environment.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required for API tests. Set it to a separate scratch PostgreSQL database ending in _test.",
    );
  }

  const target = parseDatabaseTarget(url, "TEST_DATABASE_URL");
  if (!target.database.toLowerCase().endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must point to a scratch database whose name ends in _test.");
  }

  return { url, target };
}

/**
 * Return the test database URL only after rejecting the active preview database
 * and production runtimes. Never include database URL values in error messages.
 */
export function resolveTestDatabaseUrl(environment: TestEnvironment): string {
  const testDatabase = getConfiguredTestDatabase(environment);
  const activeUrl = environment.DATABASE_URL?.trim();

  if (activeUrl) {
    const activeDatabase = parseDatabaseTarget(activeUrl, "DATABASE_URL");
    if (sameDatabase(testDatabase.target, activeDatabase)) {
      throw new Error(
        "TEST_DATABASE_URL matches DATABASE_URL. API tests must use a separate scratch database, not the preview or production database.",
      );
    }
  }

  return testDatabase.url;
}

/**
 * Check the test worker's DATABASE_URL after Vitest has replaced it with the
 * already-validated TEST_DATABASE_URL.
 */
export function assertTestDatabaseConnection(environment: TestEnvironment): void {
  const testDatabase = getConfiguredTestDatabase(environment);
  const activeUrl = environment.DATABASE_URL?.trim();
  if (!activeUrl) {
    throw new Error("DATABASE_URL was not set to the validated scratch database for this API test.");
  }

  const activeDatabase = parseDatabaseTarget(activeUrl, "DATABASE_URL");
  if (!sameDatabase(testDatabase.target, activeDatabase)) {
    throw new Error("DATABASE_URL must match the validated TEST_DATABASE_URL while API tests run.");
  }
}
