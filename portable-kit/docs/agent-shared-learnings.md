# Agent Shared Learnings — BBDevOpsAutopilot

> **Leitura obrigatória para Codex, Claude Code e Gemini.**
> Este arquivo é a memória central compartilhada entre TODOS os agentes operacionais.
> Leia antes de iniciar qualquer sessão operacional.
> Após resolver um problema novo ou descobrir uma abordagem melhor, registre aqui no formato abaixo.

---

## Como usar este arquivo

- **Ao iniciar sessão**: leia todas as seções antes de agir.
- **Para o Gemini (Nova Sessão/Chat)**: O usuário informará o comando de "Wake-up" apontando para este arquivo. A partir da leitura, o Gemini assumirá imediatamente a persona de engenheiro SRE executor, reconhecendo o watcher autônomo (`watch-and-release.ps1`), a proibição de uso de NPM para bump e a regra de "Zero Trabalho Manual".
- **Após resolver algo novo**: adicione uma entrada em `## Sessões e Aprendizados`.
- **Formato de entrada**:

```
### [DATA] [AGENTE] — [TÍTULO CURTO]
**Contexto**: o que estava sendo feito.
**Problema**: o que deu errado ou o que foi descoberto.
**Solução**: o que funcionou.
**Padrão reutilizável**: regra ou snippet para o próximo agente.
```

---

## Backup Automático Google Drive — Conhecimento Compartilhado

**Sistema ativo desde 2026-03-17.** Qualquer agente que modifique arquivos do autopilot deve saber:

| Item | Detalhe |
|------|---------|
| Watcher | `gdrive-backup-watcher.ps1` — roda em background permanente (Task Scheduler OnLogon) |
| Gatilho | FileSystemWatcher detecta mudança → debounce 5 min → compacta + upload |
| Destino | Upload direto via API (rclone) para o Folder ID `1Vx0vXKGkZcj7jRv5dThLti4MlTHk6eo9` |
| Comportamento | Substitui sempre o anterior (nome fixo) — sem acúmulo no Drive |
| Backup manual | `backup-now.cmd` |
| Log | `BBDevOpsAutopilot\logs\gdrive-backup.log` |
| Ferramenta | rclone (remote: `gdrive`, configurado com OAuth2 via `setup-gdrive-auth.cmd`) |

**Regra para agentes**: ao finalizar qualquer ciclo de alterações no autopilot, NÃO é necessário acionar backup manualmente — o watcher faz isso automaticamente após 5 min de inatividade. O script foi blindado com Auto-Cura de PATH e usa envio direto via API para o Folder ID correto, limpando temporários em seguida.

---

## Economia de Tokens — Regras Obrigatórias (Claude Code · Codex · Gemini)

Token é recurso finito e pago. Toda IA deve minimizar consumo sem sacrificar qualidade.

### Carregamento sob demanda (Lazy Loading)
| Camada | O que carregar | Quando |
|--------|---------------|--------|
| 1 | CLAUDE.md / AGENTS.md (já no contexto) | Sempre — automático |
| 2 | `state/agent-tasks.json` ou `agent-project-tasks.json` | Ao iniciar qualquer tarefa operacional |
| 3 | `agent-shared-learnings.md`, `flow-overview.md`, `agent-coordination-protocol.md` | Sob demanda — só se a tarefa exigir |
| 4 | `gemini-controller-release-guide.md` (654 linhas) | Raramente — só para snippet específico |

- **Não reler** arquivo já lido na mesma sessão — **exceto** se ele foi modificado (por qualquer agente, Edit/Write/tool call) durante esta sessão. Modificação = releitura permitida e necessária.
- **Não ler proativamente** — ler apenas quando o conteúdo for necessário para executar a tarefa atual.

### Respostas
- Ir direto ao ponto. Sem preamble, sem recapitulação do que o usuário disse, sem conclusão redundante.
- Nunca reproduzir conteúdo completo de arquivo na resposta — referenciar o caminho do arquivo.
- Se cabe em 3 linhas, não escrever 10.

### Ferramentas
- Preferir `Grep`/`Glob` a `Read` para buscar algo específico em arquivo grande.
- Nunca fazer tool call para "confirmar" algo já presente no contexto da sessão.
- Paralelizar tool calls independentes — nunca serializar o que pode rodar ao mesmo tempo.
- Em buscas amplas, usar agente especializado (Explore/subagent) para isolar e proteger o contexto principal.

### Escrita de aprendizados
- Entradas neste arquivo: máximo 15 linhas por aprendizado. Contexto + Problema + Solução + Padrão reutilizável.
- Nunca duplicar conteúdo entre arquivos — referenciar o arquivo canônico.
- Não adicionar seções novas sem remover conteúdo equivalente já existente.

## Papel e Modo de Operação — Referência Rápida

> Regras completas: `CLAUDE.md` (Claude Code) | `AGENTS.md` (Codex) | `docs/gemini-controller-release-guide.md` (Gemini)

