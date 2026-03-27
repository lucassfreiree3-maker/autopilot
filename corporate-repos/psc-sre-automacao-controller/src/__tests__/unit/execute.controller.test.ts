import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type MockResponse = {
  status: jest.Mock;
  json: jest.Mock;
  locals: Record<string, unknown>;
};

function createMockResponse(): MockResponse {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn(),
  } as MockResponse;

  res.status.mockReturnValue(res);
  return res;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("executeAgent controller", () => {
  const originalEnv = process.env;
  let tmpDir = "";
  let dbPath = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "execute-controller-"));
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

  test("returns 404 when cluster/namespace is not registered", async () => {
    const fetchMock = jest.fn();
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { executeAgent } = await import("../../controllers/execute.controller");

    const req = {
      query: {},
      body: {
        cluster: "cluster-a",
        namespace: "ns-a",
        function: "get_pods",
      },
      headers: {},
      header: () => "",
    };
    const res = createMockResponse();
    const next = jest.fn();

    await executeAgent(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      error: "Agent not registered for given cluster/namespace",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("dispatches when cluster/namespace is registered", async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { AgentsRepo } = await import("../../repository/agentsRepo");
    const { executeAgent } = await import("../../controllers/execute.controller");

    AgentsRepo.upsertAgent({
      Namespace: "ns-a",
      Cluster: "cluster-a",
      environment: "hml",
    });

    const req = {
      query: {},
      body: {
        cluster: "cluster-a",
        namespace: "ns-a",
        function: "get_pods",
      },
      headers: {},
      header: () => "",
    };
    const res = createMockResponse();
    const next = jest.fn();

    await executeAgent(req as never, res as never, next);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(next).not.toHaveBeenCalled();
  });

  test("returns 504 when agent dispatch times out", async () => {
    process.env.AGENT_CALL_TIMEOUT_MS = "1234";
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    const fetchMock = jest.fn().mockRejectedValue(abortError);
    (global as unknown as { fetch: typeof fetch }).fetch =
      fetchMock as unknown as typeof fetch;

    const { AgentsRepo } = await import("../../repository/agentsRepo");
    const { executeAgent } = await import("../../controllers/execute.controller");

    AgentsRepo.upsertAgent({
      Namespace: "ns-a",
      Cluster: "cluster-a",
      environment: "hml",
    });

    const req = {
      query: {},
      body: {
        cluster: "cluster-a",
        namespace: "ns-a",
        function: "get_pods",
      },
      headers: {},
      header: () => "",
    };
    const res = createMockResponse();
    const next = jest.fn();

    await executeAgent(req as never, res as never, next);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: "Timed out while waiting for Agent response",
        detail: "No response from Agent after 1234ms",
        execId: expect.any(String),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
