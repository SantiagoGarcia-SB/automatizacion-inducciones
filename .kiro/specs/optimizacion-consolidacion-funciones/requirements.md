# Requirements Document

## Introduction

Optimización y consolidación de funciones del proyecto "automatizacion-inducciones" (Google Apps Script). El objetivo es reducir la latencia, eliminar redundancias entre archivos, consolidar funciones que realizan operaciones similares, y lograr una arquitectura más rápida y robusta. El análisis del código reveló patrones de lectura repetida a las mismas hojas de cálculo desde múltiples archivos, funciones duplicadas de utilidades, y oportunidades de batching de operaciones que actualmente se ejecutan de forma individual.

## Glossary

- **Motor_De_Auditoría**: Función principal en Codigo.js que procesa la radicación de inducciones, valida datos y escribe en Control_General.
- **Repositorio**: Módulo de acceso a datos (Repositorios_*.js) que encapsula lecturas y escrituras a hojas de cálculo específicas.
- **CacheWrapper**: Capa de caché fragmentada sobre CacheService de Google Apps Script, usada para almacenar datos serializados que excedan el límite de 100KB por clave.
- **Control_General**: Hoja maestra del libro de control que almacena todas las solicitudes de inducciones con 62+ columnas.
- **Registro_Analisis**: Hoja del libro de análisis que almacena los datos de evaluación de cada solicitud con 100+ columnas.
- **COLA_ANALISIS**: Pestaña del libro de control que sirve como cola de asignación rápida para analistas.
- **Llamada_Sheets**: Invocación a la API de Google Sheets (getValues, setValues, openById, etc.) que consume cuota y agrega latencia de red (~200-800ms por llamada).
- **Lectura_Batch**: Patrón de leer un rango amplio de datos en una sola llamada a Sheets en vez de múltiples llamadas individuales.
- **SpreadsheetApp**: Servicio de Google Apps Script para acceder a hojas de cálculo.
- **Consolidación**: Proceso de unificar funciones separadas que hacen operaciones similares o complementarias en una sola función optimizada.
- **Latencia_Percibida**: Tiempo total que experimenta el usuario desde que inicia una acción hasta que recibe respuesta visual.

## Requirements

### Requirement 1: Consolidar apertura repetida de libros de cálculo

**User Story:** Como desarrollador del sistema, quiero que cada libro de cálculo se abra una sola vez por ejecución del script, para que se reduzcan las llamadas redundantes a SpreadsheetApp.openById() que agregan latencia innecesaria.

#### Acceptance Criteria

1. THE Motor_De_Auditoría SHALL abrir el libro de control (ID_HOJA_CONTROL) como máximo una vez por ejecución de script (una invocación de función vía google.script.run o trigger), invocando SpreadsheetApp.openById(ID_HOJA_CONTROL) exactamente una vez y almacenando la instancia en el registro centralizado.
2. WHEN un Repositorio necesita acceder al libro de control, THE Repositorio SHALL obtener la instancia desde el registro centralizado en vez de invocar SpreadsheetApp.openById(), resultando en 0 llamadas adicionales a openById para ese ID durante la misma ejecución.
3. WHEN un Repositorio necesita acceder al libro de análisis (ID_ARCHIVO_ANALISIS), THE Repositorio SHALL obtener la instancia desde el registro centralizado en vez de invocar SpreadsheetApp.openById(), resultando en 0 llamadas adicionales a openById para ese ID durante la misma ejecución.
4. THE Sistema SHALL proveer un registro centralizado de instancias de Spreadsheet abiertas implementado como variable global de ejecución (accesible desde cualquier archivo .js del proyecto) que almacene como máximo 2 instancias (ID_HOJA_CONTROL e ID_ARCHIVO_ANALISIS) y permita obtener una instancia por su ID sin abrir el libro de nuevo.
5. WHEN la ejecución del script finaliza, THE Sistema SHALL depender del aislamiento natural del runtime de Google Apps Script (cada ejecución es un isolate V8 independiente) para liberar las referencias, sin requerir reset manual del registro.
6. IF SpreadsheetApp.openById() lanza una excepción al intentar abrir un libro (por ID inválido o permisos insuficientes), THEN THE Sistema SHALL propagar la excepción al caller sin almacenar un valor nulo en el registro, permitiendo que el módulo invocante maneje el error según su propia lógica.

### Requirement 2: Consolidar funciones de lectura de usuarios y jerarquía

