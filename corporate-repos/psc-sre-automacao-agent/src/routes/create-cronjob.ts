import { Router, Request, Response, NextFunction } from "express";
import CreateCronjobController from "../controller/create-cronjob.controller";

export default class CriaPost {
  private static async getMessage(
    _req: Request,
    resp: Response,
    next: NextFunction,
  ) {
    try {
      const users = await CreateCronjobController.getMessage();

      resp.json(users);

      return next();
    } catch (error) {
      return next(error);
    }
  }

  constructor(router: Router) {
    router.get("/create-cronjob", CriaPost.getMessage);
  }
}
