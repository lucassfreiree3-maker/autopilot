import {
  CONTROLLER_CALLBACK_DEFAULTS,
  resolveAgentRegisterScope,
  resolveAgentSendLogsScope,
  resolveControllerExecuteLogsUrl,
  resolveControllerRegisterUrl,
} from "../../util/controller-callback";

describe("controller callback util", () => {
  test("uses explicit controller URLs when provided", () => {
    const env = {
      CONTROLLER_REGISTER_URL:
        "https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/register",
      CONTROLLER_EXECUTE_LOGS_URL:
        "https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/execute/logs",
    } as NodeJS.ProcessEnv;

    expect(resolveControllerRegisterUrl(env)).toBe(
      "https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/register",
    );
    expect(resolveControllerExecuteLogsUrl(env)).toBe(
      "https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/execute/logs",
    );
  });

  test("derives execute logs URL from register URL when dedicated env is missing", () => {
    const env = {
      CONTROLLER_REGISTER_URL:
        "https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/register",
    } as NodeJS.ProcessEnv;

    expect(resolveControllerExecuteLogsUrl(env)).toBe(
      "https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/execute/logs",
    );
  });

  test("keeps default scopes unless env override is provided", () => {
    expect(resolveAgentRegisterScope({} as NodeJS.ProcessEnv)).toBe(
      CONTROLLER_CALLBACK_DEFAULTS.registerScope,
    );
    expect(resolveAgentSendLogsScope({} as NodeJS.ProcessEnv)).toBe(
      CONTROLLER_CALLBACK_DEFAULTS.sendLogsScope,
    );
  });

  test("supports configurable callback scopes", () => {
    const env = {
      CONTROLLER_SCOPE_REGISTER_AGENT: "scope:register:cap",
      CONTROLLER_SCOPE_SEND_LOGS: "scope:logs:cap",
    } as NodeJS.ProcessEnv;

    expect(resolveAgentRegisterScope(env)).toBe("scope:register:cap");
    expect(resolveAgentSendLogsScope(env)).toBe("scope:logs:cap");
  });
});
