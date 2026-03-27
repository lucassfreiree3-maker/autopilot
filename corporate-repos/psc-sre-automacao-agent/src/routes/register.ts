import { Router, Request, Response, NextFunction } from "express";
import { RegisterController } from "../controller/register.controller";
import { IAgentRegisterData } from "../interface/IAgent.interface";

type RegisterProxyErrorLike = {
  statusCode: number;
  responseBody: unknown;
};

function isRegisterProxyErrorLike(
  error: unknown,
): error is RegisterProxyErrorLike {
  if (!error || typeof error !== "object") return false;
  if (!("statusCode" in error) || !("responseBody" in error)) return false;

  const rec = error as Record<string, unknown>;
  return typeof rec.statusCode === "number";
}

function toResponseBody(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }

  return {
    error: typeof v === "string" && v.trim() ? v.trim() : "Register failed",
  };
}

function readOptionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export default class RegisterRoutes {
  private static async registerAgent(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const body =
        req.body && typeof req.body === "object"
          ? (req.body as Record<string, unknown>)
          : {};

      const namespace = readOptionalString(body, "namespace");
      const cluster = readOptionalString(body, "cluster");
      const environment = readOptionalString(body, "environment");

      if (!namespace || !cluster || !environment) {
        return res.status(400).send({
          error: "Invalid payload",
          detail: "namespace, cluster and environment are required",
        });
      }

      const data: IAgentRegisterData = {
        namespace,
        cluster,
        environment,
        DataRegistro: new Date(),
      };

      const controller = new RegisterController();
      const result = await controller.registerAgent(data);

      return res.status(200).send(result);
    } catch (error) {
      if (isRegisterProxyErrorLike(error)) {
        return res
          .status(error.statusCode)
          .send(toResponseBody(error.responseBody));
      }

      return next(error);
    }
  }

  constructor(router: Router) {
    router.post("/register", RegisterRoutes.registerAgent);
  }
}
