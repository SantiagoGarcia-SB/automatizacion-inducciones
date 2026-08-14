# Implementation Plan: Generación de PDFs y Correos de Resultados

## Overview

Implementación del módulo `Servicios_Resultados.js` que orquesta la generación de PDFs de resultado (comercial e inmobiliaria) desde plantillas Google Docs y el envío de correos al ejecutivo comercial. Se integra con la arquitectura existente (SpreadsheetRegistry, retry(), _registrarEvento_, LockService, Notificaciones.js) y se expone por API y menú personalizado.

## Tasks

- [x] 1. Definir variables globales y estructura base del módulo
  - [x] 1.1 Agregar variables globales en Codigo.js
    - Añadir `ID_RADICACION_SHEET`, `ID_PLANTILLA_COMERCIAL`, `ID_PLANTILLA_INMOBILIARIA`, `CC_FIJO_RESULTADOS` al bloque de configuración global existente
    - Seguir el patrón de nomenclatura de `ID_HOJA_CONTROL` e `ID_ARCHIVO_ANALISIS`
    - _Requirements: 8.6_

  - [x] 1.2 Crear archivo Servicios_Resultados.js con estructura base
    - Crear el módulo con header docblock siguiendo el estilo de archivos existentes
    - Definir stubs de todas las funciones públicas e internas documentadas en el diseño
    - Incluir JSDoc con @param, @returns para cada función
    - _Requirements: 8.1, 8.2_

- [x] 2. Implementar validación de datos del lote
  - [x] 2.1 Implementar `_leerDatosLote_`
    - Leer datos desde Calculo_Lote usando `SpreadsheetRegistry_get` y `retry()`
    - Validar campos obligatorios: idLote, poliza, inmobiliaria, sucursal, cantAprobadas, cantNegadas
    - Rechazar campos numéricos con valores no numéricos
    - Tratar montoTotal, tasa, margen vacíos como cero con advertencia WARN
    - Leer la lista de solicitudes [{arrendatario, direccion, estado, observacion}]
    - Retornar `{ok: boolean, datos?: DatosLote, error?: string}`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 2.2 Write property test: Mandatory field validation
    - **Property 4: Mandatory field validation**
    - **Validates: Requirements 1.3, 1.4**
    - Usar fast-check para generar datos con campos obligatorios faltantes o tipos incorrectos
    - Verificar que la función rechaza cuando faltan obligatorios y acepta cuando están completos

  - [ ]* 2.3 Write unit tests for `_leerDatosLote_`
    - Test: hoja vacía → abort + alerta visual
    - Test: campo numérico con texto → abort con detalle del campo
    - Test: campos opcionales vacíos → tratados como 0
    - _Requirements: 1.2, 1.3, 1.4_

- [x] 3. Implementar resolución de contactos
  - [x] 3.1 Implementar `_resolverContactoComercial_`
    - Abrir Radicacion_Sheet con `SpreadsheetRegistry_get` y `retry()`
    - Buscar ejecutivo por inmobiliaria (criterio principal), fallback por póliza
    - Buscar director en el mismo registro coincidente
    - Validar formato de email con `_esEmailValido_`
    - Retornar `{ok, ejecutivo?, director?, error?}`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Implementar `_resolverBackupEmail_`
    - Consultar hoja CORREOS en Radicacion_Sheet
    - Verificar checkbox de activación (columna D)
    - Validar formato email del backup (columna C)
    - Retornar email válido o null
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.3 Implementar `_esEmailValido_`
    - Validar que contenga exactamente un "@" y al menos un "." en el dominio
    - Retornar boolean
    - _Requirements: 2.3, 3.4_

  - [ ]* 3.4 Write property test: Contact resolution fallback logic
    - **Property 3: Contact resolution fallback logic**
    - **Validates: Requirements 2.1, 2.2, 2.6**
    - Generar datasets simulados de Radicacion_Sheet con fast-check
    - Verificar: match por inmobiliaria → usa ese, no match inmobiliaria → busca por póliza, ninguno → error

  - [ ]* 3.5 Write unit tests for resolución de contactos
    - Test: email ejecutivo sin "@" → abort
    - Test: director no encontrado → continuación sin director en CC
    - Test: backup con checkbox FALSE → omisión
    - Test: múltiples registros coincidentes → usa el primero
    - _Requirements: 2.3, 2.4, 2.6, 3.3_

