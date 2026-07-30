# Auditoría técnica — Automatización de Inducciones (El Libertador) — 2026-07-29

> Alcance acordado con el solicitante: se audita **todo el código del repositorio**, incluyendo la arquitectura legacy en producción y la migración nueva en curso (conviven vía `doGet()` con el parámetro `?v=2`). **No se accedió a las hojas de Sheets reales** (por decisión explícita del solicitante) — el modelo de datos se evalúa contra lo que el código y `docs/00-discovery.md` documentan, no contra el estado operativo real. Esto se señala explícitamente donde aplica.

---

## Resumen ejecutivo

El proyecto está en una migración activa y **bien planeada** (9 documentos de diseño en `docs/`, con reglas técnicas explícitas como "nunca `setValue()` en loop" o "columnas siempre por nombre") desde un backend monolítico (`Codigo.js`, ~950 líneas, con una función de auditoría de 424 líneas) hacia una arquitectura por capas (`Api.js` → `Repositorios_*.js` → Sheets) con control de acceso por rol verificado en servidor. La ejecución de esa migración es **desigual**: partes nuevas cumplen sus propias reglas al pie de la letra (control de roles, caché, retry con backoff, degradación de IA), y otras las incumplen directamente (columnas hardcodeadas por número en `Repositorios_ColaAuxiliarRepo.js` pese a que el propio `docs/07` lo prohíbe explícitamente para "todo el nuevo código").

**Riesgos principales verificados en código:**
1. **Seguridad** — el catch de `motorDeAuditoria` devuelve el mensaje de error interno crudo al usuario (`Codigo.js:598-601`, con un comentario propio sin resolver: *"cambiar a amigable después de resolver"*); el scope OAuth `mail.google.com` (acceso total a Gmail) es más amplio de lo que el código usa (`MailApp`, no `GmailApp`); no hay sanitización contra inyección de fórmulas al volcar datos de Excel a Sheets.
2. **Concurrencia** — el flujo del Auxiliar (`tomarSolicitudAuxiliar`) adquiere un lock pero **no escribe nada dentro de él** (es un stub V1, confirmado por el propio comentario del código), por lo que no impide que dos auxiliares tomen la misma solicitud pese a que la documentación y el nombre de la función dicen lo contrario.
3. **Testing** — no existe ni una prueba automatizada en el repositorio; toda verificación es manual, directamente en las hojas de producción.
4. **Rendimiento a futuro** — los triggers de sincronización (cada 10 min) leen la hoja completa en cada corrida; funciona hoy con el volumen actual pero no escala sin cambios.

**Fortalezas reales, verificadas y dignas de mantenerse:** control de rol en servidor consistente en las 23 funciones de `Api.js`, degradación controlada de Vertex AI, sistema de logging estructurado con auto-reparación, chequeo de salud diario con alerta automática, retry con backoff en el cliente nuevo, y una documentación de arquitectura excepcionalmente completa para el tamaño del proyecto.

**Puntaje global ponderado: 3.0 / 5** (ver metodología de ponderación en la sección correspondiente). Es un sistema funcional, con buenas decisiones de diseño documentadas, cuya ejecución tiene huecos concretos y corregibles — no un sistema mal concebido.

---

## Inventario del proyecto

| Archivo | Tipo | Responsabilidad | Líneas |
|---|---|---|---|
| `Codigo.js` | Backend legacy | `doGet` (dispatcher legacy/nuevo), validadores, `motorDeAuditoria` (god function), consulta de lotes | 950 |
| `Config.js` | Backend legacy+transversal | Logging estructurado, chequeo de salud, verificación de cuota de correo, re-autorización de scopes | 275 |
| `Cumplimiento.js` | Backend legacy | Generación CSV Ley 2300 cada 15 días | 295 |
| `IADestino.js` | Backend legacy | Validación semántica de Destino vía Vertex AI (Gemini) | 178 |
| `Notificaciones.js` | Backend legacy | Construcción y envío de correos HTML (bloques modulares) | 1084 |
| `Reportes.js` | Backend legacy | Reporte diario de gestión (solo lectura) | 447 |
| `Sincronizacion.js` | Backend legacy | Replica Control_General → registro analisis cada 10 min | 534 |
| `Api.js` | Backend nuevo | Capa API expuesta a `google.script.run`, 23 funciones, todas con `verificarRol` | 461 |
| `Repositorios_AnalisisRepo.js` | Backend nuevo | Lectura de "registro analisis" (listado + detalle) | 256 |
| `Repositorios_AnalistaRepo.js` | Backend nuevo | Flujo del analista: pedir, evaluar, reasignar | 297 |
| `Repositorios_ColaAuxiliarRepo.js` | Backend nuevo | Flujo del auxiliar: cola, radicar, error en terceros + notificaciones | 534 |
| `Repositorios_ConfigRepo.js` | Backend nuevo | Acceso centralizado a Script Properties | 49 |
| `Repositorios_ControlGeneralRepo.js` | Backend nuevo | Lectura de Control_General (resumen, listado, detalle) | 285 |
| `Servicios_AuthService.js` | Backend nuevo | Autenticación y rol (pestaña USUARIOS + caché) | 126 |
| `Setup_CrearPestanas.js` | Backend nuevo (setup) | Script de un solo uso: crea USUARIOS/COLA_ANALISIS/Errores_Terceros | 264 |
| `Setup_LeerDesplegables.js` | Backend nuevo (setup) | Diagnóstico manual de validaciones de datos existentes | 94 |
| `Index.html` | Frontend legacy | Formulario de radicación (estilos inline, sin tokens) | 240 |
| `Estilos.html` | Frontend legacy | CSS con variables propias (no el sistema de marca nuevo) | 438 |
| `Scripts.html` | Frontend legacy | Lógica de cliente del formulario legacy | 968 |
| `IndexNuevo.html` | Frontend nuevo | Shell de la SPA nueva, con includes modulares | 81 |
| `styles_tokens.html` | Frontend nuevo | Design tokens (Brand Book) como CSS custom properties | 133 |
| `styles_main.html` | Frontend nuevo | Estilos base/reset/layout, 100% sobre tokens | 548 |
| `components_lifeline.html` | Frontend nuevo | Componente visual "línea de vida" (sin commitear aún) | 129 |
| `scripts_apiClient.html` | Frontend nuevo | Wrapper de `google.script.run` con retry+backoff | 84 |
| `scripts_app.html` | Frontend nuevo | Toda la lógica de vistas/routing de la SPA nueva | 2312 |
| `appsscript.json` | Config | Manifiesto: scopes, webapp, runtime | 34 |
| `.clasp.json` | Config | Vínculo con el proyecto GAS remoto | — |
| `docs/00-discovery.md` … `07-resoluciones-tecnicas.md`, `manual-marca.md` | Documentación | Discovery, arquitectura, UI/UX, migración, backlog, decisiones técnicas, diseño consolidado, brand book | ~9 archivos |
| `README.md` | Documentación | Documenta **solo** la arquitectura legacy | 223 |

