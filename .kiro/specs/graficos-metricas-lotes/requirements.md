# Requirements Document

## Introduction

Agregar visualización gráfica a la vista de Métricas Operativas de Lotes existente (`components_metricas_lotes.html`). Se incorporan 4 gráficos utilizando Chart.js vía CDN, ubicados siempre visibles entre la sección de KPIs y la tabla de detalle. Tres gráficos consumen datos del endpoint actual (`api_obtenerMetricasLotes`) y un cuarto requiere un nuevo endpoint de tendencia histórica mensual.

## Glossary

- **Sistema_Graficos**: Módulo frontend que renderiza los 4 gráficos dentro de la vista MetricasLotesView usando Chart.js.
- **MetricasLotesView**: IIFE existente que gestiona la vista de métricas operativas de lotes en `components_metricas_lotes.html`.
- **Chart.js**: Librería de gráficos JavaScript cargada vía CDN exclusivamente en la vista de métricas de lotes.
- **Endpoint_Historico**: Función backend `api_obtenerMetricasLotesHistorico(cantidadMeses)` que retorna datos de tendencia mensual.
- **Resumen**: Objeto `{ lotesAprobados, lotesNegados, solicitudesAprobadas, solicitudesNegadas, solicitudesReconsideradas }` retornado por el endpoint actual.
- **DetallePorLote**: Array de objetos con métricas combinadas por lote retornado por el endpoint actual.
- **CacheWrapper**: Abstracción existente sobre CacheService de Apps Script para almacenar/recuperar JSON con fragmentación automática.

## Requirements

### Requirement 1: Carga de Chart.js vía CDN

**User Story:** Como desarrollador, quiero que Chart.js se cargue vía CDN solo en la vista de métricas de lotes, para que no afecte el rendimiento ni el SVGRenderer del dashboard principal.

#### Acceptance Criteria

1. THE Sistema_Graficos SHALL cargar Chart.js desde un CDN público mediante una etiqueta `<script>` dentro del componente `components_metricas_lotes.html`.
2. THE Sistema_Graficos SHALL utilizar una versión fija de Chart.js con la URL completa incluyendo hash de integridad (atributo `integrity` y `crossorigin`).
3. WHEN la vista MetricasLotesView se inicializa, THE Sistema_Graficos SHALL verificar que el objeto global `Chart` está disponible antes de intentar renderizar gráficos.
4. IF Chart.js no se carga correctamente, THEN THE Sistema_Graficos SHALL mostrar un mensaje de error genérico en el contenedor de gráficos indicando que la visualización no está disponible.

### Requirement 2: Contenedor de gráficos y disposición visual

**User Story:** Como usuario con rol de liderazgo, quiero ver los 4 gráficos siempre visibles entre los KPIs y la tabla de detalle, para tener una visión resumida antes de revisar el detalle granular.

#### Acceptance Criteria

1. THE Sistema_Graficos SHALL renderizar una sección de gráficos entre las tarjetas de KPIs y la tabla de detalle dentro de `metricasLotesContenido`.
2. THE Sistema_Graficos SHALL disponer los 4 gráficos en una cuadrícula de 2 columnas en pantallas de escritorio (ancho mayor a 768px).
3. WHEN el ancho de pantalla es menor o igual a 768px, THE Sistema_Graficos SHALL disponer los gráficos en una sola columna apilados verticalmente.
4. THE Sistema_Graficos SHALL asignar a cada gráfico un contenedor con un elemento `<canvas>` y un título descriptivo visible.

### Requirement 3: Gráfico Donut de proporción Lotes Aprobados vs Negados

**User Story:** Como director o gerente, quiero ver un gráfico de dona que muestre la proporción entre lotes aprobados y negados del periodo seleccionado, para evaluar rápidamente la tasa de aprobación.

#### Acceptance Criteria

