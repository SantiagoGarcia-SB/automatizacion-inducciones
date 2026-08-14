# Requirements Document

## Introduction

Migración e integración del script de generación de PDFs de resultados de inducciones y envío de correos al ejecutivo comercial. Esta funcionalidad toma los datos calculados por lote desde la hoja "Calculo Lote", genera dos documentos PDF (resultado comercial interno y resultado inmobiliaria) a partir de plantillas de Google Docs con reemplazo de placeholders e inyección de tablas con código de color, y envía un correo con ambos PDFs adjuntos al ejecutivo comercial correspondiente (con copia al director, backup y lista fija de CC). El envío se registra en la hoja "Historico_Envios".

## Glossary

- **Sistema_Resultados**: Módulo del sistema de automatización de inducciones responsable de orquestar la generación de PDFs y el envío del correo de resultados por lote.
- **Calculo_Lote**: Hoja del libro de análisis que contiene los datos calculados de un lote procesado (ID lote, póliza, inmobiliaria, sucursal, conteos de aprobados/negados, montos, tasas, márgenes).
- **Plantilla_Comercial**: Documento de Google Docs que sirve de modelo para generar el PDF de resultado comercial (uso interno, no se comparte con la inmobiliaria).
- **Plantilla_Inmobiliaria**: Documento de Google Docs que sirve de modelo para generar el PDF de resultado para la inmobiliaria (puede compartirse con la inmobiliaria).
- **Placeholder**: Marcador de texto con formato `{{NombreVariable}}` dentro de las plantillas que se reemplaza con datos reales del lote.
- **Tabla_Resultados**: Tabla inyectada en el documento generado que lista las solicitudes del lote con código de color por estado (NEGADO=rojo, APROBADO/ASEGURABLE=verde).
- **Radicacion_Sheet**: Hoja de cálculo externa que contiene los datos de contacto de ejecutivos comerciales y directores por inmobiliaria.
- **Historico_Envios**: Hoja del libro de análisis donde se registra cada envío de resultados con fecha, lote, destinatarios y resultado.
- **Ejecutivo_Comercial**: Persona responsable de la relación con la inmobiliaria, destinatario principal del correo de resultados.
- **Director_Comercial**: Supervisor del ejecutivo comercial, incluido en copia del correo de resultados.
- **Backup_Email**: Correo electrónico de respaldo configurado en la hoja CORREOS, activado por checkbox en la columna correspondiente.
- **CC_Fijo**: Lista de direcciones de correo que siempre se incluyen en copia visible (CC) en todo envío de resultados.
- **BCC_AUDITORIA**: Dirección de correo oculta (BCC) de auditoría que recibe copia de todos los correos enviados por el sistema, almacenada en ScriptProperties.

## Requirements

### Requirement 1: Lectura de datos del lote desde Calculo_Lote

**User Story:** Como operador de inducciones, quiero que el sistema lea los datos calculados de un lote desde la hoja Calculo_Lote, para que se utilicen en la generación de los documentos de resultado.

#### Acceptance Criteria

1. WHEN el operador invoca la generación de resultados para un lote, THE Sistema_Resultados SHALL leer los siguientes campos desde la hoja Calculo_Lote: ID de lote, póliza, inmobiliaria, sucursal, cantidad de solicitudes aprobadas, cantidad de solicitudes negadas, montos totales, tasas y márgenes, considerando como lote activo el único conjunto de datos presente en la hoja Calculo_Lote al momento de la ejecución.
2. IF la hoja Calculo_Lote no contiene datos para el lote solicitado, THEN THE Sistema_Resultados SHALL mostrar una alerta visual al operador en la interfaz de la hoja de cálculo indicando que no se encontraron datos para ese lote, y registrar el evento en Logs_Sistema.
3. IF alguno de los campos obligatorios del lote (ID de lote, póliza, inmobiliaria, sucursal, cantidad de solicitudes aprobadas, cantidad de solicitudes negadas) está vacío o contiene un valor no numérico donde se espera número, THEN THE Sistema_Resultados SHALL abortar la operación, mostrar una alerta visual al operador indicando cuál campo presenta el error, y registrar el detalle en Logs_Sistema.
4. IF los campos numéricos de montos totales, tasas o márgenes están vacíos, THEN THE Sistema_Resultados SHALL tratarlos como cero y continuar la operación sin abortar, registrando una advertencia en Logs_Sistema.

### Requirement 2: Resolución de contactos del ejecutivo comercial

**User Story:** Como operador de inducciones, quiero que el sistema identifique automáticamente el correo del ejecutivo y director comercial a partir de la inmobiliaria del lote, para enviar los resultados a las personas correctas.

#### Acceptance Criteria

