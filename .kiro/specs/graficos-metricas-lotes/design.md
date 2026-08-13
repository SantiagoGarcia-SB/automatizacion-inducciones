# Design Document: Gráficos Métricas Lotes

## Overview

Este diseño describe la integración de 4 gráficos visuales (Chart.js v4.x vía CDN) en la vista existente de Métricas Operativas de Lotes. Los gráficos se ubican entre los KPIs y la tabla de detalle, consumen datos del endpoint actual (`api_obtenerMetricasLotes`) y de un nuevo endpoint de tendencia histórica (`api_obtenerMetricasLotesHistorico`).

**Stack:** Vanilla JS (IIFE pattern) + Google Apps Script HtmlService + Chart.js v4.x CDN.

## Architecture

### Integración Chart.js en Google Apps Script HtmlService

Chart.js se carga exclusivamente dentro de `components_metricas_lotes.html` mediante un `<script>` con atributos `integrity` (SRI) y `crossorigin="anonymous"`. Este aislamiento evita conflictos con el SVGRenderer usado en `scripts_dashboardCharts.html`.

```
┌─────────────────────────────────────────────────────────────────┐
│  components_metricas_lotes.html                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  <script src="Chart.js CDN" integrity="..." crossorigin>  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  MetricasLotesView (IIFE existente — extendido)           │  │
│  │    ├── init() → _cargarMetricas() + _cargarHistorico()    │  │
│  │    ├── _renderizarResultados() → _renderizarGraficos()    │  │
│  │    └── MetricasLotesCharts (sub-módulo interno)           │  │
│  │          ├── renderizarDonutLotes(resumen)                │  │
│  │          ├── renderizarDonutSolicitudes(resumen)          │  │
│  │          ├── renderizarStackedBar(detallePorLote)         │  │
│  │          ├── renderizarTendencia(historico)               │  │
│  │          └── destruirTodos()                              │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de datos

```
Usuario selecciona periodo
        │
        ▼
MetricasLotesView._cargarMetricas()
        │
        ├──▶ callServer('api_obtenerMetricasLotes', mes, anio)
        │         │
        │         ▼
        │    Servicios_MetricasLotes.calcularMetricasLotes(mes, anio)
        │         │
        │         ▼
        │    { resumen, detallePorLote }
        │         │
        │         ▼
        │    MetricasLotesCharts.renderizarDonutLotes(resumen)
        │    MetricasLotesCharts.renderizarDonutSolicitudes(resumen)
        │    MetricasLotesCharts.renderizarStackedBar(detallePorLote)
        │
        └──▶ callServer('api_obtenerMetricasLotesHistorico', 6)
                  │
                  ▼
             Servicios_MetricasLotes.calcularMetricasLotesHistorico(6)
                  │  (loop: últimos 6 meses → calcularMetricasLotes cada uno)
                  ▼
             [{ mes, anio, lotesAprobados, lotesNegados }, ...]
                  │
                  ▼
             MetricasLotesCharts.renderizarTendencia(historico)
```

## Components and Interfaces

### 1. Backend: `calcularMetricasLotesHistorico(cantidadMeses)` — Servicios_MetricasLotes.js

Nueva función que calcula datos históricos mensuales reutilizando `calcularMetricasLotes`.

```javascript
/**
 * Calcula métricas de lotes aprobados/negados para los últimos N meses.
 * Reutiliza calcularMetricasLotes para cada mes del rango.
 *
 * @param {number} cantidadMeses - Entero entre 1 y 12
 * @returns {Array<{mes:number, anio:number, lotesAprobados:number, lotesNegados:number}>}
 *   Array ordenado cronológicamente (más antiguo primero). Vacío si parámetro inválido.
 */