1. WHEN los datos del Resumen están disponibles, THE Sistema_Graficos SHALL renderizar un gráfico de tipo donut con dos segmentos: lotes aprobados y lotes negados.
2. THE Sistema_Graficos SHALL usar color verde (asociado a éxito) para lotes aprobados y color rojo (asociado a error) para lotes negados.
3. THE Sistema_Graficos SHALL mostrar la cantidad numérica de cada segmento en el tooltip al pasar el cursor.
4. IF ambos valores de Resumen (lotesAprobados y lotesNegados) son cero, THEN THE Sistema_Graficos SHALL mostrar un estado vacío con texto indicativo en lugar del gráfico.
5. THE Sistema_Graficos SHALL incluir una leyenda visible debajo del gráfico identificando cada segmento.

### Requirement 4: Gráfico Donut de proporción Solicitudes

**User Story:** Como director o gerente, quiero ver un gráfico de dona con la proporción de solicitudes aprobadas, negadas y reconsideradas, para entender la distribución de resultados a nivel de solicitud.

#### Acceptance Criteria

1. WHEN los datos del Resumen están disponibles, THE Sistema_Graficos SHALL renderizar un gráfico de tipo donut con tres segmentos: solicitudes aprobadas, solicitudes negadas y solicitudes reconsideradas.
2. THE Sistema_Graficos SHALL usar color verde para aprobadas, color rojo para negadas y color amarillo/naranja (asociado a advertencia) para reconsideradas.
3. THE Sistema_Graficos SHALL mostrar la cantidad numérica de cada segmento en el tooltip al pasar el cursor.
4. IF los tres valores de solicitudes del Resumen son cero, THEN THE Sistema_Graficos SHALL mostrar un estado vacío con texto indicativo en lugar del gráfico.
5. THE Sistema_Graficos SHALL incluir una leyenda visible debajo del gráfico identificando cada segmento.

### Requirement 5: Gráfico Stacked Bar horizontal de composición por lote

**User Story:** Como líder o administrador, quiero ver un gráfico de barras horizontales apiladas que muestre la composición de cada lote con sus 6 métricas combinadas, para comparar la distribución interna de cada lote en un vistazo.

#### Acceptance Criteria

1. WHEN los datos de DetallePorLote están disponibles, THE Sistema_Graficos SHALL renderizar un gráfico de barras horizontales apiladas con una barra por cada lote.
2. THE Sistema_Graficos SHALL apilar 6 segmentos por barra correspondientes a: solicitudesAprobadasEnLote, solicitudesAprobadasIndividualNegadaPorLote, solicitudesNegadasIndividualAprobadasPorLote, solicitudesNegadas, aprobadaPorLoteNegadaPorAnalista y negadaPorLoteReconsideradaPorGerencia.
3. THE Sistema_Graficos SHALL asignar un color distinto y consistente a cada una de las 6 métricas, con una leyenda visible que identifique cada color.
4. THE Sistema_Graficos SHALL usar el código del lote como etiqueta del eje vertical de cada barra.
5. WHEN el DetallePorLote contiene más de 10 lotes, THE Sistema_Graficos SHALL limitar la visualización a los 10 lotes más recientes.
6. IF el DetallePorLote está vacío, THEN THE Sistema_Graficos SHALL mostrar un estado vacío con texto indicativo en lugar del gráfico.
7. THE Sistema_Graficos SHALL mostrar la cantidad numérica de cada segmento en el tooltip al pasar el cursor sobre la barra.

### Requirement 6: Gráfico de barras agrupadas de tendencia mensual

**User Story:** Como director o gerente, quiero ver un gráfico de barras agrupadas con la tendencia de lotes aprobados y negados de los últimos 6 meses, para identificar patrones de evolución en el tiempo.

#### Acceptance Criteria

