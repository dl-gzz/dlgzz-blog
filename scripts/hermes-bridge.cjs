"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/package.json"(exports2, module2) {
    module2.exports = {
      name: "dotenv",
      version: "16.4.7",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/lib/main.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var crypto = require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      const vaultPath = _vaultPath(options);
      const result = DotenvModule.configDotenv({ path: vaultPath });
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _log(message) {
      console.log(`[dotenv@${version}][INFO] ${message}`);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path.resolve(process.cwd(), ".env.vault");
      }
      if (fs.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path.join(os.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      _log("Loading env from encrypted .env.vault");
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path2 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs.readFileSync(path2, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path2} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/lib/env-options.js
var require_env_options = __commonJS({
  "node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/lib/env-options.js"(exports2, module2) {
    var options = {};
    if (process.env.DOTENV_CONFIG_ENCODING != null) {
      options.encoding = process.env.DOTENV_CONFIG_ENCODING;
    }
    if (process.env.DOTENV_CONFIG_PATH != null) {
      options.path = process.env.DOTENV_CONFIG_PATH;
    }
    if (process.env.DOTENV_CONFIG_DEBUG != null) {
      options.debug = process.env.DOTENV_CONFIG_DEBUG;
    }
    if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
      options.override = process.env.DOTENV_CONFIG_OVERRIDE;
    }
    if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
      options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
    }
    module2.exports = options;
  }
});

// node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/lib/cli-options.js
var require_cli_options = __commonJS({
  "node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/lib/cli-options.js"(exports2, module2) {
    var re = /^dotenv_config_(encoding|path|debug|override|DOTENV_KEY)=(.+)$/;
    module2.exports = function optionMatcher(args) {
      return args.reduce(function(acc, cur) {
        const matches = cur.match(re);
        if (matches) {
          acc[matches[1]] = matches[2];
        }
        return acc;
      }, {});
    };
  }
});

// node_modules/.pnpm/dotenv@16.4.7/node_modules/dotenv/config.js
(function() {
  require_main().config(
    Object.assign(
      {},
      require_env_options(),
      require_cli_options()(process.argv)
    )
  );
})();

// scripts/hermes-bridge.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_http = require("node:http");
var import_node_crypto = require("node:crypto");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var HOST = process.env.HERMES_BRIDGE_HOST || "127.0.0.1";
var PORT = Number(process.env.HERMES_BRIDGE_PORT || 7319);
var TOKEN = process.env.HERMES_BRIDGE_TOKEN?.trim() || "";
var HERMES_CLI_COMMAND = process.env.HERMES_CLI_COMMAND?.trim() || "";
var WORKDIR = process.env.HERMES_BRIDGE_WORKDIR || "/Users/baiyang/Desktop/one-worker-os";
var DRY_RUN = process.env.HERMES_BRIDGE_DRY_RUN === "1";
var AUTO_START_GATEWAY = process.env.HERMES_BRIDGE_AUTO_START_GATEWAY !== "0";
var DATA_DIR = process.env.HERMES_BRIDGE_DATA_DIR || (0, import_node_path.join)(WORKDIR, ".hermes-bridge");
var COMMAND_TIMEOUT_MS = Number(
  process.env.HERMES_BRIDGE_COMMAND_TIMEOUT_MS || 12e4
);
var ACTIVATION_TTL_MS = Number(
  process.env.HERMES_BRIDGE_ACTIVATION_TTL_MS || 8 * 60 * 1e3
);
var ILINK_BASE_URL = "https://ilinkai.weixin.qq.com";
var ILINK_APP_CLIENT_VERSION = String(2 << 16 | 2 << 8 | 0);
var QR_TIMEOUT_MS = Number(process.env.HERMES_BRIDGE_QR_TIMEOUT_MS || 1e4);
var LEARNING_ASSISTANT_SCRIPT = process.env.LEARNING_ASSISTANT_SCRIPT || (0, import_node_path.join)(
  getHermesHome(),
  "skills",
  "learning-assistant",
  "scripts",
  "learning_assistant.py"
);
var LEARNING_ASSISTANT_PYTHON = process.env.LEARNING_ASSISTANT_PYTHON || "python3";
var LEARNING_ASSISTANT_TOKEN = process.env.LEARNING_ASSISTANT_TOKEN?.trim() || "";
var LEARNING_ASSISTANT_TIMEOUT_MS = Number(process.env.LEARNING_ASSISTANT_TIMEOUT_SECONDS || 60) * 1e3;
var LEARNING_ASSISTANT_ALLOWED_COMMANDS = /* @__PURE__ */ new Set([
  "answer_parent",
  "bind_parent",
  "bind_parent_from_message",
  "create_bind_token",
  "create_student",
  "daily_report",
  "list_parent_students",
  "next_practice",
  "record_quiz",
  "set_profile",
  "snapshot"
]);
var PROFILE_WEIXIN_ENV_KEYS = [
  "WEIXIN_ACCOUNT_ID",
  "WEIXIN_TOKEN",
  "WEIXIN_BASE_URL",
  "WEIXIN_CDN_BASE_URL",
  "WEIXIN_DM_POLICY",
  "WEIXIN_ALLOWED_USERS",
  "WEIXIN_ALLOW_ALL_USERS",
  "WEIXIN_HOME_CHANNEL",
  "WEIXIN_HOME_CHANNEL_NAME"
];
var server = (0, import_node_http.createServer)(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
    if (!isAuthorized(request, url.pathname)) {
      sendJson(response, 401, {
        success: false,
        code: "UNAUTHORIZED",
        error: "Hermes Bridge token \u6821\u9A8C\u5931\u8D25"
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      await handleHealth(response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/learning-assistant/run") {
      await handleLearningAssistantRun(request, response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/admin/assistants") {
      await handleAdminAssistants(response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/assistants/provision") {
      await handleProvision(request, response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/activations/status") {
      await handleActivationStatus(url, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/pairing/approve") {
      await handlePairingApprove(request, response);
      return;
    }
    sendJson(response, 404, {
      success: false,
      code: "NOT_FOUND",
      error: "\u672A\u77E5 Hermes Bridge \u8DEF\u5F84"
    });
  } catch (error) {
    sendJson(response, 500, {
      success: false,
      code: "BRIDGE_INTERNAL_ERROR",
      error: error instanceof Error ? error.message : "Hermes Bridge \u5185\u90E8\u9519\u8BEF"
    });
  }
});
server.listen(PORT, HOST, () => {
  console.log(`Hermes Bridge listening on http://${HOST}:${PORT}`);
  console.log(`Hermes workspace: ${WORKDIR}`);
  console.log(`Dry run: ${DRY_RUN ? "on" : "off"}`);
});
async function handleHealth(response) {
  const weixin = getWeixinState();
  const gateway = getGatewayState();
  const pairing = getPairingState();
  sendJson(response, 200, {
    success: true,
    status: "ok",
    mode: DRY_RUN ? "dry_run" : "hermes",
    workdir: WORKDIR,
    hermesHome: getHermesHome(),
    learningAssistant: {
      script: LEARNING_ASSISTANT_SCRIPT,
      scriptExists: (0, import_node_fs.existsSync)(LEARNING_ASSISTANT_SCRIPT)
    },
    gateway,
    weixin,
    pairing
  });
}
async function handleLearningAssistantRun(request, response) {
  const body = await readJson(request);
  const command = typeof body.command === "string" ? body.command.trim() : "";
  const args = Array.isArray(body.args) ? body.args : [];
  if (!LEARNING_ASSISTANT_ALLOWED_COMMANDS.has(command)) {
    sendJson(response, 400, {
      success: false,
      error: "unsupported command"
    });
    return;
  }
  if (!args.every((item) => typeof item === "string")) {
    sendJson(response, 400, {
      success: false,
      error: "args must be a string array"
    });
    return;
  }
  if (!(0, import_node_fs.existsSync)(LEARNING_ASSISTANT_SCRIPT)) {
    sendJson(response, 500, {
      success: false,
      error: `script not found: ${LEARNING_ASSISTANT_SCRIPT}`
    });
    return;
  }
  const result = await runLearningAssistantScript(
    command,
    args,
    body.input
  );
  sendJson(response, result.status, result.payload);
}
async function handleProvision(request, response) {
  const body = await readJson(request);
  const assistantId = readRequiredString(body.assistantId, "assistantId");
  const userId = readRequiredString(body.userId, "userId");
  const roleId = readRequiredString(body.roleId, "roleId");
  const service = readServiceProvision(body, roleId);
  const existingActivation = getActivation(assistantId);
  const profileName = existingActivation?.profileName || buildProfileName({ assistantId, roleId, userId });
  const activationTtlMs = readActivationTtlMs(body.activationTtlSeconds);
  if (DRY_RUN) {
    sendJson(response, 200, {
      success: true,
      assistantId,
      status: "demo_ready",
      connectionMode: "demo",
      profileName,
      serviceId: service.id,
      serviceName: service.name,
      qrPayload: `hermes-demo://assistant/${profileName}?service=${encodeURIComponent(service.id)}`,
      qrImageUrl: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1e3).toISOString(),
      message: "Hermes Bridge dry-run\uFF1A\u5DF2\u8FD4\u56DE\u6F14\u793A\u63A5\u5165\u7801"
    });
    return;
  }
  const profile = await ensureProfile(profileName, service);
  if (existingActivation?.status !== "activated") {
    clearProfileWeixinCredentials(profileName);
  }
  storeAssistantRecord({
    assistantId,
    userId,
    roleId,
    serviceId: service.id,
    serviceName: service.name,
    workerInstanceId: service.workerInstanceId || "",
    employeeId: service.employeeId || "",
    employeeVersionId: service.employeeVersionId || "",
    profileName,
    source: typeof body.source === "string" ? body.source : "",
    locale: typeof body.locale === "string" ? body.locale : ""
  });
  if (existingActivation?.status === "activated") {
    const activated = await ensureActivatedGateway(existingActivation);
    sendJson(response, 200, {
      success: true,
      assistantId,
      status: activated.status,
      serviceId: service.id,
      serviceName: service.name,
      profileName,
      connectionMode: "already_activated",
      activationId: assistantId,
      qrPayload: null,
      qrImageUrl: null,
      expiresAt: activated.expiresAt,
      weixinAccountId: activated.accountId || null,
      weixinUserId: activated.weixinUserId || null,
      gatewayStatus: activated.gatewayStatus || null,
      gatewayError: activated.gatewayError || null,
      message: getActivationMessage(activated)
    });
    return;
  }
  const activation = await createWeixinActivation({
    assistantId,
    userId,
    roleId,
    serviceId: service.id,
    serviceName: service.name,
    workerInstanceId: service.workerInstanceId,
    employeeId: service.employeeId,
    employeeVersionId: service.employeeVersionId,
    profileName,
    activationTtlMs
  });
  sendJson(response, 200, {
    success: true,
    assistantId,
    status: activation.status,
    serviceId: service.id,
    serviceName: service.name,
    profileName,
    connectionMode: "qr_activation",
    activationId: assistantId,
    qrPayload: activation.qrPayload,
    qrImageUrl: null,
    expiresAt: activation.expiresAt,
    bindingInstructions: [
      "\u8BF7\u7528\u5FAE\u4FE1\u626B\u63CF\u4E8C\u7EF4\u7801\u5E76\u786E\u8BA4\u3002",
      "\u786E\u8BA4\u540E\u9875\u9762\u4F1A\u81EA\u52A8\u53D8\u4E3A\u6FC0\u6D3B\u6210\u529F\u3002",
      "\u6FC0\u6D3B\u6210\u529F\u540E\uFF0C\u8FD9\u4E2A\u5FAE\u4FE1\u8EAB\u4EFD\u4F1A\u5199\u5165\u5BF9\u5E94 Hermes Profile\u3002"
    ],
    message: profile.created ? "Hermes Profile \u5DF2\u521B\u5EFA\uFF1B\u8BF7\u626B\u7801\u6FC0\u6D3B\u5FAE\u4FE1\u52A9\u624B\u3002" : "Hermes Profile \u5DF2\u5B58\u5728\uFF1B\u8BF7\u626B\u7801\u6FC0\u6D3B\u5FAE\u4FE1\u52A9\u624B\u3002"
  });
}
async function handleAdminAssistants(response) {
  const assistants = readJsonFile(
    (0, import_node_path.join)(DATA_DIR, "assistants.json")
  ) || {};
  const activations = readActivations();
  const rows = Object.values(assistants).map((record) => {
    const assistantId = String(record.assistantId || "");
    const profileName = String(record.profileName || "");
    const activation = activations[assistantId] ? normalizeActivationForAdminList(activations[assistantId]) : null;
    const gateway = profileName ? getProfileGatewayState(profileName) : null;
    const configuredPlatforms = profileName ? getConfiguredProfilePlatforms(profileName) : /* @__PURE__ */ new Set();
    const activity = profileName ? getProfileActivity(profileName) : {};
    const weixin = activation?.accountId || record.weixinAccountId || "";
    const weixinUser = activation?.weixinUserId || record.weixinUserId || "";
    const gatewayStatus = gateway ? getProfileGatewayStatus(gateway) : "unknown";
    return {
      assistantId,
      userId: String(record.userId || ""),
      roleId: String(record.roleId || ""),
      workerInstanceId: String(
        record.workerInstanceId || activation?.workerInstanceId || ""
      ),
      employeeId: String(record.employeeId || activation?.employeeId || ""),
      employeeVersionId: String(
        record.employeeVersionId || activation?.employeeVersionId || ""
      ),
      serviceId: String(record.serviceId || activation?.serviceId || ""),
      serviceName: String(record.serviceName || activation?.serviceName || ""),
      profileName,
      source: String(record.source || ""),
      locale: String(record.locale || ""),
      status: activation?.status || "created",
      gatewayStatus,
      gatewayPid: gateway?.pid || null,
      gatewayUpdatedAt: gateway?.updated_at || null,
      platforms: serializeGatewayPlatforms(gateway, configuredPlatforms),
      weixinAccountId: weixin ? maskIdentifier(String(weixin)) : null,
      weixinUserId: weixinUser ? maskIdentifier(String(weixinUser)) : null,
      createdAt: activation?.createdAt || record.updatedAt || null,
      activatedAt: activation?.status === "activated" ? activation.updatedAt : record.activatedAt || null,
      updatedAt: activation?.updatedAt || record.updatedAt || null,
      expiresAt: activation?.expiresAt || null,
      lastInboundAt: activity.lastInboundAt || null,
      lastResponseAt: activity.lastResponseAt || null,
      logUpdatedAt: activity.logUpdatedAt || null,
      error: activation?.error || activation?.gatewayError || getGatewayError(gateway, configuredPlatforms) || null
    };
  });
  rows.sort(
    (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  );
  const summary = rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === "activated")
        acc.activated += 1;
      if (row.gatewayStatus === "running")
        acc.running += 1;
      if (["qr_ready", "scanned"].includes(row.status))
        acc.pending += 1;
      if (["failed", "expired"].includes(row.status))
        acc.needsAttention += 1;
      return acc;
    },
    {
      total: 0,
      activated: 0,
      running: 0,
      pending: 0,
      needsAttention: 0
    }
  );
  sendJson(response, 200, {
    success: true,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    workdir: WORKDIR,
    hermesHome: getHermesHome(),
    summary,
    assistants: rows
  });
}
async function handleActivationStatus(url, response) {
  const assistantId = url.searchParams.get("assistantId")?.trim() || "";
  if (!assistantId) {
    sendJson(response, 400, {
      success: false,
      code: "BAD_REQUEST",
      error: "\u7F3A\u5C11 assistantId"
    });
    return;
  }
  if (DRY_RUN) {
    sendJson(response, 200, {
      success: true,
      assistantId,
      status: "qr_ready",
      message: "Hermes Bridge dry-run\uFF1A\u7B49\u5F85\u6A21\u62DF\u626B\u7801"
    });
    return;
  }
  const activation = await pollWeixinActivation(assistantId);
  if (!activation) {
    sendJson(response, 404, {
      success: false,
      code: "ACTIVATION_NOT_FOUND",
      error: "\u6FC0\u6D3B\u4F1A\u8BDD\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F"
    });
    return;
  }
  sendJson(response, 200, {
    success: activation.status !== "failed",
    assistantId,
    status: activation.status,
    profileName: activation.profileName,
    qrPayload: activation.qrPayload,
    expiresAt: activation.expiresAt,
    weixinAccountId: activation.accountId || null,
    weixinUserId: activation.weixinUserId || null,
    gatewayStatus: activation.gatewayStatus || null,
    gatewayError: activation.gatewayError || null,
    error: activation.error || null,
    message: getActivationMessage(activation)
  });
}
async function handlePairingApprove(request, response) {
  const body = await readJson(request);
  const assistantId = readRequiredString(body.assistantId, "assistantId");
  const code = readRequiredString(body.code, "code").toUpperCase();
  if (!/^[A-Z2-9]{6,12}$/.test(code)) {
    sendJson(response, 400, {
      success: false,
      code: "BAD_PAIRING_CODE",
      error: "\u914D\u5BF9\u7801\u683C\u5F0F\u4E0D\u6B63\u786E"
    });
    return;
  }
  if (DRY_RUN) {
    sendJson(response, 200, {
      success: true,
      assistantId,
      status: "paired",
      message: "Hermes Bridge dry-run\uFF1A\u914D\u5BF9\u7801\u5DF2\u6A21\u62DF\u901A\u8FC7"
    });
    return;
  }
  const result = await runHermes(["pairing", "approve", "weixin", code], {
    allowFailure: true
  });
  const output = `${result.stdout}
${result.stderr}`.trim();
  const approved = result.code === 0 && /Approved!/i.test(output);
  if (!approved) {
    sendJson(response, 404, {
      success: false,
      assistantId,
      code: "PAIRING_CODE_NOT_FOUND",
      error: output || "\u914D\u5BF9\u7801\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F"
    });
    return;
  }
  const userMatch = output.match(/User\s+(.+?)\s+on\s+weixin/i);
  sendJson(response, 200, {
    success: true,
    assistantId,
    status: "paired",
    weixinUser: userMatch?.[1] || null,
    message: "\u5FAE\u4FE1\u7528\u6237\u5DF2\u901A\u8FC7 Hermes pairing \u6388\u6743"
  });
}
async function ensureProfile(profileName, service) {
  const show = await runHermes(["profile", "show", profileName], {
    allowFailure: true
  });
  if (show.code === 0) {
    writeProfileServiceFiles(profileName, service);
    return { created: false };
  }
  const created = await runHermes(
    ["profile", "create", "--clone", "--no-alias", profileName],
    { allowFailure: true }
  );
  if (created.code !== 0) {
    ensureMinimalProfile(profileName);
  }
  writeProfileServiceFiles(profileName, service);
  return { created: true };
}
function ensureMinimalProfile(profileName) {
  const profileHome = getProfileHome(profileName);
  (0, import_node_fs.mkdirSync)(profileHome, { recursive: true });
  for (const directory of [
    "logs",
    "sessions",
    "memory",
    "skills",
    "weixin/accounts"
  ]) {
    (0, import_node_fs.mkdirSync)((0, import_node_path.join)(profileHome, directory), { recursive: true });
  }
  for (const fileName of ["config.yaml", ".env", "SOUL.md"]) {
    const sourcePath = (0, import_node_path.join)(getHermesHome(), fileName);
    const targetPath = (0, import_node_path.join)(profileHome, fileName);
    if (!(0, import_node_fs.existsSync)(targetPath) && (0, import_node_fs.existsSync)(sourcePath)) {
      (0, import_node_fs.writeFileSync)(targetPath, (0, import_node_fs.readFileSync)(sourcePath, "utf8"));
      if (fileName === ".env")
        (0, import_node_fs.chmodSync)(targetPath, 384);
    }
  }
  const soulPath = (0, import_node_path.join)(profileHome, "SOUL.md");
  if (!(0, import_node_fs.existsSync)(soulPath)) {
    (0, import_node_fs.writeFileSync)(
      soulPath,
      "# Hermes Assistant\n\nYou are a focused WeChat AI assistant.\n"
    );
  }
}
function clearProfileWeixinCredentials(profileName) {
  const profileHome = getProfileHome(profileName);
  (0, import_node_fs.mkdirSync)((0, import_node_path.join)(profileHome, "weixin", "accounts"), { recursive: true });
  const emptyWeixinEnv = Object.fromEntries(
    PROFILE_WEIXIN_ENV_KEYS.map((key) => [key, ""])
  );
  upsertEnvFile((0, import_node_path.join)(profileHome, ".env"), emptyWeixinEnv);
  const accountDir = (0, import_node_path.join)(profileHome, "weixin", "accounts");
  for (const fileName of (0, import_node_fs.readdirSync)(accountDir)) {
    if (fileName.endsWith(".json")) {
      (0, import_node_fs.rmSync)((0, import_node_path.join)(accountDir, fileName), { force: true });
    }
  }
}
function writeProfileServiceFiles(profileName, service) {
  const profileHome = getProfileHome(profileName);
  (0, import_node_fs.mkdirSync)(profileHome, { recursive: true });
  const capabilityList = service.capabilities.map((item) => formatMarkdownBullet(item)).join("\n");
  const deliverableList = service.deliverables.map((item) => formatMarkdownBullet(item)).join("\n");
  const enabledSkillList = service.enabledSkills.map((skill) => `- ${skill.name}\uFF08${skill.skillType}/${skill.riskLevel}\uFF09\uFF1A${skill.summary}`).join("\n");
  const serviceDoc = [
    `# ${service.name}`,
    "",
    `Service ID: ${service.id}`,
    service.workerInstanceId ? `Worker Instance ID: ${service.workerInstanceId}` : "",
    service.employeeId ? `Employee ID: ${service.employeeId}` : "",
    service.employeeVersionId ? `Employee Version ID: ${service.employeeVersionId}` : "",
    "",
    service.summary,
    "",
    "## Capabilities",
    capabilityList || "- \u5FAE\u4FE1\u5BF9\u8BDD\u670D\u52A1",
    "",
    "## Enabled Skills",
    enabledSkillList || "- \u672A\u542F\u7528\u989D\u5916\u6280\u80FD",
    "",
    "## Deliverables",
    deliverableList || "- \u72EC\u7ACB Hermes Profile",
    ""
  ].join("\n");
  (0, import_node_fs.writeFileSync)((0, import_node_path.join)(profileHome, "SERVICE.md"), serviceDoc);
  if (service.soulSnapshot?.trim()) {
    (0, import_node_fs.writeFileSync)(
      (0, import_node_path.join)(profileHome, "EMPLOYEE_SOUL.md"),
      `${service.soulSnapshot.trim()}
`
    );
  }
  (0, import_node_fs.writeFileSync)(
    (0, import_node_path.join)(profileHome, "SOUL.md"),
    `${service.prompt.trim()}

---

${serviceDoc}`
  );
}
function formatMarkdownBullet(value) {
  return `- ${value.replace(/^\s*-\s*/, "").trim()}`;
}
async function createWeixinActivation({
  assistantId,
  userId,
  roleId,
  serviceId,
  serviceName,
  workerInstanceId,
  employeeId,
  employeeVersionId,
  profileName,
  activationTtlMs
}) {
  const qr = await requestIlinkQr();
  const now = /* @__PURE__ */ new Date();
  const activation = {
    assistantId,
    userId,
    roleId,
    serviceId,
    serviceName,
    workerInstanceId,
    employeeId,
    employeeVersionId,
    profileName,
    qrcode: qr.qrcode,
    qrPayload: qr.qrPayload,
    status: "qr_ready",
    baseUrl: ILINK_BASE_URL,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + (activationTtlMs || ACTIVATION_TTL_MS)
    ).toISOString()
  };
  upsertActivation(activation);
  return activation;
}
async function requestIlinkQr() {
  const data = await ilinkGet(
    ILINK_BASE_URL,
    `/ilink/bot/get_bot_qrcode?bot_type=3`
  );
  const qrcode = String(data.qrcode || "");
  const qrPayload = String(data.qrcode_img_content || data.qrcode || "");
  if (!qrcode || !qrPayload) {
    throw new Error("iLink \u6CA1\u6709\u8FD4\u56DE\u53EF\u7528\u4E8C\u7EF4\u7801");
  }
  return { qrcode, qrPayload };
}
async function pollWeixinActivation(assistantId) {
  const activation = getActivation(assistantId);
  if (!activation)
    return null;
  if (activation.status === "activated") {
    return ensureActivatedGateway(activation);
  }
  if (activation.status === "failed") {
    return activation;
  }
  if (Date.now() > new Date(activation.expiresAt).getTime()) {
    const expired = {
      ...activation,
      status: "expired",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    upsertActivation(expired);
    return expired;
  }
  try {
    const status = await ilinkGet(
      activation.baseUrl || ILINK_BASE_URL,
      `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(
        activation.qrcode
      )}`
    );
    const qrStatus = String(status.status || "wait");
    if (qrStatus === "scaned") {
      const scanned = {
        ...activation,
        status: "scanned",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      upsertActivation(scanned);
      return scanned;
    }
    if (qrStatus === "scaned_but_redirect") {
      const redirectHost = String(status.redirect_host || "");
      const redirected = {
        ...activation,
        baseUrl: redirectHost ? `https://${redirectHost}` : activation.baseUrl,
        status: "scanned",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      upsertActivation(redirected);
      return redirected;
    }
    if (qrStatus === "expired") {
      const expired = {
        ...activation,
        status: "expired",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      upsertActivation(expired);
      return expired;
    }
    if (qrStatus === "confirmed") {
      const accountId = String(status.ilink_bot_id || "");
      const token = String(status.bot_token || "");
      const baseUrl = String(status.baseurl || activation.baseUrl || ILINK_BASE_URL);
      const weixinUserId = String(status.ilink_user_id || "");
      if (!accountId || !token) {
        throw new Error("iLink \u5DF2\u786E\u8BA4\u626B\u7801\uFF0C\u4F46\u6CA1\u6709\u8FD4\u56DE\u5B8C\u6574\u8D26\u53F7\u51ED\u636E");
      }
      persistWeixinCredentials(activation.profileName, {
        accountId,
        token,
        baseUrl,
        weixinUserId
      });
      const gatewayStart = await ensureProfileGatewayStarted(activation.profileName);
      const confirmed = {
        ...activation,
        status: "activated",
        accountId,
        weixinUserId,
        baseUrl,
        gatewayStatus: gatewayStart.status,
        gatewayError: gatewayStart.error,
        gatewayStartedAt: gatewayStart.status === "running" ? (/* @__PURE__ */ new Date()).toISOString() : activation.gatewayStartedAt,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      upsertActivation(confirmed);
      updateAssistantRecord(activation.assistantId, {
        weixinAccountId: accountId,
        weixinUserId,
        gatewayStatus: gatewayStart.status,
        gatewayError: gatewayStart.error || "",
        activatedAt: confirmed.updatedAt
      });
      return confirmed;
    }
    return activation;
  } catch (error) {
    if (isPollingTimeout(error)) {
      const waiting = {
        ...activation,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      upsertActivation(waiting);
      return waiting;
    }
    const failed = {
      ...activation,
      status: "failed",
      error: error instanceof Error ? error.message : "\u67E5\u8BE2\u4E8C\u7EF4\u7801\u72B6\u6001\u5931\u8D25",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    upsertActivation(failed);
    return failed;
  }
}
function isPollingTimeout(error) {
  if (!(error instanceof Error))
    return false;
  return error.name === "AbortError" || error.name === "TimeoutError" || /timeout|aborted/i.test(error.message);
}
async function ilinkGet(baseUrl, endpoint) {
  const url = `${baseUrl.replace(/\/$/, "")}${endpoint}`;
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(QR_TIMEOUT_MS),
    headers: {
      "iLink-App-Id": "bot",
      "iLink-App-ClientVersion": ILINK_APP_CLIENT_VERSION
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`iLink GET ${endpoint} HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}
function getActivationMessage(activation) {
  if (activation.status === "activated") {
    if (activation.gatewayStatus === "running") {
      return "\u5FAE\u4FE1\u52A9\u624B\u5DF2\u6FC0\u6D3B\uFF0CHermes Gateway \u5DF2\u8FDE\u63A5";
    }
    if (activation.gatewayStatus === "start_failed") {
      return `\u5FAE\u4FE1\u52A9\u624B\u5DF2\u6FC0\u6D3B\uFF0C\u4F46 Gateway \u542F\u52A8\u5931\u8D25\uFF1A${activation.gatewayError || "\u8BF7\u68C0\u67E5 Hermes \u65E5\u5FD7"}`;
    }
    return "\u5FAE\u4FE1\u52A9\u624B\u5DF2\u6FC0\u6D3B\uFF0CHermes Gateway \u6B63\u5728\u542F\u52A8";
  }
  if (activation.status === "scanned")
    return "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u5FAE\u4FE1\u91CC\u786E\u8BA4";
  if (activation.status === "expired")
    return "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210";
  if (activation.status === "failed")
    return activation.error || "\u6FC0\u6D3B\u5931\u8D25";
  return "\u7B49\u5F85\u5FAE\u4FE1\u626B\u7801";
}
function getProfileHome(profileName) {
  if (profileName === "default")
    return getHermesHome();
  return (0, import_node_path.join)(getHermesHome(), "profiles", profileName);
}
function persistWeixinCredentials(profileName, {
  accountId,
  token,
  baseUrl,
  weixinUserId
}) {
  const profileHome = getProfileHome(profileName);
  const accountDir = (0, import_node_path.join)(profileHome, "weixin", "accounts");
  (0, import_node_fs.mkdirSync)(accountDir, { recursive: true });
  const accountPath = (0, import_node_path.join)(accountDir, `${accountId}.json`);
  (0, import_node_fs.writeFileSync)(
    accountPath,
    `${JSON.stringify(
      {
        token,
        base_url: baseUrl,
        user_id: weixinUserId,
        saved_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      null,
      2
    )}
`
  );
  (0, import_node_fs.chmodSync)(accountPath, 384);
  upsertEnvFile((0, import_node_path.join)(profileHome, ".env"), {
    FEISHU_APP_ID: "",
    FEISHU_APP_SECRET: "",
    FEISHU_ENCRYPT_KEY: "",
    FEISHU_VERIFICATION_TOKEN: "",
    FEISHU_HOME_CHANNEL: "",
    FEISHU_HOME_CHANNEL_NAME: "",
    WEIXIN_ACCOUNT_ID: accountId,
    WEIXIN_TOKEN: token,
    WEIXIN_BASE_URL: baseUrl,
    WEIXIN_CDN_BASE_URL: "https://novac2c.cdn.weixin.qq.com/c2c",
    WEIXIN_DM_POLICY: "allowlist",
    WEIXIN_ALLOWED_USERS: weixinUserId,
    WEIXIN_ALLOW_ALL_USERS: "false",
    WEIXIN_HOME_CHANNEL: weixinUserId,
    WEIXIN_HOME_CHANNEL_NAME: "Weixin Home"
  });
}
async function ensureActivatedGateway(activation) {
  const state = getProfileGatewayState(activation.profileName);
  if (isWeixinGatewayConnected(state)) {
    const running = {
      ...activation,
      gatewayStatus: "running",
      gatewayError: "",
      gatewayStartedAt: activation.gatewayStartedAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    upsertActivation(running);
    return running;
  }
  const lastUpdate = new Date(activation.updatedAt).getTime();
  const ageMs = Number.isFinite(lastUpdate) ? Date.now() - lastUpdate : Infinity;
  if (activation.gatewayStatus === "starting" && ageMs < 15e3 || activation.gatewayStatus === "start_failed" && ageMs < 3e4 && !isGatewayServiceMissing(activation.gatewayError || "")) {
    return activation;
  }
  const gatewayStart = await ensureProfileGatewayStarted(activation.profileName);
  const updated = {
    ...activation,
    gatewayStatus: gatewayStart.status,
    gatewayError: gatewayStart.error,
    gatewayStartedAt: gatewayStart.status === "running" ? (/* @__PURE__ */ new Date()).toISOString() : activation.gatewayStartedAt,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  upsertActivation(updated);
  updateAssistantRecord(activation.assistantId, {
    gatewayStatus: gatewayStart.status,
    gatewayError: gatewayStart.error || ""
  });
  return updated;
}
async function ensureProfileGatewayStarted(profileName) {
  if (isWeixinGatewayConnected(getProfileGatewayState(profileName))) {
    return { status: "running" };
  }
  let result = await runHermes(
    ["--profile", profileName, "gateway", "start"],
    { allowFailure: true }
  );
  let output = `${result.stdout}
${result.stderr}`.trim();
  if (result.code !== 0 && isGatewayServiceMissing(output)) {
    const install = await runHermes(
      ["--profile", profileName, "gateway", "install"],
      { allowFailure: true }
    );
    const installOutput = `${install.stdout}
${install.stderr}`.trim();
    if (install.code !== 0) {
      return {
        status: "start_failed",
        error: installOutput || `hermes --profile ${profileName} gateway install \u5931\u8D25`
      };
    }
    result = await runHermes(
      ["--profile", profileName, "gateway", "start"],
      { allowFailure: true }
    );
    output = `${result.stdout}
${result.stderr}`.trim();
  }
  if (result.code !== 0) {
    return {
      status: "start_failed",
      error: output || `hermes --profile ${profileName} gateway start \u5931\u8D25`
    };
  }
  const settled = await waitForProfileGateway(profileName, 12e3);
  if (isWeixinGatewayConnected(settled)) {
    return { status: "running" };
  }
  return { status: "starting" };
}
function isGatewayServiceMissing(output) {
  return /gateway service is not installed|run:\s*hermes\s+gateway\s+install/i.test(
    output
  );
}
async function waitForProfileGateway(profileName, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let state = getProfileGatewayState(profileName);
  while (Date.now() < deadline) {
    state = getProfileGatewayState(profileName);
    if (isWeixinGatewayConnected(state))
      return state;
    await delay(1e3);
  }
  return state;
}
function getProfileGatewayState(profileName) {
  return readJsonFile(
    (0, import_node_path.join)(getProfileHome(profileName), "gateway_state.json")
  ) || {
    gateway_state: "unknown",
    platforms: {}
  };
}
function normalizeActivationForAdminList(activation) {
  if (["qr_ready", "scanned"].includes(activation.status) && hasActivationExpired(activation)) {
    const expired = {
      ...activation,
      status: "expired",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    upsertActivation(expired);
    return expired;
  }
  return activation;
}
function hasActivationExpired(activation) {
  const expiresAt = new Date(activation.expiresAt).getTime();
  return Number.isFinite(expiresAt) && Date.now() > expiresAt;
}
function isWeixinGatewayConnected(gateway) {
  return gateway.gateway_state === "running" && gateway.platforms?.weixin?.state === "connected";
}
function getProfileGatewayStatus(gateway) {
  if (isWeixinGatewayConnected(gateway))
    return "running";
  if (gateway.gateway_state === "running")
    return "partial";
  if (gateway.gateway_state === "startup_failed")
    return "failed";
  if (gateway.gateway_state === "stopped")
    return "stopped";
  return gateway.gateway_state || "unknown";
}
function serializeGatewayPlatforms(gateway, configuredPlatforms = /* @__PURE__ */ new Set()) {
  if (!gateway?.platforms)
    return {};
  return Object.fromEntries(
    Object.entries(gateway.platforms).filter(
      ([name]) => configuredPlatforms.size ? configuredPlatforms.has(name) : true
    ).map(([name, platform]) => [
      name,
      {
        state: platform.state || "unknown",
        errorCode: platform.error_code || null,
        errorMessage: platform.error_message || null,
        updatedAt: platform.updated_at || null
      }
    ])
  );
}
function getGatewayError(gateway, configuredPlatforms = /* @__PURE__ */ new Set()) {
  const failed = Object.entries(gateway?.platforms || {}).find(
    ([name, platform]) => (!configuredPlatforms.size || configuredPlatforms.has(name)) && platform.error_message
  );
  return failed?.[1]?.error_message || null;
}
function getConfiguredProfilePlatforms(profileName) {
  const env = readDotEnv((0, import_node_path.join)(getProfileHome(profileName), ".env"));
  const platforms = /* @__PURE__ */ new Set();
  if (env.WEIXIN_ACCOUNT_ID && env.WEIXIN_TOKEN) {
    platforms.add("weixin");
  }
  if (env.FEISHU_APP_ID && env.FEISHU_APP_SECRET) {
    platforms.add("feishu");
  }
  return platforms;
}
function getProfileActivity(profileName) {
  const logPath = (0, import_node_path.join)(getProfileHome(profileName), "logs", "gateway.log");
  try {
    if (!(0, import_node_fs.existsSync)(logPath))
      return {};
    const stat = (0, import_node_fs.statSync)(logPath);
    const content = (0, import_node_fs.readFileSync)(logPath, "utf8").slice(-24e4);
    const lines = content.split(/\r?\n/).filter(Boolean);
    let lastInboundAt = "";
    let lastResponseAt = "";
    for (const line of lines) {
      if (line.includes("inbound message:")) {
        lastInboundAt = readLogTimestamp(line) || lastInboundAt;
      }
      if (line.includes("response ready:")) {
        lastResponseAt = readLogTimestamp(line) || lastResponseAt;
      }
    }
    return {
      lastInboundAt,
      lastResponseAt,
      logUpdatedAt: stat.mtime.toISOString()
    };
  } catch {
    return {};
  }
}
function readLogTimestamp(line) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  if (!match)
    return "";
  return (/* @__PURE__ */ new Date(`${match[1]}.000+08:00`)).toISOString();
}
function maskIdentifier(value) {
  if (value.length <= 12)
    return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
function upsertEnvFile(path, updates) {
  const existing = (0, import_node_fs.existsSync)(path) ? (0, import_node_fs.readFileSync)(path, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const seen = /* @__PURE__ */ new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match)
      return line;
    const key = match[1];
    if (!(key in updates))
      return line;
    seen.add(key);
    return `${key}=${formatEnvValue(updates[key] || "")}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(value)}`);
    }
  }
  (0, import_node_fs.writeFileSync)(path, `${nextLines.filter((line, index) => line || index < nextLines.length - 1).join("\n")}
`);
  (0, import_node_fs.chmodSync)(path, 384);
}
function formatEnvValue(value) {
  if (!value)
    return "";
  if (/^[A-Za-z0-9_@./:-]+$/.test(value))
    return value;
  return JSON.stringify(value);
}
function getHermesHome() {
  return process.env.HERMES_HOME || (0, import_node_path.join)((0, import_node_os.homedir)(), ".hermes");
}
function getGatewayState() {
  return readJsonFile((0, import_node_path.join)(getHermesHome(), "gateway_state.json")) || {
    gateway_state: "unknown",
    platforms: {}
  };
}
function getPairingState() {
  const pairingDir = (0, import_node_path.join)(getHermesHome(), "pairing");
  const pending = readJsonFile((0, import_node_path.join)(pairingDir, "weixin-pending.json")) || {};
  const approved = readJsonFile((0, import_node_path.join)(pairingDir, "weixin-approved.json")) || {};
  return {
    pendingCount: Object.keys(pending).length,
    approvedCount: Object.keys(approved).length
  };
}
function getWeixinState() {
  const env = readHermesEnv();
  const accountId = env.WEIXIN_ACCOUNT_ID || "";
  const token = env.WEIXIN_TOKEN || "";
  const account = accountId ? readJsonFile(
    (0, import_node_path.join)(getHermesHome(), "weixin", "accounts", `${accountId}.json`)
  ) : null;
  const dmPolicy = (env.WEIXIN_DM_POLICY || "open").toLowerCase();
  const allowedUsers = env.WEIXIN_ALLOWED_USERS || "";
  const allowAll = isTruthy(env.WEIXIN_ALLOW_ALL_USERS);
  let accessMode = "open";
  if (dmPolicy === "disabled") {
    accessMode = "disabled";
  } else if (allowAll || dmPolicy === "open") {
    accessMode = "open";
  } else if (dmPolicy === "pairing" && !allowedUsers.trim()) {
    accessMode = "pairing";
  } else {
    accessMode = "allowlist";
  }
  return {
    configured: Boolean(accountId && token),
    accountId,
    baseUrl: env.WEIXIN_BASE_URL || String(account?.base_url || ""),
    homeChannel: env.WEIXIN_HOME_CHANNEL || "",
    userId: String(account?.user_id || ""),
    dmPolicy,
    hasAllowlist: Boolean(allowedUsers.trim()),
    allowAll,
    accessMode,
    savedAt: String(account?.saved_at || "")
  };
}
function readHermesEnv() {
  const fileEnv = readDotEnv((0, import_node_path.join)(getHermesHome(), ".env"));
  return {
    ...fileEnv,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => typeof value === "string")
    )
  };
}
function readDotEnv(path) {
  if (!(0, import_node_fs.existsSync)(path))
    return {};
  const result = {};
  const lines = (0, import_node_fs.readFileSync)(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#"))
      continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match)
      continue;
    const [, key, rawValue = ""] = match;
    result[key] = stripEnvQuotes(rawValue.trim());
  }
  return result;
}
function stripEnvQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function readJsonFile(path) {
  try {
    if (!(0, import_node_fs.existsSync)(path))
      return null;
    return JSON.parse((0, import_node_fs.readFileSync)(path, "utf8"));
  } catch {
    return null;
  }
}
function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function storeAssistantRecord(record) {
  try {
    (0, import_node_fs.mkdirSync)(DATA_DIR, { recursive: true });
    const path = (0, import_node_path.join)(DATA_DIR, "assistants.json");
    const existing = readJsonFile(path) || {};
    existing[record.assistantId] = {
      ...record,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    (0, import_node_fs.writeFileSync)(path, `${JSON.stringify(existing, null, 2)}
`);
    (0, import_node_fs.chmodSync)(path, 384);
  } catch (error) {
    console.warn(
      `Hermes Bridge could not persist assistant record: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function updateAssistantRecord(assistantId, updates) {
  try {
    (0, import_node_fs.mkdirSync)(DATA_DIR, { recursive: true });
    const path = (0, import_node_path.join)(DATA_DIR, "assistants.json");
    const existing = readJsonFile(path) || {};
    existing[assistantId] = {
      ...existing[assistantId] || {},
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    (0, import_node_fs.writeFileSync)(path, `${JSON.stringify(existing, null, 2)}
`);
    (0, import_node_fs.chmodSync)(path, 384);
  } catch (error) {
    console.warn(
      `Hermes Bridge could not update assistant record: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
function getActivation(assistantId) {
  const activations = readActivations();
  return activations[assistantId] || null;
}
function upsertActivation(activation) {
  (0, import_node_fs.mkdirSync)(DATA_DIR, { recursive: true });
  const path = (0, import_node_path.join)(DATA_DIR, "activations.json");
  const activations = readActivations();
  activations[activation.assistantId] = activation;
  (0, import_node_fs.writeFileSync)(path, `${JSON.stringify(activations, null, 2)}
`);
  (0, import_node_fs.chmodSync)(path, 384);
}
function readActivations() {
  return readJsonFile(
    (0, import_node_path.join)(DATA_DIR, "activations.json")
  ) || {};
}
function isAuthorized(request, pathname = "/") {
  const acceptedTokens = pathname === "/api/learning-assistant/run" ? [TOKEN, LEARNING_ASSISTANT_TOKEN].filter(Boolean) : [TOKEN].filter(Boolean);
  if (!acceptedTokens.length)
    return true;
  const authorization = request.headers.authorization || "";
  const bridgeToken = request.headers["x-hermes-bridge-token"];
  const rawBridgeToken = Array.isArray(bridgeToken) ? bridgeToken[0] : bridgeToken;
  return acceptedTokens.some(
    (token) => authorization === `Bearer ${token}` || String(rawBridgeToken || "").trim() === token
  );
}
function readRequiredString(value, fieldName) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new Error(`\u7F3A\u5C11 ${fieldName}`);
}
function readOptionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function readStringArray(value) {
  if (!Array.isArray(value))
    return [];
  return value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}
function readSkillObjects(value) {
  if (!Array.isArray(value))
    return [];
  return value.map((item) => {
    if (!item || typeof item !== "object")
      return null;
    const record = item;
    const id = readOptionalString(record.id);
    const name = readOptionalString(record.name);
    const summary = readOptionalString(record.summary);
    if (!id || !name || !summary)
      return null;
    return {
      id,
      name,
      summary,
      skillType: readOptionalString(record.skillType) || "config",
      riskLevel: readOptionalString(record.riskLevel) || "low"
    };
  }).filter(
    (item) => Boolean(item)
  );
}
function readServiceProvision(body, roleId) {
  const name = readOptionalString(body.serviceName) || roleId;
  const summary = readOptionalString(body.serviceSummary) || `${name} \u5FAE\u4FE1\u6570\u5B57\u5458\u5DE5\u670D\u52A1`;
  const prompt = readOptionalString(body.servicePrompt) || readOptionalString(body.soulSnapshot) || `\u4F60\u662F ${name}\uFF0C\u4E00\u4E2A\u8FD0\u884C\u5728\u5FAE\u4FE1\u91CC\u7684\u4E13\u4E1A\u6570\u5B57\u5458\u5DE5\u3002\u8BF7\u56F4\u7ED5\u670D\u52A1\u76EE\u6807\u5904\u7406\u7528\u6237\u8BF7\u6C42\u3002`;
  const soulSnapshot = readOptionalString(body.soulSnapshot);
  const skillsSummary = readStringArray(body.skillsSummary);
  const enabledSkills = readSkillObjects(body.enabledSkills);
  const capabilities = readStringArray(body.serviceCapabilities);
  return {
    id: readOptionalString(body.serviceId) || `wechat-${roleId}-assistant`,
    name,
    summary,
    prompt,
    soulSnapshot,
    workerInstanceId: readOptionalString(body.workerInstanceId),
    employeeId: readOptionalString(body.employeeId),
    employeeVersionId: readOptionalString(body.employeeVersionId),
    skillsSummary,
    enabledSkills,
    capabilities: capabilities.length ? capabilities : skillsSummary,
    deliverables: readStringArray(body.serviceDeliverables)
  };
}
function readActivationTtlMs(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0)
    return ACTIVATION_TTL_MS;
  return Math.min(Math.max(seconds, 60), 60 * 60) * 1e3;
}
function buildProfileName({
  assistantId,
  roleId,
  userId
}) {
  const readableRole = roleId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const hash = (0, import_node_crypto.createHash)("sha256").update(`${assistantId}:${roleId}:${userId}`).digest("hex").slice(0, 12);
  return `bot${readableRole}${hash}`.slice(0, 32);
}
function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}
function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}
function runHermes(args, options = {}) {
  return runHermesCandidate(buildHermesCommandCandidates(), args, options);
}
async function runHermesCandidate(candidates, args, options) {
  let lastError = null;
  for (const candidate of candidates) {
    if (!canUseCommandCandidate(candidate))
      continue;
    try {
      return await spawnHermesCandidate(candidate, args, options);
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error(
    "\u627E\u4E0D\u5230 Hermes CLI\u3002\u8BF7\u8BBE\u7F6E HERMES_CLI_COMMAND\uFF0C\u6216\u628A hermes \u653E\u5230 PATH\u3002"
  );
}
function spawnHermesCandidate(candidate, args, options) {
  return new Promise((resolve, reject) => {
    const finalArgs = [...candidate.prefixArgs, ...args];
    const child = (0, import_node_child_process.spawn)(candidate.command, finalArgs, {
      cwd: WORKDIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `Hermes command timed out: ${formatHermesInvocation(
            candidate,
            args
          )}`
        )
      );
    }, COMMAND_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0 && !options.allowFailure) {
        reject(
          new Error(
            `Hermes command failed (${code}): ${formatHermesInvocation(
              candidate,
              args
            )}
${stderr || stdout}`
          )
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}
function buildHermesCommandCandidates() {
  const explicit = parseCommandLine(HERMES_CLI_COMMAND);
  const hermesHome = getHermesHome();
  const agentDir = process.env.HERMES_AGENT_DIR || (0, import_node_path.join)(hermesHome, "hermes-agent");
  const python = process.env.HERMES_AGENT_PYTHON || (0, import_node_path.join)(agentDir, "venv", "bin", "python3");
  const candidates = [];
  if (explicit.length) {
    candidates.push({
      command: explicit[0],
      prefixArgs: explicit.slice(1),
      label: explicit.join(" ")
    });
  }
  candidates.push(
    {
      command: "hermes",
      prefixArgs: [],
      label: "hermes"
    },
    {
      command: (0, import_node_path.join)((0, import_node_os.homedir)(), ".local", "bin", "hermes"),
      prefixArgs: [],
      label: "~/.local/bin/hermes"
    },
    {
      command: (0, import_node_path.join)(agentDir, "venv", "bin", "hermes"),
      prefixArgs: [],
      label: "hermes-agent venv hermes"
    },
    {
      command: python,
      prefixArgs: [(0, import_node_path.join)(agentDir, "rl_cli.py")],
      label: "hermes-agent rl_cli.py"
    }
  );
  return dedupeHermesCommandCandidates(candidates);
}
function parseCommandLine(value) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  let match;
  while (match = pattern.exec(value)) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens.filter(Boolean);
}
function dedupeHermesCommandCandidates(candidates) {
  const seen = /* @__PURE__ */ new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.command}\0${candidate.prefixArgs.join("\0")}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}
function canUseCommandCandidate(candidate) {
  if (candidate.command.includes("/")) {
    return (0, import_node_fs.existsSync)(candidate.command);
  }
  return true;
}
function isCommandNotFoundError(error) {
  return error instanceof Error && "code" in error && ["ENOENT", "EACCES"].includes(String(error.code));
}
function formatHermesInvocation(candidate, args) {
  return [candidate.label, ...args].join(" ");
}
function runLearningAssistantScript(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = (0, import_node_child_process.spawn)(
      LEARNING_ASSISTANT_PYTHON,
      [LEARNING_ASSISTANT_SCRIPT, command, ...args],
      {
        cwd: WORKDIR,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    const stdoutChunks = [];
    const stderrChunks = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        status: 504,
        payload: {
          success: false,
          error: `${command} timed out`
        }
      });
    }, LEARNING_ASSISTANT_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      const raw = stdout || stderr;
      let parsed = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
      }
      if (code !== 0) {
        resolve({
          status: 400,
          payload: parsed || {
            success: false,
            error: raw || `${command} exited ${code}`
          }
        });
        return;
      }
      if (!parsed) {
        resolve({
          status: 500,
          payload: {
            success: false,
            error: "learning-assistant returned invalid JSON"
          }
        });
        return;
      }
      resolve({ status: 200, payload: parsed });
    });
    if (typeof input !== "undefined") {
      child.stdin.write(JSON.stringify(input));
    }
    child.stdin.end();
  });
}