function calcularMetricasLotesHistorico(cantidadMeses) {
  // 1. Validar parámetro
  if (typeof cantidadMeses !== 'number' || !Number.isInteger(cantidadMeses)
      || cantidadMeses < 1 || cantidadMeses > 12) {
    return [];
  }

  // 2. Cache check
  var cacheKey = 'METRICAS_HIST_' + cantidadMeses;
  try {
    var cached = CacheWrapper_getJSON(cacheKey);
    if (cached) return cached;
  } catch (e) { /* degradación elegante */ }

  // 3. Calcular rango de meses (desde el mes anterior al actual hacia atrás)
  var hoy = new Date();
  var mesActual = hoy.getMonth() + 1;
  var anioActual = hoy.getFullYear();
  var resultado = [];

  for (var i = cantidadMeses; i >= 1; i--) {
    var offset = i;
    var mesCalc = mesActual - offset;
    var anioCalc = anioActual;
    while (mesCalc <= 0) { mesCalc += 12; anioCalc--; }

    var metricas = calcularMetricasLotes(mesCalc, anioCalc);
    resultado.push({
      mes: mesCalc,
      anio: anioCalc,
      lotesAprobados: metricas.resumen.lotesAprobados,
      lotesNegados: metricas.resumen.lotesNegados
    });
  }

  // 4. Cache store (TTL 120s)
  try { CacheWrapper_putJSON(cacheKey, resultado, 120); } catch (e) { }

  return resultado;
}
```

### 2. API: `api_obtenerMetricasLotesHistorico(cantidadMeses)` — Api.js

```javascript
/**
 * Retorna datos de tendencia mensual de lotes aprobados/negados.
 * @param {number} cantidadMeses - Entero 1-12
 * @returns {Array<{mes:number, anio:number, lotesAprobados:number, lotesNegados:number}>}
 */
function api_obtenerMetricasLotesHistorico(cantidadMeses) {
  try {
    verificarRol(['DIRECTOR', 'GERENTE', 'ADMIN', 'LIDER']);
    return calcularMetricasLotesHistorico(cantidadMeses);
  } catch (e) {
    _registrarEvento_('ERROR', 'Api.js', 'api_obtenerMetricasLotesHistorico', e.message);
    return [];
  }
}
```

### 3. Frontend: Sub-módulo `MetricasLotesCharts`

Módulo interno del IIFE `MetricasLotesView` que encapsula el ciclo de vida de las 4 instancias de Chart.js.

```javascript
/**
 * Sub-módulo de gráficos dentro de MetricasLotesView.
 * Gestiona 4 instancias de Chart.js con destroy/create en cada actualización.
 */