**Nota de estado:** el repo tiene cambios sin commitear en `Api.js`, `Codigo.js`, `IndexNuevo.html`, `Repositorios_AnalistaRepo.js`, `Repositorios_ColaAuxiliarRepo.js`, `scripts_app.html`, `styles_main.html`, `styles_tokens.html`, y `components_lifeline.html` está sin trackear — confirma que la migración está activa en este momento, no es un experimento abandonado.

---

## Puntaje por dimensión

| Dimensión | Puntaje (1-5) | Resumen de 1 línea |
|---|---|---|
| 1. Arquitectura y separación | 3 | Capas nuevas bien pensadas y parcialmente respetadas; IDs e lógica de negocio aún se filtran fuera de su capa |
| 2. Rendimiento y cuotas | 3 | Caché/lock usados con criterio en código nuevo; persisten escaneos completos programados y lecturas celda-a-celda |
| 3. Modelo de datos e integridad | 3 | Validación de servidor real; hueco de concurrencia concreto en el flujo del Auxiliar |
| 4. Seguridad | 3 | RBAC de servidor consistente y despliegue bien acotado; fuga de errores técnicos y scope OAuth más amplio de lo necesario |
| 5. Manejo de errores y resiliencia | 4 | Degradación controlada, logging estructurado, chequeo de salud diario — el punto más maduro del proyecto |
| 6. Calidad de código y mantenibilidad | 3 | Buen naming/documentación en código nuevo; duplicación real de lógica de mapeo de columnas |
| 7. Diseño / marca | 3 | Tokens bien implementados en CSS; violados por colores hardcodeados fuera de paleta en `scripts_app.html` |
| 8. Escalabilidad | 3 | Mitigaciones puntuales inteligentes (COLA_ANALISIS); esquema de 62 columnas fijas limita el crecimiento |
| 9. Testing y verificación | 1 | Cero pruebas automatizadas; toda verificación es manual sobre producción |
| 10. DevOps, versionado y despliegue | 3 | Git+clasp real y disciplinado; sin registro en el repo de qué versión está desplegada |
| 11. Documentación | 4 | Documentación de arquitectura sobresaliente; desactualizada respecto al legacy en el README |

**Puntaje global ponderado: 3.0 / 5.** Metodología de ponderación (seguridad y rendimiento pesan más, según lo pedido):

| Dimensión | Peso |
|---|---|
| Seguridad | 15% |
| Rendimiento y cuotas | 15% |
| Arquitectura | 12% |
| Modelo de datos | 10% |
| Manejo de errores | 10% |
| Calidad de código | 10% |
| Escalabilidad | 10% |
| Testing | 8% |
| Diseño/marca | 4% |
| DevOps | 4% |
| Documentación | 2% |

---

## Hallazgos detallados por dimensión

### 1. Arquitectura y separación de responsabilidades

**Qué se revisó:** los 23 archivos backend, mapeo completo de `SpreadsheetApp.openById`/`getSheetByName` (59 ocurrencias en 14 archivos, vía grep), y el `doGet()` de entrada.

**Hallazgos:**

- **Dos arquitecturas coexistentes por diseño, no por accidente.** `Codigo.js:44-86` bifurca `doGet()`: sin parámetro sirve `Index.html` (legacy); con `?v=2` sirve `IndexNuevo.html` (nuevo). Coincide exactamente con la estrategia de convivencia documentada en `docs/03-migracion.md`. — *Severidad: nota (esperado).*

- **Función "dios" en el legacy.** `motorDeAuditoria` (`Codigo.js:189-612`, 424 líneas) hace: validación de formato, validación de encabezados, auditoría fila por fila (8 reglas distintas), llamada a IA, creación de carpeta en Drive, volcado a Sheets, log y notificación — todo bajo un único lock. — *Severidad: Alto (legacy, aceptado como deuda documentada, no se debe tocar hasta el corte).* — *Esfuerzo: L (ya está planeada su extracción a `RadicacionService.gs` en el backlog, tarea T4.6, no ejecutada aún).*

- **La nueva capa de Servicios de negocio (`Servicios/*.gs`) planeada en `docs/01-arquitectura.md` no existe todavía.** Solo existe `Servicios_AuthService.js`. La lógica de negocio de auxiliar (notificar por correo, calcular ciclo de error) vive directamente en `Repositorios_ColaAuxiliarRepo.js:433-534` (funciones `_notificarErrorAlComercial`, `_notificarCorreccionAlAuxiliar`) — el repositorio hace acceso a datos *y* orquesta correo. Esto rompe la promesa de la propia arquitectura documentada ("cada repo: abre hoja → getValues/setValues"). — *Severidad: Medio.* — *Recomendación: extraer estas dos funciones a un `NotificacionService.js` que el repo invoque, o renombrar honestamente la capa (no es solo "Repositorios").* — *Esfuerzo: S.*

- **IDs de hoja duplicados en 5 lugares independientes**, no centralizados: `Codigo.js:8-10` (constantes globales), `Notificaciones.js:572,732,886` (el mismo ID como string literal repetido 3 veces), `Sincronizacion.js:301` (`ID_ARCHIVO_CONTROL`, una variable local con el mismo valor pero **nombre distinto** al de todos los demás archivos). El código nuevo sí centraliza esto correctamente en `Repositorios_ConfigRepo.js:26-41` (`getHojaControlId()`, lee `PropertiesService` con fallback a la constante). — *Severidad: Medio.* — *Recomendación: en el legacy, reemplazar los 3 literales de `Notificaciones.js` y el de `Sincronizacion.js` por la constante `ID_HOJA_CONTROL` ya existente — no requiere reescribir nada, es un cambio de una línea por ocurrencia y elimina el riesgo de que un ID cambie en un lugar y no en los otros cuatro.* — *Esfuerzo: XS.*

- **`SpreadsheetApp.openById` no está centralizado**: 59 llamadas directas en 14 archivos. Dentro de un mismo flujo lógico se reabre el mismo libro varias veces (ej. `marcarErrorEnTerceros` → `_notificarErrorAlComercial`, en `Repositorios_ColaAuxiliarRepo.js:258-318` y `433-480`, abren el mismo `getHojaControlId()` por separado). No es antipatrón grave en GAS (cada apertura es barata comparada con `getValues`), pero sí es duplicación de acceso que un `ConfigRepo`/`ControlGeneralRepo` con un getter cacheado por ejecución evitaría. — *Severidad: Bajo.* — *Esfuerzo: S.*

- **Positivo, verificado:** la capa `Api.js` → `Repositorios_*.js` sí logra lo que promete para las funciones de solo-lectura y para el flujo del analista: separación real, sin lógica de negocio de UI mezclada, con `verificarRol()` como puerta de entrada uniforme en las 23 funciones de `Api.js`.

