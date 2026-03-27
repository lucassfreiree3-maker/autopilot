import { Router, Request, Response } from "express";
import {
  ExecStatus,
  IExecutionLog,
} from "../interface/IExecutionLog.interface";
import { executionLogStore } from "../services/execution-log-store.service";

export default class AgentExecuteLogsAPI {
  constructor(router: Router, ..._args: unknown[]) {
    router.post("/agent/execute/logs", (req: Request, res: Response) => {
      const body = req.body as IExecutionLog;

      if (
        !body?.execId ||
        !Array.isArray(body.entries) ||
        body.entries.length === 0
      ) {
        return res.status(400).json({ error: "Payload invalido" });
      }

      const normalized = body.entries.filter((entry) => entry && entry.ts);

      if (normalized.length === 0) {
        return res.status(400).json({ error: "Entries invalidas" });
      }

      executionLogStore.append({
        execId: body.execId,
        ok: body.ok,
        status: body.status,
        entries: normalized,
      });

      return res.status(204).end();
    });

    router.get("/agent/execute/:execId", (req: Request, res: Response) => {
      const { execId } = req.params;
      const found = executionLogStore.get(execId);

      if (!found) {
        return res.status(404).json({ error: "execId nao encontrado" });
      }

      const { entries } = found;
      const count = entries.length;

      let topStatus: ExecStatus | undefined;
      for (let i = count - 1; i >= 0; i--) {
        const status = entries[i]?.status as ExecStatus | undefined;
        if (
          status &&
          ["RUNNING", "PENDING", "DONE", "ERROR"].includes(status)
        ) {
          topStatus = status;
          break;
        }
      }
      if (!topStatus) {
        topStatus = "RUNNING";
      }

      return res.json({
        ok: found.ok,
        execId,
        status: topStatus,
        count,
        entries: entries.map((entry) => {
          const { ts, level, message, status, ...rest } = entry;
          const extras = rest as Record<string, unknown>;
          const rawCandidate = extras.raw;

          const raw =
            typeof rawCandidate === "string"
              ? rawCandidate
              : `[${ts}] ${String(level ?? "").toUpperCase()} ${message ?? ""}`.trim();

          const validStatuses: ExecStatus[] = [
            "RUNNING",
            "PENDING",
            "DONE",
            "ERROR",
          ];
          const statusField =
            status && validStatuses.includes(status as ExecStatus)
              ? { status }
              : {};

          return {
            ts,
            raw,
            ...statusField,
            ...(level ? { level } : {}),
            ...(message ? { message } : {}),
          };
        }),
      });
    });
  }
}
