import type { Request, Response } from "express";

jest.mock("../../util/logger", () => ({
  appendTraceLine: jest.fn(),
}));

jest.mock("../../util/s3logger", () => ({
  readExecutionSnapshot: jest.fn(async () => null),
  uploadExecutionSnapshot: jest.fn(async () => true),
  uploadTraceFile: jest.fn(async () => undefined),
}));

jest.mock("../../services/automation-log.service", () => ({
  getExecutionStatusByExecId: jest.fn(async () => ({
    status: "UNKNOWN",
    entries: [],
    lastUpdateAt: "",
  })),
}));

describe("pushAgentExecutionLogs execId validation (Token B)", () => {
  const makeRes = () => {
    const res = {} as Partial<Response>;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  test("returns 403 when execId in token does not match execId in body", async () => {
    const { pushAgentExecutionLogs } = await import(
      "../../controllers/agents-execute-logs.controller"
    );

    const req = {
      body: {
        execId: "exec-body",
        entries: [
          { ts: new Date().toISOString(), status: "RUNNING", message: "x" },
        ],
      },
      query: {},
      header: () => undefined,
      agentCallbackJwt: { execId: "exec-token" },
    } as unknown as Request;

    const res = makeRes();

    await pushAgentExecutionLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        status: 403,
      }),
    );
  });

  test("accepts when execId in token matches execId in body", async () => {
    const { pushAgentExecutionLogs } = await import(
      "../../controllers/agents-execute-logs.controller"
    );

    const req = {
      body: {
        execId: "exec-1",
        entries: [
          { ts: new Date().toISOString(), status: "RUNNING", message: "x" },
        ],
        source: "agent",
        from: "agent",
      },
      query: {},
      header: () => undefined,
      agentCallbackJwt: { execId: "exec-1" },
    } as unknown as Request;

    const res = makeRes();

    await pushAgentExecutionLogs(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        execId: "exec-1",
      }),
    );
  });
});

describe("waitForFinalExecution behavior", () => {
  const makeRes = () => {
    const res = {} as Partial<Response>;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  async function flushAsyncTimers(ms: number): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise(r => process.nextTick(r));
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 10; i++) await new Promise(r => process.nextTick(r));
  }

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    const s3loggerMock = jest.requireMock("../../util/s3logger") as {
      readExecutionSnapshot: jest.Mock;
      uploadExecutionSnapshot: jest.Mock;
      uploadTraceFile: jest.Mock;
    };
    s3loggerMock.readExecutionSnapshot.mockReset();
    s3loggerMock.readExecutionSnapshot.mockResolvedValue(null);
    s3loggerMock.uploadExecutionSnapshot.mockReset();
    s3loggerMock.uploadExecutionSnapshot.mockResolvedValue(true);
    s3loggerMock.uploadTraceFile.mockReset();
    s3loggerMock.uploadTraceFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("resolves when status becomes DONE for the same execId", async () => {
    const mod = await import(
      "../../controllers/agents-execute-logs.controller"
    );

    mod.initExecution("exec-10");
    const waiter = mod.waitForFinalExecution("exec-10", 2000);

    const req = {
      body: {
        execId: "exec-10",
        entries: [
          { ts: new Date().toISOString(), status: "RUNNING", message: "x" },
          { ts: new Date().toISOString(), status: "DONE", message: "done" },
        ],
        source: "agent",
        from: "agent",
      },
      query: {},
      header: () => undefined,
      agentCallbackJwt: { execId: "exec-10" },
    } as unknown as Request;

    const res = makeRes();
    await mod.pushAgentExecutionLogs(req, res);

    const result = await waiter;
    expect(result.timedOut).toBe(false);
    expect(result.snapshot.execId).toBe("exec-10");
    expect(result.snapshot.status).toBe("DONE");
    expect(result.snapshot.finished).toBe(true);
  });

  test("does not resolve from updates of a different execId", async () => {
    const mod = await import(
      "../../controllers/agents-execute-logs.controller"
    );

    mod.initExecution("exec-20");
    const waiter = mod.waitForFinalExecution("exec-20", 50);

    const reqOther = {
      body: {
        execId: "exec-other",
        entries: [{ ts: new Date().toISOString(), status: "DONE" }],
        source: "agent",
        from: "agent",
      },
      query: {},
      header: () => undefined,
      agentCallbackJwt: { execId: "exec-other" },
    } as unknown as Request;

    const res = makeRes();
    await mod.pushAgentExecutionLogs(reqOther, res);

    await flushAsyncTimers(60);
    const result = await waiter;
    expect(result.timedOut).toBe(true);
    expect(result.snapshot.execId).toBe("exec-20");
    expect(["PENDING", "RUNNING"]).toContain(result.snapshot.status);
  });

  test("times out when no final status arrives", async () => {
    const mod = await import(
      "../../controllers/agents-execute-logs.controller"
    );

    mod.initExecution("exec-30");
    const waiter = mod.waitForFinalExecution("exec-30", 100);

    await flushAsyncTimers(120);
    const result = await waiter;

    expect(result.timedOut).toBe(true);
    expect(result.snapshot.execId).toBe("exec-30");
    expect(["PENDING", "RUNNING"]).toContain(result.snapshot.status);
  });

  test("resolves from a persisted shared snapshot when local state is empty", async () => {
    const s3loggerMock = jest.requireMock("../../util/s3logger") as {
      readExecutionSnapshot: jest.Mock;
    };
    s3loggerMock.readExecutionSnapshot.mockResolvedValue({
      ok: true,
      execId: "exec-40",
      status: "DONE",
      statusLabel: "Done",
      finished: true,
      lastUpdate: "2026-03-19T23:32:03.551Z",
      count: 2,
      entries: [
        {
          ts: "2026-03-19T23:32:03.551Z",
          status: "DONE",
          level: "info",
          message: "resultado final",
        },
        {
          ts: "2026-03-19T23:31:57.141Z",
          status: "RUNNING",
          level: "info",
          message: "inicio",
        },
      ],
    });

    const mod = await import(
      "../../controllers/agents-execute-logs.controller"
    );

    mod.initExecution("exec-40");
    const result = await mod.waitForFinalExecution("exec-40", 2000);

    expect(result.timedOut).toBe(false);
    expect(result.snapshot.status).toBe("DONE");
    expect(result.snapshot.finished).toBe(true);
    expect(result.snapshot.count).toBe(2);
  });
});

