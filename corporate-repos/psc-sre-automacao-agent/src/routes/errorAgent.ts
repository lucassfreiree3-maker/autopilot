import { Router, Request, Response, NextFunction } from "express";
import ErrorAgentController from "../controller/error-agent.controller";

export default class ErrorAgentRoutes {
  private static async getErrorExecutions(
    _req: Request,
    resp: Response,
    next: NextFunction,
  ) {
    try {
      const controller = new ErrorAgentController();
      const errors = await controller.getErrorExecutions();
      return resp.send(errors);
    } catch (error) {
      return next(error);
    }
  }

  constructor(router: Router) {
    router.get("/agent/errors", ErrorAgentRoutes.getErrorExecutions);
  }
}
