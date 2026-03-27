import { JobExecutorService } from "../../services/job-executor.service";

describe("JobExecutorService", () => {
  let service: JobExecutorService;
  let batchApi: { readNamespacedJob: jest.Mock };
  let coreApi: { listNamespacedPod: jest.Mock };

  beforeEach(() => {
    service = new JobExecutorService();

    batchApi = {
      readNamespacedJob: jest.fn(),
    };

    coreApi = {
      listNamespacedPod: jest.fn(),
    };

    (service as unknown as { batchV1Api: typeof batchApi }).batchV1Api =
      batchApi;
    (service as unknown as { coreV1Api: typeof coreApi }).coreV1Api = coreApi;
    (service as unknown as { sleep: jest.Mock }).sleep = jest
      .fn()
      .mockResolvedValue(undefined);
  });

  test("deve falhar rapido quando Job possui condicao Failed", async () => {
    batchApi.readNamespacedJob.mockResolvedValue({
      status: {
        conditions: [
          {
            type: "Failed",
            status: "True",
            reason: "FailedCreate",
            message:
              'pods "migration-x" is forbidden: serviceaccount not found',
          },
        ],
      },
    });

    const result = await service.waitForJobCompletion(
      "migration-x",
      "psc-sre-aut-agent",
      600,
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("FailedCreate");
    expect(result.reason).toContain("serviceaccount not found");
  });

  test("deve falhar rapido quando pod entra em ImagePullBackOff", async () => {
    batchApi.readNamespacedJob.mockResolvedValue({
      status: {},
    });

    coreApi.listNamespacedPod.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "migration-x-abcde",
            creationTimestamp: "2026-03-04T12:00:00.000Z",
          },
          status: {
            phase: "Pending",
            containerStatuses: [
              {
                name: "automation",
                state: {
                  waiting: {
                    reason: "ImagePullBackOff",
                    message: "back-off pulling image",
                  },
                },
              },
            ],
          },
        },
      ],
    });

    const result = await service.waitForJobCompletion(
      "migration-x",
      "psc-sre-aut-agent",
      600,
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("ImagePullBackOff");
    expect(result.reason).toContain("migration-x-abcde");
  });

  test("deve retornar timeout com ultimo status observado", async () => {
    const nowValues = [0, 0, 1500];
    const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => {
      const value = nowValues.shift();
      return value ?? 1500;
    });

    batchApi.readNamespacedJob.mockResolvedValue({
      status: {},
    });

    coreApi.listNamespacedPod.mockResolvedValue({
      items: [
        {
          metadata: {
            name: "migration-x-timeout",
            creationTimestamp: "2026-03-04T12:00:00.000Z",
          },
          status: {
            phase: "Pending",
            containerStatuses: [
              {
                name: "automation",
                state: {
                  waiting: {
                    reason: "ContainerCreating",
                    message: "creating container",
                  },
                },
              },
            ],
          },
        },
      ],
    });

    const result = await service.waitForJobCompletion(
      "migration-x",
      "psc-sre-aut-agent",
      1,
    );

    expect(result.success).toBe(false);
    expect(result.reason).toContain("Timeout apos 1s");
    expect(result.reason).toContain("migration-x-timeout");

    nowSpy.mockRestore();
  });
});
