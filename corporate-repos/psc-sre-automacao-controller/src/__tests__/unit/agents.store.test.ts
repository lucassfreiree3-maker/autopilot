import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("AgentsStore", () => {
  const originalCwd = process.cwd();
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-store-"));
    process.chdir(tmpDir);
    jest.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for temp dir.
    }
  });

  test("list starts empty", async () => {
    const { AgentsStore } = await import("../../store/agents.store");
    expect(AgentsStore.list()).toEqual([]);
  });

  test("add persists and exists returns true", async () => {
    const { AgentsStore } = await import("../../store/agents.store");

    const rec = AgentsStore.add({
      cluster: "c1",
      namespace: "ns1",
      environment: "hml",
    });

    expect(rec.cluster).toBe("c1");
    expect(rec.namespace).toBe("ns1");
    expect(rec.environment).toBe("hml");
    expect(typeof rec.registeredAt).toBe("string");

    expect(
      AgentsStore.exists({
        cluster: "c1",
        namespace: "ns1",
        environment: "hml",
      }),
    ).toBe(true);

    const all = AgentsStore.list();
    expect(all).toHaveLength(1);
    expect(all[0].cluster).toBe("c1");
  });

  test("exists returns false for non-matching key", async () => {
    const { AgentsStore } = await import("../../store/agents.store");

    AgentsStore.add({
      cluster: "c1",
      namespace: "ns1",
      environment: "prod",
    });

    expect(
      AgentsStore.exists({
        cluster: "c1",
        namespace: "ns1",
        environment: "hml",
      }),
    ).toBe(false);
  });
});
