import fs from "fs";
import path from "path";
import client from "prom-client";

export const metricsRegistry = new client.Registry();

client.collectDefaultMetrics({ register: metricsRegistry });

const applicationInfo = new client.Gauge({
  name: "application_info",
  help: "records static application info such as it's semantic version number",
  labelNames: ["name", "version"],
});

let appName = "psc-sre-automacao-controller";
let appVersion = "0.0.0";

try {
  const pkgRaw = fs.readFileSync(
    path.join(process.cwd(), "package.json"),
    "utf-8",
  );
  const pkg = JSON.parse(pkgRaw) as { name?: string; version?: string };
  if (pkg.name) appName = pkg.name;
  if (pkg.version) appVersion = pkg.version;
} catch {
  // If package.json is unavailable/malformed, fall back to defaults.
}

applicationInfo.labels(appName, appVersion).set(1);
metricsRegistry.registerMetric(applicationInfo);

export const dependencyUp = new client.Gauge({
  name: "dependency_up",
  help: "records if a dependency is up or down. 1 for up, 0 for down",
  labelNames: ["name"],
});

dependencyUp.labels("self").set(1);
metricsRegistry.registerMetric(dependencyUp);

export const requestSeconds = new client.Histogram({
  name: "request_seconds",
  help: "records in a histogram the number of http requests and their duration in seconds",
  labelNames: ["type", "status", "method", "addr", "isError", "errorMessage"],

  buckets: [0.1, 0.3, 1.5, 10.5],
});

metricsRegistry.registerMetric(requestSeconds);

export const responseSizeBytes = new client.Counter({
  name: "response_size_bytes",
  help: "counts the size of each http response",
  labelNames: ["type", "status", "method", "addr", "isError", "errorMessage"],
});

metricsRegistry.registerMetric(responseSizeBytes);
