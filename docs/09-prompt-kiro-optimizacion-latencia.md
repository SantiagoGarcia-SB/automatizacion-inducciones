# Prompt para Kiro — Optimización de latencia de vistas (Web App v2)

> Este documento es un prompt listo para pegar en Kiro. Está basado en `docs/08-auditoria-rendimiento-vistas.md` (auditoría de rendimiento del 2026-07-31). No repitas el diagnóstico: ejecútalo.

---

## PROMPT (copiar desde aquí)

Eres un desarrollador senior de Google Apps Script trabajando sobre un proyecto en producción real (operación de inducciones de crédito, El Libertador). El proyecto está en migración activa de un flujo 100% manual en Sheets hacia una Web App (`?v=2`), y ambas arquitecturas conviven hoy. Tu tarea es aplicar una serie de optimizaciones de latencia **ya diagnosticadas y priorizadas** en `docs/08-auditoria-rendimiento-vistas.md`. No hagas tu propio diagnóstico ni propongas alcance nuevo — el análisis ya está hecho, tu trabajo es ejecutarlo con disciplina.

### Reglas no negociables (léelas antes de tocar una sola línea)

1. **No existe suite de pruebas automatizadas en este proyecto.** Cada cambio debe ser verificable manualmente y reversible. Si un cambio no se puede verificar manualmente en menos de 2 minutos, divídelo en pasos más pequeños.
2. **No toques el código legacy** (`Codigo.js` fuera de lo explícitamente indicado en la Tarea 4, `Notificaciones.js`, `Sincronizacion.js`, `Reportes.js`, `Cumplimiento.js`, `IADestino.js`, `Index.html`, `Estilos.html`, `Scripts.html`). Está fuera de alcance por decisión ya tomada del proyecto — "no se toca hasta la migración" (`docs/07-resoluciones-tecnicas.md`).
3. **El patrón correcto para cada corrección ya existe en algún otro lugar del mismo repo.** Antes de escribir código nuevo, busca y copia el patrón ya usado (te indico dónde en cada tarea). No inventes una abstracción nueva, no refactorices más allá de lo que la tarea pide, no introduzcas librerías ni dependencias nuevas.
4. **Nunca `setValue()` dentro de un loop, siempre `setValues()` batch. Nunca más de 1 llamada de red por bloque de columnas cuando puedan leerse juntas en un rango.** Esta es la regla de oro documentada en `docs/07-resoluciones-tecnicas.md` — todas las tareas de abajo son variaciones de aplicarla donde falta.
5. **Una tarea = un commit.** No agrupes varias tareas en un solo commit. Cada commit debe poder revertirse solo sin afectar a las demás. Usa mensajes tipo `perf(auxiliar): agregar caché de cliente a cola del auxiliar`.
6. **Antes de dar una tarea por terminada**, corre `git diff` sobre los archivos tocados y confirma que el diff contiene *solo* el cambio descrito — nada de reformateo, renombrados incidentales, ni "mientras estaba aquí aproveché y...".
7. **Si al implementar una tarea descubres que el código actual es distinto de lo que describe esta guía** (números de línea desactualizados, función renombrada, etc.), detente y reporta la discrepancia antes de improvisar una solución — no asumas.
8. Ejecuta las tareas **en el orden dado**. El orden no es arbitrario: las primeras 5 tienen el mayor impacto en el uso diario real y el menor riesgo; las últimas tocan flujos de escritura o requieren más cuidado.

### Alcance de archivos permitidos para esta ronda

- `scripts_app.html`
- `Api.js`
- `Repositorios_ColaAuxiliarRepo.js`
- `Repositorios_AnalistaRepo.js`
- `Repositorios_AnalisisRepo.js`
- `Repositorios_ControlGeneralRepo.js`
- `Codigo.js` — **solo** la función `doGet` y **solo** en la Tarea 4, nada más de ese archivo.

Ningún otro archivo debe modificarse en esta ronda.

---

### Tarea 1 — Caché de cliente en las 4 vistas de mayor uso diario

**Por qué**: auxiliar y analista rebotan todo el día entre el Dashboard y su cola de trabajo; hoy cada vuelta paga un round-trip completo al servidor aunque no haya pasado nada.

**Archivo**: `scripts_app.html`

**Qué hacer**: en estas 4 funciones, agregar el mismo check de caché en memoria que ya usan `cargarVistaUsuarios` (línea ~1905, patrón `if (_usuariosCache) { render; return; }`), `cargarVistaSolicitudes` (línea ~1638) y `cargarMisLotes` (línea ~446):

