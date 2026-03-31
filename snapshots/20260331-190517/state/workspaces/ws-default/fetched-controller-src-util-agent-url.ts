export type AgentUrlResolveInput = {
  cluster?: string | null;
};

const SAFE_CLUSTER_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function normalizeCluster(cluster?: string | null): string | undefined {
  if (!cluster) return undefined;
  const c = String(cluster).trim();
  if (!c || !SAFE_CLUSTER_PATTERN.test(c)) return undefined;
  return encodeURIComponent(c);
}

function applyClusterTemplate(template: string, cluster: string): string {
  return template
    .replace(/\$\{cluster\}/g, cluster)
    .replace(/\{cluster\}/g, cluster)
    .replace(/\$\{placeholder\}/g, cluster)
    .replace(/\{placeholder\}/g, cluster);
}

export function validateAgentExecuteUrl(url: string): string | null {
  const raw = String(url || "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    if (parsed.username || parsed.password) {
      return null;
    }

    if (!/\/agent\/execute\/?$/.test(parsed.pathname)) {
      return null;
    }

    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveAgentExecuteUrl(
  input: AgentUrlResolveInput,
): string | null {
  const cluster = normalizeCluster(input.cluster);

  const fullTpl = String(process.env.AGENT_EXECUTE_URL_TEMPLATE || "").trim();
  const baseTpl = String(process.env.AGENT_BASE_URL_TEMPLATE || "").trim();
  const fullLegacy = String(process.env.AGENT_EXECUTE_URL || "").trim();
  const baseLegacy = String(process.env.AGENT_BASE_URL || "").trim();

  let url: string | null = null;

  if (fullTpl) {
    if (
      /\$\{cluster\}|\{cluster\}|\$\{placeholder\}|\{placeholder\}/.test(fullTpl) &&
      !cluster
    ) {
      return null;
    }
    url = cluster ? applyClusterTemplate(fullTpl, cluster) : fullTpl;
  } else if (baseTpl) {
    if (
      /\$\{cluster\}|\{cluster\}|\$\{placeholder\}|\{placeholder\}/.test(baseTpl) &&
      !cluster
    ) {
      return null;
    }
    const base = cluster ? applyClusterTemplate(baseTpl, cluster) : baseTpl;
    const b = base.endsWith("/") ? base.slice(0, -1) : base;
    url = `${b}/agent/execute`;
  } else if (fullLegacy) {
    url = fullLegacy;
  } else if (baseLegacy) {
    const b = baseLegacy.endsWith("/") ? baseLegacy.slice(0, -1) : baseLegacy;
    url = `${b}/agent/execute`;
  }

  if (!url) return null;
  return validateAgentExecuteUrl(url);
}

export function resolveAgentBaseUrl(cluster?: string | null): string | null {
  const c = normalizeCluster(cluster);
  const baseTpl = String(process.env.AGENT_BASE_URL_TEMPLATE || "").trim();
  const baseLegacy = String(process.env.AGENT_BASE_URL || "").trim();
  const fullTpl = String(process.env.AGENT_EXECUTE_URL_TEMPLATE || "").trim();
  const fullLegacy = String(process.env.AGENT_EXECUTE_URL || "").trim();

  const pick = baseTpl || baseLegacy || fullTpl || fullLegacy;
  if (!pick) return null;

  const value =
    c &&
    /\$\{cluster\}|\{cluster\}|\$\{placeholder\}|\{placeholder\}/.test(pick)
      ? applyClusterTemplate(pick, c)
      : pick;

  try {
    const u = new URL(value);
    return u.origin;
  } catch {
    return value;
  }
}
