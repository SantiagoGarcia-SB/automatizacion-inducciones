# Implementation Plan: Usuarios – Jerarquía Unificada

## Overview

Reestructuración del módulo de usuarios para soportar jerarquía organizacional (CONSULTOR → DIRECTOR → GERENTE → ADMIN) con autenticación unificada por emails alternos. Se reemplaza la estructura plana de 8 columnas por 7 columnas con cadena de supervisión directa y se refactoriza AuthService, Api.js y Notificaciones.js.

## Tasks

- [x] 1. Crear Repositorios_UsuariosRepo.js con el nuevo esquema de 7 columnas
  - [x] 1.1 Implementar modelo UsuarioRecord y función UsuariosRepo_leerTodos
    - Crear archivo `Repositorios_UsuariosRepo.js`
    - Definir constantes de columnas: EMAIL(0), ROL(1), ACTIVO(2), CUPO(3), EMAIL_DIRECTOR(4), EMAIL_GERENTE(5), EMAILS_ALTERNOS(6)
    - Implementar `UsuariosRepo_leerTodos()` que lee la pestaña USUARIOS con el nuevo esquema de 7 columnas y retorna array de UsuarioRecord
    - Parsear EMAILS_ALTERNOS separando por coma y normalizando a minúsculas
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 1.2 Implementar UsuariosRepo_buscarPorEmail con búsqueda en alternos
    - Implementar búsqueda primero en columna EMAIL (A), luego en EMAILS_ALTERNOS (G)
    - Normalizar email de entrada a minúsculas antes de comparar
    - Retornar el UsuarioRecord completo del email primario cuando se encuentra por alterno
    - Retornar null si no se encuentra en ninguna columna
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 1.3 Implementar UsuariosRepo_guardar para escritura de 7 campos
    - Validar email único: no debe existir como EMAIL primario ni en EMAILS_ALTERNOS de otro registro
    - Validar ROL contra enum {CONSULTOR, ANALISTA, AUXILIAR, DIRECTOR, GERENTE, ADMIN, ASESOR}
    - Escribir fila con los 7 campos en orden correcto
    - Si `esNuevo=true` y email ya existe, rechazar con mensaje específico
    - Si `esNuevo=false`, actualizar fila existente
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 1.4 Implementar UsuariosRepo_getEmailsEquipoVisible con resolución transitiva
    - CONSULTOR/ANALISTA/AUXILIAR → retornar solo [email propio]
    - DIRECTOR → retornar [email propio] + emails de usuarios cuyo EMAIL_DIRECTOR = email del Director
    - GERENTE → retornar [email propio] + Directores cuyo EMAIL_GERENTE = email del Gerente + transitivamente equipos de esos Directores
    - ADMIN/ASESOR → retornar null (sin filtro, acceso total)
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 1.5 Implementar UsuariosRepo_getCorreosSuperiores
    - Retornar emails de usuarios con ROL ∈ {DIRECTOR, GERENTE, ADMIN} y ACTIVO = TRUE
    - Sin duplicados en el resultado
    - _Requirements: 8.1_

  - [x]* 1.6 Write property tests for UsuariosRepo (Properties 1, 2, 5, 6, 10, 11, 13)
    - **Property 1: Validación de ROL contra enum**
    - **Property 2: Campos de supervisor condicionalmente requeridos**
    - **Property 5: Resolución transitiva de vista jerárquica**
    - **Property 6: Vista sin filtro para roles globales**
    - **Property 10: Unicidad de email en todo el sistema**
    - **Property 11: Round-trip de guardado/lectura de usuario**
    - **Property 13: obtenerCorreosSuperiores retorna roles superiores activos**
    - **Validates: Requirements 1.3, 1.5, 1.6, 3.1, 3.2, 3.3, 3.5, 6.1, 6.2, 6.6, 8.1**