var MetricasLotesCharts = (function() {
  'use strict';

  // Referencias a instancias activas de Chart.js
  var _charts = {
    donutLotes: null,
    donutSolicitudes: null,
    stackedBar: null,
    tendencia: null
  };

  // Paleta de colores del design system
  var COLORES = {
    aprobado: '#0d7a54',       // --color-success
    negado: '#bd0f14',         // --color-primary-red
    reconsiderado: '#92400e',  // --color-warning
    stacked: [
      '#0d7a54',  // solicitudesAprobadasEnLote (verde)
      '#005BB9',  // solicitudesAprobadasIndividualNegadaPorLote (azul acento)
      '#92400e',  // solicitudesNegadasIndividualAprobadasPorLote (ámbar)
      '#bd0f14',  // solicitudesNegadas (rojo)
      '#253150',  // aprobadaPorLoteNegadaPorAnalista (navy)
      '#7c3aed'   // negadaPorLoteReconsideradaPorGerencia (púrpura)
    ]
  };

  /**
   * Verifica si Chart.js está disponible globalmente.
   * @returns {boolean}
   */
  function _chartDisponible() {
    return typeof Chart !== 'undefined';
  }

  /**
   * Destruye todas las instancias activas de Chart.js.
   * DEBE llamarse antes de re-renderizar para evitar memory leaks.
   */
  function destruirTodos() {
    var keys = Object.keys(_charts);
    for (var i = 0; i < keys.length; i++) {
      if (_charts[keys[i]]) {
        _charts[keys[i]].destroy();
        _charts[keys[i]] = null;
      }
    }
  }

  // ... métodos de renderizado (ver detalle abajo)

  return {
    chartDisponible: _chartDisponible,
    destruirTodos: destruirTodos,
    renderizarDonutLotes: renderizarDonutLotes,
    renderizarDonutSolicitudes: renderizarDonutSolicitudes,
    renderizarStackedBar: renderizarStackedBar,
    renderizarTendencia: renderizarTendencia
  };
})();
```

### 4. Layout: Grid 2×2 entre KPIs y tabla

```html
<!-- Sección de gráficos (insertada entre KPIs y tabla en metricasLotesContenido) -->
<div id="metricasLotesGraficos" class="metricas-lotes__graficos-grid">
  <div class="metricas-lotes__chart-card">
    <h4 class="metricas-lotes__chart-titulo">Proporción Lotes</h4>
    <canvas id="chartDonutLotes"
            role="img"
            aria-label="Gráfico de dona mostrando proporción de lotes aprobados vs negados">
    </canvas>
    <span class="sr-only" id="chartDonutLotes-sr"></span>
  </div>

  <div class="metricas-lotes__chart-card">
    <h4 class="metricas-lotes__chart-titulo">Proporción Solicitudes</h4>
    <canvas id="chartDonutSolicitudes"
            role="img"
            aria-label="Gráfico de dona mostrando proporción de solicitudes aprobadas, negadas y reconsideradas">
    </canvas>
    <span class="sr-only" id="chartDonutSolicitudes-sr"></span>
  </div>

  <div class="metricas-lotes__chart-card">
    <h4 class="metricas-lotes__chart-titulo">Composición por Lote</h4>
    <canvas id="chartStackedBar"
            role="img"
            aria-label="Gráfico de barras horizontales apiladas con composición de métricas por lote">
    </canvas>
    <span class="sr-only" id="chartStackedBar-sr"></span>
  </div>

  <div class="metricas-lotes__chart-card">
    <h4 class="metricas-lotes__chart-titulo">Tendencia Mensual</h4>
    <canvas id="chartTendencia"
            role="img"
            aria-label="Gráfico de barras agrupadas con tendencia de lotes aprobados y negados por mes">
    </canvas>
    <span class="sr-only" id="chartTendencia-sr"></span>
  </div>
</div>
```

### 5. Estilos CSS del grid de gráficos

```css
.metricas-lotes__graficos-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
  margin: var(--space-4) 0;
}

.metricas-lotes__chart-card {
  background: var(--color-mono-0);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  box-shadow: var(--shadow-1);
}

.metricas-lotes__chart-titulo {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-primary-navy);
  margin: 0 0 var(--space-3) 0;
}

.metricas-lotes__chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--color-mono-500);
  font-size: var(--text-sm);
}

.metricas-lotes__chart-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--color-primary-red);
  font-size: var(--text-sm);
}

@media (max-width: 768px) {
  .metricas-lotes__graficos-grid {
    grid-template-columns: 1fr;
  }
}

