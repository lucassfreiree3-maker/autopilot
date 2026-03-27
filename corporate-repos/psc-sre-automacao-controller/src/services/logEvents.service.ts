import { EventEmitter } from "node:events";
import { timestampSP } from "../util/time";

export const TRACE_CHANGED_EVENT = "trace-changed" as const;

export type TraceChangedPayload = {
  file: string;
  updatedAt: string;
};

export const logEvents = new EventEmitter();

export async function notifyTraceChanged(
  file: string = "logs/automation-trace.log",
): Promise<void> {
  const payload: TraceChangedPayload = {
    file,
    updatedAt: timestampSP(),
  };

  logEvents.emit(TRACE_CHANGED_EVENT, payload);
}

export function onTraceChanged(
  listener: (payload: TraceChangedPayload) => void,
): () => void {
  logEvents.on(TRACE_CHANGED_EVENT, listener);
  return () => {
    logEvents.off(TRACE_CHANGED_EVENT, listener);
  };
}
