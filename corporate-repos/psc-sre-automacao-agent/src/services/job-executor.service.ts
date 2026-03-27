import * as k8s from "@kubernetes/client-node";

export interface JobConfig {
  image: string;
  namespace: string;
  serviceAccount: string;
  ttlSecondsAfterFinished?: number;
  timeout?: number;
  envVars: Record<string, string>;
}

interface JobPodDiagnostic {
  summary: string;
  blockingReason?: string;
}

const FATAL_CONTAINER_WAITING_REASONS = new Set([
  "ErrImagePull",
  "ImagePullBackOff",
  "CrashLoopBackOff",
  "CreateContainerConfigError",
  "CreateContainerError",
  "InvalidImageName",
  "ContainerCannotRun",
  "RunContainerError",
]);

export class JobExecutorService {
  private batchV1Api: k8s.BatchV1Api;

  private coreV1Api: k8s.CoreV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();
    this.batchV1Api = kc.makeApiClient(k8s.BatchV1Api);
    this.coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  }

  async createJob(
    execId: string,
    functionName: string,
    config: JobConfig,
  ): Promise<string> {
    const safeName = functionName.replace(/_/g, "-").toLowerCase();
    const shortId = execId.replace(/-/g, "").substring(0, 8);
    const jobName = `${safeName}-${shortId}-${Date.now()}`;

    const envVars: k8s.V1EnvVar[] = Object.entries(config.envVars).map(
      ([name, value]) => ({ name, value }),
    );

    const job: k8s.V1Job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace: config.namespace,
        labels: {
          app: "automation-job",
          function: safeName,
          execId: shortId,
          managedBy: "psc-sre-agent",
        },
      },
      spec: {
        ttlSecondsAfterFinished: config.ttlSecondsAfterFinished ?? 300,
        backoffLimit: 0,
        template: {
          metadata: {
            labels: {
              app: "automation-job",
              function: safeName,
              "job-name": jobName,
            },
          },
          spec: {
            restartPolicy: "Never",
            serviceAccountName: config.serviceAccount,
            containers: [
              {
                name: "automation",
                image: config.image,
                env: envVars,
                resources: {
                  requests: { memory: "128Mi", cpu: "100m" },
                  limits: { memory: "512Mi", cpu: "500m" },
                },
              },
            ],
          },
        },
      },
    };

    await this.batchV1Api.createNamespacedJob({
      namespace: config.namespace,
      body: job,
    });
    console.log(`Job ${jobName} criado com sucesso!!`);
    return jobName;
  }

  async waitForJobCompletion(
    jobName: string,
    namespace: string,
    timeoutSeconds: number = 300,
  ): Promise<{ success: boolean; reason?: string }> {
    const startTime = Date.now();
    const pollInterval = 2000;
    let lastObservation = "Nenhum status de Pod disponivel";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() - startTime >= timeoutSeconds * 1000) {
        return {
          success: false,
          reason: `Timeout apos ${timeoutSeconds}s. ${lastObservation}`,
        };
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        const job = await this.batchV1Api.readNamespacedJob({
          name: jobName,
          namespace,
        });

        const failedCondition = this.getFailedJobCondition(job.status);
        if (failedCondition) {
          const reason = failedCondition.reason || "Failed";
          const message = failedCondition.message
            ? ` - ${failedCondition.message}`
            : "";
          return {
            success: false,
            reason: `Job falhou (${reason})${message}`,
          };
        }

        if ((job.status?.succeeded ?? 0) > 0) {
          return { success: true };
        }

        if ((job.status?.failed ?? 0) > 0) {
          // eslint-disable-next-line no-await-in-loop
          const podDiagnostic = await this.getJobPodDiagnostic(
            jobName,
            namespace,
          );

          const reason = podDiagnostic
            ? `Job falhou. ${podDiagnostic.summary}`
            : "Job falhou";

          return { success: false, reason };
        }

        // eslint-disable-next-line no-await-in-loop
        const podDiagnostic = await this.getJobPodDiagnostic(
          jobName,
          namespace,
        );
        if (podDiagnostic?.summary) {
          lastObservation = podDiagnostic.summary;
        }

        if (podDiagnostic?.blockingReason) {
          return {
            success: false,
            reason: podDiagnostic.blockingReason,
          };
        }
      } catch (error) {
        return {
          success: false,
          reason: `Erro ao verificar Job: ${this.getErrorMessage(error)}`,
        };
      }

      // eslint-disable-next-line no-await-in-loop
      await this.sleep(pollInterval);
    }
  }

  async getJobLogs(jobName: string, namespace: string): Promise<string> {
    const podList = await this.coreV1Api.listNamespacedPod({
      namespace,
      labelSelector: `job-name=${jobName}`,
    });

    const pod = this.getLatestPod(podList.items);
    if (!pod?.metadata?.name) {
      throw new Error(`Nenhum Pod encontrado para Job ${jobName}`);
    }

    const logs = await this.coreV1Api.readNamespacedPodLog({
      name: pod.metadata.name,
      namespace,
    });

    return logs;
  }

  async deleteJob(jobName: string, namespace: string): Promise<void> {
    try {
      await this.batchV1Api.deleteNamespacedJob({
        name: jobName,
        namespace,
        propagationPolicy: "Foreground",
      });
      console.log(`Job ${jobName} deletado com sucesso`);
    } catch (error) {
      console.error(
        `Erro ao deletar Job ${jobName}:`,
        this.getErrorMessage(error),
      );
    }
  }

  private getFailedJobCondition(
    status: k8s.V1JobStatus | undefined,
  ): k8s.V1JobCondition | undefined {
    return status?.conditions?.find(
      (condition) =>
        (condition.type === "Failed" || condition.type === "FailedCreate") &&
        String(condition.status) === "True",
    );
  }

  private async getJobPodDiagnostic(
    jobName: string,
    namespace: string,
  ): Promise<JobPodDiagnostic | null> {
    try {
      const podList = await this.coreV1Api.listNamespacedPod({
        namespace,
        labelSelector: `job-name=${jobName}`,
      });

      const pod = this.getLatestPod(podList.items);
      if (!pod?.metadata?.name) {
        return {
          summary: `Pod do Job ${jobName} ainda nao foi criado`,
        };
      }

      const podName = pod.metadata.name;
      const podPhase = pod.status?.phase || "Unknown";
      const podReason = pod.status?.reason
        ? `, reason=${pod.status.reason}`
        : "";
      const podMessage = pod.status?.message
        ? `, message=${this.truncate(pod.status.message)}`
        : "";
      const containerDetails = this.getContainerStateDetails(
        pod.status?.containerStatuses,
      );

      const summary = `Ultimo Pod ${podName}: phase=${podPhase}${podReason}${podMessage}${containerDetails ? `, containers=[${containerDetails}]` : ""}`;

      const unschedulable = pod.status?.conditions?.find(
        (condition) =>
          condition.type === "PodScheduled" &&
          String(condition.status) === "False" &&
          condition.reason === "Unschedulable",
      );

      if (unschedulable?.message) {
        return {
          summary,
          blockingReason: `${summary}. ${this.truncate(unschedulable.message)}`,
        };
      }

      const fatalContainerReason = this.getFatalContainerReason(
        pod.status?.containerStatuses,
      );
      if (fatalContainerReason) {
        return {
          summary,
          blockingReason: `${summary}. ${fatalContainerReason}`,
        };
      }

      if (podPhase === "Failed") {
        return {
          summary,
          blockingReason: `${summary}. Pod finalizado com falha`,
        };
      }

      return { summary };
    } catch (error) {
      return {
        summary: `Nao foi possivel diagnosticar Pod do Job ${jobName}: ${this.getErrorMessage(error)}`,
      };
    }
  }

  private getLatestPod(pods: k8s.V1Pod[]): k8s.V1Pod | undefined {
    if (!pods.length) {
      return undefined;
    }

    return pods.sort(
      (a, b) => this.getCreationTime(b) - this.getCreationTime(a),
    )[0];
  }

  private getCreationTime(pod: k8s.V1Pod): number {
    const creationTimestamp = pod.metadata?.creationTimestamp;
    if (!creationTimestamp) {
      return 0;
    }

    const dateValue =
      creationTimestamp instanceof Date
        ? creationTimestamp
        : new Date(String(creationTimestamp));

    return Number.isNaN(dateValue.getTime()) ? 0 : dateValue.getTime();
  }

  private getContainerStateDetails(
    statuses: k8s.V1ContainerStatus[] | undefined,
  ): string {
    if (!statuses || statuses.length === 0) {
      return "";
    }

    return statuses
      .map((status) => {
        if (status.state?.waiting) {
          const { waiting } = status.state;
          return `${status.name}=Waiting(${waiting.reason || "Unknown"})`;
        }

        if (status.state?.terminated) {
          const { terminated } = status.state;
          return `${status.name}=Terminated(${terminated.reason || "Unknown"}, exitCode=${terminated.exitCode})`;
        }

        if (status.state?.running) {
          return `${status.name}=Running`;
        }

        return `${status.name}=Unknown`;
      })
      .join("; ");
  }

  private getFatalContainerReason(
    statuses: k8s.V1ContainerStatus[] | undefined,
  ): string | null {
    if (!statuses || statuses.length === 0) {
      return null;
    }

    return statuses.reduce<string | null>((found, status) => {
      if (found !== null) return found;

      const waiting = status.state?.waiting;
      if (
        waiting?.reason &&
        FATAL_CONTAINER_WAITING_REASONS.has(waiting.reason)
      ) {
        const message = waiting.message
          ? ` - ${this.truncate(waiting.message)}`
          : "";
        return `Container ${status.name} em estado ${waiting.reason}${message}`;
      }

      const terminated = status.state?.terminated;
      if (terminated && terminated.exitCode !== 0) {
        const reason = terminated.reason || "Unknown";
        const message = terminated.message
          ? ` - ${this.truncate(terminated.message)}`
          : "";
        return `Container ${status.name} finalizou com ${reason} (exitCode=${terminated.exitCode})${message}`;
      }

      return null;
    }, null);
  }

  private truncate(value: string, maxLen: number = 300): string {
    if (value.length <= maxLen) {
      return value;
    }

    return `${value.slice(0, maxLen)}...`;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });
  }
}