- `cargarColaAuxiliar` (línea ~618) — variable `_colaAuxiliarCache` ya existe, falta el check al inicio de la función.
- `_cargarVistaAnalista` (línea ~1033)
- `cargarVistaAsignaciones` (línea ~1305)
- `cargarVistaErroresComercial` (línea ~1375)

**Patrón exacto a replicar** (adaptar nombre de variable de caché por vista):
```javascript
function cargarColaAuxiliar() {
  if (_colaAuxiliarCache) { _renderizarColaAuxiliar(); return; }
  // ... resto de la función igual (skeleton + callServer), sin tocar nada más
}
```

**Importante**: confirma que cada una de estas 4 vistas ya invalida su caché (`_xCache = null`) después de cualquier acción que cambie los datos (radicar, tomar solicitud, liberar, corregir, etc.) — si esa invalidación no existe todavía en algún caso, agrégala como parte de esta misma tarea (si no, el usuario vería datos obsoletos tras actuar).

**Cómo verificar sin romper nada**: entra como auxiliar, carga la Cola, sal a Dashboard, vuelve a Cola → debe pintar instantáneo (sin spinner de red). Toma una solicitud → vuelve a Cola → debe reflejar el cambio (prueba de que la invalidación sigue funcionando). Repite para analista (Mis solicitudes), líder (Asignaciones) y comercial (Errores/Pendientes).

---

### Tarea 2 — Helper único de headers cacheados en `AnalistaRepo.js`

**Por qué**: `Repositorios_AnalisisRepo.js:108-119` ya cachea los headers de "registro analisis" (TTL 300s), pero `Repositorios_AnalistaRepo.js` relee los mismos headers de la misma hoja sin caché en 4 sitios (líneas ~21, ~178, ~236, ~285) — la vista que el analista usa todo el día ("Mis solicitudes") paga esa relectura en cada carga.

**Archivo**: `Repositorios_AnalistaRepo.js`

**Qué hacer**: extraer un helper y usarlo en los 4 sitios, reutilizando la **misma clave de caché** que ya usa `AnalisisRepo.js` (para no duplicar la caché de la misma hoja bajo dos claves distintas):

```javascript
function _headersRegistroAnalisis(hoja) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('HDR_REG_ANALISIS');
  if (cached) return JSON.parse(cached);
  var headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(String);
  cache.put('HDR_REG_ANALISIS', JSON.stringify(headers), 300);
  return headers;
}
```

Verifica primero el nombre exacto de la clave de caché usada en `Repositorios_AnalisisRepo.js:108-119` y reutilízala literal (no inventes una nueva) para que ambos archivos compartan el mismo caché de headers.

**Cómo verificar sin romper nada**: como analista, abre "Mis solicitudes" dos veces seguidas — la segunda debe ser más rápida. Confirma que los nombres de columna en pantalla siguen siendo correctos (headers bien mapeados) para al menos una solicitud de cada tipo (con y sin codeudores).

---

### Tarea 3 — Eliminar TextFinder+6×getValue por UUID en "Pendientes" del comercial

**Por qué**: es la vista más lenta de toda la app. `obtenerErroresPendientesComercial` (`Repositorios_ColaAuxiliarRepo.js:362-462`) hace, por cada UUID con error pendiente, 1 `TextFinder` + hasta 6 `getRange().getValue()` individuales sobre `Control_General`. Con 20 errores son ~140 llamadas de red en una sola carga.

**Archivo**: `Repositorios_ColaAuxiliarRepo.js`

**Qué hacer**: reemplazar el bucle de TextFinder+getValue por 1-2 lecturas de rango de `Control_General` (cubriendo únicamente las columnas realmente usadas en esas líneas 425-445, no las 62 completas si no todas se necesitan) y armar un índice en memoria por UUID antes del loop:

```javascript
// Antes del loop de errores pendientes: leer 1 vez y armar índice
var datosControl = hojaControl.getRange(2, 1, hojaControl.getLastRow() - 1, 62).getValues();
var indicePorUuid = {};
datosControl.forEach(function(fila) { indicePorUuid[fila[/* col UUID, 0-based */]] = fila; });

// Dentro del loop de errores pendientes, en vez de TextFinder + 6 getValue():
var filaControl = indicePorUuid[uuid];
// leer los 6 campos necesarios directamente de filaControl[colIndex] en memoria
```

Usa el índice de columna real de UUID en `Control_General` tal como está definido/mapeado hoy en el archivo (no lo hardcodees a ciegas — confírmalo contra el mapeo de headers que ya usa el resto del repositorio).

