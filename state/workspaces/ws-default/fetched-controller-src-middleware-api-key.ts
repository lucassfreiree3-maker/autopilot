import type { NextFunction, Request, Response } from "express";
import { getApiKey, resolveApiKeyAccess } from "../auth/api-key";

type RequestWithApiKey = Request & {
  apiKey?: string;
  apiKeyAllowedScopes?: string[];
};

export function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const access = resolveApiKeyAccess(getApiKey(req));
  if (!access.ok) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const requestWithApiKey = req as RequestWithApiKey;
  requestWithApiKey.apiKey = access.apiKey;
  requestWithApiKey.apiKeyAllowedScopes = access.allowedScopes;
  next();
}
