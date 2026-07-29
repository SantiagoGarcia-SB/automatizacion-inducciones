# Resoluciones Técnicas — Críticos y Warnings

---

## 🔴 C1 + C2: Escritura batch en sincronización (nunca celda por celda)

### Regla de oro del proyecto:

> **NUNCA usar `setValue()` dentro de un loop. Siempre `setValues()` con un array 2D.**

### Patrón correcto para actualizar celdas dispersas en una hoja:

```javascript
// INCORRECTO ❌ (lo que hace el código legacy)
actualizaciones.forEach(upd => {
  hoja.getRange(upd.fila, upd.col).setValue(upd.valor);
});

// CORRECTO ✅ (lo que debe hacer el nuevo código)
function escribirCamposDispersosEnFila(hoja, fila, camposConValor) {
  // camposConValor = { col: valor, col: valor, ... }
  const cols = Object.keys(camposConValor).map(Number);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const rango = hoja.getRange(fila, minCol, 1, maxCol - minCol + 1);
  const fila2D = rango.getValues()[0];

  cols.forEach(col => {
    fila2D[col - minCol] = camposConValor[col];
  });

  rango.setValues([fila2D]);
}
```

### Para múltiples filas con la misma columna (ej: cambiar estado):

```javascript
// INCORRECTO ❌
cambios.forEach(c => hoja.getRange(c.fila, colEstado).setValue(c.valor));

// CORRECTO ✅
// Si las filas son contiguas:
const primerFila = Math.min(...cambios.map(c => c.fila));
const ultimaFila = Math.max(...cambios.map(c => c.fila));
const rango = hoja.getRange(primerFila, colEstado, ultimaFila - primerFila + 1, 1);
const valores = rango.getValues();
cambios.forEach(c => {
  valores[c.fila - primerFila][0] = c.valor;
});
rango.setValues(valores);
```

**Aplicar a**: Todo el nuevo backend. El código legacy no se toca hasta la migración.

---

## 🔴 C3: Especificación completa de COLA_ANALISIS

### Estructura de la pestaña:

```
| UUID_SISTEMA | ID_LOTE | ARRENDATARIO | POLIZA | CIUDAD | DESTINO | FECHA_LOTE | FILA_REG_ANALISIS | ESTADO | ASIGNADA_A | FECHA_ASIGNACION |
```

### Columnas:

| # | Columna | Tipo | Descripción |
|---|---|---|---|
| 1 | UUID_SISTEMA | Texto | Identificador único de la solicitud |
| 2 | ID_LOTE | Texto | ID del lote al que pertenece |
| 3 | ARRENDATARIO | Texto | Nombre del arrendatario (para mostrar en cola) |
| 4 | POLIZA | Número | Póliza del lote |
| 5 | CIUDAD | Texto | Ciudad del inmueble |
| 6 | DESTINO | Texto | Destino del inmueble |
| 7 | FECHA_LOTE | Fecha | Fecha de ingreso del lote |
| 8 | FILA_REG_ANALISIS | Número | Número de fila en "registro analisis" (para escritura directa) |
| 9 | ESTADO | Texto | DISPONIBLE / EN_EVALUACION / FINALIZADA |
| 10 | ASIGNADA_A | Texto | Email del analista asignado (vacío si DISPONIBLE) |
| 11 | FECHA_ASIGNACION | Fecha | Cuándo se asignó |

### Quién escribe en esta pestaña:

| Evento | Quién | Qué hace |
|---|---|---|
| Auxiliar marca RADICADO | Backend (al marcar) | Inserta fila con ESTADO=DISPONIBLE |
| Analista pide solicitud | Backend (con lock) | Escribe ASIGNADA_A + FECHA + cambia ESTADO=EN_EVALUACION |
| Analista finaliza | Backend | Cambia ESTADO=FINALIZADA |
| Líder reasigna | Backend | Cambia ASIGNADA_A + ESTADO |
| Líder libera | Backend | Borra ASIGNADA_A + ESTADO=DISPONIBLE |

### Regla de consistencia:

Un trigger diario (7am) valida que:
- Toda fila DISPONIBLE en COLA_ANALISIS tenga su correspondiente fila en "registro analisis"
- Toda fila EN_EVALUACION tenga un email válido en ASIGNADA_A
- Filas FINALIZADA con más de 7 días se pueden archivar (eliminar de la cola)

### ¿Por qué FILA_REG_ANALISIS?

Evita usar TextFinder cada vez que el analista guarda. El número de fila se captura al momento de insertar en la cola (cuando el Auxiliar marca RADICADO) porque en ese momento el Auxiliar ya sabe en qué fila de "registro analisis" está la solicitud.

**Regla crítica**: NUNCA insertar filas en medio de "registro analisis". Siempre appendar al final. Así los números de fila no se invalidan.

---

## 🔴 C4 + C5: Lectura rápida de la fila del analista (sin TextFinder)

### Problema resuelto:

El analista no busca su fila — ya la tiene guardada en COLA_ANALISIS.FILA_REG_ANALISIS.

### Flujo al abrir una solicitud para evaluar:

```javascript
function api_obtenerSolicitudParaEvaluar(uuid) {
  // 1. Leer COLA_ANALISIS (cache, instantáneo)
  const cola = obtenerColaCacheada();
  const item = cola.find(c => c.uuid === uuid);
  if (!item) throw new Error('Solicitud no encontrada');

  // 2. Verificar que está asignada al analista logueado
  const email = Session.getActiveUser().getEmail();
  if (item.asignadaA !== email) throw new Error('No tienes acceso');

  // 3. Leer la fila directamente por número (SIN TextFinder)
  const fila = item.filaRegAnalisis; // ← ya lo sabemos
  const hoja = SpreadsheetApp.openById(ID_ANALISIS).getSheetByName('registro analisis');

  // 4. Leer SOLO las columnas necesarias (no las ~100)
  const headers = obtenerHeadersCacheados(); // cache 5 min
  const colsNecesarias = obtenerColumnasLecturaSolicitud(headers);
  // colsNecesarias = índices de: datos inmueble + participantes (solo lectura)

  const minCol = Math.min(...colsNecesarias);
  const maxCol = Math.max(...colsNecesarias);
  const datos = hoja.getRange(fila, minCol, 1, maxCol - minCol + 1).getValues()[0];

  // 5. Mapear a objeto nombrado
  return mapearFilaAObjeto(datos, headers, colsNecesarias, minCol);
}
```

### Cache de headers (se lee UNA vez cada 5 min):

```javascript
function obtenerHeadersCacheados() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('HEADERS_REG_ANALISIS');
  if (cached) return JSON.parse(cached);

  const hoja = SpreadsheetApp.openById(ID_ANALISIS).getSheetByName('registro analisis');
  const headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  cache.put('HEADERS_REG_ANALISIS', JSON.stringify(headers), 300); // 5 min
  return headers;
}
```

### Tiempo estimado de esta operación:
- Cache hit (cola + headers): ~100ms
- Lectura de 1 fila × ~30 columnas: ~300-500ms
- **Total: <1 segundo** (vs 3-8 segundos con TextFinder en hoja completa)

---

## 🔴 C6: AuthService lee de pestaña USUARIOS (5 roles)

### Implementación correcta:

```javascript
function obtenerUsuarioActual() {
  const email = Session.getActiveUser().getEmail().toLowerCase();
  const usuario = obtenerUsuarioCacheado(email);

  if (!usuario || !usuario.activo) {
    return { autorizado: false, email: email };
  }

  return {
    autorizado: true,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,        // COMERCIAL | AUXILIAR | ANALISTA | LIDER | ADMIN
    cupo: usuario.cupo || 0, // solo para ANALISTA
    director: usuario.director || '',
    backup: usuario.backup || ''
  };
}

function obtenerUsuarioCacheado(email) {
  const cache = CacheService.getScriptCache();
  const key = 'USUARIO_' + email;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  // Cache miss → leer toda la pestaña USUARIOS (pequeña, ~50 filas max)
  const usuarios = leerPestanaUsuarios(); // getValues() batch
  const usuario = usuarios.find(u => u.email.toLowerCase() === email);

  if (usuario) {
    cache.put(key, JSON.stringify(usuario), 120); // 2 min TTL
  }
  return usuario || null;
}

function leerPestanaUsuarios() {
  const hoja = SpreadsheetApp.openById(ID_HOJA_CONTROL).getSheetByName('USUARIOS');
  const datos = hoja.getDataRange().getValues();
  const headers = datos[0];

  return datos.slice(1).map(fila => ({
    email: String(fila[0] || '').toLowerCase().trim(),
    nombre: String(fila[1] || '').trim(),
    rol: String(fila[2] || '').toUpperCase().trim(),
    cupo: Number(fila[3]) || 0,
    director: String(fila[4] || '').trim(),
    backup: String(fila[5] || '').trim(),
    backupActivo: fila[6] === true,
    activo: fila[7] !== false // default true
  }));
}
```

