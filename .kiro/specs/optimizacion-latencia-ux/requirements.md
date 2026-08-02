# Requirements Document

## Introduction

Este documento especifica los requerimientos para optimizar la latencia percibida, la carga de datos y la experiencia de usuario en la Web App v2 del sistema de Automatización de Inducciones (El Libertador). El objetivo es que los usuarios de todos los roles (Comercial, Auxiliar, Analista, Líder/Admin) puedan interactuar con la aplicación sin demoras perceptibles ni bloqueos de interfaz.

El diagnóstico base proviene de las auditorías `docs/08-auditoria-rendimiento-vistas.md` y `docs/auditoria-tecnica-20260729.md`, que identifican cuellos de botella concretos en la carga de vistas, patrones de acceso a datos ineficientes y ausencia de caché en las vistas de mayor uso diario.

## Glossary

- **Sistema_WebApp**: La aplicación web servida por Google Apps Script (`doGet` con parámetro `?v=2`) que ejecuta el frontend nuevo (IndexNuevo.html + scripts_app.html).
- **Motor_Datos**: La capa de backend compuesta por `Api.js` y los archivos `Repositorios_*.js` que acceden a Google Sheets como fuente de datos.
- **Cache_Cliente**: Almacenamiento en memoria JavaScript del navegador que persiste durante la sesión de usuario, evitando round-trips al servidor para datos ya cargados.
- **Cache_Servidor**: `CacheService` de Google Apps Script, almacén clave-valor con TTL configurable que reduce lecturas repetitivas a Sheets.
- **Round_Trip**: Una invocación completa de `google.script.run` desde el frontend al backend y su respuesta.
- **Skeleton**: Representación visual del layout final de una vista con placeholders animados que se muestra mientras se cargan los datos reales.
- **Lectura_Batch**: Lectura de un rango completo de celdas en una sola llamada a `getRange().getValues()` en vez de múltiples llamadas individuales.
- **Actualización_Optimista**: Patrón donde la UI se actualiza inmediatamente en memoria local tras una acción exitosa, sin esperar un refetch completo del servidor.
- **TTFB**: Time to First Byte — tiempo desde que el usuario solicita la página hasta que el navegador recibe el primer byte del HTML.
- **TextFinder**: API de Google Sheets que busca texto celda por celda en un rango; es más lenta que indexar un array en memoria cuando se necesitan múltiples búsquedas.
- **Ventana_Datos**: Subconjunto acotado de filas leídas del Spreadsheet (por fecha, estado o índice) en vez de leer la totalidad de la hoja.

## Requirements

### Requirement 1: Caché de cliente en vistas de navegación frecuente

**User Story:** Como auxiliar o analista, quiero que las vistas que visito repetidamente durante el día se carguen instantáneamente al regresar, para no perder tiempo esperando datos que no cambiaron.

#### Acceptance Criteria

1. WHEN el usuario navega a la vista "Cola del auxiliar" y los datos ya fueron cargados previamente en la sesión y no han sido invalidados, THE Cache_Cliente SHALL renderizar la vista desde memoria en menos de 100 ms sin ejecutar un Round_Trip al servidor.
2. WHEN el usuario navega a la vista "Mis solicitudes" del analista y los datos ya fueron cargados previamente en la sesión y no han sido invalidados, THE Cache_Cliente SHALL renderizar la vista desde memoria en menos de 100 ms sin ejecutar un Round_Trip al servidor.
3. WHEN el usuario navega a la vista "Asignaciones" del líder y los datos ya fueron cargados previamente en la sesión y no han sido invalidados, THE Cache_Cliente SHALL renderizar la vista desde memoria en menos de 100 ms sin ejecutar un Round_Trip al servidor.
4. WHEN el usuario navega a la vista "Pendientes/Errores" del comercial y los datos ya fueron cargados previamente en la sesión y no han sido invalidados, THE Cache_Cliente SHALL renderizar la vista desde memoria en menos de 100 ms sin ejecutar un Round_Trip al servidor.
5. WHEN el usuario ejecuta una acción que modifica datos de la vista activa (radicar, tomar solicitud, marcar error, enviar corrección), THE Cache_Cliente SHALL invalidar los datos en memoria de esa vista de modo que la siguiente navegación ejecute un Round_Trip al servidor para obtener datos frescos.
6. WHEN el usuario navega por primera vez a una vista sin datos en caché, THE Sistema_WebApp SHALL mostrar un Skeleton que reproduzca la estructura de encabezados y filas de tabla de la vista destino mientras se obtienen los datos del servidor.
7. IF el usuario recarga la página o inicia una nueva sesión del navegador, THEN THE Cache_Cliente SHALL considerar todas las vistas como no cacheadas y ejecutar un Round_Trip al servidor en la primera navegación a cada vista.

