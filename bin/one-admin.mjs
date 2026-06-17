#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = ["worker:admin", ...process.argv.slice(2)];

const child = spawn("pnpm", args, {
	cwd: repoRoot,
	stdio: "inherit",
	shell: false,
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 1);
});

child.on("error", (error) => {
	console.error(error.message);
	process.exit(1);
});
