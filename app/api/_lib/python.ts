import { spawn } from "node:child_process";
import path from "node:path";

const PROJECT_ROOT = process.cwd();

/** Resolve a python executable; allow override via PYTHON_BIN. */
export function pythonBin(): string {
  return process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
}

/** Spawn `python -m agents.<...>` from the project root with UTF-8 forced. */
export function spawnAgent(args: string[]) {
  return spawn(pythonBin(), args, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      PYTHONPATH: PROJECT_ROOT,
    },
  });
}

export { PROJECT_ROOT, path };
