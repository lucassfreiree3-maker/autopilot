import {
  AutomationHttpService,
} from "../../services/automation-http.service";

global.fetch = jest.fn();

describe("AutomationHttpService", () => {
  let service: AutomationHttpService;

  beforeEach(() => {
    service = new AutomationHttpService();
    jest.clearAllMocks();
  });

  test("returns parsed JSON payload on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: jest.fn(async () => JSON.stringify({ ok: true, pods: 3 })),
    });

    const result = await service.executeAutomation(
      "exec-001",
      "ns-a",
      "get_pods",
      "cluster-a",
      {
        type: "http",
        url: "https://automation.local/run",
        description: "test automation",
      },
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://automation.local/run",
      expect.objectContaining({
        signal: expect.any(Object),
      }),
    );
    expect(result).toEqual({
      success: true,
      data: { ok: true, pods: 3 },
    });
  });

  test("returns timeout error when automation request aborts", async () => {
    const originalTimeout = process.env.AUTOMATION_HTTP_TIMEOUT_MS;
    process.env.AUTOMATION_HTTP_TIMEOUT_MS = "1234";
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    (global.fetch as jest.Mock).mockRejectedValue(abortError);

    try {
      const result = await service.executeAutomation(
        "exec-002",
        "ns-a",
        "get_pods",
        "cluster-a",
        {
          type: "http",
          url: "https://automation.local/run",
          description: "test automation",
        },
      );

      expect(result).toEqual({
        success: false,
        error: "Request timed out after 1234ms",
      });
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.AUTOMATION_HTTP_TIMEOUT_MS;
      } else {
        process.env.AUTOMATION_HTTP_TIMEOUT_MS = originalTimeout;
      }
    }
  });
});
