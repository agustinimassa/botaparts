import fs from "fs";
import path from "path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { loadExcelConfig } from "../config/excel.js";
import { runJob } from "../worker/runner.js";
import { runScrapeAndBuildPreviews } from "../worker/scrape-preview.js";
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
        if (!allowIndexing)
            res.setHeader("X-Robots-Tag", INDEXING_HEADER_VALUE);
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
    }
    catch (err) {
        logger.error({ err }, "Error al leer datos");
        return reply.code(500).send({ error: "Error al leer datos" });
    }
});
app.get("/health", async () => ({ ok: true }));
const scrapeState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    lastOkAt: null,
    lastError: null,
};
const requireAdminToken = (request) => {
    const token = process.env.ADMIN_TOKEN;
    if (!token)
        return null; // auth opcional
    const provided = String(request.headers["x-admin-token"] ?? "");
    return provided === token ? null : "Token inválido";
};
app.get("/", async (_request, reply) => {
    // UI simple para usuarios no técnicos
    const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Bothouse</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          background: #0b1220;
          color: #e2e8f0;
        }
        .wrap { max-width: 900px; margin: 0 auto; padding: 28px 18px; }
        .card {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(148,163,184,0.2);
          border-radius: 16px;
          padding: 18px;
        }
        h1 { margin: 0 0 8px; font-size: 22px; }
        p { margin: 8px 0; color: rgba(226,232,240,0.9); line-height: 1.5; }
        .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
        button {
          appearance: none;
          border: 1px solid rgba(148,163,184,0.25);
          background: rgba(37,99,235,0.9);
          color: #fff;
          padding: 10px 14px;
          border-radius: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        button[disabled] { opacity: 0.5; cursor: not-allowed; }
        .secondary { background: rgba(15,23,42,0.6); }
        .danger { background: rgba(249,115,22,0.9); }
        .status {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(15,23,42,0.65);
          border: 1px solid rgba(148,163,184,0.2);
          font-size: 13px;
          color: rgba(226,232,240,0.95);
          line-height: 1.4;
        }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        input {
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(148,163,184,0.25);
          background: rgba(2,6,23,0.6);
          color: #e2e8f0;
          outline: none;
        }
        a { color: #93c5fd; text-decoration: none; font-weight: 700; }
        a:hover { text-decoration: underline; }
        .small { font-size: 12px; color: rgba(226,232,240,0.7); }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="card">
          <h1>🏠 Bothouse</h1>
          <p>Este panel actualiza las propiedades (scraping) y genera dos vistas:</p>
          <p>
            - <strong>Vista Web</strong> (interactiva) para explorar.<br/>
            - <strong>Vista Email</strong> (compacta) para enviar por correo.
          </p>
          <p class="small">Si el scraping ya está corriendo, el botón se bloquea hasta que termine.</p>

          <div class="row">
            <input id="token" placeholder="Token (opcional)" class="mono" style="min-width: 240px;" />
            <button id="runBtn" title="Inicia el scraping y genera los previews">Actualizar propiedades</button>
            <a id="webLink" class="secondary" href="/preview/web" target="_blank" style="padding:10px 14px; border-radius:12px; border:1px solid rgba(148,163,184,0.25); background:rgba(15,23,42,0.6);">Abrir vista web</a>
            <a id="emailLink" class="secondary" href="/preview/email" target="_blank" style="padding:10px 14px; border-radius:12px; border:1px solid rgba(148,163,184,0.25); background:rgba(15,23,42,0.6);">Abrir vista email</a>
          </div>

          <div class="status" id="status">Cargando estado…</div>
        </div>
      </div>

      <script>
        const statusEl = document.getElementById('status');
        const runBtn = document.getElementById('runBtn');
        const tokenInput = document.getElementById('token');
        const webLink = document.getElementById('webLink');
        const emailLink = document.getElementById('emailLink');

        const LS_KEY = 'bothouse_admin_token';
        tokenInput.value = localStorage.getItem(LS_KEY) || '';
        tokenInput.addEventListener('change', () => localStorage.setItem(LS_KEY, tokenInput.value));

        const setLinksEnabled = (enabled) => {
          const opacity = enabled ? '1' : '0.5';
          const pe = enabled ? 'auto' : 'none';
          webLink.style.opacity = opacity; webLink.style.pointerEvents = pe;
          emailLink.style.opacity = opacity; emailLink.style.pointerEvents = pe;
        };

        async function refresh() {
          const res = await fetch('/api/scrape/status');
          const data = await res.json();
          if (data.running) {
            runBtn.disabled = true;
            runBtn.textContent = 'Actualizando…';
          } else {
            runBtn.disabled = false;
            runBtn.textContent = 'Actualizar propiedades';
          }
          setLinksEnabled(!!data.hasPreviews);
          statusEl.innerHTML = [
            '<div><strong>Estado:</strong> ' + (data.running ? 'En ejecución' : 'Inactivo') + '</div>',
            data.startedAt ? '<div><strong>Inicio:</strong> <span class="mono">' + data.startedAt + '</span></div>' : '',
            data.finishedAt ? '<div><strong>Fin:</strong> <span class="mono">' + data.finishedAt + '</span></div>' : '',
            data.lastOkAt ? '<div><strong>Último OK:</strong> <span class="mono">' + data.lastOkAt + '</span></div>' : '',
            data.lastError ? '<div style="margin-top:6px; color:#fdba74;"><strong>Último error:</strong> ' + data.lastError + '</div>' : '',
            data.lastResult ? '<div style="margin-top:8px;"><strong>Último resultado:</strong> ' + data.lastResult.total + ' propiedades</div>' : '',
            data.lastResult && data.lastResult.aiSummary ? '<div class="small" style="margin-top:6px;">✨ ' + data.lastResult.aiSummary + '</div>' : ''
          ].filter(Boolean).join('');
        }

        runBtn.addEventListener('click', async () => {
          runBtn.disabled = true;
          runBtn.textContent = 'Iniciando…';
          const token = tokenInput.value.trim();
          const res = await fetch('/api/scrape/run', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'X-Admin-Token': token } : {}),
            },
            body: JSON.stringify({}),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            alert(data.error || ('Error: ' + res.status));
          }
          await refresh();
        });

        refresh();
        setInterval(refresh, 2000);
      </script>
    </body>
  </html>
  `;
    reply.type("text/html; charset=utf-8").send(html);
});
app.get("/api/scrape/status", async (_request, reply) => {
    const hasWeb = fs.existsSync(path.resolve("storage", "web-preview.html"));
    const hasEmail = fs.existsSync(path.resolve("storage", "email-preview.html"));
    return reply.send({
        ...scrapeState,
        hasPreviews: hasWeb && hasEmail,
    });
});
app.post("/api/scrape/run", async (request, reply) => {
    const authErr = requireAdminToken(request);
    if (authErr)
        return reply.code(401).send({ error: authErr });
    if (scrapeState.running) {
        return reply.code(409).send({ error: "Ya hay un scraping en ejecución. Intenta nuevamente en unos minutos." });
    }
    scrapeState.running = true;
    scrapeState.startedAt = new Date().toISOString();
    scrapeState.finishedAt = null;
    scrapeState.lastError = null;
    void (async () => {
        try {
            const result = await runScrapeAndBuildPreviews();
            scrapeState.lastResult = {
                total: result.stats.total,
                bySite: result.stats.bySite,
                aiSummary: result.aiSummary,
            };
            scrapeState.lastOkAt = new Date().toISOString();
        }
        catch (err) {
            scrapeState.lastError = err?.message ?? String(err);
            logger.error({ err }, "Scrape/run failed");
        }
        finally {
            scrapeState.running = false;
            scrapeState.finishedAt = new Date().toISOString();
        }
    })();
    return reply.code(202).send({ started: true });
});
// Endpoint para ver el preview del email
app.get("/preview/email", async (request, reply) => {
    const previewPath = path.resolve("storage", "email-preview.html");
    try {
        if (!fs.existsSync(previewPath)) {
            return reply.code(404).send({ error: "Preview no encontrado. Ejecuta 'npm run test:scrapers' primero." });
        }
        const html = await fs.promises.readFile(previewPath, "utf-8");
        reply.type("text/html").send(html);
    }
    catch (err) {
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
    }
    catch (err) {
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
    }
    catch (err) {
        logger.error({ err }, "Error al listar previews");
        return reply.code(500).send({ error: "Error al listar previews" });
    }
});
// Endpoint genérico para cualquier HTML en storage
app.get("/preview/:filename", async (request, reply) => {
    const { filename } = request.params;
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
    }
    catch (err) {
        logger.error({ err }, "Error al leer preview");
        return reply.code(500).send({ error: "Error al leer preview" });
    }
});
app.post("/config/excel", async (request, reply) => {
    const data = await request.file();
    if (!data)
        return reply.code(400).send({ error: "Falta archivo" });
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
    }
    catch (err) {
        logger.error({ err }, "Error al correr job");
        return reply.code(500).send({ error: "Job failed" });
    }
});
export const startServer = async () => {
    const port = Number(process.env.PORT || 3000);
    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`API escuchando en puerto ${port}`);
};