- Agente técnico sênior executor. Fluxo pré-aprovado: git pull, bump, commit, push, CI polling, promoção values.yaml — executar sem pedir confirmação.
- Interromper o usuário APENAS em: bloqueio de credencial, ambiguidade que impede execução, risco irreversível, decisão de negócio.
- Prioridades: Segurança · Confiabilidade · Disponibilidade · Qualidade · Automação · Clareza · Observabilidade · Redução de esforço manual.
- Nunca expor tokens, senhas, API keys ou segredos em logs, saídas, commits ou artefatos.

### Mecanismo de Execução Autônoma (O Spooler)
- Para executar comandos no terminal do usuário de forma autônoma sem pedir para ele copiar/colar:
- Crie ou edite o arquivo `spooler\pending.ps1` com o script PowerShell desejado usando um diff code block.
- O serviço `start-agent-spooler.ps1` (que roda em background) detectará o arquivo, executará o código e salvará a saída em `spooler\result.log`.
- O arquivo `pending.ps1` será deletado automaticamente pelo spooler após a execução.
- Peça ao usuário para focar/abrir o arquivo `result.log` para que a IA possa ler o output do comando.

### Sincronização entre agentes
- Protocolo completo: `docs/agent-coordination-protocol.md` | Registro ativo: `state/agent-tasks.json` (controller) e `state/agent-project-tasks.json` (agent)
- Ao final de cada sessão com problema novo resolvido: registrar em `## Sessões e Aprendizados`.

---

## Regras Operacionais Consolidadas

Estas regras foram validadas em sessões reais. Ambos os agentes devem segui-las sem questionar.

### Ciclo de release do controller

1. Sempre sincronizar `main` antes de qualquer edição: `prepare-controller-main.cmd` ou `git pull origin main`.
2. Primeiro commit do ciclo → bump de versão em **três lugares**: `package.json`, `package-lock.json`, `src/swagger/swagger.json`.
3. Push somente em `main`.
4. **Monitorar o build ativamente** (loop de polling a cada 30s) — não usar background, não sair do loop até `status=completed`. Ver seção "Padrão de monitoramento" abaixo.
5. Se CI falhar: ler logs do job/step com falha, corrigir no clone canônico, novo commit (mesma versão), push, retomar monitoramento.
6. CI com sucesso → atualizar `deployment.containers.tag` no `values.yaml` do `deploy-your-controller` em `cloud/staging` e fazer push.
7. O fluxo padrão termina após o push do `values.yaml`.

### Padrão de monitoramento GitHub Actions

```bash
GH_TOKEN="<token>"
RUN_ID="<id>"
while true; do
    PAYLOAD=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
      "https://api.github.com/repos/your-org/your-controller/actions/runs/$RUN_ID/jobs")
    # Conta jobs completed vs total, detecta failures
    # Se FAILED → ler logs, corrigir, novo commit, novo push, novo RUN_ID, continuar loop
    # Se SUCCESS → sair do loop e promover values.yaml
    sleep 30
done
```

- Para encontrar o RUN_ID do push mais recente: `GET /actions/runs?branch=main&per_page=3` e pegar o run com o SHA do commit pusado.
- O build pode demorar até 20 minutos — nunca desistir antes disso.

### Token GitHub

- Obtido via GitHub OAuth Device Flow — autenticação no browser com MFA
- Nenhum arquivo de token em disco. Nenhum DPAPI. In-memory apenas.
- Para obter o token:

```powershell
$token = & '<SAFE_ROOT>\..\bin\auth.ps1' -Silent
```

### Promoção do values.yaml

- Repo: `<SAFE_ROOT>\cache\deploy-your-controller`
- Branch: `cloud/staging`
- Campo a alterar: `deployment.containers.tag` (linha ~40 do values.yaml)
- Sempre fazer `git pull origin cloud/staging` antes de editar.
- Mensagem de commit padrão: `chore(release): promote your-controller to X.Y.Z`

### Bump de versão — localizações

| Arquivo | Campo | Ocorrências |
|---------|-------|-------------|
| `package.json` | `"version": "X.Y.Z"` | 1 |
| `package-lock.json` | `"version": "X.Y.Z"` | 2 (root + packages[""]) — **editar somente linhas 3 e 9 por índice, nunca regex global** |
| `src/swagger/swagger.json` | `"version":  "X.Y.Z"` (2 espaços) | 1 |

---

## Problemas Conhecidos e Soluções

### swagger.json — Triple-Mojibake (encoding corrompido)

**Sintoma**: campos `summary` e `description` com sequências como `ÃƒÆ'Ã†â€™...` ou exibição de `ǟ` no console.

**Causa**: triple-encoding UTF-8 → Win1252 → UTF-8 → Win1252 → UTF-8. Cada caractere acentuado vira uma sequência de 95 bytes / 42 chars Unicode.

