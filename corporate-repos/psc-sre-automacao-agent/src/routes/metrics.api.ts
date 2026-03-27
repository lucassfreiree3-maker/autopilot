import express, { Router } from "express";
import { metrics } from "../controller/metrics.controller";

export default class MetricsAPI {
  constructor(router: Router) {
    router.get(
      "/metrics",
      async (_req: express.Request, resp: express.Response) => {
        resp.set("Content-Type", metrics.prometheus.register.contentType);
        resp.send(metrics.prometheus.register.metrics());
      },
    );
  }
}
