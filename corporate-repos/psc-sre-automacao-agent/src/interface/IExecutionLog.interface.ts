export type ExecStatus = "RUNNING" | "PENDING" | "DONE" | "ERROR";

export interface ILogEntry {
  ts: string;
  level?: "info" | "warn" | "error";
  message?: string;
  status?: ExecStatus;
  [k: string]: unknown;
}

export interface IExecutionLog {
  execId: string;
  ok: boolean;
  entries: ILogEntry[];
  status?: ExecStatus;
  [k: string]: unknown;
}
