import DatabaseConstructor from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type BetterDatabase = InstanceType<typeof DatabaseConstructor>;

const DATA_DIR = path.join(process.cwd(), "data");

const DEFAULT_DB_BASENAME = "psc_agents.db";
const DEFAULT_DB = path.join(DATA_DIR, DEFAULT_DB_BASENAME);

const DB_PATH = process.env.DB_PATH || DEFAULT_DB;

const DB_WAL = `${DB_PATH}-wal`;
const DB_SHM = `${DB_PATH}-shm`;

function safeUnlink(file: string) {
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // Best-effort cleanup.
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  safeUnlink(path.join(DATA_DIR, "agents.db"));
  safeUnlink(path.join(DATA_DIR, "agents.db-shm"));
  safeUnlink(path.join(DATA_DIR, "agents.db-wal"));

  safeUnlink(DB_WAL);
  safeUnlink(DB_SHM);
}

function getColumns(db: BetterDatabase, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table});`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((r) => r.name));
}

export function ensureAgentsTable(db: BetterDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Agents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      Namespace    TEXT NOT NULL,
      Cluster      TEXT NOT NULL,
      environment  TEXT,
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f-03:00','now','-3 hours'))
    );
  `);

  const cols = getColumns(db, "Agents");
  const hasEnviroment = cols.has("enviroment");
  const hasEnvironment = cols.has("environment");
  const hasCreatedAt = cols.has("created_at");
  const hasDataRegistro = cols.has("DataRegistro");

  const mustRebuild =
    hasEnviroment || hasDataRegistro || !hasCreatedAt || !hasEnvironment;

  if (mustRebuild) {
    db.exec("BEGIN IMMEDIATE TRANSACTION;");

    db.exec(`
      CREATE TABLE IF NOT EXISTS Agents__new (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        Namespace    TEXT NOT NULL,
        Cluster      TEXT NOT NULL,
        environment  TEXT,
        created_at   TEXT NOT NULL
      );
    `);

    const envExpr = `COALESCE(${hasEnvironment ? "environment" : "NULL"},
                               ${hasEnviroment ? "enviroment" : "NULL"})`;
    const createdExpr = `COALESCE(${hasCreatedAt ? "created_at" : "NULL"},
                                  ${hasDataRegistro ? "DataRegistro" : "NULL"},
                                  strftime('%Y-%m-%dT%H:%M:%f-03:00','now','-3 hours'))`;

    db.exec(`
      INSERT INTO Agents__new (id, Namespace, Cluster, environment, created_at)
      SELECT id, Namespace, Cluster, ${envExpr}, ${createdExpr}
        FROM Agents;
    `);

    db.exec("DROP TABLE Agents;");
    db.exec("ALTER TABLE Agents__new RENAME TO Agents;");

    db.exec("COMMIT;");
  }

  db.exec(`
    DELETE FROM Agents
     WHERE COALESCE(TRIM(environment), '') = '';
  `);

  db.exec(`
    WITH ranked AS (
      SELECT rowid,
             Cluster, Namespace, environment, created_at,
             ROW_NUMBER() OVER (
               PARTITION BY Cluster, Namespace, environment
               ORDER BY datetime(created_at) DESC, rowid DESC
             ) AS rn
        FROM Agents
    )
    DELETE FROM Agents
     WHERE rowid IN (SELECT rowid FROM ranked WHERE rn > 1);
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unique
      ON Agents (Cluster, Namespace, environment);
  `);
}

let dbInstance: BetterDatabase | null = null;

export function openDb(): BetterDatabase {
  if (dbInstance) return dbInstance;

  ensureDataDir();

  dbInstance = new DatabaseConstructor(DB_PATH);

  try {
    dbInstance.pragma("journal_mode = DELETE");
    dbInstance.pragma("synchronous = NORMAL");
  } catch {
    // Some builds/drivers might not support these PRAGMAs.
  }

  dbInstance.pragma("foreign_keys = ON");

  ensureAgentsTable(dbInstance);

  safeUnlink(DB_WAL);
  safeUnlink(DB_SHM);

  return dbInstance;
}

export type AgentRow = {
  Namespace: string;
  Cluster: string;
  environment: string;
  created_at: string;
};

export function rowToAgent(r: unknown): AgentRow {
  const o = r as Record<string, unknown>;
  return {
    Namespace: String(o.Namespace ?? ""),
    Cluster: String(o.Cluster ?? ""),
    environment: String(o.environment ?? ""),
    created_at: String(o.created_at ?? ""),
  };
}
