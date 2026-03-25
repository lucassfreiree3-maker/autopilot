import type { Request, Response } from "express";
import { AgentsRepo } from "../repository/agentsRepo";

const ALLOWED_ENVS = new Set(["desenv", "hml", "prod"]);
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function normalizeEnv(v: string): string {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function normalizeSafeIdentifier(v: unknown): string {
  if (typeof v !== "string") return "";
  const trimmed = v.trim();
  if (!trimmed || !SAFE_IDENTIFIER_PATTERN.test(trimmed)) return "";
  return trimmed;
}

export async function registerAgent(
  req: Request,
  res: Response,
): Promise<void> {
  const namespace = normalizeSafeIdentifier(req.body?.namespace);
  const cluster = normalizeSafeIdentifier(req.body?.cluster);
  const environment = normalizeEnv(String(req.body?.environment ?? ""));

  if (!namespace || !cluster || !ALLOWED_ENVS.has(environment)) {
    res.status(400).json({
      title: "Bad Request",
      status: 400,
      detail:
        "Invalid payload. Required fields: namespace (string), cluster (string), environment in {desenv,hml,prod}.",
      instance: req.originalUrl,
    });
    return;
  }

  const exists = AgentsRepo.getAgent(cluster, namespace, environment);
  if (exists) {
    res.status(409).json({
      success: false,
      ok: false,
      code: "E_ALREADY_REGISTERED",
      message:
        "Agent already registered with given cluster/namespace/environment.",
    });
    return;
  }

  AgentsRepo.upsertAgent({
    Namespace: namespace,
    Cluster: cluster,
    environment,
  });

  res.status(201).json({
    success: true,
    ok: true,
    message: "Agent created.",
    data: { namespace, cluster, environment },
  });
}
