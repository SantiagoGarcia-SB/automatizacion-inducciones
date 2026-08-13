# Requirements Document

## Introduction

Este feature extiende el dashboard "Métricas Operativas de Lotes" con tres nuevas tarjetas KPI (Total lotes, Lotes en proceso, Total solicitudes) y agrega interactividad de filtrado a todas las tarjetas KPI. Al hacer clic en cualquier tarjeta, la tabla de detalle inferior se filtra para mostrar únicamente las filas relevantes a esa métrica. El filtrado es exclusivamente en el lado del cliente (client-side), operando sobre el array `detallePorLote` ya cargado en memoria.

Los datos adicionales para las nuevas tarjetas (totalLotes, lotesEnProceso, totalSolicitudes) se calculan en el backend como parte de la respuesta existente de `api_obtenerMetricasLotes`, extendiendo el objeto `resumen`.

## Glossary

- **Frontend_Metricas**: Interfaz HTML servida por HtmlService que presenta las métricas operativas de lotes al usuario.
- **Sistema_Metricas**: Módulo backend (Google Apps Script) que calcula y expone las métricas operativas de lotes.
- **Tarjeta_KPI**: Componente visual tipo card que muestra una etiqueta y un valor numérico dentro del grid de KPIs del dashboard.
- **Tabla_Detalle**: Tabla HTML que muestra el desglose por lote (`detallePorLote`) en la vista de métricas.
- **Filtro_Activo**: Estado en el cual una Tarjeta_KPI está seleccionada y la Tabla_Detalle muestra solo las filas correspondientes a esa métrica.
- **RESULTADO_LOTE**: Columna de la hoja "registro analisis" que indica el resultado del lote ("APROBADO", "NEGADO", o vacío/otro valor para lotes en proceso).
- **Lote_En_Proceso**: Lote cuyo RESULTADO_LOTE está vacío o contiene un valor distinto de "APROBADO" y "NEGADO".
- **DetallePorLote**: Array de objetos retornado por el backend que contiene la información agrupada por lote para el periodo seleccionado.

## Requirements

### Requerimiento 1: Nuevas Tarjetas KPI — Total Lotes

**User Story:** Como director/gerente, quiero ver el total de lotes procesados en el periodo (aprobados + negados + en proceso), para tener una visión global del volumen operativo.

#### Criterios de Aceptación

1. WHEN el usuario consulta las métricas para un Periodo_Mensual, THE Sistema_Metricas SHALL calcular `totalLotes` como la cantidad de valores distintos de "codigo lote" cuya Fecha_Lote pertenezca al periodo seleccionado, independientemente del valor de RESULTADO_LOTE.
2. WHEN el Sistema_Metricas retorna el objeto resumen, THE Sistema_Metricas SHALL incluir la propiedad `totalLotes` como entero mayor o igual a cero.
3. THE Frontend_Metricas SHALL presentar una Tarjeta_KPI con la etiqueta "Total Lotes" que muestre el valor de `resumen.totalLotes`.

### Requerimiento 2: Nuevas Tarjetas KPI — Lotes en Proceso

**User Story:** Como director/gerente, quiero ver cuántos lotes están aún en proceso (sin resultado definitivo), para monitorear el trabajo pendiente.

#### Criterios de Aceptación

1. WHEN el usuario consulta las métricas para un Periodo_Mensual, THE Sistema_Metricas SHALL calcular `lotesEnProceso` como la cantidad de valores distintos de "codigo lote" cuya Fecha_Lote pertenezca al periodo seleccionado y cuyo RESULTADO_LOTE, comparado sin distinción de mayúsculas/minúsculas y con trim aplicado, NO sea igual a "APROBADO" ni a "NEGADO" (incluyendo valores vacíos o cualquier otro texto).
2. WHEN el Sistema_Metricas retorna el objeto resumen, THE Sistema_Metricas SHALL incluir la propiedad `lotesEnProceso` como entero mayor o igual a cero.
3. THE Frontend_Metricas SHALL presentar una Tarjeta_KPI con la etiqueta "Lotes en Proceso" que muestre el valor de `resumen.lotesEnProceso`.
4. THE Sistema_Metricas SHALL garantizar que `resumen.totalLotes` sea igual a `resumen.lotesAprobados` + `resumen.lotesNegados` + `resumen.lotesEnProceso` para cualquier periodo consultado.

### Requerimiento 3: Nuevas Tarjetas KPI — Total Solicitudes

**User Story:** Como director/gerente, quiero ver el total de solicitudes individuales procesadas en el periodo, para dimensionar el volumen de trabajo a nivel de solicitud.

#### Criterios de Aceptación

