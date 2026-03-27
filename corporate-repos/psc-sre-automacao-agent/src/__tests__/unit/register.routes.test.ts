import { Router, Request, Response, NextFunction } from "express";
import RegisterRoutes from "../../routes/register";
import { RegisterController } from "../../controller/register.controller";

jest.mock("../../controller/register.controller");

describe("RegisterRoutes", () => {
  let router: Router;
  let routeHandler: (req: Request, res: Response, next: NextFunction) => void;

  beforeEach(() => {
    jest.clearAllMocks();

    router = {
      post: jest.fn((path, handler) => {
        if (path === "/register") routeHandler = handler;
      }),
    } as unknown as Router;

    new RegisterRoutes(router);
  });

  test("Deve registrar rota POST /register", () => {
    expect(router.post).toHaveBeenCalledWith("/register", expect.any(Function));
  });

  test("Deve chamar controller e retornar mensagem de sucesso", async () => {
    (RegisterController.prototype.registerAgent as jest.Mock).mockResolvedValue(
      {
        message: "Registro enviado para o controlador com sucesso",
      },
    );

    const req = {
      body: {
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        environment: "development",
      },
    } as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await routeHandler(req, res, next);

    expect(RegisterController.prototype.registerAgent).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({
      message: "Registro enviado para o controlador com sucesso",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("Deve forcar DataRegistro como data atual", async () => {
    (RegisterController.prototype.registerAgent as jest.Mock).mockResolvedValue(
      {
        message: "ok",
      },
    );

    const beforeCall = new Date();

    const req = {
      body: {
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        environment: "development",
        DataRegistro: new Date("2020-01-01"),
      },
    } as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await routeHandler(req, res, next);

    const afterCall = new Date();

    const calledWith = (RegisterController.prototype.registerAgent as jest.Mock)
      .mock.calls[0][0];

    expect(calledWith.DataRegistro).toBeInstanceOf(Date);
    expect(calledWith.DataRegistro.getTime()).toBeGreaterThanOrEqual(
      beforeCall.getTime(),
    );
    expect(calledWith.DataRegistro.getTime()).toBeLessThanOrEqual(
      afterCall.getTime(),
    );
  });

  test("Deve propagar status/body quando o controller retorna erro proxy", async () => {
    (RegisterController.prototype.registerAgent as jest.Mock).mockRejectedValue(
      {
        statusCode: 409,
        responseBody: {
          error: "E_ALREADY_REGISTERED",
          message: "Agent already registered",
        },
      },
    );

    const req = {
      body: {
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        environment: "development",
      },
    } as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await routeHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith({
      error: "E_ALREADY_REGISTERED",
      message: "Agent already registered",
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("Deve chamar next com erro quando controller lanca excecao generica", async () => {
    const error = new Error("Erro ao registrar");

    (RegisterController.prototype.registerAgent as jest.Mock).mockRejectedValue(
      error,
    );

    const req = {
      body: {
        namespace: "psc-agent",
        cluster: "k8sdesbb111b",
        environment: "development",
      },
    } as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response;

    const next = jest.fn() as NextFunction;

    await routeHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.send).not.toHaveBeenCalled();
  });
});
