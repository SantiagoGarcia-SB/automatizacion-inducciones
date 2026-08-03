# Requirements Document

## Introduction

Automatización del envío de correos electrónicos de cumplimiento de la Ley 2300 de 2023 (Colombia) para el sistema de Inducciones de El Libertador. Actualmente, el proceso genera un archivo CSV con los datos de contacto por correo y lo adjunta en una notificación a los líderes para que realicen el envío masivo de forma manual. El objetivo es reemplazar ese paso manual por un envío automático de correos electrónicos directamente desde el sistema, similar a como ya se implementó el envío automático de SMS vía Infobip.

La Ley 2300 de 2023 regula las comunicaciones comerciales en Colombia y exige que las empresas informen a los titulares de datos sobre los canales de contacto disponibles, ofreciendo la posibilidad de autorizar o actualizar dichos canales. El mensaje debe enviarse a arrendatarios y codeudores de solicitudes aprobadas, cada 15 días.

## Glossary

- **Sistema_Correos_Ley2300**: Módulo del sistema de Inducciones responsable de enviar correos electrónicos automáticos de cumplimiento de la Ley 2300 a arrendatarios y codeudores de solicitudes aprobadas, utilizando la API de Infobip Email.
- **Destinatario**: Persona (arrendatario o codeudor) que tiene una dirección de correo electrónico registrada en la hoja "registro analisis" y cuya solicitud tiene estado "APROBADO".
- **Corte**: Periodo de procesamiento que abarca las solicitudes aprobadas desde la última ejecución exitosa del proceso (cada 15 días).
- **Plantilla_Correo_Ley2300**: Plantilla de correo electrónico llamada "CORREO LEY 2300" ya configurada en la plataforma de Infobip, que contiene el diseño y texto del mensaje de cumplimiento. Utiliza dos placeholders: `{$firstName}` (nombre del destinatario) y `{$data Inmobiliaria}` (nombre de la inmobiliaria). El sistema solo necesita enviar estas variables de personalización y Infobip se encarga del renderizado final. Nota: esta plantilla es independiente de la plantilla "Ley2300" usada para SMS (ya implementada en Servicios_InfobipSms.js).
- **Registro_Envio**: Marca descriptiva en la columna "Estado Automatización" de la hoja "registro analisis" que indica el resultado combinado del procesamiento de una fila. Los valores posibles son: "Procesado {fecha}" (ambos canales exitosos), "Parcial {fecha} · Email falló" (SMS exitoso, email falló), "Parcial {fecha} · SMS falló" (email exitoso, SMS falló), "Parcial {fecha} · SMS y Email fallaron" (ambos canales fallaron). Cualquier valor no vacío en esta columna impide el reprocesamiento en cortes posteriores.
- **Infobip_Email_API**: Servicio de envío de correos transaccionales de Infobip, accedido mediante UrlFetchApp con las credenciales almacenadas en Script Properties (INFOBIP_BASE_URL, INFOBIP_API_KEY). Permite envío con remitente personalizado, tracking de entregas y sin dependencia de la cuota de MailApp.
- **Dominio_Remitente**: Dominio configurado en Infobip desde el cual se envían los correos (requiere verificación DNS: SPF, DKIM y DMARC). El remitente será una dirección del tipo noreply@ellibertador.co o cumplimiento@ellibertador.co.
- **Estado_Entrega**: Resultado reportado por Infobip para cada mensaje: DELIVERED, REJECTED, UNDELIVERABLE, PENDING.

## Requirements

### Requirement 1: Envío automático de correos vía Infobip Email API

**User Story:** Como líder de inducciones, quiero que el sistema envíe automáticamente los correos de Ley 2300 a los contactos con email de solicitudes aprobadas usando la API de Infobip, para eliminar el paso manual de descarga de CSV y envío masivo externo sin consumir la cuota de MailApp.

#### Acceptance Criteria

1. WHEN el proceso de cumplimiento Ley 2300 se ejecuta y existen destinatarios con correo electrónico, THE Sistema_Correos_Ley2300 SHALL enviar un correo individual a cada Destinatario mediante la Infobip_Email_API utilizando la plantilla "CORREO LEY 2300".
2. THE Sistema_Correos_Ley2300 SHALL incluir en cada correo las variables de personalización requeridas por la plantilla "CORREO LEY 2300": `{$firstName}` con el nombre del Destinatario y `{$data Inmobiliaria}` con el nombre de la inmobiliaria.
3. WHEN tanto el envío de SMS como el envío de Email finalizan para un Corte, THE Sistema_Correos_Ley2300 SHALL escribir en la columna "Estado Automatización" de cada fila procesada un texto descriptivo que refleje el resultado combinado de ambos canales: "Procesado {fecha}" cuando todos los canales enviaron exitosamente, "Parcial {fecha} · Email falló" cuando SMS fue exitoso pero email falló, "Parcial {fecha} · SMS falló" cuando email fue exitoso pero SMS falló, o "Parcial {fecha} · SMS y Email fallaron" cuando ambos canales fallaron.
4. THE Sistema_Correos_Ley2300 SHALL usar como remitente (from) la dirección del Dominio_Remitente verificado en Infobip con el nombre "El Libertador · Inducciones".
5. THE Sistema_Correos_Ley2300 SHALL usar la dirección "autorizacioncanalesdecontacto@ellibertador.co" como replyTo para facilitar que los destinatarios respondan directamente al canal de gestión de autorizaciones.