/* Screen reader only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### 6. Interfaces

#### Función backend: `calcularMetricasLotesHistorico`

| Parámetro | Tipo | Validación | Descripción |
|-----------|------|------------|-------------|
| `cantidadMeses` | `number` | Entero 1-12 | Cantidad de meses hacia atrás desde el mes anterior al actual |

**Retorno:** `Array<{mes: number, anio: number, lotesAprobados: number, lotesNegados: number}>`

- Array ordenado cronológicamente (más antiguo → más reciente)
- Array vacío si parámetro inválido o error

#### Función API: `api_obtenerMetricasLotesHistorico`

| Parámetro | Tipo | Validación | Descripción |
|-----------|------|------------|-------------|
| `cantidadMeses` | `number` | Delegada al servicio | Meses de tendencia |

**Roles permitidos:** `DIRECTOR`, `GERENTE`, `ADMIN`, `LIDER`

**Retorno:** Mismo array que `calcularMetricasLotesHistorico`, o `[]` en error.

#### Sub-módulo `MetricasLotesCharts` — API interna

| Método | Parámetros | Descripción |
|--------|-----------|-------------|
| `chartDisponible()` | — | Retorna `boolean`: true si `window.Chart` existe |
| `destruirTodos()` | — | Destruye 4 instancias activas; evita memory leaks |
| `renderizarDonutLotes(resumen)` | `{lotesAprobados, lotesNegados}` | Donut 2 segmentos |
| `renderizarDonutSolicitudes(resumen)` | `{solicitudesAprobadas, solicitudesNegadas, solicitudesReconsideradas}` | Donut 3 segmentos |
| `renderizarStackedBar(detallePorLote)` | `Array<DetalleLote>` | Stacked bar horizontal (top 10) |
| `renderizarTendencia(historico)` | `Array<{mes, anio, lotesAprobados, lotesNegados}>` | Barras agrupadas |

### Funciones de transformación de datos (puras, testeables)

```javascript
/**
 * Prepara datos para el gráfico donut de lotes.
 * @param {{lotesAprobados: number, lotesNegados: number}} resumen
 * @returns {{labels: string[], data: number[], colors: string[], isEmpty: boolean}}
 */
function _prepararDatosDonutLotes(resumen) { }

/**
 * Prepara datos para el gráfico donut de solicitudes.
 * @param {{solicitudesAprobadas:number, solicitudesNegadas:number, solicitudesReconsideradas:number}} resumen
 * @returns {{labels: string[], data: number[], colors: string[], isEmpty: boolean}}
 */
function _prepararDatosDonutSolicitudes(resumen) { }

/**
 * Prepara datos para el gráfico stacked bar horizontal.
 * Limita a los 10 lotes más recientes si hay más de 10.
 * @param {Array<DetalleLote>} detallePorLote
 * @returns {{labels: string[], datasets: Array<{label:string, data:number[], color:string}>, isEmpty: boolean}}
 */
function _prepararDatosStackedBar(detallePorLote) { }

/**
 * Prepara datos para el gráfico de tendencia mensual.
 * @param {Array<{mes:number, anio:number, lotesAprobados:number, lotesNegados:number}>} historico
 * @returns {{labels: string[], datasets: Array<{label:string, data:number[], color:string}>, isEmpty: boolean}}
 */
function _prepararDatosTendencia(historico) { }
```

## Data Models

### Objeto Resumen (existente, sin cambios)

```javascript
{
  lotesAprobados: number,       // >= 0
  lotesNegados: number,         // >= 0
  solicitudesAprobadas: number, // >= 0
  solicitudesNegadas: number,   // >= 0
  solicitudesReconsideradas: number // >= 0
}
```

### Objeto DetalleLote (existente, sin cambios)

```javascript
{
  fechaLote: string,            // "d/MM/yyyy"
  codigoLote: string,           // e.g. "IND-2025-001"
  resultadoLote: string,        // "APROBADO" | "NEGADO"
  cantidadSolicitudes: number,
  solicitudesAprobadasEnLote: number,
  solicitudesAprobadasIndividualNegadaPorLote: number,
  solicitudesNegadasIndividualAprobadasPorLote: number,
  solicitudesNegadas: number,
  aprobadaPorLoteNegadaPorAnalista: number,
  negadaPorLoteReconsideradaPorGerencia: number
}
```

### Objeto HistoricoMensual (nuevo)

```javascript
{
  mes: number,             // 1-12
  anio: number,            // e.g. 2025
  lotesAprobados: number,  // >= 0
  lotesNegados: number     // >= 0
}
```

### Datos preparados para Chart.js (internos)

```javascript
// Donut
{
  labels: ['Aprobados', 'Negados'],         // o 3 labels para solicitudes
  data: [15, 3],                            // valores numéricos
  colors: ['#0d7a54', '#bd0f14'],           // colores correspondientes
  isEmpty: false                            // true si todos los valores son 0
}

