/* ==========================================================================
   TORNEO ESCOLAR DE CARROS ROBOTS — sheets.js
   Lectura de clasificaciones desde Google Sheets mediante Fetch API.
   JavaScript ES6 Vanilla, modular, sin librerías externas.
   Módulos incluidos:
     1. Configuración y constantes (único punto a editar por deporte)
     2. Utilidades compartidas
     3. Construcción de la URL de cada hoja (gviz)
     4. Fetch y parseo de la respuesta de Google Sheets
     5. Normalización de filas a objetos de clasificación
     6. Obtención combinada de las 5 categorías
     7. Renderizado dinámico de la tabla
     8. Actualización automática periódica
     9. Inicialización general
   ========================================================================== */

/* ==========================================================================
   1. CONFIGURACIÓN Y CONSTANTES
   Para conectar el sitio a tu Google Sheet real, solo es necesario:
     a) Reemplazar SPREADSHEET_ID por el ID del documento (lo que aparece
        en la URL entre "/d/" y "/edit").
     b) Verificar que el nombre de cada pestaña (hoja) coincida con los
        valores del objeto SHEET_NAMES.
     c) Publicar el Google Sheet en la web (Archivo > Compartir >
        Publicar en la web) para que el endpoint "gviz" sea accesible.
   ========================================================================== */
const SHEETS_CONFIG = {
    // ÚNICO valor que se debe cambiar para apuntar a otro Google Sheet.
    SPREADSHEET_ID: 'REEMPLAZAR_CON_TU_SPREADSHEET_ID',

    // Nombre exacto de la pestaña (hoja) dentro del Google Sheet para cada categoría.
    SHEET_NAMES: {
        SUMO: 'SUMO',
        SOCCER: 'SOCCER',
        AMERICANO: 'AMERICANO',
        CUARENTA_M: '40M',
        LABERINTO: 'LABERINTO',
    },

    // Etiquetas legibles mostradas en la columna "Categoría" de la tabla.
    CATEGORY_LABELS: {
        SUMO: 'Sumo',
        SOCCER: 'Soccer',
        AMERICANO: 'Fútbol Americano',
        CUARENTA_M: '40 Metros',
        LABERINTO: 'Laberinto',
    },

    // Intervalo de actualización automática de las clasificaciones (ms).
    REFRESH_INTERVAL_MS: 60000,

    // Selectores del DOM donde se inyectan los resultados.
    TABLE_BODY_SELECTOR: '#standingsTableBody',
    TABLE_WRAPPER_SELECTOR: '.standings-section__table-wrapper',

    // Columnas esperadas en cada hoja, en este orden: Equipo | Puntos.
    COLUMN_INDEX: {
        TEAM: 0,
        POINTS: 1,
    },
};

/* ==========================================================================
   2. UTILIDADES COMPARTIDAS
   ========================================================================== */
function qs(selector, context = document) {
    return context.querySelector(selector);
}

/**
 * Convierte un valor de celda de Google Sheets a número seguro.
 * @param {*} value
 * @returns {number}
 */
function toSafeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

/* ==========================================================================
   3. CONSTRUCCIÓN DE LA URL DE CADA HOJA (GVIZ)
   Google expone cada hoja publicada como JSON a través del endpoint
   "gviz/tq", sin necesidad de API Key para documentos públicos.
   ========================================================================== */
function buildSheetUrl(sheetName) {
    const base = `https://docs.google.com/spreadsheets/d/${SHEETS_CONFIG.SPREADSHEET_ID}/gviz/tq`;
    const params = new URLSearchParams({
        tqx: 'out:json',
        sheet: sheetName,
    });

    return `${base}?${params.toString()}`;
}

/* ==========================================================================
   4. FETCH Y PARSEO DE LA RESPUESTA DE GOOGLE SHEETS
   La respuesta de "gviz" no es JSON puro: viene envuelta en una función
   de callback de texto que debe recortarse antes de parsear.
   ========================================================================== */

/**
 * Descarga el contenido crudo de una hoja específica.
 * @param {string} sheetName - Nombre de la pestaña dentro del Google Sheet.
 * @returns {Promise<string>} Texto crudo de la respuesta.
 */
async function fetchRawSheet(sheetName) {
    const url = buildSheetUrl(sheetName);
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
        throw new Error(`No se pudo obtener la hoja "${sheetName}" (HTTP ${response.status})`);
    }

    return response.text();
}

/**
 * Extrae el objeto JSON del texto envuelto que devuelve el endpoint gviz.
 * @param {string} rawText
 * @returns {object} Tabla en el formato { rows, cols } de Google Charts.
 */
function parseGvizResponse(rawText) {
    const jsonStart = rawText.indexOf('{');
    const jsonEnd = rawText.lastIndexOf('}');

    if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('Formato de respuesta de Google Sheets inesperado.');
    }

    const jsonString = rawText.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonString);

    return parsed.table;
}

/* ==========================================================================
   5. NORMALIZACIÓN DE FILAS A OBJETOS DE CLASIFICACIÓN
   ========================================================================== */

/**
 * Convierte las filas crudas de una hoja en objetos { team, points, category }.
 * @param {object} table - Tabla en formato Google Charts ({ rows: [...] }).
 * @param {string} categoryLabel - Etiqueta legible de la categoría/deporte.
 * @returns {Array<{team: string, points: number, category: string}>}
 */
function mapRowsToStandings(table, categoryLabel) {
    if (!table || !Array.isArray(table.rows)) return [];

    return table.rows
        .map((row) => {
            const cells = row.c || [];
            const teamCell = cells[SHEETS_CONFIG.COLUMN_INDEX.TEAM];
            const pointsCell = cells[SHEETS_CONFIG.COLUMN_INDEX.POINTS];

            const team = teamCell && teamCell.v !== null ? String(teamCell.v).trim() : '';
            const points = pointsCell ? toSafeNumber(pointsCell.v) : 0;

            return { team, points, category: categoryLabel };
        })
        .filter((entry) => entry.team !== ''); // Descarta filas vacías o de encabezado repetido.
}

