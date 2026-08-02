# 08 — Auditoría de rendimiento: carga de vistas (Web App v2)

**Fecha**: 2026-07-31
**Alcance**: Latencia percibida desde que el usuario abre/navega a una vista hasta que ve datos reales, en la Web App nueva (`?v=2`): `Codigo.js` (`doGet`), `Api.js`, `Servicios_AuthService.js`, todos los `Repositorios_*.js`, `IndexNuevo.html`, `scripts_apiClient.html`, `scripts_app.html`.
**No incluido**: seguridad, calidad de código, legacy (`Index.html`/`Scripts.html`), sincronización en background (`Sincronizacion.js`) salvo donde afecta directamente la latencia de una vista. Eso ya está cubierto en `docs/auditoria-tecnica-20260729.md`.

Punto de partida (no se re-deriva, se usa como base): la auditoría del 29/07 ya señaló `Repositorios_AnalistaRepo.js:57-64` (8 `getValue()` → 1 lectura de fila), `Sincronizacion.js:36/315` (escaneo completo cada 10 min), `Repositorios_ControlGeneralRepo.js:122` (sin caché) y `Api.js:90-100` (`porPagina=9999`). Este informe profundiza en el **camino completo de cada vista**, algo que esa auditoría no desglosó.

---

## 1. Resumen ejecutivo

La carga **inicial** de la app ya está bien resuelta: `doGet` (Codigo.js:44-78) inyecta `usuario` + `resumen` del dashboard directamente en el template, y `inicializarApp()` (scripts_app.html:65-93) pinta el dashboard con **cero round-trips** cuando hay cache hit — el patrón W5/S3 de `docs/07` ya está implementado. El problema real de percepción de lentitud está en otro lado: **(1)** cuatro de las vistas de mayor uso diario (Cola del auxiliar, Mis solicitudes del analista, Asignaciones, Pendientes del comercial) **nunca cachean nada en el cliente**, a diferencia de Lotes/Solicitudes/Usuarios que sí lo hacen — esto castiga exactamente a los roles (auxiliar, analista) que viven todo el día rebotando entre Dashboard y su cola de trabajo. **(2)** El antipatrón "N llamadas de columna separadas en vez de 1 lectura de fila/rango", que la auditoría previa ya corrigió en `AnalistaRepo.js:57-64`, **reaparece sin corregir** en `ColaAuxiliarRepo.js:25-33` (9 llamadas), `AnalistaRepo.js:252-256` (5 llamadas) y `AnalisisRepo.js:51-54` (hasta 10 llamadas). **(3)** La vista "Pendientes" del comercial (`obtenerErroresPendientesComercial`, ColaAuxiliarRepo.js:362-462) hace una llamada a Sheets **por cada error pendiente** (TextFinder + hasta 6 `getValue()`), lo que la convierte en la vista más lenta de la app y la que peor escala. **(4)** El patrón C4/C5 de `docs/07` (evitar TextFinder guardando el número de fila) está solo parcialmente implementado: el campo existe en el esquema pero el flujo real del analista sigue usando TextFinder. Ninguno de estos 4 puntos aparece en la auditoría técnica general — son específicos de la ruta de carga de datos en pantalla.

---

## 2. Tabla por vista/rol