// Stacked Bar / Tendencia
{
  labels: ['IND-001', 'IND-002', ...],      // códigos de lote o meses
  datasets: [
    { label: 'Aprob. en Lote', data: [5, 3, ...], color: '#0d7a54' },
    // ... más datasets
  ],
  isEmpty: false
}
```

## Color Palette

Consistencia con el design system existente (`styles_tokens.html`):

| Uso | Token CSS | Hex | Contexto |
|-----|-----------|-----|----------|
| Aprobado/Éxito | `--color-success` | `#0d7a54` | Donut lotes, donut solicitudes, tendencia |
| Negado/Error | `--color-primary-red` | `#bd0f14` | Donut lotes, donut solicitudes, tendencia |
| Reconsiderado/Warning | `--color-warning` | `#92400e` | Donut solicitudes |
| Stacked 1 (Aprob. en Lote) | `--color-success` | `#0d7a54` | Stacked bar |
| Stacked 2 (Aprob. Indiv/Lote Neg) | — | `#005BB9` | Stacked bar (acento azul) |
| Stacked 3 (Neg. Indiv/Lote Aprob) | `--color-warning` | `#92400e` | Stacked bar |
| Stacked 4 (Negadas) | `--color-primary-red` | `#bd0f14` | Stacked bar |
| Stacked 5 (Aprob Lote/Neg Analista) | `--color-primary-navy` | `#253150` | Stacked bar |
| Stacked 6 (Reconsiderada Gerencia) | — | `#7c3aed` | Stacked bar (púrpura) |

## Chart.js Instance Lifecycle

### Problema

Chart.js no permite re-renderizar sobre un canvas existente sin destruir la instancia previa. Si no se destruye, se acumulan instancias (memory leak) y la interacción produce artefactos visuales.

### Solución: Destroy-before-render

```javascript
// Patrón obligatorio en cada cambio de periodo:
function _actualizarGraficos(datos, historico) {
  // 1. Destruir todas las instancias previas
  MetricasLotesCharts.destruirTodos();

  // 2. Verificar disponibilidad de Chart.js
  if (!MetricasLotesCharts.chartDisponible()) {
    _mostrarErrorGraficos('Visualización no disponible');
    return;
  }

  // 3. Renderizar con datos nuevos
  MetricasLotesCharts.renderizarDonutLotes(datos.resumen);
  MetricasLotesCharts.renderizarDonutSolicitudes(datos.resumen);
  MetricasLotesCharts.renderizarStackedBar(datos.detallePorLote);
  MetricasLotesCharts.renderizarTendencia(historico);
}
```

### Flujo de eventos (periodo change)

1. Usuario cambia selector mes/año → evento `change`
2. `_cargarMetricas()` muestra loading en la sección completa (KPIs + gráficos + tabla)
3. `callServer('api_obtenerMetricasLotes')` → al resolver:
   - Renderiza KPIs
   - Renderiza grid de gráficos (HTML de canvas)
   - Llama `_actualizarGraficos(datos, null)` para los 3 gráficos del periodo
4. `callServer('api_obtenerMetricasLotesHistorico', 6)` → al resolver:
   - Llama `MetricasLotesCharts.renderizarTendencia(historico)` (solo el 4° gráfico)
5. Si la llamada del histórico falla → muestra error solo en el contenedor de tendencia

## Cache Strategy

### Backend (`calcularMetricasLotesHistorico`)

| Clave | Formato | TTL | Invalidación |
|-------|---------|-----|-------------|
| `METRICAS_HIST_{cantidadMeses}` | JSON array | 120s | Time-based (TTL expiry) |

**Justificación del TTL de 120s:** Los datos históricos cambian con menor frecuencia que los del mes actual (solo se modifican si se editan registros pasados). 120s ofrece buen balance entre frescura y performance, alineado con el TTL de `calcularMetricasLotes`.

### Interacción con cache existente

