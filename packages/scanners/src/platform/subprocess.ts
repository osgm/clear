import { execFile as nodeExecFile, type ChildProcess } from "node:child_process";

const trackedChildProcesses = new Set<ChildProcess>();

/** 退出时结束 vssadmin / PowerShell 等子进程，避免主进程残留 */
export function killTrackedChildProcesses(): void {
  for (const child of trackedChildProcesses) {
    try {
      if (!child.killed) {
        child.kill();
      }
    } catch {
      /* ignore */
    }
  }
  trackedChildProcesses.clear();
}

function trackChildProcess(child: ChildProcess | null | undefined): void {
  if (!child || child.pid === undefined) {
    return;
  }
  trackedChildProcesses.add(child);
  child.once("exit", () => trackedChildProcesses.delete(child));
  child.once("error", () => trackedChildProcesses.delete(child));
}

export function execFile(
  file: string,
  args: readonly string[] | undefined,
  options: Parameters<typeof nodeExecFile>[2],
  callback: Parameters<typeof nodeExecFile>[3]
): void {
  const child = nodeExecFile(file, args, options, (...cbArgs) => {
    if (child) {
      trackedChildProcesses.delete(child);
    }
    callback?.(...cbArgs);
  });
  trackChildProcess(child);
}
