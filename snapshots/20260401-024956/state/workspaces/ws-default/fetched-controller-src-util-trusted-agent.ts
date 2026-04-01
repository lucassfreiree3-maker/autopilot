import { AgentsRepo } from "../repository/agentsRepo";
import { resolveAgentExecuteUrl } from "./agent-url";

type TrustedAgentInput = {
  cluster: string;
  namespace: string;
};

export function resolveTrustedRegisteredAgentExecuteUrl(
  input: TrustedAgentInput,
): string | null {
  const registeredAgent = AgentsRepo.getAgentByClusterAndNamespace(
    input.cluster,
    input.namespace,
  );
  if (!registeredAgent) return null;

  return resolveAgentExecuteUrl({ cluster: registeredAgent.Cluster });
}

export function resolveTrustedRegisteredAgentExecuteUrlByCluster(
  cluster: string,
): string | null {
  const registeredAgent = AgentsRepo.getAgentByCluster(cluster);
  if (!registeredAgent) return null;

  return resolveAgentExecuteUrl({ cluster: registeredAgent.Cluster });
}
