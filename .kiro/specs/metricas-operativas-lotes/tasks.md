# Implementation Plan: Métricas Operativas de Lotes

## Overview

Implementación de un servicio de métricas operativas para lotes en Google Apps Script que incluye: función API en `Api.js`, servicio de dominio en `Servicios_MetricasLotes.js`, y vista frontend HTML. Los datos se leen de la hoja "registro analisis" con caché fragmentado y control de acceso por rol.

## Tasks

- [x] 1. Crear servicio de dominio con función safe-default y validación de parámetros
  - [x] 1.1 Crear archivo `Servicios_MetricasLotes.js` con la función `_metricasLotesVacias()` y la validación de parámetros `mes` (1-12) y `anio` (4 dígitos)
    - Crear el archivo `Servicios_MetricasLotes.js` en la raíz del proyecto
    - Implementar `_metricasLotesVacias()` que retorne el objeto safe-default con `resumen` (lotesAprobados: 0, lotesNegados: 0, solicitudesAprobadas: 0, solicitudesNegadas: 0, solicitudesReconsideradas: 0) y `detallePorLote: []`
    - Implementar función interna `_validarParametrosPeriodo(mes, anio)` que retorne `false` si `mes` no es entero 1-12 o `anio` no es entero de 4 dígitos
    - _Requirements: 6.2, 6.4_

  - [ ]* 1.2 Escribir property test para validación de parámetros (Property 6)
    - **Property 6: Parámetros inválidos retornan safe-default**
    - Generar valores aleatorios fuera de rango para `mes` y `anio`
    - Verificar que siempre retorna `_metricasLotesVacias()` sin intentar leer datos
    - **Validates: Requirements 6.4**

- [x] 2. Implementar lectura de datos y filtrado por periodo mensual
  - [x] 2.1 Implementar lectura de headers con caché y mapeo de columnas
    - Leer headers de la hoja "registro analisis" usando `ID_ARCHIVO_ANALISIS`
    - Cachear headers con clave `"HDR_METRICAS_LOTES"` y TTL 300s usando `CacheWrapper_putJSON`/`CacheWrapper_getJSON`
    - Mapear las columnas: `Fecha Lote`, `Solicitud Inquilino`, `codigo lote`, `RESULTADO LOTE`, `RESULTADO SOLICITUD`, `REGISTRO ANALISTA SAI`
    - Retornar safe-default + registrar ERROR si alguna columna requerida no se encuentra
    - _Requirements: 5.3, 1.6_

  - [x] 2.2 Implementar filtrado de filas por Periodo_Mensual
    - Leer datos completos con `getDataRange().getValues()`
    - Parsear `Fecha_Lote` a objeto Date; excluir filas con fecha vacía o inválida
    - Filtrar incluyendo solo filas donde `Fecha_Lote >= primerDíaMes` y `Fecha_Lote <= últimoDíaMes` (sin componente horario)
    - Normalizar todos los campos de texto con `.toString().trim().toUpperCase()` al momento de lectura
    - _Requirements: 3.3, 3.5, 1.6_

  - [ ]* 2.3 Escribir property test para filtrado por periodo (Property 7)
    - **Property 7: Filtrado por periodo mensual es correcto**
    - Generar filas con fechas aleatorias dentro y fuera del periodo
    - Verificar que solo se incluyen filas con fecha >= primer día y <= último día del mes
    - **Validates: Requirements 3.3**

  - [ ]* 2.4 Escribir property test para exclusión de filas sin fecha válida (Property 2)
    - **Property 2: Exclusión de filas sin Fecha_Lote válida**
    - Generar conjuntos de datos con filas sin fecha o con fecha inválida
    - Verificar que dichas filas no aparecen en resumen ni en detalle, y no se genera error
    - **Validates: Requirements 1.6, 3.5**