1. WHEN el usuario consulta las métricas para un Periodo_Mensual, THE Sistema_Metricas SHALL calcular `totalSolicitudes` como el conteo total de filas del Registro_Analisis cuya Fecha_Lote pertenezca al periodo seleccionado (representando cada solicitud individual procesada).
2. WHEN el Sistema_Metricas retorna el objeto resumen, THE Sistema_Metricas SHALL incluir la propiedad `totalSolicitudes` como entero mayor o igual a cero.
3. THE Frontend_Metricas SHALL presentar una Tarjeta_KPI con la etiqueta "Total Solicitudes" que muestre el valor de `resumen.totalSolicitudes`.

### Requerimiento 4: Layout del Grid de KPIs Actualizado

**User Story:** Como director/gerente, quiero que las tarjetas KPI se presenten de forma organizada incluyendo las nuevas métricas, para tener una vista completa del resumen operativo.

#### Criterios de Aceptación

1. THE Frontend_Metricas SHALL presentar 8 tarjetas KPI en total, organizadas en el siguiente orden: Total Lotes, Lotes Aprobados, Lotes Negados, Lotes en Proceso, Total Solicitudes, Sol. Aprobadas, Sol. Negadas, Sol. Reconsideradas.
2. THE Frontend_Metricas SHALL actualizar la regla CSS `grid-template-columns` del contenedor `.metricas-lotes__kpis` para acomodar 4 columnas por fila en pantallas de escritorio (`repeat(4, 1fr)`), distribuyendo las 8 tarjetas en 2 filas de 4.
3. WHILE la pantalla tenga un ancho menor o igual a 768px, THE Frontend_Metricas SHALL mostrar las tarjetas en un grid de 2 columnas.
4. WHILE la pantalla tenga un ancho menor o igual a 480px, THE Frontend_Metricas SHALL mostrar las tarjetas en una sola columna.

### Requerimiento 5: Filtrado Interactivo por Clic en Tarjetas KPI

**User Story:** Como director/gerente, quiero hacer clic en cualquier tarjeta KPI para filtrar la tabla de detalle y ver solo los lotes relevantes a esa métrica, para analizar rápidamente subconjuntos específicos de datos.

#### Criterios de Aceptación

1. WHEN el usuario hace clic en la Tarjeta_KPI "Lotes Aprobados", THE Frontend_Metricas SHALL filtrar la Tabla_Detalle para mostrar únicamente filas de DetallePorLote cuyo campo `resultadoLote` sea "APROBADO" (comparación case-insensitive).
2. WHEN el usuario hace clic en la Tarjeta_KPI "Lotes Negados", THE Frontend_Metricas SHALL filtrar la Tabla_Detalle para mostrar únicamente filas de DetallePorLote cuyo campo `resultadoLote` sea "NEGADO" (comparación case-insensitive).
3. WHEN el usuario hace clic en la Tarjeta_KPI "Lotes en Proceso", THE Frontend_Metricas SHALL filtrar la Tabla_Detalle para mostrar únicamente filas de DetallePorLote cuyo campo `resultadoLote` NO sea "APROBADO" ni "NEGADO" (incluyendo valores vacíos o cualquier otro texto, comparación case-insensitive).
4. WHEN el usuario hace clic en la Tarjeta_KPI "Total Lotes", THE Frontend_Metricas SHALL remover cualquier filtro activo y mostrar todas las filas de DetallePorLote.
5. WHEN el usuario hace clic en la Tarjeta_KPI "Total Solicitudes", THE Frontend_Metricas SHALL remover cualquier filtro activo y mostrar todas las filas de DetallePorLote.
6. WHEN el usuario hace clic en la Tarjeta_KPI "Sol. Aprobadas", THE Frontend_Metricas SHALL filtrar la Tabla_Detalle para mostrar únicamente filas de DetallePorLote donde `solicitudesAprobadasEnLote` sea mayor que 0.
7. WHEN el usuario hace clic en la Tarjeta_KPI "Sol. Negadas", THE Frontend_Metricas SHALL filtrar la Tabla_Detalle para mostrar únicamente filas de DetallePorLote donde `solicitudesNegadas` sea mayor que 0.
8. WHEN el usuario hace clic en la Tarjeta_KPI "Sol. Reconsideradas", THE Frontend_Metricas SHALL filtrar la Tabla_Detalle para mostrar únicamente filas de DetallePorLote donde `negadaPorLoteReconsideradaPorGerencia` sea mayor que 0.

### Requerimiento 6: Comportamiento Toggle de Filtro Activo

**User Story:** Como director/gerente, quiero desactivar un filtro haciendo clic nuevamente en la tarjeta seleccionada, para volver a la vista completa sin necesidad de otro control.

#### Criterios de Aceptación

