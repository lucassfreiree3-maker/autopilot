# Protocolo de Coordenação Multi-Agente

> **Aplica-se a: Claude Code · Codex · Gemini**
> Qualquer agente que atue no `your-controller` DEVE seguir este protocolo.
> **Objetivo**: evitar que dois agentes trabalhem na mesma tarefa, causando conflitos de git, versões duplicadas ou trabalho redundante.

---

## 1. ANTES de qualquer ação no controller — checklist obrigatório

```
[ ] 1. Ler state/agent-tasks.json
[ ] 2. Verificar se há tarefa ativa (activeTasks não vazio)
[ ] 3. Verificar se a tarefa pedida pelo usuário já está em recentCompleted
[ ] 4. Confirmar versão atual (currentVersion) vs o que você vai fazer
[ ] 5. Sincronizar clone: git pull origin main + verificar HEAD
[ ] 6. Somente então: reivindicar a tarefa e começar
```

---

## 2. Protocolo de verificação de tarefa ativa

### 2a. Se `activeTasks` não estiver vazio

**Regra principal — com exceção embutida:**

- Se `claimedAt` < 4 horas: informar o usuário `"Agente X ativo desde [timestamp]. Aguarde conclusão ou solicite cancelamento."` e parar.
- Se `claimedAt` ≥ 4 horas **E** nenhum commit recente nos últimos 30 min: assumir agente travado.
  1. Verificar no GitHub/GitLab se há commit recente do agente anterior.
  2. Se **não houver commit**: sobrescrever `activeTasks` e prosseguir autonomamente.
  3. Se **houver commit**: aguardar CI terminar — timeout de **30 minutos**. Se não concluir em 30 min: ler logs, informar usuário com diagnóstico e oferecer retry ou abort.

### 2b. Verificar se a tarefa já foi feita (anti-duplicação)

Antes de qualquer trabalho, comparar a descrição do pedido do usuário com `recentCompleted`:
- Se a tarefa foi completada nos **últimos 7 dias** E a versão está no main E nenhuma nota de "bloqueio", "parcial" ou erro: informar o usuário e NÃO reprocessar.
- Se a tarefa foi completada com `note` indicando falha, conflito ou estado parcial: **pode refazer**.
- Se a tarefa foi completada há **mais de 7 dias**: **pode refazer** (contexto diferente, nova sessão).

**Exemplo concreto (Gemini x Claude Code — 2026-03-17):**
```
Usuário pediu ao Gemini: "fixar Swagger UI com fundo escuro"
Gemini deve ler agent-tasks.json e ver:
  task-20260317-003: completedBy=claude-code, version=3.3.0, commit=504ec04
  description: "Fix Swagger UI contrast: opblock-summary..."
Gemini deve responder: "Esta tarefa foi concluída por Claude Code na versão 3.3.0
(commit 504ec04, deploy promovido). Não há nada a fazer."
```

---

## 3. Como reivindicar uma tarefa (claim)

Antes de começar qualquer trabalho, escrever em `state/agent-tasks.json`:

```json
{
  "activeTasks": [
    {
      "id": "task-YYYYMMDD-NNN",
      "claimedAt": "ISO-8601-timestamp",
      "claimedBy": "claude-code | codex | gemini",
      "status": "in_progress",
      "description": "O que será feito — suficientemente específico para outro agente entender",
      "expectedVersion": "X.Y.Z",
      "estimatedFiles": ["lista de arquivos que serão alterados"]
    }
  ]
}
```

**Regra**: claim antes de qualquer edit, commit ou push. Nunca trabalhar sem claim.

---

## 4. Como liberar uma tarefa (release)

Ao concluir (CI green + values.yaml promovido), atualizar `agent-tasks.json`:

```json
{
  "activeTasks": [],
  "currentVersion": "X.Y.Z",
  "currentCommit": "SHA-curto",
  "deployedTag": "X.Y.Z",

  "recentCompleted": [
    {
      "id": "task-YYYYMMDD-NNN",
      "completedAt": "ISO-8601-timestamp",
      "completedBy": "nome-do-agente",
      "version": "X.Y.Z",
      "commitSha": "SHA-7-chars",
      "description": "O que foi feito",
      "filesChanged": ["lista"],
      "ciRunId": 12345,
      "ciConclusion": "success",
      "valuesYamlPromoted": true
    }
    /* manter somente os 5 mais recentes */
  ]
}
```

---

## 5. Como lidar com conflito de git

Se o push for rejeitado (non-fast-forward), significa que outro agente publicou enquanto você trabalhava:

```
1. git fetch origin main
2. Inspecionar os commits chegados: git log HEAD..origin/main --oneline
3. Verificar se os commits cobrem a mesma tarefa que você executou:
   - Se sim: sua versão é redundante. Fazer git reset --hard origin/main, NÃO pushar.
             Atualizar agent-tasks.json informando que a tarefa já foi coberta.
   - Se não (outro assunto): git rebase origin/main, resolver conflitos, pushar.
4. Nunca usar --force em main.
```

---

## 6. Regras de versionamento entre agentes

- **Nunca dois agentes fazem bump no mesmo ciclo sem coordenação**
- Antes de bumpar: verificar `currentVersion` em `agent-tasks.json` e `package.json` no main
- A versão base para o próximo agente é sempre `currentVersion` + 1 patch
- Se `currentVersion` já foi aumentada por outro agente desde que você começou: rebase e use a versão atual + 1

---

## 7. Regras específicas por arquivo sensível

