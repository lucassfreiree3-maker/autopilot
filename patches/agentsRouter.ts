import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { requireJwt } from "../middleware/jwt";
import {
  requireAgentCallbackJwt,
  requireAgentRegisterCallbackJwt,
} from "../middleware/jwt-callback";
import {
  requireAgentCallbackScopes,
  requireScopes,
} from "../middleware/scopes";
import { SCOPES } from "../auth/scopes";
import { executeAgent } from "../controllers/execute.controller";
import { listAgents } from "../controllers/list.controller";
import { registerAgent } from "../controllers/register.controller";
import { getInfo } from "../controllers/info.controller";
import {
  pushAgentExecutionLogs,
  getAgentExecutionStatus,
  waitForFinalExecution,
} from "../controllers/agents-execute-logs.controller";
import { getAgentErrors } from "../controllers/agent-errors.controller";
import {
  receiveCronjobResult,
  getCronjobStatus,
} from "../controllers/cronjob-result.controller";
import { readSyncTimeoutMs } from "../util/sync-timeout";

const router = Router();

type LocalsWithExec = {
  execId?: string;
  startedAt?: number;
};

function normalizeMode(req: Request): "sync" | "async" {
  const raw =
    typeof req.query.mode === "string"
      ? req.query.mode.trim().toLowerCase()
      : "";
  return raw === "sync" ? "sync" : "async";
}

function readLocals(res: Response): LocalsWithExec {
  const locals = res.locals as unknown;
  if (typeof locals !== "object" || locals === null) return {};
  const rec = locals as Record<string, unknown>;
  return {
    execId: typeof rec.execId === "string" ? rec.execId : undefined,
    startedAt: typeof rec.startedAt === "number" ? rec.startedAt : undefined,
  };
}

async function waitForAgentIfSync(
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const mode = normalizeMode(req);
  if (mode !== "sync") return;

  const locals = readLocals(res);
  const execId = typeof locals.execId === "string" ? locals.execId.trim() : "";
  if (!execId) {
    res
      .status(500)
      .json({ ok: false, error: "Missing execId in server context" });
    return;
  }

  const startedAt =
    typeof locals.startedAt === "number" ? locals.startedAt : Date.now();
  const timeoutMs = readSyncTimeoutMs(process.env);

  const { timedOut, snapshot } = await waitForFinalExecution(execId, timeoutMs);

  if (timedOut) {
    res.status(504).json({
      ok: false,
      mode: "sync",
      execId,
      error: "TIMEOUT",
      message:
        "Timed out while waiting for execution to reach a final state (DONE or ERROR).",
      timeoutMs,
      status: snapshot.status,
      statusLabel: snapshot.statusLabel,
      finished: snapshot.finished,
      lastUpdate: snapshot.lastUpdate,
      count: snapshot.count,
      entries: snapshot.entries,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    mode: "sync",
    execId,
    status: snapshot.status,
    statusLabel: snapshot.statusLabel,
    finished: snapshot.finished,
    lastUpdate: snapshot.lastUpdate,
    count: snapshot.count,
    entries: snapshot.entries,
    elapsedMs: Date.now() - startedAt,
  });
}

router.post(
  "/agent/register",
  requireAgentRegisterCallbackJwt,
  requireAgentCallbackScopes([SCOPES.REGISTER]),
  registerAgent,
);
router.get("/agent/list", listAgents);
router.get("/agent/info", getInfo);

router.post(
  "/agent/execute",
  requireJwt,
  requireScopes([SCOPES.EXECUTE]),
  executeAgent,
  waitForAgentIfSync,
);

router.post(
  "/agent/execute/logs",
  requireAgentCallbackJwt,
  requireAgentCallbackScopes([SCOPES.SEND]),
  pushAgentExecutionLogs,
);

router.get(
  "/agent/execute",
  requireJwt,
  requireScopes([SCOPES.READ]),
  getAgentExecutionStatus,
);

router.get("/agent/errors", getAgentErrors);

// ── Cronjob result endpoints (historia #930217) ──
router.post(
  "/api/cronjob/result",
  requireAgentCallbackJwt,
  requireAgentCallbackScopes([SCOPES.SEND]),
  receiveCronjobResult,
);

router.get(
  "/api/cronjob/status/:execId",
  requireJwt,
  requireScopes([SCOPES.READ]),
  getCronjobStatus,
);

export default router;
