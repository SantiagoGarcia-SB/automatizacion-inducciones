# Implementation Plan: Automatizar Correos Ley 2300

## Overview

Implementar el envío automático de correos electrónicos de cumplimiento de la Ley 2300 mediante la API de Email de Infobip, como módulo paralelo a `Servicios_InfobipSms.js`. El desarrollo sigue un enfoque incremental: primero la función individual de envío, luego helpers de validación/deduplicación, después la orquestación con rate limiting y circuit breaker, y finalmente la integración con el flujo existente en `Cumplimiento.js`.

## Tasks

- [x] 1. Crear archivo `Servicios_InfobipEmail.js` con función individual de envío
  - [x] 1.1 Implementar `_enviarEmailInfobip(email, nombre, inmobiliaria)`
    - Crear archivo `Servicios_InfobipEmail.js` con la función privada de envío individual
    - Leer credenciales de Script Properties: `INFOBIP_BASE_URL`, `INFOBIP_API_KEY`, `INFOBIP_EMAIL_FROM`, `INFOBIP_EMAIL_TEMPLATE_ID`
    - Construir payload multipart/form-data con `from`, `to` (con placeholders `firstName` y `data Inmobiliaria`), `templateId`, `subject` y `replyTo`
    - Llamar a `UrlFetchApp.fetch()` con `POST {baseUrl}/email/3/send`
    - Implementar retry para HTTP 429: esperar 2s, reintentar máximo 2 veces
    - Retornar `{ok, mensaje, statusCode, messageId}` según respuesta
    - Retornar error inmediato si faltan credenciales en Script Properties
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.4, 3.3, 3.4, 6.5, 6.6_

  - [ ]* 1.2 Write property test: Placeholder mapping correctness
    - **Property 1: Placeholder mapping correctness**
    - **Validates: Requirements 1.2, 2.2**
    - Verificar que para cualquier combinación de nombre e inmobiliaria (strings no vacíos), el payload construido contiene ambos valores mapeados exactamente a `firstName` y `data Inmobiliaria` sin transformación

  - [ ]* 1.3 Write unit tests para `_enviarEmailInfobip`
    - Test envío exitoso HTTP 200 → messageId registrado en resultado
    - Test envío con plantilla no encontrada → clasificado como fallido
    - Test retry en HTTP 429 → éxito en segundo intento
    - Test credenciales faltantes → retorno inmediato con `{ok: false}`
    - Test que `from` contiene dirección de `INFOBIP_EMAIL_FROM`
    - Test que `replyTo` es `autorizacioncanalesdecontacto@ellibertador.co`
    - Test que `templateId` está presente en el payload
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 2.3, 3.3, 3.4_

- [x] 2. Implementar helpers de validación y deduplicación
  - [x] 2.1 Implementar `_validarFormatoEmail(email)`
    - Validar que el email contiene `@` y un dominio con al menos un punto
    - Retornar `true`/`false` para formato válido/inválido
    - Manejar strings vacíos, null, undefined como inválidos
    - _Requirements: 5.1, 5.2_

  - [x] 2.2 Implementar `_deduplicarDestinatarios(lista)`
    - Recibir array de objetos `{nombre, email, inmobiliaria}`
    - Eliminar duplicados por dirección de email (case-insensitive), manteniendo primera ocurrencia
    - Retornar `{unicos: [...], duplicadosEliminados: number}`
    - _Requirements: 5.3, 5.4_

  - [ ]* 2.3 Write property test: Email validation filtering
    - **Property 4: Email validation filtering**
    - **Validates: Requirements 5.1, 5.2**
    - Verificar que para cualquier lista de strings arbitrarios + emails válidos, el sistema excluye direcciones inválidas y solo intenta enviar a las válidas

  - [ ]* 2.4 Write property test: Deduplication correctness
    - **Property 5: Deduplication correctness**
    - **Validates: Requirements 5.3, 5.4**
    - Verificar que para cualquier lista con K emails únicos válidos de N entradas, se envían exactamente K correos y `duplicadosEliminados` = N - invalidosFormato - K