### 2. Rendimiento y uso eficiente de cuotas de GAS

**Qué se revisó:** grep exhaustivo de `getRange/getValue/setValue/getValues/setValues` (ver evidencia abajo), y lectura completa de `Sincronizacion.js`, `Repositorios_ColaAuxiliarRepo.js`, `Repositorios_AnalistaRepo.js`, `Repositorios_ControlGeneralRepo.js`.

**Hallazgos:**

- **`setValue()` dentro de loop, contradiciendo la "regla de oro" del propio `docs/07-resoluciones-tecnicas.md`:**
  - `Notificaciones.js:707,860`: `lote.filas.forEach(f => sheetCG.getRange(f, 61).setValue(new Date()))`.
  - `Sincronizacion.js:206,213`: `actualizacionesBuf.forEach(upd => hojaAnalisis.getRange(upd.fila, upd.col).setValue(upd.valor))`.
  - `Codigo.js:922-931`: `errores.forEach(err => ... celdaDiagnostico.setValue(...))` en `generarArchivoMarcado`.
  - Todas están en el **legacy**, que `docs/07` marca explícitamente como *"no se toca hasta la migración"* — no es un hallazgo nuevo, es la confirmación de que la deuda documentada sigue ahí, sin resolver. — *Severidad: Medio (acotado por volumen: nº de errores por archivo o de cambios por sync, no por nº de filas totales).* — *Esfuerzo: M (ya hay un patrón de reemplazo documentado en `docs/07`, listo para aplicar).*

- **Lectura celda-a-celda dentro de un loop, en código NUEVO:** `Repositorios_AnalistaRepo.js:57-64`, `obtenerSolicitudesAnalista` — por cada fila encontrada con `TextFinder`, hace **8 llamadas individuales** `hoja.getRange(fila, colX).getValue()` en vez de leer la fila completa una vez y desglosarla en memoria. Con cupo típico de 5-10 solicitudes por analista esto son 40-80 llamadas de red por carga de pantalla. — *Severidad: Medio.* — *Recomendación: `hoja.getRange(fila, 1, 1, hoja.getLastColumn()).getValues()[0]` una vez por fila, igual que ya hace correctamente `obtenerDetalleSolicitud` en `Repositorios_AnalisisRepo.js:166`.* — *Esfuerzo: XS.*

- **Escaneo completo de hoja en cada corrida de trigger, cada 10 minutos:** `Sincronizacion.js:36` (`sincronizarLoteAutomatico`) y `Sincronizacion.js:315` (`sincronizarEstadoDesdeAnalisis`) hacen `hoja.getDataRange().getValues()` sobre **toda** `Control_General` (~62 columnas) y **toda** `registro analisis` (~100 columnas) en cada ejecución, sin importar cuántas filas cambiaron desde la corrida anterior. Funciona hoy (volumen "cientos a bajo miles" según `docs/00-discovery.md`); no tiene mecanismo incremental. — *Severidad: Medio (riesgo futuro, no actual).* — *Recomendación: llevar una marca de "última fila procesada" en Script Properties y leer solo el rango nuevo, o usar `onEdit`/eventos en vez de barrido completo periódico.* — *Esfuerzo: M.*

- **`api_obtenerMisLotes` / `obtenerLotesDeComercial` sin caché**, a diferencia de `api_obtenerResumenDashboard` que sí cachea 60s (`Api.js:36-43`). Cada navegación a "Mis lotes" vuelve a leer `hoja.getRange(2,1,ultimaFila-1,24).getValues()` completo (`Repositorios_ControlGeneralRepo.js:122`). — *Severidad: Bajo hoy, Medio a mayor volumen.* — *Esfuerzo: XS (mismo patrón de caché ya usado en el dashboard).*

- **`api_obtenerTodosLosLotes` (`Api.js:90-100`) pide `porPagina=9999`** — "sin paginación en servidor" explícito, por diseño, para que el cliente pagine localmente. Válido para el volumen actual; es el patrón exacto que la auditoría pide señalar como riesgo de "devolver datasets completos sin paginación" a medida que crece el volumen. — *Severidad: Bajo hoy / Medio a futuro.* — *Esfuerzo: —(monitorear, no actuar aún).*

- **Positivo, verificado — uso correcto de caché:** `Api.js:37-43` (resumen dashboard, TTL 60s), `Repositorios_AnalisisRepo.js:108-119` (headers de registro analisis, TTL 300s), `Servicios_AuthService.js:55-76` (usuario por email, TTL 120s) — coinciden exactamente con la tabla de TTLs de `docs/07-resoluciones-tecnicas.md` (W1).

- **Positivo, verificado — no hay uso de `Utilities.sleep()` como parche.** La única ocurrencia (`Codigo.js:94`, dentro de `retry()`) es un backoff legítimo entre reintentos, no una espera para "sincronizar" nada.

- **Estimación de tiempos de respuesta** (a partir del patrón de acceso, no medido en vivo): radicación (`motorDeAuditoria`) — validación + IA + Drive + escritura ≈ 5-20s, coincide con el propio README ("10-30s reales"); muy lejos del límite de 6 minutos por ejecución. Listado de lotes — sub-segundo hoy; empieza a notarse en UX (no en el límite duro de GAS) si el total de filas de `Control_General` crece a decenas de miles, porque cada carga sigue siendo un escaneo completo de la hoja.

- **Cuotas diarias:** no se detecta riesgo de cuota UrlFetch (una llamada por lote a Vertex AI, en chunks de 100) ni de tiempo total de ejecución diario dado el volumen actual (triggers de sync cada 10 min + reportes/cumplimiento/salud). No hay, sin embargo, ningún monitoreo del consumo real de cuota diaria — `verificarSaludDelSistema` (`Config.js:96-202`) chequea cuota de correo pero no tiempo de ejecución acumulado ni llamadas UrlFetch. — *Nota: no verificable sin acceso a la consola de Apps Script / Cloud, fuera del alcance de esta auditoría de código.*

### 3. Modelo de datos e integridad

**Qué se revisó:** `docs/00-discovery.md` (diccionario de datos), validadores en `Codigo.js:108-182`, y los flujos de escritura concurrente en `Repositorios_ColaAuxiliarRepo.js` y `Repositorios_AnalistaRepo.js`.

**Hallazgos:**

- **Desnormalización es una decisión documentada y razonable**, no un descuido: `docs/01-arquitectura.md §2.4` explica por qué (62+ columnas por fila, volumen bajo, normalizar agregaría complejidad sin beneficio real). — *Severidad: nota, aceptar.*

- **Validación de servidor real, no solo de UX.** `validarDestino`, `validarCelular`, `validarCorreo`, `validarCampoMonetario` (`Codigo.js:108-182`) corren dentro de `motorDeAuditoria`, en servidor, independientemente de lo que haga SheetJS en el cliente. La escritura de campos editables del analista también está protegida por una allow-list explícita de columnas (`Repositorios_AnalistaRepo.js:177-190`), que impide sobrescribir columnas de fórmulas. — *Positivo, verificado.*

