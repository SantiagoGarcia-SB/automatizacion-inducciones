# Implementation Plan: Optimización y Consolidación de Funciones

## Overview

Refactorización del proyecto automatizacion-inducciones (Google Apps Script) para reducir latencia, eliminar redundancias y consolidar funciones. Se implementa una capa de infraestructura (SpreadsheetRegistry, MemoCache, BatchWriter), se consolidan servicios de autenticación y notificaciones, se optimizan escrituras batch, y se elimina código muerto. El objetivo es una reducción del 40-60% en llamadas a Sheets por request.

## Tasks

- [x] 1. Implementar capa de infraestructura
  - [x] 1.1 Crear SpreadsheetRegistry — registro centralizado de instancias
    - Crear archivo `Infraestructura_Registry.js`
    - Implementar variable global `_spreadsheetRegistry = {}`
    - Implementar `SpreadsheetRegistry_get(spreadsheetId)` que abre el libro solo si no está en el registro
    - Implementar `SpreadsheetRegistry_has(spreadsheetId)` para verificar si ya fue abierto
    - Propagar excepción de `openById()` sin almacenar null en el registro
    - Agregar JSDoc con `@sheets_read 0-1`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Crear MemoCache — memoización de variables de ejecución
    - Crear archivo `Infraestructura_MemoCache.js`
    - Implementar variables globales: `_sessionEmail`, `_cacheUsuariosTodos`, `_indiceUuidFila`, `_indiceLoteFila`
    - Implementar `MemoCache_getSessionEmail()` con memoización de `Session.getActiveUser().getEmail()`
    - Implementar `MemoCache_getUsuarios()` que lee USUARIOS una sola vez por ejecución
    - Implementar `MemoCache_getIndiceUuid(datosControlGeneral)` que construye mapa UUID → filaNum
    - Implementar `MemoCache_getIndiceLote(datosControlGeneral)` que construye mapa idLote → [filaNum]
    - _Requirements: 2.2, 2.3, 9.2, 10.1, 10.3_

  - [x] 1.3 Crear BatchWriter — utilidad de escrituras agrupadas
    - Crear archivo `Infraestructura_BatchWriter.js`
    - Implementar `BatchWriter_agruparFilasContiguas(filas)` que agrupa números de fila en bloques contiguos `{inicio, cantidad}`
    - Implementar `BatchWriter_escribir(hoja, operaciones)` que agrupa `{fila, columna, valor}` en bloques contiguos y ejecuta un `setValues()` por bloque
    - Agregar JSDoc con conteo de llamadas Sheets
    - _Requirements: 5.1, 5.3, 5.4_

  - [ ]* 1.4 Write property test for SpreadsheetRegistry singleton
    - **Property 1: SpreadsheetRegistry abre cada ID una sola vez por ejecución**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 4.1, 4.2**

  - [ ]* 1.5 Write property test for MemoCache memoización
    - **Property 2: UsuariosRepo memoización (lectura única por ejecución)**
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 1.6 Write property test for índice en memoria UUID/Lote
    - **Property 4: Índice en memoria produce mapeo correcto UUID/LoteId → fila**
    - **Validates: Requirements 10.1, 10.3, 10.5**

  - [ ]* 1.7 Write property test for BatchWriter bloques contiguos
    - **Property 5: Agrupación en bloques contiguos produce el mínimo de escrituras**
    - **Validates: Requirements 5.1, 5.3, 5.4**

- [x] 2. Consolidar funciones de utilidad
  - [x] 2.1 Implementar función canónica emailANombre
    - Crear archivo `Utilidades_Nombres.js`
    - Implementar `emailANombre(email, formato)` con formatos: COMPLETO, MAYUSCULAS, PRIMER_NOMBRE
    - Derivar nombre de la parte local del email separando por punto
    - Retornar cadena vacía para inputs inválidos (null, vacío, sin @)
    - _Requirements: 6.1, 6.4, 6.5_

  - [x] 2.2 Reemplazar funciones redundantes de nombre por función canónica
    - Eliminar `_correoANombre`, `_correoANombreCompleto`, `obtenerNombreDeComercial`, `obtenerNombreCompletoDeComercial`, `_derivarNombreDeEmail`, `_nombreComercialParaBusqueda`
    - Actualizar todas las referencias en el proyecto para invocar `emailANombre(email, formato)`
    - _Requirements: 6.2, 6.3_

  - [ ]* 2.3 Write property test for emailANombre canónico
    - **Property 6: Conversión email-a-nombre canónica**
    - **Validates: Requirements 6.1, 6.4, 6.5**

  - [x] 2.4 Implementar función canónica de escalamiento progresivo
    - Implementar `calcularEscalamiento(diasTranscurridos)` en `Notificaciones.js`
    - Retornar `{nivel, emoji, mensajeExtra}` según umbrales: recordatorio (3-6), elevado (7-13), urgente (14-20), crítico (21+)
    - _Requirements: 3.3_

  - [ ]* 2.5 Write property test for escalamiento determinista
    - **Property 7: Escalamiento progresivo determinista**
    - **Validates: Requirements 3.3**

