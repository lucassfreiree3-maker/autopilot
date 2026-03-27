# PSC SRE AutomaÃ§Ã£o â€” README Completo (Controller + Agent)

Este documento descreve, de ponta a ponta, o funcionamento dos dois serviÃ§os:

- **psc-sre-automacao-controller** (**Controller**) â€” API central, exposta via Ingress.
- **psc-sre-automacao-agent** (**Agent**) â€” executor de automaÃ§Ãµes, normalmente interno por cluster/ambiente.

Inclui: arquitetura, recursos Kubernetes, autenticaÃ§Ã£o (Token A e Token B), headers de correlaÃ§Ã£o, **todas as rotas**, payloads/retornos, fluxos **async** e **sync**, persistÃªncia (SQLite + trace), rotaÃ§Ã£o/upload OSS/S3 e observabilidade (/metrics).

---

## ConvenÃ§Ãµes e termos

- **execId**: UUID gerado pelo Controller para identificar uma execuÃ§Ã£o.
- **requestId**: valor de correlaÃ§Ã£o, propagado em `x-request-id`.
- **Token A**: JWT para **Cliente â†’ Controller** (e encaminhado pelo Controller ao Agent).
- **Token B**: JWT para **Agent â†’ Controller** (callback de logs/status).
- **Status** (rÃ³tulos consolidados): `PENDING | RUNNING | DONE | ERROR`.
- **entries**: lista de eventos/logs do Agent para o Controller.

---

## 1. VisÃ£o geral da arquitetura

### 1.1 Componentes

#### Controller (psc-sre-automacao-controller)
Responsabilidades principais:

1. **AutenticaÃ§Ã£o do cliente** via API key e emissÃ£o de JWT (**Token A**).
2. **OrquestraÃ§Ã£o**: recebe requisiÃ§Ã£o de execuÃ§Ã£o, **gera execId**, encaminha ao Agent.
3. **Callback**: recebe logs/status do Agent via **Token B**.
4. **ConsolidaÃ§Ã£o**: calcula o status atual/final com base nos logs persistidos.
5. **PersistÃªncia e auditoria**:
   - cadastro de Agents em **SQLite**
   - logs em **arquivo de trace**
   - buffer em memÃ³ria para consulta rÃ¡pida
6. **OperaÃ§Ã£o**:
   - rotaÃ§Ã£o de logs via `/logs/rotate` (CronJob)
   - upload para **OSS/S3** (se configurado)
7. **Observabilidade**: mÃ©tricas Prometheus em `/metrics` e Swagger opcional.

#### Agent (psc-sre-automacao-agent)
Responsabilidades principais:

1. Recebe o comando do Controller em `POST /agent/execute` (validando Token A).
2. Valida o payload (campos permitidos) e a funÃ§Ã£o solicitada (whitelist).
3. Executa automaÃ§Ãµes chamando serviÃ§o interno (ex.: `sre-k8s-namespace-analyze ... /execute`).
4. Gera **Token B** para callback e envia logs/status ao Controller.
5. (Opcional/implementaÃ§Ã£o atual) expÃµe endpoints de diagnÃ³stico e mÃ©tricas.

---

## 2. Kubernetes / Infra

> A nomenclatura exata pode variar por chart/ambiente; abaixo estÃ£o os recursos esperados e suas funÃ§Ãµes.

### 2.1 Controller

**ExposiÃ§Ã£o**
- **DNSIngress**: gestÃ£o de DNS do host do Controller.
- **Ingress (nginx)**: roteia host do Controller para o Service.
- **Service (ClusterIP)**: porta `80` apontando para `targetPort: 3000` no Pod.

**ExecuÃ§Ã£o**
- **Deployment**: executa o container Node do Controller.
- **ReplicaSet/Pods**: gerenciados pelo Deployment.
- **PVC (Data)**: persistÃªncia do SQLite (ex.: `psc_agents.db`).
- **PVC (Logs)**: persistÃªncia dos arquivos de trace (ex.: `automation-trace.log`, rotacionados).

**RotaÃ§Ã£o**
- **CronJob**: chama `GET /logs/rotate` em periodicidade definida (ex.: diÃ¡ria).

**Observabilidade**
- **ServiceMonitor**: scrape do endpoint `/metrics` (ex.: interval 10s).

**RBAC**
- **Role/RoleBinding**: permissÃµes mÃ­nimas para o Controller e/ou CronJob quando necessÃ¡rio.

### 2.2 Agent

**ExecuÃ§Ã£o**
- **Deployment**: executa o Agent.
- **Service (ClusterIP)**: expÃµe a porta interna do Agent (HTTP).
- **(Opcional) ServiceMonitor**: scrape `/metrics` do Agent.

---

## 3. AutenticaÃ§Ã£o e seguranÃ§a

### 3.1 Token A â€” Cliente â†’ Controller (e Controller â†’ Agent)

**Objetivo**
- Autoriza o cliente a iniciar execuÃ§Ãµes e consultar status no Controller.
- O Controller **encaminha** o mesmo `Authorization: Bearer <Token A>` ao Agent durante o start da execuÃ§Ã£o.

**EmissÃ£o**
- Endpoint: `POST /auth/token`
- ValidaÃ§Ã£o do solicitante (API Key):
  - `x-api-key: <AUTH_API_KEY>` **ou**
  - `Authorization: ApiKey <AUTH_API_KEY>`

**Scopes (regra estrita apÃ³s as alteraÃ§Ãµes)**
- O body deve conter **exatamente um** dos campos: `scope` **ou** `scopes`.
- `scope` ou `scopes` Ã© obrigatÃ³rio.
- Os valores permitidos de scope nÃ£o sÃ£o documentados no repositÃ³rio. Eles sÃ£o definidos em runtime por variÃ¡veis de ambiente (recomendado: Kubernetes Secret) e validados pelo Controller.
- Se houver scope invÃ¡lido â†’ `400 Invalid scopes`.
- Se o scope for vÃ¡lido, mas nÃ£o permitido para a API key â†’ `403 Scopes not allowed for API key`.
- NÃ£o existe mais fallback para scopes em cÃ³digo.
copes default quando `scope/scopes` nÃ£o Ã© informado.

