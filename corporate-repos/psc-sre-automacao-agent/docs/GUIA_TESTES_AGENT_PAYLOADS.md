# Guia rapido de testes - psc-sre-automacao-agent

## Objetivo
Este arquivo resume como testar o endpoint do agent e quais payloads usar para cada tipo de automacao.

## Como o fluxo funciona
1. O Controller envia `POST /agent/execute` para o Agent.
2. O Agent responde `200` imediatamente com mensagem de recebimento.
3. A execucao real roda em background (http, job ou composite-job).
4. O Agent envia o resultado para o Controller via callback em `/agent/execute/logs`.

## Endpoint de execucao
- Metodo: `POST`
- Rota: `/agent/execute`
- Header obrigatorio: `Authorization: Bearer <JWT do controller>`
- Header recomendado: `Content-Type: application/json`

## Campos obrigatorios do payload
- `execId`: identificador unico da execucao (UUID)
- `namespace`: namespace alvo da validacao/automacao
- `cluster`: identificador do cluster
- `function`: nome da automacao

## Funcoes disponiveis
- `get_pods` (tipo http)
- `get_all_resources` (tipo http)
- `migration_origem` (tipo job)
- `migration_destino` (tipo job)
- `migration` (tipo composite-job: origem -> destino)

## Payloads prontos para teste

### 1) HTTP - get_pods
```json
{
  "execId": "11111111-1111-1111-1111-111111111111",
  "namespace": "dev-c1334434-testes-java21",
  "cluster": "k8shmlbb111b",
  "function": "get_pods"
}
```

### 2) HTTP - get_all_resources
```json
{
  "execId": "22222222-2222-2222-2222-222222222222",
  "namespace": "dev-c1334434-testes-java21",
  "cluster": "k8shmlbb111b",
  "function": "get_all_resources"
}
```

### 3) JOB - migration_origem
```json
{
  "execId": "33333333-3333-3333-3333-333333333333",
  "namespace": "dev-c1334434-testes-java21",
  "cluster": "k8shmlbb111b",
  "function": "migration_origem"
}
```

### 4) JOB - migration_destino
```json
{
  "execId": "44444444-4444-4444-4444-444444444444",
  "namespace": "dev-c1334434-testes-java21",
  "cluster": "k8shmlbb111b",
  "function": "migration_destino"
}
```

### 5) COMPOSITE-JOB - migration (origem e destino em sequencia)
```json
{
  "execId": "55555555-5555-5555-5555-555555555555",
  "namespace": "dev-c1334434-testes-java21",
  "cluster": "k8shmlbb111b",
  "function": "migration"
}
```

## Ordem recomendada de testes
1. `get_pods`
2. `migration_origem`
3. `migration`

## Exemplo de chamada (curl)
```bash
curl -X POST "http://<host-agent>/agent/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_DO_CONTROLLER>" \
  -d '{
    "execId": "33333333-3333-3333-3333-333333333333",
    "namespace": "dev-c1334434-testes-java21",
    "cluster": "k8shmlbb111b",
    "function": "migration_origem"
  }'
```

## Resposta imediata esperada do endpoint
```json
{
  "message": "Requisicao recebida e automacao acionada"
}
```

## Status de callback esperados no Controller
- `RUNNING`: inicio da execucao
- `DONE`: execucao finalizada com sucesso
- `ERROR`: execucao finalizada com erro

## Observacoes importantes
- O fluxo `http` nao foi alterado.
- No fluxo `job`, o agent agora retorna diagnostico mais detalhado quando houver falha de Pod/Job.
- Se faltarem permissoes RBAC no cluster, o resultado tende a voltar como `ERROR` com motivo explicito.