| Vista (rol) | Round-trips al entrar | Paralelo/secuencial | Caché servidor | Caché cliente | Lectura completa vs. acotada | Latencia estimada |
|---|---|---|---|---|---|---|
| **Dashboard** (todos) | 0 (precargado en `doGet`) o 1 en cache-miss | n/a | Sí, 60s (`Api.js:36-43`) | Sí, 30s (scripts_app.html:96-97) | Acotada: 17 cols, todas las filas de datos | ~0 ms (hit) / 300-800 ms (miss, **bloquea el HTML de `doGet`**) |
| **Mis lotes** (comercial) | 1 (o 0 si `doGet` precargó) | n/a | Sí, 60s pero con techo de 90 KB (`Api.js:104-107`) | Sí, indefinido por sesión (scripts_app.html:444) | Acotada en columnas (24), **completa en filas** (todo Control_General) | 300 ms – 2 s+, crece con el tamaño total de la hoja |
| **Lotes** (líder/admin) | 1 | n/a | Igual que arriba — el techo de 90 KB se salta **justo** en el caso de mayor volumen | Sí | Igual que arriba, dataset más grande | Mayor que Mis Lotes; sin cache server en la mayoría de los casos reales |
| **Cola del auxiliar** | 1 | n/a (pero 9 sub-llamadas internas al servidor) | No | **No** (se re-pide en cada navegación) | Acotada en columnas, pero completa en filas, vía 9 lecturas de columna separadas | Alta: ~9 llamadas Sheets secuenciales por carga |
| **Mis solicitudes** (analista) | 1 | n/a | Headers NO cacheados (inconsistente con función hermana) | **No** | TextFinder + 2 llamadas por solicitud asignada (N≈cupo, ~10) | Media: 2N+2 llamadas Sheets |
| **Detalle solicitud** (modal auxiliar) | 1 | n/a | No aplica (fila puntual) | No aplica | 1 fila completa (62 cols), patrón correcto | Baja: ~200-400 ms |
| **Evaluar solicitud** (analista) | 1 | n/a | Headers sí, 300s (`AnalisisRepo.js:108-119`) — el mejor caso del repo | No | 1 fila completa, acotada en el mapeo final | Baja: la más rápida de las vistas de detalle |
| **Solicitudes** (líder/admin, "registro analisis") | 1 (+ "cargar más" bajo demanda) | n/a | Headers NO cacheados (a diferencia de `obtenerDetalleSolicitud` en el mismo archivo) | Sí, indefinido por sesión | **Única vista con paginación real de servidor** (ventana de filas), pero vía 10 lecturas de columna separadas | Media: ~500 ms – 1.5 s |
| **Asignaciones** (líder) | 1 | n/a | Headers NO cacheados | **No** | Completa en filas (todo "registro analisis"), 5 lecturas de columna separadas | Media-alta, escala con el tamaño de la hoja |
| **Pendientes / Errores** (comercial) | 1 (aparente) | n/a | No | **No** | `getDataRange()` completo de Errores_Terceros + catálogo, más TextFinder+6 `getValue()` **por cada error único** | **La peor de la app**: crece linealmente con el número de errores pendientes |
| **Usuarios** (CRUD, líder/admin) | 1 (0 en re-visitas) | n/a | No (hoja pequeña, aceptable) | Sí, indefinido por sesión | Completa pero hoja de ~50 filas | Baja |
| **Configuración** (catálogo motivos) | 1 cada visita | n/a | No | **No** | Completa, hoja pequeña | Baja (pero innecesaria en cada visita) |
| **Detalle de lote** | 1 | n/a | No aplica | No | TextFinder + fila(s) completas del lote | Baja-media |
| **Radicar** / **Reportes** | 0 al entrar (solo acciones bajo demanda) | n/a | n/a | n/a | n/a | Instantánea |

---

## 3. Hallazgos priorizados

### 🔴 Alto impacto

#### H1 — "Pendientes" del comercial: una llamada a Sheets por cada error pendiente
**`Repositorios_ColaAuxiliarRepo.js:362-462`** (`obtenerErroresPendientesComercial`)

El flujo es: `_leerCatalogoMotivos()` (propio `openById`+`getDataRange`, sin caché) → `getDataRange()` completo de `Errores_Terceros` → por cada UUID único con error pendiente: 1 `createTextFinder().findNext()` + hasta 6 `getRange().getValue()` individuales en `Control_General` (líneas 425-445). Con 20 errores pendientes esto son **~140+ llamadas a Sheets en una sola carga de vista**. Es la vista con peor escalado de toda la app y no está mencionada en la auditoría previa (que se centró en `AnalistaRepo`).

*Esfuerzo: S.* Recomendación: leer el bloque de columnas necesario de `Control_General` en 1-2 `getRange().getValues()` (patrón ya usado en `obtenerColaAuxiliar`, aunque ahí también es mejorable — ver H3) y cruzar en memoria con un mapa `idLote/uuid → fila`, en vez de TextFinder + 6 `getValue()` por UUID:

```javascript
// En vez de: por cada uuid → TextFinder + 6 getValue()
// Leer 1 vez las columnas necesarias de Control_General y armar un índice:
var colsNecesarias = hojaControl.getRange(2, 1, filas, 62).getValues();
var indicePorUuid = {};
colsNecesarias.forEach(function(fila, i) { indicePorUuid[fila[61]] = fila; }); // col 62 = UUID
// Luego, por cada error pendiente: indicePorUuid[uuid] → acceso O(1) en memoria, 0 llamadas extra.
```

#### H2 — Caché de cliente ausente justo en las vistas de uso más repetitivo (auxiliar y analista)
**`scripts_app.html:618` (`cargarColaAuxiliar`), `:1033` (`_cargarVistaAnalista`), `:1305` (`cargarVistaAsignaciones`), `:1375` (`cargarVistaErroresComercial`)**

Ninguna de estas 4 funciones comprueba una caché en memoria antes de golpear el servidor — a diferencia de `cargarVistaUsuarios` (línea 1905: `if (_usuariosCache) { render; return; }`), `cargarVistaSolicitudes` (línea 1638) o `cargarMisLotes` (línea 446), que sí reutilizan el dato ya cargado en la sesión. El auxiliar y el analista son los roles que **más rebotan** entre Dashboard y su cola de trabajo durante el día — cada clic de vuelta a "Cola" o "Mis solicitudes" paga un round-trip completo aunque no haya pasado nada.

*Esfuerzo: XS-S.* El patrón ya existe en el mismo archivo, solo falta aplicarlo:

```javascript
var _colaAuxiliarCache = null; // ya existe la variable, falta el check
function cargarColaAuxiliar() {
  if (_colaAuxiliarCache) { _renderizarColaAuxiliar(); return; }
  // ... resto igual (skeleton + callServer)
}
// Y al invalidar tras una acción (ya se hace: _colaAuxiliarCache = null antes de recargar)
```

#### H3 — El antipatrón "N columnas separadas" corregido en un lugar reaparece sin corregir en otros tres
La auditoría previa corrigió esto en `AnalistaRepo.js:57-64` (8 `getValue()` → 1 lectura de fila), pero el mismo problema sigue vivo en:
- **`Repositorios_ColaAuxiliarRepo.js:25-33`** (`obtenerColaAuxiliar`): 9 llamadas `getRange(2, col, filasData, 1).getValues()` separadas, una por columna, en vez de 1 sola lectura de rango que cubra las columnas necesarias.
- **`Repositorios_AnalistaRepo.js:252-256`** (`obtenerAsignacionesActivas`): 5 llamadas de columna completa separadas.
- **`Repositorios_AnalisisRepo.js:51-54`** (`obtenerSolicitudesResumen`): hasta 10 llamadas de columna separadas para el bloque de filas pedido.

El costo en Apps Script/Sheets es por **llamada de red**, no por volumen de datos — 9 llamadas de 1 columna son mucho más lentas que 1 llamada que traiga un rango con 9 columnas, aunque el payload sea mayor.

*Esfuerzo: S cada uno.* Patrón de reemplazo:

```javascript
// INCORRECTO ❌ (lo que hacen hoy los 3 repos)
var colA = hoja.getRange(2, 10, filas, 1).getValues();
var colB = hoja.getRange(2, 1, filas, 1).getValues();
// ... 7 más

// CORRECTO ✅ — 1 sola llamada de rango, columnas contiguas o el ancho mínimo que las cubra
var bloque = hoja.getRange(2, 1, filas, 62).getValues();
var idLote = bloque[i][0], estado = bloque[i][9], arrendatario = bloque[i][23]; // etc.
```

#### H4 — Caché de headers implementada en un solo lugar, no en el resto del mismo flujo
**`Repositorios_AnalisisRepo.js:108-119`** cachea los headers de "registro analisis" con TTL 300s (patrón W1 correcto), pero **`Repositorios_AnalistaRepo.js:21, 178, 236, 285`** relee los headers de la **misma hoja** en cada invocación, sin caché — 4 sitios distintos. La vista más afectada es "Mis solicitudes" del analista (la que usa ese rol todo el día), que paga esta relectura en cada carga.

*Esfuerzo: XS.* Extraer un helper único:

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
(La clave de caché ya existe — es literalmente la misma que usa `obtenerDetalleSolicitud`; solo falta que los otros 4 sitios la reutilicen en vez de releer.)

