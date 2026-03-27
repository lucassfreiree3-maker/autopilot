export type ComplianceStatus = "success" | "failed" | "error";

export interface JobFailure {
  check: string;
  reason: string;
}

export interface JobError {
  check: string;
  reason: string;
}

export interface IJobResult {
  compliance_status: ComplianceStatus;
  namespace: string;
  cluster_type: "origem" | "destino";
  timestamp: string;
  captured_data?: {
    nodeSelectors?: Record<string, Record<string, string>>;
    storageClasses?: Record<string, string>;
  };
  validation_data?: {
    validated_node_selectors?: {
      required: Record<string, Record<string, string>>;
      status: string;
    };
    validated_storage_classes?: {
      required: Record<string, string>;
      status: string;
    };
  };
  failures?: JobFailure[];
  errors?: JobError[];
}

export interface IMigrationResult {
  origem: IJobResult;
  destino: IJobResult | null;
}