1. WHEN la vista MetricasLotesView se inicializa, THE Sistema_Graficos SHALL invocar el Endpoint_Historico con cantidadMeses igual a 6.
2. THE Sistema_Graficos SHALL renderizar un gráfico de barras agrupadas con el eje horizontal mostrando cada mes (formato "Mes Año") y dos barras por mes: lotes aprobados y lotes negados.
3. THE Sistema_Graficos SHALL usar color verde para lotes aprobados y color rojo para lotes negados, consistente con el gráfico donut de lotes.
4. THE Sistema_Graficos SHALL mostrar la cantidad numérica en el tooltip al pasar el cursor sobre cada barra.
5. IF el Endpoint_Historico retorna un array vacío o todos los valores son cero, THEN THE Sistema_Graficos SHALL mostrar un estado vacío con texto indicativo en lugar del gráfico.
6. IF la llamada al Endpoint_Historico falla, THEN THE Sistema_Graficos SHALL mostrar un mensaje de error genérico en el contenedor del gráfico de tendencia sin afectar los otros 3 gráficos.

### Requirement 7: Endpoint backend de métricas históricas

**User Story:** Como sistema frontend, quiero consumir un endpoint que retorne datos de lotes aprobados y negados por mes para los últimos N meses, para alimentar el gráfico de tendencia.

#### Acceptance Criteria

1. THE Endpoint_Historico SHALL aceptar un parámetro `cantidadMeses` de tipo entero entre 1 y 12.
2. IF el parámetro `cantidadMeses` no es un entero válido entre 1 y 12, THEN THE Endpoint_Historico SHALL retornar un array vacío.
3. THE Endpoint_Historico SHALL retornar un array de objetos con la estructura `{ mes: number, anio: number, lotesAprobados: number, lotesNegados: number }` ordenado cronológicamente del mes más antiguo al más reciente.
4. THE Endpoint_Historico SHALL calcular los datos reutilizando la lógica existente de `calcularMetricasLotes` para cada mes del rango solicitado.
5. THE Endpoint_Historico SHALL ser accesible solo para usuarios con roles DIRECTOR, GERENTE, ADMIN o LIDER.
6. IF ocurre un error durante el cálculo, THEN THE Endpoint_Historico SHALL registrar el error con `_registrarEvento_` y retornar un array vacío.
7. THE Endpoint_Historico SHALL almacenar el resultado en CacheWrapper con TTL de 120 segundos usando una clave que incluya la cantidad de meses solicitada.

### Requirement 8: Actualización de gráficos al cambiar periodo

**User Story:** Como usuario, quiero que los gráficos se actualicen automáticamente cuando cambio el periodo de consulta, para mantener la coherencia visual con los KPIs y la tabla.

#### Acceptance Criteria

1. WHEN el usuario cambia el mes o año en los selectores de periodo, THE Sistema_Graficos SHALL destruir las instancias previas de Chart.js y renderizar los gráficos con los nuevos datos.
2. WHILE los datos se están cargando, THE Sistema_Graficos SHALL mostrar un indicador de carga en la sección de gráficos.
3. THE Sistema_Graficos SHALL renderizar los 3 gráficos basados en datos del periodo (donuts y stacked bar) usando los mismos datos retornados por `api_obtenerMetricasLotes` sin realizar una llamada adicional.
4. WHEN el periodo cambia, THE Sistema_Graficos SHALL invocar nuevamente el Endpoint_Historico para actualizar el gráfico de tendencia con datos contextuales actualizados.

### Requirement 9: Accesibilidad de los gráficos

**User Story:** Como usuario con discapacidad visual o que usa tecnologías asistivas, quiero que los gráficos tengan atributos de accesibilidad, para poder entender su contenido.

#### Acceptance Criteria

1. THE Sistema_Graficos SHALL incluir un atributo `role="img"` en cada elemento `<canvas>` de gráfico.
2. THE Sistema_Graficos SHALL incluir un atributo `aria-label` descriptivo en cada `<canvas>` que resuma el propósito del gráfico.
3. THE Sistema_Graficos SHALL proporcionar un texto alternativo oculto visualmente (screen-reader only) debajo de cada gráfico con un resumen numérico de los datos representados.