#### H5 — `doGet` bloquea el HTML completo en cache-miss del resumen
**`Codigo.js:44-78`**, específicamente `datosIniciales.resumen = obtenerResumenComercial(...)` en la línea 62.

Cuando el caché de 60s del resumen expiró, `doGet` ejecuta la lectura de Sheets **de forma síncrona antes de devolver el HTML** — a diferencia de cualquier otra vista de la app, donde el HTML/spinner se muestra primero y el dato llega después vía `google.script.run`. En este caso el usuario ve una pantalla en blanco (el navegador ni siquiera tiene el DOM) durante lo que tarde `obtenerResumenComercial`, en vez de ver el layout + skeleton al instante.

*Esfuerzo: S.* Recomendación: no precargar `resumen` en `doGet`; dejar que `inicializarApp()` siempre pase por `_mostrarSkeletonDashboard()` + `cargarDashboard()` async. Se pierde el "0 round-trips" en el caso feliz, pero se elimina el peor caso (bloqueo de TTFB), que es más dañino para la percepción de velocidad. Alternativa intermedia: mantener el intento de cache-hit síncrono (es solo una lectura de `CacheService`, no de Sheets) pero **nunca** ejecutar `obtenerResumenComercial()` dentro de `doGet` — devolver `datosIniciales.resumen = null` en cache-miss y dejar que el cliente lo pida.

---

### 🟡 Medio impacto

#### M1 — "Cola del auxiliar" y "Lotes" leen siempre la tabla completa, sin ventana
**`Repositorios_ColaAuxiliarRepo.js:20-33`** y **`Repositorios_ControlGeneralRepo.js:120-122`** usan `getRange(2, col, hoja.getLastRow()-1, 1)` — es decir, TODAS las filas de `Control_General`, sin importar cuántas se necesiten realmente. Contrasta con `obtenerSolicitudesResumen` (`AnalisisRepo.js:18-31`), que sí calcula una ventana (`filaInicio`/`filaFin`) y solo lee ese bloque. Como `Control_General` crece sin límite (es la hoja maestra de todo el negocio), estas 2 vistas —las de mayor tráfico diario— escalarán mal mientras "Solicitudes" ya tiene el patrón correcto en el mismo proyecto.

*Esfuerzo: M.* Requiere una estrategia real de ventana (ej. mantener un índice de filas por estado, o limitar a los últimos N días) en vez de reescribir todo Control_General cada vez.

#### M2 — Techo de 90 KB en el caché de "Todos los lotes" se salta justo donde más se necesita
**`Api.js:104-107`**: `if (json.length < 90000) cache.put(...)`. El caso de mayor volumen —líder/admin viendo todos los lotes de la operación— es precisamente el que más probablemente supere 90 KB, y en ese caso **nunca se cachea**, degradándose silenciosamente a una lectura completa de Sheets en cada visita de ese rol.

*Esfuerzo: XS.* Subir el límite (CacheService soporta hasta 100 KB por clave, se puede fragmentar en 2 claves) o comprimir el JSON antes de cachear.

#### M3 — Patrón "acción → invalidar → refetch completo" en vez de actualización optimista
Repetido en `_marcarRadicadoAuxiliar` (scripts_app.html:822-833), `_guardarUsuario` (:2051-2062), `_guardarMotivo`/`_eliminarMotivo` (:2209-2221, :2225-2235), `_liberarSolicitud` (:1363-1369), `_enviarCorreccion` (:1596-1608). Cada acción exitosa invalida la caché local y vuelve a pedir la lista completa al servidor, en vez de actualizar el ítem localmente. No es crítico porque son acciones (no cargas de vista), pero cada una añade un segundo round-trip visible justo después de la acción principal.

*Esfuerzo: M* (hay que tocar cada handler). Ejemplo para la cola del auxiliar:

```javascript
// En vez de: _colaAuxiliarCache = null; cargarColaAuxiliar();
_colaAuxiliarCache = _colaAuxiliarCache.filter(function(s) { return s.uuid !== uuid; });
_renderizarColaAuxiliar(); // instantáneo, sin round-trip
```