**Cómo verificar sin romper nada**: como comercial con al menos 2-3 errores pendientes reales (o de prueba) en distintos lotes, abre "Pendientes" y confirma que cada error muestra exactamente los mismos 6 campos que mostraba antes del cambio, para el mismo lote/UUID. Compara con una captura de pantalla de antes si es posible.

---

### Tarea 4 — `doGet` no debe bloquear el HTML en cache-miss del resumen

**Por qué**: hoy, si el caché de 60s del resumen del dashboard expiró, `doGet` (`Codigo.js:44-78`, línea ~62: `datosIniciales.resumen = obtenerResumenComercial(...)`) ejecuta la lectura de Sheets de forma síncrona **antes de devolver el HTML** — el usuario ve pantalla en blanco (ni el DOM cargó) mientras tanto, a diferencia de cualquier otra vista de la app.

**Archivo**: `Codigo.js` — **solo** dentro de `doGet`, sin tocar el resto del archivo ni la bifurcación legacy/nuevo que ya existe ahí.

**Qué hacer** (opción intermedia, la recomendada en la auditoría — más segura que eliminar el precálculo por completo):
- Mantener el intento de leer el resumen **solo si ya está en `CacheService`** (lectura de caché, no de Sheets — es barata y no bloquea).
- Si hay cache-miss, `datosIniciales.resumen` debe quedar en `null`, y dejar que `inicializarApp()` en el cliente (que ya sabe manejar el caso sin datos precargados) pida el resumen vía `google.script.run` con su skeleton normal.
- No cambies la lógica de bifurcación `?v=2` ni ningún otro dato que `doGet` ya inyecta (usuario, timestamp, etc.) — solo el tratamiento de `resumen`.

**Cómo verificar sin romper nada**: fuerza un cache-miss (espera >60s sin actividad, o limpia el caché de script desde el editor de Apps Script) y confirma que la app muestra el layout/skeleton casi instantáneo en vez de pantalla en blanco, y que el dashboard igual termina de pintar los datos correctos poco después. Luego repite con cache-hit (recarga rápida) y confirma que el dashboard sigue pintando sin round-trip visible, igual que antes del cambio.

---

### Tarea 5 — Consolidar lecturas de columna separadas en 1 lectura de rango (3 sitios)

**Por qué**: mismo antipatrón que la auditoría previa ya corrigió en `AnalistaRepo.js:57-64` (8 `getValue()` → 1 lectura de fila), pero sigue vivo en otros tres sitios. El costo en Sheets es por llamada de red, no por volumen de datos.

**Archivos y funciones**:
- `Repositorios_ColaAuxiliarRepo.js:25-33` (`obtenerColaAuxiliar`) — 9 llamadas de columna separadas.
- `Repositorios_AnalistaRepo.js:252-256` (`obtenerAsignacionesActivas`) — 5 llamadas de columna separadas.
- `Repositorios_AnalisisRepo.js:51-54` (`obtenerSolicitudesResumen`) — hasta 10 llamadas de columna separadas.

**Patrón exacto** (usar `obtenerDetalleSolicitud` en `AnalisisRepo.js:103-233` como referencia de "el mejor patrón del repo"):
```javascript
// INCORRECTO ❌ (lo que hacen hoy)
var colA = hoja.getRange(2, 10, filas, 1).getValues();
var colB = hoja.getRange(2, 1, filas, 1).getValues();
// ... N más

// CORRECTO ✅
var bloque = hoja.getRange(2, 1, filas, /* ancho mínimo que cubra todas las columnas necesarias */).getValues();
// acceder por bloque[i][colIndex - 1] en el mapeo existente
```

Hazlo **una función a la vez, en un commit por función** (3 commits), no las 3 juntas — son 3 hallazgos independientes y cada una debe poder verificarse por separado.

**Cómo verificar sin romper nada, por cada función**: compara los datos mostrados en la vista correspondiente (Cola del auxiliar / Asignaciones / Solicitudes) antes y después del cambio para el mismo conjunto de filas — deben ser idénticos campo por campo.

---

### Checkpoint obligatorio tras las Tareas 1-5

Antes de continuar con las tareas 6-11, detente y confirma explícitamente:
- Los 5+ commits de las tareas anteriores existen por separado y cada `git diff` es mínimo y quirúrgico.
- Se probó manualmente cada uno de los 4 roles (comercial, auxiliar, analista, líder/admin) al menos una vez después de todos los cambios de esta tanda, navegando por las vistas afectadas, sin errores en consola del navegador ni en `Logs_Sistema`.
- Nada del código legacy fue tocado.

