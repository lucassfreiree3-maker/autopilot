import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export class JWTMiddleware {
  private static normalizeScopes(scopeClaim: unknown): string[] {
    if (!scopeClaim) return [];
    if (Array.isArray(scopeClaim)) {
      return scopeClaim.map((s) => String(s).trim()).filter(Boolean);
    }
    const raw = String(scopeClaim).trim();
    if (!raw) return [];
    return raw
      .split(/[ ,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Middleware para validar JWT recebido do Controller
   * Valida signature, expiração, issuer e audience
   */
  static validateControllerJWT(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    try {
      // Extrair token do header Authorization
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
          message: "Namespace sem autorização a fazer chamadas para o agent",
        });
        return;
      }

      const token = authHeader.split(" ")[1];

      // Validar token JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
        issuer: process.env.JWT_ISSUER || "psc-sre-automacao-controller",
        audience: process.env.JWT_AUDIENCE || "psc-sre-automacao-agent",
      });

      // Token válido! Adicionar dados ao request
      (req as Request & { jwt: jwt.JwtPayload | string }).jwt = decoded;

      // Agora o Agent também precisa garantir que o token carregue o escopo
      // EXECUTE_AUTOMATION para permitir a execução.
      if (
        typeof decoded === "object" &&
        decoded !== null &&
        !Array.isArray(decoded)
      ) {
        const payload = decoded as jwt.JwtPayload;
        const scopes = JWTMiddleware.normalizeScopes(
          (payload as Record<string, unknown>).scope,
        );
        if (!scopes.includes("EXECUTE_AUTOMATION")) {
          res.status(403).json({
            message: "Token sem escopo necessário para executar automação",
            required: ["EXECUTE_AUTOMATION"],
          });
          return;
        }
      }

      // Permitir requisição
      next();
    } catch (error: unknown) {
      // Token inválido - tratar erros específicos
      const err = error as Error & { name: string };

      if (err.name === "TokenExpiredError") {
        res.status(401).json({
          message: "Token expirado. Gere um novo token.",
        });
        return;
      }

      if (err.name === "JsonWebTokenError") {
        res.status(401).json({
          message: "Token inválido. Verifique a assinatura.",
        });
        return;
      }

      if (err.name === "NotBeforeError") {
        res.status(401).json({
          message: "Token ainda não é válido.",
        });
        return;
      }

      console.error("Erro na validação JWT:", error);
      res.status(401).json({
        message: `Erro na validação do token: ${err.message}`,
      });
    }
  }
}