#### M4 — C4/C5 de docs/07 parcialmente implementado: el campo existe pero no se usa como fuente de verdad
`docs/07-resoluciones-tecnicas.md` (sección C4/C5) documenta guardar `FILA_REG_ANALISIS` en `COLA_ANALISIS` para leer directo por índice y evitar TextFinder. El campo existe en el esquema (**`Repositorios_ColaAuxiliarRepo.js:248`**, con el comentario explícito *"FILA_REG_ANALISIS (no aplica aquí, se llenará en sync)"*), pero:
- `pedirSolicitudAnalista` (**`AnalistaRepo.js:82-162`**) nunca devuelve `fila` al frontend.
- `obtenerSolicitudesAnalista` (**`AnalistaRepo.js:44-46`**), que alimenta la vista "Mis solicitudes" del analista, **sigue usando `createTextFinder(emailAnalista).findAll()`** sobre la columna ASIGNADA A de "registro analisis" en cada carga, en vez de leer los números de fila ya conocidos desde `COLA_ANALISIS`.

Es decir: el patrón ideal está diseñado pero no conectado end-to-end. *Estado: PARCIAL.*

*Esfuerzo: M.* Requiere que `Sincronizacion.js` complete realmente `FILA_REG_ANALISIS` al crear la fila en "registro analisis" (hoy es un placeholder, ver comentario en la línea 248) y que `obtenerSolicitudesAnalista` lea `COLA_ANALISIS` (pestaña pequeña) en vez de hacer TextFinder sobre la hoja de análisis (potencialmente grande).

#### M5 — `setValue()` individuales en una operación sensible a percepción
**`Repositorios_AnalistaRepo.js:129-131`** (`pedirSolicitudAnalista`): 3 llamadas `setValue()` consecutivas sobre la misma fila (`ESTADO`, `ASIGNADA_A`, `FECHA_ASIGNACION`) en vez de 1 `setValues()` de rango — justo la "regla de oro" que `docs/07` prohíbe explícitamente (sección C1+C2), en una acción donde el usuario ya ve el botón en estado "⏳ Asignando...".

*Esfuerzo: XS.*

```javascript
// En vez de 3 setValue():
hojaCola.getRange(filaDisponible, 9, 1, 3).setValues([['EN_EVALUACION', emailAnalista, new Date()]]);
```

---

### 🟢 Bajo impacto

#### B1 — Loading states inconsistentes entre vistas
Las vistas con skeleton "shaped" (fiel al layout final: Cola auxiliar `scripts_app.html:618-627`, Solicitudes `:1649-1655`, Asignaciones `:1307`, Errores comercial `:1377-1378`, Mis solicitudes analista `:1035-1037`) conviven con vistas que solo muestran el spinner genérico de página completa sin forma anticipada del contenido (`_verDetalleLote:2069`, `_abrirEvaluacion:1112`, ambas usan `mostrarVista('viewLoading')` a secas). No es grave, pero la inconsistencia se nota. *Esfuerzo: XS-S.*

#### B2 — `callServerConSpinner` definido pero nunca usado
**`scripts_apiClient.html:57-73`**. Código muerto — cada vista maneja su propio loading state manualmente (con distintos niveles de pulido, ver B1) en vez de usar el spinner global unificado que ya existe. *Esfuerzo: XS* (eliminar o adoptar consistentemente en las vistas que hoy no muestran ningún estado de carga).

#### B3 — Catálogo de motivos releído completo en cada visita
**`Api.js:525-555`** (`_leerCatalogoMotivos`), invocado desde `cargarVistaConfiguracion` sin caché servidor ni cliente. Impacto bajo porque la hoja es pequeña, pero es una relectura innecesaria de datos casi estáticos. *Esfuerzo: XS.*