**Claims (modelo esperado)**
- `typ`: `client`
- `iss`: `psc-sre-automacao-controller`
- `aud`: `psc-sre-automacao-agent`
- `exp`: curto (ex.: 5m)
- `scope`: array de scopes concedidos (exatamente os solicitados e permitidos)

**Uso**
```http
Authorization: Bearer <TOKEN_A>
```

### 3.2 Token B â€” Agent â†’ Controller (callback)

**Objetivo**
- Autoriza o Agent a publicar logs/status no Controller sem â€œimpersonarâ€ o cliente.

**Claims obrigatÃ³rias (recomendado e implementado no fluxo correto)**
- `iss`: `psc-sre-automacao-agent`
- `aud`: `psc-sre-automacao-controller`
- `exp`: curto (ex.: 5m)
- `execId`: obrigatÃ³rio (claim)

**Uso**
```http
Authorization: Bearer <TOKEN_B>
```

### 3.3 ValidaÃ§Ã£o adicional de seguranÃ§a: `execId mismatch`

No callback do Agent (`POST /agent/execute/logs`):

- `execId` do **token** deve ser igual ao `execId` do **body**.
- Se nÃ£o bater: `403 Forbidden` com `detail: "execId mismatch"`.

Isso impede que um Agent (ou um invasor com token) injete logs em outro execId.

---

## 4. Headers de correlaÃ§Ã£o

### 4.1 `x-request-id` (requestId)

No Controller:
- Reutiliza `x-request-id` se recebido do cliente.
- Se nÃ£o existir, gera UUID.
- Propaga `x-request-id` para o Agent.

Boas prÃ¡ticas:
- Logar `x-request-id` em todas as camadas.
- Incluir `reqId` nos `entries` quando aplicÃ¡vel.

### 4.2 `x-exec-id` (execId)

- O Controller sempre gera `execId` (UUID).
- Propaga ao Agent:
  - Header: `x-exec-id: <execId>`
  - Body: inclui `execId` (o Controller injeta no payload encaminhado).

---

## 5. API do Controller â€” rotas, payloads e retornos

> Base URL: `https://<host-controller>`

### 5.1 `POST /auth/token`

Emite **Token A** (cliente).

**Headers**
- `x-api-key: <AUTH_API_KEY>`  
  **ou**
- `Authorization: ApiKey <AUTH_API_KEY>`

**Body (obrigatÃ³rio â€“ regra estrita)**
- Aceita **apenas um** dos campos: `scope` **ou** `scopes`.
- `scope/scopes` pode ser `string` ou `string[]` (internamente normalizado para array).
- Scopes vÃ¡lidos: definidos em runtime (env/Secret) e validados pelo Controller.

Exemplo (recomendado):
```json
{
  "subject": "user-or-service",
  "scope": ["<scope_1>", "<scope_2>"],
  "expiresIn": "5m"
}
```

Exemplo usando `scopes` (alias):
```json
{
  "subject": "user-or-service",
  "scopes": ["<scope_1>", "<scope_2>"]
}
```

**Resposta (200)**
```json
{
  "token": "<TOKEN_A>",
  "tokenType": "Bearer",
  "expiresIn": "5m",
  "howToUse": "Authorization: Bearer <token>"
}
```

**Erros comuns**
- `401`: API key invÃ¡lida.
- `400`: payload invÃ¡lido:
  - ausente `scope/scopes`
  - `scope` e `scopes` enviados juntos
  - scopes invÃ¡lidos (ex.: typo)
- `403`: scopes vÃ¡lidos, porÃ©m nÃ£o permitidos para a API key.
- `500`: falha ao assinar token.


#### Como chamar no Insomnia

**Request**
- Method: `POST`
- URL: `http(s)://<host-controller>/auth/token`

**Headers**
- `Content-Type: application/json`
- `x-api-key: <AUTH_API_KEY>` *(obrigatÃ³rio)*

**Body (JSON)**
- VocÃª pode usar `scope` **ou** `scopes` (apenas um).
- Use `scope` como padrÃ£o (recomendado).

Exemplo (cliente pode executar e consultar status):
```json
{
  "subject": "svc-client",
  "scope": ["<scope>", "<scope>"],
  "expiresIn": "5m"
}
```

Exemplo mÃ­nimo (apenas executar):
```json
{
  "scopes": ["<scope>"]
}
```

**Por que esses campos**
- `x-api-key`: autentica o solicitante para emissÃ£o de JWT.
- `scope/scopes`: define os privilÃ©gios do Token A (aplicados por rota via middleware).
- `expiresIn`: opcional; controla a validade do token (curta por padrÃ£o).

---

### 5.2 `GET /agent/info`

Health/info simples do Controller.

**Resposta (200)**
```json
{ "ok": true, "success": true }
```


#### Como chamar no Insomnia

**Importante**
- A rota está registrada no router em `GET /agent/info`.
- Retorna metadados básicos do Controller, `hostname`, `timezone` e timestamp atual em `America/Sao_Paulo`.

**Alternativas**
- Para descobrir endpoints e versão do serviço: `GET /`
- Para listar agents registrados: `GET /agent/list`
---

### 5.3 `POST /agent/register`

Registro de Agent no Controller (persistido em SQLite).

**Auth**
- Requer **Token B** (agent-callback).
- Scope exigido: `<scope>`.

**Body**
```json
{
  "namespace": "psc-sre-automacao-agent",
  "cluster": "k8shmlbb111b",
  "environment": "hml"
}
```

