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
     6. Obtención y ordenamiento por categoría (una hoja = una tabla)
     7. Renderizado dinámico de cada tabla independiente
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
    SPREADSHEET_ID: '1JALgkuHRRRYfEShazRuEDMNmE60N__izr_gT8kyONQQ',

    // Nombre exacto de la pestaña (hoja) dentro del Google Sheet para cada categoría.
    SHEET_NAMES: {
        SUMO: 'SUMO',
        SOCCER: 'SOCCER',
        AMERICANO: 'AMERICANO',
        CUARENTA_M: '40M',
        LABERINTO: 'LABERINTO',
    },

    // Etiquetas legibles usadas únicamente en mensajes (estado vacío / error).
    CATEGORY_LABELS: {
        SUMO: 'Sumo',
        SOCCER: 'Soccer',
        AMERICANO: 'Fútbol Americano',
        CUARENTA_M: '40 Metros',
        LABERINTO: 'Laberinto',
    },

    // Cada categoría/hoja tiene su propia tabla independiente en el HTML.
    // Mapea la clave interna de SHEET_NAMES con el id del <tbody> a llenar.
    SHEET_TBODY_IDS: {
        SUMO: 'standingsSumo',
        SOCCER: 'standingsSoccer',
        AMERICANO: 'standingsAmericano',
        CUARENTA_M: 'standings40M',
        LABERINTO: 'standingsLaberinto',
    },

    // Selector usado únicamente para verificar que la sección de
    // Clasificaciones existe en la página antes de inicializar.
    SECTION_SELECTOR: '#clasificaciones',

    // Intervalo de actualización automática de las clasificaciones (ms).
    REFRESH_INTERVAL_MS: 60000,

    // Cantidad de columnas visibles en cada tabla (usada para colSpan de
    // los mensajes de estado vacío/error): Posición, Equipo, Colegio,
    // Victorias, Empates, Derrotas, Puntos, Tiempo, Observaciones.
    VISIBLE_COLUMNS: 9,

    // Columnas reales de cada hoja de categoría (SUMO, SOCCER, AMERICANO,
    // 40M, LABERINTO), en el orden exacto A → K.
    // Únicamente se leen las columnas necesarias para la tabla; ID, Capitán
    // y Estado se ignoran intencionalmente.
    COLUMN_INDEX: {
        // A = ID        -> ignorada
        TEAM: 1,           // B = Equipo
        SCHOOL: 2,         // C = Colegio
        // D = Capitán   -> ignorada
        // E = Estado    -> ignorada
        WINS: 5,           // F = Victorias
        DRAWS: 6,          // G = Empates
        LOSSES: 7,         // H = Derrotas
        POINTS: 8,         // I = Puntos
        TIME: 23,           // J = Tiempo
        OBSERVATIONS: 22,  // K = Observaciones
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

/**
 * Convierte un valor de celda de Google Sheets a texto seguro, recortando
 * espacios y devolviendo cadena vacía si la celda no existe o es nula.
 * @param {*} cell
 * @returns {string}
 */
function toSafeText(cell) {
    return cell && cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : '';
}

/**
 * Convierte el texto de la columna "Tiempo" en un número comparable para
 * ordenar. Acepta valores con coma decimal (ej. "12,34") o vacíos.
 * Si el valor no es interpretable como número, devuelve Infinity para que
 * ese equipo quede al final del desempate por tiempo.
 * @param {string} timeText
 * @returns {number}
 */
function toComparableTime(timeText) {
    if (!timeText) return Infinity;
    const normalized = timeText.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Infinity;
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
 * Convierte las filas crudas de una hoja en objetos de clasificación,
 * leyendo únicamente las columnas necesarias (Equipo, Colegio, Victorias,
 * Empates, Derrotas, Puntos, Tiempo, Observaciones).
 * @param {object} table - Tabla en formato Google Charts ({ rows: [...] }).
 * @returns {Array<{
 *   team: string, school: string, wins: number, draws: number,
 *   losses: number, points: number, time: string, timeValue: number,
 *   observations: string
 * }>}
 */
function mapRowsToStandings(table) {
    if (!table || !Array.isArray(table.rows)) return [];

    const idx = SHEETS_CONFIG.COLUMN_INDEX;

    return table.rows
    .map((row) => {
            const cells = row.c || [];
            console.log("Celdas:", cells);

            const team = toSafeText(cells[idx.TEAM]);
            const school = toSafeText(cells[idx.SCHOOL]);
            const wins = toSafeNumber(cells[idx.WINS] && cells[idx.WINS].v);
            const draws = toSafeNumber(cells[idx.DRAWS] && cells[idx.DRAWS].v);
            const losses = toSafeNumber(cells[idx.LOSSES] && cells[idx.LOSSES].v);
            const points = toSafeNumber(cells[idx.POINTS] && cells[idx.POINTS].v);
            const time = toSafeText(cells[idx.TIME]);
            const observations = toSafeText(cells[idx.OBSERVATIONS]);

            return {
                team,
                school,
                wins,
                draws,
                losses,
                points,
                time,
                timeValue: toComparableTime(time),
                observations,
            };
        })
        .filter((entry) => entry.team !== ''); // Descarta filas vacías o de encabezado repetido.
}

/**
 * Ordena una lista de equipos de una misma categoría según las reglas del
 * torneo:
 *   1) Mayor cantidad de puntos.
 *   2) Si empatan en puntos, menor tiempo.
 *   3) Si siguen empatados, orden alfabético por nombre de equipo.
 * @param {Array} standings
 * @returns {Array} Lista ordenada (nuevo arreglo, no muta el original).
 */
function sortStandings(standings) {
    return [...standings].sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (a.timeValue !== b.timeValue) return a.timeValue - b.timeValue;
        return a.team.localeCompare(b.team, 'es', { sensitivity: 'base' });
    });
}

