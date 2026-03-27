export interface IErrorAgentExecution {
  id: string | number; // UUID da chamada
  functionName?: string;
  cluster?: string;
  namespace?: string;
  timestamp: Date;
  success: boolean;
}