#### Lo que SÍ está bien y conviene no tocar
- **W5/S3 (datos iniciales en template)**: implementado en `Codigo.js:44-78` + `scripts_app.html:65-93` — 0 round-trips para el dashboard en el caso feliz.
- **Lectura inversa (recientes primero)**: implementada de forma consistente en `ControlGeneralRepo.js:129`, `AnalisisRepo.js:58`, `ColaAuxiliarRepo.js:36`.
- **Paginación real de servidor**: única en "Solicitudes" (`AnalisisRepo.js`, ventana `filaInicio`/`filaFin`) — el resto de vistas leen todo y paginan en memoria (ver M1).
- **Filtro/orden/búsqueda 100% client-side**: en Lotes y Solicitudes no hay ninguna llamada `google.script.run` por tecla — todo se filtra en el array ya cargado. No hace falta debounce porque no hay handlers `oninput`; las búsquedas se disparan con Enter/clic. Esto ya sigue la mejor práctica.
- **Spinner no bloqueante**: `#viewLoading` vive dentro de `#mainContent` (IndexNuevo.html:51-56), no tapa header ni sidebar — el usuario puede seguir navegando mientras carga.
- **`obtenerDetalleSolicitud`** (`AnalisisRepo.js:103-233`) es el mejor patrón de todo el repo: headers cacheados 300s + 1 lectura de fila completa. Usar como referencia al corregir H3/H4.

---

## 4. Plan de quick wins (orden de impacto/esfuerzo)

| # | Acción | Impacto | Esfuerzo | Referencia |
|---|---|---|---|---|
| 1 | Añadir check de caché de cliente en `cargarColaAuxiliar`, `_cargarVistaAnalista`, `cargarVistaAsignaciones`, `cargarVistaErroresComercial` (mismo patrón ya usado en Lotes/Solicitudes/Usuarios) | Alto — beneficia a los roles que más navegan por día | XS-S | H2 |
| 2 | Extraer helper de headers cacheados (300s) y usarlo en los 4 sitios de `AnalistaRepo.js` que hoy releen sin caché | Alto — toca la vista más usada por el analista | XS | H4 |
| 3 | Reescribir `obtenerErroresPendientesComercial` para leer `Control_General` en 1-2 rangos e indexar en memoria, eliminando el TextFinder+6×getValue por UUID | Alto — es la vista más lenta hoy | S | H1 |
| 4 | Quitar la lectura síncrona de `obtenerResumenComercial` de `doGet`; dejar que siempre pase por skeleton+async | Alto — elimina el peor caso de TTFB en blanco | S | H5 |
| 5 | Consolidar las 9/5/10 lecturas de columna separadas en `ColaAuxiliarRepo.js`, `AnalistaRepo.js` (asignaciones) y `AnalisisRepo.js` en 1 lectura de rango cada una | Alto | S (×3) | H3 |
| 6 | Subir o fragmentar el techo de 90 KB en el caché de `api_obtenerTodosLosLotes` | Medio | XS | M2 |
| 7 | Cambiar los 3 `setValue()` de `pedirSolicitudAnalista` por 1 `setValues()` de rango | Medio (percepción en una acción interactiva) | XS | M5 |
| 8 | Actualización optimista local tras acciones (radicar, guardar usuario/motivo, liberar, corregir) en vez de invalidar+refetch | Medio | M | M3 |
| 9 | Conectar `FILA_REG_ANALISIS` end-to-end (Sincronizacion.js → COLA_ANALISIS → `obtenerSolicitudesAnalista`) para eliminar el TextFinder que aún sobrevive en "Mis solicitudes" del analista | Medio | M | M4 |
| 10 | Ventana real de lectura (no `getDataRange`/rango completo) para Cola del auxiliar y Lotes | Medio, pero crítico a mediano plazo por escalabilidad | M | M1 |
| 11 | Unificar loading states (skeletons shaped) y decidir sobre `callServerConSpinner` (usarlo o eliminarlo) | Bajo | XS-S | B1, B2 |

**Racional del orden**: los ítems 1-5 son los que más se notan en el uso diario real (auxiliar y analista viven en esas pantallas) y todos son de esfuerzo bajo porque el patrón correcto **ya existe en el mismo proyecto** — es cuestión de replicarlo, no de inventar nada nuevo. Los ítems 6-9 corrigen deuda de diseño ya documentada en `docs/07` que quedó a medio camino. El ítem 10 es el único que requiere una decisión de arquitectura (ventaneo de Control_General) y por eso se deja para cuando el volumen de datos lo justifique — hoy con el tamaño actual de la hoja no es el cuello de botella dominante, pero lo será si la operación crece sin que se toque.
