# Implementation Plan: Optimización de Latencia y UX

## Overview

Este plan implementa las 5 capas de optimización definidas en el diseño: infraestructura de testing, CacheServiceWrapper (servidor), repositorios optimizados, sistema de caché cliente (CacheManager + SkeletonSystem + OptimisticUpdater), y la integración end-to-end. Cada tarea construye sobre las anteriores de forma incremental.

## Tasks

- [x] 1. Configurar infraestructura de testing local
  - [x] 1.1 Crear estructura de directorios y configurar entorno de tests
    - Crear directorio `tests/` con subdirectorios `properties/`, `unit/`, `integration/`, `mocks/`, `properties/generators/`
    - Inicializar `package.json` con dependencias: `fast-check`, `vitest`
    - Crear `vitest.config.js` con configuración para el proyecto
    - _Requirements: Todas (infraestructura base para validar)_

  - [x] 1.2 Crear mocks de APIs de Google Apps Script
    - Crear `tests/mocks/spreadsheet-app.mock.js` — mock de `SpreadsheetApp`, `Sheet`, `Range` con `getRange()`, `getValues()`, `setValue()`, `setValues()`, `getLastRow()`, `getLastColumn()`, `createTextFinder()`
    - Crear `tests/mocks/cache-service.mock.js` — mock de `CacheService` con `get()`, `put()`, `remove()`, `getScriptCache()` y simulación de límite 100 KB
    - Crear `tests/mocks/lock-service.mock.js` — mock de `LockService` con `tryLock()`, `releaseLock()`
    - _Requirements: Todas (base para tests de integración)_

  - [x] 1.3 Crear generadores de datos para property-based testing
    - Crear `tests/properties/generators/dataset.gen.js` — generador de filas de Control_General con UUIDs, estados, fechas, arrendatarios (62 columnas)
    - Crear `tests/properties/generators/cache-state.gen.js` — generador de estados del CacheManager (store con múltiples keys, datos variados, timestamps)
    - Crear `tests/properties/generators/json-payload.gen.js` — generador de strings JSON de tamaño variable (1 KB a 600 KB)
    - _Requirements: Todas (generadores para PBT)_

- [x] 2. Implementar CacheServiceWrapper (servidor)
  - [x] 2.1 Crear `Servicios_CacheWrapper.js` con funciones `getJSON`, `putJSON`, `remove`
    - Implementar lógica de fragmentación para payloads > 99 KB: header con `_parts`, chunks con sufijo `_PART_01`, `_PART_02`, etc.
    - Implementar reconstrucción al leer: detectar header, leer N partes, concatenar y parsear
    - Límite: no cachear si > 500 KB, registrar WARN en `Logs_Sistema` via `_registrarEvento_`
    - Manejar edge cases: fragmento faltante → tratar como cache-miss, error en `CacheService.put()` → omitir y continuar
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 2.2 Escribir property test para fragmentación round-trip
    - **Property 8: Fragmentación de caché es un round-trip sin pérdida**
    - Generar strings JSON de 100-500 KB, fragmentar y reconstruir, verificar igualdad byte-a-byte
    - **Validates: Requirements 8.2**

  - [ ]* 2.3 Escribir property test para serialización round-trip
    - **Property 9: Serialización de caché servidor es round-trip**
    - Generar objetos arbitrarios (arrays, objetos anidados, strings con caracteres especiales), verificar que `JSON.parse(JSON.stringify(obj))` produce objeto deeply-equal
    - **Validates: Requirements 5.1, 12.1**

- [x] 3. Implementar caché de catálogo de motivos y headers
  - [x] 3.1 Integrar CacheServiceWrapper en la lectura de catálogo de motivos
    - Modificar `_leerCatalogoMotivos()` en `Api.js` para usar `CacheServiceWrapper.getJSON('CATALOGO_MOTIVOS')` con TTL de 600s
    - Modificar `_guardarMotivo()` y `_eliminarMotivo()` para invalidar la clave `CATALOGO_MOTIVOS` tras escritura
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 3.2 Unificar caché de headers con CacheServiceWrapper
    - Modificar `_headersRegistroAnalisis()` en `Repositorios_AnalistaRepo.js` para usar `CacheServiceWrapper.getJSON('HDR_REG_ANALISIS')` con TTL 300s
    - Asegurar que `obtenerDetalleSolicitud()` en `Repositorios_AnalisisRepo.js` también usa la misma clave
    - Manejar edge case: headers > 100 KB → omitir caché, leer directo
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 3.3 Escribir property test para invalidación de caché servidor
    - **Property 10: Escritura en caché servidor se invalida tras mutación**
    - Simular put → verificar exists → ejecutar remove → verificar null
    - **Validates: Requirements 12.2**

