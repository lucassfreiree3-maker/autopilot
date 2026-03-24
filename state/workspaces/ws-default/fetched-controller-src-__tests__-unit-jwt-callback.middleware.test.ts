import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

type ReqWithCallback = Request & { agentCallbackJwt?: jwt.JwtPayload | string };

describe("JWT callback middleware (Agent → Controller)", () => {
  const originalEnv = process.env;
  let jwtSecret = "";

  const makeReq = (
    auth?: string,
    body?: unknown,
    extraHeaders: Record<string, string | undefined> = {},
  ): ReqWithCallback => {
    const headers: Record<string, string> = {};

    if (auth) headers.authorization = auth;

    Object.entries(extraHeaders).forEach(([k, v]) => {
      if (v !== undefined) headers[k.toLowerCase()] = v;
    });

    const readHeader = (name: string): string | undefined => {
      const key = name.toLowerCase();
      return headers[key];
    };

    return {
      headers,
      body,
      header: (name: string) => readHeader(name),
      get: (name: string) => readHeader(name),
    } as unknown as ReqWithCallback;
  };

  const makeRes = () => {
    const res = {} as Partial<Response>;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  const makeNext = () => jest.fn() as unknown as NextFunction;

  beforeEach(() => {
    jest.resetModules();
    jwtSecret = crypto.randomBytes(24).toString("hex");
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = jwtSecret;
    delete process.env.JWT_PUBLIC_KEY;
    process.env.JWT_CALLBACK_ISSUER = "psc-sre-automacao-agent";
    process.env.JWT_CALLBACK_AUDIENCE = "psc-sre-automacao-controller";
    process.env.JWT_ALGORITHMS = "HS256";
    process.env.JWT_CALLBACK_MAX_TTL_SECONDS = "300";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("rejects when missing Bearer token", async () => {
    const { requireAgentCallbackJwt } = await import(
      "../../middleware/jwt-callback"
    );

    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    requireAgentCallbackJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects when token is invalid", async () => {
    const { requireAgentCallbackJwt } = await import(
      "../../middleware/jwt-callback"
    );

    const req = makeReq("Bearer invalid.token.value");
    const res = makeRes();
    const next = makeNext();

    requireAgentCallbackJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects when issuer/audience do not match callback expectations", async () => {
    const { requireAgentCallbackJwt } = await import(
      "../../middleware/jwt-callback"
    );

    const bad = jwt.sign(
      { typ: "agent-callback", execId: "exec-1" },
      jwtSecret,
      {
        algorithm: "HS256",
        expiresIn: "5m",
        issuer: "psc-sre-automacao-controller",
        audience: "psc-sre-automacao-agent",
      },
    );

    const req = makeReq(`Bearer ${bad}`);
    const res = makeRes();
    const next = makeNext();

    requireAgentCallbackJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  test("accepts when token is valid and stores decoded claims on req", async () => {
    const { requireAgentCallbackJwt } = await import(
      "../../middleware/jwt-callback"
    );

    const good = jwt.sign(
      { typ: "agent-callback", execId: "exec-1" },
      jwtSecret,
      {
        algorithm: "HS256",
        expiresIn: "5m",
        issuer: "psc-sre-automacao-agent",
        audience: "psc-sre-automacao-controller",
      },
    );

    const req = makeReq(`Bearer ${good}`);
    const res = makeRes();
    const next = makeNext();

    requireAgentCallbackJwt(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.agentCallbackJwt).toBeDefined();
  });
});
