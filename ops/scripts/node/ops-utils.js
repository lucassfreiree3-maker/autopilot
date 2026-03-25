/**
 * ops-utils.js — Shared operational utilities for Node.js automation scripts.
 *
 * Usage:
 *   import { OpsLogger, apiRequest, loadConfig } from './ops-utils.js';
 */

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const OPS_DIR = resolve(REPO_ROOT, 'ops');
const CONFIG_DIR = resolve(OPS_DIR, 'config');
const LOG_DIR = resolve(OPS_DIR, 'logs');
const LOG_FILE = resolve(LOG_DIR, 'ops-log.jsonl');

// Ensure log directory exists
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

/**
 * Structured operational logger — appends to ops/logs/ops-log.jsonl
 */
export class OpsLogger {
  constructor(workspace = 'ws-cit', agent = 'claude-code') {
    this.workspace = workspace;
    this.agent = agent;
  }

  log(action, description, result = 'info', details = '') {
    const entry = {
      timestamp: new Date().toISOString(),
      workspace: this.workspace,
      agent: this.agent,
      action,
      description,
      result,
      details,
    };
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    return entry;
  }

  success(action, description, details = '') {
    return this.log(action, description, 'success', details);
  }

  error(action, description, details = '') {
    return this.log(action, description, 'error', details);
  }
}

/**
 * HTTP request with retry and exponential backoff
 */
export async function apiRequest(url, options = {}, retries = 3, backoff = 2) {
  const { default: fetch } = await import('node-fetch');

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url, { timeout: 30000, ...options });
      if ([429, 500, 502, 503, 504].includes(resp.status) && attempt < retries - 1) {
        await new Promise(r => setTimeout(r, backoff ** (attempt + 1) * 1000));
        continue;
      }
      const contentType = resp.headers.get('content-type') || '';
      const body = contentType.includes('json') ? await resp.json() : await resp.text();
      return { success: resp.ok, statusCode: resp.status, body };
    } catch (err) {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, backoff ** (attempt + 1) * 1000));
      } else {
        return { success: false, error: err.message };
      }
    }
  }
}

/**
 * Load tool configuration from ops/config/
 */
export function loadConfig(tool) {
  const configMap = {
    aws: 'cloud/aws/aws-config.json',
    azure: 'cloud/azure/azure-config.json',
    gcp: 'cloud/gcp/gcp-config.json',
    k8s: 'k8s/k8s-config.json',
    terraform: 'terraform/terraform-config.json',
    datadog: 'monitoring/datadog/datadog-config.json',
    grafana: 'monitoring/grafana/grafana-config.json',
    prometheus: 'monitoring/prometheus/prometheus-config.json',
    github: 'ci/github/github-config.json',
    gitlab: 'ci/gitlab/gitlab-config.json',
    jenkins: 'ci/jenkins/jenkins-config.json',
  };
  const configPath = resolve(CONFIG_DIR, configMap[tool] || `${tool}/${tool}-config.json`);
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return { error: `Config not found: ${configPath}` };
  }
}

/**
 * Run shell command and return result
 */
export function runCommand(cmd, timeoutMs = 120000) {
  try {
    const stdout = execSync(cmd, { timeout: timeoutMs, encoding: 'utf8' });
    return { success: true, stdout: stdout.trim() };
  } catch (err) {
    return { success: false, stderr: err.stderr?.trim() || err.message };
  }
}

export { REPO_ROOT, OPS_DIR, CONFIG_DIR, LOG_DIR };
