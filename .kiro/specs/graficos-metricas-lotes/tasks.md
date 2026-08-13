# Implementation Plan: Gráficos Métricas Lotes

## Overview

Integrar 4 gráficos visuales (Chart.js v4.4.7 vía CDN) en la vista existente de Métricas Operativas de Lotes. Se implementa un nuevo endpoint backend de tendencia histórica, un sub-módulo frontend `MetricasLotesCharts` con funciones puras de transformación de datos, y el layout CSS grid 2×2 responsive con accesibilidad completa.

## Tasks

- [ ] 1. Implementar endpoint backend de métricas históricas
  - [ ] 1.1 Crear función `calcularMetricasLotesHistorico(cantidadMeses)` en `Servicios_MetricasLotes.js`
    - Validar parámetro (entero 1-12, retornar `[]` si inválido)
    - Iterar meses hacia atrás desde el mes anterior al actual
    - Reutilizar `calcularMetricasLotes(mes, anio)` para cada mes
    - Almacenar resultado en CacheWrapper con clave `METRICAS_HIST_{cantidadMeses}` y TTL 120s
    - Retornar array `[{mes, anio, lotesAprobados, lotesNegados}]` ordenado cronológicamente
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7_

  - [ ] 1.2 Crear función `api_obtenerMetricasLotesHistorico(cantidadMeses)` en `Api.js`
    - Verificar roles permitidos: DIRECTOR, GERENTE, ADMIN, LIDER
    - Delegar a `calcularMetricasLotesHistorico`
    - Registrar error con `_registrarEvento_` y retornar `[]` en caso de fallo
    - _Requirements: 7.5, 7.6_

  - [ ]* 1.3 Write property tests for endpoint histórico (Properties 5, 6, 7)
    - **Property 5: Endpoint parameter validation** — Para cualquier entero n entre 1 y 12, retorna array de exactamente n elementos; para valores inválidos retorna array vacío
    - **Property 6: Historico output chronological ordering** — El array retornado está ordenado cronológicamente estricto
    - **Property 7: Historico consistency with calcularMetricasLotes** — Cada elemento del array es consistente con la llamada individual a calcularMetricasLotes
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [ ] 2. Checkpoint - Verificar backend
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Agregar Chart.js CDN y estructura HTML del grid de gráficos
  - [ ] 3.1 Insertar script tag de Chart.js CDN en `components_metricas_lotes.html`
    - Usar versión fija `4.4.7` con URL completa de jsdelivr
    - Incluir atributo `integrity` (SRI hash) y `crossorigin="anonymous"`
    - Colocar antes del bloque `<script>` existente del IIFE
    - _Requirements: 1.1, 1.2_

  - [ ] 3.2 Agregar HTML del grid de gráficos en `components_metricas_lotes.html`
    - Insertar sección `<div id="metricasLotesGraficos">` con grid 2×2 dentro de la función `_renderizarResultados`
    - Cada gráfico con contenedor `.metricas-lotes__chart-card`, título `<h4>`, `<canvas>` con `role="img"` y `aria-label`
    - Agregar spans `.sr-only` para screen readers debajo de cada canvas
    - Los 4 gráficos: Donut Lotes, Donut Solicitudes, Stacked Bar, Tendencia Mensual
    - _Requirements: 2.1, 2.4, 9.1, 9.2, 9.3_

  - [ ] 3.3 Agregar estilos CSS del grid y gráficos en el bloque `<style>` existente
    - Clase `.metricas-lotes__graficos-grid` con `grid-template-columns: repeat(2, 1fr)`
    - Clases `.metricas-lotes__chart-card`, `.metricas-lotes__chart-titulo`
    - Clases `.metricas-lotes__chart-empty` y `.metricas-lotes__chart-error` para estados vacío/error
    - Media query `@media (max-width: 768px)` para layout de 1 columna
    - Clase `.sr-only` para texto oculto visualmente
    - _Requirements: 2.2, 2.3_

