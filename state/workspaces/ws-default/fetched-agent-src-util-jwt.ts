import jwt from "jsonwebtoken";

export class JWTService {
  static generateCallbackToken(params: {
    execId?: string;
    cluster?: string;
    namespace?: string;
    agentId?: string;
    scope: string[];
  }): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET not set");

    const issuer = process.env.JWT_CALLBACK_ISSUER || "psc-sre-automacao-agent";
    const audience =
      process.env.JWT_CALLBACK_AUDIENCE || "psc-sre-automacao-controller";
    const expiresIn = process.env.JWT_CALLBACK_EXPIRES_IN || "5m";

    const payload: Record<string, unknown> = {
      typ: "agent-callback",
      scope: params.scope,
    };

    if (params.execId) payload.execId = params.execId;
    if (params.cluster) payload.cluster = params.cluster;
    if (params.namespace) payload.namespace = params.namespace;
    if (params.agentId) payload.agentId = params.agentId;

    return jwt.sign(payload, secret, { issuer, audience, expiresIn });
  }
}