- [x] 4. Checkpoint - Validar lectura de datos y resolución de contactos
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implementar generación de PDFs
  - [x] 5.1 Implementar `_reemplazarPlaceholders_`
    - Iterar sobre el mapa de placeholders y reemplazar cada `{{Variable}}` en el body del documento
    - Si un placeholder no tiene valor, reemplazar con cadena vacía
    - _Requirements: 4.2, 5.2_

  - [x] 5.2 Implementar `_inyectarTablaResultados_`
    - Insertar tabla al final del body con columnas: arrendatario, dirección, estado, observación
    - Aplicar color de fondo `#BD0F14` a filas con estado "NEGADO" (case-insensitive)
    - Aplicar color de fondo `#3B6D11` a filas con estado "APROBADO" o "ASEGURABLE" (case-insensitive)
    - Sin color de fondo para cualquier otro estado
    - _Requirements: 4.3, 5.3_

  - [x] 5.3 Implementar `_generarPdfDesdeTemplate_`
    - Copiar plantilla con `DriveApp.getFileById().makeCopy()` envuelto en `retry()`
    - Abrir copia con `DocumentApp.openById()`
    - Llamar `_reemplazarPlaceholders_` y `_inyectarTablaResultados_`
    - Exportar como PDF via URL fetch con token OAuth
    - Eliminar copia temporal en bloque finally (cleanup)
    - _Requirements: 4.1, 4.4, 4.5, 4.6, 5.1, 5.4, 5.5, 5.6_

  - [ ]* 5.4 Write property test: Placeholder replacement completeness
    - **Property 1: Placeholder replacement completeness**
    - **Validates: Requirements 4.2, 5.2**
    - Generar mapas de placeholders arbitrarios y cuerpos de documento simulados
    - Verificar que tras el reemplazo no quedan `{{...}}` que existían como keys en el mapa

  - [ ]* 5.5 Write property test: Table row color assignment correctness
    - **Property 2: Table row color assignment correctness**
    - **Validates: Requirements 4.3, 5.3**
    - Generar listas de solicitudes con estados variados (NEGADO, APROBADO, ASEGURABLE, otros)
    - Verificar la asignación correcta de colores por estado (case-insensitive)