**Regras**
- `environment` deve estar em `{ desenv, hml, prod }`.

**Resposta (201)**
```json
{
  "success": true,
  "ok": true,
  "message": "Agent created.",
  "data": {
    "namespace": "psc-sre-automacao-agent",
    "cluster": "k8shmlbb111b",
    "environment": "hml"
  }
}
```

**Erro (400)**
```json
{
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid payload. Required fields: namespace (string), cluster (string), environment in {desenv,hml,prod}.",
  "instance": "/agent/register"
}
```


#### Como chamar no Insomnia

**Request**
- Method: `POST`
- URL: `http(s)://<host-controller>/agent/register`

**Headers**
- `Content-Type: application/json`
- `Authorization: Bearer <TOKEN_B>` *(obrigatÃ³rio)*

**Body (JSON)**
```json
{
  "namespace": "psc-sre-automacao-agent",
  "cluster": "k8shmlbb111b",
  "environment": "hml"
}
```

**Por que esses campos**
- `TOKEN_B` (agent-callback): permite que apenas o Agent autorizado registre/atualize sua presenÃ§a.
- `scope <scope>`: garante que o token usado Ã© especÃ­fico para registro de agent.
- `environment`: padroniza o ambiente para roteamento/observabilidade e filtros (`desenv|hml|prod`).

---

### 5.4 `GET /agent/list`

Lista Agents cadastrados.

**Resposta (200)**
```json
{
  "ok": true,
  "success": true,
  "data": [
    { "Namespace": "psc-sre-automacao-agent", "Cluster": "k8shmlbb111b", "environment": "hml" }
  ]
}
```


#### Como chamar no Insomnia

**Request**
- Method: `GET`
- URL: `http(s)://<host-controller>/agent/list`

**Headers**
- NÃ£o exige JWT no cÃ³digo atual (rota pÃºblica).
- Se o seu ambiente exigir proteÃ§Ã£o por gateway/rede, aplique as credenciais conforme a polÃ­tica local.

**Por que essa rota existe**
- Permite consultar quais Agents estÃ£o registrados (fonte: SQLite), Ãºtil para troubleshooting e validaÃ§Ã£o de cadastro.

---

### 5.5 `POST /agent/execute?mode=async|sync`

Inicia uma execuÃ§Ã£o.

**Auth**
- Requer **Token A** (client).
- Scope exigido: `<scope>`.
```http
Authorization: Bearer <TOKEN_A>
```

**Query**
- `mode=async` (default)
- `mode=sync`

**Body (mÃ­nimo)**
```json
{
  "cluster": "k8shmlbb111b",
  "namespace": "default",
  "function": "analyze_namespace"
}
```

**Comportamento do Controller**
1. Gera `execId` (UUID).
2. Resolve a URL do Agent a partir de configuraÃ§Ã£o:
   - `AGENT_EXECUTE_URL` / `AGENT_BASE_URL`
   - ou templates `AGENT_EXECUTE_URL_TEMPLATE` / `AGENT_BASE_URL_TEMPLATE` com placeholder `${cluster}`.
3. Encaminha a chamada ao Agent:
   - `x-request-id`
   - `x-exec-id`
   - `authorization` (repasse do Token A recebido do cliente)
   - Body encaminhado: `{ ...bodyOriginal, execId }`

**Resposta â€” async (202, recomendado para clientes)**
```json
{
  "ok": true,
  "execId": "uuid",
  "mode": "async",
  "status": "RUNNING",
  "message": "Request accepted. The Agent will process this execution asynchronously."
}
```

**Resposta â€” sync (200)**
O Controller dispara e entÃ£o **aguarda** atÃ©:
- receber status final `DONE`/`ERROR`, ou
- atingir timeout (ex.: 60s).

Retorna um snapshot equivalente ao `GET /agent/execute?execId=...`, acrescido de flags de sync:
```json
{
  "ok": true,
  "mode": "sync",
  "execId": "uuid",
  "status": "DONE",
  "statusLabel": "Done",
  "finished": true,
  "lastUpdate": "2026-01-14T12:00:10Z",
  "count": 10,
  "entries": [],
  "timedOut": false,
  "elapsedMs": 8123
}
```

Timeout (retorno parcial):
```json
{
  "ok": true,
  "mode": "sync",
  "execId": "uuid",
  "status": "RUNNING",
  "statusLabel": "Running",
  "finished": false,
  "lastUpdate": "2026-01-14T12:00:05Z",
  "count": 4,
  "entries": [],
  "timedOut": true,
  "timeoutMs": 60000
}
```


#### Como chamar no Insomnia

**Request**
- Method: `POST`
- URL: `http(s)://<host-controller>/agent/execute?mode=async`
  - Para modo sÃ­ncrono: `mode=sync`

**Headers**
- `Content-Type: application/json`
- `Authorization: Bearer <TOKEN_A>` *(obrigatÃ³rio)*
- (opcional) `x-request-id: req-insomnia-001` *(recomendado para rastreabilidade)*

**Body (JSON)**
```json
{
  "cluster": "aks-prd-01",
  "namespace": "bridge-api",
  "function": "restart-pod"
}
```

**Por que esses campos**
- `TOKEN_A` (client) com scope `<scope>`: autoriza disparo de automaÃ§Ã£o.
- `cluster/namespace`: direcionam qual Agent/ambiente executarÃ¡ a aÃ§Ã£o.
- `function`: identifica a automaÃ§Ã£o a ser executada no Agent.
- `mode=sync`: o Controller aguarda o status final (`DONE`/`ERROR`) ou retorna `504` por timeout.
- `mode=async`: o Controller retorna imediatamente um `execId` para acompanhamento via `GET /agent/execute?execId=...`.

---

### 5.6 `POST /agent/execute/logs` (callback do Agent)

Recebe logs/status do Agent e anexa ao trace.

