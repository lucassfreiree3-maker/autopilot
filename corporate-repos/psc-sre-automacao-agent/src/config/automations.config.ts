export interface HttpAutomation {
  type: "http";
  url: string;
  description: string;
}

export interface JobAutomation {
  type: "job";
  image: string;
  namespace: string;
  serviceAccount: string;
  ttlSecondsAfterFinished: number;
  timeout: number;
  description: string;
  envVars: Record<string, string>;
}

export interface CompositeJobAutomation {
  type: "composite-job";
  steps: [string, string]; // [origem, destino]
  description: string;
}

export type AutomationConfig =
  | HttpAutomation
  | JobAutomation
  | CompositeJobAutomation;

export const AUTOMATIONS: Record<string, AutomationConfig> = {
  get_pods: {
    type: "http",
    url:
      process.env.K8S_ANALYZER_URL ||
      "http://sre-k8s-namespace-analyze.psc.hm.bb.com.br/execute",
    description: "Lista pods de um namespace",
  },

  get_all_resources: {
    type: "http",
    url:
      process.env.K8S_ANALYZER_URL ||
      "http://sre-k8s-namespace-analyze.psc.hm.bb.com.br/execute",
    description: "Lista todos recursos de um namespace",
  },

  migration_origem: {
    type: "job",
    image:
      process.env.MIGRATION_IMAGE ||
      "docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-ns-migration-preflight:1.0.0",
    namespace: process.env.MIGRATION_NAMESPACE || "psc-sre-aut-agent",
    serviceAccount: process.env.MIGRATION_SERVICE_ACCOUNT || "sre-aut-agent-sa",
    ttlSecondsAfterFinished: 300,
    timeout: 600,
    description: "Valida cluster de origem para migração",
    envVars: {
      CLUSTER_DE_ORIGEM: "TRUE",
      CLUSTER_DE_DESTINO: "FALSE",
    },
  },

  migration_destino: {
    type: "job",
    image:
      process.env.MIGRATION_IMAGE ||
      "docker.binarios.intranet.bb.com.br/bb/psc/psc-sre-ns-migration-preflight:1.0.0",
    namespace: process.env.MIGRATION_NAMESPACE || "psc-sre-aut-agent",
    serviceAccount: process.env.MIGRATION_SERVICE_ACCOUNT || "sre-aut-agent-sa",
    ttlSecondsAfterFinished: 300,
    timeout: 600,
    description: "Valida cluster de destino para migração",
    envVars: {
      CLUSTER_DE_ORIGEM: "FALSE",
      CLUSTER_DE_DESTINO: "TRUE",
    },
  },

  migration: {
    type: "composite-job",
    steps: ["migration_origem", "migration_destino"],
    description: "Valida clusters de origem e destino para migração",
  },
};

export function getAutomation(functionName: string): AutomationConfig | null {
  return AUTOMATIONS[functionName] || null;
}

export function isValidAutomation(functionName: string): boolean {
  return functionName in AUTOMATIONS;
}

export function listAvailableAutomations(): string[] {
  return Object.keys(AUTOMATIONS);
}
