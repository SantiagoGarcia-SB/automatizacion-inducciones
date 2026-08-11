# Requirements Document

## Introduction

Este feature agrega filtros interactivos de drill-down y 3 gráficos analíticos a la sección "Inicio" (dashboard) del sistema El Libertador. Los filtros permiten a roles de supervisión (Director, Gerente, Admin, Asesor) segmentar los KPIs y gráficos por Director y/o Comercial. Los gráficos proporcionan visibilidad sobre ranking de producción, cuellos de botella por estado y tendencia semanal de radicaciones.

## Glossary

- **Dashboard**: Sección "Inicio" de la aplicación SPA que muestra KPIs y ahora también gráficos analíticos.
- **Filtro_Director**: Dropdown que permite seleccionar un Director específico para filtrar datos.
- **Filtro_Comercial**: Dropdown que permite seleccionar un Comercial (Consultor) específico para filtrar datos.
- **Drill_Down_Filters**: Componente de UI que contiene los dropdowns de Director y Comercial con lógica de cascada.
- **Chart_Ranking**: Gráfico SVG de barras horizontales que muestra ranking de comerciales por volumen de lotes radicados en el mes actual.
- **Chart_Antiguedad**: Gráfico SVG de barras horizontales que muestra la antigüedad promedio (en días) de lotes por estado.
- **Chart_Tendencia**: Gráfico SVG de línea que muestra lotes radicados por semana (últimas 8 semanas).
- **Lote**: Unidad de trabajo en Control_General; cada lote tiene ID, fecha, estado y comercial asociado.
- **Estado_Lote**: Valor de la columna J (Estado) de Control_General que indica la fase actual del lote.
- **CacheManager**: Almacén en memoria del frontend que cachea datos de la sesión; la clave 'lotes' contiene los datos de api_obtenerTodosLosLotes.
- **SVG_Renderer**: Módulo de frontend que genera gráficos como SVG inline sin dependencias externas.
- **UsuariosRepo**: Repositorio que lee la pestaña USUARIOS y provee datos de jerarquía organizacional.
- **Equipo_Visible**: Conjunto de emails que un usuario puede ver según su rol y posición jerárquica.

## Requirements

### Requirement 1: Visibilidad de filtros según rol

**User Story:** Como usuario con rol de supervisión, quiero ver filtros de drill-down en el dashboard, para poder segmentar los datos por Director o Comercial según mi nivel jerárquico.

#### Acceptance Criteria

1. WHILE el usuario tiene ROL = GERENTE, THE Drill_Down_Filters SHALL renderizar el Filtro_Director y el Filtro_Comercial en la sección de dashboard.
2. WHILE el usuario tiene ROL = DIRECTOR, THE Drill_Down_Filters SHALL renderizar únicamente el Filtro_Comercial en la sección de dashboard.
3. WHILE el usuario tiene ROL = ADMIN o ROL = ASESOR, THE Drill_Down_Filters SHALL renderizar el Filtro_Director y el Filtro_Comercial en la sección de dashboard.
4. WHILE el usuario tiene ROL = CONSULTOR o ROL = COMERCIAL, THE Drill_Down_Filters SHALL permanecer oculto y no renderizar ningún dropdown.

### Requirement 2: Población del Filtro Director

**User Story:** Como Gerente, quiero que el dropdown de Director se llene con los Directores de mi equipo, para seleccionar cuál Director analizar.

#### Acceptance Criteria

1. WHEN el dashboard carga para un usuario con ROL = GERENTE, THE Filtro_Director SHALL listar los Directores cuyos registros en USUARIOS tienen EMAIL_GERENTE igual al email del Gerente logueado y ACTIVO = TRUE.
2. WHEN el dashboard carga para un usuario con ROL = ADMIN o ROL = ASESOR, THE Filtro_Director SHALL listar todos los usuarios con ROL = DIRECTOR y ACTIVO = TRUE.
3. THE Filtro_Director SHALL incluir una opción "Todos" como primera entrada seleccionada por defecto.
4. THE Filtro_Director SHALL obtener la lista de Directores a partir de los datos de UsuariosRepo ya cacheados en el frontend, sin realizar llamadas adicionales al servidor.