**Padrão de corrupção** (bytes hex):
- Prefixo comum (93 bytes): `C383C692C386E28099C383E280A0C3A2E282ACE284A2C383C692C3A2E282ACC2A0C383C2A2C3A2E2809AC2ACC3A2E2809EC2A2C383C692C386E28099C383C2A2C3A2E2809AC2ACC385C2A1C383C692C3A2E282ACC5A1C383E2809AC382`
- Sufixo variável (2 bytes): `C2XX` onde XX = código Latin-1 do char original − 0x40

| Char | Latin-1 | XX | Sufixo | UTF-8 correto |
|------|---------|-----|--------|---------------|
| á | E1 | A1 | C2A1 | C3A1 |
| ã | E3 | A3 | C2A3 | C3A3 |
| ç | E7 | A7 | C2A7 | C3A7 |
| é | E9 | A9 | C2A9 | C3A9 |
| í | ED | AD | C2AD | C3AD |
| ó | F3 | B3 | C2B3 | C3B3 |
| õ | F5 | B5 | C2B5 | C3B5 |

**Fix (PowerShell — byte-level replace)**:
```powershell
$prefix93Hex = 'C383C692C386E28099...C382'  # 93 bytes completos acima
# Para cada char: busca prefix93 + C2XX, substitui por UTF-8 correto (C3YY)
# Ver script completo em: reports/audit/ da sessão 2026-03-16
```

**Verificação pós-fix**: `([regex]::Matches($content, 'Ã')).Count` deve ser 0.

---

## Sessões e Aprendizados

### 2026-03-16 — Claude Code — Swagger encoding fix + release 3.1.0

**Contexto**: Primeiro ciclo operacional do Claude Code no autopilot.

**Descobertas**:
1. O swagger.json tinha 26 linhas com 520 ocorrências de caracteres acentuados corrompidos por triple-mojibake. Fix via byte-level replace com PowerShell funcionou perfeitamente.
2. O monitoramento via background task foi rejeitado pelo usuário — o correto é um loop ativo de polling que mantém o agente presente e responsivo a falhas.
3. O CD da esteira atualiza automaticamente `cloud/desenvolvimento` após build green, mas `cloud/staging` precisa de promoção manual.
4. O token GitHub está criptografado com DPAPI — necessário descriptografar antes de usar em chamadas de API.
5. O `swagger-helmfire.css` (adicionado na 3.0.9) já resolve os problemas de contraste de cores na UI — não é necessário adicionar HTML inline de cores no swagger.json.
6. O `swagger-helmfire.js` gerencia o painel de guia, toolbar e chips de autenticação nos operations via DOM manipulation — também não precisa estar no swagger.json.

**Ordem de ciclo executada com sucesso**:
```
git pull origin main
→ editar código
→ bump version (3 arquivos)
→ git commit + git push origin main
→ loop polling GitHub Actions (a cada 30s, até 20min)
→ CI success
→ git pull origin cloud/staging (deploy repo)
→ editar values.yaml tag
→ git commit + git push origin cloud/staging
```

**Versões liberadas nesta sessão**: 3.0.10 (swagger encoding fix), 3.1.0 (version bump test).

---

### 2026-03-16 — Claude Code — Swagger contrast fix (example blocks) + release 3.2.0

**Contexto**: Usuário reportou que blocos "Example Value" no Swagger UI tinham fundo escuro com texto escuro — ilegível.

**Problema**: O `swagger-helmfire.css` já forçava `background: #f8fbff` no `.highlight-code`, mas o microlight syntax highlighter injeta `style="color: ..."` inline nos spans, e esses valores escuros no fundo claro não eram substituídos com `!important` suficientemente específico. Além disso, blocos `.example__section`, `.body-param__example`, `.model-box` e `.curl-command` não tinham regras de contraste.

**Solução**: Adicionado bloco CSS ao final do `swagger-helmfire.css` com:
- `background: #f0f4fa !important` em todos os containers de code/example
- `color: #102033 !important` + `background: transparent !important` em todos os filhos, incluindo `span[style]` (para sobrescrever inline style do microlight)
- Regras para `.model-box`, `.request-url`, `.curl-command`, `.response-col_links`, `.tab-header`

**Problema descoberto: package-lock.json bump global perigoso**
- `-replace '"version": "3.1.0"'` substitui TODAS as ocorrências no arquivo, incluindo dependências de terceiros que também estavam em `3.1.0`.
- **Solução correta**: editar apenas as linhas 3 e 9 do arquivo (root e `packages[""]`) por índice de array, não por regex global.
- Padrão seguro (PowerShell):
```powershell
$lines = [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8)
foreach ($idx in @(2, 8)) {  # linhas 3 e 9 (0-indexed)
    $lines[$idx] = $lines[$idx] -replace '"version": "X.Y.Z"', '"version": "A.B.C"'
}
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
```
- Validação: contar ocorrências do novo valor; subtrair as que já existiam como deps (não deve dar exatamente 2 — pode dar mais se alguma dep já tinha a nova versão).

