import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("trusted agent resolution", () => {
  const originalEnv = process.env;
  let tmpDir = "";
  let dbPath = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trusted-agent-"));
    dbPath = path.join(tmpDir, "test.db");
    process.env = {
      ...originalEnv,
      DB_PATH: dbPath,
      AGENT_BASE_URL_TEMPLATE: "https://agent.{cluster}.svc.local",
      AGENT_EXECUTE_URL_TEMPLATE: "",
      AGENT_BASE_URL: "",
      AGENT_EXECUTE_URL: "",
    };
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

  test("returns null when cluster/namespace is not registered", async () => {
    const { resolveTrustedRegisteredAgentExecuteUrl } = await import(
      "../../util/trusted-agent"
    );

    expect(
      resolveTrustedRegisteredAgentExecuteUrl({
        cluster: "cluster-a",
        namespace: "ns-a",
      }),
    ).toBeNull();
  });

  test("resolves agent URL only for registered cluster/namespace", async () => {
    const { AgentsRepo } = await import("../../repository/agentsRepo");
    const { resolveTrustedRegisteredAgentExecuteUrl } = await import(
      "../../util/trusted-agent"
    );

    AgentsRepo.upsertAgent({
      Namespace: "ns-a",
      Cluster: "cluster-a",
      environment: "hml",
    });

    expect(
      resolveTrustedRegisteredAgentExecuteUrl({
        cluster: "cluster-a",
        namespace: "ns-a",
      }),
    ).toBe("https://agent.cluster-a.svc.local/agent/execute");
  });
});