### Requirement 3: Población del Filtro Comercial

**User Story:** Como Director o Gerente, quiero que el dropdown de Comercial se llene con los Consultores del Director seleccionado, para analizar la producción individual.

#### Acceptance Criteria

1. WHEN un Director está seleccionado en el Filtro_Director, THE Filtro_Comercial SHALL listar los usuarios cuyos registros tienen EMAIL_DIRECTOR igual al email del Director seleccionado y ACTIVO = TRUE.
2. WHEN el usuario logueado tiene ROL = DIRECTOR, THE Filtro_Comercial SHALL listar los usuarios cuyos registros tienen EMAIL_DIRECTOR igual al email del Director logueado y ACTIVO = TRUE.
3. WHEN la opción "Todos" está seleccionada en el Filtro_Director, THE Filtro_Comercial SHALL listar todos los Comerciales del equipo visible del Gerente logueado.
4. THE Filtro_Comercial SHALL incluir una opción "Todos" como primera entrada seleccionada por defecto.
5. THE Filtro_Comercial SHALL obtener la lista de Comerciales a partir de los datos de UsuariosRepo ya cacheados en el frontend, sin realizar llamadas adicionales al servidor.

### Requirement 4: Comportamiento de cascada de filtros

**User Story:** Como Gerente, quiero que al seleccionar un Director se actualice automáticamente la lista de Comerciales, para navegar la jerarquía de forma intuitiva.

#### Acceptance Criteria

1. WHEN el usuario selecciona un Director en el Filtro_Director, THE Filtro_Comercial SHALL actualizarse inmediatamente para mostrar solo los Comerciales de ese Director y resetear su selección a "Todos".
2. WHEN el usuario selecciona "Todos" en el Filtro_Director, THE Filtro_Comercial SHALL actualizarse para mostrar todos los Comerciales del equipo visible completo.
3. WHEN el usuario selecciona un valor en el Filtro_Director o en el Filtro_Comercial, THE Dashboard SHALL recalcular todos los KPIs y gráficos usando los datos filtrados de CacheManager sin realizar llamadas al servidor.

### Requirement 5: Filtrado local de datos

**User Story:** Como usuario de supervisión, quiero que los filtros operen sobre datos ya cacheados, para obtener resultados instantáneos sin latencia de red.

#### Acceptance Criteria

1. THE Drill_Down_Filters SHALL aplicar el filtrado sobre los datos obtenidos de CacheManager.get('lotes') sin invocar google.script.run.
2. WHEN el CacheManager no tiene datos de lotes cacheados, THE Dashboard SHALL solicitar los datos al servidor mediante api_obtenerTodosLosLotes y cachearlos antes de aplicar el filtrado.
3. THE Drill_Down_Filters SHALL filtrar los lotes comparando el campo "comercial" del lote contra los nombres de los Comerciales del equipo seleccionado.

### Requirement 6: Chart Ranking de Comerciales

**User Story:** Como Director o Gerente, quiero ver un gráfico de barras horizontales que muestre el ranking de Comerciales por volumen de lotes radicados en el mes actual, para identificar quién produce más y quién necesita apoyo.

#### Acceptance Criteria

1. THE Chart_Ranking SHALL renderizarse como un elemento SVG inline dentro de la sección de dashboard.
2. THE Chart_Ranking SHALL mostrar una barra horizontal por cada Comercial del equipo filtrado, ordenadas de mayor a menor volumen.
3. THE Chart_Ranking SHALL contar los lotes cuya fecha pertenezca al mes calendario actual y cuyo estado sea "RADICADO" o posterior en el flujo del proceso.
4. THE Chart_Ranking SHALL mostrar el nombre del Comercial a la izquierda de cada barra y la cantidad numérica al final de cada barra.
5. WHEN el usuario cambia la selección en el Filtro_Director o Filtro_Comercial, THE Chart_Ranking SHALL recalcularse y re-renderizarse con los datos del equipo seleccionado.
6. WHEN un Comercial tiene cero lotes radicados en el mes, THE Chart_Ranking SHALL incluir al Comercial con una barra de longitud cero y valor "0".

