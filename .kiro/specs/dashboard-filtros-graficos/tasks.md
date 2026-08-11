# Implementation Plan: Dashboard Filtros y Gráficos

## Overview

Implementación incremental de filtros drill-down y 3 gráficos SVG analíticos para el dashboard del sistema El Libertador. Se construye primero el endpoint backend liviano, luego los módulos frontend (DrillDownFilters, SVGRenderer, DashboardCharts) y finalmente se integra todo en la vista de dashboard existente.

## Tasks

- [x] 1. Backend: Endpoint api_obtenerUsuariosDashboard
  - [x] 1.1 Crear función api_obtenerUsuariosDashboard en Api.js
    - Implementar endpoint que retorne `[{email, nombre, rol, emailDirector, emailGerente, activo}]`
    - Filtrar por equipo visible del solicitante usando lógica existente de UsuariosRepo
    - Validar que el usuario autenticado tenga rol GERENTE, DIRECTOR, ADMIN o ASESOR antes de retornar datos
    - No exponer campos sensibles (cupo, emailsAlternos)
    - _Requirements: 2.4, 3.5, 5.2_

  - [ ]* 1.2 Write unit test for api_obtenerUsuariosDashboard
    - Verificar que solo retorna campos mínimos (email, nombre, rol, emailDirector, emailGerente, activo)
    - Verificar filtrado por equipo visible según rol del solicitante
    - Verificar rechazo para roles sin permiso (CONSULTOR, AUXILIAR, ANALISTA)
    - _Requirements: 2.4, 3.5_

- [x] 2. Frontend Module: DrillDownFilters
  - [x] 2.1 Crear módulo DrillDownFilters con render y lógica de visibilidad por rol
    - Implementar `DrillDownFilters.render(rol, usuarios, emailUsuario)` que retorna HTML de dropdowns
    - GERENTE/ADMIN/ASESOR → renderizar Filtro_Director + Filtro_Comercial
    - DIRECTOR → renderizar solo Filtro_Comercial
    - CONSULTOR/COMERCIAL/AUXILIAR/ANALISTA → no renderizar (componente oculto)
    - Incluir opción "Todos" como primera entrada seleccionada por defecto en cada dropdown
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.3, 3.4_

  - [x] 2.2 Implementar lógica de población de Filtro_Director y Filtro_Comercial
    - `_getDirectoresVisibles(rol, emailUsuario, usuarios)`: filtra directores según rol
    - GERENTE → directores cuyo emailGerente === email del gerente Y activo === true
    - ADMIN/ASESOR → todos los usuarios con rol DIRECTOR Y activo === true
    - `_getComercialesVisibles(emailDirector, rol, emailUsuario, usuarios)`: filtra comerciales según director seleccionado
    - Director seleccionado → comerciales cuyo emailDirector === director Y activo === true
    - "Todos" seleccionado para GERENTE → todos los comerciales transitivos del gerente
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

  - [x] 2.3 Implementar lógica de cascada y getEmailsFiltrados
    - `onDirectorChange(emailDirector)`: actualiza Filtro_Comercial, resetea selección a "Todos"
    - `onComercialChange(emailComercial)`: actualiza estado y dispara re-render del dashboard
    - `getEmailsFiltrados(usuarios)`: retorna array de emails de comerciales visibles según selección actual (o null si sin filtro)
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.3_

  - [ ]* 2.4 Write property test: Filter visibility is determined by role
    - **Property 1: Filter visibility is determined by role**
    - Genera rol aleatorio del enum [GERENTE, DIRECTOR, ADMIN, ASESOR, CONSULTOR, COMERCIAL, AUXILIAR, ANALISTA]
    - Verifica que el output de render() cumple la especificación de visibilidad por rol
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [ ]* 2.5 Write property test: Director list population respects hierarchy
    - **Property 2: Director list population respects hierarchy**
    - Genera lista de 1-50 usuarios con roles, emails y flags activo aleatorios
    - Verifica que GERENTE solo ve directores de su equipo, ADMIN/ASESOR ve todos los directores activos
    - Verifica que ningún director inactivo aparece
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 2.6 Write property test: Comercial list population with cascade
    - **Property 3: Comercial list population with cascade**
    - Genera lista de usuarios + estado de filtro (director seleccionado o null)
    - Verifica cascada: cambio de director resetea comercial; selección "Todos" muestra equipo completo transitivo
    - **Validates: Requirements 3.1, 3.2, 3.3, 4.1, 4.2**

  - [ ]* 2.7 Write property test: Lote filtering produces correct subset
    - **Property 4: Lote filtering produces correct subset**
    - Genera lista de 0-100 lotes con nombres aleatorios + set de nombres seleccionados
    - Verifica que resultado es subconjunto exacto con match case-insensitive del campo comercial
    - **Validates: Requirements 5.3**

