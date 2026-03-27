import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function createMockResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);
  return res;
}

describe("registerAgent controller", () => {
  const originalEnv = process.env;
  let tmpDir = "";
  let dbPath = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "register-controller-"));
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

  test("rejects unsafe cluster or namespace values", async () => {
    const { registerAgent } = await import("../../controllers/register.controller");

    const req = {
      body: {
        namespace: "dev<script>",
        cluster: "cluster-a",
        environment: "hml",
      },
      originalUrl: "/agent/register",
    };
    const res = createMockResponse();

    await registerAgent(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("registers a safe agent payload", async () => {
    const { registerAgent } = await import("../../controllers/register.controller");

    const req = {
      body: {
        namespace: "dev-demo-api",
        cluster: "cluster-a",
        environment: "hml",
      },
      originalUrl: "/agent/register",
    };
    const res = createMockResponse();

    await registerAgent(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(201);
  });
});