**User Story:** Como desarrollador del sistema, quiero unificar las funciones dispersas que leen la pestaña USUARIOS y resuelven la jerarquía, para que no haya múltiples lecturas redundantes de la misma hoja en una sola petición del usuario.

#### Acceptance Criteria

1. WHEN el frontend solicita datos del usuario actual (api_obtenerUsuarioActual), THE Sistema SHALL retornar usuario, rol, jerarquía (emailDirector, emailGerente) y emails del equipo visible en una sola lectura de la pestaña USUARIOS, sin invocar SpreadsheetApp.openById() ni getDataRange() más de una vez durante la resolución.
2. WHEN cualquier función invoca UsuariosRepo_leerTodos() durante una ejecución, THE Sistema SHALL almacenar el resultado en una variable global de ejecución y servir todas las invocaciones subsiguientes de UsuariosRepo_leerTodos() desde esa variable sin acceder a la hoja USUARIOS nuevamente.
3. WHEN múltiples funciones de Api.js invocan getEmailsEquipoVisible() y obtenerCorreosSuperiores() en la misma ejecución, THE Sistema SHALL servir ambas desde el caché en memoria de ejecución sin leer la hoja USUARIOS más de una vez.
4. THE Sistema SHALL consolidar obtenerCorreosLideres() (Codigo.js), obtenerCorreosLideres() (Servicios_AuthService.js), obtenerCorreosSuperiores() (Servicios_AuthService.js), y UsuariosRepo_getCorreosSuperiores() (Repositorios_UsuariosRepo.js) en una única función canónica que retorne los emails de usuarios activos con rol DIRECTOR, GERENTE o ADMIN, eliminando las funciones duplicadas y actualizando todas las referencias existentes.
5. IF la pestaña USUARIOS no se encuentra o no contiene datos (menos de 2 filas), THEN THE Sistema SHALL retornar un arreglo vacío desde la función canónica y registrar el evento en el log del sistema sin lanzar excepción.
6. WHEN la ejecución del script finaliza, THE Sistema SHALL liberar la variable global de caché de usuarios (reset a null) para evitar datos obsoletos entre ejecuciones independientes.

### Requirement 3: Consolidar funciones de notificaciones por correo

**User Story:** Como desarrollador del sistema, quiero consolidar las funciones de envío de correo (paz y salvo, recordatorios, error en terceros) que repiten la lógica de obtener emails de comerciales desde Hoja_Control, para que se reduzca la duplicación de código y las lecturas repetidas.

#### Acceptance Criteria

1. THE Sistema SHALL proveer una función única de resolución de email de comercial por ID de lote (consultando el mapa Hoja_Control columna F → columna B) que todas las funciones de notificación (enviarCorreoPazYSalvo, enviarRecordatoriosPazYSalvoDiario, enviarRecordatoriosErrorTercerosDiario) reutilicen en vez de construir cada una su propio mapa.
2. WHEN se ejecuta el trigger diario de recordatorios a las 8:00am, THE Sistema SHALL invocar una única función orquestadora que lea Hoja_Control y Control_General una sola vez y procese secuencialmente los recordatorios de paz y salvo y los de error en terceros sobre los mismos datos en memoria, en vez de ejecutar dos funciones independientes que repiten las mismas lecturas.
3. THE Sistema SHALL consolidar la lógica duplicada de escalamiento progresivo en una función reutilizable que reciba la cantidad de días transcurridos y retorne el nivel de escalamiento (recordatorio, elevado, urgente, crítico), el indicador de asunto, y el mensaje adicional correspondiente al umbral alcanzado (3, 7, 14 o 21 días).
4. WHEN se envían recordatorios en lote, THE Sistema SHALL verificar la cuota de email una sola vez al inicio del proceso con la cantidad total de correos a enviar (suma de lotes paz y salvo + lotes error en terceros), y abortar el envío completo registrando un evento WARN si la cuota restante (MailApp.getRemainingDailyQuota()) es menor a la cantidad total requerida.
5. IF la función de resolución de email por ID de lote no encuentra el ID en Hoja_Control o el email encontrado no contiene "@", THEN THE Sistema SHALL omitir ese lote del envío y registrar un evento WARN con el ID de lote afectado, sin interrumpir el procesamiento de los lotes restantes.

### Requirement 4: Eliminar lecturas redundantes en funciones de reporte

