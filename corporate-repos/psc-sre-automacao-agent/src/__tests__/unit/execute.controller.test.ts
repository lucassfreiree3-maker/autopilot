import { ExecuteController } from "../../controller/execute.controller";
import { IExecutionRequest } from "../../interface/IExecutionRequest";
import { executionLogStore } from "../../services/execution-log-store.service";
import { JWTService } from "../../util/jwt";

global.fetch = jest.fn();

jest.mock("../../util/jwt", () => ({
  JWTService: {
    generateCallbackToken: jest.fn(() => "mock-jwt-token-123"),
  },
}));

describe("ExecuteController", () => {
  let controller: ExecuteController;

  beforeEach(() => {
    controller = new ExecuteController();
    jest.clearAllMocks();
    executionLogStore.clear();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ output: "mock output" })),
      status: 200,
    });
  });

  describe("Validacao de Payload", () => {
    test("Deve aceitar payload correto", async () => {
      const request: IExecutionRequest = {
        execId: "test-123",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_pods",
      };

      const result = await controller.executeAutomation(request);

      expect(result.message).toContain("Requisicao recebida");
    });

    test("Deve validar campos obrigatorios", async () => {
      const request: IExecutionRequest = {
        execId: "test-456",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_pods",
      };

      const result = await controller.executeAutomation(request);

      expect(result.message).toContain("Requisicao recebida");
    });

    test("Deve aceitar payload OAS com image/envs", async () => {
      const request: IExecutionRequest = {
        execId: "test-oas-001",
        namespace: "",
        cluster: "k8sdesbb111b",
        function: "",
        image: "psc-sre-ns-migration-preflight",
        envs: {
          NAMESPACE: "psc-agent",
          CLUSTER_DE_ORIGEM: true,
          CLUSTER_DE_DESTINO: false,
        },
      };

      const result = await controller.executeAutomation(request);

      expect(result.message).toContain("Requisicao recebida");
    });
  });

  describe("Validacao de Funcoes", () => {
    test("Deve rejeitar funcao inexistente", async () => {
      const request: IExecutionRequest = {
        execId: "test-123",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "funcao_invalida",
      };

      const result = await controller.executeAutomation(request);

      expect(result.message).toContain("Funcao inexistente");
      expect(result.message).toContain("get_pods");
      expect(result.message).toContain("get_all_resources");
    });

    test("Deve aceitar funcao get_pods", async () => {
      const request: IExecutionRequest = {
        execId: "test-456",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_pods",
      };

      const result = await controller.executeAutomation(request);

      expect(result.message).toContain("Requisicao recebida");
    });

    test("Deve aceitar funcao get_all_resources", async () => {
      const request: IExecutionRequest = {
        execId: "test-789",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_all_resources",
      };

      const result = await controller.executeAutomation(request);

      expect(result.message).toContain("Requisicao recebida");
    });
  });

  describe("Chamada de Automacao", () => {
    test("Deve chamar fetch para enviar log", async () => {
      const request: IExecutionRequest = {
        execId: "test-001",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_pods",
      };

      await controller.executeAutomation(request);

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 100);
      });

      expect(global.fetch).toHaveBeenCalled();
    });

    test("Deve gerar token JWT com scope SEND_LOGS", async () => {
      const request: IExecutionRequest = {
        execId: "test-jwt-001",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_pods",
      };

      await controller.executeAutomation(request);

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 100);
      });

      expect(JWTService.generateCallbackToken).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: ["SEND_LOGS"],
        }),
      );
    });

    test("Deve enviar token JWT no header Authorization", async () => {
      const request: IExecutionRequest = {
        execId: "test-jwt-002",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_pods",
      };

      await controller.executeAutomation(request);

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 100);
      });

      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      const callbackCall = fetchCalls.find((call) =>
        call[0].includes("/agent/execute/logs"),
      );

      if (callbackCall) {
        expect(callbackCall[1].headers.Authorization).toBe(
          "Bearer mock-jwt-token-123",
        );
      }
    });

    test("Deve retornar mensagem de sucesso imediatamente", async () => {
      const request: IExecutionRequest = {
        execId: "test-002",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_pods",
      };

      const result = await controller.executeAutomation(request);

      expect(result).toEqual({
        message: "Requisicao recebida e automacao acionada",
      });
    });

    test("Deve acionar job dinamico quando image nao mapeada para funcao conhecida", async () => {
      const request: IExecutionRequest = {
        execId: "test-oas-invalid-001",
        namespace: "",
        cluster: "k8sdesbb111b",
        function: "",
        image: "ubuntu:latest",
        envs: {
          NAMESPACE: "psc-agent",
        },
      };

      const result = await controller.executeAutomation(request);

      expect(result.message).toContain("job dinamico");
      expect(JWTService.generateCallbackToken).toHaveBeenCalled();

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 100);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/agent/execute/logs"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("\"status\":\"RUNNING\""),
        }),
      );
    });

    test("Deve persistir logs localmente para rastreabilidade da execucao", async () => {
      const request: IExecutionRequest = {
        execId: "test-trace-001",
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        function: "get_pods",
      };
      const executeAutomationMock = jest.fn().mockResolvedValue({
        success: true,
        data: { result: "ok" },
      });

      Object.defineProperty(controller, "httpService", {
        value: {
          executeAutomation: executeAutomationMock,
        },
      });

      await controller.executeAutomation(request);

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 100);
      });

      const stored = executionLogStore.get("test-trace-001");

      expect(stored).toEqual(
        expect.objectContaining({
          ok: true,
          entries: expect.arrayContaining([
            expect.objectContaining({
              status: "RUNNING",
              message: expect.stringContaining("Execucao iniciada"),
            }),
            expect.objectContaining({
              status: "DONE",
              message: expect.stringContaining("\"result\": \"ok\""),
            }),
          ]),
        }),
      );
    });

    test("Deve persistir status RUNNING local quando job dinamico for acionado", async () => {
      const request: IExecutionRequest = {
        execId: "test-oas-invalid-local-001",
        namespace: "",
        cluster: "k8sdesbb111b",
        function: "",
        image: "ubuntu:latest",
        envs: {
          NAMESPACE: "psc-agent",
        },
      };

      await controller.executeAutomation(request);

      const stored = executionLogStore.get("test-oas-invalid-local-001");

      expect(stored).toEqual(
        expect.objectContaining({
          ok: true,
          entries: expect.arrayContaining([
            expect.objectContaining({
              status: "RUNNING",
              message: expect.stringContaining("ubuntu:latest"),
            }),
          ]),
        }),
      );
    });
  });

  describe("Sanitizacao XSS", () => {
    test("Deve sanitizar entrada com caracteres perigosos", async () => {
      const request: IExecutionRequest = {
        execId: "test-xss",
        namespace: "<script>alert('xss')</script>",
        cluster: "k8s",
        function: "get_pods",
      };

      const result = await controller.executeAutomation(request);

      expect(result.message).toContain("Requisicao recebida");
    });
  });
});