- **Hueco de concurrencia real en el flujo del Auxiliar.** `tomarSolicitudAuxiliar` (`Repositorios_ColaAuxiliarRepo.js:146-175`) adquiere `LockService`, revisa que el estado siga en `PENDIENTE RADICAR`... y **no escribe nada** — el propio comentario del código lo dice: *"Para V1: no escribimos nada, solo retornamos OK"* (línea 169-170). Como no hay escritura que reserve la fila, dos auxiliares pueden pasar la verificación al mismo tiempo y ambos empezar a trabajar la misma solicitud — el lock no protege nada en la práctica porque no hay estado que cambiar bajo su protección. — *Severidad: Alto (es una funcionalidad incompleta marcada V1, no un bug silencioso — pero el nombre y el docstring de la función prometen algo que el código no cumple).* — *Recomendación: escribir un estado transicional (ej. `EN PROCESO RADICACIÓN` + email del auxiliar) dentro del lock, igual que ya hace correctamente `pedirSolicitudAnalista` para el analista.* — *Esfuerzo: S.*

- **`marcarSolicitudRadicada` y `marcarErrorEnTerceros` no usan `LockService`**, a diferencia de `tomarSolicitudAuxiliar` y `pedirSolicitudAnalista`. Además, `marcarSolicitudRadicada` (`Repositorios_ColaAuxiliarRepo.js:229-241`) hace `hojaColaA.appendRow(...)` sin verificar si ese UUID ya fue insertado en `COLA_ANALISIS` — un doble clic o un reintento tras timeout del cliente puede duplicar la entrada en la cola del analista. — *Severidad: Medio.* — *Recomendación: `TextFinder` sobre `COLA_ANALISIS` por UUID antes de `appendRow`, o lock corto igual que en las otras dos funciones de escritura.* — *Esfuerzo: XS.*

- **Lógica de negocio crítica vive en fórmulas de la hoja, fuera del código y de esta auditoría.** `docs/05-consolidado-final.md §6` documenta explícitamente que `Resultado Final Inquilino/COA[N]`, `RESULTADO SOLICITUD`, `RESULTADO LOTE`, etc. son calculados por fórmulas del spreadsheet que el código **nunca** escribe y la Web App **deliberadamente** nunca muestra. Esto significa que el resultado final de una solicitud (aprobada/negada) depende de fórmulas que cualquier persona con acceso de edición a la hoja podría alterar sin que ningún código lo detecte. — *Severidad: Alto (riesgo real, pero no auditable desde el código — ver "Preguntas abiertas").* — *Recomendación: al menos documentar/versionar esas fórmulas fuera de la hoja (captura periódica a un archivo en el repo), y evaluar proteger ese rango de fórmulas con `Range.protect()`.* — *Esfuerzo: M.*

### 4. Seguridad

**Qué se revisó:** `appsscript.json` completo, las 23 funciones de `Api.js`, manejo de errores expuestos al usuario, y las etiquetas `<script src=...>` de CDN en ambos frontends.

**Hallazgos:**

- **`oauthScopes` incluye `https://mail.google.com/`** (`appsscript.json:32`) — acceso total de lectura/escritura/borrado sobre el buzón completo del usuario que despliega, además del ya presente `script.send_mail`. Todo el envío de correo en el repo usa `MailApp.sendEmail` (Config.js, Notificaciones.js, Cumplimiento.js) — no se encontró ningún uso de `GmailApp`, que sería lo que justificaría el scope de Gmail completo. — *Severidad: Alto.* — *Recomendación: quitar `mail.google.com` de `appsscript.json` y volver a autorizar (`forzarReautorizacion()` ya existe para esto exacto en `Config.js:244`); si algo se rompe, es la prueba de que sí se necesitaba y se puede revertir en un commit.* — *Esfuerzo: XS (cambio + reautorización + nuevo deploy).*

- **Control de rol de servidor consistente y verificado línea por línea.** Las 23 funciones de `Api.js` llaman `verificarRol([...])` (que lanza excepción si no autorizado) antes de tocar cualquier dato sensible — no es ocultar botones en el cliente, es una puerta real en `Servicios_AuthService.js:38-47`. — *Positivo, verificado, fortaleza real.*

- **El legacy no tiene control de rol de servidor.** `Scripts.html` llama `google.script.run....motorDeAuditoria(...)` sin que `Codigo.js` verifique el rol de quien llama — cualquier usuario del dominio con la consola del navegador abierta podría invocar `motorDeAuditoria` directamente. Es una brecha real si hay usuarios del dominio que no deberían poder radicar, y desaparece con el corte a la arquitectura nueva. — *Severidad: Medio (mientras dure la convivencia).* — *Esfuerzo: — (se resuelve con el propio cutover ya planeado, no requiere trabajo adicional dedicado).*

- **Mensajes de error técnicos expuestos al usuario final.** `Codigo.js:598-601`, dentro del catch de `motorDeAuditoria`, retorna literalmente `"Error interno: " + e.toString()` al comercial que está radicando, con un comentario del propio autor sin resolver: *"Mensaje con detalle técnico para diagnóstico (cambiar a amigable después de resolver)"*. El patrón se repite, con menor exposición (solo a roles internos AUXILIAR/ANALISTA/LIDER/ADMIN), en varias funciones de `Api.js` (ej. `api_marcarRadicado:287-288`, `api_guardarUsuario:175-176`): `mensaje: 'Error: ' + e.message`. — *Severidad: Medio.* — *Recomendación: mapear excepciones internas a un catálogo corto de mensajes amigables antes de devolver al cliente; loguear el detalle técnico solo en `Logs_Sistema` (que ya existe).* — *Esfuerzo: S.*

- **Sin sanitización contra inyección de fórmulas al escribir datos de Excel en Sheets.** En `motorDeAuditoria`, el "SALVAVIDAS 1" (`Codigo.js:514-521`) solo maneja `null`/`undefined` y mayúsculas — no hay ningún chequeo de que un valor de celda del Excel subido por el comercial empiece con `=`, `+`, `-` o `@` antes de escribirlo en `Control_General`. Dado que esos datos luego se abren/exportan como hoja de cálculo (`generarArchivoMarcado` exporta a `.xlsx`), un valor malicioso podría convertirse en una fórmula viva. El origen del dato es un Excel subido por comerciales del propio dominio (riesgo real pero acotado, no un vector expuesto a internet). — *Severidad: Medio.* — *Recomendación: anteponer un `'` (comilla simple) a cualquier valor de texto que empiece con esos caracteres antes de `setValues`.* — *Esfuerzo: XS.*

