# Requirements Document — Gestión de entregas Ley 2300

## Introduction

El flujo actual de Ley 2300 procesa solicitudes aprobadas desde `registro analisis`, envía comunicaciones por Infobip y conserva un resultado agregado por fila en `Estado Automatización`. Cuando un envío falla, el administrador recibe un reporte, pero no puede identificar de forma trazable el participante y canal afectados, corregir el dato desde la aplicación ni reintentar exclusivamente la entrega fallida. Además, una corrección posterior en `Control_General` no se propaga a `registro analisis` cuando la solicitud ya superó los estados que hoy activa la sincronización.

Esta funcionalidad introduce una gestión administrativa de entregas por participante y canal, con corrección coordinada de contactos entre `Control_General` y `registro analisis`, reintentos selectivos según el trigger configurado y trazabilidad segura de cada operación.

## Glossary

- **Entrega Ley 2300**: comunicación individual dirigida a un participante de una solicitud por un canal específico (`EMAIL` o `SMS`).
- **Participante**: inquilino (`INQ`) o codeudor (`COA1` a `COA5`) asociado a una solicitud.
- **Fuente de verdad**: registro de contacto en la hoja `Control_General` del Libro de Control.
- **Proyección de análisis**: copia del contacto en la hoja `registro analisis`, usada por el proceso de cumplimiento.
- **Identidad de solicitud**: valor inmutable `UUID_SISTEMA` que relaciona una solicitud entre ambos libros.
- **Reintento**: nuevo procesamiento de una entrega elegible, realizado exclusivamente por el trigger de Ley 2300 configurado.
- **Estado agregado**: texto en `Estado Automatización`; queda como resumen visible y no controla por sí solo la elegibilidad de entregas.

## Requirements

### Requirement 1: Registro trazable de entregas

**User Story:** Como administrador, quiero que cada envío de Ley 2300 quede registrado por solicitud, participante y canal, para identificar exactamente qué contacto requiere gestión sin inferirlo desde un estado agregado.

#### Acceptance Criteria

1. WHEN el proceso Ley 2300 prepare una comunicación, THE Sistema SHALL crear o reutilizar una entrega identificada por `UUID_SISTEMA`, participante y canal.
2. THE Sistema SHALL conservar para cada entrega el lote, la solicitud, el participante, el canal, el estado, el número de intentos, las fechas relevantes y la referencia del proveedor cuando exista.
3. THE Sistema SHALL distinguir al menos los estados `PENDIENTE`, `EN_PROCESO`, `ENVIADO`, `PENDIENTE_CORRECCION`, `LISTO_PARA_REINTENTO`, `FALLIDO_DEFINITIVO` y `PENDIENTE_CONCILIACION`.
4. THE Sistema SHALL conservar el historial de correcciones e intentos sin reemplazar los registros previos.
5. THE Sistema SHALL continuar mostrando un resumen legible en `Estado Automatización`, derivado de las entregas asociadas a la solicitud.

### Requirement 2: Selección segura e idempotente de entregas

**User Story:** Como responsable de cumplimiento, quiero que el trigger procese solo entregas nuevas o reintentos autorizados, para no duplicar comunicaciones ya aceptadas por el proveedor.

#### Acceptance Criteria

1. WHEN se ejecute `procesarDatosMejorado`, THE Sistema SHALL obtener la frecuencia exclusivamente del trigger configurado en `CONFIG_NOTIFICACIONES`; no aplicará una regla interna fija de 15 días.
2. THE Sistema SHALL seleccionar solicitudes aprobadas con entregas `PENDIENTE` y entregas `LISTO_PARA_REINTENTO` elegibles.
3. THE Sistema SHALL excluir entregas `ENVIADO`, `PENDIENTE_CORRECCION`, `FALLIDO_DEFINITIVO` y `PENDIENTE_CONCILIACION` de un nuevo envío automático.
4. BEFORE invocar Infobip, THE Sistema SHALL marcar la entrega como `EN_PROCESO` y registrar un identificador idempotente del intento.
5. IF el resultado de la llamada al proveedor es ambiguo, THEN THE Sistema SHALL dejar la entrega en `PENDIENTE_CONCILIACION` y SHALL NOT reenviar automáticamente.
6. THE Sistema SHALL actualizar el resultado de cada entrega independientemente, incluso cuando otras entregas del mismo lote fallen.

### Requirement 3: Clasificación y reintento de fallos

**User Story:** Como administrador, quiero que el sistema diferencie fallos de datos y fallos técnicos, para aplicar la acción correcta a cada entrega.

#### Acceptance Criteria

1. THE Sistema SHALL clasificar los fallos como `DATOS_CONTACTO`, `TEMPORAL`, `CONFIGURACION`, `RECHAZO_DEFINITIVO` o `AMBIGUO`.
2. IF el fallo es de datos de contacto, THEN THE Sistema SHALL dejar la entrega en `PENDIENTE_CORRECCION` y SHALL NOT reintentarla hasta una corrección válida.
3. IF el fallo es temporal, THEN THE Sistema SHALL programar el reintento de esa entrega hasta el máximo de intentos permitido por la política.
4. IF se alcanza el máximo de intentos o el proveedor informa un rechazo definitivo, THEN THE Sistema SHALL marcar la entrega como `FALLIDO_DEFINITIVO`.
5. THE Sistema SHALL conservar el comportamiento de reintento HTTP 429 del canal de email y SHALL registrar su resultado en la entrega.
6. THE Sistema SHALL aplicar el circuit breaker solo después de un mínimo significativo de fallos consecutivos y SHALL conservar como pendientes las entregas no procesadas por la interrupción.

### Requirement 4: Corrección coordinada de contactos

