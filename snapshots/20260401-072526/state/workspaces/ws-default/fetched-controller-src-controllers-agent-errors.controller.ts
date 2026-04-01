import { Request, Response } from "express";
import { findLogs } from "../util/find-logs";

export async function getAgentErrors(req: Request, res: Response) {
  const { execId, startDate, endDate } = req.query;

  try {
    const logs = await findLogs({
      execId: execId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    res.json(logs);
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Erro desconhecido ao buscar logs." });
    }
  }
}