- [x] 6. Implementar construcción de CC y correo
  - [x] 6.1 Implementar `_construirListaCC_`
    - Concatenar: director (si existe), backup (si aplica), CC_FIJO_RESULTADOS
    - Deduplicar con Set
    - Filtrar vacíos y emails inválidos con `_esEmailValido_`
    - Retornar array de emails únicos válidos
    - _Requirements: 6.2_

  - [x] 6.2 Implementar `_construirHtmlResultados_`
    - Usar bloques de Notificaciones.js: `_envolver_`, `_bloque_cabecera_`, `_bloque_barra_estado_`, `_bloque_cuerpo_inicio_`, `_bloque_nota_`, `_bloque_pie_`
    - Interpolar datos del lote en el cuerpo del correo
    - Aplicar colores de marca (#BD0F14, #253150)
    - _Requirements: 6.4, 8.7_

  - [ ]* 6.3 Write property test: CC list deduplication and filtering
    - **Property 5: CC list deduplication and filtering**
    - **Validates: Requirements 6.2**
    - Generar combinaciones de director, backup y CC_Fijo con fast-check
    - Verificar: sin vacíos, sin duplicados, solo emails válidos, length ≤ unique valid count

  - [ ]* 6.4 Write property test: Email subject format
    - **Property 6: Email subject format**
    - **Validates: Requirements 6.5**
    - Generar idLote e inmobiliaria arbitrarios
    - Verificar que el subject sea exactamente `"✅ Resultados inducciones lote: ID {idLote} — {inmobiliaria}"`

- [x] 7. Implementar registro en histórico y orquestación principal
  - [x] 7.1 Implementar `_registrarEnHistorico_`
    - Abrir Historico_Envios con `SpreadsheetRegistry_get`
    - Append row con: fecha (dd/MM/yyyy HH:mm:ss, America/Bogota), idLote, inmobiliaria, poliza, sucursal, cantAprobadas, cantNegadas, resultadoFinal, destinatarios (comma-joined TO+CC)
    - Envolver en retry(), manejar error sin abortar el flujo principal
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Implementar `enviarResultadosLote` (función orquestadora principal)
    - Adquirir LockService.getScriptLock() con tryLock(30000)
    - Secuencia: leerDatos → resolverContacto → resolverBackup → verificarCuota → generarPDFs → construirCC → enviarCorreo → registrarHistórico
    - Enviar con MailApp.sendEmail con to, cc, bcc, subject, htmlBody, attachments, replyTo, name
    - Bloque try/catch/finally con releaseLock()
    - Registrar eventos con `_registrarEvento_` en cada fallo
    - _Requirements: 6.1, 6.3, 6.5, 6.6, 6.7, 6.8, 6.9, 8.3, 8.4, 8.8, 8.9_

  - [ ]* 7.3 Write property test: Historico_Envios record structure
    - **Property 7: Historico_Envios record structure**
    - **Validates: Requirements 7.1**
    - Generar datosLote y destinatarios arbitrarios
    - Verificar que la fila generada tenga exactamente 9 campos en el orden correcto con formatos válidos

  - [ ]* 7.4 Write unit tests for flujo orquestador
    - Test: lock no adquirido → abort con mensaje concurrencia
    - Test: cuota insuficiente → abort limpio
    - Test: error MailApp → PDFs no se eliminan, error registrado
    - Test: error en Historico_Envios → éxito parcial reportado
    - _Requirements: 8.8, 8.9, 6.7, 6.8, 7.3, 7.4_

- [x] 8. Checkpoint - Validar generación de PDFs y envío de correos
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integrar con API y menú
  - [x] 9.1 Agregar `api_enviarResultadosLote` en Api.js
    - Verificar rol con `verificarRol(['ADMIN', 'DIRECTOR', 'GERENTE', 'LIDER'])`
    - Llamar `enviarResultadosLote()` y retornar resultado
    - Bloque try/catch con `_registrarEvento_` y retorno `{ok: false, mensaje}`
    - Seguir el patrón exacto de las funciones api_* existentes
    - _Requirements: 8.5, 9.3_

  - [x] 9.2 Implementar `menuEnviarResultadosLote` en Servicios_Resultados.js
    - Verificar rol del usuario via Session
    - Invocar `enviarResultadosLote()`
    - Mostrar alerta de éxito con ID de lote procesado
    - Mostrar alerta de error genérico (sin detalles técnicos) en caso de fallo
    - Mostrar mensaje de permisos insuficientes si rol no autorizado
    - _Requirements: 9.2, 9.3, 9.4_

  - [x] 9.3 Registrar ítem de menú en Codigo.js (onOpen)
    - Agregar ítem `'📧 Enviar resultados del lote activo'` vinculado a `menuEnviarResultadosLote`
    - Integrar en el menú existente `'📋 Inducciones'`
    - _Requirements: 9.1_

  - [ ]* 9.4 Write integration test: flujo completo con mocks
    - Mock de SpreadsheetRegistry, DriveApp, DocumentApp, MailApp
    - Verificar secuencia completa: lectura → contactos → PDFs → email → histórico
    - Verificar múltiples envíos del mismo lote acumulan filas
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10. Final checkpoint - Verificar integración completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design (7 properties → fast-check with vitest)
- Unit tests validate specific examples and edge cases
- All Google Services calls (Sheets, Drive, Mail) must be wrapped in `retry()` per project conventions
- Test files go in `tests/properties/` and `tests/unit/` following vitest.config.js patterns
- Production runtime is Google Apps Script (V8); tests run in Node.js with vitest + fast-check

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.3"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.4", "3.5", "5.1", "5.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "5.5", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3"] },
    { "id": 7, "tasks": ["7.4", "9.1", "9.2"] },
    { "id": 8, "tasks": ["9.3", "9.4"] }
  ]
}
```