Si algo de esto no se cumple, no avances — corrige antes de seguir.

---

### Tarea 6 — Techo de 90 KB en el caché de "Todos los lotes"

**Archivo**: `Api.js:104-107`. Hoy: `if (json.length < 90000) cache.put(...)`. El caso de mayor volumen (líder/admin viendo todos los lotes) es el que más probablemente supera 90 KB, y justo ahí nunca se cachea.

**Qué hacer**: subir el límite aprovechando que `CacheService` soporta hasta 100 KB por clave, o fragmentar el JSON en 2 claves de caché si el dataset lo requiere. Elegir la opción más simple que resuelva el caso real (no sobre-diseñar un sistema de fragmentación genérico si con subir el límite a ~99000 alcanza).

**Cómo verificar**: como líder/admin, carga "Lotes" dos veces seguidas con el dataset completo actual — la segunda debe ser notablemente más rápida (cache hit). Si el dataset real no llega a 90 KB, prueba con datos de test o documenta que no se pudo verificar en caliente con el volumen actual.

---

### Tarea 7 — 3 `setValue()` → 1 `setValues()` en `pedirSolicitudAnalista`

**Archivo**: `Repositorios_AnalistaRepo.js:129-131`. Hoy 3 `setValue()` consecutivos sobre la misma fila (`ESTADO`, `ASIGNADA_A`, `FECHA_ASIGNACION`) — la regla de oro de `docs/07` (C1+C2) prohíbe esto explícitamente, y es una acción donde el usuario ya está esperando con el botón en "⏳ Asignando...".

**Patrón**:
```javascript
hojaCola.getRange(filaDisponible, 9, 1, 3).setValues([['EN_EVALUACION', emailAnalista, new Date()]]);
```
Confirma que las columnas 9, 10, 11 corresponden exactamente a `ESTADO`, `ASIGNADA_A`, `FECHA_ASIGNACION` en el esquema real de `COLA_ANALISIS` antes de aplicar el rango — si el orden real difiere, ajusta el rango o usa 2 rangos contiguos en vez de forzar contigüidad que no existe.

**Cómo verificar**: como analista, pide una solicitud y confirma en `COLA_ANALISIS` (vista de hoja, no de la app) que las 3 columnas quedaron escritas correctamente, con lock activo durante la operación como ya hace la función hoy.

---

### Tarea 8 — Actualización optimista tras acciones (en vez de invalidar + refetch completo)

**Por qué**: `_marcarRadicadoAuxiliar`, `_guardarUsuario`, `_guardarMotivo`/`_eliminarMotivo`, `_liberarSolicitud`, `_enviarCorreccion` (ver ubicaciones exactas en `docs/08` sección M3) invalidan la caché local y vuelven a pedir la lista completa tras cada acción exitosa, en vez de actualizar el ítem en memoria.

**Qué hacer**: para cada handler, en vez de `_xCache = null; cargarVistaX();`, mutar `_xCache` directamente (agregar/quitar/actualizar el ítem afectado) y volver a renderizar desde memoria:

```javascript
// En vez de: _colaAuxiliarCache = null; cargarColaAuxiliar();
_colaAuxiliarCache = _colaAuxiliarCache.filter(function(s) { return s.uuid !== uuid; });
_renderizarColaAuxiliar();
```

**Esta tarea toca varios handlers — un commit por handler**, no todos juntos. Si algún handler tiene lógica de negocio más compleja que un simple filter/update (por ejemplo, la acción puede fallar parcialmente o afectar más de un ítem), no fuerces el patrón ahí: repórtalo y sáltalo, dejando el invalidar+refetch como está en ese caso puntual.

**Cómo verificar, por cada handler**: ejecuta la acción real y confirma que la UI se actualiza igual de correcto que antes (mismo resultado final), y que ya no aparece un segundo spinner/round-trip justo después de la acción.

---

### Tarea 9 — Conectar `FILA_REG_ANALISIS` end-to-end para eliminar el TextFinder que sobrevive en "Mis solicitudes"

**Por qué**: `docs/07-resoluciones-tecnicas.md` (C4/C5) documenta este patrón como diseño ideal, y el campo `FILA_REG_ANALISIS` ya existe en el esquema de `COLA_ANALISIS` (`Repositorios_ColaAuxiliarRepo.js:248`, hoy con placeholder/comentario "se llenará en sync"), pero nunca se completa ni se usa. `obtenerSolicitudesAnalista` (`AnalistaRepo.js:44-46`) sigue haciendo `createTextFinder(emailAnalista).findAll()` sobre "registro analisis" en cada carga.

