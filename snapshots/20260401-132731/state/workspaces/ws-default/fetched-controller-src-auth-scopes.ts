type RequiredEnv =
  | "SCOPE_EXECUTE_AUTOMATION"
  | "SCOPE_SEND_LOGS"
  | "SCOPE_READ_STATUS"
  | "SCOPE_REGISTER_AGENT";

export const SCOPE_ENV_NAMES = Object.freeze({
  EXECUTE: "SCOPE_EXECUTE_AUTOMATION",
  SEND: "SCOPE_SEND_LOGS",
  READ: "SCOPE_READ_STATUS",
  REGISTER: "SCOPE_REGISTER_AGENT",
} as const);

export type ScopeCatalog = {
  EXECUTE: string;
  SEND: string;
  READ: string;
  REGISTER: string;
};

function requiredEnv(name: RequiredEnv): string {
  const raw = process.env[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        "Scopes must be provided via environment (recommended: Kubernetes Secret).",
    );
  }
  return value;
}

let cache: ScopeCatalog | null = null;

export function resolveScopes(): ScopeCatalog {
  if (cache) return cache;
  cache = Object.freeze({
    EXECUTE: requiredEnv(SCOPE_ENV_NAMES.EXECUTE),
    SEND: requiredEnv(SCOPE_ENV_NAMES.SEND),
    READ: requiredEnv(SCOPE_ENV_NAMES.READ),
    REGISTER: requiredEnv(SCOPE_ENV_NAMES.REGISTER),
  });
  return cache;
}

export const SCOPES = Object.freeze({
  get EXECUTE(): string {
    return resolveScopes().EXECUTE;
  },
  get SEND(): string {
    return resolveScopes().SEND;
  },
  get READ(): string {
    return resolveScopes().READ;
  },
  get REGISTER(): string {
    return resolveScopes().REGISTER;
  },
});

export type Scope = string;

export function allScopes(): Scope[] {
  const s = resolveScopes();
  return [s.EXECUTE, s.SEND, s.READ, s.REGISTER];
}

export function normalizeTokenScopes(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  const raw = String(value).trim();
  if (!raw) return [];
  return raw
    .split(/[ ,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function validateRequestedScopes(requested: string[]):
  | {
      ok: true;
      scopes: Scope[];
    }
  | {
      ok: false;
      invalid: string[];
    } {
  const allowed = new Set<string>(allScopes());
  const cleaned = requested.map((s) => String(s).trim()).filter(Boolean);
  const invalid = cleaned.filter((s) => !allowed.has(s));
  if (invalid.length) return { ok: false, invalid };
  return { ok: true, scopes: cleaned as Scope[] };
}

export function hasAllScopes(
  tokenScopes: string[],
  required: string[],
): boolean {
  const set = new Set(tokenScopes);
  return required.every((s) => set.has(s));
}
