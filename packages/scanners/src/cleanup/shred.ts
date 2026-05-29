import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { CLEANUP_DELETE_TIMEOUT_MS, DUP_FINGERPRINT_BYTES } from "../internal/constants";

const SHRED_CHUNK = 1024 * 1024;

export function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function quickFingerprint(filePath: string, size: number): Promise<string> {
  const fh = await fs.open(filePath, "r");
  try {
    const hash = createHash("sha256");
    hash.update(`size:${size}|`);
    if (size <= DUP_FINGERPRINT_BYTES * 2) {
      const buf = Buffer.alloc(Number(size));
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      hash.update(buf.subarray(0, bytesRead));
    } else {
      const head = Buffer.alloc(DUP_FINGERPRINT_BYTES);
      const tail = Buffer.alloc(DUP_FINGERPRINT_BYTES);
      const headRead = await fh.read(head, 0, head.length, 0);
      const tailRead = await fh.read(tail, 0, tail.length, Math.max(0, size - DUP_FINGERPRINT_BYTES));
      hash.update(head.subarray(0, headRead.bytesRead));
      hash.update(tail.subarray(0, tailRead.bytesRead));
    }
    return hash.digest("hex");
  } finally {
    await fh.close();
  }
}

async function shredFile(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error("不是文件");
  }
  const size = stat.size;
  const fh = await fs.open(filePath, "r+");
  try {
    let written = 0;
    while (written < size) {
      const len = Math.min(SHRED_CHUNK, size - written);
      const buf = randomBytes(len);
      await fh.write(buf, 0, len, written);
      written += len;
    }
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.unlink(filePath);
}

export async function shredPath(entryPath: string): Promise<void> {
  let stat;
  try {
    stat = await fs.lstat(entryPath);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) {
    await fs.unlink(entryPath);
    return;
  }
  if (stat.isFile()) {
    await shredFile(entryPath);
    return;
  }
  if (!stat.isDirectory()) {
    return;
  }
  const entries = await fs.readdir(entryPath, { withFileTypes: true });
  for (const e of entries) {
    await shredPath(path.join(entryPath, e.name));
  }
  await fs.rmdir(entryPath);
}

export async function withDeleteTimeout<T>(task: Promise<T>, targetPath: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`删除超时，已跳过: ${targetPath}`));
        }, CLEANUP_DELETE_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
