import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

jest.mock("../../util/s3logger", () => ({
  uploadRotatedTraceGz: jest.fn(
    async (fileName: string, _fullPath: string, _dateISO: string) => ({
      fileName,
      key: `controller/automation-trace/13-03-2026/${fileName}`,
      status: "uploaded",
    }),
  ),
}));

describe("log rotation", () => {
  const originalLogsDir = process.env.LOGS_DIR;
  let tempDir = "";

  beforeEach(async () => {
    jest.resetModules();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "controller-rotate-"));
    process.env.LOGS_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalLogsDir === undefined) {
      delete process.env.LOGS_DIR;
    } else {
      process.env.LOGS_DIR = originalLogsDir;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("rotates files with Brazilian date format and reports upload stats", async () => {
    const traceFile = path.join(tempDir, "automation-trace.log");
    await fs.writeFile(
      traceFile,
      [
        "[13/03/2026 10:00:00 BRT] INFO first line",
        "[13/03/2026 10:05:00 BRT] INFO second line",
      ].join("\n"),
      "utf8",
    );

    const { rotateAndCompress } = await import("../../util/logrotate");
    const { uploadRotatedTraceGz } = await import("../../util/s3logger");

    const result = await rotateAndCompress("prod");

    expect(result.filesWritten).toBe(1);
    expect(result.files).toEqual(["automation-trace-log-13-03-2026-prod.gz"]);
    expect(result.upload.attempted).toBe(1);
    expect(result.upload.uploaded).toBe(1);
    expect(uploadRotatedTraceGz).toHaveBeenCalledWith(
      "automation-trace-log-13-03-2026-prod.gz",
      expect.stringContaining("automation-trace-log-13-03-2026-prod.gz"),
      "2026-03-13",
    );
  });
});