- **Despliegue de la Web App correctamente acotado** (`appsscript.json:19-22`): `executeAs: USER_DEPLOYING`, `access: DOMAIN` — no es `ANYONE` ni `ANYONE_ANONYMOUS`; `USER_DEPLOYING` es necesario para que el script tenga permisos de escritura consistentes independientemente de los permisos individuales de cada usuario sobre las hojas. — *Positivo, verificado, no hay sobre-permisividad aquí.*

- **`BCC_AUDITORIA` es un único correo personal hardcodeado** (`Notificaciones.js:8`, `santiago.garcia@segurosbolivar.com`) que cumple doble función: BCC de auditoría en *todos* los correos del sistema, y criterio literal para asignar el rol `ADMIN` (`Setup_CrearPestanas.js:144-166`, confirmado también en `docs/07 §C6`). Es un punto único de fallo — si esa cuenta se desactiva, el bootstrap de ADMIN y el rastro de auditoría se rompen sin aviso. — *Severidad: Bajo.* — *Recomendación: mover a Script Property, y considerar una lista en vez de un único correo.* — *Esfuerzo: XS.*

- **Scripts de CDN sin Subresource Integrity (SRI).** `Index.html:10-13` e `IndexNuevo.html:9` cargan SweetAlert2/SheetJS/Animate.css/Font Awesome desde jsdelivr/cdnjs sin atributo `integrity=`. Riesgo de cadena de suministro bajo pero de costo de mitigación nulo. — *Severidad: Bajo.* — *Esfuerzo: XS.*

### 5. Manejo de errores y resiliencia

**Qué se revisó:** todas las llamadas `google.script.run` en `Scripts.html` y `scripts_apiClient.html`, y los mecanismos de logging/degradación en `Config.js`, `IADestino.js`, `Cumplimiento.js`, `Reportes.js`.

**Hallazgos — esta es la dimensión más madura del proyecto:**

- **Degradación controlada de Vertex AI, verificada de punta a punta.** `validarDestinosConIA_` (`IADestino.js:70-96`) captura cualquier fallo de red/cuota/timeout de Vertex AI, marca `degradado: true` y deja seguir la radicación solo con la heurística — `motorDeAuditoria` (`Codigo.js:284-292`) lo consume y dedica una nota visible en el log (`notaValidacionIA`) en vez de fallar silenciosamente o bloquear al usuario. — *Positivo, ejemplo de libro de texto.*

- **Logging estructurado real, con auto-reparación.** `_registrarEvento_` (`Config.js:55-78`) escribe en una hoja `Logs_Sistema` que crea sola si no existe, y está envuelta en su propio try/catch para que un fallo de logging nunca tumbe el flujo que lo llamó. Se usa de forma consistente en Api.js, Config.js, Cumplimiento.js, Codigo.js. — *Positivo, fortaleza real.*

- **Chequeo de salud diario, proactivo.** `verificarSaludDelSistema` (`Config.js:96-202`, trigger diario 7am) revisa triggers faltantes, cuota de correo baja, hojas inaccesibles y lotes estancados >7 días, y solo envía correo si encuentra algo mal. Es exactamente el tipo de red de seguridad operativa que un sistema sin equipo de SRE dedicado necesita. — *Positivo, fortaleza real.*

- **Retry con backoff en el cliente nuevo, implementado según lo documentado.** `scripts_apiClient.html:25-49` reintenta hasta 2 veces con backoff exponencial solo para errores que parecen transitorios (`Service`/`Timeout`/`unavailable` en el mensaje) — coincide exactamente con `docs/07 §W6`. — *Positivo, verificado contra spec.*

- **Un `google.script.run` sin `.withFailureHandler()`.** `Scripts.html:820-828`, la llamada a `obtenerNombreUsuarioActual()` no tiene manejador de fallo — si falla, el saludo personalizado simplemente no aparece, sin log ni aviso. Impacto bajo (solo cosmético) pero es la única llamada del legacy que no sigue su propio patrón (las otras 4 sí tienen `.withFailureHandler()`). — *Severidad: Bajo.* — *Esfuerzo: XS.*

- **`Repositorios_*.js` no usa `retry()`** para las llamadas a `SpreadsheetApp.openById`, a diferencia del legacy (`Codigo.js`, `Reportes.js`, `Cumplimiento.js`, `IADestino.js`, que sí envuelven llamadas externas en `retry()`). No es un defecto funcional (`Api.js` captura la excepción igual y responde `{ok:false}` sin tumbar nada), pero pierde la resiliencia a fallos transitorios de Sheets que sí tiene el legacy. — *Severidad: Bajo.* — *Esfuerzo: S (envolver los `openById` de los repos en `retry()`).*

### 6. Calidad de código y mantenibilidad

**Qué se revisó:** convenciones de nombres, JSDoc, y búsqueda dirigida de bloques de lógica repetidos entre archivos.

**Hallazgos:**

- **El código nuevo está consistentemente documentado** (JSDoc con `@param`/`@returns` en `Api.js` y todos los `Repositorios_*.js`), mucho más que el legacy (`Codigo.js`/`Notificaciones.js`, con comentarios más dispersos). — *Positivo.*

- **Patrón de búsqueda de índice de columna por nombre, duplicado en al menos 5 lugares**, en vez de la única función `obtenerIndiceColumna(headers, nombre)` que el propio `docs/07 §W7` prescribe: el bucle `for(h=0;h<headers.length;h++) if(String(headers[h]).trim()===X) col=h+1` aparece copiado casi idéntico en `Repositorios_AnalistaRepo.js` (líneas 27-39, 135-138, 196-198, 206-214), `Repositorios_AnalisisRepo.js:44-48`, y la variante `obtenerMapaColumnas` de `Sincronizacion.js:270-283` resuelve el mismo problema con una tercera implementación distinta. — *Severidad: Medio.* — *Recomendación: extraer el helper único que ya está documentado y no se aplicó.* — *Esfuerzo: S.*

- **El fallback de "ASIGNADA A…" con variantes de puntos suspensivos** (`'ASIGNADA A…'||'ASIGNADA A...'||'ASIGNADA A'`) está copiado literalmente en 5 puntos (`Repositorios_AnalistaRepo.js` ×3, `Repositorios_AnalisisRepo.js`, `Sincronizacion.js:325-329`) en vez de una constante compartida. — *Severidad: Bajo.* — *Esfuerzo: XS.*

- **La derivación de "nombre legible desde email"** (`nombre.apellido@dominio` → `Nombre Apellido`) está reimplementada de forma independiente 3 veces: en el grupo `obtenerNombreDeComercial`/`obtenerNombreCompletoDeComercial` de `Notificaciones.js`, en `_nombreComercialParaBusqueda` (`Repositorios_ControlGeneralRepo.js:79-90`) y en `_derivarNombreDeEmail` (`Setup_CrearPestanas.js:252-264`) — con pequeñas diferencias de capitalización entre ellas que podrían producir inconsistencias sutiles de nombre entre pantallas. — *Severidad: Bajo.* — *Esfuerzo: S.*

