# Diseño — Configuración administrativa de notificaciones

## Persistencia y modelo
Se añadirá `CONFIG_NOTIFICACIONES` al libro identificado por `getHojaControlId()`. El repositorio nuevo será la única fuente durable de la configuración; `CacheService` será solo una caché breve invalidada después de cada cambio.

Columnas implementadas:

```
ID | NOMBRE | TIPO | ACTIVA | AGENDA_JSON | ACTUALIZADO_EN | ACTUALIZADO_POR
```

`AGENDA_JSON` contiene únicamente la estructura validada por el servidor: una o más agendas semanales con días/hora/minuto, o una agenda diaria, mensual o por intervalo. Esta representación preserva el horario distinto de lunes a viernes y sábado del reporte de gestión. `ID`, tipo y handler no son editables desde el cliente. Se mantendrán en una allowlist de servidor para impedir que un payload alterado cree triggers arbitrarios.

## Componentes

### NotificationConfigRepo
Responsabilidades:
- Crear la pestaña e inicializar las once políticas con los valores actuales.
- Leer y guardar filas mediante operaciones acotadas.
- Convertir filas a DTOs allowlisted y normalizados.
- Invalidar la caché `CONFIG_NOTIFICACIONES`.

### NotificationPolicyService
Responsabilidades:
- Validar forma, campos permitidos, identificador, tipo y rango de los valores recibidos.
- Resolver si una política está habilitada sin romper el flujo de negocio si la hoja no está disponible: ante una falla de lectura, conservar el comportamiento actual y registrar el error.
- Registrar la auditoría funcional de consultas, cambios y supresiones.

### NotificationTriggerService
Responsabilidades:
- Tener una allowlist fija de handlers administrados y sus constructores de trigger.
- Usar `LockService` para serializar la reconciliación.
- Eliminar exclusivamente triggers de handlers administrados y recrear los de políticas activas.
- Configurar `inTimezone('America/Bogota')` para cada trigger temporal.
- Reemplazar los configuradores particulares de recordatorios, gestión, cierre, salud y cumplimiento como única ruta de reconciliación.
- Mantener el trigger `onEdit` de Paz y Salvo fuera de las agendas temporales; no se elimina al activar/desactivar su política.

## Aplicación de políticas

| Clase | Punto de aplicación | Comportamiento cuando está inactiva |
|---|---|---|
| Programada | Reconciliación de triggers | No se crea trigger; llamadas manuales verifican la política antes de enviar |
| Evento | Inicio del emisor de correo | Registra supresión y retorna; la transacción de negocio continúa |
| Evento/manual | Inicio de la función de envío | La API devuelve una respuesta explícita de que está inactiva |

No se aceptarán nombres de función desde el frontend. Las APIs recibirán un DTO con `id` y los valores permitidos para esa política.

## API interna de Apps Script

```js
api_obtenerConfiguracionNotificaciones()
api_guardarConfiguracionNotificacion(configuracion)
```

Ambas aplican `verificarRol(['ADMIN'])`. La segunda valida el DTO, persiste el cambio, reconcilia solo los triggers administrados y devuelve un objeto `{ ok, mensaje, configuracion }`. Los errores al cliente serán genéricos; el detalle quedará en auditoría.

## Interfaz
La función actual `cargarVistaConfiguracion()` conservará el catálogo de motivos y añadirá una sección **Notificaciones** visible solo para `ADMIN`.

- Tabla/tarjetas con estado, tipo y resumen de agenda.
- Switch para activar/desactivar con confirmación previa.
- Modal de edición condicionado por tipo:
  - diaria: hora y minuto;
  - semanal: días y hora/minuto;
  - mensual: día del mes y hora/minuto;
  - intervalos: cada N días y hora/minuto;
  - evento: solo activación, con texto que confirma envío inmediato ante el evento.
- La UI valida para mejorar experiencia, pero el servidor conserva la validación final.

## Seguridad y resiliencia
- Validación estricta de claves, enumeraciones, rangos y campos adicionales en backend.
- Ninguna respuesta de API contiene propiedades de Script, secretos ni valores BCC.
- `LockService` evita triggers duplicados durante cambios concurrentes.
- El reconciliador es idempotente y solo afecta handlers bajo su allowlist.
- Las notificaciones por evento conservan deduplicación, cuotas, locks y controles de negocio existentes.
- Los logs no deben registrar correos de destinatarios ni contenido de mensajes.

## Migración
1. El primer acceso crea la pestaña con valores actuales.
2. Al guardar por primera vez, el reconciliador elimina los handlers legacy de recordatorios y crea solo el orquestador consolidado si está activo.
3. `verificarSaludDelSistema` se ajustará para comprobar el handler consolidado, no los dos handlers legacy.
4. Se mantendrán las funciones legacy sin triggers como respaldo temporal, pero no serán creadas por el nuevo servicio.
