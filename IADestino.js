/**
 * Validación semántica del campo Destino usando la API de Gemini
 * (Google AI Studio / Generative Language API), autenticada con API key.
 *
 * No reemplaza validarDestino() (heurística barata en Codigo.js) — la
 * complementa. La heurística filtra basura obvia sin gastar una llamada de
 * red; solo los valores que pasan la heurística se envían a la IA para
 * juicio semántico (ej. "asdf qwer" pasa el largo mínimo pero no significa
 * nada real).
 *
 * Requiere las Propiedades del Script:
 *   GEMINI_API_KEY   → API key de la Gemini API (Google AI Studio).
 *   GEMINI_MODEL     → (opcional) modelo a usar; por defecto "gemini-2.5-flash-lite".
 *
 * La API key NUNCA debe estar hardcodeada en el código: se configura en
 * Configuración del proyecto → Propiedades del script.
 */

const GEMINI_CHUNK_SIZE = 100;
const GEMINI_API_BASE   = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Valida en lote una lista de valores ÚNICOS de Destino contra la Gemini API.
 * Si la lista supera GEMINI_CHUNK_SIZE, se parte en varias llamadas.
 * Si la Gemini API falla (timeout/5xx/cuota) tras los reintentos de retry(),
 * NO bloquea la radicación: se registra el aviso y esos valores quedan
 * validados solo por heurística.
 *
 * @param {Array<string>} listaDestinos  Valores únicos ya trimeados.
 * @returns {{mapa: Object, degradado: boolean}}
 *   mapa       → { destino: {valido, motivo} } por cada valor que sí obtuvo veredicto de IA.
 *   degradado  → true si algún chunk falló y se siguió solo con heurística.
 */
function validarDestinosConIA_(listaDestinos) {
  const mapa = {};
  let degradado = false;
  if (!listaDestinos || listaDestinos.length === 0) return { mapa, degradado };

  for (let i = 0; i < listaDestinos.length; i += GEMINI_CHUNK_SIZE) {
    const chunk = listaDestinos.slice(i, i + GEMINI_CHUNK_SIZE);

    try {
      const veredictos = retry(() => _llamarGeminiDestinos_(chunk));
      veredictos.forEach(v => {
        if (v && v.destino) {
          mapa[v.destino] = { valido: v.valido !== false, motivo: v.motivo || '' };
        }
      });
    } catch (e) {
      degradado = true;
      console.warn('Validación IA de Destino no disponible (' + e.message + '). ' +
                    'Se usa solo la heurística para este batch de ' + chunk.length + ' valores.');
      // No se agrega nada al mapa para este chunk → esos destinos quedan
      // sin veredicto de IA y el motor los trata como válidos (ya pasaron
      // la heurística). Degradación intencional, ver Codigo.js Cascada 3.
    }
  }

  return { mapa, degradado };
}

/**
 * Hace la llamada HTTP a la Gemini API (generateContent) para un chunk de
 * destinos y devuelve el array de veredictos ya parseado.
 * Lanza excepción si la respuesta no es 200 o no trae contenido utilizable,
 * para que retry() la reintente y, si persiste, validarDestinosConIA_ la
 * capture y degrade.
 */
function _llamarGeminiDestinos_(destinos) {
  const props  = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  const modelo = props.getProperty('GEMINI_MODEL') || 'gemini-3.5-flash-lite';

  if (!apiKey) {
    throw new Error('Falta la propiedad de script GEMINI_API_KEY con la API key de la Gemini API.');
  }

  const url = `${GEMINI_API_BASE}/models/${modelo}:generateContent`;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: _construirPromptDestinos_(destinos) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            destino: { type: 'STRING' },
            valido:  { type: 'BOOLEAN' },
            motivo:  { type: 'STRING' }
          },
          required: ['destino', 'valido']
        }
      }
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const codigo = response.getResponseCode();
  if (codigo !== 200) {
    // No se registra el cuerpo completo para evitar filtrar la API key u
    // otros datos sensibles en logs; solo el código de estado.
    throw new Error('La Gemini API respondió con código ' + codigo + '.');
  }

  const data      = JSON.parse(response.getContentText());
  const candidato = data.candidates && data.candidates[0];
  const parte     = candidato && candidato.content && candidato.content.parts && candidato.content.parts[0];

  if (!parte || !parte.text) {
    throw new Error('Respuesta de la Gemini API sin contenido utilizable.');
  }

  return JSON.parse(parte.text);
}

/**
 * Arma el prompt de clasificación en lote. Se pide explícitamente un
 * veredicto por cada valor, en el mismo formato, para minimizar variabilidad.
 */
function _construirPromptDestinos_(destinos) {
  return 'Eres un auditor de contratos de arrendamiento en Colombia. Para cada valor de la ' +
    'lista de abajo, evalúa si describe con PRECISIÓN el DESTINO o USO REAL y ESPECÍFICO de un ' +
    'inmueble arrendado, es decir, la actividad concreta que se ejerce allí ' +
    '(ejemplos válidos: "Peluquería", "Restaurante", "Vivienda", "Vivienda familiar", ' +
    '"Bodega de repuestos", "Consultorio odontológico").\n\n' +
    'IMPORTANTE: "Vivienda" y "Vivienda familiar" SÍ son destinos válidos porque identifican ' +
    'el uso residencial. En cambio, "Apartamento", "Apto" o "Casa" a secas NO son válidos ' +
    'porque describen el tipo de inmueble, no el uso/destino.\n\n' +
    'Sé ESTRICTO con lo COMERCIAL. Marca "valido": false cuando el valor:\n' +
    '- Sea texto sin sentido, relleno o ambiguo.\n' +
    '- Sea una categoría comercial GENÉRICA que NO identifica la actividad concreta, aunque ' +
    'suene plausible. En especial, rechaza valores como "Local comercial", "Local", "Comercial", ' +
    '"Comercio", "Oficina", "Uso comercial", "Bodega" (a secas), "Negocio", "Uso mixto" y ' +
    'similares: indican una categoría pero no QUÉ actividad se ejerce.\n' +
    '- No describa un uso de inmueble.\n\n' +
    'Un valor solo es válido si permite saber la actividad real (ej. "Bodega de repuestos" es ' +
    'válido, "Bodega" no; "Oficina de contaduría" es válido, "Oficina" no). ' +
    'Cuando sea inválido, da un "motivo" breve en español explicando por qué y, si aplica, ' +
    'pide que especifiquen la actividad concreta. ' +
    'Responde con un elemento por cada valor de la lista, en el mismo orden, sin omitir ninguno.\n\n' +
    'Valores a evaluar:\n' + JSON.stringify(destinos);
}