- [x] 4. Checkpoint — Verificar caché servidor
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Optimizar repositorios del backend
  - [x] 5.1 Optimizar `obtenerColaAuxiliar()` con ventana de lectura
    - Modificar en `Repositorios_ColaAuxiliarRepo.js`: leer solo últimas 2000 filas de Control_General en 1 sola Lectura_Batch de rango contiguo (cols 1-62)
    - Si hoja tiene < 2000 filas, leer todas
    - Filtrar en memoria por estado `PENDIENTE RADICAR`, retornar máximo 100 resultados
    - _Requirements: 2.1, 2.4, 10.1, 10.4, 10.5_

  - [x] 5.2 Optimizar `obtenerErroresPendientesComercial()` eliminando TextFinder
    - Reestructurar en `Repositorios_ColaAuxiliarRepo.js`: leer Control_General en 1 batch, construir índice `indicePorUuid` (col 61)
    - Usar catálogo de motivos desde CacheServiceWrapper
    - Cruzar Errores_Terceros con índice en memoria — O(1) por UUID
    - Total máximo: 4 llamadas a Sheets (Errores_Terceros: 1, Control_General: máx 2, CATALOGO_MOTIVOS: máx 1 si cache-miss)
    - Omitir UUIDs no encontrados en índice sin lanzar excepción
    - Si Control_General no existe o solo tiene encabezado → retornar `[]`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 5.3 Optimizar `obtenerSolicitudesAnalista()` con FILA_REG_ANALISIS
    - Modificar en `Repositorios_AnalistaRepo.js`: leer COLA_ANALISIS filtrada por ESTADO=EN_EVALUACION y ASIGNADA_A=email
    - Para cada fila con FILA_REG_ANALISIS válido, leer directamente esa fila de "registro analisis" sin TextFinder
    - Validar: si FILA_REG_ANALISIS es vacío, 0, o el UUID no coincide → excluir y logear advertencia
    - Máximo N+2 llamadas a Sheets (N = solicitudes activas, limitado por cupoMax ≤ 10)
    - _Requirements: 9.2, 9.3, 9.4_

  - [x] 5.4 Conectar escritura de FILA_REG_ANALISIS en sincronización
    - Modificar `sincronizarLoteAutomatico()` en `Sincronizacion.js`: al insertar fila nueva en "registro analisis", buscar el UUID en COLA_ANALISIS y escribir el número de fila resultante en columna H (FILA_REG_ANALISIS)
    - _Requirements: 9.1_

  - [x] 5.5 Optimizar `obtenerLotesDeComercial()` con ventana de lectura
    - Modificar en `Repositorios_ControlGeneralRepo.js`: leer solo últimas 2000 filas para LIDER/ADMIN
    - Si hoja tiene < 2000 filas, leer todas
    - _Requirements: 10.2, 10.4, 10.5_

  - [x] 5.6 Integrar CacheServiceWrapper en `api_obtenerTodosLosLotes()`
    - Modificar en `Api.js`: usar `CacheServiceWrapper.putJSON` / `getJSON` para manejar payloads > 100 KB automáticamente
    - Respetar TTL de 60s
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 5.7 Escribir property test para índice UUID
    - **Property 4: Índice UUID construido en memoria es correcto**
    - Generar datasets de Control_General con N filas y UUIDs diversos, construir índice, verificar que cada UUID retorna la fila exacta
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 5.8 Escribir property test para referencias inválidas
    - **Property 5: Referencias inválidas se omiten sin interrumpir**
    - Generar conjuntos de UUIDs donde algunos no existen en el índice, verificar que la función retorna resultados solo para los válidos sin excepción
    - **Validates: Requirements 3.4, 9.3**