### Verificación de permisos en cada función de la API:

```javascript
function verificarRol(rolesPermitidos) {
  const usuario = obtenerUsuarioActual();
  if (!usuario.autorizado) throw new Error('NO_AUTORIZADO');
  if (!rolesPermitidos.includes(usuario.rol)) throw new Error('SIN_PERMISOS');
  return usuario;
}

// Uso en cada función:
function api_pedirSolicitud() {
  const usuario = verificarRol(['ANALISTA']);
  // ... lógica
}

function api_marcarRadicado(uuid) {
  const usuario = verificarRol(['AUXILIAR', 'LIDER', 'ADMIN']);
  // ... lógica
}
```

---

## 🟡 W1: Cache TTL para COLA_ANALISIS → 15 segundos + invalidación

### Estrategia de cache:

| Dato | TTL | Razón |
|---|---|---|
| COLA_ANALISIS (JSON) | 15 segundos | Dato volátil (analistas piden solicitudes frecuentemente) |
| USUARIOS | 120 segundos | Cambia poco (solo cuando admin edita) |
| Headers de hojas | 300 segundos | Casi nunca cambian |

### Invalidación explícita al escribir:

```javascript
function invalidarCacheCola() {
  CacheService.getScriptCache().remove('COLA_ANALISIS_JSON');
}

// Se llama DESPUÉS de:
// - api_pedirSolicitud() → invalidar
// - api_finalizarEvaluacion() → invalidar
// - Auxiliar marca RADICADO (inserta en cola) → invalidar
// - Líder reasigna/libera → invalidar
```

---

## 🟡 W2: Paginación sin leer toda la hoja

### Estrategia para listado de lotes:

En vez de `getDataRange().getValues()` (lee todo), usar **lectura inversa** (los más recientes primero):

```javascript
function obtenerLotesPaginados(pagina, porPagina, filtros) {
  const hoja = SpreadsheetApp.openById(ID_HOJA_CONTROL).getSheetByName('Control_General');
  const totalFilas = hoja.getLastRow() - 1; // menos header
  const totalPaginas = Math.ceil(totalFilas / porPagina);

  // Leer de atrás hacia adelante (más recientes primero)
  const filaInicio = Math.max(2, totalFilas + 2 - (pagina * porPagina));
  const filasALeer = Math.min(porPagina, totalFilas - ((pagina - 1) * porPagina));

  // Leer SOLO las columnas necesarias para el listado (~10 columnas)
  const colsListado = [1, 3, 10, 11, 16, 17, 24]; // ID, fecha, estado, comercial, póliza...
  const maxCol = Math.max(...colsListado);
  const datos = hoja.getRange(filaInicio, 1, filasALeer, maxCol).getValues();

  // Filtrar y mapear en memoria
  const resultados = datos
    .filter(fila => aplicarFiltros(fila, filtros, colsListado))
    .map(fila => mapearFilaALote(fila));

  return { datos: resultados, pagina, totalPaginas, total: totalFilas };
}
```

**Para búsquedas con filtro de texto** (buscar por ID o póliza): usar TextFinder (es rápido para eso) y luego leer solo las filas encontradas.

---

## 🟡 W3: Proteger fórmulas — escribir SOLO columnas editables

### Array de columnas editables del analista:

```javascript
// Se define UNA vez y se usa en toda la app
const CAMPOS_EDITABLES_ANALISTA = {
  inquilino: ['Ingresos', 'Acierta', 'ocupacion', 'Respuesta modelo inquilino', 'Regla Dura Inquilino'],
  coa: (n) => [`Ingresos COA${n}`, `Acierta COA${n}`, `Ocupacion COA${n}`, `Respuesta modelo COA${n}`, `Regla Dura COA${n}`],
  general: ['comentarios del analista']
};

// Al finalizar se agregan:
const CAMPOS_AUTO_FINALIZAR = ['REGISTRO ANALISTA SAI', 'Fecha Evaluacion'];
```

### Escritura segura (nunca pisar fórmulas):

```javascript
function guardarEvaluacion(filaDestino, datosEvaluacion) {
  const hoja = SpreadsheetApp.openById(ID_ANALISIS).getSheetByName('registro analisis');
  const headers = obtenerHeadersCacheados();

  // Escribir SOLO los campos que el analista puede editar
  const camposPermitidos = [
    ...CAMPOS_EDITABLES_ANALISTA.inquilino,
    ...CAMPOS_EDITABLES_ANALISTA.general,
    // + codeudores que existan
  ];

  // Para cada campo editado, escribir en su columna exacta
  Object.entries(datosEvaluacion).forEach(([campo, valor]) => {
    if (!camposPermitidos.includes(campo)) return; // IGNORA campos no permitidos
    const col = headers.indexOf(campo) + 1;
    if (col > 0) {
      hoja.getRange(filaDestino, col).setValue(valor);
    }
  });
}
```

**¿Por qué `setValue` individual aquí?** Porque los campos editables NO son contiguos (están dispersos entre columnas de fórmulas). Escribir un rango contiguo pisaría las fórmulas. Para ~11 campos (5 inq + 5 COA1 + 1 comentarios) son ~11 escrituras — aceptable porque es una sola ejecución por analista, no un loop masivo.

**Optimización alternativa** (si se detecta lentitud): agrupar las escrituras por bloques contiguos de columnas editables.

---

## 🟡 W4: Especificación de Errores_Terceros

### Estructura de la pestaña:

```
| UUID_SISTEMA | CICLO | PARTICIPANTE | REQUERIMIENTOS | NOTA_INTERNA | AUXILIAR_EMAIL | FECHA_ERROR | RESPUESTA_COMERCIAL | ARCHIVOS_DRIVE_PATH | FECHA_RESPUESTA | ESTADO_ERROR |
```

### Columnas:

| # | Columna | Tipo | Descripción |
|---|---|---|---|
| 1 | UUID_SISTEMA | Texto | FK a Control_General / registro analisis |
| 2 | CICLO | Número | 1, 2, 3... (incrementa si se pide más info) |
| 3 | PARTICIPANTE | Texto | INQ / COA1 / COA2 / COA3 / COA4 / COA5 |
| 4 | REQUERIMIENTOS | Texto | Lista separada por `|` (ej: `celular_correo|doc_identidad`) |
| 5 | NOTA_INTERNA | Texto | Solo visible para equipo interno |
| 6 | AUXILIAR_EMAIL | Texto | Quién registró el error |
| 7 | FECHA_ERROR | Fecha | Cuándo se registró |
| 8 | RESPUESTA_COMERCIAL | Texto | Lo que escribió el comercial |
| 9 | ARCHIVOS_DRIVE_PATH | Texto | Ruta en Drive (separada por `|` si son varios) |
| 10 | FECHA_RESPUESTA | Fecha | Cuándo respondió el comercial |
| 11 | ESTADO_ERROR | Texto | PENDIENTE / CORRECCION_RECIBIDA / RESUELTO |

### Ejemplo:

```
| 28/7-1985-1030_001 | 1 | INQ  | celular_correo           | SAI dice cel inválido | kharen@ | 28/7 | "Cel correcto: 320..." | | 30/7 | RESUELTO |
| 28/7-1985-1030_001 | 1 | COA1 | doc_identidad|cert_exist | NIT no coincide       | kharen@ | 28/7 | "Adjunto cédula"       | /correcciones/001/COA1/cedula.pdf | 30/7 | RESUELTO |
```

### Un contrato puede tener múltiples filas:
- 1 fila por participante con error × 1 fila por ciclo de corrección
- Si un segundo ciclo pide más info: CICLO = 2 con nuevas filas