- **`scripts_app.html` tiene 2312 líneas** — es, de lejos, el archivo más grande del repo y concentra routing + render de vistas + plantillas HTML inline con estilos embebidos (ver hallazgo de dimensión 7). `docs/07 §W5` decidió conscientemente no dividir el *template* HTML por las limitaciones de GAS, pero esa decisión no obliga a que el JS de orquestación también sea un solo archivo — hoy no hay una segunda capa de módulos (por vista/feature) dentro del JS. — *Severidad: Medio (mantenibilidad futura, no un bug hoy).* — *Recomendación: dividir en archivos `.html`-contenedor-de-`<script>` por dominio (radicación, auxiliar, analista, admin) e incluirlos todos desde `IndexNuevo.html`, igual que ya se hace con `styles_tokens`/`styles_main`.* — *Esfuerzo: L.*

- **Acoplamiento amplio por nombre de columna:** ~100 nombres de columna de `registro analisis` y ~62 de `Control_General` están hardcodeados de forma independiente en el frontend (`scripts_app.html`) y en 5+ archivos de `Repositorios_*.js`. No existe un único módulo de "esquema" compartido — cambiar el nombre de una columna en la hoja real exige buscar y actualizar manualmente en múltiples archivos. — *Severidad: Medio.* — *Recomendación: un archivo `Esquema.js` con los nombres de columna como constantes, referenciado desde todos los repos.* — *Esfuerzo: M.*

### 7. Cumplimiento del sistema de diseño / marca

**Qué se revisó:** `docs/manual-marca.md` contra `styles_tokens.html`, `styles_main.html`, `scripts_app.html`, `Index.html`, `IndexNuevo.html`.

**Hallazgos:**

- **Los design tokens del Brand Book están correctamente implementados como CSS custom properties.** `styles_tokens.html` refleja fielmente la paleta, tipografía y espaciado de `docs/manual-marca.md`; `styles_main.html` (548 líneas) los usa consistentemente — no se encontró **ni un solo** color hexadecimal hardcodeado en ese archivo (verificado por grep dirigido). — *Positivo, fortaleza real del frontend nuevo.*

- **Pero `scripts_app.html` (la lógica de la misma SPA nueva) sí hardcodea colores fuera del sistema de tokens**, en plantillas HTML generadas por JS: `#0d7a54`, `#16A34A`, `#DCFCE7`, `#92400E`, `#FFFBEB`, `#FDE68A` (líneas 1756, 1929, 1955, 1963, 1969, 2050-2061, 2120-2122), y además hardcodea el propio rojo de marca como literal (`#bd0f14`) en vez de `var(--color-primary-red)`. Varios de esos colores (verde `#16A34A`/`#0d7a54`, ámbar `#92400E`, y sus variantes claras) **no existen en la paleta aprobada** de `docs/manual-marca.md` — parecen colores semánticos tipo Tailwind (éxito/advertencia) introducidos sin pasar por el sistema de tokens. — *Severidad: Medio.* — *Recomendación: agregar `--color-success`/`--color-warning` a `styles_tokens.html` si esos estados semánticos son necesarios (y se aprueban con marca), y reemplazar los literales en `scripts_app.html` por `var(--...)`.* — *Esfuerzo: S.*

- **El logo se re-colorea vía filtro CSS, contra la regla explícita del manual.** `IndexNuevo.html:26`: `style="filter: brightness(0) invert(1)"` sobre el logo SVG para forzarlo a blanco en el header oscuro. `docs/manual-marca.md §3.2` es explícito: *"Nunca redibujar, deformar, cambiar proporciones, tipografía o color"* y solo permite variantes monocromáticas oficiales, no una transformación CSS ad-hoc del archivo a color. — *Severidad: Bajo (cosmético, pero es una regla de marca explícita e incumplida con evidencia exacta).* — *Recomendación: usar la variante blanca oficial del logo (si existe) o consultar con marca antes de invertir vía CSS.* — *Esfuerzo: XS.*

- **El legacy (`Index.html`, `Estilos.html`, `Scripts.html`) no usa el sistema de tokens en absoluto** — decenas de estilos inline con hex directos (`#BD0F14`, `#253150`, `#64748B`, `#e2e8f0`, etc.). Es exactamente el estado "antes" que la migración busca reemplazar — no se marca como defecto nuevo, es la línea base documentada del propio `docs/00-discovery.md §5`.

- No fue posible evaluar consistencia visual entre pantallas (botones, spacing real renderizado) sin ejecutar la aplicación — ver "Preguntas abiertas".

### 8. Escalabilidad y crecimiento futuro

**Hallazgos:**

- **`COLA_ANALISIS` es una mitigación de escalabilidad real y bien dirigida**: un índice liviano de ~11 columnas (`Setup_CrearPestanas.js:180-192`) que evita que el flujo del analista tenga que escanear las ~100 columnas de `registro analisis` para encontrar trabajo disponible. Es exactamente el patrón correcto para el cuello de botella que resuelve. — *Positivo.*

- **El esquema de 62 columnas fijas de `Control_General`** (con posiciones fijas para hasta 5 codeudores, `coaSlots` hardcodeado en `Codigo.js:364-370` y offsets hardcodeados en `Repositorios_ColaAuxiliarRepo.js:95-101`) significa que agregar un 6º codeudor, o un nuevo tipo de participante, requeriría tocar el esquema de la hoja y cada uno de esos arrays de offsets en paralelo — no hay un punto único de extensión. — *Severidad: Medio (riesgo de alcance, no bug actual).*

- **El modelo de roles sí es extensible sin reescritura**: los roles se leen de la pestaña `USUARIOS` y se verifican contra un allow-list por función (`verificarRol(['LIDER','ADMIN'])`) — agregar un rol nuevo es un cambio de configuración + una línea de código por función que deba incluirlo, no una reescritura. — *Positivo.*

- **Los escaneos completos de hoja** (dimensión 2) son, en última instancia, también un hallazgo de escalabilidad: con el volumen actual ("cientos a bajo miles" según `docs/00-discovery.md`, no verificado contra las hojas reales por decisión de alcance) el sistema funciona; no hay mecanismo incremental que evite degradación lineal si el volumen crece a decenas de miles de filas.

### 9. Testing y verificación

**Hallazgos:**

- **No existe ni una prueba automatizada en el repositorio** — confirmado por inventario completo de archivos (no hay `*.test.js`, ni configuración de ningún framework de pruebas, ni carpeta `test/`). — *Severidad: Alto.*

- Existen **funciones de verificación manual** (no pruebas automatizadas, sin aserciones): `probarValidacionDestinoIA` (`IADestino.js:28-34`), `probarReporteGestion`/`probarReporteGestionConFecha` (`Reportes.js`), `forzarReautorizacion` (`Config.js:244-275`) — se ejecutan a mano desde el editor de Apps Script y se leen los logs. Es mejor que nada, pero no detecta regresiones automáticamente. — *Nota, parcialmente positivo.*

