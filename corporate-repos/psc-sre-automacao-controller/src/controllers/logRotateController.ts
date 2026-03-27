import { Request, Response } from "express";
import { rotateAndCompress, cleanupOldArchives } from "../util/logrotate";

function detectEnvironmentFromHost(req: Request): "dev" | "hm" | "prod" {
  const xfHost = (req.get("x-forwarded-host") || "").split(",")[0]?.trim();
  const hostHeader = (req.get("host") || "").split(",")[0]?.trim();
  const host = (xfHost || hostHeader || "").toLowerCase();

  if (!host) return "prod";

  if (
    host.includes("desenvolvimento") ||
    host.includes("desenv") ||
    host.includes("dev")
  ) {
    return "dev";
  }

  if (
    host.includes("homolog") ||
    host.includes("hml") ||
    host.includes(".hm.") ||
    host.includes("html")
  ) {
    return "hm";
  }

  return "prod";
}

export async function handleRotate(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const env = detectEnvironmentFromHost(req);

    const result = await rotateAndCompress(env);
    const cleanup = await cleanupOldArchives();
    const hasUploadFailure = result.upload.failed > 0;

    return res.status(hasUploadFailure ? 502 : 200).json({
      ok: !hasUploadFailure,
      env,
      ...result,
      cleanup,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
}
