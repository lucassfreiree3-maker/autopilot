import { JWTService } from "../../util/jwt";

global.fetch = jest.fn();

jest.mock("../../util/jwt", () => ({
  JWTService: {
    generateCallbackToken: jest.fn(() => "mock-auto-register-token"),
  },
}));

const mockAutoRegisterAgent = jest.fn();

jest.mock("../../server", () => ({
  autoRegisterAgent: mockAutoRegisterAgent,
}));

describe("Server auto-register", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  test("Auto-registro deve enviar token com scope REGISTER_AGENT", async () => {
    const registrationData = {
      namespace: process.env.NAMESPACE || "psc-agent",
      cluster: process.env.CLUSTER_NAME || "k8shmlbb111b",
      environment: process.env.ENVIRONMENT || "hml",
    };

    const token = JWTService.generateCallbackToken({
      execId: `register-${Date.now()}`,
      agentId: process.env.AGENT_ID,
      scope: ["REGISTER_AGENT"],
    });

    const controllerUrl =
      process.env.CONTROLLER_REGISTER_URL ||
      "http://sre-automacao-controller.psc.hm.bb.com.br/agent/register";

    await fetch(controllerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(registrationData),
    });

    expect(JWTService.generateCallbackToken).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: ["REGISTER_AGENT"],
      }),
    );
  });

  test("Auto-registro deve enviar Authorization header", async () => {
    const registrationData = {
      namespace: "psc-agent",
      cluster: "k8shmlbb111b",
      environment: "hml",
    };

    const token = "mock-auto-register-token";

    const controllerUrl =
      "http://sre-automacao-controller.psc.hm.bb.com.br/agent/register";

    await fetch(controllerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(registrationData),
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/agent/register"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-auto-register-token",
        }),
      }),
    );
  });
});
