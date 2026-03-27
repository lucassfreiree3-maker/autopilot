import { ControllerClientService } from "../../services/controller-client.service";
import { executionLogStore } from "../../services/execution-log-store.service";

global.fetch = jest.fn();

jest.mock("../../util/jwt", () => ({
  JWTService: {
    generateCallbackToken: jest.fn(() => "mock-jwt-token-123"),
  },
}));

describe("ControllerClientService", () => {
  let service: ControllerClientService;

  beforeEach(() => {
    service = new ControllerClientService();
    executionLogStore.clear();
    jest.clearAllMocks();
  });

  test("persists log locally even when controller callback fails", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    await service.sendExecutionLog({
      execId: "test-local-store-001",
      ok: false,
      status: "ERROR",
      level: "error",
      message: "Falha de callback",
      cluster: "k8sdesbb111b",
      namespace: "psc-agent",
    });

    const stored = executionLogStore.get("test-local-store-001");

    expect(stored).toEqual(
      expect.objectContaining({
        ok: false,
        entries: expect.arrayContaining([
          expect.objectContaining({
            status: "ERROR",
            level: "error",
            message: "Falha de callback",
          }),
        ]),
      }),
    );
  });

  test("sends callback fetch with abort signal", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ ok: true }),
      text: async () => "",
    });

    await service.sendExecutionLog({
      execId: "test-signal-001",
      ok: true,
      status: "DONE",
      level: "info",
      message: "ok",
      cluster: "k8sdesbb111b",
      namespace: "psc-agent",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(Object),
      }),
    );
  });

  test("logs configured timeout when callback aborts", async () => {
    const originalTimeout = process.env.CONTROLLER_CALLBACK_TIMEOUT_MS;
    process.env.CONTROLLER_CALLBACK_TIMEOUT_MS = "1234";
    const abortError = Object.assign(new Error("aborted"), {
      name: "AbortError",
    });
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    (global.fetch as jest.Mock).mockRejectedValue(abortError);

    try {
      await service.sendExecutionLog({
        execId: "test-timeout-001",
        ok: false,
        status: "ERROR",
        level: "error",
        message: "timeout",
        cluster: "k8sdesbb111b",
        namespace: "psc-agent",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[ControllerClient] Timeout ao enviar log ao Controller após 1234ms:",
        abortError,
      );
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.CONTROLLER_CALLBACK_TIMEOUT_MS;
      } else {
        process.env.CONTROLLER_CALLBACK_TIMEOUT_MS = originalTimeout;
      }
      consoleErrorSpy.mockRestore();
    }
  });
});