- `calcularMetricasLotes` ya cachea individualmente con clave `METRICAS_LOTES_{mes}_{anio}` (TTL 120s)
- `calcularMetricasLotesHistorico` se beneficia de estos cache hits individuales al iterar por mes
- El cache propio de `METRICAS_HIST_` evita re-ejecutar el loop completo en consultas repetidas

## Graceful Degradation (CDN Failure)

```javascript
/**
 * Verifica disponibilidad de Chart.js post-carga del script CDN.
 * Si no está disponible (CDN bloqueado, timeout, SRI mismatch):
 * - Muestra mensaje de degradación en el grid de gráficos
 * - NO afecta KPIs ni tabla (siguen funcionando normalmente)
 */
function _verificarChartDisponible() {
  if (typeof Chart === 'undefined') {
    var grid = document.getElementById('metricasLotesGraficos');
    if (grid) {
      grid.innerHTML = '<div class="metricas-lotes__chart-error">'
        + '<p>⚠️ La visualización gráfica no está disponible en este momento.</p>'
        + '</div>';
    }
    return false;
  }
  return true;
}
```

**Escenarios de fallo:**
1. CDN completamente inaccesible → `Chart` undefined → mensaje de degradación
2. SRI hash mismatch (CDN comprometido) → browser rechaza script → mismo resultado
3. Timeout de red lento → script carga tardía → retry en siguiente consulta

## Error Handling

| Escenario | Comportamiento | Impacto en UI |
|-----------|---------------|---------------|
| CDN Chart.js falla | Mensaje degradación en grid | KPIs y tabla intactos |
| `api_obtenerMetricasLotes` falla | Estado vacío completo (existente) | Toda la sección muestra estado vacío |
| `api_obtenerMetricasLotesHistorico` falla | Error solo en contenedor tendencia | Los otros 3 gráficos funcionan |
| Resumen con todos valores 0 | Estado vacío en donuts | Stacked bar y tendencia operan independiente |
| DetallePorLote vacío | Estado vacío en stacked bar | Donuts y tendencia operan independiente |
| Histórico vacío o todo ceros | Estado vacío en tendencia | Donuts y stacked bar operan |
| Error en `calcularMetricasLotes` interno | `_registrarEvento_` + return `[]` | Tendencia muestra degradación parcial |

## Chart.js CDN Configuration

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"
        integrity="sha384-PLACEHOLDER_REAL_SRI_HASH"
        crossorigin="anonymous"
        referrerpolicy="no-referrer">