- [x] 3. Checkpoint - Verificar infraestructura base
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Consolidar autenticación y sesión
  - [x] 4.1 Implementar AuthService consolidado — resolverSesion()
    - Refactorizar en `Servicios_AuthService.js` (o crear si no existe)
    - Implementar `resolverSesion()` como punto único de entrada: CacheService → Sheets como fallback
    - Usar `MemoCache_getSessionEmail()` para obtener email una sola vez
    - Usar `MemoCache_getUsuarios()` para buscar usuario sin lecturas adicionales
    - Retornar `{autorizado, email, rol, cupo, emailDirector, emailGerente}`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 4.2 Implementar verificarRol() reutilizando sesión resuelta
    - Implementar `verificarRol(rolesPermitidos)` que reutiliza resultado de `resolverSesion()`
    - Retornar objeto completo con email, rol, cupo, emailDirector, emailGerente
    - Lanzar excepción NO_AUTORIZADO o SIN_PERMISOS según corresponda
    - _Requirements: 9.1, 9.3_

  - [x] 4.3 Implementar getEmailsEquipoVisible() con fallback
    - Implementar `getEmailsEquipoVisible(email)` que reutiliza usuario ya resuelto por verificarRol
    - Si verificarRol no fue llamado, resolver vía `_obtenerUsuarioPorEmail()` como fallback
    - Retornar null para ADMIN/ASESOR (acceso total)
    - _Requirements: 9.1, 9.5_

  - [x] 4.4 Consolidar obtenerCorreosSuperiores en función canónica única
    - Implementar `obtenerCorreosSuperiores()` usando `MemoCache_getUsuarios()`
    - Filtrar usuarios activos con rol DIRECTOR, GERENTE o ADMIN
    - Eliminar funciones duplicadas: `obtenerCorreosLideres` (Codigo.js), `obtenerCorreosLideres` (AuthService), `obtenerCorreosSuperiores` (AuthService anterior), `UsuariosRepo_getCorreosSuperiores`
    - Actualizar todas las referencias
    - _Requirements: 2.4_

  - [ ]* 4.5 Write property test for sesión resuelta una sola vez
    - **Property 3: Sesión resuelta una sola vez por ejecución**
    - **Validates: Requirements 9.1, 9.2**

  - [ ]* 4.6 Write property test for filtro correos superiores
    - **Property 10: Filtro canónico de correos superiores**
    - **Validates: Requirements 2.4**

- [x] 5. Consolidar notificaciones y sincronización
  - [x] 5.1 Implementar orquestador de notificaciones diarias
    - Refactorizar `Notificaciones.js`
    - Implementar `ejecutarRecordatoriosDiarios()` que lee Hoja_Control y Control_General una sola vez
    - Procesar secuencialmente recordatorios de paz y salvo y de error en terceros sobre los mismos datos en memoria
    - Verificar cuota de email al inicio con `MailApp.getRemainingDailyQuota()`
    - Abortar envío completo si cuota insuficiente, registrando evento WARN
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

  - [x] 5.2 Implementar resolverEmailPorLote con mapa pre-cargado
    - Implementar `resolverEmailPorLote(mapaLoteEmail, idLote)` en Notificaciones.js
    - Omitir lote si no se encuentra ID o email no contiene "@"
    - Registrar evento WARN con el ID de lote afectado
    - _Requirements: 3.1, 3.5_

  - [x] 5.3 Implementar escrituras batch en recordatorios
    - Usar `BatchWriter_escribir()` para agrupar actualizaciones de fecha de aviso (columna BI)
    - Un `setValues()` por bloque contiguo de filas del mismo lote
    - _Requirements: 5.3, 5.4_

  - [x] 5.4 Implementar sincronización unificada
    - Crear o refactorizar en archivo apropiado
    - Implementar `sincronizarUnificado()` que combina lógica de `sincronizarLoteAutomatico` y `sincronizarEstadoDesdeAnalisis`
    - Leer registro_analisis y Control_General una sola vez cada una
    - Usar `LockService.getScriptLock().tryLock(30000)` para evitar conflicto con `procesarDatosMejorado()`
    - Detectar conflictos de estado concurrente: omitir registro, registrar en Logs_Sistema
    - Abortar con WARN si lock no adquirido en 30s
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 5.5 Write property test for detección de conflicto concurrente
    - **Property 9: Detección de conflicto concurrente en sincronización**
    - **Validates: Requirements 11.3**

