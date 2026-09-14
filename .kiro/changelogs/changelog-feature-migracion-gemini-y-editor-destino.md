# Changelog — feature/migracion-gemini-y-editor-destino

## [No publicado]

### Agregado
- Se creó la especificación de configuración administrativa de notificaciones, incluyendo requisitos, diseño y tareas para habilitar agendas y activación de correos por ADMIN.
- Se agregó el gobierno de notificaciones para ADMIN: persistencia de políticas, validación allowlisted, reconciliación segura de triggers y controles de activación para correos programados y por evento.
- Se agregó la sección Notificaciones en Configuración, con edición de horarios, días, frecuencia y activación de los flujos permitidos.

### Cambiado
- Se reorganizó el modal de notificaciones con secciones de estado y programación, agenda semanal estructurada y adaptación responsive para mejorar la usabilidad administrativa.


### Corregido
- Se bloqueó la radicación de planillas sin contratos detectados, evitando registros exitosos sin filas en `Control_General` y el envío de correos con cero contratos.
- Se endureció la validación de la planilla oficial: ahora exige los metadatos A1:B3 y los 39 encabezados A4:AM4 en su orden canónico, con rechazo explícito de columnas adicionales o desplazadas.
- Se actualizó el modelo predeterminado de validación de Destino a `gemini-3.5-flash-lite`.

### Agregado
- Se agregó para DIRECTOR el selector de alcance por gerencia: equipo propio, equipo de un Director par autorizado o toda la gerencia, validado en servidor por `EMAIL_GERENTE`.
- Se agregó validación de alcance y control de acceso por recurso para el detalle de lotes, junto con pruebas unitarias de aislamiento entre gerencias.

### Cambiado
- Se unificó el contenido de los recordatorios diarios de Paz y Salvo y Error en terceros en una plantilla cordial, sin conteo de días, que solicita responder a todos el correo según el pendiente.
- Se reutilizó el trigger consolidado `ejecutarRecordatoriosDiarios`: cada lote pendiente recibe como máximo un recordatorio por día después de un envío exitoso.
- Se propagó el alcance seleccionado de Director a dashboard, lotes, solicitudes, errores, usuarios y métricas, separando sus cachés por equipo autorizado.

### Corregido
- Se corrigió el reinicio del conteo y el límite aparente de tres días: BI ahora representa exclusivamente el último envío exitoso del recordatorio diario.
- Se corrigió el aviso inicial de Error en terceros para indicar responder a todos y reportar al usuario si el correo no pudo enviarse.
