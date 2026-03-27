import { Get, Route, Tags, SuccessResponse } from "tsoa";
import { IAgent } from "../interface/IAgent.interface";
import { generateId } from "../util/utils";

@Tags("Agent")
@Route("/agent")
export class AgentController {
  public agent123: IAgent = {
    id: generateId(),
    version: "1.1.1",
    createdAt: new Date(),
    description:
      "SRE Automation Agent - Responsável por executar automações nos clusters Kubernetes",
    availableRoutes: [
      "POST /agent/execute - Executa automações nos clusters (requer token)",
      "GET /agent/info - Informações sobre o Agent",
      "GET /agent/errors - Lista execuções que falharam",
      "POST /register - Registra Agent no Controller",
    ],
    status: "online",
  };

  @Get("/info")
  @SuccessResponse("200", "Dados do agent recuperados com sucesso")
  public async getInfo(): Promise<{ summary: string; Agente: IAgent }> {
    const summary = `Agente ${this.agent123.id.substring(0, 8)}, funcionando na versão ${this.agent123.version}, criado em ${this.agent123.createdAt.toLocaleDateString("pt-BR")}

Funcionalidades disponíveis:
• Rota /execute -> Executa automações nos clusters Kubernetes
• Rota /error-agent -> Disponibiliza chamadas que tiveram erros  
• Rota /register -> Permite registro no Controller
• Rota /info-agent -> Informações sobre este Agent

Status: ${this.agent123.status.toUpperCase()}`;

    return {
      summary,
      Agente: this.agent123,
    };
  }
}

export default AgentController;