- [x] 6. Checkpoint - Verificar servicios consolidados
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Optimizar reportes y métricas
  - [x] 7.1 Refactorizar _recolectarMetricasGestion_ para una sola apertura por libro
    - Usar `SpreadsheetRegistry_get()` para abrir cada libro una sola vez
    - Obtener Control_General y Hoja_Control de la misma instancia
    - Obtener registro_analisis y Historico_Envios de la misma instancia
    - Consolidar `_recolectarResultadosEnviadosHoy_()` dentro del flujo reutilizando instancia ya abierta
    - Si Historico_Envios no existe, retornar valores en cero sin interrumpir
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 7.2 Optimizar contarRadicacionesPorResultadoEnRango para lectura única
    - Modificar para aceptar datos pre-cargados como parámetro o consumirlos de variable compartida
    - Leer Hoja_Control una sola vez y filtrar en memoria por cada comercial
    - _Requirements: 4.5_

  - [x] 7.3 Implementar api_obtenerMetricasLotes con cache-first
    - Implementar estrategia cache-first con clave `METRICAS_LOTES_{fechaDesde}_{fechaHasta}`
    - Cache-hit: retornar sin leer Sheets
    - Cache-miss: calcular desde Sheets, almacenar con TTL 120s si payload < 512KB
    - Degradación elegante si CacheService falla
    - _Requirements: 12.1, 12.2, 12.6_

  - [x] 7.4 Implementar api_obtenerMetricasLotesHistorico con lectura única
    - Leer registro_analisis una sola vez y filtrar por cada mes en memoria
    - No adquirir LockService ni compartir dependencias de escritura
    - Usar getRange limitado a columnas necesarias para rangos > 90 días
    - _Requirements: 12.3, 12.4, 12.5_

  - [ ]* 7.5 Write property test for métricas cache-first
    - **Property 8: Métricas cache-first (hit retorna cache, miss calcula y almacena)**
    - **Validates: Requirements 12.1, 12.2**

- [x] 8. Reemplazar TextFinder por búsquedas en memoria
  - [x] 8.1 Refactorizar marcarSolicitudRadicada() para usar índice UUID en memoria
    - Usar `MemoCache_getIndiceUuid()` en vez de TextFinder
    - Buscar UUID en mapa UUID → número de fila
    - Verificar que la fila corresponde al UUID esperado antes de escribir
    - Retornar `{ok: false}` si fila no corresponde (edición concurrente)
    - _Requirements: 10.1, 10.4_

  - [x] 8.2 Refactorizar marcarErrorEnTerceros() para recibir fila como parámetro
    - Modificar firma para recibir número de fila del caller (ya conocido desde obtenerColaAuxiliar)
    - Eliminar uso de TextFinder
    - Usar máximo 2 llamadas de escritura a Sheets
    - _Requirements: 10.2, 5.2_

  - [x] 8.3 Refactorizar obtenerDetalleLote() para usar índice loteId en memoria
    - Usar `MemoCache_getIndiceLote()` en vez de TextFinder
    - Reutilizar datos ya cargados si `obtenerLotesDeComercial()` los leyó previamente
    - _Requirements: 10.3_

  - [x] 8.4 Refactorizar guardarCorreccionComercial() para usar índice UUID
    - Usar `MemoCache_getIndiceUuid()` o recibir número de fila como parámetro
    - Eliminar uso de TextFinder
    - _Requirements: 10.5_