**Auth**
- Requer **Token B** (agent-callback).
- Scope exigido: `<scope>`.
- Valida `execId` do token vs `execId` do body.

**Headers**
```http
Authorization: Bearer <TOKEN_B>
Content-Type: application/json
```

**Body**
```json
{
  "execId": "uuid",
  "entries": [
    {
      "ts": "2026-01-14T12:00:00Z",
      "status": "RUNNING",
      "level": "info",
      "message": "ExecuÃ§Ã£o iniciada pelo Agent",
      "step": 1,
      "reqId": "x-request-id"
    },
    {
      "ts": "2026-01-14T12:00:10Z",
      "status": "DONE",
      "level": "info",
      "message": "ExecuÃ§Ã£o finalizada com sucesso",
      "step": 2
    }
  ],
  "source": "agent",
  "from": "agent"
}
```

**Regras**
- `execId` obrigatÃ³rio.
- `entries` obrigatÃ³rio e deve ter pelo menos 1 item.
- `status` aceito: `PENDING | RUNNING | DONE | ERROR` (case-insensitive; normalizado).
- `source`/`from` ajudam auditoria e troubleshooting.

**Resposta (202)**
```json
{
  "ok": true,
  "received": 2,
  "execId": "uuid",
  "from": "agent",
  "source": "agent"
}
```

**Erro (403)**
```json
{ "ok": false, "title": "Forbidden", "status": 403, "detail": "execId mismatch" }
```


#### Como chamar no Insomnia

**Request**
- Method: `POST`
- URL: `http(s)://<host-controller>/agent/execute/logs`

**Headers**
- `Content-Type: application/json`
- `Authorization: Bearer <TOKEN_B>` *(obrigatÃ³rio)*

**Body (JSON)**
- Deve conter `execId` e a lista de entradas de log/status conforme o contrato do Agent.

**Por que esses campos**
- `TOKEN_B` (agent-callback) com scope `<scope>`: evita que clientes publiquem logs.
- O Controller valida `execId` do token vs `execId` do body para impedir spoofing de execuÃ§Ã£o.

---

### 5.7 `GET /agent/execute?execId=<uuid>`

Consulta status/logs consolidados por execId.

**Auth**
- Requer **Token A** (client).
- Scope exigido: `<scope>`.
```http
Authorization: Bearer <TOKEN_A>
```

**Nota de contrato**
- O parÃ¢metro de consulta obrigatÃ³rio Ã© `execId` (ex.: `?execId=<uuid>`). Se for enviado `uuid` no lugar de `execId`, o Controller retorna `400`.

**Resposta (200)**
```json
{
  "ok": true,
  "execId": "uuid",
  "status": "RUNNING",
  "statusLabel": "Running",
  "finished": false,
  "lastUpdate": "2026-01-14T12:00:05Z",
  "count": 4,
  "entries": []
}
```


#### Como chamar no Insomnia

**Request**
- Method: `GET`
- URL: `http(s)://<host-controller>/agent/execute?execId=<uuid>`

**Query Params**
- `execId` *(obrigatÃ³rio)*: identificador da execuÃ§Ã£o retornado no `POST /agent/execute`.
- (opcional) `day`: `YYYY-MM-DD` (BRT)
- (opcional) `dateFrom`: ISO 8601
- (opcional) `dateTo`: ISO 8601
- (opcional) `limit`: inteiro

**Headers**
- `Authorization: Bearer <TOKEN_A>` *(obrigatÃ³rio)*

**Por que esses campos**
- `TOKEN_A` com scope `<scope>`: permite consultar status/entradas de execuÃ§Ã£o.
- `execId` Ã© o identificador oficial do Controller. Enviar `uuid` no lugar de `execId` resulta em `400`.

---

### 5.8 `GET /agent/errors?execId=&startDate=&endDate=`

Consulta erros/trechos filtrados dos logs (por execId e/ou intervalo).

**Query**
- `execId` (opcional)
- `startDate` (opcional)
- `endDate` (opcional)

**Resposta**
- Estrutura depende do agregador (`findLogs`), tipicamente lista/objeto com ocorrÃªncias.


#### Como chamar no Insomnia

**Request**
- Method: `GET`
- URL: `http(s)://<host-controller>/agent/errors`

**Query Params**
- `execId` (opcional): filtra por execuÃ§Ã£o
- `startDate` (opcional): ISO 8601
- `endDate` (opcional): ISO 8601

**Headers**
- Se o seu ambiente exigir proteÃ§Ã£o por JWT/gateway, utilize Token A com `<scope>`.
- No cÃ³digo atual, esta rota nÃ£o aplica `requireJwt`.

**Por que essa rota existe**
- Agrega e expÃµe erros associados Ã s execuÃ§Ãµes para facilitar troubleshooting e auditoria.

---

### 5.9 `GET /logs/rotate`

Rotaciona arquivo(s) de trace e dispara comportamento de upload conforme configuraÃ§Ã£o.

- Chamado pelo CronJob.
- Normalmente retorna JSON de sucesso/estatÃ­sticas.
- Retorna estatísticas de rotação, limpeza e upload.
- Os arquivos rotacionados e as chaves no bucket usam data em formato Brasil (`DD-MM-YYYY`).
- Quando houver falha real de upload para o bucket, a rota responde com erro para não mascarar problema operacional.


#### Como chamar no Insomnia

**Request**
- Method: `GET`
- URL: `http(s)://<host-controller>/logs/rotate`

**Headers**
- NÃ£o exige JWT no cÃ³digo atual.

**Por que essa rota existe**
- Aciona rotaÃ§Ã£o/limpeza de logs para controle de volume e manutenÃ§Ã£o operacional.
- Recomenda-se restringir por rede/gateway (rota operacional).

---

### 5.10 `GET /metrics`

MÃ©tricas para Prometheus (Controller).


