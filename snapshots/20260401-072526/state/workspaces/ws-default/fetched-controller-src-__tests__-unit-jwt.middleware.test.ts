import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

type ReqWithJwt = Request & { jwt?: jwt.JwtPayload | string };

describe("JWT middleware", () => {
  const originalEnv = process.env;
  let jwtSecret = "";

  beforeEach(() => {
    jest.resetModules();
    jwtSecret = crypto.randomBytes(24).toString("hex");
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = jwtSecret;
    delete process.env.JWT_PUBLIC_KEY;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.JWT_ALGORITHMS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function makeReq(auth?: string): Request {
    return {
      headers: auth ? { authorization: auth } : {},
    } as unknown as Request;
  }

  function makeRes() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res as Response & { status: jest.Mock; json: jest.Mock };
  }

  test("rejects when Authorization header is missing", async () => {
    const { requireJwt } = await import("../../middleware/jwt");

    const req = makeReq();
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Missing Bearer token" });
    expect(next).not.toHaveBeenCalled();
  });

  test("rejects when token is invalid", async () => {
    const { requireJwt } = await import("../../middleware/jwt");

    const req = makeReq("Bearer invalid.token.here");
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    requireJwt(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });

  test("accepts when token is valid and attaches decoded payload", async () => {
    const { requireJwt } = await import("../../middleware/jwt");

    const token = jwt.sign(
      { sub: "user-123", scope: "agent:execute" },
      jwtSecret,
      {
        algorithm: "HS256",
        expiresIn: "10m",
      },
    );

    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn() as unknown as NextFunction;

    requireJwt(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect((req as ReqWithJwt).jwt).toBeTruthy();
    const decoded = (req as ReqWithJwt).jwt as jwt.JwtPayload;
    expect(decoded.sub).toBe("user-123");
  });

  test("getIncomingAuthorization returns header value when present", async () => {
    const { getIncomingAuthorization } = await import("../../middleware/jwt");

    const req = makeReq("Bearer abc");
    expect(getIncomingAuthorization(req)).toBe("Bearer abc");
  });

  test("getIncomingAuthorization returns undefined when missing", async () => {
    const { getIncomingAuthorization } = await import("../../middleware/jwt");

    const req = makeReq();
    expect(getIncomingAuthorization(req)).toBeUndefined();
  });
});