/**
 * Asigna la posición (#1, #2, #3...) a cada equipo según el orden recibido.
 * @param {Array} sortedStandings
 * @returns {Array}
 */
function assignPositions(sortedStandings) {
    return sortedStandings.map((entry, index) => ({
        position: index + 1,
        ...entry,
    }));
}

/* ==========================================================================
   6. OBTENCIÓN Y ORDENAMIENTO POR CATEGORÍA
   Cada hoja se descarga, normaliza y ordena de forma independiente: no
   existe una tabla general combinada.
   ========================================================================== */

/**
 * Descarga, normaliza y ordena la clasificación de una sola categoría.
 * Si la hoja está vacía o falla la descarga, devuelve un arreglo vacío
 * sin interrumpir el resto de categorías.
 * @param {string} sheetKey - Clave interna definida en SHEET_NAMES (ej. "SUMO").
 * @returns {Promise<Array>} Clasificación ordenada y con posición asignada.
 */
async function fetchCategoryStandings(sheetKey) {
    const sheetName = SHEETS_CONFIG.SHEET_NAMES[sheetKey];
    const categoryLabel = SHEETS_CONFIG.CATEGORY_LABELS[sheetKey];

    try {
        const rawText = await fetchRawSheet(sheetName);
        const table = parseGvizResponse(rawText);
         console.log("Categoría:", sheetName);
         console.log(table.rows);

         console.log("Filas completas:");
         table.rows.forEach((row, index) => {
         console.log("Fila", index, row);
        });

        const rawStandings = mapRowsToStandings(table);

         console.log("Equipos procesados:");
         console.log(rawStandings);
         console.log(table.rows);

         console.log(rawStandings);
        const sorted = sortStandings(rawStandings);
        return assignPositions(sorted);
    } catch (error) {
        console.error(`[sheets.js] Error al leer la categoría "${categoryLabel}":`, error.message);
        throw error; // Se relanza para que el llamador distinga "vacío" de "error".
    }
}

/* ==========================================================================
   7. RENDERIZADO DINÁMICO DE CADA TABLA INDEPENDIENTE
   ========================================================================== */

/**
 * Construye una fila <tr> de la tabla de clasificaciones a partir de un
 * objeto de resultado normalizado y ordenado.
 * @param {{position: number, team: string, school: string, wins: number,
 *   draws: number, losses: number, points: number, time: string,
 *   observations: string}} entry
 * @returns {HTMLTableRowElement}
 */
function createStandingsRow(entry) {
    const row = document.createElement('tr');

    const positionCell = document.createElement('td');
    positionCell.textContent = `#${entry.position}`;

    const teamCell = document.createElement('td');
    teamCell.textContent = entry.team;

    const schoolCell = document.createElement('td');
    schoolCell.textContent = entry.school;

    const winsCell = document.createElement('td');
    winsCell.textContent = String(entry.wins);

    const drawsCell = document.createElement('td');
    drawsCell.textContent = String(entry.draws);

    const lossesCell = document.createElement('td');
    lossesCell.textContent = String(entry.losses);

    const pointsCell = document.createElement('td');
    pointsCell.textContent = String(entry.points);

    const timeCell = document.createElement('td');
    timeCell.textContent = entry.time;

    const observationsCell = document.createElement('td');
    observationsCell.textContent = entry.observations;

    row.append(
        positionCell,
        teamCell,
        schoolCell,
        winsCell,
        drawsCell,
        lossesCell,
        pointsCell,
        timeCell,
        observationsCell
    );

    return row;
}

