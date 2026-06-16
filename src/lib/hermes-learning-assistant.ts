import { spawn } from 'node:child_process';

const DEFAULT_SCRIPT =
  '/Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py';
const DEFAULT_PYTHON = 'python3';

type RunOptions = {
  input?: unknown;
  timeoutMs?: number;
};

type RemotePayload = {
  command: string;
  args: string[];
  input?: unknown;
};

export function getLearningAssistantScript() {
  return process.env.HERMES_LEARNING_ASSISTANT_SCRIPT || DEFAULT_SCRIPT;
}

export function getLearningAssistantRemoteUrl() {
  return process.env.HERMES_LEARNING_ASSISTANT_URL?.trim() || '';
}

export function getLearningAssistantPython() {
  return process.env.HERMES_LEARNING_ASSISTANT_PYTHON || DEFAULT_PYTHON;
}

function readRemoteError(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && 'error' in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error.trim();
  }
  return fallback;
}

async function runRemoteLearningAssistant(
  remoteUrl: string,
  payload: RemotePayload,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = process.env.HERMES_LEARNING_ASSISTANT_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(remoteUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;
    if (text.trim()) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      throw new Error(
        readRemoteError(
          parsed,
          `Hermes learning-assistant HTTP ${response.status}`
        )
      );
    }

    if (!parsed) {
      throw new Error('Hermes learning-assistant returned empty or invalid JSON');
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Hermes learning-assistant ${payload.command} timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function runLocalLearningAssistant(
  command: string,
  args: string[] = [],
  options: RunOptions = {}
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(
      getLearningAssistantPython(),
      [getLearningAssistantScript(), command, ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Hermes learning-assistant ${command} timed out`));
    }, options.timeoutMs || 30000);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const raw = stdout.trim() || stderr.trim();
      let parsed: Record<string, unknown> | null = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          parsed = null;
        }
      }

      if (code !== 0) {
        reject(
          new Error(
            typeof parsed?.error === 'string'
              ? parsed.error
              : stderr.trim() ||
                  stdout.trim() ||
                  `learning-assistant exited ${code}`
          )
        );
        return;
      }

      if (!parsed) {
        reject(new Error('learning-assistant returned empty or invalid JSON'));
        return;
      }

      resolve(parsed);
    });

    if (typeof options.input !== 'undefined') {
      child.stdin.write(JSON.stringify(options.input));
    }
    child.stdin.end();
  });
}

export function runLearningAssistant(
  command: string,
  args: string[] = [],
  options: RunOptions = {}
) {
  const timeoutMs = options.timeoutMs || 30000;
  const remoteUrl = getLearningAssistantRemoteUrl();
  if (remoteUrl) {
    return runRemoteLearningAssistant(
      remoteUrl,
      {
        command,
        args,
        input: options.input,
      },
      timeoutMs
    );
  }

  return runLocalLearningAssistant(command, args, {
    ...options,
    timeoutMs,
  });
}