#### Como chamar no Insomnia

**Request**
- Method: `GET`
- URL: `http(s)://<host-controller>/metrics`

**Headers**
- NÃ£o exige JWT no cÃ³digo atual.

**Por que essa rota existe**
- Endpoint Prometheus: expÃµe mÃ©tricas HTTP e internas para observabilidade.
- Recomenda-se limitar acesso por rede (ex.: apenas Prometheus).

---


### 5.11 `GET /health`

Healthcheck simples do serviÃ§o.

**Resposta (200)**
```json
{ "status": "UP" }
```

#### Como chamar no Insomnia

**Request**
- Method: `GET`
- URL: `http(s)://<host-controller>/health`

**Headers**
- Nenhum obrigatÃ³rio.

**Por que essa rota existe**
- Usada por probes (liveness) e validaÃ§Ãµes simples de disponibilidade.

---

### 5.12 `GET /ready`

Readiness check do serviÃ§o.

**Resposta (200)**
```json
{ "status": "UP" }
```

#### Como chamar no Insomnia

**Request**
- Method: `GET`
- URL: `http(s)://<host-controller>/ready`

**Headers**
- Nenhum obrigatÃ³rio.

**Por que essa rota existe**
- Usada por probes (readiness) e validaÃ§Ãµes de prontidÃ£o do serviÃ§o.

---

### 5.13 `GET /`

Retorna informaÃ§Ãµes do serviÃ§o (nome, versÃ£o) e um resumo de endpoints.

**Resposta (200)**
```json
{
  "ok": true,
  "service": "psc-sre-automacao-controller",
  "version": "2.2.6",
  "message": "Server online"
}
```

#### Como chamar no Insomnia

**Request**
- Method: `GET`
- URL: `http(s)://<host-controller>/`

**Headers**
- Nenhum obrigatÃ³rio.

**Por que essa rota existe**
- Facilita troubleshooting e verificaÃ§Ã£o rÃ¡pida de versÃ£o/estado do Controller.


## 6. API do Agent â€” rotas, payloads e retornos

> Base URL interna tÃ­pica: `http://<service-agent>:<port>`

### 6.1 `POST /agent/execute`

Executa uma automaÃ§Ã£o.

**Auth**
- Valida JWT recebido no header `Authorization: Bearer ...`.
- Middleware no Agent valida: assinatura + expiraÃ§Ã£o + `iss/aud` (Token A emitido pelo Controller).

**Body**
O Agent aceita apenas estes campos:
- `execId` (obrigatÃ³rio, fornecido pelo Controller)
- `namespace`
- `cluster`
- `function`

Exemplo:
```json
{
  "execId": "uuid",
  "cluster": "k8shmlbb111b",
  "namespace": "default",
  "function": "analyze_namespace"
}
```

**RejeiÃ§Ã£o de campos extras**
Se o payload contiver chaves alÃ©m das permitidas, o Agent rejeita (com mensagem indicando chaves inesperadas).

**Resposta (200)**
A resposta depende da implementaÃ§Ã£o do Agent; tipicamente confirma recebimento e/ou retorna um corpo com status.

---

### 6.2 IntegraÃ§Ã£o do Agent com automaÃ§Ã£o interna

O Agent chama serviÃ§o interno (exemplo observado no cÃ³digo):

- `POST http://sre-k8s-namespace-analyze.psc.<env>.bb.com.br/execute`

**Payload enviado**
```json
{
  "namespace": "default",
  "function": "analyze_namespace"
}
```

**Tratamento**
- Se `response.ok`: trata o retorno (text/JSON) e envia logs `DONE`.
- Se falhar: envia logs `ERROR` e registra no controlador de erros do Agent.

---

### 6.3 `POST /agent/execute/logs` (no Agent)

Este endpoint existe no Agent como armazenamento/diagnÃ³stico local (memÃ³ria), separado do callback para o Controller.

**Body**
```json
{
  "execId": "uuid",
  "entries": [ { "ts": "...", "status": "RUNNING", "message": "..." } ]
}
```

---

### 6.4 `GET /agent/execute/:execId` (no Agent)

Consulta logs armazenados localmente no Agent (memÃ³ria), para diagnÃ³stico.

---

### 6.5 `GET /agent/info`

Info/diagnÃ³stico do Agent.

---

### 6.6 `GET /agent/errors`

Retorna erros registrados pelo Agent.

---

### 6.7 `POST /register`

Endpoint do Agent que pode repassar registro ao Controller (fluxo alternativo/auxiliar).

---

### 6.8 `GET /metrics`

MÃ©tricas Prometheus do Agent (quando habilitado).

---

### 6.9 `GET /`

Root endpoint do Agent (sanity).

---

### 6.10 `GET /create-cronjob`

Rota auxiliar (existente no Agent), finalidade depende do controlador associado.

---

## 7. Fluxos fim-a-fim

### 7.1 Fluxo completo â€” async (recomendado)

1) Cliente solicita Token A:
- `POST /auth/token` com API key
- Recebe `TOKEN_A`

2) Cliente inicia execuÃ§Ã£o:
- `POST /agent/execute?mode=async`
- `Authorization: Bearer <TOKEN_A>`
- Body `{ cluster, namespace, function }`

3) Controller:
- valida Token A
- gera `execId`
- encaminha para Agent com `x-request-id`, `x-exec-id`, `Authorization` e body com `execId`

4) Agent:
- valida Token A (`iss/aud`)
- executa automaÃ§Ã£o interna
- gera Token B por `execId`
- envia callbacks para `POST /agent/execute/logs` no Controller com `entries`

5) Cliente consulta:
- `GET /agent/execute?execId=<execId>` (Token A)
- obtÃ©m status consolidado e `entries` atuais/finais

---

### 7.2 Fluxo completo â€” sync

1) Cliente chama:
- `POST /agent/execute?mode=sync` (Token A)