1. WHEN el Sistema_Resultados tiene los datos del lote, THE Sistema_Resultados SHALL buscar el correo del Ejecutivo_Comercial en la Radicacion_Sheet utilizando la inmobiliaria como criterio de búsqueda principal y, si no encuentra coincidencia, utilizando la póliza como criterio de búsqueda secundario.
2. WHEN el Sistema_Resultados tiene los datos del lote, THE Sistema_Resultados SHALL buscar el correo del Director_Comercial en la Radicacion_Sheet utilizando el mismo registro que coincidió para el Ejecutivo_Comercial.
3. IF no se encuentra un correo para el Ejecutivo_Comercial que cumpla el formato de email estándar (contenga exactamente un "@" y al menos un "." en el dominio), THEN THE Sistema_Resultados SHALL abortar el envío y registrar el error en Logs_Sistema con el detalle de la inmobiliaria y póliza buscadas.
4. IF el correo del Director_Comercial no se encuentra o no cumple el formato de email estándar, THEN THE Sistema_Resultados SHALL continuar el envío sin incluir al director en copia y registrar una advertencia en Logs_Sistema con la inmobiliaria y el Ejecutivo_Comercial asociado.
5. IF la Radicacion_Sheet no es accesible o no responde dentro de 30 segundos, THEN THE Sistema_Resultados SHALL abortar la operación y registrar el error en Logs_Sistema indicando falla de acceso a la fuente de contactos.
6. IF se encuentran múltiples registros coincidentes en la Radicacion_Sheet para la misma inmobiliaria o póliza, THEN THE Sistema_Resultados SHALL utilizar el primer registro encontrado y registrar una advertencia en Logs_Sistema indicando la duplicidad detectada.

### Requirement 3: Resolución de correo de backup

**User Story:** Como operador de inducciones, quiero que el sistema incluya un correo de backup cuando esté configurado y habilitado, para garantizar que los resultados lleguen a todos los interesados.

#### Acceptance Criteria

1. WHEN se prepara el envío de resultados, THE Sistema_Resultados SHALL consultar la hoja CORREOS en la Radicacion_Sheet para localizar la fila cuyo Ejecutivo_Comercial coincide con el correo encontrado en la resolución de contactos.
2. IF el checkbox de activación del Backup_Email (columna D) está marcado como verdadero (TRUE o booleano nativo), THEN THE Sistema_Resultados SHALL incluir el Backup_Email (columna C) en la lista de CC del correo.
3. IF el checkbox de activación del Backup_Email está marcado como falso, no existe configuración, o la fila del ejecutivo no se encuentra en la hoja CORREOS, THEN THE Sistema_Resultados SHALL omitir el Backup_Email de la lista de CC sin abortar la operación.
4. IF el Backup_Email existe y está activado pero no cumple el formato de email estándar (no contiene "@"), THEN THE Sistema_Resultados SHALL omitir el Backup_Email de la lista de CC y registrar una advertencia en Logs_Sistema indicando el formato inválido.
5. IF la hoja CORREOS no es accesible en la Radicacion_Sheet, THEN THE Sistema_Resultados SHALL continuar el envío sin backup y registrar una advertencia en Logs_Sistema indicando la falta de acceso.

### Requirement 4: Generación del PDF de resultado comercial

**User Story:** Como operador de inducciones, quiero que el sistema genere un PDF de resultado comercial a partir de la plantilla correspondiente, para documentar internamente el resultado del análisis del lote.

#### Acceptance Criteria

