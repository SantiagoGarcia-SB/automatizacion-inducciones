/**
 * Validación semántica del campo Destino usando Vertex AI (Gemini), con la
 * cuenta de servicio del proyecto GCP "Proyecto IA Servicios Bolivar".
 *
 * No reemplaza validarDestino() (heurística barata en Codigo.js) — la
 * complementa. La heurística filtra basura obvia sin gastar una llamada de
 * red; solo los valores que pasan la heurística se envían a la IA para
 * juicio semántico (ej. "asdf qwer" pasa el largo mínimo pero no significa
 * nada real).
 *
 * Requiere las Propiedades del Script:
 *   VERTEX_SA_KEY_JSON  → contenido completo del JSON de la cuenta de servicio
 *   VERTEX_PROJECT_ID   → ID del proyecto GCP (ej. "proyecto-ia-servicios-bolivar")
 *   VERTEX_LOCATION     → región de Vertex AI (ej. "us-central1")
 *   VERTEX_MODEL        → (opcional) modelo a usar; por defecto "gemini-2.5-flash-lite"
 *
 * Requiere la librería OAuth2 for Apps Script (identificador "OAuth2").
 */

const VERTEX_CHUNK_SIZE = 100;

/**
 * Diagnóstico manual: selecciónala en el desplegable "Ejecutar" del editor
 * y revisa el resultado en "Registro de ejecución". Prueba la cadena
 * completa (credenciales → OAuth2 → Vertex AI) sin pasar por un Excel real.
 * No la usa ningún flujo de negocio — se puede borrar cuando ya no se necesite.
 */
function probarValidacionDestinoIA() {
  const muestra = ["Peluquería", "comercializar", "Restaurante de comida rápida"];
  const resultado = validarDestinosConIA_(muestra);

  Logger.log("Degradado (Vertex AI no disponible): " + resultado.degradado);
  Logger.log("Veredictos: " + JSON.stringify(resultado.mapa, null, 2));
}

/**
 * Crea el servicio OAuth2 que firma el JWT de la cuenta de servicio y
 * obtiene el access token de Vertex AI (scope cloud-platform).
 */
function _obtenerServicioVertex_() {
  const props = PropertiesService.getScriptProperties();
  const credencialesJson = props.getProperty('VERTEX_SA_KEY_JSON');

  if (!credencialesJson) {
    throw new Error('Falta la propiedad de script VERTEX_SA_KEY_JSON con la clave de la cuenta de servicio de Vertex AI.');
  }

  const credenciales = JSON.parse(credencialesJson);

  return OAuth2.createService('VertexAI')
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setPrivateKey(credenciales.private_key)
    .setIssuer(credenciales.client_email)
    .setPropertyStore(props)
    .setScope('https://www.googleapis.com/auth/cloud-platform');
}

/**
 * Valida en lote una lista de valores ÚNICOS de Destino contra Vertex AI.
 * Si la lista supera VERTEX_CHUNK_SIZE, se parte en varias llamadas.
 * Si Vertex AI falla (timeout/5xx/cuota) tras los reintentos de retry(),
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

  for (let i = 0; i < listaDestinos.length; i += VERTEX_CHUNK_SIZE) {
    const chunk = listaDestinos.slice(i, i + VERTEX_CHUNK_SIZE);

    try {
      const veredictos = retry(() => _llamarVertexDestinos_(chunk));
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
 * Hace la llamada HTTP a Vertex AI (generateContent) para un chunk de
 * destinos y devuelve el array de veredictos ya parseado.
 * Lanza excepción si la respuesta no es 200 o no trae contenido utilizable,
 * para que retry() la reintente y, si persiste, validarDestinosConIA_ la
 * capture y degrade.
 */
function _llamarVertexDestinos_(destinos) {
  const props     = PropertiesService.getScriptProperties();
  const projectId = props.getProperty('VERTEX_PROJECT_ID');
  const location  = props.getProperty('VERTEX_LOCATION') || 'us-central1';
  const modelo    = props.getProperty('VERTEX_MODEL') || 'gemini-2.5-flash-lite';

  if (!projectId) {
    throw new Error('Falta la propiedad de script VERTEX_PROJECT_ID.');
  }

  const service = _obtenerServicioVertex_();
  if (!service.hasAccess()) {
    throw new Error('No se pudo obtener el token de acceso de Vertex AI: ' + service.getLastError());
  }

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelo}:generateContent`;

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
    headers: { Authorization: 'Bearer ' + service.getAccessToken() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const codigo = response.getResponseCode();
  if (codigo !== 200) {
    throw new Error('Vertex AI respondió ' + codigo + ': ' + response.getContentText());
  }

  const data      = JSON.parse(response.getContentText());
  const candidato = data.candidates && data.candidates[0];
  const parte     = candidato && candidato.content && candidato.content.parts && candidato.content.parts[0];

  if (!parte || !parte.text) {
    throw new Error('Respuesta de Vertex AI sin contenido utilizable: ' + response.getContentText());
  }

  return JSON.parse(parte.text);
}

/**
 * Arma el prompt de clasificación en lote. Se pide explícitamente un
 * veredicto por cada valor, en el mismo formato, para minimizar variabilidad.
 */
function _construirPromptDestinos_(destinos) {
  return 'Eres un auditor de contratos de arrendamiento en Colombia. Para cada valor de la ' +
    'lista de abajo, evalúa si describe un DESTINO o USO REAL de un inmueble arrendado ' +
    '(ejemplos válidos: "Peluquería", "Restaurante", "Vivienda familiar", "Bodega de repuestos", ' +
    '"Consultorio odontológico"). Marca "valido": false si el valor es texto sin sentido, ' +
    'ambiguo, demasiado genérico para identificar la actividad real, o no describe un uso de ' +
    'inmueble. Cuando sea inválido, da un "motivo" breve en español explicando por qué. ' +
    'Responde con un elemento por cada valor de la lista, en el mismo orden, sin omitir ninguno.\n\n' +
    'Valores a evaluar:\n' + JSON.stringify(destinos);
}