- [x] 2. Refactorizar Servicios_AuthService.js para jerarquía y emails alternos
  - [x] 2.1 Refactorizar _obtenerUsuarioPorEmail para buscar en alternos y cachear múltiples claves
    - Reemplazar `_leerPestanaUsuarios()` por `UsuariosRepo_buscarPorEmail(email)`
    - Al encontrar usuario, cachear bajo TODAS las claves: 'USR_' + emailPrimario y 'USR_' + cada alterno
    - TTL de 120 segundos en CacheService
    - Fallback: si CacheService no está disponible, leer directamente de Sheets (degradación elegante)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

  - [x] 2.2 Refactorizar obtenerUsuarioActual_v2 para retornar campos de jerarquía
    - Retornar emailDirector y emailGerente en el objeto de respuesta
    - Eliminar campo `nombre` de la respuesta (columna eliminada)
    - Mantener verificación de ACTIVO === TRUE → denegar acceso si inactivo
    - Retornar `{autorizado: false, email}` si no se encuentra
    - _Requirements: 2.5, 2.6, 7.4_

  - [x] 2.3 Refactorizar invalidarCacheUsuario para cubrir todos los emails
    - Recibir UsuarioRecord completo (no solo email string)
    - Eliminar N+1 claves de cache: 'USR_' + emailPrimario + 'USR_' + cada alterno
    - _Requirements: 2.7, 6.3_

  - [x] 2.4 Implementar getEmailsEquipoVisible como wrapper de UsuariosRepo
    - Wrapper cacheado sobre `UsuariosRepo_getEmailsEquipoVisible`
    - Usar clave de cache 'EQUIPO_' + email con TTL 60s
    - Exponer como función global para uso en Api.js y otros módulos
    - _Requirements: 3.6_

  - [x] 2.5 Implementar obtenerCorreoDeDirector nuevo y obtenerCorreosSuperiores
    - `obtenerCorreoDeDirector(email)`: leer EMAIL_DIRECTOR de Hoja_Usuarios (no de CORREOS)
    - `obtenerCorreosSuperiores()`: wrapper cacheado en memoria de ejecución sobre UsuariosRepo_getCorreosSuperiores
    - `obtenerCorreosLideres()`: alias de transición que llama a obtenerCorreosSuperiores
    - Eliminar referencia a pestaña CORREOS
    - _Requirements: 4.1, 4.5, 8.1, 8.2, 8.3_

  - [x] 2.6 Implementar alias de roles legacy (COMERCIAL→CONSULTOR, LIDER→DIRECTOR)
    - En `verificarRol()`: si el rol del usuario es CONSULTOR, aceptar también cuando rolesPermitidos incluya 'COMERCIAL'
    - Si el rol es DIRECTOR, aceptar cuando rolesPermitidos incluya 'LIDER'
    - Mapeo bidireccional durante período de transición
    - _Requirements: 7.5_

  - [x]* 2.7 Write property tests for AuthService (Properties 3, 4, 12, 14)
    - **Property 3: Resolución de identidad por email primario y alternos**
    - **Property 4: Acceso denegado para emails sin coincidencia o usuarios inactivos**
    - **Property 12: Invalidación de cache cubre todos los emails del usuario**
    - **Property 14: Alias de roles legacy se resuelven correctamente**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.3, 7.5**

