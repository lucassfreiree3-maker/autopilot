import { Router, Request, Response, NextFunction } from "express";
import AgentRoutes from "../../routes/infoAgent";
import AgentController from "../../controller/info-agent.controller";

// Mock do controller
jest.mock("../../controller/info-agent.controller");

describe("AgentRoutes (infoAgent)", () => {
  let router: Router;
  let routeHandler: (req: Request, res: Response, next: NextFunction) => void;

  beforeEach(() => {
    jest.clearAllMocks();

    router = {
      get: jest.fn((path, handler) => {
        if (path === "/agent/info") {
          routeHandler = handler;
        }
      }),
    } as unknown as Router;

    new AgentRoutes(router);
  });

  test("Deve registrar rota GET /agent/info", () => {
    expect(router.get).toHaveBeenCalledWith(
      "/agent/info",
      expect.any(Function),
    );
  });

  test("Deve chamar controller e retornar informações do agent", async () => {
    const mockAgentInfo = {
      summary: "Agente test, funcionando na versão 1.1.1",
      Agente: {
        id: "test-id-123",
        version: "1.1.1",
        createdAt: new Date(),
        description: "Test Agent",
        availableRoutes: ["POST /agent/execute"],
        status: "online",
      },
    };

    (AgentController.prototype.getInfo as jest.Mock).mockResolvedValue(
      mockAgentInfo,
    );

    const req = {} as Request;

    const res = {
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await routeHandler(req, res, next);

    expect(AgentController.prototype.getInfo).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(mockAgentInfo);
    expect(next).not.toHaveBeenCalled();
  });

  test("Deve chamar next com erro quando controller lança exceção", async () => {
    const error = new Error("Erro ao buscar informações");

    (AgentController.prototype.getInfo as jest.Mock).mockRejectedValue(error);

    const req = {} as Request;

    const res = {
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.send).not.toHaveBeenCalled();
  });

  test("Deve criar nova instância do controller a cada chamada", async () => {
    (AgentController.prototype.getInfo as jest.Mock).mockResolvedValue({
      summary: "test",
      Agente: {},
    });

    const req = {} as Request;

    const res = {
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await routeHandler(req, res, next);
    await routeHandler(req, res, next);

    expect(AgentController).toHaveBeenCalledTimes(2);
  });

  test("Deve funcionar sem query params ou body", async () => {
    const mockAgentInfo = {
      summary: "Test",
      Agente: { id: "123", version: "1.0.0", status: "online" },
    };

    (AgentController.prototype.getInfo as jest.Mock).mockResolvedValue(
      mockAgentInfo,
    );

    const req = {
      query: {},
      body: {},
    } as Request;

    const res = {
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await routeHandler(req, res, next);

    expect(res.send).toHaveBeenCalledWith(mockAgentInfo);
  });
});