1. WHEN se genera el resultado comercial, THE Sistema_Resultados SHALL crear una copia de la Plantilla_Comercial en Google Drive.
2. WHEN la copia está creada, THE Sistema_Resultados SHALL reemplazar cada Placeholder del formato `{{Variable}}` con el valor correspondiente del lote en el documento copiado; si un Placeholder no tiene valor asociado en los datos del lote, THE Sistema_Resultados SHALL reemplazarlo con una cadena vacía.
3. WHEN los placeholders están reemplazados, THE Sistema_Resultados SHALL inyectar la Tabla_Resultados con las solicitudes del lote, aplicando color de fondo rojo (#BD0F14) a las filas con estado NEGADO, color de fondo verde (#3B6D11) a las filas con estado APROBADO o ASEGURABLE, y sin color de fondo a las filas con cualquier otro estado.
4. WHEN la tabla y los placeholders están completos, THE Sistema_Resultados SHALL exportar el documento como PDF.
5. WHEN el PDF está generado, THE Sistema_Resultados SHALL eliminar (enviar a papelera) la copia temporal del documento en Drive.
6. IF ocurre un error durante la generación del PDF comercial, THEN THE Sistema_Resultados SHALL abortar la operación, eliminar la copia temporal si existe, y registrar el error en Logs_Sistema.

### Requirement 5: Generación del PDF de resultado inmobiliaria

**User Story:** Como operador de inducciones, quiero que el sistema genere un PDF de resultado para la inmobiliaria a partir de la plantilla correspondiente, para poder compartirlo externamente.

#### Acceptance Criteria

1. WHEN se genera el resultado inmobiliaria, THE Sistema_Resultados SHALL crear una copia de la Plantilla_Inmobiliaria en Google Drive.
2. WHEN la copia está creada, THE Sistema_Resultados SHALL reemplazar cada Placeholder del formato `{{Variable}}` con el valor correspondiente del lote en el documento copiado; IF un Placeholder no tiene valor correspondiente en los datos del lote, THEN THE Sistema_Resultados SHALL reemplazar ese Placeholder con una cadena vacía.
3. WHEN los placeholders están reemplazados, THE Sistema_Resultados SHALL inyectar la Tabla_Resultados con las solicitudes del lote, aplicando color de fondo rojo (#BD0F14) a las filas con estado NEGADO y color de fondo verde (#3B6D11) a las filas con estado APROBADO o ASEGURABLE.
4. WHEN la tabla y los placeholders están completos, THE Sistema_Resultados SHALL exportar el documento como PDF y retornar el blob resultante para su uso como adjunto en el correo de resultados.
5. WHEN el PDF está generado, THE Sistema_Resultados SHALL eliminar (enviar a papelera) la copia temporal del documento en Drive.
6. IF ocurre un error durante la generación del PDF inmobiliaria, THEN THE Sistema_Resultados SHALL abortar la operación, eliminar la copia temporal si existe, y registrar el error en Logs_Sistema.

### Requirement 6: Envío del correo de resultados

**User Story:** Como operador de inducciones, quiero que el sistema envíe un correo con los PDFs de resultado al ejecutivo comercial con las copias correspondientes, para notificar formalmente los resultados del lote.

#### Acceptance Criteria

1. WHEN ambos PDFs están generados correctamente, THE Sistema_Resultados SHALL enviar un correo electrónico al Ejecutivo_Comercial con ambos PDFs adjuntos (resultado comercial y resultado inmobiliaria).
2. THE Sistema_Resultados SHALL construir la lista de CC concatenando: Director_Comercial (si fue resuelto), Backup_Email (si aplica según Requirement 3), y todos los correos del CC_Fijo; excluyendo direcciones vacías o duplicadas.
3. THE Sistema_Resultados SHALL incluir en BCC la dirección BCC_AUDITORIA (leída desde ScriptProperties) para copia oculta de auditoría.
4. THE Sistema_Resultados SHALL usar una plantilla HTML corporativa construida con los bloques modulares de Notificaciones.js (_envolver_, _bloque_cabecera_, _bloque_barra_estado_, _bloque_cuerpo_inicio_, _bloque_nota_, _bloque_pie_) con los colores de marca de El Libertador (rojo #BD0F14, azul #253150).
5. THE Sistema_Resultados SHALL formatear el asunto del correo como: "✅ Resultados inducciones lote: ID {idLote} — {inmobiliaria}" para facilitar la identificación.
6. THE Sistema_Resultados SHALL invocar _verificarCuotaEmail_(1) antes de intentar el envío para confirmar disponibilidad de al menos 1 correo en la cuota diaria.
7. IF la cuota de email es insuficiente (la función retorna false), THEN THE Sistema_Resultados SHALL abortar el envío, registrar una advertencia en Logs_Sistema, y mostrar un mensaje al operador indicando que se agotó la cuota de correos del día.
8. IF el envío del correo falla por un error técnico, THEN THE Sistema_Resultados SHALL registrar el error en Logs_Sistema con los datos del lote y destinatarios, y no eliminar los PDFs generados para permitir reintento posterior.
9. THE Sistema_Resultados SHALL configurar el campo replyTo como "noreply@ellibertador.co" y el nombre del remitente como "Inducciones · El Libertador S A".

### Requirement 7: Registro en Historico_Envios

**User Story:** Como operador de inducciones, quiero que cada envío de resultados quede registrado en la hoja Historico_Envios, para tener trazabilidad completa de los resultados comunicados.

#### Acceptance Criteria

1. WHEN el correo de resultados se envía exitosamente, THE Sistema_Resultados SHALL registrar una nueva fila al final de la hoja Historico_Envios con los siguientes campos: fecha de emisión en formato dd/MM/yyyy HH:mm:ss (zona horaria America/Bogota), ID de lote, inmobiliaria, póliza, sucursal, cantidad de solicitudes aprobadas, cantidad de solicitudes negadas, resultado final del lote (el valor textual presente en Calculo_Lote para ese lote), y lista de destinatarios del correo (direcciones de TO y CC separadas por coma, excluyendo BCC).
2. WHEN el mismo lote se envía más de una vez, THE Sistema_Resultados SHALL registrar una fila adicional por cada envío sin sobrescribir registros anteriores.
3. IF el registro en Historico_Envios falla, THEN THE Sistema_Resultados SHALL registrar el error en Logs_Sistema, reportar el envío como exitoso al operador (dado que el correo ya fue entregado), y no intentar revertir ni reenviar el correo.
4. IF el registro en Historico_Envios falla, THEN THE Sistema_Resultados SHALL mostrar un aviso al operador indicando que el correo se envió correctamente pero el registro en histórico no pudo completarse.

### Requirement 8: Integración con la arquitectura existente

**User Story:** Como desarrollador, quiero que la funcionalidad se integre con los patrones y convenciones del proyecto existente, para mantener la consistencia arquitectónica.

#### Acceptance Criteria

1. THE Sistema_Resultados SHALL usar SpreadsheetRegistry_get para abrir libros de cálculo, de modo que un mismo ID nunca se abra más de una vez en la misma ejecución del script.
2. THE Sistema_Resultados SHALL usar _registrarEvento_ con nivel ("INFO", "WARN", "ERROR") y módulo de origen para toda operación de logging, sin usar console.log ni Logger.log como canal principal.
3. THE Sistema_Resultados SHALL invocar _verificarCuotaEmail_ con la cantidad exacta de correos a enviar antes de iniciar el envío, y abortar la operación de correo si la función retorna false.
4. THE Sistema_Resultados SHALL envolver cada llamada individual de lectura/escritura a Google Sheets y Google Drive dentro de retry() con los parámetros por defecto del proyecto (4 reintentos, 300 ms de espera).
5. THE Sistema_Resultados SHALL exponer una función en Api.js que siga el patrón existente: verificación de rol mediante verificarRol() con la lista de roles autorizados, bloque try/catch que registre errores con _registrarEvento_, y retorno de un objeto con estructura {ok, mensaje} o equivalente segura en caso de fallo.
6. THE Sistema_Resultados SHALL almacenar los IDs de las plantillas de Google Docs y la hoja de Radicación como variables globales (var) al inicio del módulo, siguiendo el patrón de nomenclatura de ID_HOJA_CONTROL e ID_ARCHIVO_ANALISIS.
7. THE Sistema_Resultados SHALL reutilizar los bloques HTML de Notificaciones.js (_envolver_, _bloque_cabecera_, _bloque_barra_estado_, _bloque_cuerpo_inicio_, _bloque_nota_, _bloque_pie_) para construir el cuerpo del correo de resultados sin duplicar markup inline.
8. THE Sistema_Resultados SHALL adquirir un LockService.getScriptLock() con un timeout máximo de 30 segundos antes de iniciar la generación de PDFs.
9. IF el Sistema_Resultados no logra adquirir el lock dentro del timeout de 30 segundos, THEN THE Sistema_Resultados SHALL abortar la ejecución, registrar un evento de nivel "WARN" con _registrarEvento_, y retornar un objeto de error indicando conflicto de concurrencia sin generar ningún PDF.

### Requirement 9: Menú personalizado en la interfaz de hoja de cálculo

**User Story:** Como operador de inducciones, quiero tener un menú en la barra de la hoja de cálculo del libro de análisis para ejecutar la generación y envío de resultados manualmente, sin necesidad de ir al editor de scripts.

#### Acceptance Criteria

1. WHEN el libro de análisis se abre, THE Sistema_Resultados SHALL registrar un ítem en el menú personalizado de la hoja de cálculo con un nombre descriptivo que identifique la acción de generar y enviar resultados del lote actualmente cargado en Calculo_Lote.
2. WHEN el operador selecciona el ítem del menú, THE Sistema_Resultados SHALL ejecutar el flujo completo de generación de PDFs y envío de correo para el lote indicado en Calculo_Lote, y al finalizar exitosamente SHALL mostrar una notificación en la hoja de cálculo confirmando que el envío se completó con el ID de lote procesado.
3. IF el operador no tiene el rol ADMIN, DIRECTOR, GERENTE o LIDER, THEN THE Sistema_Resultados SHALL mostrar un mensaje indicando que no tiene permisos para ejecutar esta acción y no SHALL ejecutar ninguna operación de generación o envío.
4. IF la ejecución iniciada desde el menú falla por cualquier error durante la generación de PDFs o el envío de correo, THEN THE Sistema_Resultados SHALL mostrar una notificación de error al operador indicando que la operación no pudo completarse, sin exponer detalles técnicos internos.
