import {
  RegisterController,
  RegisterProxyError,
} from "../../controller/register.controller";
import { IAgentRegisterData } from "../../interface/IAgent.interface";
import { JWTService } from "../../util/jwt";

global.fetch = jest.fn();

jest.mock("../../util/jwt", () => ({
  JWTService: {
    generateCallbackToken: jest.fn(() => "mock-register-token"),
  },
}));

describe("RegisterController", () => {
  let controller: RegisterController;

  beforeEach(() => {
    controller = new RegisterController();
    jest.clearAllMocks();
    process.env.AGENT_ID = "agent-01";

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: jest.fn(() => "application/json"),
      },
      json: jest.fn(async () => ({ ok: true })),
      text: jest.fn(async () => ""),
    });
  });

  test("Deve enviar registro com Authorization header", async () => {
    const data: IAgentRegisterData = {
      namespace: "psc-agent",
      cluster: "k8shmlbb111b",
      environment: "hml",
      DataRegistro: new Date(),
    };

    await controller.registerAgent(data);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/agent/register"),
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer mock-register-token",
        },
      }),
    );
  });

  test("Deve gerar token com scope REGISTER_AGENT", async () => {
    const data: IAgentRegisterData = {
      namespace: "psc-agent",
      cluster: "k8shmlbb111b",
      environment: "hml",
      DataRegistro: new Date(),
    };

    await controller.registerAgent(data);

    expect(JWTService.generateCallbackToken).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-01",
        scope: ["REGISTER_AGENT"],
      }),
    );
  });

  test("Deve retornar mensagem de sucesso", async () => {
    const data: IAgentRegisterData = {
      namespace: "psc-agent",
      cluster: "k8shmlbb111b",
      environment: "hml",
      DataRegistro: new Date(),
    };

    const result = await controller.registerAgent(data);

    expect(result.message).toContain("sucesso");
  });

  test("Deve retornar sucesso quando agente ja estiver registrado (409)", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      headers: {
        get: jest.fn(() => "application/json"),
      },
      json: jest.fn(async () => ({
        code: "E_ALREADY_REGISTERED",
      })),
      text: jest.fn(async () => ""),
    });

    const data: IAgentRegisterData = {
      namespace: "psc-agent",
      cluster: "k8shmlbb111b",
      environment: "hml",
      DataRegistro: new Date(),
    };

    const result = await controller.registerAgent(data);
    expect(result.message).toContain("ja registrado");
  });

  test("Deve falhar quando controller retornar erro nao tratado", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: jest.fn(() => "application/json"),
      },
      json: jest.fn(async () => ({ error: "Internal Server Error" })),
      text: jest.fn(async () => ""),
    });

    const data: IAgentRegisterData = {
      namespace: "psc-agent",
      cluster: "k8shmlbb111b",
      environment: "hml",
      DataRegistro: new Date(),
    };

    await expect(controller.registerAgent(data)).rejects.toBeInstanceOf(
      RegisterProxyError,
    );
  });

  test("Deve retornar erro 504 quando registro no controller expira", async () => {
    const originalTimeout = process.env.AUTO_REGISTER_TIMEOUT_MS;
    process.env.AUTO_REGISTER_TIMEOUT_MS = "1234";
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    (global.fetch as jest.Mock).mockRejectedValue(abortError);

    const data: IAgentRegisterData = {
      namespace: "psc-agent",
      cluster: "k8shmlbb111b",
      environment: "hml",
      DataRegistro: new Date(),
    };

    try {
      await expect(controller.registerAgent(data)).rejects.toMatchObject({
        statusCode: 504,
        responseBody: {
          error: "Timed out while waiting for Controller response",
          detail: "No response from Controller after 1234ms",
        },
      });
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.AUTO_REGISTER_TIMEOUT_MS;
      } else {
        process.env.AUTO_REGISTER_TIMEOUT_MS = originalTimeout;
      }
    }
  });
});
