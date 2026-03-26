import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

jest.setTimeout(15000);

jest.mock("../../controllers/execute.controller", () => ({
  executeAgent: jest.fn(
    async (req: Request, res: Response, next: NextFunction) => {
      const modeRaw = typeof req.query.mode === "string" ? req.query.mode : "";
      const mode = String(modeRaw || "")
        .trim()
        .toLowerCase();

      res.locals = {
        ...(res.locals || {}),
        execId: "exec-123",
        startedAt: Date.now(),
      };

      if (mode === "sync") {
        next();
        return;
      }

      res.status(202).json({
        ok: true,
        execId: "exec-123",
        mode: "async",
        status: "RUNNING",
      });
    },
  ),
}));

jest.mock("../../controllers/agents-execute-logs.controller", () => ({
  pushAgentExecutionLogs: jest.fn(async (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  }),
  getAgentExecutionStatus: jest.fn(async (_req: Request, res: Response) => {
    res.status(200).json({ status: "DONE" });
  }),
  waitForFinalExecution: jest.fn(async () => ({
    timedOut: false,
    snapshot: {
      ok: true,
      execId: "exec-123",
      status: "DONE",
      statusLabel: "Done",
      finished: true,
      lastUpdate: new Date().toISOString(),
      count: 1,
      entries: [{ ts: new Date().toISOString(), status: "DONE" }],
    },
  })),
}));

jest.mock("../../controllers/list.controller", () => ({
  listAgents: jest.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true, data: [] });
  }),
}));

jest.mock("../../controllers/info.controller", () => ({
  getInfo: jest.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  }),
}));

jest.mock("../../controllers/register.controller", () => ({
  registerAgent: jest.fn((_req: Request, res: Response) => {
    res.status(201).json({ ok: true });
  }),
}));

jest.mock("../../controllers/agent-errors.controller", () => ({
  getAgentErrors: jest.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true, data: [] });
  }),
}));

jest.mock("../../controllers/cronjob-result.controller", () => ({
  receiveCronjobResult: jest.fn(async (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, indexed: true });
  }),
  getCronjobStatus: jest.fn(async (_req: Request, res: Response) => {
    res.status(200).json({ ok: true, status: "DONE" });
  }),
}));