---

### Requirement 2: Lectura batch de datos en repositorios del backend

**User Story:** Como usuario de cualquier rol, quiero que las vistas carguen con la menor latencia posible, para poder trabajar sin demoras causadas por múltiples llamadas secuenciales al Spreadsheet.

#### Acceptance Criteria

1. THE Motor_Datos SHALL leer las columnas necesarias para la Cola del auxiliar (columnas A-BJ, rango 1:62) en una sola Lectura_Batch de rango contiguo, en vez de múltiples lecturas de columna individual.
2. THE Motor_Datos SHALL leer las columnas necesarias para la vista "Asignaciones activas" del analista en una sola Lectura_Batch de rango contiguo desde la hoja "registro analisis".
3. THE Motor_Datos SHALL leer las columnas necesarias para el resumen de solicitudes ("Solicitudes" del líder) en una sola Lectura_Batch de rango contiguo desde la hoja "registro analisis".
4. WHEN la función `obtenerColaAuxiliar` se ejecuta, THE Motor_Datos SHALL realizar como máximo 2 llamadas a `getRange().getValues()` sobre Google Sheets (una para datos, opcionalmente una para headers si no están en caché).
5. WHEN la función `obtenerAsignacionesActivas` se ejecuta, THE Motor_Datos SHALL realizar como máximo 2 llamadas a `getRange().getValues()` sobre Google Sheets.
6. WHEN la función `obtenerSolicitudesResumen` se ejecuta, THE Motor_Datos SHALL realizar como máximo 2 llamadas a `getRange().getValues()` sobre Google Sheets.

---

### Requirement 3: Eliminación de TextFinder iterativo en vista de Pendientes del comercial

**User Story:** Como comercial con errores pendientes de corrección, quiero que la vista "Pendientes" cargue en un tiempo proporcional al número de errores y no crezca linealmente con cada error adicional, para poder ver mis errores sin demoras excesivas.

#### Acceptance Criteria

1. WHEN la función `obtenerErroresPendientesComercial` se ejecuta, THE Motor_Datos SHALL leer los datos de Control_General en un máximo de 2 llamadas a Sheets (1 para obtener el rango completo de filas y columnas necesarias, 1 opcional si se requiere metadato de la hoja) y construir un índice en memoria por UUID (columna BJ / índice 61), eliminando el uso de TextFinder por cada error pendiente.
2. THE Motor_Datos SHALL obtener los campos de contexto de cada solicitud con error — arrendatario (col X/23), idLote (col A/0), fecha de radicación (col C/2), y nombres de participantes INQ, COA1-COA5 (cols AD/29, AJ/35, AP/41, AV/47, BB/53) — directamente del índice en memoria, sin realizar llamadas individuales `getRange().getValue()` por cada UUID.
3. WHEN existen 20 o más errores pendientes para un comercial, THE Motor_Datos SHALL completar la función `obtenerErroresPendientesComercial` con un máximo de 4 llamadas totales a Sheets (Errores_Terceros: 1, Control_General: máximo 2, CATALOGO_MOTIVOS: máximo 1), independiente de la cantidad de errores.
4. IF un UUID presente en Errores_Terceros no se encuentra en el índice de Control_General, THEN THE Motor_Datos SHALL omitir ese error del resultado sin interrumpir el procesamiento de los demás errores pendientes.
5. IF la hoja Control_General no existe o contiene solo la fila de encabezado, THEN THE Motor_Datos SHALL retornar un arreglo vacío sin lanzar excepción.

---

### Requirement 4: Carga no bloqueante del HTML inicial (doGet)

**User Story:** Como usuario que abre la aplicación, quiero ver el layout de la página inmediatamente al cargar, en vez de una pantalla en blanco mientras el servidor lee datos, para tener retroalimentación visual inmediata de que la app está respondiendo.

#### Acceptance Criteria

