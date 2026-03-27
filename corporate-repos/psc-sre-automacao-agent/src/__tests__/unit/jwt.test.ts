import jwt from "jsonwebtoken";
import { JWTService } from "../../util/jwt";

jest.mock("jsonwebtoken");

describe("JWTService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_CALLBACK_ISSUER = "psc-sre-automacao-agent";
    process.env.JWT_CALLBACK_AUDIENCE = "psc-sre-automacao-controller";
  });

  test("Deve gerar token com scope obrigatório", () => {
    (jwt.sign as jest.Mock).mockReturnValue("mock-token");

    const token = JWTService.generateCallbackToken({
      execId: "test-123",
      scope: ["SEND_LOGSS"],
    });

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: "agent-callback",
        scope: ["SEND_LOGSS"],
        execId: "test-123",
      }),
      "test-secret",
      expect.objectContaining({
        issuer: "psc-sre-automacao-agent",
        audience: "psc-sre-automacao-controller",
      }),
    );

    expect(token).toBe("mock-token");
  });

  test("Deve gerar token sem execId (para register)", () => {
    (jwt.sign as jest.Mock).mockReturnValue("mock-token");

    JWTService.generateCallbackToken({
      scope: ["REGISTER_AGENT"],
    });

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: "agent-callback",
        scope: ["REGISTER_AGENT"],
      }),
      expect.any(String),
      expect.any(Object),
    );

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.not.objectContaining({
        execId: expect.anything(),
      }),
      expect.any(String),
      expect.any(Object),
    );
  });

  test("Deve lançar erro se JWT_SECRET não estiver definido", () => {
    delete process.env.JWT_SECRET;

    expect(() => {
      JWTService.generateCallbackToken({
        scope: ["SEND_LOGSS"],
      });
    }).toThrow("JWT_SECRET not set");
  });
});