/* ==========================================================================
   6. OBTENCIÓN COMBINADA DE LAS 5 CATEGORÍAS
   ========================================================================== */

/**
 * Descarga y normaliza los datos de una sola categoría/deporte.
 * @param {string} sheetKey - Clave interna definida en SHEET_NAMES (ej. "SUMO").
 * @returns {Promise<Array>} Clasificación normalizada de esa categoría.
 */
async function fetchCategoryStandings(sheetKey) {
    const sheetName = SHEETS_CONFIG.SHEET_NAMES[sheetKey];
    const categoryLabel = SHEETS_CONFIG.CATEGORY_LABELS[sheetKey];

    try {
        const rawText = await fetchRawSheet(sheetName);
        const table = parseGvizResponse(rawText);
        return mapRowsToStandings(table, categoryLabel);
    } catch (error) {
        console.error(`[sheets.js] Error al leer la categoría "${categoryLabel}":`, error.message);
        return [];
    }
}

/**
 * Descarga en paralelo las 5 hojas del torneo y las combina en una sola lista,
 * ordenada por puntos de mayor a menor, con la posición ya asignada.
 * @returns {Promise<Array<{position: number, team: string, category: string, points: number}>>}
 */
async function fetchAllStandings() {
    const sheetKeys = Object.keys(SHEETS_CONFIG.SHEET_NAMES);

    const resultsByCategory = await Promise.all(
        sheetKeys.map((sheetKey) => fetchCategoryStandings(sheetKey))
    );

    const combined = resultsByCategory.flat();

    combined.sort((a, b) => b.points - a.points);

    return combined.map((entry, index) => ({
        position: index + 1,
        ...entry,
    }));
}

/* ==========================================================================
   7. RENDERIZADO DINÁMICO DE LA TABLA
   ========================================================================== */

/**
 * Construye una fila <tr> de la tabla de clasificaciones a partir de un
 * objeto de resultado normalizado.
 * @param {{position: number, team: string, category: string, points: number}} entry
 * @returns {HTMLTableRowElement}
 */
function createStandingsRow(entry) {
    const row = document.createElement('tr');

    const positionCell = document.createElement('td');
    positionCell.textContent = `#${entry.position}`;

    const teamCell = document.createElement('td');
    teamCell.textContent = entry.team;

    const categoryCell = document.createElement('td');
    categoryCell.textContent = entry.category;

    const pointsCell = document.createElement('td');
    pointsCell.textContent = String(entry.points);

    row.append(positionCell, teamCell, categoryCell, pointsCell);
    return row;
}

/**
 * Reemplaza el contenido del <tbody> con las filas de clasificación dadas.
 * @param {Array} standings
 */
function renderStandingsTable(standings) {
    const tableBody = qs(SHEETS_CONFIG.TABLE_BODY_SELECTOR);
    if (!tableBody) return;

    tableBody.replaceChildren();

    if (!standings.length) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 4;
        emptyCell.textContent = 'Las clasificaciones se publicarán próximamente.';
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
        return;
    }

    const fragment = document.createDocumentFragment();
    standings.forEach((entry) => fragment.appendChild(createStandingsRow(entry)));
    tableBody.appendChild(fragment);
}

/**
 * Muestra un estado de error accesible dentro de la tabla si la carga falla
 * por completo (por ejemplo, sin conexión a internet).
 */
function renderStandingsError() {
    const tableBody = qs(SHEETS_CONFIG.TABLE_BODY_SELECTOR);
    if (!tableBody) return;

    tableBody.replaceChildren();

    const errorRow = document.createElement('tr');
    const errorCell = document.createElement('td');
    errorCell.colSpan = 4;
    errorCell.textContent = 'No se pudieron cargar las clasificaciones. Intentando de nuevo automáticamente…';
    errorRow.appendChild(errorCell);
    tableBody.appendChild(errorRow);
}

/* ==========================================================================
   8. ACTUALIZACIÓN AUTOMÁTICA PERIÓDICA
   ========================================================================== */

/**
 * Ejecuta una carga completa de clasificaciones y actualiza la tabla.
 * Se aísla en su propia función para reutilizarse tanto en la carga
   inicial como en cada ciclo del intervalo automático.
 */
async function refreshStandings() {
    try {
        const standings = await fetchAllStandings();
        renderStandingsTable(standings);
    } catch (error) {
        console.error('[sheets.js] Error general al actualizar clasificaciones:', error.message);
        renderStandingsError();
    }
}

/**
 * Programa la actualización automática cada SHEETS_CONFIG.REFRESH_INTERVAL_MS,
 * pausando el intervalo cuando la pestaña no está visible para ahorrar
 * llamadas de red innecesarias.
 */
function scheduleAutoRefresh() {
    let intervalId = window.setInterval(refreshStandings, SHEETS_CONFIG.REFRESH_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            window.clearInterval(intervalId);
        } else {
            refreshStandings();
            intervalId = window.setInterval(refreshStandings, SHEETS_CONFIG.REFRESH_INTERVAL_MS);
        }
    });
}

/* ==========================================================================
   9. INICIALIZACIÓN GENERAL
   ========================================================================== */
function initSheets() {
    const tableWrapper = qs(SHEETS_CONFIG.TABLE_WRAPPER_SELECTOR);
    if (!tableWrapper) return;

    refreshStandings();
    scheduleAutoRefresh();
}

document.addEventListener('DOMContentLoaded', initSheets);