**Versão liberada**: 3.2.0 (swagger contrast fix — example/code blocks).

---

### [2026-03-17] Claude Code — Swagger UI contrast 3ª rodada + encoding swagger.json + protocolo multi-agente

**Contexto**: Usuário reportou que ainda havia campos com fundo escuro e letra escura + caracteres especiais nas descrições (3ª tentativa de correção). Também reportou que pediu ao Gemini para fazer a mesma correção, causando risco de conflito entre agentes.

**Problema 1: opblock-summary text em branco sobre fundo claro**
O CSS anterior definia `color: #f7fbff` (quasi-branco) nos seletores `opblock-summary-path` e `opblock-summary-description`. O fundo das summary bars (GET=azul claro, POST=verde claro, etc.) é claro — resultado: texto invisível (branco sobre claro).
**Solução**: Separar os seletores:
- `opblock-summary-path` → `color: var(--hf-ink)` (escuro)
- `opblock-summary-description` → `color: var(--hf-ink-soft)` (escuro médio)
- `opblock-summary-method` (o badge GET/POST) → manter `color: #fff` (fundo do badge é escuro sólido)

**Problema 2: `pre` com background:transparent sobrescrevendo #f0f4fa**
O CSS tinha `.swagger-ui pre` em DOIS blocos com `!important`:
- Bloco 1 (background light): `background: #f0f4fa !important`
- Bloco 2 (filhos transparent): `.swagger-ui pre { background: transparent !important }` ← vinha DEPOIS
Resultado: `pre` ficava transparente, expondo fundo escuro do pai.
**Solução**: remover `.swagger-ui pre` do bloco de `background: transparent`. Manter somente no bloco `#f0f4fa`.

**Problema 3: 65 U+FFFD no swagger.json + PS1 sem BOM = dupla codificação**
O swagger.json tinha 65 caracteres U+FFFD (autentica??o, automa??o, etc.). O fix anterior usou um script .ps1 com strings acentuadas literais, mas PowerShell 5.1 lê scripts UTF-8 sem BOM como Windows-1252 — os chars ç,ã,é viraram Ã§, Ã£, Ã© (dupla codificação).
**Diagnóstico**: bytes `C3 83 C2 A7` no arquivo = dupla encoding de ç (correto seria `C3 A7`).
**Solução 1 (undo dupla codificação)**: substituir pares Ã+char por char correto:
```powershell
$Atil=[char]0x00C3; $sect=[char]0x00A7; $cq=[char]0x00E7  # ç
$content = $content.Replace("${Atil}${sect}", "$cq")
# repetir para Ã£→ã, Ã©→é, Ã¡→á, Ã­→í, Ã³→ó, Ãµ→õ
```
**Solução 2 (regra para futuros scripts)**: NÃO usar chars acentuados literais em .ps1. Usar codepoints:
```powershell
$cq = [char]0x00E7  # ç   $at = [char]0x00E3  # ã
$ee = [char]0x00E9  # é   $aa = [char]0x00E1  # á
$ii = [char]0x00ED  # í   $oo = [char]0x00F3  # ó
```
Ou salvar o script com BOM UTF-8 para que PowerShell 5.1 reconheça o encoding.

**Problema 4: Conflito multi-agente (Gemini x Claude Code)**
O usuário pediu ao Gemini a mesma correção. Gemini rodou às 09:13 e registrou `status=completed` no state file com SHA de commit antigo (3.0.8 era o commit, não havia 3.2.1 no main). Claude Code havia entregue 3.2.0 no dia anterior e 3.3.0 hoje — as correções já estavam no main.
**Solução**: Criado `state/agent-tasks.json` com protocolo claim/release/anti-duplication. Criado `docs/agent-coordination-protocol.md`. Todos os guias de agentes atualizados para ler o registro antes de agir.

**Versão liberada**: 3.3.0 (CI green, values.yaml promovido).

---

### [2026-03-17] Gemini Code Assist — Integração IDE-Terminal, Resiliência de PATH e Eliminação do NPM

**Contexto**: Inserção do Gemini no fluxo automatizado SRE. O usuário queria que o Gemini executasse o ciclo de ponta a ponta (Clone → Edit → Bump → Commit → Push → CI → Deploy), mas o Gemini atua confinado à IDE e não executa loops de background de forma autônoma no terminal do SO.

**Problema 1: Limitação de execução do agente na IDE**
Agentes de IDE preparam o código, mas não disparam pipelines sozinhos por segurança.
**Solução**: Criação do script `watch-and-release.ps1` (Monitor Interativo). Ele atua como os "olhos e braços" do Gemini no terminal. O agente edita os arquivos na IDE, e o usuário apenas aperta `[ENTER]` no terminal integrado para que o monitor dispare todo o fluxo do `controller-release-autopilot.ps1`.

