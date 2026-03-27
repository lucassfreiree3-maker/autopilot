import { ErrorAgentController } from "../../controller/error-agent.controller";
import { IErrorAgentExecution } from "../../interface/IErrorAgentExecution.interface";

describe("ErrorAgentController", () => {
  let controller: ErrorAgentController;

  beforeEach(() => {
    controller = new ErrorAgentController();

    // Limpa o array estático antes de cada teste
    // Usa reflexão para acessar a propriedade privada estática
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ErrorAgentController as any).executions = [];
  });

  describe("getErrorExecutions", () => {
    test("Deve retornar array vazio quando não há erros", async () => {
      const result = await controller.getErrorExecutions();

      expect(result).toEqual({ errors: [] });
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test("Deve retornar apenas execuções com success=false", async () => {
      // Adiciona uma execução com sucesso
      ErrorAgentController.addExecution({
        id: "success-1",
        functionName: "get_pods",
        cluster: "k8s-01",
        namespace: "default",
        timestamp: new Date(),
        success: true,
      });

      // Adiciona execuções com falha
      ErrorAgentController.addExecution({
        id: "error-1",
        functionName: "get_pods",
        cluster: "k8s-01",
        namespace: "producao",
        timestamp: new Date(),
        success: false,
      });

      ErrorAgentController.addExecution({
        id: "error-2",
        functionName: "get_all_resources",
        cluster: "k8s-02",
        namespace: "homolog",
        timestamp: new Date(),
        success: false,
      });

      const result = await controller.getErrorExecutions();

      expect(result.errors.length).toBe(2);
      expect(result.errors[0].id).toBe("error-1");
      expect(result.errors[1].id).toBe("error-2");
      expect(result.errors.every((e) => !e.success)).toBe(true);
    });

    test("Deve retornar estrutura correta", async () => {
      ErrorAgentController.addExecution({
        id: "test-123",
        functionName: "get_pods",
        cluster: "k8s-test",
        namespace: "test-ns",
        timestamp: new Date(),
        success: false,
      });

      const result = await controller.getErrorExecutions();

      expect(result).toHaveProperty("errors");
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors[0]).toHaveProperty("id");
      expect(result.errors[0]).toHaveProperty("functionName");
      expect(result.errors[0]).toHaveProperty("cluster");
      expect(result.errors[0]).toHaveProperty("namespace");
      expect(result.errors[0]).toHaveProperty("timestamp");
      expect(result.errors[0]).toHaveProperty("success");
    });
  });

  describe("addExecution (método estático)", () => {
    test("Deve adicionar execução ao array", async () => {
      const execution: IErrorAgentExecution = {
        id: "test-001",
        functionName: "get_pods",
        cluster: "k8s-dev",
        namespace: "dev-namespace",
        timestamp: new Date(),
        success: false,
      };

      ErrorAgentController.addExecution(execution);

      const result = await controller.getErrorExecutions();

      expect(result.errors.length).toBe(1);
      expect(result.errors[0].id).toBe("test-001");
    });

    test("Deve adicionar múltiplas execuções", async () => {
      const execution1: IErrorAgentExecution = {
        id: "test-001",
        functionName: "get_pods",
        cluster: "k8s-dev",
        namespace: "ns1",
        timestamp: new Date(),
        success: false,
      };

      const execution2: IErrorAgentExecution = {
        id: "test-002",
        functionName: "get_all_resources",
        cluster: "k8s-prod",
        namespace: "ns2",
        timestamp: new Date(),
        success: false,
      };

      ErrorAgentController.addExecution(execution1);
      ErrorAgentController.addExecution(execution2);

      const result = await controller.getErrorExecutions();

      expect(result.errors.length).toBe(2);
    });

    test("Deve manter ordem de inserção", async () => {
      const timestamps = [
        new Date("2024-01-01"),
        new Date("2024-01-02"),
        new Date("2024-01-03"),
      ];

      timestamps.forEach((ts, index) => {
        ErrorAgentController.addExecution({
          id: `test-${index}`,
          functionName: "get_pods",
          cluster: "k8s",
          namespace: "ns",
          timestamp: ts,
          success: false,
        });
      });

      const result = await controller.getErrorExecutions();

      expect(result.errors[0].id).toBe("test-0");
      expect(result.errors[1].id).toBe("test-1");
      expect(result.errors[2].id).toBe("test-2");
    });

    test("Deve aceitar execução com campos opcionais undefined", async () => {
      const execution: IErrorAgentExecution = {
        id: "test-minimal",
        timestamp: new Date(),
        success: false,
      };

      ErrorAgentController.addExecution(execution);

      const result = await controller.getErrorExecutions();

      expect(result.errors.length).toBe(1);
      expect(result.errors[0].functionName).toBeUndefined();
      expect(result.errors[0].cluster).toBeUndefined();
      expect(result.errors[0].namespace).toBeUndefined();
    });
  });

  describe("Cenários de uso", () => {
    test("Deve registrar erro de execução do execute.controller", async () => {
      const errorExecution: IErrorAgentExecution = {
        id: "exec-failed-123",
        functionName: "get_pods",
        cluster: "k8sdesbb111b",
        namespace: "psc-agent",
        timestamp: new Date(),
        success: false,
      };

      ErrorAgentController.addExecution(errorExecution);

      const result = await controller.getErrorExecutions();

      expect(result.errors.length).toBe(1);
      expect(result.errors[0].functionName).toBe("get_pods");
      expect(result.errors[0].namespace).toBe("psc-agent");
    });

    test("Deve filtrar apenas erros quando há execuções mistas", async () => {
      // 5 sucessos
      for (let i = 0; i < 5; i++) {
        ErrorAgentController.addExecution({
          id: `success-${i}`,
          functionName: "get_pods",
          cluster: "k8s",
          namespace: "ns",
          timestamp: new Date(),
          success: true,
        });
      }

      // 3 erros
      for (let i = 0; i < 3; i++) {
        ErrorAgentController.addExecution({
          id: `error-${i}`,
          functionName: "get_pods",
          cluster: "k8s",
          namespace: "ns",
          timestamp: new Date(),
          success: false,
        });
      }

      const result = await controller.getErrorExecutions();

      expect(result.errors.length).toBe(3);
      expect(result.errors.every((e) => !e.success)).toBe(true);
    });
  });
});