**User Story:** Como desarrollador del sistema, quiero que las funciones de reporte (_recolectarMetricasGestion_, contarRadicacionesPorResultadoEnRango) no abran el mismo libro de cálculo múltiples veces, para que el reporte se genere más rápido.

#### Acceptance Criteria

1. WHEN _recolectarMetricasGestion_() necesita leer Control_General y Hoja_Control, THE Sistema SHALL abrir el libro de control (ID_HOJA_CONTROL) una sola vez mediante SpreadsheetApp.openById() y obtener ambas hojas de la misma instancia, resultando en exactamente 1 llamada openById para el libro de control durante toda la ejecución de la función.
2. WHEN _recolectarMetricasGestion_() necesita leer registro analisis y Historico_Envios, THE Sistema SHALL abrir el libro de análisis (ID_ARCHIVO_ANALISIS) una sola vez mediante SpreadsheetApp.openById() y obtener ambas hojas de la misma instancia, resultando en exactamente 1 llamada openById para el libro de análisis durante toda la ejecución de la función.
3. THE Sistema SHALL consolidar la lógica de _recolectarResultadosEnviadosHoy_() dentro de _recolectarMetricasGestion_() reutilizando la instancia del libro de análisis ya abierta, eliminando la segunda llamada a SpreadsheetApp.openById(ID_ARCHIVO_ANALISIS) y produciendo un resultado idéntico en estructura y valores al que actualmente retorna _recolectarMetricasGestion_().
4. IF la hoja Historico_Envios no existe en el libro de análisis, THEN THE Sistema SHALL retornar el campo resultadosEnviadosHoy con valores en cero (lotes: 0, solicitudesAprobadas: 0, solicitudesNegadas: 0, porResultado: {}) sin interrumpir la recolección de las demás métricas.
5. WHEN el proceso de reporte de cierre de mes invoca contarRadicacionesPorResultadoEnRango() para múltiples comerciales dentro de la misma ejecución, THE Sistema SHALL leer Hoja_Control una sola vez y filtrar en memoria por cada comercial, en vez de abrir y leer la hoja por cada llamada individual, aceptando los datos pre-cargados como parámetro o consumiéndolos de una variable compartida en la misma ejecución.

### Requirement 5: Optimizar escrituras batch en Control_General

**User Story:** Como desarrollador del sistema, quiero que las operaciones de escritura en Control_General y en registro analisis se agrupen en la menor cantidad posible de llamadas setValues(), para que se reduzca la latencia de escritura.

#### Acceptance Criteria

1. WHEN guardarEvaluacionAnalista() necesita escribir múltiples campos en una fila de registro analisis, THE Sistema SHALL agrupar todas las columnas contiguas en un solo setValues() por bloque contiguo, ejecutando como máximo N llamadas setValues() donde N es el número de bloques disjuntos de columnas (máximo 6 bloques para los campos permitidos actuales: inquilino + hasta 5 COAs + campos de finalización).
2. WHEN marcarErrorEnTerceros() necesita cambiar estado y registrar detalles, THE Sistema SHALL usar máximo 2 llamadas de escritura a Sheets (una setValues() para la columna de estado en Control_General y una setValues() para las filas nuevas en Errores_Terceros), excluyendo las operaciones de lectura necesarias para la notificación.
3. WHEN enviarRecordatoriosPazYSalvoDiario() actualiza la fecha de aviso (columna BI) en múltiples filas del mismo lote, THE Sistema SHALL agrupar las escrituras en un solo setValues() por lote (construyendo un rango que cubra las filas del lote) en vez de ejecutar un setValue() individual por cada fila.
4. IF las filas de un lote en enviarRecordatoriosPazYSalvoDiario() no son contiguas en Control_General, THEN THE Sistema SHALL agrupar las filas contiguas en bloques y ejecutar un setValues() por cada bloque contiguo (máximo 1 llamada de escritura por bloque de filas consecutivas del lote).
5. THE Sistema SHALL documentar el conteo de Llamadas_Sheets (lectura y escritura) de cada función expuesta en Api.js como comentario JSDoc en la cabecera de la función, con el formato: `@sheets_read N` y `@sheets_write M` donde N y M son enteros que representan el número máximo de llamadas en el caso nominal (sin contar reintentos por error).

### Requirement 6: Consolidar funciones de resolución de nombre de comercial

