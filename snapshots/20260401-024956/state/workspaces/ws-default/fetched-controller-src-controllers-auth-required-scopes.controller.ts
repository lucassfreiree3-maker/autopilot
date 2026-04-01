import type { Request, Response } from "express";
import { ROUTE_SCOPE_MATRIX } from "../auth/route-scope-matrix";
import { resolveRuntimeScopeSource } from "../auth/runtime-scope-source";
import { timestampSP } from "../util/time";

export async function getRequiredRouteScopes(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const resolution = await resolveRuntimeScopeSource();

    res.status(200).json({
      ok: true,
      generatedAt: timestampSP(),
      source: resolution.source,
      routes: ROUTE_SCOPE_MATRIX.map((route) => ({
        method: route.method,
        path: route.path,
        auth: route.auth,
        requiresToken:
          route.auth === "bearer-jwt" ||
          route.auth === "agent-callback-jwt" ||
          route.auth === "bearer-jwt-or-internal-origin",
        requiredScope: route.scopeKey ? resolution.scopes[route.scopeKey] : null,
        note: route.note,
      })),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    res.status(500).json({
      ok: false,
      error: "Unable to resolve required scopes for routes",
      detail,
    });
  }
}