### Requirement 2: Uso de plantilla de correo existente en Infobip

**User Story:** Como responsable de cumplimiento, quiero que el envío de correos utilice la plantilla "CORREO LEY 2300" ya configurada en Infobip, para mantener consistencia con el contenido aprobado y simplificar el mantenimiento del mensaje.

#### Acceptance Criteria

1. THE Sistema_Correos_Ley2300 SHALL enviar los correos referenciando la plantilla "CORREO LEY 2300" existente en Infobip por su identificador (templateId o nombre de plantilla registrado en la plataforma).
2. THE Sistema_Correos_Ley2300 SHALL enviar como variables de personalización (placeholders) los campos `{$firstName}` con el nombre del Destinatario y `{$data Inmobiliaria}` con el nombre de la inmobiliaria correspondiente.
3. IF la Infobip_Email_API rechaza el envío por plantilla no encontrada o parámetros faltantes, THEN THE Sistema_Correos_Ley2300 SHALL registrar el error con detalle y clasificar al Destinatario como fallido en el reporte.
4. THE Sistema_Correos_Ley2300 SHALL incluir como asunto del correo un texto descriptivo que identifique la comunicación como cumplimiento Ley 2300 (ej: "Información de canales de contacto · Ley 2300").

### Requirement 3: Control de ritmo y envío seguro

**User Story:** Como administrador del sistema, quiero que el envío de correos controle el ritmo de llamadas a la API de Infobip y maneje errores individuales con resiliencia, para evitar rechazos por rate-limiting y asegurar que un fallo aislado no detenga el proceso completo.

#### Acceptance Criteria

1. THE Sistema_Correos_Ley2300 SHALL insertar una pausa de 200 milisegundos entre cada llamada a la Infobip_Email_API para evitar exceder los límites de tasa de la API.
2. IF un correo individual falla durante el envío (respuesta HTTP distinta de 200/201 o error de red), THEN THE Sistema_Correos_Ley2300 SHALL registrar el error en Logs_Sistema con el código de respuesta y el correo del Destinatario, y continuar con el siguiente Destinatario.
3. IF la Infobip_Email_API responde con código HTTP 429 (Too Many Requests), THEN THE Sistema_Correos_Ley2300 SHALL esperar 2 segundos antes de reintentar el envío del mismo correo hasta un máximo de 2 reintentos.
4. THE Sistema_Correos_Ley2300 SHALL verificar que las credenciales de Infobip (INFOBIP_BASE_URL y INFOBIP_API_KEY) estén configuradas en Script Properties antes de iniciar el envío, y registrar un error si faltan.
5. IF más del 50 por ciento de los correos del Corte fallan consecutivamente, THEN THE Sistema_Correos_Ley2300 SHALL detener el envío, registrar un evento de nivel "CRITICAL" en Logs_Sistema y reportar el fallo masivo en el correo a líderes.

### Requirement 4: Reporte consolidado a líderes

**User Story:** Como líder de inducciones, quiero recibir un reporte con el resultado del envío automático de correos, para tener visibilidad del cumplimiento sin necesidad de intervenir manualmente.

#### Acceptance Criteria

1. WHEN el proceso de envío de correos del Corte finaliza, THE Sistema_Correos_Ley2300 SHALL enviar un correo de reporte a los líderes designados (jenny.ascanio@segurosbolivar.com y kharen.garcia@segurosbolivar.com).
2. THE Sistema_Correos_Ley2300 SHALL incluir en el reporte: número de correos enviados exitosamente, número de correos fallidos, rango de fechas del Corte y cantidad de contratos procesados.
3. IF existen correos fallidos en el Corte, THEN THE Sistema_Correos_Ley2300 SHALL incluir en el reporte un resumen de los destinatarios que no pudieron ser notificados (nombre y correo).
4. THE Sistema_Correos_Ley2300 SHALL eliminar el archivo CSV adjunto del reporte cuando todos los correos se envíen exitosamente (ya no se requiere acción manual).
5. IF existen correos fallidos, THEN THE Sistema_Correos_Ley2300 SHALL adjuntar un CSV con los datos de los Destinatarios fallidos para gestión manual.

