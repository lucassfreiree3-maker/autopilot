import {
  resolveControllerExecuteLogsUrl,
  resolveControllerRegisterUrl,
} from "./controller-callback";

export const URLs = {
  CONTROLLER_LOGS: resolveControllerExecuteLogsUrl(process.env),
  CONTROLLER_REGISTER: resolveControllerRegisterUrl(process.env),
  EXECUTE_AUTOMATION:
    process.env.AUTOMATION_EXECUTE ||
    "http://sre-k8s-namespace-analyze.psc.hm.bb.com.br/execute",
};
