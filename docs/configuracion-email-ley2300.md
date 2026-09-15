# Configuración operativa — Gestión de Entregas Ley 2300

## Propósito y alcance

La Gestión de Entregas Ley 2300 registra y controla cada comunicación para solicitudes aprobadas por **UUID, participante y canal**. El procesamiento lo ejecuta `procesarDatosMejorado()` mediante el trigger ya administrado por la política `cumplimiento_ley_2300` de `CONFIG_NOTIFICACIONES`; **no tiene una frecuencia fija embebida**. La activación y la agenda vigente se configuran desde la bandeja **ADMIN**, que también concentra la gestión accionable de entregas.

El ledger persiste únicamente identificadores operativos, estados, metadatos de intento y destinos enmascarados. No se guardan destinos completos ni se incluyen contactos en reportes, diagnósticos o bitácoras.

## Precondiciones de correo

- Cuenta de Infobip con Email API habilitada.
- Dominio remitente verificado con SPF, DKIM y DMARC.
- Plantilla **`CORREO LEY 2300`** activa, con `{$firstName}` y `{$data Inmobiliaria}`.
- Acceso ADMIN a la configuración del proyecto y a la bandeja de Entregas Ley 2300.

## Script Properties

| Propiedad | Uso | Obligatoria |
|---|---|---|
| `INFOBIP_BASE_URL` | Base URL de Infobip, compartida con SMS. | Sí |
| `INFOBIP_API_KEY` | Credencial de Infobip, compartida con SMS. | Sí |
| `INFOBIP_EMAIL_FROM` | Remitente de correo verificado. | Sí, para EMAIL |
| `INFOBIP_EMAIL_TEMPLATE_ID` | ID numérico de la plantilla `CORREO LEY 2300`. | Sí, para EMAIL |
| `INFOBIP_SENDER` | Remitente SMS cuando aplique. | Según canal SMS |
| `LEY2300_HMAC_SECRET` | Secreto para calcular la huella HMAC-SHA-256 del destino normalizado. | **Opcional, recomendado** |

Configure las propiedades en **Configuración del proyecto → Propiedades del script**. Nunca copie valores de credenciales, secretos, teléfonos ni correos en hojas, documentación, logs o tickets. Si `LEY2300_HMAC_SECRET` no está configurada, la operación continúa conservando solo la máscara del destino; se recomienda definirla para mejorar la correlación segura de correcciones y conciliaciones.

## Ejecución, bandeja ADMIN y estados

La ejecución programada solo procesa entregas elegibles mientras `cumplimiento_ley_2300` esté activa. La configuración o reconciliación del trigger corresponde a la agenda guardada por ADMIN; no cree un trigger paralelo ni asuma una periodicidad fija.

La bandeja **ADMIN de Entregas Ley 2300** inicia en **Solo trabajo pendiente** y muestra `PENDIENTE`, `EN_PROCESO`, `PENDIENTE_CORRECCION`, `LISTO_PARA_REINTENTO`, `PENDIENTE_CONCILIACION` y `FALLIDO_DEFINITIVO`. `ENVIADO` queda oculto por defecto; el selector explícito **Todos los registros no eliminados** permite consultar el histórico aún presente. Restablecer filtros vuelve siempre al alcance pendiente. Los destinos permanecen enmascarados y la gestión prioriza correcciones o conciliaciones. Los estados de entrega son:

| Estado | Interpretación y acción operativa |
|---|---|
| `PENDIENTE` | Entrega creada, aún no reclamada por el proceso. |
| `EN_PROCESO` | Intento reclamado; no debe duplicarse ni editarse manualmente. |
| `ENVIADO` | Confirmado por el proveedor; estado terminal. |
| `PENDIENTE_CORRECCION` | El contacto requiere ajuste coordinado desde ADMIN. |
| `LISTO_PARA_REINTENTO` | Fallo temporal o de configuración recuperable; se intenta en la siguiente ejecución configurada cuando corresponda. |
| `FALLIDO_DEFINITIVO` | Rechazo definitivo o máximo de intentos alcanzado; requiere gestión operacional, no reintento automático. |
| `PENDIENTE_CONCILIACION` | Resultado ambiguo o una operación incompleta; requiere validar evidencia antes de cualquier cambio. |