- [x] 3. Checkpoint - Verificar core funcional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Actualizar Api.js para usar vista jerárquica
  - [x] 4.1 Refactorizar api_obtenerResumenDashboard y api_obtenerMisLotes
    - Reemplazar `(usuario.rol === 'LIDER' || usuario.rol === 'ADMIN')` por `getEmailsEquipoVisible(usuario.email)`
    - Si getEmailsEquipoVisible retorna null → sin filtro (verTodos)
    - Si retorna array → filtrar por esos emails
    - Actualizar cacheKey para usar hash del equipo visible en vez de binario GLOBAL/email
    - Actualizar roles permitidos: añadir CONSULTOR, DIRECTOR, GERENTE, ASESOR
    - _Requirements: 7.1, 7.2_

  - [x] 4.2 Refactorizar api_obtenerTodosLosLotes
    - Misma lógica de filtrado por equipo visible
    - Si getEmailsEquipoVisible retorna null → cargar todos
    - Si retorna array → pasar como filtro a obtenerLotesDeComercial
    - _Requirements: 7.2_

  - [x] 4.3 Refactorizar api_obtenerUsuarios y api_guardarUsuario
    - `api_obtenerUsuarios`: permitir acceso a DIRECTOR, GERENTE, ADMIN; filtrar por vista jerárquica del solicitante
    - `api_guardarUsuario`: usar UsuariosRepo_guardar con validación de 7 campos
    - Invalidar cache del usuario después de guardar (usando nuevo invalidarCacheUsuario)
    - Permitir acceso a roles DIRECTOR, GERENTE, ADMIN (no solo LIDER/ADMIN)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 4.4 Actualizar api_obtenerUsuarioActual para exponer campos de jerarquía
    - Incluir emailDirector y emailGerente en la respuesta
    - Eliminar campo nombre de la respuesta
    - _Requirements: 7.4_

  - [x] 4.5 Actualizar api_obtenerMisErroresPendientes y funciones de cola auxiliar
    - Reemplazar lógica binaria LIDER/ADMIN por getEmailsEquipoVisible
    - ADMIN/ASESOR → ver todos (null = sin filtro)
    - Otros roles → filtrar por equipo visible
    - _Requirements: 7.3_

  - [x]* 4.6 Write unit tests for Api.js refactorizado
    - Test: Director ve solo datos de su equipo
    - Test: Gerente ve datos de sus Directores + sus equipos
    - Test: ADMIN ve todos los datos (sin filtro)
    - Test: COMERCIAL como alias de CONSULTOR funciona correctamente
    - _Requirements: 7.1, 7.2, 7.3, 6.5, 6.6_

