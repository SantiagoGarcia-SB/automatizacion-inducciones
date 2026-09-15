# Implementation Plan — Gestión de entregas Ley 2300

## Overview

La implementación se divide en fases que primero establecen trazabilidad y pruebas, después reemplazan la orquestación de entrega, y finalmente exponen la gestión exclusiva de ADMIN. Ninguna fase crea un trigger nuevo: el procesamiento sigue bajo `cumplimiento_ley_2300` y su configuración vigente.

## Tasks

- [ ] 1. Preparar el dominio de entregas y su persistencia
  - [ ] 1.1 Crear `Repositorios_EntregasLey2300Repo.js` con constantes allowlisted, estado de entrega, causas y encabezados de las tres hojas.
  - [ ] 1.2 Implementar bootstrap idempotente de `Entregas_Ley2300`, `Entregas_Ley2300_Eventos` y `Operaciones_Ley2300`.
  - [ ] 1.3 Implementar helpers puros para clave de entrega, enmascaramiento, huella no reversible, normalización de correo/celular y transiciones permitidas.
  - [ ] 1.4 Implementar consultas por ID, UUID y filtros paginados con DTOs que no expongan PII.
  - [ ] 1.5 Implementar append-only de eventos y operaciones de conciliación.
  - [ ] 1.6 Añadir pruebas unitarias de normalización, máscara, claves y máquinas de estado.
  - _Requirements: 1, 3, 6, 7, 8_

- [ ] 2. Adaptar servicios de Infobip a resultados por entrega
  - [ ] 2.1 Refactorizar `Servicios_InfobipSms.js` para centralizar la normalización de celulares, retornar `messageId` cuando exista y producir resultados por entrega.
  - [ ] 2.2 Refactorizar `Servicios_InfobipEmail.js` para propagar resultado individual, `messageId`, código HTTP, causa sanitizada y subintentos 429.
  - [ ] 2.3 Asegurar que logs de ambos servicios no incluyan destinos ni cuerpos de proveedor.
  - [ ] 2.4 Añadir pruebas de transporte simulado para éxito, 429, rechazo, error temporal e incertidumbre.
  - _Requirements: 1, 2, 3, 6, 7_

- [ ] 3. Integrar el ledger en el trigger de Ley 2300
  - [ ] 3.1 Reemplazar la construcción de arreglos anónimos por entregas identificadas con UUID, participante, fila y canal.
  - [ ] 3.2 Crear entregas faltantes para solicitudes aprobadas sin marca y migrar `Parcial` a conciliación sin reenvío.
  - [ ] 3.3 Reclamar cada entrega como `EN_PROCESO` antes de la llamada externa y finalizarla individualmente.
  - [ ] 3.4 Derivar `Estado Automatización` a partir de entregas por UUID, manteniendo compatibilidad visual.
  - [ ] 3.5 Ajustar el circuit breaker para conservar pendientes no procesadas y no consumir sus intentos.
  - [ ] 3.6 Persistir resultados antes del reporte a administradores y actualizar el reporte con el resumen accionable.
  - [ ] 3.7 Añadir pruebas de regresión de idempotencia, caída ambigua, circuito y fallo del reporte.
  - _Requirements: 1, 2, 3, 6, 8_

- [ ] 4. Implementar corrección coordinada de contactos
  - [ ] 4.1 Crear servicio/repository para resolver la columna permitida desde la entrega, nunca desde el cliente.
  - [ ] 4.2 Implementar la operación saga `PREPARADA → CONTROL_APLICADO → ANALISIS_APLICADO → COMPLETA` con lock compartido y comprobación por UUID.
  - [ ] 4.3 Marcar inconsistencias parciales como `PENDIENTE_CONCILIACION` y registrar el evento sanitizado.
  - [ ] 4.4 Mover solo la entrega corregida a `LISTO_PARA_REINTENTO` tras verificar ambas escrituras.
  - [ ] 4.5 Invalidar cachés relacionadas y añadir pruebas de autorización, versión obsoleta, actualización doble y fallo parcial.
  - _Requirements: 4, 7_

- [ ] 5. Exponer APIs ADMIN y bandeja de entregas
  - [ ] 5.1 Añadir RPCs `api_obtenerEntregasLey2300`, `api_obtenerDetalleEntregaLey2300`, `api_obtenerResumenEntregasLey2300` y `api_corregirContactoLey2300` con autorización ADMIN en servidor.
  - [ ] 5.2 Añadir entrada `Entregas Ley 2300` al menú ADMIN y su carga cache-first, skeleton, timeout y filtros.
  - [ ] 5.3 Implementar tabla paginada y detalle enmascarado de entrega, historial y enlace contextual al lote.
  - [ ] 5.4 Implementar modal de corrección guiada con confirmación, bloqueo de doble envío y mensajes genéricos.
  - [ ] 5.5 Invalidar cache de entregas, lotes y detalles después de una corrección exitosa.
  - [ ] 5.6 Añadir pruebas de contratos RPC, autorización, DTO sin PII y comportamiento de la interfaz.
  - _Requirements: 4, 5, 7_

- [ ] 6. Operación, documentación y validación final
  - [ ] 6.1 Actualizar `docs/configuracion-email-ley2300.md` con estados, corrección, reintentos, conciliación, migración y retención.
  - [ ] 6.2 Actualizar README con la bandeja y el comportamiento del trigger configurado.
  - [ ] 6.3 Añadir función manual segura de diagnóstico/migración que no envíe mensajes ni exponga PII.
  - [ ] 6.4 Ejecutar `npm run test:unit`, `npm run test:integration`, `npm run test:properties` y `npm test`.
  - [ ] 6.5 Solicitar revisión final al agente `semantic_reviewer` y resolver hallazgos antes de cerrar.
  - _Requirements: 2, 5, 6, 8_

## Execution waves

| Ola | Tareas | Agente especializado |
|---|---|---|
| 1 | 1.1–1.6 | Dominio y persistencia |
| 2 | 2.1–2.4 | Integración Infobip y pruebas |
| 3 | 3.1–3.7 | Orquestación del trigger |
| 4 | 4.1–4.5 | Consistencia y seguridad de corrección |
| 5 | 5.1–5.6 | API y experiencia ADMIN |
| 6 | 6.1–6.5 | Calidad, documentación y revisión semántica |

## Definition of done

- Las entregas se procesan por UUID, participante y canal sin duplicar envíos aceptados.
- Una corrección ADMIN actualiza `Control_General` y `registro analisis` o queda explícitamente en conciliación.
- Solo la entrega corregida se habilita para el siguiente trigger configurado.
- UI, exportaciones, eventos y logs no exponen PII completa.
- Todas las suites automatizadas pasan y la revisión semántica no contiene hallazgos bloqueantes.