La marca `Estado Automatización` en `registro analisis` es un resumen derivado del ledger: `Procesado` si todas las entregas están enviadas; `Parcial · Pendiente de conciliación` ante un caso ambiguo; en los demás casos, `Parcial · Requiere gestión`.

Al confirmar una marca `Procesado`, la misma sección protegida por el `ScriptLock` elimina el **grupo completo** de entregas de ese UUID y sus eventos u operaciones asociados. Se conserva únicamente una auditoría agregada, sin UUID ni datos de contacto, en `Cierres_Ley2300`. La siguiente ejecución omite la fuente `Procesado`, por lo que no recrea ni reenvía contactos resueltos. Un UUID parcial conserva todas sus entregas —incluso las ya `ENVIADO`— hasta que el grupo pueda cerrarse completo.

## Corrección coordinada y reintentos

Para una entrega en `PENDIENTE_CORRECCION`, ADMIN corrige el contacto desde la bandeja. La operación registra una saga en `Operaciones_Ley2300` y actualiza de forma verificada los dos orígenes: `Control_General` y `registro analisis`. Solo cuando ambas escrituras se completan, la entrega pasa a `LISTO_PARA_REINTENTO`; de lo contrario la operación y la entrega quedan en conciliación. No edite directamente el ledger ni cambie la fila en un solo libro.

Los reintentos solo se habilitan para causas recuperables y respetan el máximo configurado por la entrega. El circuito de correo detiene nuevas invocaciones EMAIL tras cinco fallos consecutivos durante la ejecución; las entregas omitidas permanecen pendientes para la siguiente agenda configurada. Los rechazos definitivos, resultados ambiguos y entregas ya enviadas no se reintentan automáticamente.

## Conciliación y migración segura de históricos

Las entregas con respuesta ambigua del proveedor se mantienen en `PENDIENTE_CONCILIACION`. ADMIN debe contrastar la evidencia disponible sin exponer contactos, completar o cerrar la operación registrada y dejar la trazabilidad en las hojas append-only correspondientes.

Durante la migración de históricos, una marca preexistente `Parcial` sin entregas en el ledger se crea como entrega de conciliación con causa `AMBIGUO`; no se envía nada, no consume intentos y no altera contactos. Revise primero el resultado en ADMIN y resuelva los casos antes de habilitar reintentos. No borre ni reconstruya filas históricas del ledger para “reiniciar” un caso.

## Hojas y retención

El Libro de Control contiene las hojas del dominio:

- `Entregas_Ley2300`: estado actual por entrega mientras el caso esté activo.
- `Entregas_Ley2300_Eventos`: bitácora append-only de transiciones mientras el caso esté activo.
- `Operaciones_Ley2300`: saga append-only de correcciones y conciliaciones mientras el caso esté activo.
- `Cierres_Ley2300`: auditoría agregada del cierre automático, sin PII ni UUIDs.
- `Cierres_Ley2300_Pendientes`: marcador técnico temporal, protegido por el lock, que permite reanudar un cierre interrumpido antes de registrar su auditoría final.
- `Retencion_Ley2300`: auditoría agregada de depuraciones manuales autorizadas.

`Control_General` y `registro analisis` son las fuentes coordinadas de contacto. Los destinos se conservan enmascarados y las huellas HMAC no sustituyen la protección de datos. La retención máxima de datos y bitácoras operativas de este proceso es de **90 días**; la depuración debe ser autorizada, trazable y no debe eliminar casos sujetos a conciliación o auditoría vigente.

## Diagnóstico manual seguro

Ejecute `diagnosticarGestionEntregasLey2300()` desde el editor de Apps Script para un preflight de solo lectura. La función no envía SMS/correos, no crea triggers, no crea hojas, no escribe celdas y no invoca transportes. El resultado y el log contienen únicamente:

- disponibilidad enmascarada de las hojas de control, análisis y ledger;
- presencia booleana de las Script Properties, incluido si `LEY2300_HMAC_SECRET` está configurada, sin sus valores;
- presencia de la política y del trigger `procesarDatosMejorado`, sin revelar agenda;
- conteos agregados de entregas por estado y encabezados faltantes, si aplica.