---

## 🟡 W5: Template HTML — split por rol

### Decisión: NO dividir en múltiples templates

Dividir complica el mantenimiento (componentes compartidos, tokens, router). En su lugar:

### Optimización del template único:

1. **Minimizar CSS/JS** antes del deploy (quitar comentarios, whitespace)
2. **Lazy-render de vistas pesadas**: las vistas que no se ven al inicio se inyectan como strings HTML ocultos (`display:none`) y se activan al navegar
3. **Pre-cargar datos iniciales** en el template (ver S3):

```javascript
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('index');

  // Inyectar datos iniciales (elimina la primera llamada google.script.run)
  const usuario = obtenerUsuarioActual();
  template.datosIniciales = JSON.stringify({
    usuario: usuario,
    timestamp: new Date().getTime()
  });

  return template.evaluate()
    .setTitle('Inducciones | El Libertador')
    .setFaviconUrl('https://www.ellibertador.co/favicon.ico')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
```

```html
<!-- En index.html -->
<script>
  const __INIT__ = <?!= datosIniciales ?>;
  // El frontend ya sabe quién es el usuario sin hacer una llamada extra
</script>
```

**Resultado**: La app abre y muestra el menú correcto instantáneamente (sin spinner de "cargando usuario").

---

## 🟡 W6: Retry con backoff en el api-client

### Implementación:

```javascript
// scripts/api-client.html
async function callServer(fn, ...args) {
  const MAX_RETRIES = 2;
  const BASE_DELAY = 1500; // ms

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          [fn](...args);
      });
    } catch (error) {
      const msg = String(error.message || error || '');
      const esTransitorio = msg.includes('Service') || msg.includes('Timeout')
        || msg.includes('unavailable') || msg.includes('DEADLINE');

      if (attempt === MAX_RETRIES || !esTransitorio) {
        throw error; // Error real → mostrar al usuario
      }

      // Esperar con backoff exponencial antes de reintentar
      await new Promise(r => setTimeout(r, BASE_DELAY * Math.pow(2, attempt)));
    }
  }
}
```

### Spinner automático:

```javascript
let _requestsActivos = 0;

async function callServerConSpinner(fn, ...args) {
  _requestsActivos++;
  if (_requestsActivos === 1) mostrarSpinner();

  try {
    return await callServer(fn, ...args);
  } finally {
    _requestsActivos--;
    if (_requestsActivos === 0) ocultarSpinner();
  }
}
```

---

## 🟡 W7: Mapeo por headers (nunca por índice) — regla del proyecto

### Regla:

> Todo el nuevo código lee headers dinámicamente. NUNCA usar números de columna hardcodeados (ej: `getRange(fila, 61)`).

### Patrón estándar para todo el proyecto:

```javascript
function obtenerIndiceColumna(headers, nombreColumna) {
  const idx = headers.indexOf(nombreColumna);
  if (idx === -1) throw new Error(`Columna "${nombreColumna}" no encontrada en headers`);
  return idx + 1; // getRange usa 1-based
}
```

**Excepción**: El código legacy sigue usando índices fijos. No se modifica durante la convivencia.

---

## 🟡 W8: Lock de radicación vs triggers (documentar interacción)

### Situación:

- `motorDeAuditoria` usa `getScriptLock().tryLock(60000)` → puede bloquear hasta 60s
- `sincronizarLoteAutomatico` usa `getScriptLock().tryLock(30000)` → espera 30s
- Si coinciden → el trigger pierde y se reintenta en 10 min

### Decisión: ACEPTABLE — solo documentar

No se cambia porque:
- La radicación tarda 10-30s reales (no 60s)
- El sync corre cada 10 min — perder uno no importa
- El script lock es global, no se puede tener locks separados en GAS

### Mitigación: En el nuevo código, usar locks más cortos:

```javascript
// Nuevo RadicacionService: lock solo durante la escritura, no durante toda la validación
function radicarLote(formData) {
  // Validación SIN lock (puede tardar 10-20s por IA)
  const resultado = validarYPrepararDatos(formData);
  if (resultado.errores.length > 0) return { status: 'ERROR', detalles: resultado.errores };

  // Lock SOLO para la escritura (2-3 segundos)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Intenta de nuevo en unos segundos.');
  try {
    escribirEnSheets(resultado.filas);
    escribirLog(resultado.log);
  } finally {
    lock.releaseLock();
  }

  // Notificación SIN lock (best-effort)
  enviarCorreoConfirmacion(formData, resultado.idLote);
  return { status: 'OK', idLote: resultado.idLote };
}
```

**Lock de 60s → Lock de ~3s.** Los triggers casi nunca colisionarán.

---

## 💡 Sugerencias incorporadas al diseño

### S1: CORREOS_LIDERES → pestaña USUARIOS (resuelto con C6)

Ya no se usa array hardcodeado. Todo viene de la pestaña USUARIOS con cache.

### S2: Auto-save a localStorage para el formulario del analista

```javascript
// Cada 30 segundos mientras el analista llena el formulario:
setInterval(() => {
  const datos = recolectarCamposFormulario();
  localStorage.setItem('borrador_eval_' + uuid, JSON.stringify({
    datos: datos,
    timestamp: Date.now()
  }));
  mostrarIndicador('Borrador guardado');
}, 30000);

// Al abrir el formulario:
const borrador = localStorage.getItem('borrador_eval_' + uuid);
if (borrador) {
  const { datos, timestamp } = JSON.parse(borrador);
  const minutos = Math.round((Date.now() - timestamp) / 60000);
  if (minutos < 60) { // borrador de menos de 1 hora
    confirmar(`Tienes un borrador de hace ${minutos} min. ¿Restaurar?`)
      .then(() => rellenarFormulario(datos));
  }
}
```

### S3: Pre-cargar datos en doGet() (resuelto con W5)

El usuario del analista se inyecta en el template. Carga instantánea del menú correcto.

### S4: Vista del líder — paginada con resumen + exportar completo

El líder ve ~15 columnas en pantalla. Para ver los ~100 campos:
- Click en solicitud → detalle completo (lee 1 fila de registro analisis)
- Botón "Exportar completo" → genera xlsx en Drive y retorna URL de descarga

### S6: Buffer de logs

```javascript
// Al final de cada ejecución de trigger o API:
function ejecutarConLogs(fn) {
  try {
    return fn();
  } finally {
    flushLogs(); // Escribe todos los logs acumulados en un solo setValues()
  }
}
```

### S7: Indicador de "datos actualizados hace X"

```javascript
// En el footer de cada vista:
<span class="data-freshness">Datos actualizados hace <span id="freshness">0</span> min</span>
// Se actualiza con un timer JS local
```

---

## Resumen de decisiones técnicas finales

| Decisión | Valor |
|---|---|
| Escritura en loops | PROHIBIDA. Siempre batch setValues() |
| Cache TTL para cola | 15 segundos + invalidación al escribir |
| Cache TTL para usuarios | 120 segundos |
| Cache TTL para headers | 300 segundos |
| Lock: cuándo se usa | SOLO al asignar solicitudes y al escribir datos de radicación |
| Lock: cuánto dura | Máximo 15 segundos (lock corto) |
| Lock: evaluación del analista | NO se usa (fila exclusiva) |
| TextFinder | SOLO para búsquedas por ID/UUID cuando no se tiene el número de fila |
| Número de fila | Se almacena en COLA_ANALISIS al insertar (evita búsquedas) |
| Columnas | Siempre por nombre (header mapping), nunca por índice fijo |
| Fórmulas | NUNCA pisar. Escribir solo columnas editables explícitas |
| Template HTML | Uno solo, con datos iniciales inyectados en server-side |
| Retry en cliente | 2 reintentos con backoff para errores transitorios |
| Auto-save | localStorage cada 30s en formularios largos |
| Logs | Buffer en memoria, flush al final de la ejecución |
| Paginación | Lectura por rango acotado, no toda la hoja |
| Vista del líder | Resumen paginado (~15 cols) + exportar para detalle completo |
| Roles | Se leen de pestaña USUARIOS, nunca hardcodeados |
| Lock de radicación | Solo durante la escritura (3s), no durante la validación/IA (20s) |
