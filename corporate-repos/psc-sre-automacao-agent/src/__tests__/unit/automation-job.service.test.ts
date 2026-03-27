import { AutomationJobService } from "../../services/automation-job.service";
import { JobAutomation } from "../../config/automations.config";

describe("AutomationJobService", () => {
  let service: AutomationJobService;
  let mockExecutor: {
    createJob: jest.Mock;
    waitForJobCompletion: jest.Mock;
    getJobLogs: jest.Mock;
    deleteJob: jest.Mock;
  };

  const baseAutomation: JobAutomation = {
    type: "job",
    image:
      "docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-ns-migration-preflight:1.0.0",
    namespace: "psc-sre-aut-agent",
    serviceAccount: "migration-validator-sa",
    ttlSecondsAfterFinished: 300,
    timeout: 600,
    description: "job test",
    envVars: {
      CLUSTER_DE_ORIGEM: "TRUE",
      CLUSTER_DE_DESTINO: "FALSE",
    },
  };

  beforeEach(() => {
    service = new AutomationJobService();
    mockExecutor = {
      createJob: jest.fn().mockResolvedValue("job-123"),
      waitForJobCompletion: jest.fn().mockResolvedValue({ success: true }),
      getJobLogs: jest.fn(),
      deleteJob: jest.fn().mockResolvedValue(undefined),
    };

    (service as unknown as { jobExecutor: typeof mockExecutor }).jobExecutor =
      mockExecutor;
  });

  test("deve retornar cluster_type destino no erro de migration_destino", async () => {
    mockExecutor.waitForJobCompletion.mockResolvedValue({
      success: false,
      reason: "Timeout apos 600s",
    });

    const result = await service.executeJob(
      "exec-1",
      "migration_destino",
      "dev-namespace",
      {
        ...baseAutomation,
        envVars: {
          CLUSTER_DE_ORIGEM: "FALSE",
          CLUSTER_DE_DESTINO: "TRUE",
        },
      },
    );

    expect(result.compliance_status).toBe("error");
    expect(result.cluster_type).toBe("destino");
    expect(result.errors?.[0].reason).toContain("Timeout apos 600s");
  });

  test("deve parsear JSON da imagem mesmo com logs adicionais", async () => {
    mockExecutor.getJobLogs.mockResolvedValue(`
[INFO] iniciando validacao
{
  "compliance_status": "success",
  "namespace": "dev-c1334434-testes-java21",
  "cluster_type": "origem",
  "timestamp": "2026-03-04T12:00:00.000Z",
  "captured_data": {
    "nodeSelectors": {},
    "storageClasses": {}
  }
}
[INFO] finalizado
`);

    const result = await service.executeJob(
      "exec-2",
      "migration_origem",
      "dev-c1334434-testes-java21",
      baseAutomation,
    );

    expect(result.compliance_status).toBe("success");
    expect(result.namespace).toBe("dev-c1334434-testes-java21");
    expect(result.cluster_type).toBe("origem");
    expect(result.captured_data?.storageClasses).toEqual({});
  });

  test("deve incluir NAMESPACE e envs adicionais ao criar Job", async () => {
    mockExecutor.getJobLogs.mockResolvedValue(`
{
  "compliance_status": "success",
  "namespace": "ns-app",
  "cluster_type": "origem",
  "timestamp": "2026-03-04T12:00:00.000Z"
}
`);

    await service.executeJob(
      "exec-3",
      "migration_origem",
      "ns-app",
      baseAutomation,
      {
        NODE_SELECTORS: "{}",
        STORAGE_CLASSES: "{}",
      },
    );

    expect(mockExecutor.createJob).toHaveBeenCalledWith(
      "exec-3",
      "migration_origem",
      expect.objectContaining({
        envVars: expect.objectContaining({
          NAMESPACE: "ns-app",
          CLUSTER_DE_ORIGEM: "TRUE",
          CLUSTER_DE_DESTINO: "FALSE",
          NODE_SELECTORS: "{}",
          STORAGE_CLASSES: "{}",
        }),
      }),
    );
  });
});