- **El ambiente de pruebas separado que `docs/03-migracion.md §5` planea (`ID_HOJA_CONTROL_TEST`) no está implementado en código todavía** — no hay ninguna referencia a un ID de prueba en ningún archivo. Esto es trabajo planeado y no ejecutado, se marca como **pendiente**, no como defecto. — *Severidad de la ausencia: Alto (impacto real: hoy toda verificación ocurre contra producción).*

- No hay evidencia de CI (no hay hooks de git activos más allá de los `*.sample` por defecto, no hay GitHub Actions ni configuración equivalente en el repo).

### 10. DevOps, versionado y despliegue

**Hallazgos:**

- **El proyecto sí usa `clasp` + Git de forma real y disciplinada**: historial de commits con mensajes descriptivos por tipo de cambio (`fix(reportes): ...`, `feat(notificaciones): ...`), rama de feature activa (`fix/reporte-diario-mejoras`), y un changelog en `.kiro/changelogs/changelog-main.md`. No es "solo vive en el editor web" — es una fortaleza real frente al caso típico de proyectos GAS sin control de versiones. — *Positivo.*

- **No hay, dentro del repositorio, ningún registro verificable de qué versión de despliegue está actualmente en producción**, ni cuándo se desplegó ni por qué (más allá del mensaje del último commit). El `README.md` documenta el comando (`clasp deploy --description "..."`) pero no hay un archivo de bitácora de despliegues. — *Severidad: Bajo.* — *Recomendación: un `docs/DEPLOYS.md` con fecha, versión, autor y motivo de cada despliegue a producción — 5 minutos por entrada.* — *Esfuerzo: XS (proceso), no requiere código.*

- **Plan de rollback documentado y razonable**, aunque no ejercitado todavía (`docs/03-migracion.md §3`): apagar el feature flag `NUEVO_FRONTEND`, los usuarios vuelven al legacy automáticamente, restaurar permisos de edición si se habían restringido. Es un plan de rollback real, no una idea vaga. — *Positivo.*

### 11. Documentación

**Hallazgos:**

- **Documentación de arquitectura sobresaliente para el tamaño del proyecto**: 9 documentos en `docs/` cubriendo discovery, arquitectura y modelo de datos, UI/UX pantalla por pantalla, plan de migración con etapas y rollback, backlog con criterios de aceptación, decisiones técnicas con ejemplos de código correcto/incorrecto, diseño consolidado por rol, y manual de marca completo. Verificado contra el código: el diccionario de columnas de `docs/00-discovery.md` coincide exactamente con los índices reales usados en `Repositorios_ColaAuxiliarRepo.js` (columna 24 = Arrendatario, columna 10 = Estado, etc.). — *Positivo, fortaleza notable.*

- **El `README.md` documenta solo la arquitectura legacy** — su tabla de "Estructura del Proyecto" no menciona `Api.js`, ningún `Repositorios_*.js`, `Servicios_AuthService.js`, `IndexNuevo.html`, ni ningún archivo `scripts_*`/`styles_*` nuevo. Un desarrollador nuevo que solo lea el `README.md` no se enteraría de que la migración existe. — *Severidad: Medio.* — *Recomendación: agregar al README una sección corta "Este repo tiene una migración en curso, ver `docs/`" con un enlace — no requiere reescribir el README.* — *Esfuerzo: XS.*

- **Documentación y código han divergido en el estado de implementación de detalles finos**: varias funciones son stubs V1 intencionales y comentados en el propio código (`obtenerSolicitudesAuxiliar` retorna `[]` siempre, `tomarSolicitudAuxiliar` no escribe nada — ver dimensión 3), pero `docs/04-backlog.md` no refleja ese estado parcial tarea por tarea. Un desarrollador que lea solo los docs asumiría que esos flujos están terminados. — *Severidad: Bajo.*

- **Un desarrollador nuevo podría entender el dominio de negocio y la arquitectura objetivo en menos de 30 minutos** leyendo `docs/00` + `01` + `05` — el nivel de detalle (incluso con diagramas ASCII de pantallas y flujos de estado) es genuinamente alto. Lo que no descubriría en esos 30 minutos es el estado real de avance de la migración (qué está commiteado, qué es stub, qué convive con qué) — eso solo se ve leyendo el código.

---

## Matriz de riesgo consolidada

| # | Hallazgo | Severidad | Esfuerzo | Dimensión | Prioridad |
|---|---|---|---|---|---|
| 1 | Scope OAuth `mail.google.com` más amplio de lo que usa el código | Alto | XS | Seguridad | **Quick win** |
| 2 | `tomarSolicitudAuxiliar` no escribe reserva de estado (lock decorativo) | Alto | S | Modelo de datos | **Quick win** |
| 3 | Cero pruebas automatizadas | Alto | L | Testing | Estructural |
| 4 | Lógica de negocio final vive solo en fórmulas de la hoja, sin control de versiones | Alto | M | Modelo de datos | Estructural |
| 5 | `motorDeAuditoria`: función de 424 líneas con lock de 60s sobre validación+IA+Drive+Sheets | Alto | L | Arquitectura | Estructural (ya planeado, T4.6) |
| 6 | Error interno crudo expuesto al comercial en fallo de radicación | Medio | S | Seguridad | **Quick win** |
| 7 | Sin sanitización de inyección de fórmulas al volcar Excel a Sheets | Medio | XS | Seguridad | **Quick win** |
| 8 | IDs de hoja duplicados/hardcodeados en 5 lugares (legacy) | Medio | XS | Arquitectura | **Quick win** |
| 9 | `marcarSolicitudRadicada`/`marcarErrorEnTerceros` sin lock, riesgo de duplicar cola | Medio | XS | Modelo de datos | **Quick win** |
| 10 | Lectura celda-a-celda en loop, `obtenerSolicitudesAnalista` | Medio | XS | Rendimiento | **Quick win** |
| 11 | Colores fuera de paleta hardcodeados en `scripts_app.html` | Medio | S | Diseño/marca | **Quick win** |
| 12 | Patrón de mapeo de columnas duplicado en 5+ lugares (contra regla propia del proyecto) | Medio | S | Calidad de código | Estructural |
| 13 | Escaneo completo de hoja cada 10 min en triggers de sincronización | Medio | M | Rendimiento / Escalabilidad | Estructural |
| 14 | `setValue()` en loop en legacy (Notificaciones/Sincronizacion/Codigo) | Medio | M | Rendimiento | Estructural (deuda ya documentada) |
| 15 | Lógica de negocio (notificaciones) filtrada en capa de Repositorios | Medio | S | Arquitectura | Estructural |
| 16 | Acoplamiento amplio por nombre de columna, sin esquema único compartido | Medio | M | Calidad de código | Estructural |
| 17 | Ambiente de pruebas separado planeado pero no implementado | Medio | M | Testing | Estructural |
| 18 | Esquema fijo de 62 columnas / 5 codeudores limita extensión futura | Medio | L | Escalabilidad | Deuda aceptable |
| 19 | README no refleja la arquitectura nueva | Medio | XS | Documentación | **Quick win** |
| 20 | Legacy sin verificación de rol de servidor | Medio | — | Seguridad | Se resuelve con el cutover |
| 21 | `api_obtenerMisLotes` sin caché (a diferencia del dashboard) | Bajo | XS | Rendimiento | **Quick win** |
| 22 | `BCC_AUDITORIA` como único correo hardcodeado, doble uso (auditoría + bootstrap ADMIN) | Bajo | XS | Seguridad | **Quick win** |
| 23 | CDN sin Subresource Integrity | Bajo | XS | Seguridad | **Quick win** |
| 24 | Logo re-coloreado vía filtro CSS (viola manual de marca) | Bajo | XS | Diseño/marca | **Quick win** |
| 25 | `google.script.run` sin `withFailureHandler` en saludo personalizado | Bajo | XS | Manejo de errores | **Quick win** |
| 26 | `Repositorios_*.js` no usa `retry()` a diferencia del legacy | Bajo | S | Manejo de errores | Deuda aceptable |
| 27 | Derivación de nombre-desde-email reimplementada 3 veces | Bajo | S | Calidad de código | Deuda aceptable |
| 28 | `scripts_app.html` de 2312 líneas sin modularizar por dominio | Medio | L | Calidad de código | Estructural |
| 29 | Sin bitácora de despliegues en el repo | Bajo | XS | DevOps | **Quick win** |

