import nodemailer from "nodemailer";
export const sendEmailSummary = async (to, subject, listings) => {
    if (!to.length)
        return;
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
const getSiteName = (siteKey) => {
    const siteNames = {
        remaxrd: "RE/MAX RD",
        c21sunsets: "Century 21 Sunsets",
    };
    return siteNames[siteKey.toLowerCase()] || siteKey.toUpperCase();
};
export const renderHtml = (listings) => {
    const cards = listings
        .map((l) => {
        const siteName = getSiteName(l.siteKey);
        const mainImage = l.images && l.images.length > 0 ? l.images[0] : null;
        const additionalImages = l.images && l.images.length > 1 ? l.images.slice(1, 4) : [];
        return `
      <div style="border: 1px solid #e0e0e0; padding: 0; margin-bottom: 20px; border-radius: 8px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
        ${mainImage ? `
        <div style="width: 100%; height: 200px; overflow: hidden; background-color: #f5f5f5;">
          <img src="${mainImage}" alt="${escapeHtml(l.title || "Propiedad")}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none'; this.parentElement.style.display='none';" />
        </div>` : ''}
        <div style="padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <h3 style="margin: 0; color: #333; font-size: 20px; flex: 1; min-width: 200px;">${escapeHtml(l.title || "Sin título")}</h3>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              ${l.badges && l.badges.length > 0 ? l.badges.map(badge => `
                <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);">${escapeHtml(badge)}</span>
              `).join('') : ''}
              <span style="background-color: #f0f0f0; color: #666; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap;">${escapeHtml(siteName)}</span>
            </div>
          </div>
          ${additionalImages.length > 0 ? `
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            ${additionalImages.map((img) => `
              <div style="width: 60px; height: 60px; overflow: hidden; border-radius: 4px; background-color: #f5f5f5; flex-shrink: 0;">
                <img src="${img}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none';" />
              </div>
            `).join('')}
          </div>` : ''}
          <p style="margin: 8px 0; color: #666;"><strong style="color: #333;">💰 Precio:</strong> ${l.priceUSD ? `$${l.priceUSD.toLocaleString()} USD` : "N/D"}</p>
          <p style="margin: 8px 0; color: #666;"><strong style="color: #333;">📍 Ubicación:</strong> ${escapeHtml(l.location || "N/D")}</p>
          ${l.beds ? `<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">🛏️ Dormitorios:</strong> ${l.beds}</p>` : ""}
          ${l.baths ? `<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">🚿 Baños:</strong> ${l.baths}</p>` : ""}
          ${l.area ? `<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">📐 Área:</strong> ${l.area}</p>` : ""}
          <a href="${l.url}" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold;">Ver detalle →</a>
        </div>
      </div>`;
    })
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
const escapeHtml = (text) => {
    const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
};
