# Requirements Document

## Introduction

Este feature agrega métricas operativas para los roles de liderazgo (DIRECTOR, GERENTE, ADMIN, LIDER) que permiten visualizar el rendimiento mensual de aprobación/negación de lotes y solicitudes individuales. Incluye un resumen mensual consolidado y una tabla de seguimiento detallada por lote con desglose de estados combinados (resultado de lote, resultado de solicitud y registro del analista SAI).

Los datos provienen de la hoja "registro analisis" del archivo de análisis existente, utilizando las columnas: Fecha Lote, Solicitud Inquilino, codigo lote, RESULTADO LOTE, RESULTADO SOLICITUD y REGISTRO ANALISTA SAI.

## Glossary

- **Sistema_Metricas**: Módulo backend (Google Apps Script) que calcula y expone las métricas operativas de lotes al frontend.
- **Frontend_Metricas**: Interfaz HTML servida por HtmlService que presenta las métricas al usuario.
- **Registro_Analisis**: Hoja "registro analisis" del spreadsheet de análisis que contiene los datos de solicitudes e inducciones.
- **Lote**: Agrupación de solicitudes identificada por un código único (columna "codigo lote").
- **Solicitud**: Registro individual de un inquilino dentro de un lote, identificada por "Solicitud Inquilino".
- **RESULTADO_LOTE**: Resultado del modelo analítico para el lote completo (valores: "APROBADO", "NEGADO").
- **RESULTADO_SOLICITUD**: Resultado individual de la solicitud (valores: "APROBADO", "NEGADO").
- **REGISTRO_ANALISTA_SAI**: Resultado asignado por el analista a cada solicitud (valores: "APROBADO", "NEGADO", o texto que contiene "RECONSIDERADO APROBADO").
- **Fecha_Lote**: Fecha de ingreso del lote, usada para filtrar por mes.
- **Periodo_Mensual**: Rango de un mes calendario (primer día al último día) usado como filtro temporal.

## Requirements

### Requerimiento 1: Resumen Mensual de Lotes Aprobados y Negados

**User Story:** Como director/gerente, quiero ver un resumen mensual de cuántos lotes fueron aprobados vs negados y cuántas solicitudes dentro de esos lotes fueron aprobadas vs negadas, para evaluar el rendimiento de la operación.

#### Criterios de Aceptación

1. WHEN el usuario selecciona un Periodo_Mensual, THE Sistema_Metricas SHALL calcular la cantidad de valores distintos de "codigo lote" cuyo RESULTADO_LOTE, comparado sin distinción de mayúsculas/minúsculas y sin espacios al inicio/final, sea igual a "APROBADO" y cuya Fecha_Lote pertenezca al rango desde el primer día hasta el último día del mes seleccionado.
2. WHEN el usuario selecciona un Periodo_Mensual, THE Sistema_Metricas SHALL calcular la cantidad de valores distintos de "codigo lote" cuyo RESULTADO_LOTE, comparado sin distinción de mayúsculas/minúsculas y sin espacios al inicio/final, sea igual a "NEGADO" y cuya Fecha_Lote pertenezca al rango desde el primer día hasta el último día del mes seleccionado.
3. WHEN el usuario selecciona un Periodo_Mensual, THE Sistema_Metricas SHALL calcular la cantidad de solicitudes cuyo REGISTRO_ANALISTA_SAI, comparado sin distinción de mayúsculas/minúsculas y sin espacios al inicio/final, sea exactamente "APROBADO" (excluyendo valores que contengan "RECONSIDERADO APROBADO") y cuya Fecha_Lote pertenezca al periodo seleccionado.
4. WHEN el usuario selecciona un Periodo_Mensual, THE Sistema_Metricas SHALL calcular la cantidad de solicitudes cuyo REGISTRO_ANALISTA_SAI, comparado sin distinción de mayúsculas/minúsculas y sin espacios al inicio/final, sea exactamente "NEGADO" y cuya Fecha_Lote pertenezca al periodo seleccionado.
5. THE Frontend_Metricas SHALL presentar el resumen mensual mostrando como valores enteros los totales de: lotes aprobados, lotes negados, solicitudes aprobadas y solicitudes negadas.
6. IF una fila del Registro_Analisis tiene Fecha_Lote vacía o RESULTADO_LOTE vacío o REGISTRO_ANALISTA_SAI vacío, THEN THE Sistema_Metricas SHALL excluir dicha fila del conteo correspondiente al campo vacío sin generar error.
7. WHEN el usuario selecciona un Periodo_Mensual, THE Sistema_Metricas SHALL calcular adicionalmente la cantidad de solicitudes cuyo REGISTRO_ANALISTA_SAI contenga el texto "RECONSIDERADO APROBADO" (comparación sin distinción de mayúsculas/minúsculas) y cuya Fecha_Lote pertenezca al periodo seleccionado, presentándolo como un total separado de solicitudes reconsideradas.

### Requerimiento 2: Tabla de Seguimiento de Lotes por Estado