describe("agentsRouter auth + scopes enforcement", () => {
  const JWT_SECRET = process.env.JWT_SECRET || "router-test-secret";

  const TEST_SCOPE_EXECUTE =
    process.env.SCOPE_EXECUTE_AUTOMATION || "scope:test:execute";
  const TEST_SCOPE_SEND = process.env.SCOPE_SEND_LOGS || "scope:test:send";
  const TEST_SCOPE_READ = process.env.SCOPE_READ_STATUS || "scope:test:read";
  const TEST_SCOPE_REGISTER =
    process.env.SCOPE_REGISTER_AGENT || "scope:test:register";

  async function makeApp() {
    const { default: agentsRouter } = await import("../../routes/agentsRouter");
    const app = express();
    app.use(express.json());
    app.use(agentsRouter);
    return app;
  }

  function bearer(scopes: string[] = []) {
    const token = jwt.sign({ sub: "tester", scope: scopes }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "10m",
    });
    return `Bearer ${token}`;
  }

  function callbackBearer(
    params: { execId?: string; agentId?: string; scopes?: string[] } = {},
  ) {
    const token = jwt.sign(
      {
        typ: "agent-callback",
        execId: params.execId ?? "exec-123",
        agentId: params.agentId ?? "agent-01",
        scope: params.scopes ?? [],
      },
      JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "5m",
        issuer: process.env.JWT_CALLBACK_ISSUER,
        audience: process.env.JWT_CALLBACK_AUDIENCE,
      },
    );
    return `Bearer ${token}`;
  }

  test("POST /agent/execute rejects when missing Bearer token", async () => {
    const app = await makeApp();
    const res = await request(app).post("/agent/execute").send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  test("POST /agent/execute rejects when token lacks required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/agent/execute")
      .set("Authorization", bearer([TEST_SCOPE_READ]))
      .send({ any: "payload" });

    expect(res.status).toBe(403);
  });

  test("POST /agent/execute accepts when Bearer token has required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/agent/execute")
      .set("Authorization", bearer([TEST_SCOPE_EXECUTE]))
      .send({ any: "payload" });

    expect([200, 202]).toContain(res.status);
  });

  test("GET /agent/execute rejects when missing Bearer token", async () => {
    const app = await makeApp();
    const res = await request(app).get("/agent/execute?uuid=exec-123");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  test("GET /agent/execute rejects when token lacks required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .get("/agent/execute?uuid=exec-123")
      .set("Authorization", bearer([TEST_SCOPE_EXECUTE]));

    expect(res.status).toBe(403);
  });

  test("GET /agent/execute accepts when Bearer token has required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .get("/agent/execute?uuid=exec-123")
      .set("Authorization", bearer([TEST_SCOPE_READ]));

    expect(res.status).toBe(200);
  });

  test("POST /agent/execute/logs rejects when missing Bearer token", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/agent/execute/logs")
      .send({ execId: "exec-123", entries: [] });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  test("POST /agent/execute/logs rejects when callback token lacks required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/agent/execute/logs")
      .set(
        "Authorization",
        callbackBearer({ execId: "exec-123", scopes: [TEST_SCOPE_READ] }),
      )
      .send({ execId: "exec-123", entries: [] });

    expect(res.status).toBe(403);
  });

  test("POST /agent/execute/logs accepts when callback token has required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/agent/execute/logs")
      .set(
        "Authorization",
        callbackBearer({ execId: "exec-123", scopes: [TEST_SCOPE_SEND] }),
      )
      .send({ execId: "exec-123", entries: [] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test("POST /agent/register rejects when missing Bearer token", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/agent/register")
      .send({ any: "payload" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  test("POST /agent/register rejects when callback token lacks required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/agent/register")
      .set(
        "Authorization",
        callbackBearer({ execId: "exec-123", scopes: [TEST_SCOPE_SEND] }),
      )
      .send({ any: "payload" });

    expect(res.status).toBe(403);
  });

  test("GET /agent/info is reachable", async () => {
    const app = await makeApp();
    const res = await request(app).get("/agent/info");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test("POST /agent/register accepts when callback token has required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/agent/register")
      .set(
        "Authorization",
        callbackBearer({ execId: "exec-123", scopes: [TEST_SCOPE_REGISTER] }),
      )
      .send({ any: "payload" });

    expect([200, 201]).toContain(res.status);
  });

  test("POST /api/cronjob/result rejects when missing Bearer token", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/cronjob/result")
      .send({ any: "payload" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  test("POST /api/cronjob/result rejects when callback token lacks required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/cronjob/result")
      .set(
        "Authorization",
        callbackBearer({ execId: "exec-123", scopes: [TEST_SCOPE_READ] }),
      )
      .send({ any: "payload" });
    expect(res.status).toBe(403);
  });

  test("POST /api/cronjob/result accepts when callback token has required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/cronjob/result")
      .set(
        "Authorization",
        callbackBearer({ execId: "exec-123", scopes: [TEST_SCOPE_SEND] }),
      )
      .send({ any: "payload" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, indexed: true });
  });

  test("GET /api/cronjob/status/:execId rejects when missing Bearer token", async () => {
    const app = await makeApp();
    const res = await request(app).get("/api/cronjob/status/exec-123");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  test("GET /api/cronjob/status/:execId rejects when token lacks required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .get("/api/cronjob/status/exec-123")
      .set("Authorization", bearer([TEST_SCOPE_EXECUTE]));
    expect(res.status).toBe(403);
  });

  test("GET /api/cronjob/status/:execId accepts when Bearer token has required scope", async () => {
    const app = await makeApp();
    const res = await request(app)
      .get("/api/cronjob/status/exec-123")
      .set("Authorization", bearer([TEST_SCOPE_READ]));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, status: "DONE" });
  });
});
