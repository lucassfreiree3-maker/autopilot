import { HttpAutomation } from "../config/automations.config";

export interface HttpAutomationResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

const DEFAULT_AUTOMATION_HTTP_TIMEOUT_MS = 30_000;

function readAutomationHttpTimeoutMs(): number {
  const raw = Number(process.env.AUTOMATION_HTTP_TIMEOUT_MS || "");
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_AUTOMATION_HTTP_TIMEOUT_MS;
  }

  return Math.floor(raw);
}

export class AutomationHttpService {
  async executeAutomation(
    _execId: string,
    namespace: string,
    functionName: string,
    _cluster: string,
    automation: HttpAutomation,
  ): Promise<HttpAutomationResult> {
    const payload = {
      namespace,
      function: functionName,
    };

    console.log(
      `[AutomationHTTP] Executando ${functionName} em ${automation.url}`,
    );

    try {
      const timeoutMs = readAutomationHttpTimeoutMs();
      const abort = new AbortController();
      const timeoutId = setTimeout(() => abort.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(automation.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: abort.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.text();
      console.log(`[AutomationHTTP] ${functionName} executado com sucesso`);

      // Tenta parsear como JSON
      try {
        const jsonResult = JSON.parse(result);
        return {
          success: true,
          data: jsonResult,
        };
      } catch {
        // Se não for JSON válido, retorna como texto
        return {
          success: true,
          data: { output: result },
        };
      }
    } catch (error: unknown) {
      const timeoutMs = readAutomationHttpTimeoutMs();
      const detail =
        error instanceof Error && error.name === "AbortError"
          ? `Request timed out after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      console.error(
        `[AutomationHTTP] Erro ao executar ${functionName}:`,
        detail,
      );
      return {
        success: false,
        error: detail,
      };
    }
  }
}