- [x] 3. Checkpoint - Verificar filtros
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Frontend Module: SVGRenderer
  - [x] 4.1 Crear módulo SVGRenderer con helpers de creación de elementos SVG
    - Implementar `_crearElemento(tag, attrs)` usando `document.createElementNS('http://www.w3.org/2000/svg', tag)`
    - Implementar `_calcularViewBox(ancho, alto)` que retorna string de viewBox
    - Cada SVG raíz debe tener: `width="100%"`, viewBox calculado, `role="img"`, `aria-labelledby` apuntando a un `<title>` interno
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 10.2_

  - [x] 4.2 Implementar barrasHorizontales(config) para Chart_Ranking y Chart_Antigüedad
    - Renderizar barras horizontales SVG: label a la izquierda, barra proporcional, valor numérico al final
    - Soportar `config.opciones.umbralAlerta` y `config.opciones.colorAlerta` para resaltado condicional
    - Soportar `config.opciones.sufijo` para las etiquetas de valor (ej: " días")
    - Garantizar contraste WCAG AA (4.5:1) entre colores de barra y fondo
    - _Requirements: 6.1, 6.4, 7.1, 7.4, 7.6, 9.1, 9.2, 10.3_

  - [x] 4.3 Implementar lineaTendencia(config) para Chart_Tendencia
    - Renderizar gráfico de línea SVG con ejes X (etiquetas de semana) e Y (cantidad)
    - Incluir marcadores circulares (`<circle>`) en cada punto de datos
    - Conectar puntos con `<polyline>` o `<path>`
    - Garantizar contraste WCAG AA entre línea/marcadores y fondo
    - _Requirements: 8.1, 8.4, 8.6, 9.1, 9.2, 10.3_

  - [ ]* 4.4 Write property test: SVG accessibility attributes are always present
    - **Property 8: SVG accessibility attributes are always present**
    - Genera datos aleatorios para cada tipo de gráfico (barrasHorizontales, lineaTendencia)
    - Verifica que SVG raíz tiene `role="img"`, `aria-labelledby` referenciando un `<title>` con id y texto no vacío
    - **Validates: Requirements 10.1, 10.2**

  - [ ]* 4.5 Write unit tests for SVGRenderer
    - Verificar namespace correcto `http://www.w3.org/2000/svg` en createElementNS
    - Verificar width="100%" y viewBox presentes
    - Verificar que umbralAlerta aplica colorAlerta en barras que superan el umbral
    - Verificar marcadores circulares en lineaTendencia
    - _Requirements: 9.1, 9.3, 9.4, 10.3_

