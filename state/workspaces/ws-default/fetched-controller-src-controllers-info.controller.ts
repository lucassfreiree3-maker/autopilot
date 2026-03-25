import type { Request, Response } from "express";
import os from "os";
import { timestampSP } from "../util/time";
import { notifyTraceChanged } from "../util/s3logger";

type Locals = { requestId?: string };

export async function getInfo(_req: Request, res: Response): Promise<void> {
  const id = `info-${Date.now().toString(36)}`;
  try {
    const requestId = String((res.locals as unknown as Locals).requestId || "");

    console.log("[info] id=%s requestId=%s", id, requestId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("[info] log-error: %s", msg);
  }

  notifyTraceChanged();

  res.status(200).json({
    ok: true,
    success: true,
    id,
    service: "psc-sre-automacao-controller",
    hostname: os.hostname(),
    now: timestampSP(),
    timezone: "America/Sao_Paulo",
    note: "All endpoints return an id field.",
  });
}
