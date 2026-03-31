import type { Request } from "express";
import {
  getAllowedScopesForApiKey,
  loadApiKeyScopesMap,
  type ApiKeyScopesMap,
} from "./apiKeyScopes";

export function getApiKey(req: Request): string | undefined {
  const headerKey = String(req.header("x-api-key") || "").trim();
  if (headerKey) return headerKey;

  const auth = String(req.header("authorization") || "").trim();
  if (auth.startsWith("ApiKey ")) return auth.slice(7).trim() || undefined;

  return undefined;
}

export function resolveApiKeyAccess(
  apiKey: string | undefined,
  map: ApiKeyScopesMap = loadApiKeyScopesMap(),
): { ok: true; apiKey: string; allowedScopes: string[] } | { ok: false } {
  const normalized = String(apiKey || "").trim();
  if (!normalized) return { ok: false };

  const allowedScopes = getAllowedScopesForApiKey(normalized, map);
  if (!allowedScopes) return { ok: false };

  return {
    ok: true,
    apiKey: normalized,
    allowedScopes,
  };
}