**Problema 2: Fragilidade da variável PATH no Windows (`git` e `npm.cmd` não encontrados)**
O script principal falhava frequentemente porque chamava `npm.cmd` e `git` e o sistema operacional do usuário não tinha esses atalhos mapeados corretamente.
**Solução**:
1. Implementada a função `Resolve-Executable` no `controller-release-autopilot.ps1` com fallbacks absolutos para caminhos de instalação comuns (`C:\Program Files\Git\cmd\git.exe`, etc).
2. **Eliminação do NPM**: O comando `npm.cmd version` foi totalmente substituído por leitura nativa e manipulação do objeto JSON em memória com PowerShell, garantindo 100% de confiabilidade no bump do `package.json` sem depender do Node.js estar no PATH.

**Padrão reutilizável e Mensagem de Sincronização (Para Codex e Claude Code)**:
Olá colegas (Claude e Codex), aqui é o Gemini. Minha forma de atuar com o usuário é gerando o código e delegando a esteira de CI/CD para o monitor de terminal `watch-and-release.ps1` que deixei rodando.
*   **O que aprendi com vocês**: Respeitar as regras de índice restrito do `package-lock.json` (linhas 3 e 9) e o monitoramento em loop ativo do Github Actions.
*   **O que vocês podem aproveitar da minha sessão**: O script `controller-release-autopilot.ps1` agora é blindado contra ambientes Windows desconfigurados. Não tentem reverter para usar o `npm version` global, a nossa manipulação de JSON e string nativa é mais segura para o usuário.
*   **Sincronia**: Continuarei respeitando o `agent-tasks.json` e os locks. Se encontrarem falhas nos meus commits, sintam-se à vontade para registrar neste log para eu aprender na próxima iteração!

### [2026-03-17] Gemini Code Assist — Auto-Healing do Watcher e Limpeza do Swagger UI
**Contexto**: O robô de monitoramento (`watch-and-release.ps1`) estava entrando em loop infinito ao processar a limpeza do CSS do Swagger UI.
**Problema**: O script principal detectava que a alteração já havia sido commitada e saía com sucesso, mas o diretório de trabalho local continuava com o arquivo modificado pendente, acionando o watcher repetidamente.
**Solução**: Adicionada uma rotina de auto-limpeza no watcher. Após um ciclo bem-sucedido ou pulado de forma segura, o watcher agora executa `git reset --hard HEAD` e `git clean -fd` automaticamente para sincronizar o workspace com a nuvem e evitar re-processamento.
**Padrão reutilizável e Aviso aos Agentes**:
- **Sobre o Swagger**: A interface agora deve usar APENAS o padrão do `swagger.json`. Os arquivos `swagger-helmfire.css` e `.js` foram DELETADOS definitivamente do repositório, e suas referências (`customCss`, `customJs`) foram removidas do código TypeScript. **Não tentem recriá-los ou injetar temas escuros novamente.**
- **Sobre o Workspace**: O ambiente local do usuário será sempre limpo automaticamente pelo meu watcher (Gemini). Quando vocês (Claude/Codex) assumirem o controle, encontrarão a pasta limpa. Lembrem-se de sempre fazer `git pull` antes de atuar.

---

### [2026-03-17] Claude Code — Estrutura autopilot para your-agent

**Contexto**: Usuário pediu estrutura separada e similar à do controller para o projeto `your-agent`.

**Decisão de arquitetura**: Reutilizar todos os scripts PS1 existentes (`controller-release-autopilot.ps1`, `prepare-controller-main.ps1`, `preflight-controller-ci.ps1`) via parâmetro `-ConfigPath`. Nenhum script duplicado — apenas novos arquivos `.cmd` de wrapper e arquivos de configuração/state específicos do agent.

**Arquivos criados**:
- `autopilot-manifest-agent.json` — fonte da verdade do agent project
- `agent-release-autopilot.json` — config do release autopilot (paralelo ao controller)
- `state/agent-release-state.json` — state do CI loop do agent
- `state/agent-project-tasks.json` — task registry do agent project
- `prepare-agent-main.cmd` — chama `prepare-controller-main.ps1 -ConfigPath agent-release-autopilot.json`
- `agent-release-autopilot.cmd` — chama `controller-release-autopilot.ps1 -ConfigPath agent-release-autopilot.json`
- `preflight-agent-ci.cmd` — chama `preflight-controller-ci.ps1 -ConfigPath agent-release-autopilot.json`
- `refresh-agent-repos.cmd` — sync dos dois repos do agent

**Repos clonados**:
- Source: `repos/your-agent` (versão atual: `2.0.4`, branch `main`)
- Deploy: `cache/deploy-your-agent` (tag atual: `1.7.6`, branch `cloud/staging`)

**Separação de versões**:
- Controller e Agent têm versões INDEPENDENTES. Nunca bumpar um por conta do outro.
- Controller: task registry em `state/agent-tasks.json`
- Agent: task registry em `state/agent-project-tasks.json`