---

## Backlog de remediación priorizado

### Quick wins (impacto alto, esfuerzo bajo — hacer ya)
1. Retirar el scope `mail.google.com` de `appsscript.json` y volver a autorizar con `forzarReautorizacion()` (#1).
2. Sanitizar valores que empiecen con `=`, `+`, `-`, `@` antes de escribir en Sheets (#7).
3. Reemplazar los 4 literales de ID de hoja hardcodeados por la constante existente (#8).
4. Agregar lock corto (o `TextFinder` de idempotencia) a `marcarSolicitudRadicada`/`marcarErrorEnTerceros` (#9).
5. Cambiar la lectura celda-a-celda de `obtenerSolicitudesAnalista` por una lectura de fila completa (#10).
6. Mapear los errores internos a mensajes amigables antes de devolverlos al usuario (#6).
7. Agregar caché de 60s a `api_obtenerMisLotes`, igual que ya tiene el dashboard (#21).
8. Mover `BCC_AUDITORIA` a Script Property (#22).
9. Agregar `integrity=` a los `<script>` de CDN (#23).
10. Quitar el filtro CSS de inversión del logo; usar variante oficial o consultar con marca (#24).
11. Agregar `.withFailureHandler()` a la llamada de `obtenerNombreUsuarioActual()` (#25).
12. Agregar sección al README señalando la migración en curso, con link a `docs/` (#19).
13. Crear `docs/DEPLOYS.md` como bitácora manual de despliegues (#29).

### Mejoras estructurales (impacto alto, esfuerzo medio/alto — planear en próximos sprints)
1. Completar `tomarSolicitudAuxiliar` para que realmente reserve la solicitud dentro del lock (#2) — **antes de activar el flujo del auxiliar en producción**, es un bloqueante funcional, no solo de calidad.
2. Ejecutar la tarea ya planeada T4.6 del backlog: extraer `motorDeAuditoria` a `RadicacionService.js`, acortando el lock a solo la escritura (#5), tal como el propio `docs/07 §W8` ya especifica.
3. Extraer la lógica de notificación fuera de `Repositorios_ColaAuxiliarRepo.js` a un servicio dedicado (#15).
4. Extraer el helper único `obtenerIndiceColumna(headers, nombre)` y reemplazar las 5+ implementaciones duplicadas (#12).
5. Implementar sincronización incremental (marca de última fila procesada) en `Sincronizacion.js` en vez de escaneo completo cada 10 min (#13).
6. Aplicar el patrón de escritura batch ya documentado en `docs/07` a los `setValue()` en loop del legacy (#14).
7. Crear un módulo `Esquema.js` con los nombres de columna como constantes compartidas (#16).
8. Implementar el ambiente de pruebas (`ID_HOJA_CONTROL_TEST`) ya planeado en `docs/03-migracion.md §5` (#17).
9. Construir al menos una suite mínima de pruebas automatizadas para los validadores puros (`validarCelular`, `validarCorreo`, `validarDestino`, `validarCampoMonetario`) — son funciones sin efectos secundarios, las más baratas de testear primero (#3).
10. Modularizar `scripts_app.html` por dominio (radicación/auxiliar/analista/admin) (#28).
11. Versionar/proteger las fórmulas críticas de negocio fuera de la hoja (#4).

### Deuda técnica aceptable por ahora (impacto bajo — documentar y posponer)
1. Esquema fijo de 62 columnas / 5 codeudores — aceptable mientras el volumen y los tipos de participante no cambien (#18).
2. `Repositorios_*.js` sin `retry()` — no rompe nada, solo pierde algo de resiliencia a fallos transitorios (#26).
3. Derivación de nombre-desde-email triplicada — bajo riesgo real de inconsistencia visible (#27).
4. Legacy sin verificación de rol de servidor — se resuelve solo con el cutover ya planeado, no vale la pena invertir en el legacy (#20).

---

## Preguntas abiertas / información faltante

- **No se verificó el estado operativo real de las hojas** (volumen exacto de filas, si las fórmulas de resultado descritas en `docs/05-consolidado-final.md` siguen vigentes tal cual, si hay columnas fuera de lo documentado) — por decisión explícita del solicitante, esta auditoría se basó solo en código y documentación. El hallazgo #4 (lógica de negocio en fórmulas) es, por esta misma razón, el que más se beneficiaría de una revisión directa de la hoja en una fase siguiente.
- **No se ejecutó la aplicación en un navegador** — la consistencia visual real entre pantallas (dimensión 7, pregunta "botón con estilo distinto en cada vista") no se pudo confirmar más allá de lo que el CSS estático permite inferir. Recomendado: correr `/run` o un smoke test manual antes de dar por buena la evaluación de UI.
- **No se verificó el consumo real de cuotas de Apps Script** (tiempo total de ejecución diario, llamadas UrlFetch acumuladas) — requiere acceso a la consola de Google Cloud / Apps Script del proyecto real, fuera del alcance de una auditoría de solo-código.
- **No se verificó qué versión está actualmente desplegada en producción** ni el historial de despliegues — no hay ese registro en el repositorio (ver hallazgo #29); requeriría acceso al panel de "Implementaciones" del editor de Apps Script.
- **El catálogo real de quién es AUXILIAR/ANALISTA hoy** (más allá de lo que la pestaña `USUARIOS` contenga en producción) no se pudo verificar sin acceder a la hoja.
