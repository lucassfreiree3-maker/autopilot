import { Controller, Post, Route, Body, SuccessResponse, Tags } from "tsoa";
import { IAgentRegisterData } from "../interface/IAgent.interface";
import { JWTService } from "../util/jwt";
import {
  resolveAgentRegisterScope,
  resolveControllerRegisterUrl,
} from "../util/controller-callback";
import { readAutoRegisterTimeoutMs } from "../util/auto-register";
import {
  RegisterErrorBody,
  RegisterProxyError,
} from "../errors/register-proxy.error";

async function parseControllerResponseBody(
  response: Response,
): Promise<RegisterErrorBody> {
  const contentType = String(response.headers.get("content-type") || "");

  if (contentType.includes("application/json")) {
    const parsed = await response.json().catch(() => null);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  }

  const text = await response.text().catch(() => "");
  return text || `Controller returned HTTP ${response.status}`;
}

@Tags("Register")
@Route("register")
export class RegisterController extends Controller {
  @SuccessResponse("200", "Registro enviado com sucesso")
  @Post()
  public async registerAgent(
    @Body() data: IAgentRegisterData,
  ): Promise<{ message: string }> {
    const payload = {
      namespace: data.namespace,
      cluster: data.cluster,
      environment: data.environment,
      DataRegistro:
        data.DataRegistro instanceof Date
          ? data.DataRegistro.toISOString()
          : new Date().toISOString(),
    };

    const token = JWTService.generateCallbackToken({
      agentId: process.env.AGENT_ID || undefined,
      scope: [resolveAgentRegisterScope(process.env)],
    });

    const controllerUrl = resolveControllerRegisterUrl(process.env);
    const timeoutMs = readAutoRegisterTimeoutMs(process.env);
    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(controllerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new RegisterProxyError(504, {
          error: "Timed out while waiting for Controller response",
          detail: `No response from Controller after ${timeoutMs}ms`,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 409) {
      this.setStatus(200);
      return { message: "Agente ja registrado no controlador" };
    }

    if (!response.ok) {
      const responseBody = await parseControllerResponseBody(response);
      throw new RegisterProxyError(response.status, responseBody);
    }

    this.setStatus(200);
    return { message: "Registro enviado para o controlador com sucesso" };
  }
}

export { RegisterProxyError } from "../errors/register-proxy.error";
export default RegisterController;