- [x] 5. Actualizar Notificaciones.js para nueva cadena de CC
  - [x] 5.1 Refactorizar enviarCorreoPazYSalvo y enviarRecordatoriosPazYSalvoDiario
    - Reemplazar `obtenerCorreoDeBackup(email)` por obtener EMAIL_DIRECTOR del registro
    - Usar `obtenerCorreoDeDirector(email)` nuevo (lee de USUARIOS, no de CORREOS)
    - Usar `obtenerCorreosSuperiores()` en vez de `obtenerCorreosLideres()` viejo
    - Eliminar referencia a `correoBackup` en la construcción de CC
    - _Requirements: 4.1, 4.2, 4.4, 4.5_

  - [x] 5.2 Refactorizar enviarRecordatoriosErrorTercerosDiario
    - Mismo patrón: eliminar backup, usar Director directo + Superiores
    - CC = [obtenerCorreosSuperiores(), obtenerCorreoDeDirector(email)].filter(valid)
    - _Requirements: 4.1, 4.2_

  - [x]* 5.3 Write unit tests for Notificaciones CC
    - Test: CC incluye Director del Consultor
    - Test: CC omite Director si EMAIL_DIRECTOR vacío o apunta a inactivo
    - Test: obtenerCorreosLideres como alias retorna mismos resultados que obtenerCorreosSuperiores
    - **Property 7: CC de notificación resuelve al supervisor correcto**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 6. Checkpoint - Verificar integración Auth + API + Notificaciones
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Crear Setup_MigracionV2.js (script de migración idempotente)
  - [x] 7.1 Implementar migrarUsuariosAV2 con transformación de esquema
    - Detectar si ya se ejecutó mediante propiedad de script `_MIGRADO_V2` → salir sin cambios
    - Leer pestaña USUARIOS con esquema viejo (8 columnas)
    - Renombrar COMERCIAL → CONSULTOR, LIDER → DIRECTOR
    - Mapear columnas: EMAIL, ROL(transformado), ACTIVO, CUPO, EMAIL_DIRECTOR(=DIRECTOR viejo), EMAIL_GERENTE(vacío), EMAILS_ALTERNOS(vacío)
    - Descartar NOMBRE, BACKUP, BACKUP_ACTIVO
    - Crear nueva pestaña con headers formateados (negrita, fondo #253150, texto blanco, fila congelada)
    - Escribir datos migrados en nuevo formato
    - Guardar propiedad `_MIGRADO_V2 = true` al finalizar
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.2 Implementar _crearPestanaUsuariosV2 para setup limpio
    - Crear pestaña USUARIOS con 7 headers si no existe
    - Formato: negrita, fondo #253150, texto blanco, fila congelada
    - Idempotente: si ya existe con los headers correctos, no hacer nada
    - _Requirements: 1.1, 1.2_

  - [x]* 7.3 Write property tests for migración (Properties 8, 9)
    - **Property 8: Migración preserva datos y transforma roles**
    - **Property 9: Idempotencia de la migración**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6**

- [x] 8. Crear generadores de property-based testing
  - [x] 8.1 Crear tests/properties/generators/usuario-record.gen.js
    - Implementar `arbUsuarioRecord()`: UsuarioRecord válido con email, rol, y campos condicionales según rol
    - Implementar `arbJerarquiaUsuarios()`: dataset completo con relaciones Gerente→Director→Subordinados
    - Implementar `arbEmailNormalizado()`: email aleatorio normalizado a minúsculas
    - Implementar `arbEmailsAlternos()`: lista de 0-5 emails alternos separados por coma
    - Implementar `arbDatosEsquemaViejo()`: filas en formato viejo (8 columnas) para tests de migración
    - Implementar `arbRolValido()`: uno de los 7 valores enum permitidos
    - Implementar `arbRolInvalido()`: string aleatorio que NO esté en el enum
    - _Requirements: 1.3, 1.5, 1.6_

  - [x]* 8.2 Write property test file tests/properties/usuarios-jerarquia.property.js
    - Crear archivo principal con todos los tests de propiedades P1–P14
    - Mínimo 100 iteraciones por propiedad
    - Tag: `Feature: usuarios-jerarquia-unificada, Property N: <texto>`
    - Importar generadores de usuario-record.gen.js
    - Importar mocks de tests/mocks/
    - **Validates: All Properties 1–14**

- [x] 9. Eliminar código obsoleto y limpiar referencias
  - [x] 9.1 Eliminar función obtenerCorreoDeBackup y lógica de BACKUP_ACTIVO
    - Eliminar función `obtenerCorreoDeBackup` de Notificaciones.js o donde esté definida
    - Eliminar toda referencia a `backupActivo` y `backup` en _leerPestanaUsuarios
    - Eliminar función `_leerPestanaUsuarios` vieja de AuthService (reemplazada por UsuariosRepo_leerTodos)
    - _Requirements: 4.4_

  - [x] 9.2 Actualizar verificarRol para aceptar nuevos roles
    - Añadir CONSULTOR, DIRECTOR, GERENTE, ASESOR como roles válidos en las llamadas existentes
    - Mantener compatibilidad con COMERCIAL, LIDER como alias temporales
    - Actualizar todas las llamadas a verificarRol en Api.js para incluir los nuevos nombres de rol
    - _Requirements: 7.5_

- [x] 10. Final checkpoint - Ejecutar suite completa de tests
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (P1–P14)
- Unit tests validate specific examples and edge cases
- El proyecto usa Google Apps Script (JavaScript ES5/ES6 limitado) — funciones globales, sin módulos
- Los tests usan Vitest + fast-check con mocks para CacheService, SpreadsheetApp, Session, LockService
- La migración es idempotente y segura para re-ejecución
- Los alias COMERCIAL→CONSULTOR y LIDER→DIRECTOR son temporales durante la transición del frontend

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.5"] },
    { "id": 2, "tasks": ["1.4", "1.6"] },
    { "id": 3, "tasks": ["2.1", "2.3", "2.5", "2.6"] },
    { "id": 4, "tasks": ["2.2", "2.4", "2.7"] },
    { "id": 5, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 6, "tasks": ["4.6", "5.1", "5.2"] },
    { "id": 7, "tasks": ["5.3", "7.1", "7.2"] },
    { "id": 8, "tasks": ["7.3", "8.2"] },
    { "id": 9, "tasks": ["9.1", "9.2"] }
  ]
}
```