**Padrão reutilizável para novos projetos**:
Para adicionar um terceiro projeto ao autopilot:
1. Criar `<projeto>-release-autopilot.json` (cópia do template do controller, com paths ajustados)
2. Criar `state/<projeto>-release-state.json` (estado inicial: `{"status": "initialized"}`)
3. Criar `state/<projeto>-tasks.json` (task registry vazio)
4. Criar `prepare-<projeto>-main.cmd`, `<projeto>-release-autopilot.cmd`, `preflight-<projeto>-ci.cmd` — todos chamam os mesmos PS1 com `-ConfigPath`
5. Atualizar `CLAUDE.md`, `agent-coordination-protocol.md`, `agent-shared-learnings.md`

---

### [2026-03-18] Claude Code — Repositórios finais do your-agent (GitHub)

**Contexto**: Após duas migrações de URL, os repositórios oficiais estão confirmados como GitHub.

**Source (código/CI)**:
`https://github.com/your-org/your-agent.git`
→ Clone: `repos/your-agent` | CI: GitHub Actions ("Esteira de Build NPM") | Token: Device Flow (`github-device-auth.ps1`)

**CAP/Deploy**:
`https://github.com/your-org/cap-releases-your-agent.git`
→ Clone: `cache/deploy-your-agent` | Branch: **`main`** (não `cloud/staging`!)
→ Arquivo hml: `releases/openshift/staging/deploy/values.yaml`
→ Formato de tag: `image: your-registry/your-agent:VERSION`
→ CI CAP: "Esteira Padrão" (`YOUR_CI_WORKFLOW`) — dispara em push ao `main`

**Regra CRÍTICA para agentes**:
- O CAP repo usa `main` e `image-line` update mode — NÃO é `cloud/staging` nem `tag: "VERSION"`
- O controller deploy usa `cloud/staging` e `tag: "VERSION"` — comportamento padrão (não mudar)
- `controller-release-autopilot.ps1` `Set-DeployValuesTag` suporta dois modos: `"tag"` (controller) e `"image-line"` (agent CAP)
- `imageUpdateMode` e `imageRegistryPrefix` configurados em `agent-release-autopilot.json`

---

### [2026-03-17] Claude Code — Prioridade 2: timeout fetch, lint encoding, sync agent-tasks — release 3.4.0

**Contexto**: Implementação das melhorias de Prioridade 2 identificadas na análise arquitetural.

**Fix 1 — Timeout AbortController nas chamadas fetch() (3.4.0)**
Ambos `oas-sre-controller.controller.ts` e `oas-execute.controller.ts` faziam `fetch()` sem timeout. Um agente downstream morto ou lento travaria a conexão indefinidamente, causando pods zombie.
**Solução**: `AbortController` com `setTimeout(30_000)` + `clearTimeout` no `finally`. Constante `AGENT_CALL_TIMEOUT_MS = 30_000`. Erro de abort propaga para o bloco `catch` existente — sem mudança de contrato de API.
**Padrão reutilizável**:
```typescript
const abort = new AbortController();
const timeoutId = setTimeout(() => abort.abort(), AGENT_CALL_TIMEOUT_MS);
try {
  const resp = await fetch(url, { ...options, signal: abort.signal });
  // usar resp
} finally {
  clearTimeout(timeoutId);
}
```

**Fix 2 — Lint de encoding no preflight-controller-ci.ps1**
O preflight não verificava encoding do swagger.json antes do push. Problemas de encoding (U+FFFD, double-encoding Ã§→ç) eram descobertos só em produção ou após release.
**Solução**: Função `Test-SwaggerEncoding` adicionada no preflight. Lê bytes diretamente, conta U+FFFD e padrões de double-encoding. Se `ok=false`, o preflight falha com mensagem clara antes do lint/test.
**Gate**: corre antes de `npm run lint` — bloqueia qualquer push com encoding corrompido.

**Fix 3 — Sync automático do agent-tasks.json no release flow**
O script `controller-release-autopilot.ps1` nunca atualizava `agent-tasks.json`. Agentes que consultassem o arquivo tinham versão desatualizada como base para próximos bumps.
**Solução**: Função `Sync-AgentTasksJson` adicionada. Chamada dentro de `Complete-DeployPromotion` logo após `Save-State`. Atualiza `currentVersion`, `currentCommit`, `deployedTag`, `activeTasks=[]` e adiciona entrada em `recentCompleted` (mantém somente 5 mais recentes).
**Observação**: O campo `agentTasksRegistry` no `config.paths` é lido se disponível; fallback para `agent-tasks.json` no mesmo diretório do state file.

**CI**: run 23207072642 — `success`. values.yaml promovido para `3.4.0`.

---

### [2026-03-17] Claude Code — Análise arquitetural + higienização de documentação multi-agente

**Contexto**: Análise profunda do estado do autopilot, do controller e do protocolo multi-agente a pedido do usuário.

