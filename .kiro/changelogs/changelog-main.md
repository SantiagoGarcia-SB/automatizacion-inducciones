# Changelog — main

## [No publicado]

### Agregado
- Se agregó función `obtenerCorreoDeBackup` que busca en la hoja CORREOS si el ejecutivo tiene un backup activo (columna D = TRUE) y retorna el correo de columna C.
- Se integró el correo de backup como CC adicional en los 3 flujos de notificación: radicación exitosa (`enviarLasNotificaciones`), solicitud de paz y salvo (`enviarCorreoPazYSalvo`) y recordatorio diario (`enviarRecordatoriosPazYSalvoDiario`).
