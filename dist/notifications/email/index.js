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
// Función para renderizar HTML que carga datos desde JSON (para preview web)
export const renderHtmlFromJson = () => {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nuevas Propiedades</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          h1 {
            color: #007bff;
            margin-top: 0;
            border-bottom: 3px solid #007bff;
            padding-bottom: 10px;
          }
          .loading {
            text-align: center;
            padding: 40px;
            color: #666;
            font-size: 18px;
          }
          .error {
            text-align: center;
            padding: 40px;
            color: #dc3545;
            font-size: 18px;
            background-color: #f8d7da;
            border-radius: 8px;
            margin: 20px 0;
          }
          .stats-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 20px 0;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            color: white;
            flex-wrap: wrap;
            gap: 10px;
          }
          .stats-item {
            text-align: center;
          }
          .stats-number {
            font-size: 24px;
            font-weight: bold;
            display: block;
          }
          .stats-label {
            font-size: 12px;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .filters-container, .sort-container {
            margin: 20px 0;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 8px;
            text-align: center;
          }
          .filters-title {
            margin-bottom: 15px;
            color: #333;
            font-weight: 600;
          }
          .sort-btn {
            padding: 10px 20px;
            margin: 5px;
            border: 2px solid #28a745;
            background-color: transparent;
            color: #28a745;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            font-size: 14px;
          }
          .sort-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(40, 167, 69, 0.3);
          }
          .sort-btn.active {
            background-color: #28a745;
            color: white;
          }
          .filter-btn {
            padding: 10px 20px;
            margin: 5px;
            border: 2px solid #007bff;
            background-color: transparent;
            color: #007bff;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            font-size: 14px;
          }
          .filter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
          }
          .filter-btn.active {
            background-color: #007bff;
            color: white;
          }
          .properties-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
            margin-top: 20px;
          }
          .property-card {
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .property-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .property-card.hidden {
            display: none;
          }
          .no-results {
            text-align: center;
            padding: 40px;
            color: #666;
            font-size: 18px;
            display: none;
          }
          .no-results.show {
            display: block;
          }
          @media (max-width: 768px) {
            .properties-grid {
              grid-template-columns: 1fr;
            }
            .stats-bar {
              flex-direction: column;
            }
            .filter-btn, .sort-btn {
              width: 100%;
              margin: 5px 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏠 Nuevas Propiedades Encontradas</h1>
          <div class="loading" id="loading">Cargando propiedades...</div>
          <div class="error" id="error" style="display: none;"></div>
          <div id="content" style="display: none;">
            <div class="stats-bar" id="stats-bar"></div>
            <div class="filters-container" id="filters-container"></div>
            <div class="sort-container" id="sort-container"></div>
            <div class="no-results" id="no-results">No hay propiedades que coincidan con el filtro seleccionado.</div>
            <div class="properties-grid" id="properties-grid"></div>
          </div>
        </div>

        <script>
          let currentFilter = 'all';
          let currentSort = 'asc';
          let allListings = [];

          async function loadData() {
            try {
              // Intentar cargar desde el endpoint del servidor primero, luego desde archivo local
              let response;
              try {
                response = await fetch('/api/properties-data');
                if (!response.ok) throw new Error('Endpoint no disponible');
              } catch (e) {
                // Si falla el endpoint, intentar desde archivo local
                response = await fetch('properties-data.json');
              }
              
              if (!response.ok) {
                throw new Error('No se pudo cargar el archivo de datos');
              }
              const data = await response.json();
              allListings = data.listings || [];
              
              if (allListings.length === 0) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('error').textContent = 'No se encontraron propiedades en los datos.';
                document.getElementById('error').style.display = 'block';
                return;
              }

              renderPage(data);
            } catch (error) {
              console.error('Error cargando datos:', error);
              document.getElementById('loading').style.display = 'none';
              document.getElementById('error').textContent = 'Error al cargar los datos: ' + error.message;
              document.getElementById('error').style.display = 'block';
            }
          }

          function getSiteName(siteKey) {
            const siteNames = {
              remaxrd: "RE/MAX RD",
              c21sunsets: "Century 21 Sunsets",
            };
            return siteNames[siteKey.toLowerCase()] || siteKey.toUpperCase();
          }

          function escapeHtml(text) {
            const map = {
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#039;",
            };
            return String(text).replace(/[&<>"']/g, (m) => map[m]);
          }

          function renderPage(data) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').style.display = 'block';

            const stats = data.stats;
            const listings = data.listings;

            // Renderizar estadísticas
            const statsBar = document.getElementById('stats-bar');
            statsBar.innerHTML = \`
              <div class="stats-item">
                <span class="stats-number">\${stats.total}</span>
                <span class="stats-label">Total Propiedades</span>
              </div>
              \${Object.keys(stats.bySite).map(siteKey => \`
                <div class="stats-item">
                  <span class="stats-number">\${stats.bySite[siteKey]}</span>
                  <span class="stats-label">\${getSiteName(siteKey)}</span>
                </div>
              \`).join('')}
            \`;

            // Renderizar botones de filtro
            const filtersContainer = document.getElementById('filters-container');
            filtersContainer.innerHTML = \`
              <div class="filters-title">🔍 Filtrar por sitio:</div>
              <button class="filter-btn active" data-filter="all" onclick="filterProperties('all')">
                Todas (\${stats.total})
              </button>
              \${Object.keys(stats.bySite).map(siteKey => \`
                <button class="filter-btn" data-filter="\${siteKey}" onclick="filterProperties('\${siteKey}')">
                  \${getSiteName(siteKey)} (\${stats.bySite[siteKey]})
                </button>
              \`).join('')}
            \`;

            // Renderizar botones de ordenamiento
            const sortContainer = document.getElementById('sort-container');
            sortContainer.innerHTML = \`
              <div class="filters-title">📊 Ordenar por precio:</div>
              <button class="sort-btn active" data-sort="asc" onclick="sortProperties('asc')">
                Menor a Mayor ↑
              </button>
              <button class="sort-btn" data-sort="desc" onclick="sortProperties('desc')">
                Mayor a Menor ↓
              </button>
            \`;

            // Renderizar propiedades
            renderProperties(listings);
          }

          function renderProperties(listings) {
            const grid = document.getElementById('properties-grid');
            grid.innerHTML = listings.map(l => {
              const siteName = getSiteName(l.siteKey);
              const mainImage = l.images && l.images.length > 0 ? l.images[0] : null;
              const additionalImages = l.images && l.images.length > 1 ? l.images.slice(1, 4) : [];
              
              return \`
                <div class="property-card" data-site="\${escapeHtml(l.siteKey)}" data-price="\${l.priceUSD ?? 0}">
                  \${mainImage ? \`
                  <div style="width: 100%; height: 200px; overflow: hidden; background-color: #f5f5f5;">
                    <img src="\${mainImage}" alt="\${escapeHtml(l.title || "Propiedad")}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none'; this.parentElement.style.display='none';" />
                  </div>\` : ''}
                  <div style="padding: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                      <h3 style="margin: 0; color: #333; font-size: 20px; flex: 1; min-width: 200px;">\${escapeHtml(l.title || "Sin título")}</h3>
                      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                        \${l.badges && l.badges.length > 0 ? l.badges.map(badge => \`
                          <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);">\${escapeHtml(badge)}</span>
                        \`).join('') : ''}
                        <span class="site-badge" style="background-color: #f0f0f0; color: #666; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap;">\${escapeHtml(siteName)}</span>
                      </div>
                    </div>
                    \${additionalImages.length > 0 ? \`
                    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                      \${additionalImages.map((img) => \`
                        <div style="width: 60px; height: 60px; overflow: hidden; border-radius: 4px; background-color: #f5f5f5; flex-shrink: 0;">
                          <img src="\${img}" alt="" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none';" />
                        </div>
                      \`).join('')}
                    </div>\` : ''}
                    <p style="margin: 8px 0; color: #666;"><strong style="color: #333;">💰 Precio:</strong> \${l.priceUSD ? \`$\${l.priceUSD.toLocaleString()} USD\` : "N/D"}</p>
                    <p style="margin: 8px 0; color: #666;"><strong style="color: #333;">📍 Ubicación:</strong> \${escapeHtml(l.location || "N/D")}</p>
                    \${l.beds ? \`<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">🛏️ Dormitorios:</strong> \${l.beds}</p>\` : ""}
                    \${l.baths ? \`<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">🚿 Baños:</strong> \${l.baths}</p>\` : ""}
                    \${l.area ? \`<p style="margin: 8px 0; color: #666;"><strong style="color: #333;">📐 Área:</strong> \${l.area}</p>\` : ""}
                    <a href="\${l.url}" target="_blank" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; transition: background-color 0.2s;">Ver detalle →</a>
                  </div>
                </div>
              \`;
            }).join('');
          }

          function filterProperties(siteKey) {
            currentFilter = siteKey;
            const buttons = document.querySelectorAll('.filter-btn');
            const noResults = document.getElementById('no-results');
            let visibleListings = [];

            // Actualizar botones activos
            buttons.forEach(btn => {
              if (btn.getAttribute('data-filter') === siteKey) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            });

            // Filtrar propiedades
            if (siteKey === 'all') {
              visibleListings = allListings;
            } else {
              visibleListings = allListings.filter(l => l.siteKey === siteKey);
            }

            // Aplicar ordenamiento
            sortProperties(currentSort, false, visibleListings);

            // Mostrar/ocultar mensaje de no resultados
            if (visibleListings.length === 0) {
              noResults.classList.add('show');
            } else {
              noResults.classList.remove('show');
            }

            // Scroll suave al inicio
            if (visibleListings.length > 0) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }

          function sortProperties(sortOrder, updateFilter = true, listingsToSort = null) {
            currentSort = sortOrder;
            const sortButtons = document.querySelectorAll('.sort-btn');
            const listings = listingsToSort || allListings.filter(l => {
              if (currentFilter === 'all') return true;
              return l.siteKey === currentFilter;
            });

            // Actualizar botones de ordenamiento
            sortButtons.forEach(btn => {
              if (btn.getAttribute('data-sort') === sortOrder) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            });

            // Ordenar propiedades
            const sorted = [...listings].sort((a, b) => {
              const priceA = a.priceUSD ?? Infinity;
              const priceB = b.priceUSD ?? Infinity;
              return sortOrder === 'asc' ? priceA - priceB : priceB - priceA;
            });

            // Renderizar propiedades ordenadas
            renderProperties(sorted);

            // Si se llama desde el botón de ordenamiento, mantener el filtro actual
            if (updateFilter) {
              filterProperties(currentFilter);
            }
          }

          // Cargar datos al iniciar
          loadData();
        </script>
      </body>
    </html>
  `;
};
export const renderHtml = (listings) => {
    if (!listings.length) {
        return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nuevas Propiedades</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h1 style="color: #007bff; margin-top: 0; border-bottom: 3px solid #007bff; padding-bottom: 10px;">🏠 Nuevas Propiedades Encontradas</h1>
          <p style='color: #666;'>No se encontraron nuevas propiedades en esta ejecución.</p>
        </div>
      </body>
    </html>
    `;
    }
    // Ordenar propiedades por precio (menor a mayor por defecto)
    // Las propiedades sin precio van al final
    const sortedListings = [...listings].sort((a, b) => {
        const priceA = a.priceUSD ?? Infinity;
        const priceB = b.priceUSD ?? Infinity;
        return priceA - priceB;
    });
    // Agrupar propiedades por sitio
    const listingsBySite = {};
    sortedListings.forEach((listing) => {
        if (!listingsBySite[listing.siteKey]) {
            listingsBySite[listing.siteKey] = [];
        }
        listingsBySite[listing.siteKey].push(listing);
    });
    const sites = Object.keys(listingsBySite);
    const totalCount = sortedListings.length;
    // Generar estadísticas por sitio
    const siteStats = sites.map((siteKey) => {
        const siteListings = listingsBySite[siteKey];
        const siteName = getSiteName(siteKey);
        return {
            siteKey,
            siteName,
            count: siteListings.length,
        };
    });
    // Generar cards con atributo data-site y data-price para filtrado y ordenamiento
    const cards = sortedListings
        .map((l) => {
        const siteName = getSiteName(l.siteKey);
        const mainImage = l.images && l.images.length > 0 ? l.images[0] : null;
        const additionalImages = l.images && l.images.length > 1 ? l.images.slice(1, 4) : [];
        return `
      <div class="property-card" data-site="${escapeHtml(l.siteKey)}" data-price="${l.priceUSD ?? 0}" style="border: 1px solid #e0e0e0; padding: 0; margin-bottom: 20px; border-radius: 8px; background-color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; transition: transform 0.2s, box-shadow 0.2s;">
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
              <span class="site-badge" style="background-color: #f0f0f0; color: #666; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap;">${escapeHtml(siteName)}</span>
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
          <a href="${l.url}" target="_blank" style="display: inline-block; margin-top: 12px; padding: 10px 20px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 5px; font-weight: bold; transition: background-color 0.2s;">Ver detalle →</a>
        </div>
      </div>`;
    })
        .join("");
    // Generar botones de filtro
    const filterButtons = `
    <button class="filter-btn active" data-filter="all" onclick="filterProperties('all')" style="padding: 10px 20px; margin: 5px; border: 2px solid #007bff; background-color: #007bff; color: white; border-radius: 25px; cursor: pointer; font-weight: 600; transition: all 0.3s;">
      Todas (${totalCount})
    </button>
    ${siteStats.map((stat) => `
      <button class="filter-btn" data-filter="${escapeHtml(stat.siteKey)}" onclick="filterProperties('${escapeHtml(stat.siteKey)}')" style="padding: 10px 20px; margin: 5px; border: 2px solid #007bff; background-color: transparent; color: #007bff; border-radius: 25px; cursor: pointer; font-weight: 600; transition: all 0.3s;">
        ${escapeHtml(stat.siteName)} (${stat.count})
      </button>
    `).join('')}
  `;
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nuevas Propiedades</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          h1 {
            color: #007bff;
            margin-top: 0;
            border-bottom: 3px solid #007bff;
            padding-bottom: 10px;
          }
          .stats-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 20px 0;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            color: white;
            flex-wrap: wrap;
            gap: 10px;
          }
          .stats-item {
            text-align: center;
          }
          .stats-number {
            font-size: 24px;
            font-weight: bold;
            display: block;
          }
          .stats-label {
            font-size: 12px;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .filters-container, .sort-container {
            margin: 20px 0;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 8px;
            text-align: center;
          }
          .filters-title {
            margin-bottom: 15px;
            color: #333;
            font-weight: 600;
          }
          .sort-btn {
            padding: 10px 20px;
            margin: 5px;
            border: 2px solid #28a745;
            background-color: transparent;
            color: #28a745;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            font-size: 14px;
          }
          .sort-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(40, 167, 69, 0.3);
          }
          .sort-btn.active {
            background-color: #28a745;
            color: white;
          }
          .filter-btn {
            padding: 10px 20px;
            margin: 5px;
            border: 2px solid #007bff;
            background-color: transparent;
            color: #007bff;
            border-radius: 25px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            font-size: 14px;
          }
          .filter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 123, 255, 0.3);
          }
          .filter-btn.active {
            background-color: #007bff;
            color: white;
          }
          .properties-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
            margin-top: 20px;
          }
          .property-card {
            transition: transform 0.2s, box-shadow 0.2s;
          }
          .property-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .property-card.hidden {
            display: none;
          }
          .no-results {
            text-align: center;
            padding: 40px;
            color: #666;
            font-size: 18px;
            display: none;
          }
          .no-results.show {
            display: block;
          }
          @media (max-width: 768px) {
            .properties-grid {
              grid-template-columns: 1fr;
            }
            .stats-bar {
              flex-direction: column;
            }
            .filter-btn {
              width: 100%;
              margin: 5px 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏠 Nuevas Propiedades Encontradas</h1>
          
          <div class="stats-bar">
            <div class="stats-item">
              <span class="stats-number">${totalCount}</span>
              <span class="stats-label">Total Propiedades</span>
            </div>
            ${siteStats.map((stat) => `
              <div class="stats-item">
                <span class="stats-number">${stat.count}</span>
                <span class="stats-label">${escapeHtml(stat.siteName)}</span>
              </div>
            `).join('')}
          </div>

          <div class="filters-container">
            <div class="filters-title">🔍 Filtrar por sitio:</div>
            ${filterButtons}
          </div>

          <div class="sort-container">
            <div class="filters-title">📊 Ordenar por precio:</div>
            <button class="sort-btn active" data-sort="asc" onclick="sortProperties('asc')" style="padding: 10px 20px; margin: 5px; border: 2px solid #28a745; background-color: #28a745; color: white; border-radius: 25px; cursor: pointer; font-weight: 600; transition: all 0.3s;">
              Menor a Mayor ↑
            </button>
            <button class="sort-btn" data-sort="desc" onclick="sortProperties('desc')" style="padding: 10px 20px; margin: 5px; border: 2px solid #28a745; background-color: transparent; color: #28a745; border-radius: 25px; cursor: pointer; font-weight: 600; transition: all 0.3s;">
              Mayor a Menor ↓
            </button>
          </div>

          <div class="no-results" id="no-results">
            No hay propiedades que coincidan con el filtro seleccionado.
          </div>

          <div class="properties-grid" id="properties-grid">
            ${cards}
          </div>
        </div>

        <script>
          let currentFilter = 'all';
          let currentSort = 'asc';

          function filterProperties(siteKey) {
            currentFilter = siteKey;
            const cards = document.querySelectorAll('.property-card');
            const buttons = document.querySelectorAll('.filter-btn');
            const noResults = document.getElementById('no-results');
            let visibleCount = 0;

            // Actualizar botones activos
            buttons.forEach(btn => {
              if (btn.getAttribute('data-filter') === siteKey) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            });

            // Filtrar propiedades
            cards.forEach(card => {
              const cardSite = card.getAttribute('data-site');
              if (siteKey === 'all' || cardSite === siteKey) {
                card.classList.remove('hidden');
                visibleCount++;
              } else {
                card.classList.add('hidden');
              }
            });

            // Aplicar ordenamiento después de filtrar
            sortProperties(currentSort, false);

            // Mostrar/ocultar mensaje de no resultados
            if (visibleCount === 0) {
              noResults.classList.add('show');
            } else {
              noResults.classList.remove('show');
            }

            // Scroll suave al inicio si hay resultados
            if (visibleCount > 0) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }

          function sortProperties(sortOrder, updateFilter = true) {
            currentSort = sortOrder;
            const grid = document.getElementById('properties-grid');
            const cards = Array.from(document.querySelectorAll('.property-card:not(.hidden)'));
            const sortButtons = document.querySelectorAll('.sort-btn');

            // Actualizar botones de ordenamiento
            sortButtons.forEach(btn => {
              if (btn.getAttribute('data-sort') === sortOrder) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            });

            // Ordenar las propiedades visibles por precio
            cards.sort((a, b) => {
              const priceA = parseFloat(a.getAttribute('data-price')) || Infinity;
              const priceB = parseFloat(b.getAttribute('data-price')) || Infinity;
              
              if (sortOrder === 'asc') {
                return priceA - priceB;
              } else {
                return priceB - priceA;
              }
            });

            // Reordenar en el DOM
            cards.forEach(card => {
              grid.appendChild(card);
            });

            // Si se llama desde el botón de ordenamiento, mantener el filtro actual
            if (updateFilter) {
              filterProperties(currentFilter);
            }
          }

          // Inicializar: mostrar todas las propiedades ordenadas
          document.addEventListener('DOMContentLoaded', function() {
            filterProperties('all');
            sortProperties('asc', false);
          });
        </script>
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
