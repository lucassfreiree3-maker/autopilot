import { allScopes, validateRequestedScopes, type Scope } from "./scopes";

export type ApiKeyScopesMap = Record<string, Scope[]>;

function splitScopes(raw: string): string[] {
  return raw
    .split(/[ ,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseMapFromJson(raw: string): ApiKeyScopesMap | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const entries = Object.entries(parsed as Record<string, unknown>);
    const pairs = entries
      .map(([k, v]) => {
        const key = String(k || "").trim();
        if (!key) return null;

        const list = Array.isArray(v)
          ? v.map((x) => String(x).trim()).filter(Boolean)
          : splitScopes(String(v ?? ""));

        const validation = validateRequestedScopes(
          list.length ? list : allScopes(),
        );
        if (!validation.ok) return null;

        return [key, validation.scopes] as const;
      })
      .filter(Boolean) as Array<readonly [string, Scope[]]>;

    return Object.fromEntries(pairs) as ApiKeyScopesMap;
  } catch {
    return null;
  }
}

function parseMapFromLines(raw: string): ApiKeyScopesMap | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  const pairs = lines
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx <= 0) return null;

      const key = line.slice(0, idx).trim();
      const scopesRaw = line.slice(idx + 1).trim();
      if (!key) return null;

      const list = splitScopes(scopesRaw);
      const validation = validateRequestedScopes(
        list.length ? list : allScopes(),
      );
      if (!validation.ok) return null;

      return [key, validation.scopes] as const;
    })
    .filter(Boolean) as Array<readonly [string, Scope[]]>;

  if (!pairs.length) return null;

  return Object.fromEntries(pairs) as ApiKeyScopesMap;
}

export function loadApiKeyScopesMap(): ApiKeyScopesMap {
  const json = String(process.env.AUTH_API_KEYS_JSON || "").trim();
  if (json) {
    const parsed = parseMapFromJson(json);
    if (parsed) return parsed;
  }

  const lines = String(process.env.AUTH_API_KEYS_SCOPES || "").trim();
  if (lines) {
    const parsed = parseMapFromLines(lines);
    if (parsed) return parsed;
  }

  const singleKey = String(process.env.AUTH_API_KEY || "").trim();
  if (singleKey) {
    return { [singleKey]: allScopes() };
  }

  return {};
}

export function getAllowedScopesForApiKey(
  apiKey: string,
  map: ApiKeyScopesMap,
): Scope[] | null {
  const key = String(apiKey || "").trim();
  if (!key) return null;
  const scopes = map[key];
  return Array.isArray(scopes) && scopes.length ? scopes : null;
}