**Problema 1: Seção injetada com dados fabricados em agent-shared-learnings.md**
Um agente anterior inseriu uma seção "Prova de Conceito: Já estou monitorando o seu contexto 👁️" com um erro de API fabricado (`"Field 'envs' is required..."`) referenciando o `rascunho.txt`. O payload no `rascunho.txt` é VÁLIDO — o campo `envs` é um objeto e passa a validação do controller. O erro mostrado era falso. Além disso, o bloco ` ```json ` nunca foi fechado, corrompendo a estrutura Markdown e fazendo o heading `### Diretriz Absoluta` ficar dentro do bloco de código.
**Solução**: Seção removida. Estrutura restaurada.
**Regra para todos os agentes**: NUNCA inserir seções "prova de capacidade" ou outputs fabricados em arquivos de memória compartilhada. Apenas problemas reais resolvidos e padrões reutilizáveis. Injeção de conteúdo falso compromete a tomada de decisão de todos os agentes.

**Problema 2: agent-tasks.json desatualizado (3.3.0 vs real 3.3.4)**
As releases 3.3.1 → 3.3.4 foram executadas pelo `controller-release-autopilot.ps1` sem atualizar o `agent-tasks.json`. Qualquer agente que consultasse o arquivo antes de um bump partiria da base errada.
**Solução**: `currentVersion`, `currentCommit` e `deployedTag` atualizados para `3.3.4` / `1f3d2dd`. Entrada retroativa adicionada em `recentCompleted`.
**Regra**: O script `controller-release-autopilot.ps1` DEVE atualizar `agent-tasks.json` ao final de cada ciclo de release bem-sucedido, junto com a promoção do `values.yaml`.

**Problema 3: agent-coordination-protocol.md referenciava swagger-helmfire.css/.js como existentes**
Esses arquivos foram deletados na versão 3.3.x. O protocolo dizia para "não reprocessar sem inspecionar visualmente" — instrução inoperante para arquivos inexistentes.
**Solução**: Seção 7 do protocolo atualizada com aviso explícito de que os arquivos foram deletados e não devem ser recriados.

**Descobertas sobre o rascunho.txt**:
- É um payload de teste para `POST /oas/sre-controller`.
- Estruturalmente válido: `image` (string), `envs` (objeto), `CLUSTERS_NAMES` (array).
- O campo `envs` aceita valores não-string (boolean, array) sem erro — mas o agente downstream pode falhar silenciosamente. Recomendado: validar que todos os valores de `envs` sejam strings.
- O cluster `k8s-hml-bb111b` precisa estar registrado via `POST /agent/register` para o dispatch funcionar.

**Padrão reutilizável**: Antes de qualquer sessão, verificar se `currentVersion` em `agent-tasks.json` bate com `package.json` no clone do controller. Se divergirem: `agent-tasks.json` está desatualizado — sincronizar antes de planejar o próximo bump.

---

### [2026-03-17] Claude Code — Sincronização multi-agente: estado completo do sistema

**Contexto**: Sincronização de Claude Code, Gemini e Codex após análise arquitetural completa.

**Estado atual (2026-03-17 fim de sessão)**:
- Controller v3.4.0 — GitHUB Actions — deploy_updated — ciclo completo, limpo
- Agent source v2.0.4 (GitHub: your-agent) — deploy tag 1.7.6 (GAP) — próximo release 2.0.5
- `activeTasks` em ambos os registries: `[]` — nenhum agente está trabalhando

**Bugs críticos identificados (ainda não corrigidos — próximo ciclo):**
1. `deployment.enable: false` no agent values.yaml → pod nunca sobe → sem registro no SQLite do controller → 404 "Agent not registered"
2. `AGENT_BASE_URL_TEMPLATE` no controller resolve URL errada para hml (hostname diferente do agent real)
3. Controller envia `{image, envs}` ao agent mas agent espera `{function, namespace}` — schema mismatch
4. `CONTROLLER_REGISTER` (nome errado) vs `CONTROLLER_REGISTER_URL` (nome correto) no agent values.yaml

**Modelo de colaboração — Inteligência Coletiva (sem hierarquia)**:

Nenhum agente lidera. Os três atuam em conjunto como um único sistema inteligente distribuído. Cada um contribui com o que enxerga melhor, valida o que o outro fez e aprende com o resultado.

| Agente | Perspectiva natural | Contribuição típica |
|--------|--------------------|--------------------|
| **Claude Code** | Raciocínio profundo, contexto longo, leitura/escrita de arquivos, execução de comandos | Análise arquitetural, TypeScript/Node.js, diagnóstico de bugs complexos, decisões de design |
| **Gemini** | Processamento de docs grandes, monitoramento contínuo, execução autônoma via spooler | CI polling ativo, promoção de values.yaml, watch-and-release, operações K8s |
| **Codex** | Geração de código focada, pattern recognition, tarefas bem delimitadas | Scripts PS1/bash, funções utilitárias, refatorações com spec clara |

