import fs from "fs";
import path from "path";
import { parseBrazilianLogDateTimeToEpochMs } from "./time";

interface FilterParams {
  execId?: string;
  startDate?: string;
  endDate?: string;
}

export async function findLogs({
  execId,
  startDate,
  endDate,
}: FilterParams): Promise<string[]> {
  const logsDir =
    process.env.LOGS_DIR && process.env.LOGS_DIR.trim() !== ""
      ? path.resolve(process.cwd(), process.env.LOGS_DIR)
      : path.resolve(process.cwd(), "logs");
  const logFilePath = path.join(logsDir, "automation-trace.log");
  const content = fs.readFileSync(logFilePath, "utf-8");
  const lines = content.split("\n");

  const start = startDate ? new Date(startDate).getTime() : 0;
  const end = endDate ? new Date(endDate).getTime() : Date.now();

  return lines.filter((line) => {
    const dateMatch = line.match(
      /\[(\d{2}\/\d{2}\/\d{4}), (\d{2}:\d{2}:\d{2})/,
    );
    if (!dateMatch) return false;

    const [_, date, time] = dateMatch;
    const timestamp = parseBrazilianLogDateTimeToEpochMs(date, time);

    const matchExecId = execId ? line.includes(execId) : true;
    const matchDate = timestamp >= start && timestamp <= end;

    return matchExecId && matchDate;
  });
}