**User Story:** Como desarrollador del sistema, quiero unificar las múltiples funciones que convierten un email a un nombre de comercial (obtenerNombreDeComercial, obtenerNombreCompletoDeComercial, _correoANombre, _correoANombreCompleto, _derivarNombreDeEmail, _nombreComercialParaBusqueda), para que haya una sola fuente de verdad y se elimine código duplicado.

#### Acceptance Criteria

1. THE Sistema SHALL proveer una única función canónica de conversión email-a-nombre que acepte un parámetro de formato con tres valores posibles: nombre completo capitalizado (cada palabra con inicial mayúscula, e.g., "Maria Garcia"), nombre completo en mayúsculas (e.g., "MARIA GARCIA"), y solo primer nombre capitalizado (e.g., "Maria").
2. WHEN cualquier módulo necesite convertir un email a nombre, THE Sistema SHALL invocar la función canónica con el parámetro de formato correspondiente en vez de usar funciones separadas con lógica duplicada.
3. THE Sistema SHALL eliminar las funciones redundantes (obtenerNombreDeComercial, obtenerNombreCompletoDeComercial, _correoANombre, _correoANombreCompleto, _derivarNombreDeEmail, _nombreComercialParaBusqueda) y actualizar todas las referencias en el proyecto para que invoquen la función canónica.
4. IF la función canónica recibe un email vacío, nulo, no string, o sin carácter "@", THEN THE Sistema SHALL retornar una cadena vacía sin lanzar excepción.
5. THE Sistema SHALL derivar el nombre a partir de la parte local del email (antes de @) separando por punto, descartando segmentos vacíos tras trim, y capitalizando cada segmento según el formato solicitado.

### Requirement 7: Optimizar carga inicial del frontend (doGet)

**User Story:** Como usuario del aplicativo, quiero que la página cargue en el menor tiempo posible, para que la experiencia sea inmediata y sin esperas perceptibles.

#### Acceptance Criteria

1. WHEN doGet() construye los datos iniciales para el template, THE Sistema SHALL obtener resumen y lotes exclusivamente desde CacheWrapper_getJSON (sin invocar funciones que lean de Sheets para estos datos), de modo que la respuesta HTML se entregue en menos de 2 segundos cuando el usuario ya está cacheado en CacheService.
2. WHEN doGet() necesita resolver la identidad del usuario, THE Sistema SHALL usar obtenerUsuarioActual_v2() que consulta CacheService primero (TTL 120 segundos) y solo recurre a Sheets en cache-miss de usuario; esta es la única lectura a Sheets permitida en doGet().
3. WHEN el frontend detecta que datosIniciales.resumen es null o datosIniciales.lotes es null (cache-miss parcial o total), THE Sistema SHALL mostrar un skeleton de carga en la sección afectada mientras solicita los datos vía google.script.run, manteniendo la navegación entre secciones y los controles de la interfaz funcionales durante la carga.
4. THE Sistema SHALL pre-calentar el caché de resumen y lotes mediante un trigger periódico cada 5 minutos en horario laboral (lunes a viernes de 7:00 a 18:00 hora Colombia, GMT-5) con un TTL de 600 segundos por entrada, para que al menos el 90% de las solicitudes doGet() en horario laboral encuentren cache-hit de resumen y lotes.
5. IF CacheWrapper_getJSON falla o lanza excepción durante doGet(), THEN THE Sistema SHALL asignar null a resumen y lotes en datosIniciales (delegando la carga al frontend vía google.script.run) sin interrumpir la entrega del HTML ni mostrar error al usuario.

### Requirement 8: Eliminar código muerto y funciones obsoletas

**User Story:** Como desarrollador del sistema, quiero remover funciones que ya no se usan o que fueron reemplazadas por versiones nuevas, para que el bundle sea más pequeño y el código sea más mantenible.

#### Acceptance Criteria

