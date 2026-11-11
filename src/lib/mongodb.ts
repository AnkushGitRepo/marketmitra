import { MongoClient, type Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri) {
  throw new Error('MONGODB_URI is not set');
}
if (!dbName) {
  throw new Error('MONGODB_DB is not set');
}

// Cache the connection across hot reloads (dev) and function invocations (serverless) so route handlers reuse one
// connection instead of opening a new one per request.
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// A short server-selection timeout so an unreachable/misconfigured cluster
// fails fast (a few seconds) instead of hanging every page load for the
// driver's ~30s default - callers (e.g. src/lib/holdings.ts) already treat
// a rejected getDb() as "show an empty/unavailable state," not a crash.
const SERVER_SELECTION_TIMEOUT_MS = 5000;

let connection: Promise<MongoClient> | undefined = global._mongoClientPromise;

/**
 * Connects on first use, not at import, and never keeps a failure. A connect evaluated once at module load that failed on a cold
 * start (a transient Atlas blip) stayed a rejected promise for the life of the instance, so every request on it failed until it
 * recycled (#158). Here a failed connect clears the cache and the next call tries again.
 */
function connect(): Promise<MongoClient> {
  if (connection) return connection;
  const client = new MongoClient(uri as string, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
  const attempt = client.connect().catch((err: unknown) => {
    if (connection === attempt) connection = undefined;
    if (global._mongoClientPromise === attempt) global._mongoClientPromise = undefined;
    void client.close().catch(() => undefined);
    throw err;
  });
  connection = attempt;
  if (process.env.NODE_ENV !== 'production') global._mongoClientPromise = attempt;
  return attempt;
}

/** The database. One retry after a failed connect rides out a transient blip; a second failure is the caller's to handle. */
export async function getDb(): Promise<Db> {
  try {
    return (await connect()).db(dbName);
  } catch {
    return (await connect()).db(dbName);
  }
}