- [x] 3. Checkpoint - Validar funciones base
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implementar función de orquestación con rate limiting y circuit breaker
  - [x] 4.1 Implementar `procesarEnvioEmailLey2300(datosCorreos)`
    - Recibir array de filas con header `['NOMBRE', 'CORREO', 'INMOBILIARIA']`
    - Validar formato de emails con `_validarFormatoEmail`
    - Deduplicar con `_deduplicarDestinatarios`
    - Iterar destinatarios válidos llamando a `_enviarEmailInfobip` con pausa de 200ms entre envíos
    - Implementar circuit breaker: si >50% del total falla consecutivamente, abortar y marcar `abortado: true`
    - Resetear contador de fallos consecutivos en cada éxito
    - Acumular resultados: `{enviados, fallidos, invalidosFormato, duplicadosEliminados, errores, abortado}`
    - Registrar evento resumen en `Logs_Sistema` al finalizar
    - _Requirements: 1.1, 3.1, 3.2, 3.5, 5.1, 5.3, 7.1, 7.2, 7.3_

  - [ ]* 4.2 Write property test: Batch resilience
    - **Property 2: Batch resilience — individual failures don't halt processing**
    - **Validates: Requirements 3.2**
    - Verificar que para N destinatarios con fallos individuales (sin activar circuit breaker), se intenta enviar a todos los N

  - [ ]* 4.3 Write property test: Circuit breaker activation
    - **Property 3: Circuit breaker activation**
    - **Validates: Requirements 3.5**
    - Verificar que cuando >50% falla consecutivamente, el procesamiento se detiene y `abortado` es true

  - [ ]* 4.4 Write property test: Counts invariant
    - **Property 7: Counts invariant**
    - **Validates: Requirements 7.2**
    - Verificar que `enviados + fallidos` = destinatarios intentados, y `enviados + fallidos + invalidosFormato + duplicadosEliminados` ≤ total de entradas originales

