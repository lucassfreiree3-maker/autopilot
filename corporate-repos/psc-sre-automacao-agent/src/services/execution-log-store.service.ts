import { IExecutionLog, ILogEntry } from "../interface/IExecutionLog.interface";

export interface IExecutionLogSnapshot {
  ok: boolean;
  entries: ILogEntry[];
}

class ExecutionLogStoreService {
  private execStore = new Map<string, IExecutionLogSnapshot>();

  append(logData: IExecutionLog): IExecutionLogSnapshot {
    const current = this.execStore.get(logData.execId) ?? {
      ok: logData.ok,
      entries: [],
    };

    const next: IExecutionLogSnapshot = {
      ok: logData.ok,
      entries: [
        ...current.entries.map((entry) => ({ ...entry })),
        ...logData.entries.map((entry) => ({ ...entry })),
      ],
    };

    this.execStore.set(logData.execId, next);
    return this.clone(next);
  }

  get(execId: string): IExecutionLogSnapshot | undefined {
    const current = this.execStore.get(execId);
    return current ? this.clone(current) : undefined;
  }

  clear(): void {
    this.execStore.clear();
  }

  private clone(snapshot: IExecutionLogSnapshot): IExecutionLogSnapshot {
    return {
      ok: snapshot.ok,
      entries: snapshot.entries.map((entry) => ({ ...entry })),
    };
  }
}

export const executionLogStore = new ExecutionLogStoreService();
