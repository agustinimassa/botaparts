import fs from "fs";
import nodemailer from "nodemailer";
import path from "path";
import { loadEnv } from "../utils/env.js";
import { renderEmailCompact } from "../notifications/email/index.js";

type PropertiesData = {
  aiSummary?: string | null;
  listings?: any[];
};

const parseRecipients = (raw?: string): string[] => {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const main = async () => {
  loadEnv();

  const to = parseRecipients(process.env.EMAIL_TEST_TO);
  if (!to.length) {
    throw new Error(
      "Falta EMAIL_TEST_TO (comma-separated) para enviar el email de prueba. Ej: EMAIL_TEST_TO=tu@mail.com",
    );
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error("Faltan SMTP_HOST/SMTP_USER/SMTP_PASS en variables de entorno");
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user, pass },
  });

  // Verificar conexión/auth antes de enviar
  await transporter.verify();

  // Tomar datos del último scraping si existe (para usar notas AI)
  const dataPath = path.resolve("storage", "properties-data.json");
  let aiSummary: string | null = null;
  let listings: any[] = [];
  if (fs.existsSync(dataPath)) {
    const raw = await fs.promises.readFile(dataPath, "utf-8");
    const data = JSON.parse(raw) as PropertiesData;
    aiSummary = (data.aiSummary as string | null | undefined) ?? null;
    listings = (data.listings as any[] | undefined) ?? [];
  }

  const html = renderEmailCompact(listings.slice(0, 20) as any, aiSummary);
  const subject = `Bothouse • Test Email • ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to,
    subject,
    html,
  });

  // eslint-disable-next-line no-console
  console.log("✅ Email enviado", { messageId: info.messageId, to });
};

void main();


