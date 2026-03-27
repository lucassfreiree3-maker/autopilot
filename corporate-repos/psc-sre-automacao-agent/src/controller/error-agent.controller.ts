import { Get, Route, Tags, SuccessResponse } from "tsoa";
import { IErrorAgentExecution } from "../interface/IErrorAgentExecution.interface";

@Tags("Agent")
@Route("/agent")
export class ErrorAgentController {
  private static executions: IErrorAgentExecution[] = [];

  @Get("/errors")
  @SuccessResponse(
    "200",
    "Execuções de agent que falharam recuperadas com sucesso",
  )
  public async getErrorExecutions(): Promise<{
    errors: IErrorAgentExecution[];
  }> {
    const failedExecutions = ErrorAgentController.executions.filter(
      (e) => !e.success,
    );
    return { errors: failedExecutions };
  }

  public static addExecution(execution: IErrorAgentExecution): void {
    this.executions.push(execution);
    console.log(
      `Erro registrado: ${execution.functionName} em ${execution.namespace}`,
    );
  }
}

export default ErrorAgentController;
