const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "packages", "scanners", "src", "config", "cdisk-rules.json");
const destDir = path.join(__dirname, "..", "dist", "packages", "scanners", "src", "config");
const dest = path.join(destDir, "cdisk-rules.json");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("Copied cdisk-rules.json ->", dest);
