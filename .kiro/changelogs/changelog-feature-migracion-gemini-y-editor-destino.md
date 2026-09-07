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