import { spawn } from 'node:child_process';

const DEFAULT_SCRIPT =
  '/Users/baiyang/.hermes/skills/learning-assistant/scripts/learning_assistant.py';

type RunOptions = {
  input?: unknown;
  timeoutMs?: number;
};

export function getLearningAssistantScript() {
  return process.env.HERMES_LEARNING_ASSISTANT_SCRIPT || DEFAULT_SCRIPT;
}

export function runLearningAssistant(
  command: string,
  args: string[] = [],
  options: RunOptions = {}
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const child = spawn(
      'python3',
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
