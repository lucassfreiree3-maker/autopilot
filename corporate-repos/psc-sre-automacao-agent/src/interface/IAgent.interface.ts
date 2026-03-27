export interface IAgent {
  id: string;
  version: string;
  createdAt: Date;
  description: string;
  availableRoutes: string[];
  status: string;
}

export interface IAgentRegisterData {
  namespace: string;
  cluster: string;
  environment: string;
  DataRegistro?: Date;
}
