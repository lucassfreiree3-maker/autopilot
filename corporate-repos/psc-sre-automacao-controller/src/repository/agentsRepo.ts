import {
  openDb,
  ensureAgentsTable,
  rowToAgent,
  type AgentRow,
} from "../db/sqlite";
import { timestampSP } from "../util/time";

export function upsertAgent(row: {
  Namespace: string;
  Cluster: string;
  environment: string;
}): void {
  const db = openDb();
  ensureAgentsTable(db);
  const rowWithTimestamp = {
    ...row,
    createdAt: timestampSP(),
  };
  db.prepare(
    `
    INSERT INTO Agents (Namespace, Cluster, environment, created_at)
    VALUES (@Namespace, @Cluster, @environment, @createdAt)
    ON CONFLICT(Cluster, Namespace, environment) DO UPDATE SET
      created_at = excluded.created_at
  `,
  ).run(rowWithTimestamp);
}

export function getAgent(
  cluster: string,
  namespace: string,
  environment: string,
): AgentRow | null {
  const db = openDb();
  ensureAgentsTable(db);
  const row = db
    .prepare(
      `
      SELECT Namespace, Cluster, environment, created_at
        FROM Agents
       WHERE Cluster = ?
         AND Namespace = ?
         AND environment = ?
       LIMIT 1;
    `,
    )
    .get(cluster, namespace, environment);
  return row ? rowToAgent(row) : null;
}

export function getAgentByClusterAndNamespace(
  cluster: string,
  namespace: string,
): AgentRow | null {
  const db = openDb();
  ensureAgentsTable(db);
  const row = db
    .prepare(
      `
      SELECT Namespace, Cluster, environment, created_at
        FROM Agents
       WHERE Cluster = ?
         AND Namespace = ?
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT 1;
    `,
    )
    .get(cluster, namespace);
  return row ? rowToAgent(row) : null;
}

export function getAgentByCluster(cluster: string): AgentRow | null {
  const db = openDb();
  ensureAgentsTable(db);
  const row = db
    .prepare(
      `
      SELECT Namespace, Cluster, environment, created_at
        FROM Agents
       WHERE Cluster = ?
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT 1;
    `,
    )
    .get(cluster);
  return row ? rowToAgent(row) : null;
}

export function listAgentsByEnv(environment: string): AgentRow[] {
  const db = openDb();
  ensureAgentsTable(db);
  const rows = db
    .prepare(
      `
      SELECT Namespace, Cluster, environment, created_at
        FROM Agents
       WHERE environment = ?
       ORDER BY Cluster, Namespace;
    `,
    )
    .all(environment);
  const out: AgentRow[] = [];
  for (let i = 0; i < rows.length; i += 1) out.push(rowToAgent(rows[i]));
  return out;
}

export function list(limit = 100): AgentRow[] {
  const lim = Math.max(1, Math.min(1000, Number(limit || 100)));
  const db = openDb();
  ensureAgentsTable(db);
  const rows = db
    .prepare(
      `
      SELECT Namespace, Cluster, environment, created_at
        FROM Agents
       ORDER BY Cluster, Namespace
       LIMIT ?;
    `,
    )
    .all(lim);
  const out: AgentRow[] = [];
  for (let i = 0; i < rows.length; i += 1) out.push(rowToAgent(rows[i]));
  return out;
}

export const AgentsRepo = {
  upsertAgent,
  getAgent,
  getAgentByClusterAndNamespace,
  getAgentByCluster,
  listAgentsByEnv,
  list,
};