- [ ] 4. Implementar sub-módulo MetricasLotesCharts con funciones de transformación
  - [ ] 4.1 Crear funciones puras de transformación de datos dentro del `<script>` de `components_metricas_lotes.html`
    - `_prepararDatosDonutLotes(resumen)` → `{labels, data, colors, isEmpty}`
    - `_prepararDatosDonutSolicitudes(resumen)` → `{labels, data, colors, isEmpty}`
    - `_prepararDatosStackedBar(detallePorLote)` → `{labels, datasets, isEmpty}` con límite de 10 lotes
    - `_prepararDatosTendencia(historico)` → `{labels, datasets, isEmpty}`
    - _Requirements: 3.1, 3.4, 4.1, 4.4, 5.1, 5.2, 5.4, 5.5, 5.6, 6.2, 6.5_

  - [ ]* 4.2 Write property tests for data transformation functions (Properties 1, 2, 3, 4)
    - **Property 1: Donut data preparation preserves totals** — La suma de `data[]` es igual a la suma de inputs; `isEmpty` es true si y solo si todos son cero
    - **Property 2: Stacked bar data structure consistency** — Exactamente 6 datasets, cada uno con `data.length === labels.length`
    - **Property 3: Top 10 truncation for stacked bar** — Si input tiene >10 elementos, output tiene máximo 10 labels
    - **Property 4: Tendencia data transformation preserves order and structure** — Exactamente 2 datasets, labels en orden cronológico
    - **Validates: Requirements 3.1, 3.4, 4.1, 4.4, 5.1, 5.2, 5.4, 5.5, 6.2, 6.5**

  - [ ] 4.3 Implementar sub-módulo `MetricasLotesCharts` como IIFE dentro del script existente
    - Paleta de colores consistente con design system (COLORES object)
    - Función `_chartDisponible()` para verificar disponibilidad de `Chart` global
    - Función `destruirTodos()` para destruir las 4 instancias y evitar memory leaks
    - `renderizarDonutLotes(resumen)` — Donut 2 segmentos (verde/rojo) con leyenda y tooltips
    - `renderizarDonutSolicitudes(resumen)` — Donut 3 segmentos (verde/rojo/ámbar) con leyenda y tooltips
    - `renderizarStackedBar(detallePorLote)` — Barras horizontales apiladas, 6 colores, código lote en eje Y
    - `renderizarTendencia(historico)` — Barras agrupadas, eje X con "Mes Año", verde/rojo
    - Cada método: si datos vacíos/cero → mostrar estado vacío; si Chart no disponible → no renderizar
    - Actualizar texto `.sr-only` con resumen numérico para screen readers
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 4.1, 4.2, 4.3, 4.5, 5.1, 5.2, 5.3, 5.4, 5.7, 6.2, 6.3, 6.4, 9.3_

  - [ ]* 4.4 Write property test for canvas accessibility (Property 8)
    - **Property 8: Canvas accessibility attributes presence** — Cada canvas tiene `role="img"`, `aria-label` no vacío, y span `.sr-only` con texto numérico
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [ ] 5. Checkpoint - Verificar frontend charts
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Integrar gráficos con el flujo de datos existente de MetricasLotesView
  - [ ] 6.1 Modificar `_cargarMetricas()` para invocar el endpoint histórico en paralelo
    - Agregar llamada a `callServer('api_obtenerMetricasLotesHistorico', 6)` junto con la carga existente
    - Manejar error del histórico de forma independiente (no afecta otros 3 gráficos)
    - _Requirements: 6.1, 6.6, 8.3_

  - [ ] 6.2 Modificar `_renderizarResultados()` para incluir el grid de gráficos y actualizar charts
    - Insertar HTML del grid de gráficos entre KPIs y tabla
    - Llamar `MetricasLotesCharts.destruirTodos()` antes de re-renderizar
    - Verificar `MetricasLotesCharts.chartDisponible()` → mostrar error de degradación si Chart.js no cargó
    - Renderizar los 3 gráficos del periodo (donut lotes, donut solicitudes, stacked bar) con datos de `api_obtenerMetricasLotes`
    - Renderizar gráfico de tendencia cuando el histórico resuelva
    - Mostrar indicador de carga en la sección de gráficos mientras se procesan datos
    - _Requirements: 1.3, 1.4, 2.1, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 6.3 Write unit tests for integration and degradation scenarios
    - Test: CDN falla → mensaje de degradación en grid, KPIs y tabla intactos
    - Test: Endpoint histórico falla → error solo en contenedor tendencia, otros 3 gráficos funcionan
    - Test: Cambio de periodo → destroy previo + re-render con datos nuevos
    - _Requirements: 1.3, 1.4, 6.6, 8.1_

- [ ] 7. Final checkpoint - Verificar integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- El proyecto usa Vanilla JS con patrón IIFE en Google Apps Script HtmlService
- Chart.js se carga exclusivamente en `components_metricas_lotes.html` para evitar conflictos con SVGRenderer del dashboard
- El SRI hash para Chart.js 4.4.7 debe obtenerse de srihash.org al momento de implementación
- Las funciones puras de transformación de datos permiten testing aislado sin DOM
- El patrón destroy-before-render es obligatorio para evitar memory leaks en Chart.js
- Property tests usan fast-check vía vitest (ya configurado en el proyecto)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "3.3"] },
    { "id": 1, "tasks": ["1.2", "3.2"] },
    { "id": 2, "tasks": ["1.3", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["6.3"] }
  ]
}
```