1. WHEN el usuario hace clic en una Tarjeta_KPI que ya tiene Filtro_Activo, THE Frontend_Metricas SHALL desactivar el filtro y mostrar todas las filas de DetallePorLote en la Tabla_Detalle.
2. WHEN el usuario hace clic en una Tarjeta_KPI diferente a la que tiene Filtro_Activo, THE Frontend_Metricas SHALL reemplazar el filtro anterior por el nuevo filtro correspondiente a la tarjeta clickeada.
3. WHILE una Tarjeta_KPI tiene Filtro_Activo, THE Frontend_Metricas SHALL aplicar una clase CSS `metricas-lotes__kpi--active` a esa tarjeta para indicar visualmente el estado seleccionado.
4. WHEN se desactiva un Filtro_Activo, THE Frontend_Metricas SHALL remover la clase CSS `metricas-lotes__kpi--active` de la tarjeta previamente seleccionada.

### Requerimiento 7: Indicador Visual de Tarjeta Activa

**User Story:** Como director/gerente, quiero ver claramente cuál tarjeta está seleccionada, para saber qué filtro estoy aplicando a la tabla.

#### Criterios de Aceptación

1. THE Frontend_Metricas SHALL aplicar a la Tarjeta_KPI con Filtro_Activo un borde inferior de 3px sólido usando el color `var(--color-primary-navy)` como indicador visual.
2. THE Frontend_Metricas SHALL aplicar a la Tarjeta_KPI con Filtro_Activo un efecto de elevación usando `var(--shadow-2)` para diferenciarla de las tarjetas inactivas.
3. THE Frontend_Metricas SHALL aplicar a la Tarjeta_KPI con Filtro_Activo una propiedad `cursor: pointer` para indicar interactividad, y esta misma propiedad a todas las tarjetas KPI en estado normal.
4. WHILE ninguna Tarjeta_KPI tiene Filtro_Activo, THE Frontend_Metricas SHALL mostrar la Tabla_Detalle con todas las filas sin filtrar.

### Requerimiento 8: Filtrado Client-Side sin Afectar Datos en Memoria

**User Story:** Como desarrollador, quiero que el filtrado sea exclusivamente client-side operando sobre los datos ya cargados, para evitar llamadas innecesarias al backend y mantener la experiencia fluida.

#### Criterios de Aceptación

1. THE Frontend_Metricas SHALL almacenar el array completo de DetallePorLote en una variable de módulo al recibir la respuesta del backend, preservando los datos originales sin mutarlos.
2. WHEN se aplica un Filtro_Activo, THE Frontend_Metricas SHALL generar un nuevo array filtrado a partir de los datos originales y re-renderizar únicamente el cuerpo (`tbody`) de la Tabla_Detalle sin modificar el array original.
3. THE Frontend_Metricas SHALL ejecutar el filtrado sin invocar `google.script.run` ni realizar ninguna llamada al backend.
4. WHEN el usuario cambia el Periodo_Mensual y se cargan nuevos datos del backend, THE Frontend_Metricas SHALL desactivar cualquier Filtro_Activo y mostrar los nuevos datos completos.

### Requerimiento 9: Extensión del Objeto Resumen del Backend

**User Story:** Como desarrollador del frontend, quiero que el backend retorne los nuevos conteos (totalLotes, lotesEnProceso, totalSolicitudes) junto con los existentes, para no necesitar calcularlos en el cliente.

#### Criterios de Aceptación

1. THE Sistema_Metricas SHALL extender el objeto `resumen` retornado por `api_obtenerMetricasLotes` para incluir las propiedades adicionales: `totalLotes` (entero >= 0), `lotesEnProceso` (entero >= 0) y `totalSolicitudes` (entero >= 0), sin eliminar ni modificar las propiedades existentes (`lotesAprobados`, `lotesNegados`, `solicitudesAprobadas`, `solicitudesNegadas`, `solicitudesReconsideradas`).
2. THE Sistema_Metricas SHALL calcular `totalLotes` como el conteo de valores distintos de "codigo lote" cuya Fecha_Lote pertenezca al periodo, sin importar el valor de RESULTADO_LOTE.
3. THE Sistema_Metricas SHALL calcular `lotesEnProceso` como `totalLotes` menos `lotesAprobados` menos `lotesNegados`.
4. THE Sistema_Metricas SHALL calcular `totalSolicitudes` como el número total de filas (registros) del Registro_Analisis cuya Fecha_Lote pertenezca al periodo seleccionado.
5. IF ocurre un error o los parámetros son inválidos, THEN THE Sistema_Metricas SHALL retornar los valores safe-default incluyendo `totalLotes: 0`, `lotesEnProceso: 0` y `totalSolicitudes: 0` junto con los safe-defaults existentes.
