import fs from "node:fs";
import https from "node:https";
import { URL } from "node:url";
import {
  resolveScopes,
  SCOPE_ENV_NAMES,
  type ScopeCatalog,
} from "./scopes";

type KubernetesSecretSource = {
  kind: "kubernetes-secret";
  name: string;
  namespace: string;
};

type EnvironmentSource = {
  kind: "environment";
};

export type RuntimeScopeSource = KubernetesSecretSource | EnvironmentSource;

export type RuntimeScopeResolution = {
  source: RuntimeScopeSource;
  scopes: ScopeCatalog;
};

type KubernetesSecretPayload = {
  data?: Record<string, string>;
};

const DEFAULT_K8S_TOKEN_FILE =
  "/var/run/secrets/kubernetes.io/serviceaccount/token";
const DEFAULT_K8S_CA_FILE = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
const DEFAULT_K8S_NAMESPACE_FILE =
  "/var/run/secrets/kubernetes.io/serviceaccount/namespace";

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readFileTrim(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function readFileBuffer(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function base64Decode(value: string | undefined): string {
  const raw = safeString(value);
  if (!raw) return "";
  try {
    return Buffer.from(raw, "base64").toString("utf8").trim();
  } catch {
    return "";
  }
}

function getConfiguredSecretName(): string {
  return safeString(process.env.SCOPES_SECRET_NAME);
}

function getConfiguredSecretNamespace(): string {
  return (
    safeString(process.env.SCOPES_SECRET_NAMESPACE) ||
    readFileTrim(DEFAULT_K8S_NAMESPACE_FILE)
  );
}

function getKubernetesApiBaseUrl(): string {
  const explicitUrl = safeString(process.env.KUBERNETES_API_URL);
  if (explicitUrl) return explicitUrl;

  const host = safeString(process.env.KUBERNETES_SERVICE_HOST);
  const port = safeString(process.env.KUBERNETES_SERVICE_PORT_HTTPS) || "443";
  if (!host) return "";

  return `https://${host}:${port}`;
}

function getKubernetesServiceAccountToken(): string {
  const inline = safeString(process.env.KUBERNETES_API_TOKEN);
  if (inline) return inline;

  const tokenFile =
    safeString(process.env.KUBERNETES_API_TOKEN_FILE) ||
    DEFAULT_K8S_TOKEN_FILE;

  return readFileTrim(tokenFile);
}

function getKubernetesCaBundle(): Buffer | null {
  const caFile =
    safeString(process.env.KUBERNETES_API_CA_FILE) || DEFAULT_K8S_CA_FILE;
  return readFileBuffer(caFile);
}

function httpsGetJson(
  targetUrl: string,
  headers: Record<string, string>,
  ca: Buffer | null,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
        ca: ca || undefined,
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: string[] = [];
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          chunks.push(String(chunk));
        });
        res.on("end", () => {
          const body = chunks.join("");
          if ((res.statusCode || 500) >= 400) {
            reject(
              new Error(
                `Kubernetes API returned status ${res.statusCode || 500}: ${body}`,
              ),
            );
            return;
          }

          try {
            resolve(JSON.parse(body) as unknown);
          } catch (error) {
            reject(
              new Error(
                `Unable to parse Kubernetes API response as JSON: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ),
            );
          }
        });
      },
    );

    req.on("error", (error) => reject(error));
    req.end();
  });
}

async function loadScopesFromKubernetesSecret(): Promise<RuntimeScopeResolution> {
  const secretName = getConfiguredSecretName();
  if (!secretName) {
    throw new Error("Missing SCOPES_SECRET_NAME");
  }

  const namespace = getConfiguredSecretNamespace();
  if (!namespace) {
    throw new Error(
      "Missing SCOPES_SECRET_NAMESPACE and unable to detect in-cluster namespace",
    );
  }

  const apiBaseUrl = getKubernetesApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error(
      "Missing Kubernetes API address. Set KUBERNETES_API_URL or run inside a Kubernetes pod",
    );
  }

  const token = getKubernetesServiceAccountToken();
  if (!token) {
    throw new Error("Missing Kubernetes service account token");
  }

  const ca = getKubernetesCaBundle();
  const secretUrl =
    `${apiBaseUrl.replace(/\/+$/, "")}/api/v1/namespaces/` +
    `${encodeURIComponent(namespace)}/secrets/${encodeURIComponent(secretName)}`;

  const payload = (await httpsGetJson(
    secretUrl,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    ca,
  )) as KubernetesSecretPayload;

  const data = payload.data || {};
  const scopes: ScopeCatalog = {
    EXECUTE: base64Decode(data[SCOPE_ENV_NAMES.EXECUTE]),
    SEND: base64Decode(data[SCOPE_ENV_NAMES.SEND]),
    READ: base64Decode(data[SCOPE_ENV_NAMES.READ]),
    REGISTER: base64Decode(data[SCOPE_ENV_NAMES.REGISTER]),
  };

  if (!scopes.EXECUTE || !scopes.SEND || !scopes.READ || !scopes.REGISTER) {
    throw new Error(
      "Scopes Secret is missing one or more required keys: " +
        [
          SCOPE_ENV_NAMES.EXECUTE,
          SCOPE_ENV_NAMES.SEND,
          SCOPE_ENV_NAMES.READ,
          SCOPE_ENV_NAMES.REGISTER,
        ].join(", "),
    );
  }

  return {
    source: {
      kind: "kubernetes-secret",
      name: secretName,
      namespace,
    },
    scopes,
  };
}

export async function resolveRuntimeScopeSource(): Promise<RuntimeScopeResolution> {
  if (getConfiguredSecretName()) {
    try {
      return await loadScopesFromKubernetesSecret();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        "[auth] unable to load scopes from Kubernetes Secret; falling back to environment detail=%s",
        detail,
      );
    }
  }

  return {
    source: { kind: "environment" },
    scopes: resolveScopes(),
  };
}
