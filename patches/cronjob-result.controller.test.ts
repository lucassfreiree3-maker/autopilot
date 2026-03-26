import type { Request, Response } from "express";

jest.mock("../../controllers/agents-execute-logs.controller", () => ({
  pushAgentExecutionLogs: jest.fn().mockImplementation(async (_req, res) => {
    res.status(200).json({ ok: true });
  }),
  initExecution: jest.fn(),
  getExecutionSnapshot: jest.fn().mockResolvedValue({
    ok: true,
    execId: "exec-123",
    status: "DONE",
    statusLabel: "Done",
    finished: true,
    lastUpdate: "2024-01-01T00:00:00.000Z",
    count: 1,
    entries: [],
  }),
}));

jest.mock("../../util/time", () => ({
  timestampSP: jest.fn().mockReturnValue("2024-01-01T00:00:00.000Z"),
}));

function makeReq(
  body: unknown = {},
  params: Record<string, string> = {},
): Request {
  return {
    body,
    params,
    query: {},
    header: () => undefined,
    agentCallbackJwt: {},
  } as unknown as Request;
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  (res.json as jest.Mock).mockReturnValue(res);
  return res;
}

describe("cronjob-result.controller", () => {
  let receiveCronjobResult: (req: Request, res: Response) => Promise<void>;
  let getCronjobStatus: (req: Request, res: Response) => Promise<void>;
  let mockPushAgentExecutionLogs: jest.Mock;
  let mockInitExecution: jest.Mock;
  let mockGetExecutionSnapshot: jest.Mock;

  beforeAll(async () => {
    const controller = await import(
      "../../controllers/cronjob-result.controller"
    );
    receiveCronjobResult = controller.receiveCronjobResult;
    getCronjobStatus = controller.getCronjobStatus;

    const logsModule = await import(
      "../../controllers/agents-execute-logs.controller"
    );
    mockPushAgentExecutionLogs =
      logsModule.pushAgentExecutionLogs as jest.Mock;
    mockInitExecution = logsModule.initExecution as jest.Mock;
    mockGetExecutionSnapshot = logsModule.getExecutionSnapshot as jest.Mock;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPushAgentExecutionLogs.mockImplementation(async (_req, res) => {
      res.status(200).json({ ok: true });
    });
    mockGetExecutionSnapshot.mockResolvedValue({
      ok: true,
      execId: "exec-123",
      status: "DONE",
      statusLabel: "Done",
      finished: true,
      lastUpdate: "2024-01-01T00:00:00.000Z",
      count: 1,
      entries: [],
    });
  });

  const validSuccessBody = {
    compliance_status: "success",
    namespace: "ns-test",
    cluster_type: "origem",
    timestamp: "2024-01-01T00:00:00.000Z",
    execId: "exec-123",
    captured_data: { pods: 5 },
  };

  const validFailedBody = {
    compliance_status: "failed",
    namespace: "ns-test",
    cluster_type: "origem",
    timestamp: "2024-01-01T00:00:00.000Z",
    execId: "exec-456",
    failures: [{ reason: "pod crashed" }],
  };

  const validErrorBody = {
    compliance_status: "error",
    namespace: "ns-test",
    cluster_type: "origem",
    timestamp: "2024-01-01T00:00:00.000Z",
    execId: "exec-789",
    errors: [{ message: "network timeout" }],
  };

  // ── validateCronjobResult ─────────────────────────────────────

  describe("validateCronjobResult (via receiveCronjobResult)", () => {
    test("returns 400 when body is not a JSON object", async () => {
      const req = makeReq("not-an-object");
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          details: expect.arrayContaining([
            "Request body must be a JSON object.",
          ]),
        }),
      );
    });

    test("returns 400 when compliance_status is missing", async () => {
      const { compliance_status: _cs, ...body } = validSuccessBody;
      const req = makeReq(body);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(
        jsonArg.details.some((d: string) => d.includes("compliance_status")),
      ).toBe(true);
    });

    test("returns 400 when compliance_status is invalid", async () => {
      const req = makeReq({ ...validSuccessBody, compliance_status: "unknown" });
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(
        jsonArg.details.some((d: string) => d.includes("compliance_status")),
      ).toBe(true);
    });

    test("returns 400 when namespace is missing", async () => {
      const { namespace: _ns, ...body } = validSuccessBody;
      const req = makeReq(body);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(
        jsonArg.details.some((d: string) => d.includes("namespace")),
      ).toBe(true);
    });

    test("returns 400 when captured_data is absent for success", async () => {
      const { captured_data: _cd, ...body } = validSuccessBody;
      const req = makeReq(body);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(
        jsonArg.details.some((d: string) => d.includes("captured_data")),
      ).toBe(true);
    });

    test("returns 400 when failures is absent for failed", async () => {
      const { failures: _f, ...body } = validFailedBody;
      const req = makeReq(body);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(
        jsonArg.details.some((d: string) => d.includes("failures")),
      ).toBe(true);
    });

    test("returns 400 when errors is absent for error", async () => {
      const { errors: _e, ...body } = validErrorBody;
      const req = makeReq(body);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(
        jsonArg.details.some((d: string) => d.includes("errors")),
      ).toBe(true);
    });
  });

  // ── mapComplianceStatusToExecStatus ───────────────────────────

  describe("mapComplianceStatusToExecStatus (via receiveCronjobResult)", () => {
    test("maps success to DONE", async () => {
      const req = makeReq(validSuccessBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(mockInitExecution).toHaveBeenCalledWith("exec-123");
      const syntheticReq = mockPushAgentExecutionLogs.mock.calls[0][0];
      const entries = syntheticReq.body.entries as Array<
        Record<string, unknown>
      >;
      expect(entries[0].execStatus).toBe("DONE");
      expect(entries[0].status).toBe("DONE");
    });

    test("maps failed to ERROR", async () => {
      const req = makeReq(validFailedBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      const syntheticReq = mockPushAgentExecutionLogs.mock.calls[0][0];
      const entries = syntheticReq.body.entries as Array<
        Record<string, unknown>
      >;
      expect(entries[0].execStatus).toBe("ERROR");
    });

    test("maps error to ERROR", async () => {
      const req = makeReq(validErrorBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      const syntheticReq = mockPushAgentExecutionLogs.mock.calls[0][0];
      const entries = syntheticReq.body.entries as Array<
        Record<string, unknown>
      >;
      expect(entries[0].execStatus).toBe("ERROR");
    });
  });

  // ── adaptCronjobResultToLogEntries ────────────────────────────

  describe("adaptCronjobResultToLogEntries (via receiveCronjobResult)", () => {
    test("success entry has correct fields: ts, execId, source, from, level, status, message, data", async () => {
      const req = makeReq(validSuccessBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      const syntheticReq = mockPushAgentExecutionLogs.mock.calls[0][0];
      const entry = (
        syntheticReq.body.entries as Array<Record<string, unknown>>
      )[0];
      expect(entry.ts).toBe("2024-01-01T00:00:00.000Z");
      expect(entry.execId).toBe("exec-123");
      expect(entry.source).toBe("cronjob-callback");
      expect(entry.from).toBe("agent");
      expect(entry.level).toBe("INFO");
      expect(entry.status).toBe("DONE");
      expect(entry.execStatus).toBe("DONE");
      expect(typeof entry.message).toBe("string");
      expect((entry.data as Record<string, unknown>).captured_data).toEqual({
        pods: 5,
      });
    });

    test("failed entry has failures in data", async () => {
      const req = makeReq(validFailedBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      const syntheticReq = mockPushAgentExecutionLogs.mock.calls[0][0];
      const entry = (
        syntheticReq.body.entries as Array<Record<string, unknown>>
      )[0];
      expect(entry.level).toBe("ERROR");
      expect(entry.execStatus).toBe("ERROR");
      expect((entry.data as Record<string, unknown>).failures).toEqual([
        { reason: "pod crashed" },
      ]);
    });

    test("error entry has errors in data", async () => {
      const req = makeReq(validErrorBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      const syntheticReq = mockPushAgentExecutionLogs.mock.calls[0][0];
      const entry = (
        syntheticReq.body.entries as Array<Record<string, unknown>>
      )[0];
      expect(entry.level).toBe("ERROR");
      expect(entry.execStatus).toBe("ERROR");
      expect((entry.data as Record<string, unknown>).errors).toEqual([
        { message: "network timeout" },
      ]);
    });
  });

  // ── receiveCronjobResult handler ──────────────────────────────

  describe("receiveCronjobResult handler", () => {
    test("returns 200 with indexed:true on valid success payload", async () => {
      const req = makeReq(validSuccessBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          execId: "exec-123",
          namespace: "ns-test",
          compliance_status: "success",
          indexed: true,
          statusEndpoint: "/api/cronjob/status/exec-123",
        }),
      );
    });

    test("calls initExecution and pushAgentExecutionLogs", async () => {
      const req = makeReq(validSuccessBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(mockInitExecution).toHaveBeenCalledWith("exec-123");
      expect(mockPushAgentExecutionLogs).toHaveBeenCalledTimes(1);
    });

    test("returns 400 for invalid payload", async () => {
      const req = makeReq({ invalid: true });
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false }),
      );
    });

    test("returns 500 when pushAgentExecutionLogs throws", async () => {
      mockPushAgentExecutionLogs.mockRejectedValueOnce(
        new Error("Storage failure"),
      );
      const req = makeReq(validSuccessBody);
      const res = makeRes();
      await receiveCronjobResult(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false }),
      );
    });
  });

  // ── getCronjobStatus handler ──────────────────────────────────

  describe("getCronjobStatus handler", () => {
    test("returns 400 when execId param is missing", async () => {
      const req = makeReq({}, { execId: "" });
      const res = makeRes();
      await getCronjobStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false, error: expect.any(String) }),
      );
    });

    test("returns 200 with snapshot fields when execId is valid", async () => {
      const req = makeReq({}, { execId: "exec-123" });
      const res = makeRes();
      await getCronjobStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          execId: "exec-123",
          status: "DONE",
          statusLabel: "Done",
          finished: true,
          lastUpdate: "2024-01-01T00:00:00.000Z",
          count: 1,
          entries: [],
        }),
      );
    });

    test("calls getExecutionSnapshot with the provided execId", async () => {
      const req = makeReq({}, { execId: "exec-abc" });
      const res = makeRes();
      mockGetExecutionSnapshot.mockResolvedValueOnce({
        ok: true,
        execId: "exec-abc",
        status: "ERROR",
        statusLabel: "Error",
        finished: true,
        lastUpdate: "2024-01-01T00:00:00.000Z",
        count: 0,
        entries: [],
      });
      await getCronjobStatus(req, res);
      expect(mockGetExecutionSnapshot).toHaveBeenCalledWith("exec-abc");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("returns 500 when getExecutionSnapshot throws", async () => {
      mockGetExecutionSnapshot.mockRejectedValueOnce(new Error("Not found"));
      const req = makeReq({}, { execId: "exec-missing" });
      const res = makeRes();
      await getCronjobStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false }),
      );
    });
  });
});