### `static/swagger-helmfire.css` e `static/swagger-helmfire.js`
- **ATENÇÃO: estes arquivos foram DELETADOS do repositório** (a partir da versão 3.3.x).
- Não recriar, não referenciar e não tentar injetar temas via `customCss`/`customJs` no `server.ts`.
- O tema visual do Swagger UI é controlado inteiramente pelo `src/swagger/swagger.json` e pelo CSS inline mínimo definido em `server.ts` (apenas oculta filtro de tag).
- Se encontrar referência a esses arquivos em código: remover como parte da tarefa em andamento.

### `src/swagger/swagger.json`
- Descrições devem estar em UTF-8 puro, sem U+FFFD (char 0xFFFD) e sem dupla-codificação (Ã§→ç)
- Antes de qualquer edição de descrições: verificar encoding (ver agent-shared-learnings.md seção swagger.json)
- Bump de versão usa campo `"version":  "X.Y.Z"` com DOIS espaços antes do valor

### `package-lock.json`
- Usar **JSON estruturado** (Node.js `JSON.parse` / `jq`) — nunca regex global.
- Atualizar somente os campos `version` na raiz e em `packages[""]` (os dois primeiros `"version"` do arquivo).
- Nunca substituir a versão string globalmente — outras dependências podem ter o mesmo valor e seriam corrompidas.

---

## 8. Compatibilidade com o state file legado

O arquivo `state/controller-release-state.json` é o state file do autopilot (usado pelo script `controller-release-autopilot.ps1`). O novo `state/agent-tasks.json` complementa — não substitui — esse arquivo.

- `controller-release-state.json`: usado pelo script de automação (stateful CI loop)
- `agent-tasks.json`: usado pelos agentes para coordenação (anti-duplicação, claim/release)

Ambos devem estar atualizados ao final de cada ciclo.

---

## 9. Resolução autônoma de conflitos

Aplicar nesta ordem **antes** de escalar ao usuário:

1. Aplicar § 5 (git rebase — se non-fast-forward).
2. Se ambas as mudanças são válidas e não conflitam: fazer rebase + merge e prosseguir.
3. Se conflitam nos mesmos arquivos com intenções diferentes: aplicar **regra do mais seguro** — no-op > read-only > write. A mudança menos destrutiva prevalece.
4. Se ainda ambíguo após as 3 etapas: documentar ambas as opções em `agent-shared-learnings.md` com contexto completo e **prosseguir com a opção mais segura**. Informar o usuário no final da sessão, não bloquear o release.

**Escalar ao usuário apenas se**: nenhuma das 4 etapas resolve E a decisão envolve trade-off de negócio que só o usuário pode fazer.

---

## 10. Localização dos arquivos de coordenação

### Projeto: your-controller

| Arquivo | Propósito |
|---------|-----------|
| `state/agent-tasks.json` | Registro ativo de tarefas (claim/release/completed) |
| `state/controller-release-state.json` | State do CI loop (script) |
| `controller-release-autopilot.json` | Config do release autopilot |
| `autopilot-manifest.json` | Fonte da verdade de caminhos e URLs |

### Projeto: your-agent

**Repositório fonte**: `https://github.com/your-org/your-agent.git` (GitHub)
**CI**: GitHub Actions — token via Device Flow (`github-device-auth.ps1`)
**CAP/Deploy repo**: GitHub (`cap-releases-your-agent`, branch `cloud/staging`)
**Clone local CAP**: `cache/deploy-your-agent`

| Arquivo | Propósito |
|---------|-----------|
| `state/agent-project-tasks.json` | Registro ativo de tarefas do agent project |
| `state/agent-release-state.json` | State do CI loop do agent |
| `agent-release-autopilot.json` | Config do release autopilot do agent (ciProvider: github) |
| `autopilot-manifest-agent.json` | Fonte da verdade do agent project |

### Compartilhados por ambos os projetos

| Arquivo | Propósito |
|---------|-----------|
| `docs/agent-coordination-protocol.md` | Este documento |
| `docs/agent-shared-learnings.md` | Aprendizados técnicos compartilhados |
| `secrets/github-token.txt` | Token GitHub (Texto puro) — compartilhado |
| `docs/gemini-controller-release-guide.md` | Guia operacional para Gemini |
| `docs/claude-code-operations.md` | Guia operacional para Claude Code |

---

## 11. Como determinar qual projeto está sendo pedido

Antes de qualquer ação, identificar qual projeto o usuário quer trabalhar:

- Mencionou **controller**, **sre-controller**, **API controller** → `your-controller`
  - Config: `controller-release-autopilot.json`
  - Tasks: `state/agent-tasks.json`
  - Clone: `repos/your-controller`

- Mencionou **agent**, **sre-agent**, **agente de execução** → `your-agent`
  - Config: `agent-release-autopilot.json`
  - Tasks: `state/agent-project-tasks.json`
  - Source clone: `repos/your-agent` (GitHub: `your-org/your-agent`)
  - CAP clone: `cache/deploy-your-agent` (GitHub: `your-org/cap-releases-your-agent`)
  - CI: GitHub Actions (ciProvider: github)

**Quando ambiguidade**: perguntar ao usuário antes de agir.

### Regra de versionamento por projeto

Os dois projetos têm versões **independentes**:
- Controller: atualmente `3.4.0` (patch → `3.4.1`, minor → `3.5.0`)
- Agent: atualmente `2.0.4` (patch → `2.0.5`, minor → `2.1.0`)

Nunca sincronizar versões entre projetos — cada um bump no próprio ciclo.