2) Controller:
- dispara execuÃ§Ã£o no Agent
- aguarda status final consultando snapshot interno por `execId` atÃ© timeout

3) Retorno:
- se finaliza dentro do limite: retorna snapshot com `DONE`/`ERROR`
- se timeout: retorna snapshot parcial com `timedOut=true`

---

## 8. PersistÃªncia, logs e consolidaÃ§Ã£o de status

### 8.1 Onde cada coisa fica

- **SQLite**: Agents cadastrados (`/agent/register`, `/agent/list`)
- **MemÃ³ria (Controller)**: buffer de `entries` por `execId` para consulta rÃ¡pida.
- **Arquivo de trace (Controller)**: persistÃªncia principal dos logs (auditÃ¡vel).
- **OSS/S3 (opcional)**: retenÃ§Ã£o/histÃ³rico apÃ³s rotaÃ§Ã£o.

### 8.2 ConsolidaÃ§Ã£o do status (Controller)

O status final Ã© derivado dos `entries`:

1. Se existir `ERROR` em qualquer evento â†’ `ERROR`.
2. SenÃ£o, se existir `DONE` â†’ `DONE`.
3. SenÃ£o, se existir `RUNNING` â†’ `RUNNING`.
4. Caso contrÃ¡rio â†’ `PENDING`.

---

## 9. ConfiguraÃ§Ã£o (env vars) â€” principais chaves

### 9.1 Controller (principais)

**AutenticaÃ§Ã£o**
- `AUTH_API_KEYS_SCOPES` (recomendado): mapa de API keys para scopes permitidos (ex.: `keyA=<scopes_permitidos>;keyB=<scopes_permitidos>`).
- `AUTH_API_KEYS_JSON` (alternativo): mapa em JSON para API keys e seus scopes permitidos.
- `AUTH_API_KEY` (legado): API key Ãºnica (use apenas se nÃ£o houver necessidade de escopos por chave).
- `JWT_SECRET` (ou `JWT_PRIVATE_KEY`): assinatura/verificaÃ§Ã£o JWT.
- `JWT_ISSUER`: `psc-sre-automacao-controller`
- `JWT_AUDIENCE`: `psc-sre-automacao-agent`

**IntegraÃ§Ã£o com Agent**
- `AGENT_EXECUTE_URL` ou `AGENT_BASE_URL`
- `AGENT_EXECUTE_URL_TEMPLATE` ou `AGENT_BASE_URL_TEMPLATE` (com `${cluster}`)

**Logs / OSS**
- `OSS_BUCKET`, `OSS_ENDPOINT`, `AWS_REGION`
- Aliases legados aceitos: `TRACE_S3_BUCKET`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_CA_BUNDLE`, `S3_INSECURE_TLS`
- Prefixo opcional para traces no bucket: `TRACE_S3_PREFIX`
- `OSS_ACCESS_KEY_FILE`, `OSS_SECRET_KEY_FILE`
- `OSS_FORCE_PATH_STYLE` (quando necessÃ¡rio)
- `TRACE_DEBUG` (debug de trace)

### 9.2 Agent (principais)

- `JWT_SECRET`: valida Token A (do Controller).
- `JWT_ISSUER`: esperado `psc-sre-automacao-controller`.
- `JWT_AUDIENCE`: esperado `psc-sre-automacao-agent`.
- `NAMESPACE`, `CLUSTER_NAME`, `ENVIRONMENT`: usados no auto-registro no Controller.

---

## 10. Observabilidade

### 10.1 Prometheus
- Controller: `GET /metrics`
- Agent: `GET /metrics` (quando habilitado)

### 10.2 CorrelaÃ§Ã£o
- Propagar sempre:
  - `x-request-id`
  - `x-exec-id`

---

## 11. Checklist de validaÃ§Ã£o operacional

- [ ] Controller emite Token A apenas com API key vÃ¡lida.
- [ ] Controller encaminha `Authorization`, `x-request-id`, `x-exec-id` ao Agent.
- [ ] Agent valida Token A (`iss/aud/exp/signature`).
- [ ] Agent gera Token B com `execId` e envia no callback.
- [ ] Controller valida Token B (`iss/aud/exp/signature`) + `execId mismatch`.
- [ ] `mode=async` retorna `202` com `execId`.
- [ ] `mode=sync` retorna snapshot final ou parcial com `timedOut`.
- [ ] `/logs/rotate` Ã© chamado pelo CronJob e arquivos sÃ£o rotacionados.
- [ ] `/metrics` estÃ¡ sendo scraped pelo ServiceMonitor.

---

## 12. Exemplos rÃ¡pidos (curl)

### 12.1 Emitir Token A
```bash
curl -sS -X POST "https://<host-controller>/auth/token" \
  -H "x-api-key: <AUTH_API_KEY>" \
  -H "content-type: application/json" \
  -d '{"subject":"svc-client","scope":["<scope>","<scope>"],"expiresIn":"5m"}'
```

### 12.2 Start async
```bash
curl -sS -X POST "https://<host-controller>/agent/execute?mode=async" \
  -H "Authorization: Bearer <TOKEN_A>" \
  -H "content-type: application/json" \
  -d '{"cluster":"k8shmlbb111b","namespace":"default","function":"analyze_namespace"}'
```

### 12.3 Consultar status
```bash
curl -sS "https://<host-controller>/agent/execute?execId=<execId>" \
  -H "Authorization: Bearer <TOKEN_A>"
```

### 12.4 Callback do Agent (exemplo)
```bash
curl -sS -X POST "https://<host-controller>/agent/execute/logs" \
  -H "Authorization: Bearer <TOKEN_B>" \
  -H "content-type: application/json" \
  -d '{"execId":"<execId>","entries":[{"ts":"2026-01-14T12:00:00Z","status":"RUNNING","message":"Starting"}],"source":"agent","from":"agent"}'
