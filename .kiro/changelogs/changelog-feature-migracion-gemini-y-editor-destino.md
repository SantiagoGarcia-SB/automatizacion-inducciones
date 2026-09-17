# Changelog — feature/migracion-gemini-y-editor-destino

## [No publicado]

### Agregado
- Se documentaron los requisitos verificables para gestionar entregas, correcciones coordinadas y reintentos selectivos de Ley 2300.
### Agregado
- Se documentaron el diseño técnico y el plan por etapas/agentes para la gestión segura de entregas y reintentos de Ley 2300.
### Agregado
- Se implementó el ledger de entregas Ley 2300 por solicitud, participante y canal, con trazabilidad enmascarada, estados de reintento y conciliación.
- Se agregó la bandeja exclusiva ADMIN para consultar, filtrar y corregir entregas sin exponer contactos completos.
- Se incorporaron pruebas unitarias, de integración y de propiedades para ledger, transportes, corrección coordinada y APIs.

### Cambiado
- Se reemplazó el procesamiento agregado de Ley 2300 por reclamos idempotentes y resultados individuales persistidos antes del reporte administrativo.
- Se actualizó la configuración y documentación para reflejar que el trigger se rige por la agenda ADMIN configurada, no por una frecuencia fija.

### Seguridad
- Se protegieron las huellas de contacto con HMAC opcional, se enmascaró la información operativa y se restringieron los transportes Infobip a HTTPS, dominios permitidos y sin redirecciones.
- Se añadió validación de referencias del proveedor, autorización ADMIN de servidor y corrección coordinada con conciliación ante fallos parciales.
### Cambiado
- Se ajustó la cola de Ley 2300 para cerrar y retirar solo grupos de entregas completamente exitosos, preservando los casos parciales hasta su resolución y evitando reenvíos duplicados.
- Se configuró la bandeja ADMIN para mostrar pendientes accionables por defecto, con acceso explícito a los registros aún no eliminados.

### Corregido
- Se corrigió la depuración de retención para que nunca elimine una entrega exitosa aislada de una solicitud que permanece parcial.

### Corregido
- Se normalizó la Fecha Inicio de Contrato desde formatos Excel y textos inequívocos en español, se validaron valores inválidos por fila y se persistieron fechas reales con formato `dd/MM/yyyy` en la radicación.
- Se ajustó la sincronización para comparar fechas por su valor temporal y evitar actualizaciones innecesarias.
### Agregado
- Se agregó la bitácora `Historial_Estados` para conservar fecha, solicitud, estados anterior y nuevo, usuario y origen de cambios manuales en `Control_General`.

### Corregido
- Se validó la tasa de negociación en cliente y servidor para aceptar únicamente decimales con coma y valores estrictamente mayores que 1 y menores que 5, preservando el valor validado en la radicación y las notificaciones.