</script>
```

**Notas:**
- La versión exacta `4.4.7` se fija para reproducibilidad (pinned, sin range)
- El hash SRI se obtiene de [srihash.org](https://www.srihash.org/) al momento de implementación
- `crossorigin="anonymous"` requerido para SRI en recursos cross-origin
- `referrerpolicy="no-referrer"` minimiza headers enviados al CDN

## Accessibility

1. **`role="img"`** en cada `<canvas>` — identifica el canvas como imagen para AT
2. **`aria-label`** descriptivo — proporciona contexto semántico del gráfico
3. **`.sr-only` span** debajo de cada gráfico — texto oculto visualmente con resumen numérico:
   - Donut Lotes: "Lotes aprobados: 15, Lotes negados: 3"
   - Donut Solicitudes: "Solicitudes aprobadas: 42, negadas: 8, reconsideradas: 2"
   - Stacked Bar: "Composición de 10 lotes mostrados"
   - Tendencia: "Tendencia 6 meses: Ene 2025: 5 aprobados, 2 negados; ..."

## Testing Strategy

### Property-Based Tests (fast-check)

Las funciones puras de transformación de datos (`_prepararDatosDonutLotes`, `_prepararDatosDonutSolicitudes`, `_prepararDatosStackedBar`, `_prepararDatosTendencia`) y la lógica del endpoint histórico (`calcularMetricasLotesHistorico`) son ideales para PBT dado que tienen inputs variados y propiedades universales verificables.

- **Framework:** fast-check (ya disponible en el proyecto vía vitest)
- **Mínimo 100 iteraciones** por propiedad
- **Generadores custom** para objetos `Resumen`, `DetalleLote` e `HistoricoMensual`

### Unit Tests (vitest)

- Verificar configuración Chart.js (colores, tooltips, leyendas) — tests de ejemplo
- Verificar degradación cuando `Chart` no está disponible — edge case
- Verificar empty states para cada gráfico — edge cases
- Verificar accesibilidad de canvas (role, aria-label) — tests de ejemplo

### Integration Tests

- Verificar que `api_obtenerMetricasLotesHistorico` valida roles correctamente
- Verificar ciclo de vida Chart.js (destroy antes de re-render) via mock
- Verificar que el error en histórico no afecta los otros 3 gráficos

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Donut data preparation preserves totals

*For any* valid resumen object with non-negative integer values for `lotesAprobados` and `lotesNegados`, the prepared donut data SHALL contain exactly 2 elements in `data[]` whose sum equals `lotesAprobados + lotesNegados`, and `isEmpty` SHALL be `true` if and only if both values are zero.

**Validates: Requirements 3.1, 3.4, 4.1, 4.4**

### Property 2: Stacked bar data structure consistency

*For any* non-empty `detallePorLote` array (up to 10 elements), the prepared stacked bar data SHALL produce exactly 6 datasets, each dataset SHALL have `data.length` equal to `labels.length`, and `labels` SHALL match the `codigoLote` values from the input in the same order.

**Validates: Requirements 5.1, 5.2, 5.4**

### Property 3: Top 10 truncation for stacked bar

*For any* `detallePorLote` array with length > 10, the prepared stacked bar data SHALL contain at most 10 labels, and those 10 labels SHALL correspond to the 10 most recent lotes (first 10 elements of the input, which is already sorted by date descending).

**Validates: Requirements 5.5**

### Property 4: Tendencia data transformation preserves order and structure

*For any* valid historico array (1-12 elements with `mes`, `anio`, `lotesAprobados`, `lotesNegados`), the prepared tendencia data SHALL produce exactly 2 datasets (aprobados, negados), labels SHALL be in chronological order matching the input order, and `isEmpty` SHALL be `true` if and only if all `lotesAprobados` and `lotesNegados` values are zero.

**Validates: Requirements 6.2, 6.5**

### Property 5: Endpoint parameter validation (valid and invalid inputs)

*For any* integer value `n` where `1 <= n <= 12`, `calcularMetricasLotesHistorico(n)` SHALL return an array of exactly `n` elements. *For any* value that is not an integer between 1 and 12 (including floats, strings, null, negative numbers, 0, 13+), the function SHALL return an empty array.

**Validates: Requirements 7.1, 7.2**

### Property 6: Historico output chronological ordering

*For any* valid `cantidadMeses` between 1 and 12, the returned array from `calcularMetricasLotesHistorico` SHALL be ordered chronologically such that for each consecutive pair `[i]` and `[i+1]`, the date represented by `(anio[i], mes[i])` is strictly earlier than `(anio[i+1], mes[i+1])`.

**Validates: Requirements 7.3**

### Property 7: Historico consistency with calcularMetricasLotes

*For any* valid `cantidadMeses` and for each element `e` in the returned historico array, `e.lotesAprobados` SHALL equal `calcularMetricasLotes(e.mes, e.anio).resumen.lotesAprobados` and `e.lotesNegados` SHALL equal `calcularMetricasLotes(e.mes, e.anio).resumen.lotesNegados`.

**Validates: Requirements 7.4**

### Property 8: Canvas accessibility attributes presence

*For any* chart rendered by `MetricasLotesCharts` (donut lotes, donut solicitudes, stacked bar, tendencia), the corresponding `<canvas>` element SHALL have `role="img"` attribute, a non-empty `aria-label` attribute, and its sibling `.sr-only` element SHALL contain a non-empty text with numeric data from the chart.

**Validates: Requirements 9.1, 9.2, 9.3**