/**
 * Muestra un mensaje de estado (una sola fila con colSpan completo) dentro
 * del <tbody> indicado. Se reutiliza tanto para "sin equipos" como para
 * errores de conexión.
 * @param {HTMLElement} tableBody
 * @param {string} message
 * @param {string} [modifierClass] - Clase opcional para dar estilo elegante
 *   al mensaje (ej. "standings-table__status--empty" o "...--error").
 */
function renderStatusRow(tableBody, message, modifierClass) {
    tableBody.replaceChildren();

    const statusRow = document.createElement('tr');
    const statusCell = document.createElement('td');
    statusCell.colSpan = SHEETS_CONFIG.VISIBLE_COLUMNS;
    statusCell.textContent = message;
    statusCell.className = 'standings-table__status' + (modifierClass ? ` ${modifierClass}` : '');
    statusRow.appendChild(statusCell);
    tableBody.appendChild(statusRow);
}

/**
 * Renderiza la clasificación ya ordenada de una categoría en su <tbody>
 * correspondiente. Si no hay equipos registrados, muestra un mensaje
 * elegante en lugar de una tabla vacía.
 * @param {string} sheetKey
 * @param {Array} standings
 */
function renderCategoryTable(sheetKey, standings) {
    const tbodyId = SHEETS_CONFIG.SHEET_TBODY_IDS[sheetKey];
    const tableBody = document.getElementById(tbodyId);
    if (!tableBody) return;

    if (!standings.length) {
        const categoryLabel = SHEETS_CONFIG.CATEGORY_LABELS[sheetKey];
        renderStatusRow(
            tableBody,
            `Aún no hay equipos registrados en ${categoryLabel}.`,
            'standings-table__status--empty'
        );
        return;
    }

    tableBody.replaceChildren();
    const fragment = document.createDocumentFragment();
    standings.forEach((entry) => fragment.appendChild(createStandingsRow(entry)));
    tableBody.appendChild(fragment);
}

/**
 * Muestra un estado de error accesible dentro del <tbody> de una categoría
 * cuando su hoja no pudo descargarse (por ejemplo, sin conexión a internet).
 * El resto de categorías sigue actualizándose con normalidad.
 * @param {string} sheetKey
 */
function renderCategoryError(sheetKey) {
    const tbodyId = SHEETS_CONFIG.SHEET_TBODY_IDS[sheetKey];
    const tableBody = document.getElementById(tbodyId);
    if (!tableBody) return;

    renderStatusRow(
        tableBody,
        'No se pudo cargar esta categoría. Intentando de nuevo automáticamente…',
        'standings-table__status--error'
    );
}

/* ==========================================================================
   8. ACTUALIZACIÓN AUTOMÁTICA PERIÓDICA
   ========================================================================== */

/**
 * Actualiza una sola categoría: descarga, ordena y renderiza su tabla.
 * Los errores se contienen aquí para que una hoja con problemas no afecte
 * a las demás categorías.
 * @param {string} sheetKey
 */
async function refreshCategory(sheetKey) {
    try {
        const standings = await fetchCategoryStandings(sheetKey);
        renderCategoryTable(sheetKey, standings);
    } catch (error) {
        renderCategoryError(sheetKey);
    }
}

/**
 * Actualiza las 5 categorías en paralelo. Cada una se resuelve de forma
 * independiente: no existe una tabla general combinada.
 */
async function refreshAllStandings() {
    const sheetKeys = Object.keys(SHEETS_CONFIG.SHEET_NAMES);
    await Promise.all(sheetKeys.map((sheetKey) => refreshCategory(sheetKey)));
}

/**
 * Programa la actualización automática cada SHEETS_CONFIG.REFRESH_INTERVAL_MS
 * (60 segundos), pausando el intervalo cuando la pestaña no está visible
 * para ahorrar llamadas de red innecesarias.
 */
function scheduleAutoRefresh() {
    let intervalId = window.setInterval(refreshAllStandings, SHEETS_CONFIG.REFRESH_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            window.clearInterval(intervalId);
        } else {
            refreshAllStandings();
            intervalId = window.setInterval(refreshAllStandings, SHEETS_CONFIG.REFRESH_INTERVAL_MS);
        }
    });
}

/* ==========================================================================
   9. INICIALIZACIÓN GENERAL
   ========================================================================== */
function initSheets() {
    const section = qs(SHEETS_CONFIG.SECTION_SELECTOR);
    if (!section) return;

    refreshAllStandings();
    scheduleAutoRefresh();
}

document.addEventListener('DOMContentLoaded', initSheets);