`TestUtils.js` está excluido de `clasp push`; ejecute o distribuya esta utilidad por el canal de desarrollo autorizado antes de usarla en el editor remoto. No use `testEnvioLey2300()` como verificación previa general: esa utilidad puede enviar comunicaciones reales de prueba.

## Troubleshooting

| Hallazgo | Acción segura |
|---|---|
| Propiedad de Infobip ausente | Configurarla en Script Properties; no registrar ni compartir su valor. |
| `LEY2300_HMAC_SECRET` ausente | La operación no se bloquea, pero configurar un secreto robusto y gestionado mejora la correlación segura. |
| Hoja o encabezado incompatible | Detener la gestión, validar el esquema canónico y no crear/reemplazar hojas manualmente. |
| Muchas entregas en `LISTO_PARA_REINTENTO` | Revisar configuración y disponibilidad del proveedor; esperar la siguiente ejecución configurada. |
| Entregas en conciliación | Resolver desde ADMIN con evidencia y sin editar directamente las tres hojas del ledger. |
| Trigger no visible o política inactiva | Revisar `CONFIG_NOTIFICACIONES` como ADMIN; no crear un trigger alterno. |


## Controles adicionales de operación

- **Recuperación de reclamos:** antes de crear o seleccionar nuevas entregas, cada ejecución recupera reclamos `EN_PROCESO` vencidos a `PENDIENTE_CONCILIACION` mediante control de versión y evento sanitizado. No reenvía esos casos. La bandeja permite filtrarlos y conciliarlos con evidencia.
- **URL de Infobip:** `INFOBIP_BASE_URL` debe ser una URL base HTTPS oficial de Infobip, sin ruta, query, credenciales ni puerto distinto de `443`; se admiten `api.infobip.com` y subdominios regionales `*.api.infobip.com`. Direcciones IP, hosts privados, `localhost`, HTTP, puertos alternos y hosts externos se rechazan antes de crear un payload o enviar API key/PII. La allowlist no sustituye el control institucional de DNS.
- **Filtros y agenda:** ADMIN puede filtrar por lote, solicitud, participante, canal, estado, causa y fecha de creación (rango ISO inclusivo). El resumen muestra la agenda vigente de `CONFIG_NOTIFICACIONES` y una próxima ejecución estimada. Apps Script puede variar el instante real; no use esa estimación como evidencia de ejecución.

## Depuración manual de retención (90 días)

La retención **no tiene trigger ni se ejecuta automáticamente**. Solo un operador autorizado puede ejecutar manualmente `depurarRetencionEntregasLey2300Manual()` desde el editor de Apps Script, después de editar y revisar la constante `CONFIRMACION_EXPLICITA` con el valor `ELIMINAR_REGISTROS_TERMINALES_VENCIDOS`.

La rutina toma `ScriptLock`, recalcula candidatos para evitar carreras y es idempotente: únicamente elimina **grupos completos de UUID** con más de 90 días desde `ENVIADA_EN`, cuando todas sus entregas están en `ENVIADO` y la fuente `registro analisis` aún conserva `Estado Automatización = Procesado`. Nunca elimina `FALLIDO_DEFINITIVO`, casos parciales ni una entrega `ENVIADO` aislada. Cada ejecución confirmada deja en `Retencion_Ley2300` una auditoría agregada sin destinos, UUIDs ni otros datos de contacto. Revise primero los conteos retornados y conserve la evidencia operacional requerida antes de confirmar.


Los participantes con contacto vacío o de formato inválido también generan una entrega `PENDIENTE_CORRECCION` con causa `DATOS_CONTACTO`, sin almacenar el valor inválido. ADMIN puede corregirla desde la bandeja; no se invoca a Infobip para estos casos. Para estimar la próxima ejecución, el proceso registra únicamente su marca de tiempo de última ejecución y la combina con la agenda vigente. Si aún no hay una ejecución registrada, la bandeja indica que no puede estimar el próximo intervalo.
