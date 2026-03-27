import { AgentController } from "../../controller/info-agent.controller";

describe("AgentController (info-agent)", () => {
  let controller: AgentController;

  beforeEach(() => {
    controller = new AgentController();
  });

  describe("Propriedade agent123", () => {
    test("Deve ter todas as propriedades obrigatórias", () => {
      expect(controller.agent123).toHaveProperty("id");
      expect(controller.agent123).toHaveProperty("version");
      expect(controller.agent123).toHaveProperty("createdAt");
      expect(controller.agent123).toHaveProperty("description");
      expect(controller.agent123).toHaveProperty("availableRoutes");
      expect(controller.agent123).toHaveProperty("status");
    });

    test("Deve ter ID no formato UUID", () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(controller.agent123.id).toMatch(uuidRegex);
    });

    test("Deve ter versão definida", () => {
      expect(controller.agent123.version).toBe("1.1.1");
      expect(typeof controller.agent123.version).toBe("string");
    });

    test("Deve ter data de criação válida", () => {
      expect(controller.agent123.createdAt).toBeInstanceOf(Date);
      expect(controller.agent123.createdAt.getTime()).toBeLessThanOrEqual(
        Date.now(),
      );
    });

    test("Deve ter descrição não vazia", () => {
      expect(controller.agent123.description).toBeTruthy();
      expect(controller.agent123.description.length).toBeGreaterThan(0);
      expect(controller.agent123.description).toContain("SRE Automation Agent");
    });

    test("Deve ter array de rotas disponíveis", () => {
      expect(Array.isArray(controller.agent123.availableRoutes)).toBe(true);
      expect(controller.agent123.availableRoutes.length).toBeGreaterThan(0);
    });

    test("Deve conter rotas essenciais", () => {
      const routes = controller.agent123.availableRoutes.join(" ");

      expect(routes).toContain("/agent/execute");
      expect(routes).toContain("/agent/info");
      expect(routes).toContain("/agent/errors");
      expect(routes).toContain("/register");
    });

    test("Deve ter status online por padrão", () => {
      expect(controller.agent123.status).toBe("online");
    });
  });

  describe("getInfo", () => {
    test("Deve retornar objeto com summary e Agente", async () => {
      const result = await controller.getInfo();

      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("Agente");
    });

    test("Summary deve conter informações do agente", async () => {
      const result = await controller.getInfo();

      expect(result.summary).toContain("Agente");
      expect(result.summary).toContain(controller.agent123.version);
      expect(result.summary).toContain("Status:");
    });

    test("Summary deve conter ID truncado (8 caracteres)", async () => {
      const result = await controller.getInfo();
      const truncatedId = controller.agent123.id.substring(0, 8);

      expect(result.summary).toContain(truncatedId);
    });

    test("Summary deve conter data formatada em pt-BR", async () => {
      const result = await controller.getInfo();
      const expectedDate =
        controller.agent123.createdAt.toLocaleDateString("pt-BR");

      expect(result.summary).toContain(expectedDate);
    });

    test("Summary deve listar funcionalidades disponíveis", async () => {
      const result = await controller.getInfo();

      expect(result.summary).toContain("/execute");
      expect(result.summary).toContain("/error-agent");
      expect(result.summary).toContain("/register");
      expect(result.summary).toContain("/info-agent");
    });

    test("Summary deve conter status em maiúsculas", async () => {
      const result = await controller.getInfo();

      expect(result.summary).toContain("Status: ONLINE");
    });

    test("Agente deve ser igual a agent123", async () => {
      const result = await controller.getInfo();

      expect(result.Agente).toEqual(controller.agent123);
      expect(result.Agente.id).toBe(controller.agent123.id);
      expect(result.Agente.version).toBe(controller.agent123.version);
      expect(result.Agente.status).toBe(controller.agent123.status);
    });

    test("Deve retornar dados consistentes em múltiplas chamadas", async () => {
      const result1 = await controller.getInfo();
      const result2 = await controller.getInfo();

      expect(result1.Agente.id).toBe(result2.Agente.id);
      expect(result1.Agente.version).toBe(result2.Agente.version);
      expect(result1.summary).toBe(result2.summary);
    });
  });

  describe("Estrutura do response", () => {
    test("Agente deve ter estrutura IAgent correta", async () => {
      const result = await controller.getInfo();

      expect(result.Agente).toMatchObject({
        id: expect.any(String),
        version: expect.any(String),
        createdAt: expect.any(Date),
        description: expect.any(String),
        availableRoutes: expect.any(Array),
        status: expect.any(String),
      });
    });

    test("Summary deve ser uma string não vazia", async () => {
      const result = await controller.getInfo();

      expect(typeof result.summary).toBe("string");
      expect(result.summary.length).toBeGreaterThan(0);
    });

    test("AvailableRoutes devem ser strings", async () => {
      const result = await controller.getInfo();

      result.Agente.availableRoutes.forEach((route) => {
        expect(typeof route).toBe("string");
        expect(route.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Diferentes instâncias", () => {
    test("Cada instância deve ter ID único", () => {
      const controller1 = new AgentController();
      const controller2 = new AgentController();

      expect(controller1.agent123.id).not.toBe(controller2.agent123.id);
    });

    test("Cada instância deve ter data de criação diferente (ou igual se simultâneo)", () => {
      const controller1 = new AgentController();

      // Pequeno delay
      const start = Date.now();
      while (Date.now() - start < 10) {
        // wait
      }

      const controller2 = new AgentController();

      // Datas podem ser iguais se criadas no mesmo milissegundo, mas IDs devem ser diferentes
      expect(controller1.agent123.id).not.toBe(controller2.agent123.id);
    });

    test("Todas as instâncias devem ter mesma versão", () => {
      const controller1 = new AgentController();
      const controller2 = new AgentController();

      expect(controller1.agent123.version).toBe(controller2.agent123.version);
      expect(controller1.agent123.version).toBe("1.1.1");
    });

    test("Todas as instâncias devem ter mesmo status inicial", () => {
      const controller1 = new AgentController();
      const controller2 = new AgentController();

      expect(controller1.agent123.status).toBe("online");
      expect(controller2.agent123.status).toBe("online");
    });
  });
});
