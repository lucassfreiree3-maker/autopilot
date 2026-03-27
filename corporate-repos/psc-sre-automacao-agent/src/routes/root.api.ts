import { Router, Request, Response, NextFunction } from "express";
import path from "path";

class RootAPI {
  private static async getReady(
    _req: Request,
    resp: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (process.env.NODE_ENV === "localhost") {
        resp.sendFile(path.resolve("./static/index.html"));
      } else {
        resp.json({ status: "Your app is running..." });
      }
    } catch (error) {
      return next(error);
    }
  }

  constructor(router: Router) {
    router.get("/", RootAPI.getReady);
  }
}

export default RootAPI;
