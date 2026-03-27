import { Router, Request, Response, NextFunction } from "express";
import AgentController from "../controller/info-agent.controller";

export default class AgentRoutes {
  private static async getAgents(
    _req: Request,
    resp: Response,
    next: NextFunction,
  ) {
    try {
      const controller = new AgentController();
      const agent = await controller.getInfo();

      return resp.send(agent);
    } catch (error) {
      return next(error);
    }
  }

  constructor(router: Router) {
    router.get("/agent/info", AgentRoutes.getAgents);
  }
}