**User Story:** Como director/gerente, quiero ver una tabla de seguimiento que desglosa cada lote con su fecha, código y métricas detalladas por combinación de estados, para identificar patrones y excepciones en la evaluación.

#### Criterios de Aceptación

1. WHEN el usuario consulta la tabla de seguimiento para un Periodo_Mensual, THE Sistema_Metricas SHALL agrupar las solicitudes del Registro_Analisis por codigo_lote (generando una fila por cada codigo_lote único cuya Fecha_Lote pertenezca al periodo), asociando a cada grupo la Fecha_Lote y el RESULTADO_LOTE compartidos por sus solicitudes, aplicando comparaciones de texto case-insensitive y con espacios recortados (trim), y ordenando los resultados por Fecha_Lote descendente (más reciente primero).
2. WHEN el Sistema_Metricas calcula métricas para un lote agrupado, THE Sistema_Metricas SHALL calcular CANTIDAD_DE_SOLICITUDES como el conteo de valores únicos de Solicitud Inquilino dentro de ese lote.
3. WHEN el Sistema_Metricas calcula métricas para un lote agrupado, THE Sistema_Metricas SHALL calcular SOLICITUDES_APROBADAS_EN_LOTE como el conteo de solicitudes donde RESULTADO_SOLICITUD es "APROBADO", RESULTADO_LOTE es "APROBADO" y REGISTRO_ANALISTA_SAI es "APROBADO".
4. WHEN el Sistema_Metricas calcula métricas para un lote agrupado, THE Sistema_Metricas SHALL calcular SOLICITUDES_APROBADAS_INDIVIDUAL_NEGADA_POR_LOTE como el conteo de solicitudes donde REGISTRO_ANALISTA_SAI es "APROBADO", RESULTADO_LOTE es "NEGADO" y RESULTADO_SOLICITUD es "APROBADO".
5. WHEN el Sistema_Metricas calcula métricas para un lote agrupado, THE Sistema_Metricas SHALL calcular SOLICITUDES_NEGADAS_INDIVIDUAL_APROBADAS_POR_LOTE como el conteo de solicitudes donde RESULTADO_SOLICITUD es "NEGADO", RESULTADO_LOTE es "APROBADO" y REGISTRO_ANALISTA_SAI es "APROBADO".
6. WHEN el Sistema_Metricas calcula métricas para un lote agrupado, THE Sistema_Metricas SHALL calcular SOLICITUDES_NEGADAS como el conteo de solicitudes donde RESULTADO_LOTE es "NEGADO", RESULTADO_SOLICITUD es "NEGADO" y REGISTRO_ANALISTA_SAI es "NEGADO".
7. WHEN el Sistema_Metricas calcula métricas para un lote agrupado, THE Sistema_Metricas SHALL calcular APROBADA_POR_LOTE_NEGADA_POR_ANALISTA como el conteo de solicitudes donde RESULTADO_LOTE es "APROBADO" y REGISTRO_ANALISTA_SAI es "NEGADO".
8. WHEN el Sistema_Metricas calcula métricas para un lote agrupado, THE Sistema_Metricas SHALL calcular NEGADA_POR_LOTE_RECONSIDERADA_POR_GERENCIA como el conteo de solicitudes cuyo REGISTRO_ANALISTA_SAI contiene el texto "RECONSIDERADO APROBADO" (búsqueda parcial, case-insensitive, con trim).
9. THE Frontend_Metricas SHALL presentar la tabla ordenada por Fecha Lote descendente con las columnas: Fecha Lote, Código Lote, RESULTADO_LOTE, CANTIDAD_DE_SOLICITUDES, SOLICITUDES_APROBADAS_EN_LOTE, SOLICITUDES_APROBADAS_INDIVIDUAL_NEGADA_POR_LOTE, SOLICITUDES_NEGADAS_INDIVIDUAL_APROBADAS_POR_LOTE, SOLICITUDES_NEGADAS, APROBADA_POR_LOTE_NEGADA_POR_ANALISTA, NEGADA_POR_LOTE_RECONSIDERADA_POR_GERENCIA, mostrando 0 en cada métrica cuyo conteo sea cero.
10. IF una solicitud dentro de un lote tiene RESULTADO_SOLICITUD, RESULTADO_LOTE o REGISTRO_ANALISTA_SAI vacío o nulo, THEN THE Sistema_Metricas SHALL excluir esa solicitud del conteo de las métricas de criterios 3 a 8 pero incluirla en CANTIDAD_DE_SOLICITUDES del criterio 2.

### Requerimiento 3: Filtro por Periodo Mensual

**User Story:** Como director/gerente, quiero filtrar las métricas por mes, para analizar la evolución de la operación en el tiempo.

#### Criterios de Aceptación