**User Story:** Como administrador, quiero corregir un correo o celular fallido desde la aplicación, para que el dato quede consistente en la Base de Lotes y en Análisis antes del siguiente trigger.

#### Acceptance Criteria

1. THE Sistema SHALL permitir esta operación exclusivamente a usuarios con rol `ADMIN`.
2. THE Sistema SHALL resolver en servidor la entrega y su solicitud mediante una identidad estable; SHALL NOT confiar en número de fila, nombre de columna ni UUID aportado como autoridad por el cliente.
3. WHEN un administrador corrija un contacto, THE Sistema SHALL actualizar el campo permitido correspondiente en `Control_General` y su proyección homónima en `registro analisis`, vinculadas por `UUID_SISTEMA`.
4. THE Sistema SHALL permitir únicamente los participantes `INQ`, `COA1`, `COA2`, `COA3`, `COA4` y `COA5`, y los campos `TEL` o `CORREO` asociados a cada participante.
5. THE Sistema SHALL validar, normalizar y limitar el contacto en servidor antes de escribirlo.
6. IF no se logra actualizar ambos libros, THEN THE Sistema SHALL reportar la operación como no completada, registrar un evento técnico sin PII y mantener una señal de conciliación para evitar divergencia silenciosa.
7. WHEN la corrección coordinada termine correctamente, THE Sistema SHALL mover solo la entrega afectada a `LISTO_PARA_REINTENTO`.
8. THE Sistema SHALL conservar quién realizó la corrección, cuándo la realizó, el tipo de campo corregido y los valores anterior/nuevo enmascarados.

### Requirement 5: Experiencia administrativa de gestión

**User Story:** Como administrador, quiero una bandeja de entregas Ley 2300 pendientes, para corregir y monitorear los casos sin descargar ni procesar CSV manualmente.

#### Acceptance Criteria

1. THE Sistema SHALL mostrar una sección exclusiva de ADMIN denominada `Entregas Ley 2300`.
2. THE Sistema SHALL mostrar una lista paginada y filtrable por lote, solicitud, participante, canal, estado, tipo de fallo y fecha.
3. THE Sistema SHALL mostrar los correos y celulares enmascarados en listas, detalles, toasts y reportes de interfaz.
4. THE Sistema SHALL permitir abrir un detalle con estado, motivo resumido, historial de intentos y enlace contextual al lote.
5. WHEN una entrega esté en `PENDIENTE_CORRECCION`, THE Sistema SHALL mostrar una acción `Corregir contacto` que habilite solo el campo correspondiente al canal fallido.
6. WHEN se guarde una corrección, THE Sistema SHALL confirmar que el dato se actualizó en Base de Lotes y Análisis y que se procesará en la siguiente ejecución configurada.
7. THE Sistema SHALL mostrar la próxima ejecución estimada y la frecuencia vigente de la política `cumplimiento_ley_2300`.

### Requirement 6: Reportes y observabilidad

**User Story:** Como administrador, quiero recibir reportes accionables y observar fallos sin exponer datos personales, para gestionar el cumplimiento y resolver incidentes con rapidez.

#### Acceptance Criteria

1. THE Sistema SHALL incluir en el reporte a ADMIN los conteos de entregas enviadas, pendientes de corrección, listas para reintento, definitivamente fallidas y pendientes de conciliación.
2. IF existen entregas que requieren gestión, THEN THE Sistema SHALL incluir una referencia a la bandeja administrativa como mecanismo principal de acción.
3. THE Sistema MAY conservar una exportación CSV, pero SHALL incluir `ID Lote`, participante, canal y estado; los destinos deberán estar enmascarados.
4. THE Sistema SHALL registrar eventos estructurados sin correos, celulares, tokens, cuerpos de proveedor ni otros PII.
5. THE Sistema SHALL registrar métricas de la ejecución: entregas seleccionadas, enviadas, fallidas, reintentadas, pospuestas por circuit breaker y duración.

### Requirement 7: Seguridad, autorización y consistencia

**User Story:** Como responsable de seguridad, quiero que la gestión de datos de contacto y reintentos aplique controles del lado servidor, para proteger información personal y evitar operaciones no autorizadas.

#### Acceptance Criteria

1. THE Sistema SHALL validar el esquema completo de cada solicitud de escritura y rechazar claves inesperadas.
2. THE Sistema SHALL aplicar autorización ADMIN del lado servidor a las APIs de entregas y corrección.
3. THE Sistema SHALL usar `LockService` o un control de concurrencia equivalente para evitar que una corrección compita con el trigger de entrega.
4. THE Sistema SHALL aplicar control de versión o estado esperado antes de modificar una entrega.
5. THE Sistema SHALL retornar mensajes genéricos a interfaz y registrará el detalle técnico solo de forma sanitizada.
6. THE Sistema SHALL invalidar las cachés de entregas, lotes y detalles relacionados después de una corrección exitosa.

### Requirement 8: Compatibilidad y migración

**User Story:** Como responsable operativo, quiero que la funcionalidad se active sin perder el histórico actual ni afectar solicitudes ya procesadas.

#### Acceptance Criteria

1. THE Sistema SHALL inicializar la nueva hoja de control de entregas de forma idempotente con encabezados controlados.
2. THE Sistema SHALL mantener las marcas existentes de `Estado Automatización` como historial visible.
3. THE Sistema SHALL crear entregas nuevas para solicitudes aprobadas que aún no tengan una entrega registrada.
4. THE Sistema SHALL tratar las marcas históricas `Parcial` como casos pendientes de revisión, sin reenviar comunicaciones automáticamente durante la migración.
5. THE Sistema SHALL documentar la configuración, el procedimiento de corrección, la política de reintentos y la reversión operativa.
