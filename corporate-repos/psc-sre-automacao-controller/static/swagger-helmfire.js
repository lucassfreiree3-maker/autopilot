/* eslint-env browser */
(function swaggerHelmfireGuide() {
  const PUBLIC_PATHS = new Set([
    "/health",
    "/ready",
    "/metrics",
    "/agent/list",
    "/agent/info",
    "/agent/errors",
    "/logs/rotate",
  ]);

  const HYBRID_AUTH_PATHS = new Set(["/oas/sre-controller"]);

  const FLOW_HINTS = {
    "POST /auth/token": "Emite o JWT para as rotas protegidas.",
    "GET /auth/required-scopes":
      "Mostra quais scopes cada rota exige no ambiente atual.",
    "GET /agent/list": "Valide quais Agents estao registrados antes de executar.",
    "GET /agent/info": "Use como primeiro teste sem autenticacao.",
    "POST /agent/register": "Cadastro do Agent no Controller.",
    "POST /agent/execute": "Dispara uma automacao diretamente no Agent.",
    "GET /agent/execute": "Consulta o andamento de uma execucao pelo execId.",
    "POST /agent/execute/logs":
      "Usado pelo Agent para enviar logs e mudancas de estado.",
    "GET /logs/rotate":
      "Rotaciona logs locais e tenta publicar arquivos no bucket configurado.",
    "POST /oas/sre-controller":
      "Entrada unificada para fluxo OAS/TechBB com validacao de imagem e clusters.",
    "GET /oas/automations": "Lista as automacoes publicadas para integracao OAS.",
    "GET /oas/automations/{automation}":
      "Mostra os parametros aceitos por uma automacao.",
    "POST /oas/automations/{automation}":
      "Executa a automacao legada selecionada.",
  };

  function text(node) {
    return node && node.textContent ? node.textContent.trim() : "";
  }

  function createNode(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function classifyAuth(path) {
    if (path === "/auth/token" || path === "/auth/required-scopes") {
      return { label: "x-api-key", tone: "auth" };
    }
    if (PUBLIC_PATHS.has(path)) return { label: "Sem JWT", tone: "public" };
    if (HYBRID_AUTH_PATHS.has(path)) {
      return { label: "JWT ou origem interna", tone: "hybrid" };
    }
    return { label: "Bearer JWT", tone: "auth" };
  }

  function findOperation(path, method) {
    const opblocks = Array.from(document.querySelectorAll(".swagger-ui .opblock"));
    return opblocks.find((opblock) => {
      const opPath = text(opblock.querySelector(".opblock-summary-path"));
      const opMethod = text(opblock.querySelector(".opblock-summary-method")).toUpperCase();
      return opPath === path && opMethod === method.toUpperCase();
    });
  }

  function openOperation(opblock) {
    if (!opblock) return;

    const tagButton = opblock
      .closest(".opblock-tag-section")
      ?.querySelector(".opblock-tag");

    if (tagButton && tagButton.getAttribute("aria-expanded") !== "true") {
      tagButton.click();
    }

    const summary = opblock.querySelector(".opblock-summary");
    if (summary && summary.getAttribute("aria-expanded") !== "true") {
      summary.click();
    }

    opblock.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addGuidePanel() {
    const info = document.querySelector(".swagger-ui .information-container .info");
    if (!info || info.querySelector(".hf-guide")) return;

    const guide = createNode(`
      <section class="hf-guide">
        <span class="hf-guide__eyebrow">Guia rapido</span>
        <h2 class="hf-guide__title">Use esta API sem adivinhacao</h2>
        <p class="hf-guide__lead">
          A documentacao abaixo foi organizada para quem esta usando a API pela primeira vez.
          Siga a ordem sugerida, use os exemplos prontos e avance para as rotas de execucao
          somente depois de validar token, Agent e parametros obrigatorios.
        </p>
        <div class="hf-guide__grid">
          <article class="hf-guide__card">
            <h3>Primeiro acesso</h3>
            <ol>
              <li>Teste <code>GET /health</code> ou <code>GET /agent/info</code>.</li>
              <li>Se a rota exigir autenticacao, gere token em <code>POST /auth/token</code>.</li>
              <li>Cole o token no botao <strong>Authorize</strong>.</li>
            </ol>
          </article>
          <article class="hf-guide__card">
            <h3>Fluxo Agent</h3>
            <ol>
              <li>Confirme clusters com <code>GET /agent/list</code>.</li>
              <li>Execute em <code>POST /agent/execute</code>.</li>
              <li>Consulte o resultado em <code>GET /agent/execute</code>.</li>
            </ol>
          </article>
          <article class="hf-guide__card">
            <h3>Fluxo OAS</h3>
            <ol>
              <li>Escolha a imagem permitida em <code>POST /oas/sre-controller</code>.</li>
              <li>Use nomes reais de cluster.</li>
              <li>Guarde o <code>execId</code> para acompanhar a execucao.</li>
            </ol>
          </article>
        </div>
        <div class="hf-guide__chips">
          <div class="hf-guide__chip">
            <strong>Datas e horas</strong>
            Todas as respostas operacionais usam America/Sao_Paulo.
          </div>
          <div class="hf-guide__chip">
            <strong>Exemplos seguros</strong>
            Os exemplos usam valores ficticios, sem credenciais reais.
          </div>
          <div class="hf-guide__chip">
            <strong>Melhor ordem de teste</strong>
            Info/List -> Token -> Execute -> Consulta de status.
          </div>
          <div class="hf-guide__chip">
            <strong>Erros comuns</strong>
            Token sem scope, cluster inexistente, payload fora do formato esperado.
          </div>
        </div>
        <div class="hf-guide__actions">
          <button class="hf-guide__button" data-path="/auth/token" data-method="POST">1. Emitir token</button>
          <button class="hf-guide__button" data-path="/auth/required-scopes" data-method="GET">2. Ver scopes por rota</button>
          <button class="hf-guide__button" data-path="/agent/info" data-method="GET">3. Testar rota publica</button>
          <button class="hf-guide__button" data-path="/agent/execute" data-method="POST">4. Executar no Agent</button>
          <button class="hf-guide__button" data-path="/oas/sre-controller" data-method="POST">5. Abrir fluxo OAS</button>
        </div>
      </section>
    `);

    guide.querySelectorAll("[data-path]").forEach((button) => {
      button.addEventListener("click", () => {
        const path = button.getAttribute("data-path");
        const method = button.getAttribute("data-method") || "GET";
        openOperation(findOperation(path, method));
      });
    });

    info.appendChild(guide);
  }

  function addToolbar() {
    const schemeContainer = document.querySelector(".swagger-ui .scheme-container");
    const firstTagSection = document.querySelector(".swagger-ui .opblock-tag-section");

    if (!schemeContainer || !firstTagSection) return;
    if (document.querySelector(".hf-toolbar")) return;

    const toolbar = createNode(`
      <section class="hf-toolbar">
        <div class="hf-toolbar__text">
          <strong>Atalhos da documentacao</strong>
          <span>Expanda tudo, recolha tudo ou va direto para as rotas mais usadas.</span>
        </div>
        <div class="hf-toolbar__actions">
          <button class="hf-toolbar__button" data-action="expand">Expandir secoes</button>
          <button class="hf-toolbar__button" data-action="collapse">Recolher secoes</button>
          <button class="hf-toolbar__button" data-path="/agent/list" data-method="GET">Agents cadastrados</button>
          <button class="hf-toolbar__button" data-path="/logs/rotate" data-method="GET">Rotacao de logs</button>
        </div>
      </section>
    `);

    toolbar.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.getAttribute("data-action");
        document
          .querySelectorAll(".swagger-ui .opblock-tag-section .opblock-tag")
          .forEach((tagButton) => {
            const expanded = tagButton.getAttribute("aria-expanded") === "true";
            if (action === "expand" && !expanded) tagButton.click();
            if (action === "collapse" && expanded) tagButton.click();
          });
      });
    });

    toolbar.querySelectorAll("[data-path]").forEach((button) => {
      button.addEventListener("click", () => {
        const path = button.getAttribute("data-path");
        const method = button.getAttribute("data-method") || "GET";
        openOperation(findOperation(path, method));
      });
    });

    firstTagSection.parentNode.insertBefore(toolbar, firstTagSection);
  }

  function decorateOperations() {
    document.querySelectorAll(".swagger-ui .opblock").forEach((opblock) => {
      if (opblock.getAttribute("data-hf-decorated") === "true") return;

      const path = text(opblock.querySelector(".opblock-summary-path"));
      const method = text(opblock.querySelector(".opblock-summary-method")).toUpperCase();
      const summary = opblock.querySelector(".opblock-summary-description");

      if (!path || !method || !summary) return;

      const key = `${method} ${path}`;
      const auth = classifyAuth(path);
      const flowText = FLOW_HINTS[key];

      const hints = document.createElement("div");
      hints.className = "hf-op-hints";

      const authChip = createNode(
        `<span class="hf-op-chip hf-op-chip--${auth.tone}">${auth.label}</span>`,
      );
      hints.appendChild(authChip);

      if (flowText) {
        const flowChip = createNode(
          `<span class="hf-op-chip hf-op-chip--flow">${flowText}</span>`,
        );
        hints.appendChild(flowChip);
      }

      summary.appendChild(hints);
      opblock.setAttribute("data-hf-decorated", "true");
    });
  }

  function boot() {
    addGuidePanel();
    addToolbar();
    decorateOperations();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("load", boot);

  const observer = new MutationObserver(() => boot());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