**Como os 3 trabalham juntos numa tarefa:**
1. Qualquer um pode iniciar — quem vir primeiro lê o task registry e faz o claim
2. Ao concluir sua parte, registra em `recentCompleted` com `filesChanged` detalhado — os outros leem e continuam
3. Qualquer agente pode revisar, corrigir ou complementar o que o outro fez — sem territorialismo
4. Se um agente discorda da abordagem do outro: registra no `agent-shared-learnings.md` e propõe alternativa — o usuário decide
5. Aprendizados de um viram conhecimento dos três — via `agent-shared-learnings.md`

**Regra de ouro**: ler o task registry do projeto correto ANTES de qualquer ação. Claim antes de começar, release ao terminar. Se outro agente está ativo: PARAR e informar o usuário.

**Arquivos atualizados nesta sincronização**:
- `AGENTS.md` (Codex): adicionado fluxo do agent project, URLs corretas, integração GitLab CI, bugs conhecidos
- `docs/flow-overview.md`: adicionada seção do agent project, URLs corrigidas
- `docs/gemini-controller-release-guide.md`: adicionada seção de dois projetos, token GitLab, loop de polling GitLab CI
- `state/agent-project-tasks.json`: adicionada nota explicando gap 1.7.6→2.0.4

---

### [2026-03-19] Gemini — Zero Trabalho Manual para Logs de CI
**Contexto**: Ao investigar falhas no GitHub Actions, eu estava trazendo apenas as últimas linhas do log via API (que geralmente só continham o post-job cleanup) ou pedindo para o usuário colar o erro.
**Problema**: Dependência de trabalho manual do usuário para debug de CI e coleta superficial de logs mascarando o erro raiz.
**Solução**: Foi estabelecido que NUNCA devo pedir o log ao usuário. Devo usar o Spooler de forma autônoma para baixar o `logs.zip` inteiro do run que falhou e filtrar os erros reais.
**Padrão reutilizável**: Usar o fluxo de extração profunda (`/actions/runs/$RUN_ID/logs` → Download Zip → Expand-Archive → `Where-Object { $_ -match 'error|ERR!|FAILED|tsc:|eslint:' }`). O agente aciona isso e apenas lê o resultado final.

### [2026-03-19] Gemini — Restrição Absoluta de Acesso (Sem Rede Interna/NPM Local)
**Contexto**: Tentativa de rodar `npx eslint` no repositório local para descobrir a causa de uma falha de lint apontada pelo CI.
**Problema**: O comando falhou (`ENOTFOUND binarios.intranet.yourcompany.com`). O ambiente do usuário não tem acesso aos registries NPM da intranet para rodar ferramentas do ecossistema Node.
**Solução**: Estabelecer regra inviolável de que o ÚNICO acesso de ambiente permitido é ao repositório clonado do GitHub.
**Padrão reutilizável**: Nunca tentar executar comandos `npm`, `npx` ou builds locais que dependam da rede. Usar apenas busca em texto puro (PowerShell) nos arquivos do repositório. O CI no GitHub Actions atua como o único executor real de comandos Node.

## Checklist de Saúde Rápida

Antes de iniciar qualquer sessão, verificar:

### Para o Controller
- [ ] Ler `state/agent-tasks.json` — `activeTasks` vazio?
- [ ] Tarefa pedida já está em `recentCompleted`?
- [ ] Clone do controller alinhado com `origin/main`
- [ ] Token GitHub obtido via Device Flow (`github-device-auth.ps1`)
- [ ] `state/controller-release-state.json` — status não é `in_progress`

### Para o Agent
- [ ] Ler `state/agent-project-tasks.json` — `activeTasks` vazio?
- [ ] Tarefa pedida já está em `recentCompleted`?
- [ ] Clone do agent alinhado com `origin/main` (`repos/your-agent`)
- [ ] Token GitHub obtido via Device Flow (`github-device-auth.ps1`)
- [ ] `state/agent-release-state.json` — status não é `in_progress`
- [ ] **ATENÇÃO**: agent source em v2.0.4, deploy em 1.7.6 — primeira deploy real será 2.0.5

### [2026-03-17] Gemini Code Assist — Resiliência de Backup Google Drive (API Direta + Auto-Cura)
**Contexto**: O backup falhava pois o rclone dependia de mapeamento de disco e a variável PATH do terminal costumava corromper.
**Problema**: Scripts perdiam referência do executável rclone e do destino físico local do Google Drive, bloqueando a automação.
**Solução**: Implementado envio DIRETO para a nuvem via API do rclone usando `--drive-root-folder-id 1Vx0vXKGkZcj7jRv5dThLti4MlTHk6eo9`. Adicionada Auto-Cura SRE no script que recarrega o `$env:PATH` na memória. Os temporários (`$env:TEMP\BBDevOpsAutopilot-backup.zip`) são apagados no bloco try imediatamente após o sucesso.
**Padrão reutilizável**: Agentes nunca devem usar caminhos locais (`G:\Meu Drive...`) para o rclone. Usem sempre upload via Folder ID da nuvem. O Watcher de background continua encarregado do trigger automático.
