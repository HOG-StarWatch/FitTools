import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outFile = path.join(root, "js", "sdk", "fitsdk.js");
const entry = require.resolve("@garmin/fitsdk");

await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  globalName: "FitSDK",
  platform: "browser",
  target: ["es2020"],
  legalComments: "eof",
  outfile: outFile,
  logLevel: "info",
});

const size = fs.statSync(outFile).size;
console.log(`Wrote ${outFile} (${(size / 1024).toFixed(1)} KB)`);