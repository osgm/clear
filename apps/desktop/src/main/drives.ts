import { accessSync, constants } from "node:fs";

/** 枚举本机可用盘符根路径，如 `C:\`、`D:\` */
export function listSystemDrives(): string[] {
  const drives: string[] = [];
  if (process.platform === "win32") {
    for (let code = 65; code <= 90; code += 1) {
      const root = `${String.fromCharCode(code)}:\\`;
      try {
        accessSync(root, constants.F_OK);
        drives.push(root);
      } catch {
        /* 盘符不存在 */
      }
    }
    return drives;
  }
  return ["/"];
}

export function defaultSystemDrive(): string {
  const drives = listSystemDrives();
  const sys = process.env.SystemDrive;
  if (sys) {
    const norm = sys.endsWith("\\") ? sys : `${sys}\\`;
    if (drives.includes(norm)) return norm;
  }
  return drives[0] ?? "C:\\";
}
