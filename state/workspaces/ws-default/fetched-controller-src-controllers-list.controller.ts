import type { Request, Response } from "express";
import { AgentsRepo } from "../repository/agentsRepo";
import { normalizeTimestampToSP } from "../util/time";

export async function listAgents(req: Request, res: Response): Promise<void> {
  const limit = Number(req.query.limit ?? 100);
  const agents = AgentsRepo.list(limit);

  res.status(200).json({
    ok: true,
    count: agents.length,
    agents: agents.map((a) => ({
      namespace: a.Namespace,
      cluster: a.Cluster,
      environment: a.environment,
      registeredAt: normalizeTimestampToSP(a.created_at),
    })),
  });
}