1. THE Frontend_Metricas SHALL presentar un selector de Periodo_Mensual que permita elegir mes (enero a diciembre) y año (desde 2024 hasta el año en curso), con el mes y año actuales seleccionados por defecto al cargar la vista.
2. WHEN el usuario carga la vista de métricas o cambia el Periodo_Mensual seleccionado, THE Frontend_Metricas SHALL solicitar al Sistema_Metricas los datos correspondientes al periodo indicado y actualizar la vista con los resultados obtenidos.
3. THE Sistema_Metricas SHALL filtrar las filas del Registro_Analisis incluyendo únicamente aquellas cuya Fecha_Lote sea mayor o igual al primer día del Periodo_Mensual seleccionado y menor o igual al último día de ese mismo mes, utilizando comparación de fecha sin componente horario.
4. WHILE no existan datos para el Periodo_Mensual seleccionado, THE Frontend_Metricas SHALL mostrar un mensaje indicando que no hay registros para el periodo consultado.
5. IF una fila del Registro_Analisis contiene una Fecha_Lote vacía o no interpretable como fecha válida, THEN THE Sistema_Metricas SHALL excluir esa fila del cálculo de métricas para cualquier Periodo_Mensual.

### Requerimiento 4: Control de Acceso a Métricas

**User Story:** Como administrador del sistema, quiero que solo los roles de liderazgo puedan consultar las métricas operativas, para proteger la información sensible de la operación.

#### Criterios de Aceptación

1. WHEN un usuario con rol DIRECTOR, GERENTE, ADMIN o LIDER solicita las métricas, THE Sistema_Metricas SHALL procesar la solicitud y retornar los datos.
2. WHEN un usuario con un rol diferente a DIRECTOR, GERENTE, ADMIN o LIDER solicita las métricas, THE Sistema_Metricas SHALL rechazar la solicitud y retornar un error de autorización sin exponer detalles internos.
3. THE Sistema_Metricas SHALL verificar el rol del usuario mediante la función verificarRol(['DIRECTOR','GERENTE','ADMIN','LIDER']) como primera operación antes de procesar cualquier solicitud de métricas.

### Requerimiento 5: Rendimiento y Caché de Métricas

**User Story:** Como usuario de liderazgo, quiero que las métricas se carguen en un tiempo razonable, para no interrumpir mi flujo de trabajo al consultar los indicadores.

#### Criterios de Aceptación

1. THE Sistema_Metricas SHALL utilizar CacheService para almacenar los resultados de métricas calculadas con un tiempo de vida de 120 segundos, usando una clave de caché que incorpore el Periodo_Mensual solicitado (mes y año).
2. WHEN existe una versión en caché válida para el Periodo_Mensual solicitado, THE Sistema_Metricas SHALL retornar los datos desde caché sin consultar el Registro_Analisis.
3. WHEN no existe caché válida, THE Sistema_Metricas SHALL leer los headers del Registro_Analisis una sola vez, cachearlos con un tiempo de vida de 300 segundos, mapear las columnas necesarias por nombre y leer únicamente las filas cuya Fecha_Lote pertenezca al Periodo_Mensual solicitado.
4. IF el payload de métricas calculadas excede 100 KB, THEN THE Sistema_Metricas SHALL utilizar CacheWrapper_putJSON para almacenar el resultado mediante fragmentación automática.
5. IF el payload de métricas calculadas excede 500 KB, THEN THE Sistema_Metricas SHALL retornar los datos sin almacenarlos en caché y registrar una advertencia mediante _registrarEvento_.
6. IF CacheService o CacheWrapper no están disponibles, THEN THE Sistema_Metricas SHALL calcular las métricas directamente desde el Registro_Analisis y retornar los datos sin interrumpir la respuesta al usuario.

### Requerimiento 6: Exposición de API para Frontend

**User Story:** Como desarrollador del frontend, quiero una función API expuesta via google.script.run que retorne las métricas calculadas, para integrarlas en la interfaz del dashboard.

#### Criterios de Aceptación

1. THE Sistema_Metricas SHALL exponer la función api_obtenerMetricasLotes(mes, anio) donde mes es un entero entre 1 y 12 y anio es un entero de 4 dígitos, que retorne un objeto plano serializable por google.script.run con las propiedades resumen y detallePorLote.
2. IF ocurre un error durante el cálculo de métricas, THEN THE Sistema_Metricas SHALL registrar el error mediante _registrarEvento_ y retornar un objeto con resumen (lotesAprobados: 0, lotesNegados: 0, solicitudesAprobadas: 0, solicitudesNegadas: 0) y detallePorLote como array vacío.
3. THE Sistema_Metricas SHALL retornar en la propiedad resumen un objeto con las propiedades: lotesAprobados, lotesNegados, solicitudesAprobadas, solicitudesNegadas (todos numéricos enteros >= 0); y en la propiedad detallePorLote un array de objetos, cada uno con: fechaLote, codigoLote, resultadoLote, cantidadSolicitudes, solicitudesAprobadasEnLote, solicitudesAprobadasIndividualNegadaPorLote, solicitudesNegadasIndividualAprobadasPorLote, solicitudesNegadas, aprobadaPorLoteNegadaPorAnalista, negadaPorLoteReconsideradaPorGerencia.
4. IF el parámetro mes no es un entero entre 1 y 12 o el parámetro anio no es un entero de 4 dígitos, THEN THE Sistema_Metricas SHALL retornar el mismo objeto de safe-default definido en el criterio 2 sin consultar el Registro_Analisis.