**Esta es la tarea de mayor riesgo de esta ronda porque toca el flujo de sincronización/escritura, no solo lectura.** Antes de tocar nada:
1. Localiza exactamente dónde debería completarse `FILA_REG_ANALISIS` (al crear la fila en "registro analisis" — probablemente en el flujo de `marcarSolicitudRadicada` o en la sincronización que mueve la solicitud de `Control_General` a `registro analisis`).
2. Confirma que **no estás tocando `Sincronizacion.js`** (está fuera de alcance, es legacy) — si completar este campo requiere modificar ese archivo, detente y repórtalo como bloqueante en vez de improvisar tocar un archivo fuera de alcance.
3. Si el número de fila se puede capturar en el momento correcto sin tocar código fuera de alcance (por ejemplo, porque el propio flujo de `Repositorios_ColaAuxiliarRepo.js`/`AnalistaRepo.js` ya conoce la fila en el momento de escribir en `COLA_ANALISIS`), complétalo ahí.
4. Solo después de que `FILA_REG_ANALISIS` se esté llenando de forma confiable, cambia `obtenerSolicitudesAnalista` para leer `COLA_ANALISIS` (pestaña pequeña) en vez de TextFinder sobre "registro analisis".

**Cómo verificar**: como analista, pide y evalúa varias solicitudes de punta a punta, confirmando en la hoja real que `FILA_REG_ANALISIS` queda correctamente poblado y que "Mis solicitudes" sigue mostrando exactamente las solicitudes asignadas al analista logueado, ni una de más ni de menos.

---

### Tarea 10 — Ventana real de lectura para Cola del auxiliar y Lotes (NO ejecutar sin autorización explícita)

**Por qué**: `Repositorios_ColaAuxiliarRepo.js:20-33` y `Repositorios_ControlGeneralRepo.js:120-122` leen siempre todas las filas de `Control_General`, sin ventana, a diferencia de "Solicitudes" que sí pagina en servidor.

**Esta tarea requiere una decisión de arquitectura** (qué estrategia de ventaneo usar: por fecha, por estado, por índice de filas) que no está resuelta en la auditoría ni en `docs/07`. **No la ejecutes de forma autónoma.** Preséntale al equipo 2-3 opciones concretas con sus trade-offs y espera decisión antes de escribir código. Con el volumen actual de datos esto no es el cuello de botella dominante — es una mejora de escalabilidad a mediano plazo, no una emergencia de esta ronda.

---

### Tarea 11 — Unificar loading states y decidir sobre `callServerConSpinner`

**Por qué**: inconsistencia menor entre vistas con skeleton fiel al layout final vs. spinner genérico (`_verDetalleLote`, `_abrirEvaluacion`), y `callServerConSpinner` (`scripts_apiClient.html:57-73`) está definido pero nunca usado.

**Qué hacer**: esta es la de menor impacto y la más subjetiva (UI). Antes de tocar código, decide con el equipo si:
(a) se adopta `callServerConSpinner` de forma consistente en las vistas que hoy no tienen ningún loading state, o
(b) se elimina por no usarse y se deja cada vista con su propio manejo manual (como está hoy en la mayoría).
No inviertas tiempo en esto hasta que las tareas 1-9 estén cerradas y verificadas — es la última prioridad del plan.

---

## Resumen de orden de ejecución

1. Tarea 1 (caché cliente × 4 vistas)
2. Tarea 2 (headers cacheados en AnalistaRepo)
3. Tarea 3 (Pendientes comercial: eliminar TextFinder×N)
4. Tarea 4 (doGet no bloqueante)
5. Tarea 5 (3 consolidaciones de columnas → rango, un commit c/u)
6. **Checkpoint de verificación manual de los 4 roles**
7. Tarea 6 (techo de caché 90KB)
8. Tarea 7 (3 setValue → 1 setValues en pedirSolicitudAnalista)
9. Tarea 8 (actualización optimista, un commit por handler)
10. Tarea 9 (FILA_REG_ANALISIS end-to-end — la de más riesgo, con puntos de parada explícitos)
11. Tarea 10 — **no ejecutar sin decisión previa del equipo**
12. Tarea 11 — al final, y solo si hay tiempo/interés en pulir UI

No avances a la siguiente tarea si la anterior no pasó su verificación manual. Reporta al final de cada tarea qué se cambió, qué se verificó y cómo, en un mensaje corto — no un resumen extenso ni una nueva ronda de análisis.

---

## FIN DEL PROMPT (hasta aquí para pegar en Kiro)
