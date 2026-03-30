import express from "express";
import request from "supertest";
import { JWTService } from "../../util/jwt";

jest.setTimeout(15000);

jest.mock("../../util/jwt", () => ({
  JWTService: {
    generateCallbackToken: jest.fn().mockReturnValue("mock-callback-token"),
  },
}));

describe("CronjobCallbackAPI", () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;

  async function makeApp() {
    const { default: CronjobCallbackAPI } = await import(
      "../../routes/cronjob-callback"
    );
    const router = express.Router();
    new CronjobCallbackAPI(router);
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
  }

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const validSuccessPayload = {
    compliance_status: "success",
    namespace: "ns-test",
    cluster_type: "origem",
    timestamp: "2024-01-01T00:00:00.000Z",
    execId: "exec-123",
    captured_data: { pods: 5 },
  };

  const validFailedPayload = {
    compliance_status: "failed",
    namespace: "ns-test",
    cluster_type: "origem",
    timestamp: "2024-01-01T00:00:00.000Z",
    execId: "exec-456",
    failures: [{ reason: "pod crashed" }],
  };

  const validErrorPayload = {
    compliance_status: "error",
    namespace: "ns-test",
    cluster_type: "origem",
    timestamp: "2024-01-01T00:00:00.000Z",
    execId: "exec-789",
    errors: [{ message: "network timeout" }],
  };

  describe("validateCronjobCallback", () => {
    test("returns 400 when body is not a JSON object", async () => {
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .set("Content-Type", "application/json")
        .send('"not-an-object"');
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.details).toContain("Request body must be a JSON object.");
    });

    test("returns 400 when compliance_status is missing", async () => {
      const app = await makeApp();
      const { compliance_status: _cs, ...body } = validSuccessPayload;
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(body);
      expect(res.status).toBe(400);
      expect(
        res.body.details.some((d: string) => d.includes("compliance_status")),
      ).toBe(true);
    });

    test("returns 400 when compliance_status is invalid", async () => {
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send({ ...validSuccessPayload, compliance_status: "unknown" });
      expect(res.status).toBe(400);
      expect(
        res.body.details.some((d: string) => d.includes("compliance_status")),
      ).toBe(true);
    });

    test("returns 400 when namespace is missing", async () => {
      const app = await makeApp();
      const { namespace: _ns, ...body } = validSuccessPayload;
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(body);
      expect(res.status).toBe(400);
      expect(
        res.body.details.some((d: string) => d.includes("namespace")),
      ).toBe(true);
    });

    test("returns 400 when captured_data is absent for success", async () => {
      const app = await makeApp();
      const { captured_data: _cd, ...body } = validSuccessPayload;
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(body);
      expect(res.status).toBe(400);
      expect(
        res.body.details.some((d: string) => d.includes("captured_data")),
      ).toBe(true);
    });

    test("returns 400 when failures is absent for failed", async () => {
      const app = await makeApp();
      const { failures: _f, ...body } = validFailedPayload;
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(body);
      expect(res.status).toBe(400);
      expect(
        res.body.details.some((d: string) => d.includes("failures")),
      ).toBe(true);
    });

    test("returns 400 when errors is absent for error", async () => {
      const app = await makeApp();
      const { errors: _e, ...body } = validErrorPayload;
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(body);
      expect(res.status).toBe(400);
      expect(
        res.body.details.some((d: string) => d.includes("errors")),
      ).toBe(true);
    });
  });

  describe("forwardToController", () => {
    test("returns 200 when Controller responds OK", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validSuccessPayload);
      expect(res.status).toBe(200);
      expect(res.body.forwarded).toBe(true);
    });

    test("returns 502 when Controller responds with HTTP error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Bad Gateway", { status: 502 }),
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validSuccessPayload);
      expect(res.status).toBe(502);
      expect(res.body.ok).toBe(false);
    });

    test("returns 502 on fetch network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validSuccessPayload);
      expect(res.status).toBe(502);
      expect(res.body.ok).toBe(false);
    });

    test("returns 502 on fetch timeout (AbortError)", async () => {
      mockFetch.mockRejectedValueOnce(
        Object.assign(new Error("The operation was aborted"), {
          name: "AbortError",
        }),
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validSuccessPayload);
      expect(res.status).toBe(502);
      expect(res.body.ok).toBe(false);
      expect(res.body.detail).toMatch(/timeout/i);
    });
  });

  describe("POST /api/cronjob/callback route handler", () => {
    test("returns 200 with correct shape when forward OK (success)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validSuccessPayload);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        ok: true,
        execId: validSuccessPayload.execId,
        namespace: validSuccessPayload.namespace,
        compliance_status: "success",
        forwarded: true,
      });
    });

    test("returns 200 with correct shape when forward OK (failed)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 201 }),
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validFailedPayload);
      expect(res.status).toBe(200);
      expect(res.body.compliance_status).toBe("failed");
    });

    test("returns 200 with correct shape when forward OK (error)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validErrorPayload);
      expect(res.status).toBe(200);
      expect(res.body.compliance_status).toBe("error");
    });

    test("returns 400 for invalid payload", async () => {
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send({ invalid: true });
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe("Invalid cronjob callback payload");
    });

    test("returns 502 when Controller fails", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Controller error", { status: 503 }),
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validSuccessPayload);
      expect(res.status).toBe(502);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain("Failed to forward");
    });

    test("returns 500 when JWT generation throws", async () => {
      (JWTService.generateCallbackToken as jest.Mock).mockImplementationOnce(
        () => {
          throw new Error("JWT signing error");
        },
      );
      const app = await makeApp();
      const res = await request(app)
        .post("/api/cronjob/callback")
        .send(validSuccessPayload);
      expect(res.status).toBe(500);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toContain("Internal error");
    });
  });
});