- [ ] 5. Frontend Module: DashboardCharts (orquestador de datos)
  - [x] 5.1 Implementar _calcularRanking(lotes, usuarios)
    - Contar lotes del mes calendario actual por comercial (estado RADICADO o posterior)
    - Incluir comerciales con cero lotes (barra de longitud cero, valor "0")
    - Retornar array ordenado descendente por valor
    - _Requirements: 6.2, 6.3, 6.4, 6.6_

  - [x] 5.2 Implementar _calcularAntiguedad(lotes)
    - Calcular promedio de días por estado para lotes activos (excluir TERMINADO)
    - Antigüedad = floor((now - fecha) / msPerDay), promedio redondeado a 1 decimal
    - Excluir lotes con fecha inválida
    - _Requirements: 7.2, 7.3_

  - [x] 5.3 Implementar _calcularTendencia(lotes)
    - Agrupar lotes en 8 semanas calendario completas (lunes a domingo), más reciente al final
    - Contar lotes cuya fecha caiga en cada semana y cuyo estado sea RADICADO o posterior
    - Retornar exactamente 8 entradas con label del rango de fechas
    - _Requirements: 8.2, 8.3_

  - [x] 5.4 Implementar renderizar(lotes, usuarios) que orquesta los 3 gráficos
    - Llamar `_calcularRanking`, `_calcularAntiguedad`, `_calcularTendencia`
    - Invocar `SVGRenderer.barrasHorizontales` para ranking (con título descriptivo)
    - Invocar `SVGRenderer.barrasHorizontales` para antigüedad (con umbralAlerta=5, sufijo=" días")
    - Invocar `SVGRenderer.lineaTendencia` para tendencia (con título descriptivo)
    - Manejar caso de datos vacíos: mostrar mensaje "No hay datos para el período seleccionado"
    - _Requirements: 6.1, 6.5, 7.1, 7.5, 8.1, 8.5_

  - [ ]* 5.5 Write property test: Ranking calculation produces sorted results with full team coverage
    - **Property 5: Ranking calculation produces sorted results with full team coverage**
    - Genera lista de lotes con fechas (dentro/fuera del mes) y estados variados + lista de comerciales
    - Verifica: una entrada por comercial, orden descendente por valor, fechas fuera del mes no contadas
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.6**

  - [ ]* 5.6 Write property test: Antigüedad calculation produces correct averages with alert detection
    - **Property 6: Antigüedad calculation produces correct averages with alert detection**
    - Genera lista de lotes con fechas variadas (1-60 días atrás) y estados aleatorios
    - Verifica: TERMINADO excluido, promedios correctos, umbral >5 días genera alerta
    - **Validates: Requirements 7.2, 7.3, 7.6**

  - [ ]* 5.7 Write property test: Tendencia produces exactly 8 weekly buckets with correct counts
    - **Property 7: Tendencia produces exactly 8 weekly buckets with correct counts**
    - Genera lista de lotes con fechas en rango de 0-12 semanas atrás
    - Verifica: exactamente 8 entradas, semanas consecutivas, cada lote contado en máximo una semana
    - **Validates: Requirements 8.2, 8.3**

- [x] 6. Checkpoint - Verificar módulos individuales
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integración con Dashboard existente
  - [x] 7.1 Registrar clave 'usuarios-dash' en CacheManager con TTL 0
    - Agregar configuración de cache para la nueva clave en el CacheManager existente
    - Implementar la llamada a `api_obtenerUsuariosDashboard` en cache miss
    - _Requirements: 5.2_

  - [x] 7.2 Integrar DrillDownFilters en la vista de dashboard (scripts_app.html o componente equivalente)
    - Insertar contenedor HTML para los filtros en la sección dashboard
    - Al cargar dashboard: obtener datos de CacheManager('usuarios-dash'), invocar `DrillDownFilters.render(rol, usuarios, emailUsuario)`
    - Conectar event handlers de cambio de filtro a re-render del dashboard
    - Usar patrón `_navId` existente para descartar respuestas tardías al cambiar de sección
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 4.3, 5.1, 5.2_

  - [x] 7.3 Integrar DashboardCharts en la vista de dashboard
    - Insertar contenedores HTML para los 3 gráficos (chart-ranking, chart-antiguedad, chart-tendencia)
    - Al cargar dashboard o cambiar filtro: filtrar lotes localmente con `DrillDownFilters.getEmailsFiltrados()`, invocar `DashboardCharts.renderizar(lotesFiltrados, usuarios)`
    - Manejar estados de carga (skeleton) y error (toast + reintentar)
    - Verificar existencia de containers antes de renderizar SVG (fail-safe)
    - _Requirements: 6.1, 6.5, 7.1, 7.5, 8.1, 8.5_

  - [ ]* 7.4 Write integration test for filter change → chart re-render
    - Verificar flujo completo: cambio de filtro Director → actualización de Filtro_Comercial → re-render de charts con datos filtrados
    - Verificar que no se realizan llamadas al servidor al cambiar filtros (todo opera sobre CacheManager)
    - _Requirements: 4.3, 5.1, 6.5, 7.5, 8.5_

- [x] 8. Final checkpoint - Validación completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All SVG generation uses `document.createElementNS` — tests need JSDOM environment
- The project uses Vitest (not Jest) with fast-check for property-based testing
- Existing generators in `tests/properties/generators/` can be extended for new UsuarioDash and Lote generators

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.2", "4.3"] },
    { "id": 2, "tasks": ["2.2", "4.4", "4.5"] },
    { "id": 3, "tasks": ["2.3", "5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["2.4", "2.5", "2.6", "2.7", "5.4"] },
    { "id": 5, "tasks": ["5.5", "5.6", "5.7", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3"] },
    { "id": 7, "tasks": ["7.4"] }
  ]
}
```