1. WHEN CacheService devuelve null para la clave de resumen del usuario (cache-miss), THE Sistema_WebApp SHALL servir el HTML completo sin invocar `obtenerResumenComercial()` de forma síncrona dentro de `doGet`, asignando `datosIniciales.resumen = null`.
2. WHEN `datosIniciales.resumen` es null al inicializar la app en el cliente, THE Sistema_WebApp SHALL mostrar un Skeleton del dashboard (4 placeholders animados en la zona de KPIs) y solicitar el resumen de forma asíncrona mediante `google.script.run`.
3. IF la llamada asíncrona de resumen vía `google.script.run` falla o no responde en un máximo de 15 segundos, THEN THE Sistema_WebApp SHALL reemplazar el Skeleton por un mensaje de error con opción de reintentar, sin perder el layout (header, sidebar, menú de navegación permanecen visibles).
4. WHEN CacheService devuelve un valor válido para la clave de resumen del usuario (cache-hit), THE Sistema_WebApp SHALL inyectar el resumen serializado en el HTML para que el cliente renderice el dashboard sin realizar una segunda llamada al servidor.
5. THE Sistema_WebApp SHALL mostrar el DOM estructural (header, sidebar y contenedor principal con contenido visible — ya sea datos precargados o Skeleton) con un Time to First Contentful Paint menor o igual a 500 ms desde el inicio de la respuesta HTTP, independientemente del estado del caché de datos.

---

### Requirement 5: Caché de headers de hojas de cálculo

**User Story:** Como analista que consulta "Mis solicitudes" repetidamente durante el día, quiero que la lectura de encabezados de la hoja de análisis sea instantánea, para que mi vista cargue más rápido.

#### Acceptance Criteria

1. THE Motor_Datos SHALL cachear los headers de la hoja "registro analisis" en CacheService con un TTL de 300 segundos, usando la clave `HDR_REG_ANALISIS` compartida entre `Repositorios_AnalisisRepo.js` y `Repositorios_AnalistaRepo.js`, almacenando los valores como un array JSON de strings recortados (trimmed).
2. WHEN los headers están disponibles en CacheService bajo la clave `HDR_REG_ANALISIS`, THE Motor_Datos SHALL utilizar los headers cacheados en vez de leer la fila 1 de la hoja, para todas las funciones de `Repositorios_AnalisisRepo.js` y `Repositorios_AnalistaRepo.js` que requieren mapear columnas por nombre.
3. WHEN una función de repositorio solicita headers y el caché no contiene la clave `HDR_REG_ANALISIS` (por expiración o primera ejecución), THE Motor_Datos SHALL leer la fila 1 completa de la hoja "registro analisis", almacenar el resultado en CacheService con TTL de 300 segundos, y retornar los headers a la función solicitante.
4. IF el tamaño del valor JSON de headers supera el límite de 100 KB de CacheService, THEN THE Motor_Datos SHALL omitir la escritura en caché y retornar los headers leídos directamente de la hoja sin interrumpir la operación.

---

### Requirement 6: Escritura batch en operaciones interactivas

**User Story:** Como analista que pide una solicitud de la cola, quiero que la asignación se complete lo más rápido posible, para minimizar el tiempo de espera con el botón en estado "cargando".

#### Acceptance Criteria

1. WHEN la función `pedirSolicitudAnalista` asigna una solicitud en COLA_ANALISIS, THE sistema SHALL escribir los campos ESTADO, ASIGNADA_A y FECHA_ASIGNACION en una sola llamada `setValues()` sobre un rango contiguo de 1 fila × 3 columnas (columnas 9 a 11), en vez de llamadas `setValue()` individuales por campo.
2. WHEN la función `pedirSolicitudAnalista` completa la asignación en COLA_ANALISIS, THE sistema SHALL haber ejecutado como máximo 1 llamada de escritura (`setValues`) a la hoja COLA_ANALISIS por cada invocación de la función.
3. IF la llamada `setValues()` sobre COLA_ANALISIS falla, THEN THE sistema SHALL liberar el lock, no modificar la hoja "registro analisis", y retornar un objeto con `ok: false` y un mensaje indicando que la asignación no se pudo completar.
4. WHEN la función `pedirSolicitudAnalista` escribe en la hoja secundaria "registro analisis", THE sistema SHALL utilizar como máximo 1 llamada de escritura (`setValue` o `setValues`) para registrar la asignación del analista en dicha hoja.

---

### Requirement 7: Actualización optimista de la UI tras acciones

**User Story:** Como auxiliar que acaba de radicar una solicitud, quiero que la cola se actualice instantáneamente en pantalla sin recargar todos los datos del servidor, para tener confirmación visual inmediata y poder continuar trabajando.

#### Acceptance Criteria

