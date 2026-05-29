let recycleBinHandler: ((filePath: string) => Promise<void>) | null = null;

/** 由 Electron 主进程在启动时注入 shell.trashItem */
export function configureRecycleBinHandler(handler: (filePath: string) => Promise<void>): void {
  recycleBinHandler = handler;
}

export async function moveToRecycleBin(filePath: string): Promise<void> {
  if (!recycleBinHandler) {
    throw new Error("回收站处理器未配置，请在主进程调用 configureRecycleBinHandler");
  }
  await recycleBinHandler(filePath);
}