- [x] 6. Checkpoint — Verificar repositorios optimizados
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implementar CacheManager del cliente
  - [x] 7.1 Crear módulo CacheManager en `scripts_app.html`
    - Implementar objeto `CacheManager` con métodos `get(key)`, `set(key, data)`, `invalidar(keys)`, `invalidarTodo()`, `esValido(key)`
    - Store interno: `{ key: { data, timestamp } }`
    - TTL configurable por clave: `dashboard` = 30000ms, resto = 0 (solo invalidación explícita)
    - Reemplazar variables globales existentes (`_colaAuxiliarCache`, `_cacheLocal`, `_todosLosLotes`) por claves del CacheManager
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7_

  - [x] 7.2 Integrar CacheManager en navegación de vistas
    - Modificar `navegarA()` y cada función `cargar*()` para consultar CacheManager antes de `callServer`
    - Si cache-hit → renderizar directamente (< 100ms)
    - Si cache-miss → mostrar skeleton y hacer la llamada al servidor
    - Al recibir datos del servidor → `CacheManager.set(key, datos)`
    - Vistas cubiertas: `cola-auxiliar`, `mis-solicitudes`, `asignaciones`, `errores`, `lotes`, `solicitudes`, `usuarios`, `config`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

  - [x] 7.3 Implementar reglas de invalidación por acción
    - Después de cada acción exitosa del usuario (radicar, marcar error, enviar corrección, pedir solicitud, guardar usuario, guardar motivo, reasignar), invalidar las claves correspondientes según la tabla de invalidación del diseño
    - _Requirements: 1.5_

  - [ ]* 7.4 Escribir property test para cache-hit previene round-trip
    - **Property 1: Cache hit previene round-trip al servidor**
    - Simular CacheManager con datos en varias claves, verificar que `get(key)` retorna datos sin invocar `callServer`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [ ]* 7.5 Escribir property test para invalidación selectiva
    - **Property 2: Acción invalida las claves correctas del caché**
    - Generar estados de caché con múltiples claves pobladas, ejecutar invalidación sobre un subconjunto, verificar que las invalidadas retornan null y las demás conservan datos
    - **Validates: Requirements 1.5**

- [x] 8. Implementar SkeletonSystem
  - [x] 8.1 Crear módulo SkeletonSystem en `scripts_app.html`
    - Implementar objeto `SkeletonSystem` con métodos `mostrar(containerId, tipo, opciones)` y `reemplazar(containerId, htmlContenido)`
    - Tipos soportados: `'tabla'` (thead real + filas animadas), `'dashboard'` (4 KPI placeholders + barra), `'detalle'` (campos de formulario placeholder), `'lista'` (cards placeholder)
    - Transición suave al reemplazar skeleton por contenido real
    - _Requirements: 1.6, 11.1, 11.2_

  - [x] 8.2 Integrar SkeletonSystem en todas las vistas con carga asíncrona
    - Reemplazar los skeletons inline existentes (`_mostrarSkeletonDashboard`, `_skeletonFilas`) por llamadas al SkeletonSystem
    - Asegurar que header y sidebar permanecen visibles durante la carga
    - Implementar timeout de 15s: si no llega respuesta, reemplazar skeleton por mensaje de error con botón reintentar
    - Cubrir vistas: dashboard, cola-auxiliar, mis-solicitudes, asignaciones, errores, lotes, solicitudes, detalle de lote, formulario de evaluación
    - _Requirements: 4.2, 4.3, 11.1, 11.2, 11.3, 11.4_

  - [ ]* 8.3 Escribir property test para cache-miss produce skeleton
    - **Property 3: Cache-miss produce skeleton antes de datos**
    - Para cualquier tipo de vista con cache vacío, verificar que la navegación genera HTML de skeleton con la estructura correcta antes de iniciar carga
    - **Validates: Requirements 1.6, 11.1**

