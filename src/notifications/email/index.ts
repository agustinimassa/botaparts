import nodemailer from "nodemailer";
import { Listing } from "../../models/types.js";

export const sendEmailSummary = async (to: string[], subject: string, listings: Listing[]) => {
  if (!to.length) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const html = renderHtml(listings);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
  });
};

const getSiteName = (siteKey: string): string => {
  const siteNames: Record<string, string> = {
    remaxrd: "RE/MAX RD",
    c21sunsets: "Century 21 Sunsets",
  };
  return siteNames[siteKey.toLowerCase()] || siteKey.toUpperCase();
};

export const renderHtml = (listings: Listing[]): string => {
  const cards = listings
    .map(
      (l) => {
        const siteName = getSiteName(l.siteKey);
        return `
      <div style="border: 1px solid #e0e0e0; padding: 20px; margin-bottom: 20px; border-radius: 8px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
          <h3 style="margin: 0; color: #333; font-size: 20px; flex: 1;">${escapeHtml(l.title || "Sin título")}</h3>
          <span style="background-color: #f0f0f0; color: #666; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; margin-left: 12px;">${escapeHtml(siteName)}</span>
        </div>
        <p style="margin: 8px 0; color: #666;"><strong style="color: #333;">💰 Precio:</strong> ${l.priceUSD ? `$${l.priceUSD.toLocaleString()} USD` : "N/D"}</p>
        <p style="margin: 8px 0; color: #666;"><strong style="color: #333;">📍 Ubicación:</strong> ${escapeHtml(l.location || "N/D")}</p>
        ${l.beds ? `<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">🛏️ Dormitorios:</strong> ${l.beds}</p>` : ""}
        ${l.baths ? `<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">🚿 Baños:</strong> ${l.baths}</p>` : ""}
        ${l.area ? `<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">📐 Área:</strong> ${l.area}</p>` : ""}
        <a href="${l.url}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Ver detalle →</a>
      </div>`;
      },
    )
    .join("");
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nuevas Propiedades</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h1 style="color: #007bff; margin-top: 0; border-bottom: 3px solid #007bff; padding-bottom: 10px;">🏠 Nuevas Propiedades Encontradas</h1>
          ${cards || "<p style='color: #666;'>No se encontraron nuevas propiedades en esta ejecución.</p>"}
        </div>
      </body>
    </html>
  `;
};

const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

