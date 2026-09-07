# Requisitos — Configuración administrativa de notificaciones

## Objetivo
Permitir que una persona con rol `ADMIN` gobierne desde la vista **Configuración** qué notificaciones se envían y, para las notificaciones programadas, sus días, frecuencia y hora de ejecución en Colombia.

## Alcance

### Políticas configurables
El sistema debe crear y administrar una política allowlisted para cada flujo:

| ID | Flujo | Tipo | Control administrativo |
|---|---|---|---|
| `recordatorios_diarios` | Recordatorios de Paz y Salvo y Error en Terceros | Programada | Activa, hora, minuto y frecuencia diaria |
| `reporte_gestion` | Reporte de gestión de inducciones | Programada | Activa, días de semana, hora y minuto |
| `reporte_cierre_mensual` | Reportes de cierre por comercial/equipo | Programada | Activa, día del mes, hora y minuto |
| `salud_sistema` | Alertas de salud operativa | Programada | Activa, hora, minuto y frecuencia diaria |
| `cumplimiento_ley_2300` | Corte quincenal y sus correos de resumen | Programada | Activa, intervalo de días, hora y minuto |
| `ingreso_exitoso` | Confirmación de radicación | Evento | Activa |
| `paz_y_salvo` | Solicitud de Paz y Salvo | Evento | Activa |
| `cambio_estado` | Avisos por cambio de estado | Evento | Activa |
| `error_terceros` | Solicitud de corrección por error en terceros | Evento | Activa |
| `correccion_recibida` | Aviso al auxiliar de corrección recibida | Evento | Activa |
| `resultados_lote` | Resultados de inducción | Evento/manual | Activa |

### Reglas funcionales
1. Solo `ADMIN` puede consultar o modificar estas políticas. La autorización se debe aplicar en backend, no solo ocultando la vista.
2. Las políticas programadas se deben persistir en una pestaña `CONFIG_NOTIFICACIONES` del libro de control. La primera lectura debe crearla con los valores actualmente productivos.
3. Al guardar una política programada, se deben validar y reconciliar sus triggers de Apps Script de forma idempotente, sin eliminar triggers ajenos.
4. Las políticas por evento no se pueden reprogramar: su configuración solo habilita o suprime el envío inmediato. La operación de negocio asociada debe continuar aunque el correo esté inactivo.
5. El cambio de configuración debe informar al administrador que Apps Script apunta a la hora solicitada, pero puede ejecutar algunos minutos después.
6. Todas las agendas deben usar explícitamente `America/Bogota`.
7. La interfaz debe presentar nombre, tipo, estado, descripción y la configuración aplicable; debe permitir guardar una política y mostrar el resultado.
8. Los secretos de infraestructura, destinatarios técnicos y propiedades de Infobip no se deben exponer ni editar desde esta pantalla.
9. Todo cambio debe generar auditoría estructurada con actor, política y resultado, sin registrar secretos ni PII innecesaria.

## Criterios de aceptación
- Un `ADMIN` puede desactivar `reporte_gestion`; el trigger correspondiente se elimina y el envío manual también se suprime con una respuesta clara.
- Un `ADMIN` puede configurar los días y la hora del reporte de gestión; tras guardar, solo existen los triggers esperados para ese handler.
- Un `ADMIN` puede cambiar la hora de los recordatorios diarios; los triggers legacy no permanecen activos y no se duplican los envíos.
- Un `ADMIN` puede desactivar una notificación por evento; la persistencia o transición de negocio se completa, pero no se envía correo.
- Un usuario que no sea `ADMIN` no puede obtener ni guardar estas políticas mediante `google.script.run`.
- La aplicación inicializa políticas por defecto coherentes con el comportamiento actual, sin requerir edición manual de la hoja.
- La validación rechaza IDs desconocidos, tipos no permitidos, horas/minutos/días fuera de rango y campos inesperados.

## Fuera de alcance
- No se modifica la plantilla, los destinatarios de negocio ni el contenido de los correos.
- No se exponen secretos, `BCC_AUDITORIA` ni credenciales de Infobip.
- No se difieren ni encolan notificaciones por evento. Si se requiere un horario para ellas, deberá diseñarse posteriormente una cola transaccional y política de reintentos.
- No se cambian los flujos de SMS de Ley 2300; la política gobierna la ejecución programada que procesa sus correos y resumen.