1. THE Sistema SHALL eliminar la función probarValidacionDestinoIA() de IADestino.js, dejando intactas las funciones de negocio del mismo archivo (validarDestinosConIA_, _llamarVertexDestinos_, _construirPromptDestinos_, _obtenerServicioVertex_).
2. THE Sistema SHALL mover las funciones probarReporteGestion() y probarReporteGestionConFecha() a un archivo separado (TestUtils.js) que esté listado en .claspignore, preservando su capacidad de invocar _recolectarMetricasGestion_ y _construirCorreoReporteGestion_ cuando se ejecuten manualmente desde el editor de Apps Script en ambiente de desarrollo.
3. IF una función existe únicamente como alias de transición (delega completamente a otra función sin lógica propia) Y ningún trigger de ScriptApp ni referencia directa en archivos desplegados (.js no excluidos por .claspignore) la invoca, THEN THE Sistema SHALL eliminar el alias y actualizar cualquier referencia restante para que apunte a la función canónica.
4. THE Sistema SHALL mover a TestUtils.js (incluido en .claspignore) todas las funciones que cumplan al menos uno de estos criterios observables: (a) su nombre comienza con "probar", (b) su JSDoc indica explícitamente "diagnóstico manual" o "no forma parte del flujo de negocio", o (c) solo se invocan desde el desplegable "Ejecutar" del editor y no son llamadas por ningún trigger ni por otra función del proyecto.
5. IF al verificar las referencias de un alias de transición se encuentra que algún archivo desplegado aún lo invoca (como obtenerCorreosLideres en Setup_CrearPestanas.js), THEN THE Sistema SHALL primero reemplazar esa referencia por la función canónica (obtenerCorreosSuperiores) antes de eliminar el alias.

### Requirement 9: Consolidar lógica de verificación de roles y sesión

**User Story:** Como desarrollador del sistema, quiero que la verificación de rol y sesión se haga una sola vez por request del frontend, para que no haya llamadas redundantes a Session.getActiveUser() y UsuariosRepo_buscarPorEmail() en cadena.

#### Acceptance Criteria

1. WHEN una función de Api.js invoca verificarRol() y luego getEmailsEquipoVisible(), THE Sistema SHALL resolver el equipo visible usando el objeto de usuario (email y rol) ya retornado por verificarRol(), sin invocar _obtenerUsuarioPorEmail() ni UsuariosRepo_buscarPorEmail() una segunda vez dentro de la misma ejecución.
2. THE Sistema SHALL invocar Session.getActiveUser().getEmail() como máximo 1 vez por ejecución de script, almacenando el resultado en una variable de ámbito de ejecución que todas las funciones de autenticación reutilicen.
3. WHEN verificarRol() resuelve un usuario completo, THE Sistema SHALL retornar un objeto con los campos email, rol, cupo, emailDirector y emailGerente para que el caller no necesite hacer búsquedas adicionales en la pestaña USUARIOS.
4. THE Sistema SHALL consolidar verificarRol() y obtenerUsuarioActual_v2() en un único punto de entrada de autenticación que resuelva toda la información del usuario (email, rol, cupo, emailDirector, emailGerente) en una sola lectura a la pestaña USUARIOS o a CacheService.
5. IF getEmailsEquipoVisible() se invoca sin que verificarRol() haya resuelto previamente un usuario en la misma ejecución, THEN THE Sistema SHALL resolver el usuario mediante _obtenerUsuarioPorEmail() como fallback, sin lanzar excepción.

### Requirement 10: Reducir llamadas redundantes a TextFinder

**User Story:** Como desarrollador del sistema, quiero reemplazar los usos de TextFinder (que hace búsqueda secuencial por toda la hoja) con búsquedas en memoria sobre datos ya cargados, para que se reduzca la latencia en operaciones de escritura.

#### Acceptance Criteria

1. WHEN marcarSolicitudRadicada() necesita encontrar una fila por UUID en Control_General, THE Sistema SHALL buscar el UUID en un índice en memoria (mapa UUID → número de fila) construido a partir de la columna BJ de los datos ya leídos en la ejecución actual, en vez de crear un TextFinder que escanea toda la hoja.
2. WHEN marcarErrorEnTerceros() busca una fila por UUID, THE Sistema SHALL recibir el número de fila como parámetro (ya conocido por el caller desde obtenerColaAuxiliar) en vez de buscar de nuevo con TextFinder.
3. WHEN obtenerDetalleLote() busca filas por ID de lote, THE Sistema SHALL usar un índice en memoria (mapa idLote → [números de fila]) construido a partir de la columna A de Control_General con una sola lectura batch de las columnas necesarias (máximo 62 columnas), reutilizando datos ya cargados en la misma ejecución si obtenerLotesDeComercial() los leyó previamente.
4. IF el número de fila pasado como parámetro no corresponde al UUID esperado (por edición concurrente), THEN THE Sistema SHALL abortar la operación de escritura sin modificar datos y retornar un objeto de error con ok=false y un mensaje indicando que la solicitud cambió de posición y el caller debe recargar la cola.
5. WHEN guardarCorreccionComercial() necesita localizar la fila de una solicitud por UUID en Control_General para obtener datos de notificación, THE Sistema SHALL usar el índice en memoria (mapa UUID → número de fila) o recibir el número de fila como parámetro del caller, en vez de buscar con TextFinder.