1. WHEN el auxiliar marca una solicitud como "RADICADO" exitosamente, THE Sistema_WebApp SHALL remover esa solicitud del Cache_Cliente de la cola, invalidar el Cache_Cliente de resumen del dashboard, y re-renderizar la lista en un máximo de 200 ms sin ejecutar un Round_Trip adicional al servidor.
2. WHEN el comercial envía una corrección exitosamente, THE Sistema_WebApp SHALL remover la solicitud corregida del Cache_Cliente de "Pendientes" si la corrección resuelve todos los errores, o actualizar únicamente los campos corregidos si quedan errores restantes, y re-renderizar sin Round_Trip adicional.
3. WHEN el líder guarda o elimina un usuario o motivo exitosamente, THE Sistema_WebApp SHALL agregar, modificar o eliminar la entrada correspondiente en el Cache_Cliente de usuarios o motivos según la operación realizada, y re-renderizar la lista sin Round_Trip adicional.
4. IF la respuesta del servidor indica fallo o no se recibe dentro de 10 segundos, THEN THE Sistema_WebApp SHALL revertir el Cache_Cliente al estado previo a la actualización optimista, re-renderizar la lista con los datos restaurados, y mostrar un toast de tipo error indicando la causa del fallo reportada por el servidor.
5. IF el usuario navega a otra sección mientras una acción optimista espera confirmación del servidor y la confirmación resulta fallida, THEN THE Sistema_WebApp SHALL revertir el Cache_Cliente silenciosamente y mostrar un toast de error sin alterar la vista activa.

---

### Requirement 8: Límite de caché servidor para datasets grandes

**User Story:** Como líder que consulta todos los lotes de la operación, quiero que la segunda consulta sea instantánea aunque el dataset supere 90KB, para no sufrir la lectura completa del Spreadsheet cada vez.

#### Acceptance Criteria

1. WHEN el JSON de "Todos los lotes" excede 90KB pero es menor a 100KB, THE Motor_Datos SHALL almacenarlo en una sola clave de CacheService con un TTL de 60 segundos.
2. IF el JSON de "Todos los lotes" excede 100KB pero es menor o igual a 500KB, THEN THE Motor_Datos SHALL fragmentar el payload en claves consecutivas de máximo 99KB cada una y reconstruirlo al leer de modo que el resultado parseado sea idéntico byte a byte al JSON original.
3. WHEN el caché de lotes existe y su TTL no ha expirado, THE Motor_Datos SHALL retornar los datos cacheados sin leer la hoja de Control_General.
4. IF el caché de lotes no existe o su TTL ha expirado, THEN THE Motor_Datos SHALL leer la hoja de Control_General, retornar los datos y regenerar el caché antes de responder.
5. IF el JSON de "Todos los lotes" excede 500KB, THEN THE Motor_Datos SHALL almacenar solo los datos en caché sin fragmentar (truncando al límite soportado) y registrar un evento de nivel WARN en Logs_Sistema indicando que el payload excedió el máximo fragmentable.

---

### Requirement 9: Conexión end-to-end del campo FILA_REG_ANALISIS

**User Story:** Como analista, quiero que la vista "Mis solicitudes" cargue directamente desde un índice de filas conocidas en vez de buscar mi email por toda la hoja de análisis, para que la carga sea proporcional a mi cupo de solicitudes y no al tamaño total de la hoja.

#### Acceptance Criteria

1. WHEN una solicitud es insertada en la hoja "registro analisis" por la función `sincronizarLoteAutomatico`, THE Motor_Datos SHALL escribir el número de fila resultante (base-1 en Sheets) en la columna FILA_REG_ANALISIS de la fila correspondiente en COLA_ANALISIS, identificada por UUID_SISTEMA.
2. WHEN la función `obtenerSolicitudesAnalista` se ejecuta, THE Motor_Datos SHALL leer de COLA_ANALISIS únicamente las filas con ESTADO = "EN_EVALUACION" y ASIGNADA_A igual al email del analista, y acceder directamente a las filas indicadas por FILA_REG_ANALISIS en "registro analisis", sin usar TextFinder sobre toda la hoja.
3. IF el valor de FILA_REG_ANALISIS para una solicitud asignada es vacío, cero o apunta a una fila cuyo UUID_SISTEMA no coincide con el UUID esperado, THEN THE Motor_Datos SHALL excluir esa solicitud del resultado y registrar una advertencia en el log del servidor, sin interrumpir la carga de las demás solicitudes.
4. WHEN FILA_REG_ANALISIS está poblado con valores válidos, THE Motor_Datos SHALL completar la carga de "Mis solicitudes" realizando como máximo N+2 llamadas a la API de Sheets, donde N es el número de solicitudes activas del analista (limitado por cupoMax, máximo 10), independientemente del número total de filas en "registro analisis".

---

### Requirement 10: Ventana de lectura para vistas de datos masivos