### Requirement 7: Chart Antigüedad Promedio por Estado

**User Story:** Como Director o Gerente, quiero ver un gráfico de barras horizontales con la antigüedad promedio de los lotes en cada estado, para identificar cuellos de botella en el pipeline.

#### Acceptance Criteria

1. THE Chart_Antiguedad SHALL renderizarse como un elemento SVG inline dentro de la sección de dashboard.
2. THE Chart_Antiguedad SHALL mostrar una barra horizontal por cada estado que tenga al menos un lote activo (no terminado) en el equipo filtrado.
3. THE Chart_Antiguedad SHALL calcular la antigüedad de cada lote como la diferencia en días entre la fecha actual y la fecha del lote (columna C de Control_General).
4. THE Chart_Antiguedad SHALL mostrar el nombre del estado a la izquierda de cada barra y el promedio en días (redondeado a 1 decimal) al final de cada barra.
5. WHEN el usuario cambia la selección en los filtros, THE Chart_Antiguedad SHALL recalcularse y re-renderizarse con los datos del equipo seleccionado.
6. IF un estado tiene un promedio de antigüedad superior a 5 días, THEN THE Chart_Antiguedad SHALL resaltar esa barra con un color de alerta diferenciado.

### Requirement 8: Chart Tendencia Semanal

**User Story:** Como Director o Gerente, quiero ver un gráfico de línea con la cantidad de lotes radicados por semana en las últimas 8 semanas, para entender si la operación tiene tendencia positiva o negativa.

#### Acceptance Criteria

1. THE Chart_Tendencia SHALL renderizarse como un elemento SVG inline dentro de la sección de dashboard.
2. THE Chart_Tendencia SHALL mostrar un punto por cada una de las últimas 8 semanas calendario completas, conectados por una línea.
3. THE Chart_Tendencia SHALL contar los lotes cuya fecha caiga dentro de cada semana y cuyo estado sea "RADICADO" o posterior.
4. THE Chart_Tendencia SHALL mostrar etiquetas del rango de fechas de cada semana en el eje X y la cantidad de lotes en el eje Y.
5. WHEN el usuario cambia la selección en los filtros, THE Chart_Tendencia SHALL recalcularse y re-renderizarse con los datos del equipo seleccionado.
6. THE Chart_Tendencia SHALL incluir puntos (marcadores circulares) en cada intersección de datos para facilitar la lectura del valor exacto.

### Requirement 9: Renderizado SVG sin dependencias externas

**User Story:** Como desarrollador, quiero que los gráficos se rendericen como SVG inline generado por código vanilla JS, para mantener el bundle size en cero dependencias externas.

#### Acceptance Criteria

1. THE SVG_Renderer SHALL generar los elementos SVG usando document.createElementNS con el namespace 'http://www.w3.org/2000/svg'.
2. THE SVG_Renderer SHALL utilizar únicamente JavaScript nativo del navegador, sin importar ni referenciar bibliotecas de gráficos externas.
3. THE SVG_Renderer SHALL adaptar el ancho del SVG al 100% del contenedor padre para mantener responsividad.
4. THE SVG_Renderer SHALL aplicar un viewBox que permita escalado proporcional en diferentes tamaños de pantalla.

### Requirement 10: Accesibilidad de gráficos

**User Story:** Como usuario con discapacidad visual que usa lector de pantalla, quiero que los gráficos tengan texto alternativo descriptivo, para comprender la información presentada.

#### Acceptance Criteria

1. THE SVG_Renderer SHALL incluir un elemento `<title>` dentro de cada SVG con una descripción del tipo de gráfico y los datos que muestra.
2. THE SVG_Renderer SHALL asignar role="img" y aria-labelledby apuntando al `<title>` en cada elemento SVG raíz.
3. THE SVG_Renderer SHALL utilizar contraste de color mínimo WCAG AA (relación 4.5:1) entre el color de las barras/líneas y el fondo del gráfico.