### Requirement 5: Validación de correos antes del envío

**User Story:** Como administrador del sistema, quiero que los correos electrónicos sean validados antes del envío, para evitar desperdiciar cuota en direcciones con formato inválido.

#### Acceptance Criteria

1. WHEN el Sistema_Correos_Ley2300 prepara la lista de Destinatarios, THE Sistema_Correos_Ley2300 SHALL validar que cada dirección de correo tenga un formato válido (contiene @ y un dominio con punto).
2. IF una dirección de correo tiene formato inválido, THEN THE Sistema_Correos_Ley2300 SHALL excluir ese Destinatario del envío automático e incluirlo en el reporte como "correo inválido".
3. THE Sistema_Correos_Ley2300 SHALL eliminar duplicados de la lista de Destinatarios antes del envío, para evitar enviar múltiples correos al mismo email dentro del mismo Corte.
4. WHEN se detectan duplicados, THE Sistema_Correos_Ley2300 SHALL enviar un solo correo por dirección electrónica única y registrar la cantidad de duplicados eliminados en el reporte.

### Requirement 6: Integración con el flujo existente y configuración

**User Story:** Como desarrollador, quiero que el envío automático de correos se integre con el flujo existente de procesarDatosMejorado() y reutilice la infraestructura de Infobip ya configurada para SMS, para mantener la estabilidad del sistema y minimizar la configuración adicional.

#### Acceptance Criteria

1. THE Sistema_Correos_Ley2300 SHALL ejecutarse dentro de la función procesarDatosMejorado() existente, manteniendo la periodicidad de cada 15 días.
2. THE Sistema_Correos_Ley2300 SHALL ejecutarse después del envío de SMS y antes del envío del reporte a líderes, dentro del mismo Corte.
3. WHEN el envío de correos falla completamente (error crítico), THE Sistema_Correos_Ley2300 SHALL permitir que el proceso de SMS y el marcado de filas continúen sin afectación.
4. THE Sistema_Correos_Ley2300 SHALL utilizar el mismo mecanismo de LockService que usa procesarDatosMejorado() para evitar ejecuciones concurrentes.
5. THE Sistema_Correos_Ley2300 SHALL reutilizar las credenciales INFOBIP_BASE_URL e INFOBIP_API_KEY ya configuradas en Script Properties para el servicio de SMS.
6. THE Sistema_Correos_Ley2300 SHALL requerir una propiedad adicional en Script Properties llamada INFOBIP_EMAIL_FROM con la dirección de remitente verificada en Infobip para el envío de correos.

### Requirement 7: Registro y trazabilidad

**User Story:** Como responsable de cumplimiento, quiero tener un registro completo de cada correo enviado y un marcado claro en la hoja de datos que refleje el resultado del procesamiento, para demostrar el cumplimiento de la Ley 2300 ante auditorías.

#### Acceptance Criteria

1. WHEN un correo se envía exitosamente, THE Sistema_Correos_Ley2300 SHALL registrar en Logs_Sistema: fecha y hora del envío, dirección de correo del Destinatario y nombre del Destinatario.
2. THE Sistema_Correos_Ley2300 SHALL mantener un conteo acumulado de correos enviados y fallidos por cada Corte para inclusión en el reporte consolidado.
3. WHEN el Corte completa el procesamiento, THE Sistema_Correos_Ley2300 SHALL registrar un evento resumen en Logs_Sistema con el total de correos enviados, fallidos y la duración del proceso.
4. THE Sistema_Correos_Ley2300 SHALL escribir la marca en "Estado Automatización" únicamente después de que ambos canales (SMS y Email) completen su procesamiento para el Corte, de modo que el texto refleje el resultado combinado.
5. WHEN una fila tiene un valor no vacío en la columna "Estado Automatización" (ya sea "Procesado..." o "Parcial..."), THE Sistema_Correos_Ley2300 SHALL excluir esa fila del procesamiento en Cortes posteriores.
6. THE Sistema_Correos_Ley2300 SHALL registrar la información detallada de errores de envío (motivo del fallo por destinatario) exclusivamente en el reporte por correo a líderes con CSV adjunto, sin incluir detalles de error en la columna "Estado Automatización" de la hoja.
7. THE Sistema_Correos_Ley2300 SHALL utilizar Logs_Sistema como única hoja de registro de auditoría para el flujo de emails, sin crear hojas adicionales de tracking de envíos.