- [x] 5. Checkpoint - Validar orquestación
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integrar con `Cumplimiento.js` y modificar reporte
  - [x] 6.1 Modificar `procesarDatosMejorado()` para invocar envío de email y marcado combinado
    - Insertar llamada a `procesarEnvioEmailLey2300(datosCorreos)` después del envío SMS y antes del reporte
    - Envolver en try/catch para que un fallo en email no afecte el flujo de SMS ni el marcado de filas
    - Registrar error con `_registrarEvento_("ERROR", ...)` si el módulo de email lanza excepción
    - Inicializar variable `resultadoEmail` con valores por defecto antes del try/catch
    - Implementar función utilitaria `_generarMarcaEstado(resultadoSms, resultadoEmail, fecha)` en `Cumplimiento.js`:
      - Recibe resultado SMS ({ok:boolean}|null), resultado Email ({ok:boolean}|null) y fecha string
      - Si ambos canales aplican y ambos OK → "Procesado {fecha}"
      - Si ambos aplican y solo uno falla → "Parcial {fecha} · {canal} falló"
      - Si ambos aplican y ambos fallan → "Parcial {fecha} · SMS y Email fallaron"
      - Si solo un canal aplica y fue exitoso → "Procesado {fecha}"
      - Si solo un canal aplica y falló → "Parcial {fecha} · {canal} falló"
    - Refactorizar la lógica de marcado en `procesarDatosMejorado()`:
      - Escribir la marca DESPUÉS de que ambos canales (SMS y Email) completen, no después de cada canal individualmente
      - Para cada fila, determinar qué canales aplicaban (teléfono → SMS, email → Email)
      - Buscar el resultado de envío para los contactos de esa fila en `resultadoSms` y `resultadoEmail`
      - Llamar a `_generarMarcaEstado()` para producir el texto combinado
      - Escribir la marca combinada en la columna "Estado Automatización" en una operación batch
    - _Requirements: 1.3, 6.1, 6.2, 6.3, 6.4, 7.4, 7.6_

  - [ ]* 6.5 Write property test: Marking correctness
    - **Property 8: Marking correctness — combined outcome reflection**
    - **Validates: Requirements 1.3, 7.4, 7.6**
    - Verificar que para cualquier combinación de resultados SMS y Email ({ok:true/false}|null por cada canal), el texto generado por `_generarMarcaEstado()` refleja correctamente el resultado combinado:
      - "Procesado {fecha}" cuando todos los canales que aplican fueron exitosos
      - "Parcial {fecha} · {canal} falló" cuando exactamente un canal falló
      - "Parcial {fecha} · SMS y Email fallaron" cuando ambos canales fallaron
    - Generadores: combinaciones de {ok:boolean}|null para SMS y Email, strings arbitrarios para fecha

  - [x] 6.2 Modificar lógica de adjunto CSV y reporte HTML
    - Condicionar adjunto CSV: adjuntar solo si hay fallidos en email (no cuando todos son exitosos)
    - Si hay fallidos, generar CSV con datos de destinatarios fallidos (nombre, correo, inmobiliaria)
    - Actualizar `_construirCuerpoLey2300_` para incluir métricas de email: enviados, fallidos, inválidos, duplicados eliminados
    - Incluir alerta visual si `resultadoEmail.abortado === true`
    - Actualizar chips del reporte con datos de email además de SMS
    - Actualizar texto de "Próximos pasos" para reflejar que los correos ya fueron enviados automáticamente
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 6.3 Write property test: Failure reporting completeness
    - **Property 6: Failure reporting completeness**
    - **Validates: Requirements 4.3, 4.5**
    - Verificar que el CSV generado contiene exactamente los datos de cada destinatario fallido, sin omisiones ni extras

  - [ ]* 6.4 Write unit tests para integración en Cumplimiento.js
    - Test que error en módulo email no rompe flujo SMS
    - Test reporte sin CSV cuando todos los correos son exitosos
    - Test reporte con CSV cuando hay fallidos
    - Test que el orden de ejecución es: SMS → Email → Reporte
    - _Requirements: 6.2, 6.3, 4.4_

- [x] 7. Checkpoint - Validar integración completa
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integration tests y documentación de configuración
  - [ ]* 8.1 Write integration tests del flujo completo
    - Test `procesarDatosMejorado` invoca email después de SMS
    - Test orden de ejecución: SMS → Email → Reporte dentro del lock
    - Test que no se adquiere lock adicional en el módulo de email
    - Test flujo completo con mezcla de destinatarios válidos/inválidos/duplicados
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 8.2 Crear documentación de configuración en `docs/`
    - Crear archivo `docs/configuracion-email-ley2300.md` con instrucciones de setup
    - Documentar Script Properties necesarias: `INFOBIP_EMAIL_FROM`, `INFOBIP_EMAIL_TEMPLATE_ID`
    - Documentar cómo obtener el `templateId` de la plantilla "CORREO LEY 2300" en el portal Infobip
    - Documentar requisitos de dominio verificado (SPF, DKIM, DMARC)
    - Incluir pasos para verificar la configuración antes del primer envío
    - _Requirements: 6.5, 6.6_

- [x] 9. Final checkpoint - Validación completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- El proyecto usa Google Apps Script (runtime GAS), los tests corren en vitest + fast-check con mocks de `UrlFetchApp`, `PropertiesService`, `Utilities`, `_registrarEvento_`
- El archivo `Servicios_InfobipEmail.js` sigue la misma estructura que `Servicios_InfobipSms.js` para consistencia
- Las credenciales `INFOBIP_BASE_URL` e `INFOBIP_API_KEY` ya existen en Script Properties (reutilizadas del módulo SMS)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "6.4", "6.5", "8.1", "8.2"] }
  ]
}
```
