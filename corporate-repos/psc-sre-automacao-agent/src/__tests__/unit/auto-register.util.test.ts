import {
  AUTO_REGISTER_SCOPE,
  buildAutoRegisterFingerprint,
  buildAutoRegisterHttpHint,
  buildAutoRegisterSettings,
  describeAutoRegisterError,
  formatAutoRegisterSettings,
  readAutoRegisterResponseDetail,
} from "../../util/auto-register";

describe("auto-register util", () => {
  test("builds settings from environment with defaults", () => {
    const settings = buildAutoRegisterSettings(
      {
        AUTO_REGISTER_TIMEOUT_MS: "4321",
        CONTROLLER_REGISTER_URL:
          "https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/register",
        CLUSTER_NAME: "k8shmlbb111b",
        NAMESPACE: "psc-sre-aut-agent",
        ENVIRONMENT: "hml",
        AGENT_ID: "agent-dev-001",
        JWT_CALLBACK_ISSUER: "psc-sre-automacao-agent",
        JWT_CALLBACK_AUDIENCE: "psc-sre-automacao-controller",
      },
      { initialDelayMs: 1000, intervalMs: 2000 },
    );

    expect(settings).toMatchObject({
      controllerUrl:
        "https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/register",
      cluster: "k8shmlbb111b",
      namespace: "psc-sre-aut-agent",
      environment: "hml",
      agentId: "agent-dev-001",
      callbackIssuer: "psc-sre-automacao-agent",
      callbackAudience: "psc-sre-automacao-controller",
      scope: AUTO_REGISTER_SCOPE,
      initialDelayMs: 1000,
      intervalMs: 2000,
      timeoutMs: 4321,
    });

    expect(formatAutoRegisterSettings(settings)).toContain(
      "controllerUrl=https://sre-aut-controller.psc.k8shmlbb111b.bb.com.br/agent/register",
    );
    expect(formatAutoRegisterSettings(settings)).toContain("timeoutMs=4321");
  });

  test("maps http status to actionable hints", () => {
    expect(buildAutoRegisterHttpHint(403)).toBe("scope-or-agentid-mismatch");
    expect(buildAutoRegisterHttpHint(503)).toBe(
      "controller-ingress-or-upstream-unavailable",
    );
  });

  test("describes nested network errors with stable hints", () => {
    const described = describeAutoRegisterError({
      message: "fetch failed",
      cause: {
        code: "ENOTFOUND",
        message: "getaddrinfo ENOTFOUND sre-aut-controller",
      },
    });

    expect(described.code).toBe("ENOTFOUND");
    expect(described.hint).toBe("controller-dns-or-host-unreachable");
    expect(described.message).toContain("fetch failed");
  });

  test("reads json response detail and builds a stable fingerprint", async () => {
    const response = {
      headers: {
        get: jest.fn(() => "application/json"),
      },
      json: jest.fn(async () => ({
        error: "Insufficient scope",
        detail: "Token does not include register scope",
      })),
      text: jest.fn(async () => ""),
    } as unknown as Response;

    const detail = await readAutoRegisterResponseDetail(response);
    const fingerprint = buildAutoRegisterFingerprint({
      kind: "http-error",
      status: 403,
      detail,
    });

    expect(detail).toContain("Insufficient scope");
    expect(fingerprint).toContain("http-error|403|");
  });
});