- [x] 3. Implementar cálculo de resumen mensual
  - [x] 3.1 Implementar cálculo de `lotesAprobados` y `lotesNegados`
    - Iterar filas filtradas y agrupar por `codigo_lote` (valores distintos)
    - Contar lotes distintos cuyo `RESULTADO_LOTE` normalizado sea "APROBADO" o "NEGADO"
    - _Requirements: 1.1, 1.2_

  - [x] 3.2 Implementar cálculo de `solicitudesAprobadas`, `solicitudesNegadas` y `solicitudesReconsideradas`
    - Contar solicitudes con `REGISTRO_ANALISTA_SAI` exactamente "APROBADO" (excluyendo las que contengan "RECONSIDERADO APROBADO")
    - Contar solicitudes con `REGISTRO_ANALISTA_SAI` exactamente "NEGADO"
    - Contar solicitudes con `REGISTRO_ANALISTA_SAI` que contenga "RECONSIDERADO APROBADO"
    - Excluir del conteo filas con campo `REGISTRO_ANALISTA_SAI` vacío
    - _Requirements: 1.3, 1.4, 1.7, 1.6_

  - [ ]* 3.3 Escribir property test para clasificación mutuamente excluyente de REGISTRO_ANALISTA_SAI (Property 3)
    - **Property 3: Clasificación de REGISTRO_ANALISTA_SAI es mutuamente excluyente**
    - Generar solicitudes con variaciones de "APROBADO", "NEGADO", "RECONSIDERADO APROBADO"
    - Verificar que cada solicitud se cuenta en exactamente una categoría
    - **Validates: Requirements 1.3, 1.4, 1.7**

  - [ ]* 3.4 Escribir property test para normalización case-insensitive (Property 5)
    - **Property 5: Normalización case-insensitive produce resultados idénticos**
    - Generar datos con variaciones de mayúsculas/minúsculas y espacios
    - Verificar que el resultado es idéntico al de datos pre-normalizados
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1**

- [x] 4. Implementar tabla de seguimiento detallada por lote
  - [x] 4.1 Implementar agrupación por `codigo_lote` y cálculo de métricas combinadas
    - Agrupar solicitudes por `codigo_lote` único
    - Calcular `cantidadSolicitudes` como conteo de valores únicos de `Solicitud Inquilino` por lote
    - Calcular `solicitudesAprobadasEnLote`: RESULTADO_SOLICITUD="APROBADO" AND RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="APROBADO"
    - Calcular `solicitudesAprobadasIndividualNegadaPorLote`: REGISTRO_ANALISTA_SAI="APROBADO" AND RESULTADO_LOTE="NEGADO" AND RESULTADO_SOLICITUD="APROBADO"
    - Calcular `solicitudesNegadasIndividualAprobadasPorLote`: RESULTADO_SOLICITUD="NEGADO" AND RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="APROBADO"
    - Calcular `solicitudesNegadas`: RESULTADO_LOTE="NEGADO" AND RESULTADO_SOLICITUD="NEGADO" AND REGISTRO_ANALISTA_SAI="NEGADO"
    - Calcular `aprobadaPorLoteNegadaPorAnalista`: RESULTADO_LOTE="APROBADO" AND REGISTRO_ANALISTA_SAI="NEGADO"
    - Calcular `negadaPorLoteReconsideradaPorGerencia`: REGISTRO_ANALISTA_SAI contiene "RECONSIDERADO APROBADO"
    - Excluir de métricas 3-8 solicitudes con campos vacíos, pero incluirlas en `cantidadSolicitudes`
    - Ordenar resultado por `Fecha_Lote` descendente
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [ ]* 4.2 Escribir property test para consistencia resumen vs detalle (Property 1)
    - **Property 1: Conteo de lotes aprobados/negados es consistente con el detalle**
    - Generar datos aleatorios y verificar que `resumen.lotesAprobados` == count(detallePorLote donde resultadoLote=="APROBADO")
    - Verificar que `resumen.lotesNegados` == count(detallePorLote donde resultadoLote=="NEGADO")
    - **Validates: Requirements 1.1, 1.2, 2.1**

  - [ ]* 4.3 Escribir property test para suma de métricas no excede cantidad de solicitudes (Property 4)
    - **Property 4: La suma de métricas por solicitud dentro de un lote no excede la cantidad de solicitudes**
    - Para cada lote generado, verificar que la suma de las 6 métricas detalladas <= cantidadSolicitudes
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10**