### Requirement 11: Consolidar funciones de sincronización de estados

**User Story:** Como desarrollador del sistema, quiero que los procesos de sincronización entre Control_General y registro analisis se ejecuten de forma unificada, para que no haya dos triggers separados leyendo y escribiendo los mismos datos.

#### Acceptance Criteria

1. WHEN el trigger periódico de sincronización se dispara (cada 10 minutos), THE Sistema SHALL ejecutar una única función unificada que realice ambas operaciones: copiar registros RADICADO/ERROR EN TERCEROS de Control_General a registro analisis (lógica actual de sincronizarLoteAutomatico) y actualizar estados en Control_General desde registro analisis (lógica actual de sincronizarEstadoDesdeAnalisis).
2. THE Sistema SHALL leer registro analisis y Control_General una sola vez cada una dentro de la función de sincronización unificada, procesando todas las actualizaciones pendientes en memoria antes de escribir en batch.
3. WHEN la función unificada de sincronización detecta que el estado de un registro en Control_General difiere del valor leído al inicio de la ejecución al momento de escribir (es decir, otro proceso modificó la columna "Estado" entre la lectura batch y la escritura), THE Sistema SHALL omitir la escritura de ese registro específico y registrar el conflicto en Logs_Sistema indicando el UUID del registro, el estado esperado y el estado encontrado, sin abortar el procesamiento de los registros restantes.
4. THE Sistema SHALL usar LockService.getScriptLock().tryLock() con un timeout máximo de 30 segundos para garantizar que la sincronización unificada no se ejecute en paralelo con procesarDatosMejorado() (Cumplimiento.js), que también escribe en registro analisis.
5. IF la función unificada no obtiene el lock dentro de los 30 segundos, THEN THE Sistema SHALL abortar la ejecución registrando el evento en Logs_Sistema y permitir que el siguiente trigger (10 minutos después) reintente la sincronización.
6. THE Sistema SHALL reemplazar los dos triggers separados (sincronizarLoteAutomatico y sincronizarEstadoDesdeAnalisis) por un único trigger time-driven que invoque la función unificada, eliminando la posibilidad de que ambas funciones corran en paralelo sobre los mismos datos.

### Requirement 12: Optimizar la carga de métricas operativas de lotes

**User Story:** Como usuario líder o administrador, quiero que la vista de métricas operativas cargue rápido incluso con rangos de fecha amplios, para que pueda consultar datos históricos sin esperas prolongadas.

#### Acceptance Criteria

1. WHEN api_obtenerMetricasLotes() recibe un rango de fechas válido (formato YYYY-MM-DD, rango máximo 183 días), THE Sistema SHALL intentar leer el resultado desde CacheWrapper con la clave `METRICAS_LOTES_{fechaDesde}_{fechaHasta}` y retornarlo si existe (cache-hit), evitando toda lectura a Sheets.
2. IF el cache-hit no existe para el rango solicitado, THEN THE Sistema SHALL calcular las métricas desde Sheets y almacenar el resultado en CacheWrapper con TTL de 120 segundos, siempre que el payload serializado no exceda 512 KB.
3. WHEN api_obtenerMetricasLotesHistorico() calcula tendencias de los últimos N meses (1-12), THE Sistema SHALL leer los datos de la hoja "registro analisis" una sola vez y filtrar por cada mes en memoria, en vez de hacer N lecturas independientes a Sheets.
4. THE Sistema SHALL garantizar que api_obtenerMetricasLotes y api_obtenerMetricasLotesHistorico no adquieran LockService ni compartan dependencias de escritura en el backend, permitiendo que el frontend las ejecute en paralelo sin serialización.
5. WHEN _obtenerEstadosOperativosEnProceso() lee Control_General para un rango de fechas que excede 90 días, THE Sistema SHALL usar getRange() limitado a las columnas necesarias para el cálculo (columna J: Estado y columna BJ: UUID_SISTEMA, máximo 17 columnas) en vez de leer las 62 columnas completas.
6. IF CacheService no está disponible o lanza excepción durante lectura o escritura de caché, THEN THE Sistema SHALL continuar el cálculo desde Sheets sin interrumpir la operación (degradación elegante) y retornar el resultado calculado al usuario.
