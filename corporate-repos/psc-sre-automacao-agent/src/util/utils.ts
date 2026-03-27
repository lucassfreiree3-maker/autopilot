import crypto from "node:crypto";

export function convertNumber(
  value: string | undefined,
  fallbackValue: number = NaN,
): number {
  if (!Number.isNaN(Number(value))) {
    return Number(value);
  }
  if (!Number.isNaN(fallbackValue)) {
    return fallbackValue;
  }
  throw new Error("Invalid number! No fallback value set.");
}

export function diffTimeInSeconds(start: [number, number]): number {
  const diff = process.hrtime(start);
  return Math.round((diff[0] * 1e9 + diff[1]) / 1000000);
}

export function generateId(): string {
  return crypto.randomUUID();
}