- [x] 9. Implementar OptimisticUpdater
  - [x] 9.1 Crear módulo OptimisticUpdater en `scripts_app.html`
    - Implementar objeto `OptimisticUpdater` con método `ejecutar(config)` que acepta: `cacheKey`, `mutacion`, `render`, `serverFn`, `serverArgs`, `invalidarKeys`, `timeout`
    - Flujo: snapshot → mutación local → render instantáneo → callServer → confirmar o rollback
    - Timeout default: 10 segundos
    - Si fallo o timeout: restaurar snapshot, re-renderizar, toast de error
    - Si usuario navega durante espera y falla: rollback silencioso + toast sin alterar vista activa
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 9.2 Integrar OptimisticUpdater en acciones principales
    - Radicar solicitud (auxiliar): remover de `cola-auxiliar`, invalidar `dashboard`
    - Enviar corrección (comercial): remover/actualizar en `errores`, invalidar `dashboard`
    - Guardar/eliminar usuario (líder): agregar/modificar/remover en `usuarios`
    - Guardar/eliminar motivo (líder): agregar/modificar/remover en `config-motivos`, invalidar `errores`
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 9.3 Escribir property test para mutación optimista
    - **Property 6: Mutación optimista produce estado correcto**
    - Generar estados de caché con listas de ítems, aplicar mutaciones (remover, agregar, modificar), verificar que el resultado es exactamente lo esperado
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [ ]* 9.4 Escribir property test para rollback
    - **Property 7: Rollback restaura el estado original**
    - Generar estados de caché, tomar snapshot, aplicar mutación, ejecutar rollback, verificar igualdad profunda con el snapshot original
    - **Validates: Requirements 7.4**

- [x] 10. Checkpoint — Verificar sistema de caché cliente completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Optimizar carga inicial (`doGet`) y cableado final
  - [x] 11.1 Modificar `doGet` para no bloquear en cache-miss
    - Si `CacheService.get()` retorna null para la clave de resumen → asignar `datosIniciales.resumen = null` sin invocar `obtenerResumenComercial()` síncronamente
    - Si `CacheService.get()` retorna un valor válido (cache-hit) → inyectar el resumen serializado en `__INIT__` del HTML
    - Lotes: misma lógica, inyectar si cache-hit, null si cache-miss
    - _Requirements: 4.1, 4.4, 4.5_

  - [x] 11.2 Manejar `datosIniciales.resumen = null` en el frontend
    - En `inicializarApp()`: si `__INIT__.resumen` es null → usar SkeletonSystem para dashboard y solicitar datos vía `callServer('api_obtenerResumenDashboard')`
    - Respetar timeout de 15s → skeleton a error con reintentar
    - _Requirements: 4.2, 4.3_

  - [x] 11.3 Verificar escritura batch en `pedirSolicitudAnalista`
    - Confirmar que la escritura en COLA_ANALISIS usa `setValues()` para 1 fila × 3 columnas (ya existe en código actual)
    - Confirmar que escritura en "registro analisis" usa máximo 1 llamada
    - Manejar fallo en `setValues()`: liberar lock, no modificar hoja secundaria, retornar `{ok: false}`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 11.4 Integrar mecanismo de filtrado por fechas para datos históricos
    - Agregar parámetros opcionales `fechaDesde` y `fechaHasta` a `obtenerLotesDeComercial()` para leer fuera de la ventana de 2000 filas
    - Si se especifican fechas, leer todas las filas pero filtrar en memoria por el rango de fechas
    - _Requirements: 10.3_

  - [ ]* 11.5 Escribir tests de integración para verificar call-count en repositorios
    - Test: `obtenerColaAuxiliar` → exactamente 1 `getRange().getValues()` para datos
    - Test: `obtenerErroresPendientesComercial` con 20 errores → máximo 4 llamadas
    - Test: `pedirSolicitudAnalista` → 1 `setValues()` en COLA_ANALISIS
    - Test: `obtenerSolicitudesAnalista` con FILA_REG_ANALISIS → N+2 llamadas máximo
    - _Requirements: 2.4, 2.5, 3.3, 6.1, 6.2, 9.4_

- [x] 12. Checkpoint final — Verificar integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requerimientos específicos para trazabilidad
- Los tests corren localmente con Node.js + vitest + fast-check (no dentro de GAS)
- Los mocks de GAS simulan `SpreadsheetApp`, `CacheService`, `LockService` para poder testear la lógica sin conexión real a Sheets
- El código de producción (`.js` y `.html`) se despliega a GAS vía `clasp push`
- Property tests validan las 10 propiedades de correctitud definidas en el documento de diseño
- Los checkpoints permiten validar incrementalmente antes de seguir

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1", "3.2"] },
    { "id": 4, "tasks": ["3.3", "5.1", "5.2", "5.5"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.6", "5.7", "5.8"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "8.1"] },
    { "id": 8, "tasks": ["7.4", "7.5", "8.2", "8.3"] },
    { "id": 9, "tasks": ["9.1"] },
    { "id": 10, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 11, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 12, "tasks": ["11.5"] }
  ]
}
```
