import { Post, Route, Tags, Body, SuccessResponse } from "tsoa";
import { IExecutionRequest } from "../interface/IExecutionRequest";
import { IJobResult } from "../interface/IJobResult";
import ErrorAgentController from "./error-agent.controller";
import {
  getAutomation,
  isValidAutomation,
  listAvailableAutomations,
  HttpAutomation,
  JobAutomation,
  CompositeJobAutomation,
} from "../config/automations.config";
import { AutomationJobService } from "../services/automation-job.service";
import { AutomationHttpService } from "../services/automation-http.service";
import { ControllerClientService } from "../services/controller-client.service";

type JsonRecord = Record<string, unknown>;

type ResolvedExecutionRequest = IExecutionRequest & {
  additionalEnvVars?: Record<string, string>;
};

@Tags("Agent")
@Route("/agent")
export class ExecuteController {
  private jobService: AutomationJobService;

  private httpService: AutomationHttpService;

  private controllerClient: ControllerClientService;

  constructor() {
    this.jobService = new AutomationJobService();
    this.httpService = new AutomationHttpService();
    this.controllerClient = new ControllerClientService();
  }

  private asRecord(value: unknown): JsonRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as JsonRecord;
  }

  private normalizeImageKey(value: string): string {
    const withoutDigest = value.split("@")[0].trim();
    const lastPath = withoutDigest.split("/").pop() || withoutDigest;
    const withoutTag = lastPath.split(":")[0];
    return withoutTag.trim().toLowerCase();
  }

  private sanitizeScalar(value: unknown): string {
    if (typeof value !== "string") return "";
    return this.sanitizeInput(value);
  }

  private readNamespaceFromEnvs(envs?: JsonRecord): string {
    if (!envs) return "";

    const candidates = [envs.NAMESPACE, envs.namespace];
    const scalarMatch = candidates.reduce<string>((acc, candidate) => {
      if (acc || typeof candidate !== "string") return acc;
      return this.sanitizeInput(candidate);
    }, "");
    if (scalarMatch) return scalarMatch;

    return candidates
      .flatMap((candidate) => (Array.isArray(candidate) ? candidate : []))
      .reduce<string>((acc, item) => {
        if (acc || typeof item !== "string") return acc;
        return this.sanitizeInput(item);
      }, "");
  }

  private isTruthyFlag(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y", "sim"].includes(normalized);
  }

  private resolveFunctionFromPayload(request: IExecutionRequest): string {
    const directFunction = this.sanitizeScalar(request.function);
    if (directFunction) return directFunction;

    const image = this.sanitizeScalar(request.image);
    if (!image) return "";

    const imageKey = this.normalizeImageKey(image);
    if (imageKey !== "psc-sre-ns-migration-preflight") return "";

    const envs = this.asRecord(request.envs);
    const destino =
      this.isTruthyFlag(envs?.CLUSTER_DE_DESTINO) ||
      this.isTruthyFlag(envs?.cluster_de_destino);
    const origem =
      this.isTruthyFlag(envs?.CLUSTER_DE_ORIGEM) ||
      this.isTruthyFlag(envs?.cluster_de_origem);

    if (destino && !origem) return "migration_destino";
    if (origem && !destino) return "migration_origem";

    const cluster = this.sanitizeScalar(request.cluster).toLowerCase();
    if (cluster.includes("destino")) return "migration_destino";
    if (cluster.includes("origem")) return "migration_origem";

    return "migration_origem";
  }

  private stringifyEnvValue(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (typeof value === "number" || typeof value === "bigint") {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }

  private resolveAdditionalEnvVars(
    envs?: JsonRecord,
  ): Record<string, string> | undefined {
    if (!envs) return undefined;

    const additional = Object.entries(envs).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (key === "NAMESPACE" || key === "namespace") return acc;

        const stringified = this.stringifyEnvValue(value);
        if (!stringified) return acc;

        acc[key] = stringified;
        return acc;
      },
      {},
    );

    return Object.keys(additional).length > 0 ? additional : undefined;
  }

  private resolveSreJobNamespace(): string {
    return (
      this.sanitizeInput(process.env.SRE_JOB_NAMESPACE || "") ||
      this.sanitizeInput(process.env.MIGRATION_NAMESPACE || "") ||
      "psc-sre-aut-agent"
    );
  }

  private resolveSreJobServiceAccount(): string {
    return (
      this.sanitizeInput(process.env.SRE_JOB_SERVICE_ACCOUNT || "") ||
      this.sanitizeInput(process.env.MIGRATION_SERVICE_ACCOUNT || "") ||
      "sre-aut-agent-sa"
    );
  }

  private resolveSreJobTimeout(): number {
    const raw = parseInt(process.env.SRE_JOB_TIMEOUT_SECONDS || "600", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 600;
  }

  private flattenEnvsToStrings(envs?: JsonRecord): Record<string, string> {
    if (!envs) return {};
    return Object.entries(envs).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        const str = this.stringifyEnvValue(value);
        if (str !== undefined) acc[key] = str;
        return acc;
      },
      {},
    );
  }

  private async executeSreDirectJobAsync(
    request: ResolvedExecutionRequest,
  ): Promise<void> {
    const { execId, cluster } = request;
    const image = request.image!;
    const jobNamespace = this.resolveSreJobNamespace();
    const serviceAccount = this.resolveSreJobServiceAccount();
    const timeout = this.resolveSreJobTimeout();
    const envVars = this.flattenEnvsToStrings(request.envs);

    console.log(
      `[ExecuteController] Job dinamico iniciado: execId=${execId} image=${image} ns=${jobNamespace}`,
    );

    await this.controllerClient.sendExecutionLog({
      execId,
      ok: true,
      status: "RUNNING",
      level: "info",
      message: `Iniciando job dinamico para imagem: ${image}`,
      cluster,
      namespace: jobNamespace,
    });

    try {
      const result = await this.jobService.executeDynamicJob(
        execId,
        image,
        jobNamespace,
        serviceAccount,
        timeout,
        envVars,
      );

      if (result.success) {
        await this.controllerClient.sendExecutionLog({
          execId,
          ok: true,
          status: "DONE",
          level: "info",
          message: result.logs || `Job dinamico concluido com sucesso`,
          cluster,
          namespace: jobNamespace,
        });
        console.log(
          `[ExecuteController] Job dinamico DONE: execId=${execId}`,
        );
      } else {
        const reason = result.reason || "Job dinamico falhou";
        await this.controllerClient.sendExecutionLog({
          execId,
          ok: false,
          status: "ERROR",
          level: "error",
          message: result.logs ? `${reason}\n${result.logs}` : reason,
          cluster,
          namespace: jobNamespace,
        });
        ErrorAgentController.addExecution({
          id: execId,
          functionName: "sre-job",
          cluster,
          namespace: jobNamespace,
          timestamp: new Date(),
          success: false,
        });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[ExecuteController] Erro no job dinamico:", error);
      await this.controllerClient.sendExecutionLog({
        execId,
        ok: false,
        status: "ERROR",
        level: "error",
        message: `Erro ao executar job dinamico: ${detail}`,
        cluster,
        namespace: jobNamespace,
      });
      ErrorAgentController.addExecution({
        id: execId,
        functionName: "sre-job",
        cluster,
        namespace: jobNamespace,
        timestamp: new Date(),
        success: false,
      });
    }
  }

  private async notifyResolutionError(
    request: IExecutionRequest,
    message: string,
  ): Promise<void> {
    const execId = this.sanitizeScalar(request.execId);
    if (!execId) return;

    await this.controllerClient.sendExecutionLog({
      execId,
      ok: false,
      status: "ERROR",
      level: "error",
      message,
      cluster: this.sanitizeScalar(request.cluster),
      namespace:
        this.sanitizeScalar(request.namespace) ||
        this.readNamespaceFromEnvs(this.asRecord(request.envs) || undefined),
    });
  }

  private resolveRequest(request: IExecutionRequest): ResolvedExecutionRequest {
    const envs = this.asRecord(request.envs) || undefined;
    const resolvedFunction = this.resolveFunctionFromPayload(request);
    const resolvedNamespace =
      this.sanitizeScalar(request.namespace) || this.readNamespaceFromEnvs(envs);

    return {
      execId: this.sanitizeScalar(request.execId),
      namespace: resolvedNamespace,
      cluster: this.sanitizeScalar(request.cluster),
      function: resolvedFunction,
      image: this.sanitizeScalar(request.image),
      envs,
      additionalEnvVars: this.resolveAdditionalEnvVars(envs),
    };
  }

  @Post("/execute")
  @SuccessResponse("200", "Requisicao recebida com sucesso")
  public async executeAutomation(
    @Body() request: IExecutionRequest,
  ): Promise<{ message: string }> {
    const requestKeys = Object.keys(request);
    const allowedKeys = [
      "namespace",
      "cluster",
      "function",
      "execId",
      "image",
      "envs",
    ];
    const extraKeys = requestKeys.filter((k) => !allowedKeys.includes(k));

    if (extraKeys.length > 0) {
      return {
        message: `Dados nao esperados recebidos: ${extraKeys.join(", ")}. Esperado: execId, cluster e um contrato valido com function/namespace ou image/envs`,
      };
    }

    const sanitizedRequest = this.resolveRequest(request);

    if (!isValidAutomation(sanitizedRequest.function)) {
      if (sanitizedRequest.image) {
        console.log(
          `[ExecuteController] Imagem direta recebida: execId=${sanitizedRequest.execId} image=${sanitizedRequest.image}`,
        );
        this.executeSreDirectJobAsync(sanitizedRequest);
        return { message: "Requisicao recebida e job dinamico acionado" };
      }

      await this.notifyResolutionError(
        sanitizedRequest,
        `Automacao nao suportada para o payload recebido: function='${sanitizedRequest.function || "-"}' image='${sanitizedRequest.image || "-"}'`,
      );
      return {
        message: `Funcao inexistente. Funcoes disponiveis: ${listAvailableAutomations().join(", ")}`,
      };
    }

    console.log("\nIniciando Job com os dados recebidos:");
    console.log(
      `Namespace: ${sanitizedRequest.namespace}, Cluster: ${sanitizedRequest.cluster}, Function: ${sanitizedRequest.function}`,
    );
    console.log("");

    this.executeAutomationAsync(sanitizedRequest);

    return { message: "Requisicao recebida e automacao acionada" };
  }

  private async executeAutomationAsync(
    request: ResolvedExecutionRequest,
  ): Promise<void> {
    const automation = getAutomation(request.function);

    if (!automation) {
      await this.controllerClient.sendExecutionLog({
        execId: request.execId,
        ok: false,
        status: "ERROR",
        level: "error",
        message: `Automacao ${request.function} nao encontrada`,
        cluster: request.cluster,
        namespace: request.namespace,
      });
      return;
    }

    await this.controllerClient.sendExecutionLog({
      execId: request.execId,
      ok: true,
      status: "RUNNING",
      level: "info",
      message: `Execucao iniciada: ${automation.description}`,
      cluster: request.cluster,
      namespace: request.namespace,
    });
    console.log(
      `Log enviado - ExecId: ${request.execId}, Status: RUNNING, OK: true`,
    );

    try {
      if (automation.type === "http") {
        await this.executeHttpAutomation(request, automation);
      } else if (automation.type === "job") {
        await this.executeJobAutomation(request, automation);
      } else if (automation.type === "composite-job") {
        await this.executeCompositeJobAutomation(request, automation);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("[ExecuteController] Erro ao executar automacao:", error);

      await this.controllerClient.sendExecutionLog({
        execId: request.execId,
        ok: false,
        status: "ERROR",
        level: "error",
        message: `Erro na execucao: ${detail}`,
        cluster: request.cluster,
        namespace: request.namespace,
      });

      ErrorAgentController.addExecution({
        id: request.execId,
        functionName: request.function,
        cluster: request.cluster,
        namespace: request.namespace,
        timestamp: new Date(),
        success: false,
      });
    }
  }

  private async executeHttpAutomation(
    request: ResolvedExecutionRequest,
    automation: HttpAutomation,
  ): Promise<void> {
    console.log(
      `[ExecuteController] Executando automacao HTTP: ${request.function}`,
    );

    const result = await this.httpService.executeAutomation(
      request.execId,
      request.namespace,
      request.function,
      request.cluster,
      automation,
    );

    const brasiliaTime = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    console.log(`[${brasiliaTime}] === RESULTADO HTTP ===`);
    console.log(JSON.stringify(result.data, null, 2));
    console.log("============================");

    if (result.success) {
      await this.controllerClient.sendExecutionLog({
        execId: request.execId,
        ok: true,
        status: "DONE",
        level: "info",
        message: JSON.stringify(result.data, null, 2),
        cluster: request.cluster,
        namespace: request.namespace,
      });

      console.log("[ExecuteController] Resultado HTTP enviado ao Controller");
    } else {
      await this.controllerClient.sendExecutionLog({
        execId: request.execId,
        ok: false,
        status: "ERROR",
        level: "error",
        message: `Erro na automacao HTTP: ${result.error}`,
        cluster: request.cluster,
        namespace: request.namespace,
      });

      ErrorAgentController.addExecution({
        id: request.execId,
        functionName: request.function,
        cluster: request.cluster,
        namespace: request.namespace,
        timestamp: new Date(),
        success: false,
      });
    }
  }

  private async executeJobAutomation(
    request: ResolvedExecutionRequest,
    automation: JobAutomation,
  ): Promise<void> {
    const startTime = Date.now();

    console.log(`Executando automacao Job: ${request.function}`);

    const result = await this.jobService.executeJob(
      request.execId,
      request.function,
      request.namespace,
      automation,
      request.additionalEnvVars,
    );

    const brasiliaTime = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    console.log(`[${brasiliaTime}] === RESULTADO DO JOB ===`);
    console.log(this.formatJobResult(result));
    console.log("============================");

    const status = result.compliance_status === "success" ? "DONE" : "ERROR";
    const ok = result.compliance_status === "success";
    const level = result.compliance_status === "success" ? "info" : "error";

    await this.controllerClient.sendExecutionLog({
      execId: request.execId,
      ok,
      status,
      level,
      message: JSON.stringify(result, null, 2),
      cluster: request.cluster,
      namespace: request.namespace,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `Resultado do Job enviado ao Controller, verifique o seguinte ExecId: ${request.execId}, Status: ${status}, OK: ${ok}`,
    );
    console.log(`\nTempo TOTAL de execucao: ${elapsed}s`);
    console.log(
      "\n==============================================================================================================\n",
    );
  }

  private async executeCompositeJobAutomation(
    request: ResolvedExecutionRequest,
    automation: CompositeJobAutomation,
  ): Promise<void> {
    console.log(
      `[ExecuteController] Executando automacao composta: ${request.function} (${automation.steps.join(" -> ")})`,
    );

    const result = await this.jobService.executeMigration(
      request.execId,
      request.namespace,
      request.additionalEnvVars,
    );

    const brasiliaTime = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    console.log(`[${brasiliaTime}] === RESULTADO DA MIGRATION ===`);
    console.log(JSON.stringify(result, null, 2));
    console.log("============================");

    const origemOk = result.origem.compliance_status === "success";
    const destinoOk =
      result.destino !== null && result.destino.compliance_status === "success";
    const ok = origemOk && destinoOk;
    const status = ok ? "DONE" : "ERROR";
    const level = ok ? "info" : "error";

    await this.controllerClient.sendExecutionLog({
      execId: request.execId,
      ok,
      status,
      level,
      message: JSON.stringify(result, null, 2),
      cluster: request.cluster,
      namespace: request.namespace,
    });

    console.log("[ExecuteController] Resultado da Migration enviado ao Controller");
  }

  private formatJobResult(result: IJobResult): string {
    const lines: string[] = [];

    lines.push(`  Status    : ${result.compliance_status}`);
    lines.push(`  Namespace : ${result.namespace}`);
    lines.push(`  Cluster   : ${result.cluster_type}`);
    lines.push(`  Timestamp : ${result.timestamp}`);

    if (result.captured_data) {
      const { nodeSelectors, storageClasses } = result.captured_data;

      lines.push("");
      lines.push("  [ Node Selectors ]");
      if (nodeSelectors && Object.keys(nodeSelectors).length > 0) {
        Object.entries(nodeSelectors).forEach(([workload, selectors]) => {
          lines.push(`  ${workload}:`);
          Object.entries(selectors).forEach(([key, value]) => {
            lines.push(`    - ${key} = ${value}`);
          });
        });
      } else {
        lines.push("  (nenhum)");
      }

      lines.push("");
      lines.push("  [ Storage Classes ]");
      if (storageClasses && Object.keys(storageClasses).length > 0) {
        Object.entries(storageClasses).forEach(([pvc, sc]) => {
          lines.push(`  ${pvc} -> ${sc}`);
        });
      } else {
        lines.push("  (nenhum)");
      }
    }

    if (result.validation_data) {
      const validatedNodeSelectors =
        result.validation_data.validated_node_selectors;
      const validatedStorageClasses =
        result.validation_data.validated_storage_classes;

      if (validatedNodeSelectors) {
        lines.push("");
        lines.push(
          `  [ Node Selectors Validados : ${validatedNodeSelectors.status} ]`,
        );
        Object.entries(validatedNodeSelectors.required).forEach(
          ([workload, selectors]) => {
            lines.push(`  ${workload}:`);
            Object.entries(selectors).forEach(([key, value]) => {
              lines.push(`    - ${key} = ${value}`);
            });
          },
        );
      }

      if (validatedStorageClasses) {
        lines.push("");
        lines.push(
          `  [ Storage Classes Validadas : ${validatedStorageClasses.status} ]`,
        );
        Object.entries(validatedStorageClasses.required).forEach(
          ([pvc, sc]) => {
            lines.push(`  ${pvc} -> ${sc}`);
          },
        );
      }
    }

    if (result.failures && result.failures.length > 0) {
      lines.push("");
      lines.push("  [ Falhas ]");
      result.failures.forEach((failure) => {
        lines.push(`  [${failure.check}] ${failure.reason}`);
      });
    }

    if (result.errors && result.errors.length > 0) {
      lines.push("");
      lines.push("  [ Erros ]");
      result.errors.forEach((error) => {
        lines.push(`  [${error.check}] ${error.reason}`);
      });
    }

    return lines.join("\n");
  }

  private sanitizeInput(input: string): string {
    if (!input) return "";

    return input
      .replace(/[<>'&]/g, "")
      .replace(/"/g, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+=/gi, "")
      .trim();
  }
}

export default ExecuteController;