```

---

## 13. Notas finais

- **Token B** Ã© a separaÃ§Ã£o correta entre identidade do cliente e do Agent.
- `execId` Ã© o pivÃ´ de auditoria: cada log/status deve carregar e ser validado por ele.
- Recomenda-se manter `exp` curto e rotacionar segredos conforme polÃ­tica do ambiente.

## Endpoints de IntegraÃ§Ã£o com Portal OAS

O Controller expÃµe trÃªs novos endpoints para integraÃ§Ã£o com o Portal OAS, permitindo descoberta e execuÃ§Ã£o de automaÃ§Ãµes de forma dinÃ¢mica.

### AutenticaÃ§Ã£o

Todos os endpoints OAS exigem autenticaÃ§Ã£o via Bearer Token (JWT) gerado em `/auth/token`.

**Scopes necessÃ¡rios:**
- `GET /oas/automations` â†’ `READ_STATUS`
- `GET /oas/automations/{automation}` â†’ `READ_STATUS`
- `POST /oas/automations/{automation}` â†’ `EXECUTE_AUTOMATION`

---

### GET /oas/automations

Lista todas as automaÃ§Ãµes disponÃ­veis no Controller.

**AutenticaÃ§Ã£o:** Bearer Token (scope: `READ_STATUS`)

**Request:**
```http
GET /oas/automations
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true,
  "count": 2,
  "automations": [
    {
      "name": "get_pods",
      "description": "Lista pods do namespace especificado",
      "parameters": [
        {
          "name": "cluster",
          "type": "string",
          "required": true,
          "description": "Identificador do cluster Kubernetes"
        },
        {
          "name": "namespace",
          "type": "string",
          "required": true,
          "description": "Namespace a ser consultado"
        }
      ]
    },
    {
      "name": "get_all_resources",
      "description": "Lista todos os recursos do namespace",
      "parameters": [
        {
          "name": "cluster",
          "type": "string",
          "required": true,
          "description": "Identificador do cluster Kubernetes"
        },
        {
          "name": "namespace",
          "type": "string",
          "required": true,
          "description": "Namespace a ser consultado"
        }
      ]
    }
  ]
}
```

**Uso:** O Portal OAS utiliza este endpoint para descobrir quais automaÃ§Ãµes estÃ£o disponÃ­veis e quais parÃ¢metros cada uma requer.

---

### GET /oas/automations/{automation}

Retorna metadados de uma automaÃ§Ã£o especÃ­fica.

**AutenticaÃ§Ã£o:** Bearer Token (scope: `READ_STATUS`)

**Request:**
```http
GET /oas/automations/get-pods
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ok": true,
  "automation": {
    "name": "get_pods",
    "description": "Lista pods do namespace especificado",
    "parameters": [
      {
        "name": "cluster",
        "type": "string",
        "required": true,
        "description": "Identificador do cluster Kubernetes"
      },
      {
        "name": "namespace",
        "type": "string",
        "required": true,
        "description": "Namespace a ser consultado"
      }
    ]
  }
}
```

**Response (404 Not Found):**
```json
{
  "ok": false,
  "error": "Automation not found",
  "automation": "invalid-name",
  "available": ["get_pods", "get_all_resources"]
}
```

**Uso:** Permite que o Portal OAS valide se uma automaÃ§Ã£o existe e obtenha seu schema antes de executÃ¡-la.

---

### POST /oas/automations/{automation}

Executa uma automaÃ§Ã£o especÃ­fica.

**AutenticaÃ§Ã£o:** Bearer Token (scope: `EXECUTE_AUTOMATION`)

**Request:**
```http
POST /oas/automations/get-pods
Content-Type: application/json
Authorization: Bearer <token>

{
  "cluster": "k8shmlbb111b",
  "namespace": "dev-c1334434-testes-java21"
}
```

**Response (202 Accepted):**
```json
{
  "ok": true,
  "execId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "RUNNING",
  "automation": "get-pods",
  "timestamp": "2026-02-13T14:30:00-03:00",
  "cluster": "k8shmlbb111b",
  "namespace": "dev-c1334434-testes-java21"
}
```

**Response (400 Bad Request):**
```json
{
  "ok": false,
  "error": "Missing required fields: cluster, namespace"
}
```

**Response (502 Bad Gateway):**
```json
{
  "ok": false,
  "error": "Failed to call Agent",
  "execId": "550e8400-...",
  "agentStatus": 500,
  "agentBody": "..."
}
```

**Acompanhamento:** ApÃ³s receber o `execId`, use o endpoint `GET /agent/execute?execId={execId}` para consultar o status e resultado da execuÃ§Ã£o.

---

### Fluxo Completo de ExecuÃ§Ã£o
```
1. Portal OAS â†’ Controller
   POST /oas/automations/get-pods
   Body: { "cluster": "k8s-001", "namespace": "app-prod" }

2. Controller
   - Valida Token (JWT + scope EXECUTE_AUTOMATION)
   - Gera execId (UUID)
   - Extrai automation name da URL ("get-pods" â†’ "get_pods")
   - Resolve Agent URL por cluster
   - Encaminha para Agent

3. Controller â†’ Agent
   POST /agent/execute
   Body: { "execId": "...", "cluster": "...", "namespace": "...", "function": "get_pods" }

4. Controller â†’ Portal OAS
   Response 202: { "execId": "...", "status": "RUNNING" }

5. Portal OAS â†’ Controller (polling ou consulta posterior)
   GET /agent/execute?execId=...
   
6. Controller â†’ Portal OAS
   Response: { "status": "DONE", "entries": [...resultados...] }