**User Story:** Como líder que opera con un volumen creciente de solicitudes, quiero que las vistas de Cola del auxiliar y Lotes no degraden su rendimiento a medida que la hoja de Control_General crece, para mantener tiempos de respuesta estables a mediano plazo.

#### Acceptance Criteria

1. WHEN la función `obtenerColaAuxiliar` se ejecuta, THE Motor_Datos SHALL leer únicamente las filas de Control_General cuyo estado sea "PENDIENTE RADICAR", limitando el rango de lectura a las últimas 2000 filas de la hoja en vez de leer todas las filas desde la fila 2 hasta la última fila con datos.
2. WHEN la función `obtenerLotesDeComercial` se ejecuta para roles LIDER/ADMIN, THE Motor_Datos SHALL limitar la lectura inicial a las últimas 2000 filas de Control_General, y devolver los lotes resultantes aplicando la paginación existente (parámetros `pagina` y `porPagina`) sobre ese subconjunto.
3. IF el usuario solicita datos anteriores a la ventana de las últimas 2000 filas, THEN THE Motor_Datos SHALL ofrecer un mecanismo de filtrado por rango de fechas que permita especificar fecha de inicio y fecha de fin, leyendo únicamente las filas dentro del rango solicitado.
4. WHEN se ejecuta una función con ventana de lectura (`obtenerColaAuxiliar` u `obtenerLotesDeComercial`), THE Motor_Datos SHALL completar la lectura y devolver los datos al cliente en un tiempo no superior a 3 segundos para hojas de hasta 10000 filas totales.
5. IF la hoja Control_General contiene menos de 2000 filas, THEN THE Motor_Datos SHALL leer todas las filas disponibles sin aplicar ventaneo, manteniendo el comportamiento actual.

---

### Requirement 11: Consistencia de estados de carga (loading states)

**User Story:** Como usuario de cualquier rol, quiero que todas las vistas muestren un estado de carga coherente (skeleton shaped) mientras se obtienen datos, para tener claridad sobre qué se está cargando y evitar percepción de "app rota".

#### Acceptance Criteria

1. WHEN el usuario navega a una vista que requiere datos del servidor, THE Sistema_WebApp SHALL mostrar un Skeleton que refleje la estructura del contenido final (tabla con encabezados para vistas de lista, cards con placeholders para dashboards, formulario con campos vacíos para vistas de detalle), en vez de un spinner genérico de pantalla completa.
2. THE Sistema_WebApp SHALL aplicar el mismo patrón de loading state (Skeleton con animación pulse) en todas las vistas que cargan datos asincrónicamente, incluyendo los modales de detalle de lote y evaluación de solicitud.
3. WHILE se ejecuta una llamada al servidor, THE Sistema_WebApp SHALL mantener visibles el header y la navegación lateral, permitiendo al usuario navegar a otra sección si lo desea.
4. IF la carga de datos excede 15 segundos sin respuesta, THEN THE Sistema_WebApp SHALL reemplazar el Skeleton por un mensaje de error con opción de reintentar la carga.

---

### Requirement 12: Caché de catálogo de motivos de error

**User Story:** Como líder que configura motivos de error, quiero que el catálogo de motivos no se relea completo del Spreadsheet en cada visita a la pantalla de configuración ni en cada carga de "Pendientes", para reducir llamadas innecesarias a datos casi estáticos.

#### Acceptance Criteria

1. THE Motor_Datos SHALL cachear el catálogo de motivos de error en Cache_Servidor con un TTL de 600 segundos (10 minutos); cuando el caché no contenga el catálogo (cache-miss), THE Motor_Datos SHALL leer la hoja CATALOGO_MOTIVOS, almacenar el resultado en Cache_Servidor y retornar los datos obtenidos.
2. WHEN el líder guarda o elimina un motivo mediante las funciones de gestión del catálogo, THE Motor_Datos SHALL eliminar la clave del catálogo en Cache_Servidor de forma inmediata, de modo que la siguiente lectura realice un cache-miss y obtenga los datos actualizados desde la hoja CATALOGO_MOTIVOS.
3. WHEN la función `obtenerErroresPendientesComercial` se ejecuta y el catálogo existe en Cache_Servidor (cache-hit), THE Motor_Datos SHALL obtener el catálogo desde Cache_Servidor sin realizar ninguna llamada de lectura a la hoja CATALOGO_MOTIVOS.
4. IF Cache_Servidor no está disponible o retorna un error al intentar leer o escribir el catálogo, THEN THE Motor_Datos SHALL obtener el catálogo directamente desde la hoja CATALOGO_MOTIVOS y continuar la operación sin interrumpir el flujo del usuario.
