export interface IExecutionRequest {
  execId: string;
  namespace: string;
  cluster: string;
  function: string;
  image?: string;
  envs?: Record<string, unknown>;
}
