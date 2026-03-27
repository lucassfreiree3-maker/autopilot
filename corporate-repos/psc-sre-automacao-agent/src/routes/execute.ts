import { Router, Request, Response, NextFunction } from "express";
import ExecuteController from "../controller/execute.controller";
import { IExecutionRequest } from "../interface/IExecutionRequest";
import { JWTMiddleware } from "../middleware/jwt.middleware";

export default class ExecuteRoutes {
  private static asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private static async executeAutomation(
    req: Request,
    resp: Response,
    next: NextFunction,
  ) {
    try {
      // Sanitiza o body antes de passar ao controller
      const sanitizedBody = ExecuteRoutes.sanitizeRequestBody(req.body);

      const controller = new ExecuteController();
      const result = await controller.executeAutomation(sanitizedBody);
      return resp.status(200).send(result);
    } catch (error) {
      return next(error);
    }
  }

  // Método para sanitizar o body da requisição
  private static sanitizeRequestBody(body: unknown): IExecutionRequest {
    // Valida se o body existe
    if (!body || typeof body !== "object") {
      throw new Error("Body inválido");
    }

    const bodyObj = body as Record<string, unknown>;
    const rawEnvs =
      ExecuteRoutes.asRecord(bodyObj.envs) ||
      ExecuteRoutes.asRecord(bodyObj.ENVS) ||
      ExecuteRoutes.asRecord(bodyObj.variables) ||
      ExecuteRoutes.asRecord(bodyObj.vars);

    // Sanitiza cada campo
    const sanitizedBody: IExecutionRequest = {
      execId: ExecuteRoutes.sanitizeString((bodyObj.execId as string) || ""),
      namespace: ExecuteRoutes.sanitizeString(
        (bodyObj.namespace as string) || "",
      ),
      cluster: ExecuteRoutes.sanitizeString((bodyObj.cluster as string) || ""),
      function: ExecuteRoutes.sanitizeString(
        (bodyObj.function as string) || "",
      ),
      image: ExecuteRoutes.sanitizeString((bodyObj.image as string) || ""),
      envs: rawEnvs ? JSON.parse(JSON.stringify(rawEnvs)) : undefined,
    };

    return sanitizedBody;
  }

  // Método para sanitizar strings
  private static sanitizeString(input: string): string {
    if (!input || typeof input !== "string") return "";

    // Remove caracteres perigosos que podem causar XSS
    return (
      input
        .replace(/[<>'&]/g, "") // Remove < > ' &
        .replace(/"/g, "") // Remove aspas duplas
        .replace(/javascript:/gi, "") // Remove javascript:
        .replace(/on\w+=/gi, "") // Remove event handlers (onclick=, onerror=, etc)
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1F\x7F]/g, "") // Remove caracteres de controle
        .trim()
        .substring(0, 500)
    ); // Limita tamanho para prevenir ataques de buffer
  }

  constructor(router: Router) {
    router.post(
      "/agent/execute",
      JWTMiddleware.validateControllerJWT,
      ExecuteRoutes.executeAutomation,
    );
  }
}