- [x] 9. Optimizar carga inicial del frontend (doGet)
  - [x] 9.1 Refactorizar doGet() para cache-first
    - Obtener resumen y lotes exclusivamente desde `CacheWrapper_getJSON`
    - Usar `obtenerUsuarioActual_v2()` que consulta CacheService primero (TTL 120s)
    - Asignar null a resumen y lotes si CacheWrapper falla (sin interrumpir HTML)
    - Meta: respuesta HTML < 2 segundos en cache-hit
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 9.2 Implementar skeleton de carga en frontend
    - Modificar `IndexNuevo.html` para mostrar skeleton cuando `datosIniciales.resumen` o `datosIniciales.lotes` es null
    - Mantener navegación y controles funcionales durante la carga asíncrona
    - Solicitar datos vía `google.script.run` cuando hay cache-miss
    - _Requirements: 7.3_

  - [x] 9.3 Implementar trigger de pre-calentamiento de caché
    - Crear trigger periódico cada 5 minutos en horario laboral (L-V 7:00-18:00 GMT-5)
    - Pre-calentar caché de resumen y lotes con TTL 600s
    - _Requirements: 7.4_

- [x] 10. Eliminar código muerto y funciones obsoletas
  - [x] 10.1 Eliminar probarValidacionDestinoIA() de IADestino.js
    - Eliminar solo la función de prueba, preservando funciones de negocio
    - _Requirements: 8.1_

  - [x] 10.2 Crear TestUtils.js y mover funciones de prueba
    - Crear archivo `TestUtils.js`
    - Mover `probarReporteGestion()` y `probarReporteGestionConFecha()` preservando su funcionalidad
    - Mover funciones que cumplan: nombre comienza con "probar", JSDoc indica "diagnóstico manual", o solo se ejecutan desde el editor
    - Agregar `TestUtils.js` a `.claspignore`
    - _Requirements: 8.2, 8.4_

  - [x] 10.3 Eliminar alias de transición y actualizar referencias
    - Verificar que ningún archivo desplegado invoca los alias
    - Si algún archivo los invoca (ej: Setup_CrearPestanas.js), reemplazar referencia primero
    - Eliminar alias y funciones duplicadas
    - _Requirements: 8.3, 8.5_

- [x] 11. Integración y wiring final
  - [x] 11.1 Actualizar Repositorios para usar SpreadsheetRegistry
    - Modificar `Repositorios_ControlGeneralRepo.js` para usar `SpreadsheetRegistry_get()`
    - Modificar `Repositorios_AnalisisRepo.js` para usar `SpreadsheetRegistry_get()`
    - Modificar `Repositorios_UsuariosRepo.js` para usar `MemoCache_getUsuarios()`
    - Modificar `Repositorios_ColaAuxiliarRepo.js` para usar `SpreadsheetRegistry_get()`
    - _Requirements: 1.2, 1.3, 2.2_

  - [x] 11.2 Actualizar Api.js para usar AuthService consolidado
    - Reemplazar llamadas dispersas a verificación de rol por `verificarRol()` consolidado
    - Reutilizar objeto de sesión retornado en vez de hacer búsquedas adicionales
    - Agregar JSDoc `@sheets_read N` y `@sheets_write M` a cada función api_*
    - _Requirements: 9.1, 9.3, 5.5_

  - [x] 11.3 Reemplazar triggers de sincronización
    - Eliminar triggers separados de `sincronizarLoteAutomatico` y `sincronizarEstadoDesdeAnalisis`
    - Crear único trigger time-driven que invoque `sincronizarUnificado()` cada 10 minutos
    - _Requirements: 11.6_

  - [x] 11.4 Actualizar trigger de recordatorios diarios
    - Reemplazar los dos triggers de recordatorios por uno que invoque `ejecutarRecordatoriosDiarios()`
    - Configurar ejecución a las 8:00am
    - _Requirements: 3.2_

- [x] 12. Final checkpoint - Verificar integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- El proyecto usa Google Apps Script (JavaScript V8), Vitest para testing, y fast-check para property-based tests
- Las variables globales en Apps Script se comparten entre archivos .js del mismo proyecto dentro de una misma ejecución
- El aislamiento natural del runtime V8 limpia las variables globales entre ejecuciones independientes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1", "2.4"] },
    { "id": 1, "tasks": ["1.4", "1.5", "1.6", "1.7", "2.2", "2.3", "2.5"] },
    { "id": 2, "tasks": ["4.1", "4.4", "5.2"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.5", "4.6", "5.1"] },
    { "id": 4, "tasks": ["5.3", "5.4", "7.1", "7.2"] },
    { "id": 5, "tasks": ["5.5", "7.3", "7.4", "8.1", "8.2", "8.3", "8.4"] },
    { "id": 6, "tasks": ["7.5", "9.1", "9.2", "9.3"] },
    { "id": 7, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4"] }
  ]
}
```
