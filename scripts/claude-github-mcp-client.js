#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadClaudeGitHubServerConfig() {
  const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
  const launcherPath = path.join(os.homedir(), ".claude", "mcp-github-start.cmd");

  if (process.platform === "win32" && fs.existsSync(launcherPath)) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `"${launcherPath}"`],
    };
  }

  if (!fs.existsSync(settingsPath)) {
    fail(`Claude settings not found at ${settingsPath}`);
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (error) {
    fail(`Failed to parse Claude settings.json: ${error.message}`);
  }

  const github = settings?.mcpServers?.github;
  if (!github || typeof github !== "object") {
    fail("Claude GitHub MCP server config was not found in settings.json");
  }

  if (!github.command || !Array.isArray(github.args)) {
    fail("Claude GitHub MCP config is missing command/args");
  }

  return {
    command: github.command,
    args: github.args,
  };
}

function encodeMessage(payload) {
  return `${JSON.stringify(payload)}\n`;
}

class McpClient {
  constructor(serverConfig, timeoutMs = 15000) {
    this.serverConfig = serverConfig;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.proc = null;
    this.closed = false;
  }

  async start() {
    this.proc = spawn(this.serverConfig.command, this.serverConfig.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });

    this.proc.stdout.on("data", (chunk) => this.onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8").trim();
      if (text) process.stderr.write(`${text}\n`);
    });
    this.proc.on("exit", (code, signal) => {
      this.closed = true;
      const reason =
        signal !== null
          ? `signal ${signal}`
          : `exit code ${String(code ?? "unknown")}`;
      this.rejectAll(new Error(`MCP server exited with ${reason}`));
    });
    this.proc.on("error", (error) => {
      this.closed = true;
      this.rejectAll(error);
    });

    const init = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "codex-claude-github-mcp-client",
        version: "1.0.0",
      },
    });

    this.notify("notifications/initialized", {});
    return init;
  }

  stop() {
    if (this.proc && !this.closed) {
      this.proc.kill();
    }
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  onStdout(chunk) {
    this.buffer += chunk.toString("utf8");

    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd < 0) return;

      const line = this.buffer.slice(0, lineEnd).trim();
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        this.rejectAll(new Error(`Failed to parse MCP line: ${error.message}`));
        return;
      }

      this.onMessage(message);
    }
  }

  onMessage(message) {
    if (Object.prototype.hasOwnProperty.call(message, "id")) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeout);

      if (message.error) {
        pending.reject(
          new Error(message.error.message || JSON.stringify(message.error)),
        );
        return;
      }

      pending.resolve(message.result);
      return;
    }

    const logMessage = JSON.stringify(message);
    process.stderr.write(`[mcp-notify] ${logMessage}\n`);
  }

  write(payload) {
    if (!this.proc || this.closed) {
      throw new Error("MCP server is not running");
    }
    this.proc.stdin.write(encodeMessage(payload), "utf8");
  }

  request(method, params) {
    const id = this.nextId++;
    this.write({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for MCP response ${id}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  notify(method, params) {
    this.write({
      jsonrpc: "2.0",
      method,
      params,
    });
  }
}

async function main() {
  const command = process.argv[2];
  if (!command) {
    fail(
      "Usage: node scripts/claude-github-mcp-client.js <list-tools|call> [toolName] [jsonArgs]",
    );
  }

  const client = new McpClient(loadClaudeGitHubServerConfig());

  try {
    await client.start();

    if (command === "list-tools") {
      const result = await client.request("tools/list", {});
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (command === "call") {
      const toolName = process.argv[3];
      if (!toolName) {
        fail("Usage: ... call <toolName> [jsonArgs]");
      }

      let toolArgs = {};
      if (process.argv[4]) {
        try {
          toolArgs = JSON.parse(process.argv[4]);
        } catch (error) {
          fail(`Invalid JSON args: ${error.message}`);
        }
      }

      const result = await client.request("tools/call", {
        name: toolName,
        arguments: toolArgs,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    fail(`Unknown command: ${command}`);
  } finally {
    client.stop();
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
