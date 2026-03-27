import { JWTService } from "../util/jwt";
import {
  resolveAgentSendLogsScope,
  resolveControllerExecuteLogsUrl,
} from "../util/controller-callback";
import {
  IExecutionLog,
  ExecStatus,
} from "../interface/IExecutionLog.interface";
import { executionLogStore } from "./execution-log-store.service";

const DEFAULT_CONTROLLER_CALLBACK_TIMEOUT_MS = 10_000;

function readControllerCallbackTimeoutMs(): number {
  const raw = Number(process.env.CONTROLLER_CALLBACK_TIMEOUT_MS || "");
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_CONTROLLER_CALLBACK_TIMEOUT_MS;
  }

  return Math.floor(raw);
}

export class ControllerClientService {
  private sanitizeUrl(url: string): string {
    return String(url || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 240);
  }

  private sanitizeOutput(output: string): string {
    if (!output) return "";

    return output
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  }

  private async readControllerErrorDetail(response: Response): Promise<string> {
    const contentType = String(response.headers.get("content-type") || "");
    if (contentType.includes("application/json")) {
      const parsed = await response.json().catch(() => null);
      if (parsed && typeof parsed === "object") {
        return this.sanitizeOutput(JSON.stringify(parsed)).slice(0, 700);
      }
    }

    const text = await response.text().catch(() => "");
    return this.sanitizeOutput(text || "-").slice(0, 700);
  }

  async sendExecutionLog(params: {
    execId: string;
    ok: boolean;
    status: ExecStatus;
    level: "info" | "warn" | "error";
    message: string;
    cluster?: string;
    namespace?: string;
  }): Promise<void> {
    try {
      const localLogData: IExecutionLog = {
        execId: params.execId,
        ok: params.ok,
        entries: [
          {
            status: params.status,
            ts: new Date().toISOString(),
            level: params.level,
            message: params.message,
          },
        ],
      };

      executionLogStore.append(localLogData);

      const sanitizedMessage = this.sanitizeOutput(params.message);
      const callbackLogData: IExecutionLog = {
        execId: params.execId,
        ok: params.ok,
        entries: [
          {
            status: params.status,
            ts: new Date().toISOString(),
            level: params.level,
            message: sanitizedMessage,
          },
        ],
      };

      const tokenB = JWTService.generateCallbackToken({
        execId: params.execId,
        cluster: params.cluster,
        namespace: params.namespace,
        agentId: process.env.AGENT_ID,
        scope: [resolveAgentSendLogsScope(process.env)],
      });

      const controllerUrl = resolveControllerExecuteLogsUrl(process.env);
      const timeoutMs = readControllerCallbackTimeoutMs();
      const abort = new AbortController();
      const timeoutId = setTimeout(() => abort.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(controllerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenB}`,
          },
          body: JSON.stringify(callbackLogData),
          signal: abort.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const detail = await this.readControllerErrorDetail(response);
        console.error(
          "[ControllerClient] Controller rejeitou log execId=%s status=%s url=%s detail=%s",
          params.execId,
          response.status,
          this.sanitizeUrl(controllerUrl),
          detail,
        );
      }
    } catch (error) {
      const timeoutMs = readControllerCallbackTimeoutMs();
      const prefix =
        error instanceof Error && error.name === "AbortError"
          ? `[ControllerClient] Timeout ao enviar log ao Controller após ${timeoutMs}ms:`
          : "[ControllerClient] Erro ao enviar log ao Controller:";
      console.error(
        prefix,
        error,
      );
    }
  }
}
