import { Router } from "express";
import MetricsAPI from "./metrics.api";
import RootAPI from "./root.api";
import CriaPost from "./create-cronjob";
import AgentRoutes from "./infoAgent";
import ErrorAgentRoutes from "./errorAgent";
import ExecuteRoutes from "./execute";
import RegisterRoutes from "./register";

// ADICIONADO: rota que recebe os logs do Agent e expõe consulta por execId
import AgentExecuteLogsAPI from "./agent-execute-logs.api";

export class ApisRouter {
  constructor(router: Router, ...args: unknown[]) {
    new MetricsAPI(router, ...(args as []));
    new RootAPI(router, ...(args as []));
    new CriaPost(router, ...(args as []));
    new AgentRoutes(router, ...(args as []));
    new ErrorAgentRoutes(router, ...(args as []));
    new ExecuteRoutes(router, ...(args as []));
    new RegisterRoutes(router, ...(args as []));

    // monta a nova rota SEM remover as existentes
    new AgentExecuteLogsAPI(router, ...(args as []));
  }
}

export default ApisRouter;
