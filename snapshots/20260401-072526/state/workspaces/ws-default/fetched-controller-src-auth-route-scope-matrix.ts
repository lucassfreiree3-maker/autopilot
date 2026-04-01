import type { ScopeCatalog } from "./scopes";

export type ScopeKey = keyof ScopeCatalog;

export type RouteScopeRequirement = {
  method: "GET" | "POST";
  path: string;
  auth:
    | "public"
    | "x-api-key"
    | "bearer-jwt"
    | "agent-callback-jwt"
    | "bearer-jwt-or-internal-origin";
  scopeKey?: ScopeKey;
  note: string;
};

export const ROUTE_SCOPE_MATRIX: RouteScopeRequirement[] = [
  {
    method: "GET",
    path: "/",
    auth: "public",
    note: "Resumo rapido do servico e mapa dos endpoints principais.",
  },
  {
    method: "POST",
    path: "/auth/token",
    auth: "x-api-key",
    note: "Emite JWT para as rotas protegidas.",
  },
  {
    method: "GET",
    path: "/auth/required-scopes",
    auth: "x-api-key",
    note: "Lista, para cada rota, qual token e qual scope sao exigidos no ambiente atual.",
  },
  {
    method: "GET",
    path: "/health",
    auth: "public",
    note: "Healthcheck do processo.",
  },
  {
    method: "GET",
    path: "/ready",
    auth: "public",
    note: "Readiness do servico.",
  },
  {
    method: "GET",
    path: "/metrics",
    auth: "public",
    note: "Metricas Prometheus.",
  },
  {
    method: "GET",
    path: "/agent/list",
    auth: "public",
    note: "Lista os Agents cadastrados no Controller.",
  },
  {
    method: "GET",
    path: "/agent/info",
    auth: "public",
    note: "Mostra metadados basicos do Controller.",
  },
  {
    method: "POST",
    path: "/agent/register",
    auth: "agent-callback-jwt",
    scopeKey: "REGISTER",
    note: "Cadastro do Agent no inventario do Controller.",
  },
  {
    method: "POST",
    path: "/agent/execute",
    auth: "bearer-jwt",
    scopeKey: "EXECUTE",
    note: "Dispara uma automacao diretamente em um Agent.",
  },
  {
    method: "GET",
    path: "/agent/execute",
    auth: "bearer-jwt",
    scopeKey: "READ",
    note: "Consulta status e logs de uma execucao por execId.",
  },
  {
    method: "POST",
    path: "/agent/execute/logs",
    auth: "agent-callback-jwt",
    scopeKey: "SEND",
    note: "Callback do Agent para publicar logs e mudancas de estado.",
  },
  {
    method: "GET",
    path: "/agent/errors",
    auth: "public",
    note: "Consulta linhas do arquivo local de erro/log.",
  },
  {
    method: "GET",
    path: "/logs/rotate",
    auth: "public",
    note: "Rotaciona logs locais e tenta enviar os arquivos para o bucket.",
  },
  {
    method: "POST",
    path: "/oas/sre-controller",
    auth: "bearer-jwt-or-internal-origin",
    scopeKey: "EXECUTE",
    note: "Entrada OAS/TechBB. Pode dispensar JWT apenas para origem interna autorizada.",
  },
  {
    method: "GET",
    path: "/oas/automations",
    auth: "bearer-jwt",
    scopeKey: "READ",
    note: "Lista automacoes disponiveis para integracao OAS.",
  },
  {
    method: "GET",
    path: "/oas/automations/{automation}",
    auth: "bearer-jwt",
    scopeKey: "READ",
    note: "Mostra metadados de uma automacao.",
  },
  {
    method: "POST",
    path: "/oas/automations/{automation}",
    auth: "bearer-jwt",
    scopeKey: "EXECUTE",
    note: "Executa a automacao legada selecionada.",
  },
];
