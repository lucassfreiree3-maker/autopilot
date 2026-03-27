import fs from "node:fs";
import path from "node:path";
import { timestampSP } from "../util/time";

export type AgentRecord = {
  namespace: string;
  cluster: string;
  environment: "desenv" | "hml" | "prod";
  registeredAt: string;
};

type DbShape = { agents: AgentRecord[] };

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "agents.json");

function ensureFile(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial: DbShape = { agents: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

function load(): DbShape {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw) as DbShape;
    if (!parsed.agents) return { agents: [] };
    return parsed;
  } catch {
    return { agents: [] };
  }
}

function save(db: DbShape): void {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function keyOf(
  a: Pick<AgentRecord, "cluster" | "namespace" | "environment">,
): string {
  return `${a.cluster}::${a.namespace}::${a.environment}`;
}

export const AgentsStore = {
  list(): AgentRecord[] {
    return load().agents;
  },

  exists(
    query: Pick<AgentRecord, "cluster" | "namespace" | "environment">,
  ): boolean {
    const k = keyOf(query);
    return load().agents.some((a) => keyOf(a) === k);
  },

  add(agent: Omit<AgentRecord, "registeredAt">): AgentRecord {
    const db = load();
    const rec: AgentRecord = {
      ...agent,
      registeredAt: timestampSP(),
    };
    db.agents.push(rec);
    save(db);
    return rec;
  },
};
