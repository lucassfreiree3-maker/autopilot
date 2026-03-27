import { JobExecutorService, JobConfig } from "./job-executor.service";
import { JobAutomation, getAutomation } from "../config/automations.config";
import { IJobResult, IMigrationResult } from "../interface/IJobResult";

export class AutomationJobService {
  private jobExecutor: JobExecutorService;

  constructor() {
    this.jobExecutor = new JobExecutorService();
  }

  async executeJob(
    execId: string,
    functionName: string,
    namespace: string,
    automation: JobAutomation,
    additionalEnvVars?: Record<string, string>,
  ): Promise<IJobResult> {
    let jobName: string | null = null;
    const clusterType = this.getClusterTypeFromFunction(functionName);

    try {
      const envVars = {
        NAMESPACE: namespace,
        ...automation.envVars,
        ...additionalEnvVars,
      };

      const jobConfig: JobConfig = {
        image: automation.image,
        namespace: automation.namespace,
        serviceAccount: automation.serviceAccount,
        ttlSecondsAfterFinished: automation.ttlSecondsAfterFinished,
        timeout: automation.timeout,
        envVars,
      };

      console.log(`Criando Job para ${functionName} (execId: ${execId})`);

      jobName = await this.jobExecutor.createJob(
        execId,
        functionName,
        jobConfig,
      );

      console.log("Aguardando conclusao...");

      const completion = await this.jobExecutor.waitForJobCompletion(
        jobName,
        automation.namespace,
        automation.timeout,
      );

      if (!completion.success) {
        throw new Error(completion.reason || "Job falhou");
      }

      console.log(`\n[AutomationJob] Job ${jobName} concluido com sucesso`);

      const logs = await this.jobExecutor.getJobLogs(
        jobName,
        automation.namespace,
      );

      console.log(`\n[AutomationJob] Logs capturados do Job ${jobName}`);

      const jobResult = this.parseJobLogs(logs, clusterType, namespace);

      return jobResult;
    } catch (error) {
      console.error(
        `[AutomationJob] Erro ao executar Job: ${this.getErrorMessage(error)}`,
      );

      return {
        compliance_status: "error",
        namespace,
        cluster_type: clusterType,
        timestamp: new Date().toISOString(),
        errors: [
          {
            check: "job_execution",
            reason: this.getErrorMessage(error),
          },
        ],
      };
    }
  }

  async executeMigration(
    execId: string,
    namespace: string,
    additionalEnvVars?: Record<string, string>,
  ): Promise<IMigrationResult> {
    const origemAutomation = getAutomation("migration_origem") as JobAutomation;
    const destinoAutomation = getAutomation(
      "migration_destino",
    ) as JobAutomation;

    console.log(
      `[AutomationJob] Iniciando migration: origem (execId: ${execId})`,
    );

    const origemResult = await this.executeJob(
      execId,
      "migration_origem",
      namespace,
      origemAutomation,
      additionalEnvVars,
    );

    if (origemResult.compliance_status !== "success") {
      console.log(
        `[AutomationJob] Migration origem ${origemResult.compliance_status} - destino nao sera executado`,
      );
      return { origem: origemResult, destino: null };
    }

    const nodeSelectors = origemResult.captured_data?.nodeSelectors ?? {};
    const storageClasses = origemResult.captured_data?.storageClasses ?? {};

    console.log(
      `[AutomationJob] Iniciando migration: destino (execId: ${execId})`,
    );

    const destinoResult = await this.executeJob(
      execId,
      "migration_destino",
      namespace,
      destinoAutomation,
      {
        ...additionalEnvVars,
        NODE_SELECTORS: JSON.stringify(nodeSelectors),
        STORAGE_CLASSES: JSON.stringify(storageClasses),
      },
    );

    return { origem: origemResult, destino: destinoResult };
  }

  private parseJobLogs(
    logs: string,
    fallbackClusterType: "origem" | "destino",
    fallbackNamespace: string,
  ): IJobResult {
    try {
      const jsonContent = this.extractLastJsonObject(logs);
      const parsed = JSON.parse(jsonContent) as Partial<IJobResult>;

      if (!this.isComplianceStatus(parsed.compliance_status)) {
        throw new Error("JSON dos logs sem compliance_status valido");
      }

      const result: IJobResult = {
        ...(parsed as IJobResult),
        namespace: parsed.namespace || fallbackNamespace,
        cluster_type:
          parsed.cluster_type === "origem" || parsed.cluster_type === "destino"
            ? parsed.cluster_type
            : fallbackClusterType,
        timestamp: parsed.timestamp || new Date().toISOString(),
      };

      return result;
    } catch (error) {
      console.error(
        "[AutomationJob] Erro ao parsear logs:",
        this.getErrorMessage(error),
      );
      console.error("[AutomationJob] Logs recebidos:", logs);

      return {
        compliance_status: "error",
        namespace: fallbackNamespace,
        cluster_type: fallbackClusterType,
        timestamp: new Date().toISOString(),
        errors: [
          {
            check: "log_parsing",
            reason: `Erro ao parsear resultado: ${this.getErrorMessage(error)}`,
          },
        ],
      };
    }
  }

  private extractLastJsonObject(logs: string): string {
    const candidates: string[] = [];
    let depth = 0;
    let start = -1;

    for (let index = 0; index < logs.length; index += 1) {
      const char = logs[index];

      if (char === "{") {
        if (depth === 0) {
          start = index;
        }
        depth += 1;
      } else if (char === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          candidates.push(logs.slice(start, index + 1));
          start = -1;
        }
      }
    }

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index].trim();
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // ignora candidatos invalidos
      }
    }

    throw new Error("Nenhum JSON valido encontrado nos logs");
  }

  async executeDynamicJob(
    execId: string,
    image: string,
    namespace: string,
    serviceAccount: string,
    timeout: number,
    envVars: Record<string, string>,
  ): Promise<{ success: boolean; reason?: string; logs?: string }> {
    const jobName = await this.jobExecutor.createJob(execId, "sre-job", {
      image,
      namespace,
      serviceAccount,
      ttlSecondsAfterFinished: 300,
      timeout,
      envVars,
    });

    console.log(
      `[AutomationJob] Job dinamico ${jobName} criado, aguardando conclusao...`,
    );

    const completion = await this.jobExecutor.waitForJobCompletion(
      jobName,
      namespace,
      timeout,
    );

    let logs = "";
    try {
      logs = await this.jobExecutor.getJobLogs(jobName, namespace);
    } catch (logError) {
      const msg =
        logError instanceof Error ? logError.message : String(logError);
      console.warn(
        `[AutomationJob] Nao foi possivel capturar logs do Job ${jobName}: ${msg}`,
      );
    }

    return { ...completion, logs };
  }

  private getClusterTypeFromFunction(
    functionName: string,
  ): "origem" | "destino" {
    return functionName.includes("destino") ? "destino" : "origem";
  }

  private isComplianceStatus(
    status: unknown,
  ): status is "success" | "failed" | "error" {
    return status === "success" || status === "failed" || status === "error";
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