describe("message normalization", () => {
  const makeRes = () => {
    const res = {} as Partial<Response>;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  beforeEach(() => {
    jest.resetModules();
    const s3loggerMock = jest.requireMock("../../util/s3logger") as {
      readExecutionSnapshot: jest.Mock;
      uploadExecutionSnapshot: jest.Mock;
      uploadTraceFile: jest.Mock;
    };
    s3loggerMock.readExecutionSnapshot.mockReset();
    s3loggerMock.readExecutionSnapshot.mockResolvedValue(null);
    s3loggerMock.uploadExecutionSnapshot.mockReset();
    s3loggerMock.uploadExecutionSnapshot.mockResolvedValue(true);
    s3loggerMock.uploadTraceFile.mockReset();
    s3loggerMock.uploadTraceFile.mockResolvedValue(undefined);
  });

  test("decodes HTML entities before storing and tracing callback messages", async () => {
    const { appendTraceLine } = jest.requireMock("../../util/logger") as {
      appendTraceLine: jest.Mock;
    };
    appendTraceLine.mockReset();

    const mod = await import(
      "../../controllers/agents-execute-logs.controller"
    );

    const req = {
      body: {
        execId: "exec-html",
        entries: [
          {
            ts: "2026-03-19T23:32:03.551Z",
            status: "DONE",
            level: "info",
            message:
              "{\n  &quot;namespace&quot;: &quot;vip&#x2F;ns&quot;,\n  &quot;status&quot;: &quot;success&quot;\n}",
          },
        ],
        source: "agent",
        from: "agent",
      },
      query: {},
      header: () => undefined,
      agentCallbackJwt: { execId: "exec-html" },
    } as unknown as Request;

    const res = makeRes();
    await mod.pushAgentExecutionLogs(req, res);
    const snapshot = await mod.getExecutionSnapshot("exec-html");

    expect(snapshot.entries[0]).toEqual(
      expect.objectContaining({
        message:
          '{\n  "namespace": "vip/ns",\n  "status": "success"\n}',
      }),
    );
    expect(appendTraceLine).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('message={   "namespace": "vip/ns",   "status": "success" }'),
    );
  });
});
