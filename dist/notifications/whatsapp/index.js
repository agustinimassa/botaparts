// Placeholder: integrar Twilio/Meta API
export const sendWhatsappSummary = async (numbers, listings) => {
    if (!numbers.length)
        return;
    const message = renderWhatsapp(listings);
    // Aquí llamar SDK elegido; por ahora log o devolver payload
    return { to: numbers, message };
};
const getSiteName = (siteKey) => {
    const siteNames = {
        remaxrd: "RE/MAX RD",
        c21sunsets: "Century 21 Sunsets",
    };
    return siteNames[siteKey.toLowerCase()] || siteKey.toUpperCase();
};
const renderWhatsapp = (listings) => {
    if (!listings.length)
        return "No hay nuevas propiedades hoy.";
    return listings
        .slice(0, 10)
        .map((l) => {
        const siteName = getSiteName(l.siteKey);
        const badgesText = l.badges && l.badges.length > 0
            ? `\n✨ ${l.badges.join(' • ')}`
            : '';
        const details = [
            `🏠 ${l.title}${badgesText}`,
            `📌 Fuente: ${siteName}`,
            `💲 ${l.priceUSD ? `$${l.priceUSD.toLocaleString()}` : "Consultar"} USD`,
            l.location ? `📍 ${l.location}` : null,
            l.beds ? `🛏️ ${l.beds} dormitorios` : null,
            l.baths ? `🚿 ${l.baths} baños` : null,
            l.area ? `📐 ${l.area}` : null,
            `🔗 ${l.url}`,
        ]
            .filter(Boolean)
            .join("\n");
        return details;
    })
        .join("\n\n");
};
