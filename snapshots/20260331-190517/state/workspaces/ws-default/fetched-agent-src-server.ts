import { App, Routers, logger } from "dev-typescript-libs";
import { environment } from "./config/environment";
import { ApisRouter } from "./routes/apis";
import swaggerJson from "./swagger/swagger.json";
import { JWTService } from "./util/jwt";
import { AUTOMATIONS } from "./config/automations.config";
import {
  AUTO_REGISTER_INITIAL_DELAY_MS,
  AUTO_REGISTER_INTERVAL_MS,
  buildAutoRegisterFingerprint,
  buildAutoRegisterHttpHint,
  buildAutoRegisterSettings,
  describeAutoRegisterError,
  formatAutoRegisterSettings,
  formatAutoRegisterTarget,
  readAutoRegisterResponseDetail,
  sanitizeAutoRegisterLogValue,
} from "./util/auto-register";

process.env.no_proxy = [
  process.env.no_proxy,
  process.env.NO_PROXY,
  "localhost",
].join(",");

const { router } = new Routers(environment);
new ApisRouter(router);

const app = App(router, environment, swaggerJson);
let autoRegisterAttempt = 0;
let lastAutoRegisterFingerprint = "";
let lastAutoRegisterRepeatCount = 0;

function getAutoRegisterSettings() {
  return buildAutoRegisterSettings(process.env, {
    initialDelayMs: AUTO_REGISTER_INITIAL_DELAY_MS,
    intervalMs: AUTO_REGISTER_INTERVAL_MS,
  });
}

function trackAutoRegisterFingerprint(fingerprint: string): {
  repeatCount: number;
  shouldLog: boolean;
} {
  if (fingerprint === lastAutoRegisterFingerprint) {
    lastAutoRegisterRepeatCount += 1;
    return {
      repeatCount: lastAutoRegisterRepeatCount,
      shouldLog: lastAutoRegisterRepeatCount === 1 ||
        lastAutoRegisterRepeatCount % 10 === 0,
    };
  }

  lastAutoRegisterFingerprint = fingerprint;
  lastAutoRegisterRepeatCount = 1;
  return { repeatCount: 1, shouldLog: true };
}

function logAvailableAutomations() {
  const entries = Object.entries(AUTOMATIONS);
  const maxNameLen = Math.max(...entries.map(([name]) => name.length));
  const maxTypeLen = Math.max(...entries.map(([, a]) => a.type.length));

  logger.info("Automacoes disponiveis:");
  entries.forEach(([name, automation]) => {
    const paddedType = automation.type.padEnd(maxTypeLen);
    const paddedName = name.padEnd(maxNameLen);
    logger.info(
      `  [${paddedType}]  ${paddedName}  -> ${automation.description}`,
    );
  });
}

async function autoRegisterAgent() {
  autoRegisterAttempt += 1;
  const attempt = autoRegisterAttempt;
  const settings = getAutoRegisterSettings();
  const targetContext = formatAutoRegisterTarget(settings);

  try {
    const registrationData = {
      namespace: settings.namespace,
      cluster: settings.cluster,
      environment: settings.environment,
    };

    const token = JWTService.generateCallbackToken({
      agentId: settings.agentId !== "-" ? settings.agentId : undefined,
      scope: [settings.scope],
    });

    const timeoutMs = settings.timeoutMs;
    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(settings.controllerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(registrationData),
        signal: abort.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      const fingerprint = buildAutoRegisterFingerprint({
        kind: "success",
        status: response.status,
      });
      const { repeatCount, shouldLog } =
        trackAutoRegisterFingerprint(fingerprint);

      if (shouldLog) {
        logger.info(
          "Auto-registro concluido event=registered attempt=%s repeats=%s httpStatus=%s %s",
          attempt,
          repeatCount,
          response.status,
          targetContext,
        );
      }
    } else if (response.status === 409) {
      const fingerprint = buildAutoRegisterFingerprint({
        kind: "already-registered",
        status: response.status,
      });
      const { repeatCount, shouldLog } =
        trackAutoRegisterFingerprint(fingerprint);

      if (shouldLog) {
        logger.info(
          "Auto-registro idempotente event=already-registered attempt=%s repeats=%s httpStatus=409 %s",
          attempt,
          repeatCount,
          targetContext,
        );
      }
    } else {
      const detail = await readAutoRegisterResponseDetail(response);
      const fingerprint = buildAutoRegisterFingerprint({
        kind: "http-error",
        status: response.status,
        detail,
      });
      const { repeatCount, shouldLog } =
        trackAutoRegisterFingerprint(fingerprint);

      if (shouldLog) {
        logger.error(
          "Auto-registro falhou event=http-error attempt=%s repeats=%s httpStatus=%s statusText=%s hint=%s detail=%s %s",
          attempt,
          repeatCount,
          response.status,
          sanitizeAutoRegisterLogValue(response.statusText || "-", 64),
          buildAutoRegisterHttpHint(response.status),
          detail,
          targetContext,
        );
      }
    }
  } catch (error) {
    const described =
      error instanceof Error && error.name === "AbortError"
        ? {
            code: "ABORT_ERR",
            message: `No response from Controller after ${settings.timeoutMs}ms`,
            hint: "controller-timeout",
          }
        : describeAutoRegisterError(error);
    const fingerprint = buildAutoRegisterFingerprint({
      kind: "network-error",
      code: described.code,
      detail: described.message,
    });
    const { repeatCount, shouldLog } =
      trackAutoRegisterFingerprint(fingerprint);

    if (shouldLog) {
      logger.error(
        "Auto-registro falhou event=network-error attempt=%s repeats=%s code=%s hint=%s error=%s %s",
        attempt,
        repeatCount,
        described.code,
        described.hint,
        described.message,
        targetContext,
      );
    }
  }
}

const startServer = async () => {
  const appHost: string = "0.0.0.0";
  logger.info("Iniciando aplicacao");
  const autoRegisterSettings = getAutoRegisterSettings();

  const server = app.listen(environment.app.port, appHost, async () => {
    if (app !== undefined) {
      logger.info("Servidor iniciado na porta %s", environment.app.port);
      logger.info("%s esta online", app.locals.name);

      logAvailableAutomations();
      logger.info(
        "Auto-registro configurado %s",
        formatAutoRegisterSettings(autoRegisterSettings),
      );

      setTimeout(() => {
        autoRegisterAgent();
        setInterval(
          () => autoRegisterAgent(),
          autoRegisterSettings.intervalMs,
        );
      }, autoRegisterSettings.initialDelayMs);
    }
  });

  return server;
};

startServer();

export { app, startServer };
