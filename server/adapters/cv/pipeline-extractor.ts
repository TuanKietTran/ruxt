import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { CvExtractor, CvExtractionResult } from "@core/handlers/extract-cv";

const formats = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/tiff", "image/bmp"];
const maxUploadBytes = Number(process.env.CV_IMPORT_MAX_BYTES ?? 15 * 1024 * 1024);
const configuredPipelineDir = () => resolve(process.env.CV_PIPELINE_DIR ?? join(process.cwd(), "server/pipeline"));
const python = () => process.env.CV_PIPELINE_PYTHON
   ?? resolve(process.env.CV_PIPELINE_VENV ?? join(process.cwd(), ".data/cv-pipeline-venv"), "bin/python");
let bundledPipelineDir: Promise<string> | undefined;

async function resolvePipelineDir(): Promise<string> {
   const configured = configuredPipelineDir();
   try {
      await access(join(configured, "run.py"), constants.R_OK);
      return configured;
   } catch {
      bundledPipelineDir ??= (async () => {
         const directory = await mkdtemp(join(tmpdir(), "cv-sv-pipeline-"));
         const storage = useStorage("assets:cvPipeline");
         const keys = await storage.getKeys();
         if (!keys.includes("run.py")) throw new Error(`cv-pipeline not found at ${configured}; set CV_PIPELINE_DIR`);
         await Promise.all(keys.map(async (key) => {
            const data = await storage.getItemRaw<Uint8Array>(key);
            if (!data) return;
            const target = join(directory, key);
            await mkdir(resolve(target, ".."), { recursive: true });
            await writeFile(target, data);
         }));
         return directory;
      })();
      return bundledPipelineDir;
   }
}

async function checkAvailable(): Promise<string | undefined> {
   try {
      await resolvePipelineDir();
   } catch (error) {
      return error instanceof Error ? error.message : "cv-pipeline assets unavailable";
   }
   return await new Promise((resolveReason) => {
      const child = spawn(python(), ["-c", "import pdfplumber,pytesseract,PIL"], { stdio: "ignore" });
      child.once("error", () => resolveReason(`Python executable not available: ${python()}`));
      child.once("exit", (code) => resolveReason(code === 0 ? undefined : "cv-pipeline Python dependencies are unavailable"));
   });
}

function runProcess(args: string[], cwd: string, signal: AbortSignal): Promise<number> {
   return new Promise((resolveCode, reject) => {
      const child = spawn(python(), args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
      const abort = () => child.kill("SIGTERM");
      signal.addEventListener("abort", abort, { once: true });
      child.once("error", reject);
      child.once("exit", (code, killedBy) => {
         signal.removeEventListener("abort", abort);
         if (signal.aborted) return reject(new DOMException("CV import cancelled", "AbortError"));
         if (code === 0 || code === 2) return resolveCode(code);
         reject(new Error(`cv-pipeline exited with ${code ?? killedBy}: ${stderr || "no diagnostic"}`));
      });
   });
}

export const cvPipelineExtractor: CvExtractor = {
   async capabilities() {
      const degradedReason = await checkAvailable();
      return {
         available: !degradedReason,
         formats,
         maxUploadBytes,
         ocr: !degradedReason,
         renderer: "cv-pipeline",
         ...(degradedReason ? { degradedReason } : {}),
      };
   },

   async extract({ bytes, filename, signal, onProgress }): Promise<CvExtractionResult> {
      const unavailable = await checkAvailable();
      if (unavailable) throw new Error(unavailable);
      const pipelineDirectory = await resolvePipelineDir();
      const workdir = await mkdtemp(join(tmpdir(), "cv-sv-import-"));
      const safeName = `source${extname(basename(filename)).toLowerCase()}`;
      const sourcePath = join(workdir, safeName);
      const outputPath = join(workdir, "output");
      try {
         await onProgress(10, "storing_input");
         await writeFile(sourcePath, bytes);
         await onProgress(25, "extracting_text");
         const exitCode = await runProcess([join(pipelineDirectory, "run.py"), sourcePath, "-o", outputPath], pipelineDirectory, signal);
         await onProgress(80, "reading_results");
         const prefix = exitCode === 2 ? "error" : "resume";
         const [conceptText, markdown, css, html, rawText] = await Promise.all([
            readFile(join(outputPath, `${prefix}.json`), "utf8"),
            readFile(join(outputPath, `${prefix}.md`), "utf8"),
            readFile(join(outputPath, "resume.css"), "utf8"),
            readFile(join(outputPath, `${prefix}.html`), "utf8"),
            readFile(join(outputPath, "raw.txt"), "utf8"),
         ]);
         const concept = JSON.parse(conceptText);
         const error = concept.error;
         return {
            accepted: exitCode === 0,
            concept,
            markdown,
            css,
            html,
            rawText,
            confidence: typeof concept.cv_score === "number" ? concept.cv_score : undefined,
            warnings: [],
            ...(exitCode === 2 ? { rejection: {
               code: error?.code === "EMPTY_OR_UNREADABLE" ? "EMPTY_OR_UNREADABLE" : "NOT_CV_ALIKE",
               message: error?.message ?? "The document is not CV-alike",
               reasons: Array.isArray(error?.reasons) ? error.reasons : undefined,
            } } : {}),
         };
      } finally {
         await rm(workdir, { recursive: true, force: true });
      }
   },
};

export { formats as cvPipelineMediaTypes, maxUploadBytes as cvPipelineMaxUploadBytes };
