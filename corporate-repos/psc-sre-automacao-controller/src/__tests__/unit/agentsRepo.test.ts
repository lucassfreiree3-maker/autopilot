import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentRow } from "../../db/sqlite";

describe("AgentsRepo (sqlite)", () => {
  const originalEnv = process.env;
  let tmpDir = "";
  let dbPath = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-repo-"));
    dbPath = path.join(tmpDir, "test.db");
    process.env = { ...originalEnv, DB_PATH: dbPath };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for temp dir.
    }
  });

  test("upsertAgent and getAgent", async () => {
    const { AgentsRepo } = await import("../../repository/agentsRepo");

    AgentsRepo.upsertAgent({
      Namespace: "ns1",
      Cluster: "c1",
      environment: "hml",
    });

    const row = AgentsRepo.getAgent("c1", "ns1", "hml");
    expect(row).toBeTruthy();
    expect(row?.Namespace).toBe("ns1");
    expect(row?.Cluster).toBe("c1");
    expect(row?.environment).toBe("hml");
    expect(typeof row?.created_at).toBe("string");
  });

  test("listAgentsByEnv filters by environment", async () => {
    const { AgentsRepo } = await import("../../repository/agentsRepo");

    AgentsRepo.upsertAgent({
      Namespace: "ns1",
      Cluster: "c1",
      environment: "hml",
    });
    AgentsRepo.upsertAgent({
      Namespace: "ns2",
      Cluster: "c1",
      environment: "prod",
    });
    AgentsRepo.upsertAgent({
      Namespace: "ns3",
      Cluster: "c2",
      environment: "hml",
    });

    const hml = AgentsRepo.listAgentsByEnv("hml");
    expect(
      hml.map((a: AgentRow) => `${a.Cluster}/${a.Namespace}/${a.environment}`),
    ).toEqual(["c1/ns1/hml", "c2/ns3/hml"]);
  });

  test("getAgentByClusterAndNamespace returns a registered agent", async () => {
    const { AgentsRepo } = await import("../../repository/agentsRepo");

    AgentsRepo.upsertAgent({
      Namespace: "ns1",
      Cluster: "c1",
      environment: "hml",
    });

    const row = AgentsRepo.getAgentByClusterAndNamespace("c1", "ns1");
    expect(row).toBeTruthy();
    expect(row?.Cluster).toBe("c1");
    expect(row?.Namespace).toBe("ns1");
  });

  test("list respects limit", async () => {
    const { AgentsRepo } = await import("../../repository/agentsRepo");

    for (let i = 0; i < 5; i += 1) {
      AgentsRepo.upsertAgent({
        Namespace: `ns${i}`,
        Cluster: "c1",
        environment: "hml",
      });
    }

    const rows = AgentsRepo.list(2);
    expect(rows).toHaveLength(2);
  });
});