- [x] 5. Checkpoint - Verificar lógica de cálculo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implementar caché y orquestación en `calcularMetricasLotes`
  - [x] 6.1 Implementar función principal `calcularMetricasLotes(mes, anio)` con flujo completo
    - Validar parámetros → retornar safe-default si inválidos
    - Intentar `CacheWrapper_getJSON("METRICAS_LOTES_" + mes + "_" + anio)` → retornar si hit
    - En cache miss: leer headers (con caché), leer datos, filtrar, calcular resumen + detalle
    - Almacenar resultado en caché con `CacheWrapper_putJSON` y TTL 120s
    - Si payload > 500KB: retornar sin cachear + registrar WARN con `_registrarEvento_`
    - Si CacheService no disponible: calcular directo y retornar sin error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 6.2 Escribir unit tests para flujo de caché
    - Test cache hit retorna datos directamente sin leer Sheets
    - Test cache miss lee de Sheets y almacena en caché
    - Test degradación cuando CacheService no está disponible
    - _Requirements: 5.1, 5.2, 5.6_

- [x] 7. Exponer función API en `Api.js`
  - [x] 7.1 Agregar función `api_obtenerMetricasLotes(mes, anio)` en `Api.js`
    - Implementar patrón: `try { verificarRol([...]) → calcularMetricasLotes(mes, anio) } catch { log + safe-default }`
    - Verificar roles: `['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']`
    - Capturar errores y registrar con `_registrarEvento_('ERROR', 'Api.js', 'api_obtenerMetricasLotes', e.message)`
    - Retornar `_metricasLotesVacias()` en caso de error
    - _Requirements: 4.1, 4.2, 4.3, 6.1, 6.2, 6.3_

  - [ ]* 7.2 Escribir unit tests para control de acceso API
    - Test que roles DIRECTOR, GERENTE, ADMIN, LIDER reciben datos correctamente
    - Test que roles no autorizados reciben safe-default sin detalles internos
    - Test que errores inesperados retornan safe-default
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 8. Checkpoint - Verificar backend completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implementar vista frontend de métricas
  - [x] 9.1 Crear componente HTML/JS para selector de periodo y visualización de métricas
    - Agregar sección de métricas en el frontend existente (o crear archivo HTML dedicado según patrón del proyecto)
    - Implementar selector de mes (enero-diciembre) y año (2024 hasta año actual)
    - Cargar con mes y año actual seleccionados por defecto
    - Llamar `google.script.run.api_obtenerMetricasLotes(mes, anio)` al cargar y al cambiar periodo
    - Mostrar resumen con totales: lotes aprobados, lotes negados, solicitudes aprobadas, solicitudes negadas, solicitudes reconsideradas
    - Mostrar tabla de detalle con columnas: Fecha Lote, Código Lote, RESULTADO_LOTE, Cantidad Solicitudes, y las 6 métricas combinadas
    - Mostrar 0 en métricas con conteo cero
    - Mostrar mensaje "No hay registros para el periodo consultado" cuando no hay datos
    - Ocultar o no mostrar la sección para roles no autorizados
    - _Requirements: 1.5, 2.9, 3.1, 3.2, 3.4_

- [x] 10. Final checkpoint - Verificar integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in design.md
- Unit tests validate specific examples and edge cases
- El proyecto usa Vitest + fast-check para tests (ver `package.json`)
- La implementación es JavaScript (Google Apps Script) siguiendo los patrones existentes en `Api.js`, `Config.js`, etc.
- Los property tests se ejecutan aislados del entorno GAS (se mockean las dependencias de Sheets/Cache)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "3.1"] },
    { "id": 4, "tasks": ["3.2"] },
    { "id": 5, "tasks": ["3.3", "3.4", "4.1"] },
    { "id": 6, "tasks": ["4.2", "4.3"] },
    { "id": 7, "tasks": ["6.1"] },
    { "id": 8, "tasks": ["6.2", "7.1"] },
    { "id": 9, "tasks": ["7.2", "9.1"] }
  ]
}
```
