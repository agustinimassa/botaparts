import fs from "fs";
import path from "path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { loadExcelConfig } from "../config/excel.js";
import { runJob } from "../worker/runner.js";
import { logger } from "../utils/logger.js";

const app = Fastify({ logger: false });
app.register(multipart);

const INDEXING_HEADER_VALUE = "noindex, nofollow, noarchive";
const allowIndexing = process.env.ALLOW_INDEXING === "true";

if (!allowIndexing) {
  // Defensa en profundidad: evita indexación aunque el crawler ignore robots.txt
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("X-Robots-Tag", INDEXING_HEADER_VALUE);
  });
}

// robots.txt (por defecto: bloquear todo)
app.get("/robots.txt", async (_request, reply) => {
  const body = allowIndexing
    ? "User-agent: *\nDisallow:\n"
    : "User-agent: *\nDisallow: /\n";
  reply.type("text/plain; charset=utf-8").send(body);
});

// Variación que algunos bots consultan
app.get("/.well-known/robots.txt", async (_request, reply) => {
  const body = allowIndexing
    ? "User-agent: *\nDisallow:\n"
    : "User-agent: *\nDisallow: /\n";
  reply.type("text/plain; charset=utf-8").send(body);
});

// Servir archivos estáticos de storage (incluye JSON y HTML)
app.register(staticFiles, {
  root: path.resolve("storage"),
  prefix: "/storage/",
  setHeaders: (res) => {
    if (!allowIndexing) res.setHeader("X-Robots-Tag", INDEXING_HEADER_VALUE);
  },
});

// Endpoint específico para servir el JSON de propiedades
app.get("/api/properties-data", async (request, reply) => {
  const dataPath = path.resolve("storage", "properties-data.json");
  try {
    if (!fs.existsSync(dataPath)) {
      return reply.code(404).send({ error: "Datos no encontrados. Ejecuta 'npm run test:scrapers' primero." });
    }
    const json = await fs.promises.readFile(dataPath, "utf-8");
    reply.type("application/json").send(JSON.parse(json));
  } catch (err) {
    logger.error({ err }, "Error al leer datos");
    return reply.code(500).send({ error: "Error al leer datos" });
  }
});

app.get("/health", async () => ({ ok: true }));

// Endpoint para ver el preview del email
app.get("/preview/email", async (request, reply) => {
  const previewPath = path.resolve("storage", "email-preview.html");
  try {
    if (!fs.existsSync(previewPath)) {
      return reply.code(404).send({ error: "Preview no encontrado. Ejecuta 'npm run test:scrapers' primero." });
    }
    const html = await fs.promises.readFile(previewPath, "utf-8");
    reply.type("text/html").send(html);
  } catch (err) {
    logger.error({ err }, "Error al leer preview");
    return reply.code(500).send({ error: "Error al leer preview" });
  }
});

// Endpoint para ver el preview WEB (página grande/interactiva)
app.get("/preview/web", async (request, reply) => {
  const previewPath = path.resolve("storage", "web-preview.html");
  try {
    if (!fs.existsSync(previewPath)) {
      return reply
        .code(404)
        .send({ error: "Preview web no encontrado. Ejecuta 'npm run test:scrapers' primero." });
    }
    const html = await fs.promises.readFile(previewPath, "utf-8");
    reply.type("text/html").send(html);
  } catch (err) {
    logger.error({ err }, "Error al leer preview web");
    return reply.code(500).send({ error: "Error al leer preview web" });
  }
});

// Endpoint para listar todos los HTMLs disponibles
app.get("/preview/list", async (request, reply) => {
  const storagePath = path.resolve("storage");
  try {
    const files = await fs.promises.readdir(storagePath);
    const htmlFiles = files
      .filter((file) => file.endsWith(".html"))
      .map((file) => ({
        name: file,
        path: `/preview/${file.replace(".html", "")}`,
        url: `/storage/${file}`,
      }));
    return { files: htmlFiles, count: htmlFiles.length };
  } catch (err) {
    logger.error({ err }, "Error al listar previews");
    return reply.code(500).send({ error: "Error al listar previews" });
  }
});

// Endpoint genérico para cualquier HTML en storage
app.get("/preview/:filename", async (request, reply) => {
  const { filename } = request.params as { filename: string };
  // Sanitizar el nombre del archivo para prevenir path traversal
  const safeFilename = filename.replace(/[^a-zA-Z0-9-_]/g, "");
  const previewPath = path.resolve("storage", `${safeFilename}.html`);
  
  try {
    // Verificar que el archivo está dentro de storage
    const storagePath = path.resolve("storage");
    const resolvedPath = path.resolve(previewPath);
    if (!resolvedPath.startsWith(storagePath)) {
      return reply.code(403).send({ error: "Acceso denegado" });
    }
    
    if (!fs.existsSync(previewPath)) {
      return reply.code(404).send({ error: `Preview '${filename}' no encontrado` });
    }
    
    const html = await fs.promises.readFile(previewPath, "utf-8");
    reply.type("text/html").send(html);
  } catch (err) {
    logger.error({ err }, "Error al leer preview");
    return reply.code(500).send({ error: "Error al leer preview" });
  }
});

app.post("/config/excel", async (request, reply) => {
  const data = await request.file();
  if (!data) return reply.code(400).send({ error: "Falta archivo" });
  const dest = path.resolve("storage", "config.xlsx");
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.writeFile(dest, await data.toBuffer());
  return { saved: true };
});

app.post("/jobs/run", async (request, reply) => {
  try {
    const config = await loadExcelConfig();
    const res = await runJob(config);
    return { processed: res.length };
  } catch (err) {
    logger.error({ err }, "Error al correr job");
    return reply.code(500).send({ error: "Job failed" });
  }
});

export const startServer = async () => {
  const port = Number(process.env.PORT || 3000);
  await app.listen({ port, host: "0.0.0.0" });
  logger.info(`API escuchando en puerto ${port}`);
};