```

---

### PadrÃ£o de Nomenclatura

**URLs (RESTful):** Usar hÃ­fen (`-`)
- Exemplo: `/oas/automations/get-pods`

**Payloads internos:** Usar underscore (`_`)
- Exemplo: `{ "function": "get_pods" }`

O Controller realiza a conversÃ£o automaticamente:
- URL: `get-pods` â†’ Payload Agent: `get_pods`

---

### ObservaÃ§Ãµes

- As automaÃ§Ãµes disponÃ­veis estÃ£o atualmente hardcoded em `getAvailableAutomations()`.
- Futuramente, a lista serÃ¡ dinÃ¢mica baseada no registro dos Agents (tabela `Jobs`).
- O Portal OAS Ã© atualmente o Ãºnico cliente previsto para essas rotas.
- Cada cluster possui seu prÃ³prio Agent, roteado dinamicamente via template `${cluster}`.

---

### VariÃ¡veis de Ambiente Relacionadas
```bash
# Roteamento dinÃ¢mico de Agents
AGENT_EXECUTE_URL_TEMPLATE=http://agent.${cluster}.svc.cluster.local/agent/execute

# Scopes (jÃ¡ existentes, reutilizados)
SCOPE_EXECUTE_AUTOMATION=EXECUTE_AUTOMATION
SCOPE_READ_STATUS=READ_STATUS
```

---

### Nova rota unificada: `POST /oas/sre-controller`

Esta rota foi adicionada para o fluxo TechBB/IOI com disparo por imagem allowlisted.

#### Autenticacao condicional por origem

- **Sem JWT**: aceito somente quando a origem informada corresponder ao contexto interno autorizado:
  - namespace: `sgh-oaas-playbook-jobs`
  - service account: `default`
- **Com JWT obrigatorio**: para qualquer outra origem, com scope `EXECUTE_AUTOMATION`.

Headers de origem aceitos por padrao:
- namespace: `x-techbb-namespace`, `x-k8s-namespace`, `x-origin-namespace`, `x-namespace`
- service account: `x-techbb-service-account`, `x-k8s-service-account`, `x-origin-service-account`, `x-service-account`, `x-service-account-name`

Configuracao opcional:
```bash
# Origem interna autorizada
OAS_TRUSTED_NAMESPACE=sgh-oaas-playbook-jobs
OAS_TRUSTED_SERVICE_ACCOUNT=default

# Lista de headers (separados por virgula)
OAS_ORIGIN_NAMESPACE_HEADERS=x-techbb-namespace,x-k8s-namespace
OAS_ORIGIN_SERVICE_ACCOUNT_HEADERS=x-techbb-service-account,x-k8s-service-account
```

#### Contrato de payload (imagem inicial)

Imagem permitida inicialmente:
- `psc-sre-ns-migration-preflight`

Campos obrigatorios:
- `image`
- `NAMESPACE` (string)
- `CLUSTER_DE_ORIGEM`
- `CLUSTER_DE_DESTINO`

Regras:
- Existem dois formatos aceitos:
  - **Formato legado (flags):**
    - `CLUSTER_DE_ORIGEM` e `CLUSTER_DE_DESTINO` como `TRUE/FALSE` opostos.
    - `CLUSTERS_NAMES` obrigatorio (array ou string CSV/JSON array).
  - **Formato cluster->cluster (novo):**
    - `CLUSTER_DE_ORIGEM` e `CLUSTER_DE_DESTINO` com os nomes reais dos clusters.
    - A controller monta duas URLs com placeholder (`origem` e `destino`) e dispara duas chamadas no Agent.
- No formato cluster->cluster, para o destino tambem exige:
  - `NODE_SELECTORS` (JSON valido)
  - `STORAGE_CLASSES` (JSON valido)

Exemplo (origem):
```json
{
  "image": "psc-sre-ns-migration-preflight",
  "CLUSTER_DE_ORIGEM": true,
  "CLUSTER_DE_DESTINO": false,
  "NAMESPACE": "meu-namespace",
  "CLUSTERS_NAMES": ["cluster-origem"]
}
```

Exemplo (destino):
```json
{
  "image": "psc-sre-ns-migration-preflight",
  "CLUSTER_DE_ORIGEM": false,
  "CLUSTER_DE_DESTINO": true,
  "NAMESPACE": "meu-namespace",
  "NODE_SELECTORS": { "deployment-a": { "disktype": "ssd" } },
  "STORAGE_CLASSES": { "pvc-a": "fast" },
  "CLUSTERS_NAMES": ["cluster-destino"]
}
```

Exemplo (cluster->cluster com placeholder em duas URLs):
```json
{
  "image": "psc-sre-ns-migration-preflight",
  "CLUSTER_DE_ORIGEM": "k8sclusterorigem001",
  "CLUSTER_DE_DESTINO": "k8sclusterdestino001",
  "NAMESPACE": "dev-c1334434-testes-java21",
  "NODE_SELECTORS": { "deployment-a": { "disktype": "ssd" } },
  "STORAGE_CLASSES": { "pvc-a": "fast" }
}
```

#### Comportamento da rota

- Valida allowlist da imagem.
- Valida contrato de payload por modo origem/destino.
- Gera `execId` unico e inicializa rastreio de execucao.
- Dispara no Agent para cada cluster informado em `CLUSTERS_NAMES` (formato legado) ou para os clusters de `CLUSTER_DE_ORIGEM` e `CLUSTER_DE_DESTINO` (formato cluster->cluster).
- Retorna `202` com `execId` e dados de dispatch.
- Consulta de status continua em `GET /agent/execute?uuid=<execId>`.

Resposta de sucesso (resumo):
```json
{
  "ok": true,
  "execId": "uuid",
  "status": "RUNNING",
  "statusEndpoint": "/agent/execute?uuid=<execId>"
}
```

Erros esperados:
- `400` payload invalido
- `401` JWT ausente/invalido (quando origem nao for interna autorizada)
- `403` scope insuficiente (quando origem nao for interna autorizada)
- `502` falha ao chamar Agent
