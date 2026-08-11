# Requirements Document

## Introduction

Reestructuración de la pestaña USUARIOS del sistema de inducciones "El Libertador" para soportar una jerarquía organizacional de roles (CONSULTOR → DIRECTOR → GERENTE → ADMIN) con autenticación unificada por emails alternos. Elimina las columnas NOMBRE, BACKUP y BACKUP_ACTIVO, reemplazándolas por una cadena de supervisión directa (EMAIL_DIRECTOR, EMAIL_GERENTE) y un campo de identidades múltiples (EMAILS_ALTERNOS).

## Glossary

- **Sistema_Auth**: Módulo de autenticación (`Servicios_AuthService.js`) que identifica al usuario por email de sesión y retorna rol/permisos.
- **Hoja_Usuarios**: Pestaña USUARIOS del libro de control en Google Sheets (7 columnas: EMAIL, ROL, ACTIVO, CUPO, EMAIL_DIRECTOR, EMAIL_GERENTE, EMAILS_ALTERNOS).
- **Usuario**: Registro individual en Hoja_Usuarios que representa a una persona con un rol dentro de la organización.
- **Email_Primario**: Valor de la columna A (EMAIL) — identidad canónica del usuario.
- **Emails_Alternos**: Lista de correos adicionales separados por coma en la columna G que identifican a la misma persona.
- **CONSULTOR**: Rol que gestiona la relación con inmobiliarias y radica convenios de inducciones (anteriormente COMERCIAL).
- **ANALISTA**: Rol que evalúa solicitudes en la cola de análisis.
- **AUXILIAR**: Rol que radica en el sistema SAI.
- **DIRECTOR**: Rol que supervisa un equipo de Consultores, Analistas y Auxiliares.
- **GERENTE**: Rol que supervisa Directores y aprueba componentes de segundo nivel.
- **ADMIN**: Rol con acceso total al sistema, aprobación manual y registro en SAI.
- **ASESOR**: Rol de línea de negocio con visibilidad casi global (similar a DIRECTOR/ADMIN) para evaluación técnica.
- **Equipo_Director**: Conjunto de Usuarios cuyo campo EMAIL_DIRECTOR coincide con el Email_Primario de un Director.
- **Equipo_Gerente**: Conjunto de Directores cuyo campo EMAIL_GERENTE coincide con el Email_Primario de un Gerente, más todos los Usuarios en los equipos de esos Directores (transitivo).
- **Vista_Jerarquica**: Filtro de datos que muestra solo la información visible según el rol y la cadena de supervisión del usuario autenticado.
- **CC_Notificacion**: Campo "CC" en correos de notificación que se envía al Director del Consultor notificado, reemplazando la lógica anterior de BACKUP.

## Requirements

### Requirement 1: Nueva estructura de la pestaña USUARIOS

**User Story:** Como administrador del sistema, quiero que la pestaña USUARIOS tenga 7 columnas con jerarquía explícita, para que la cadena de mando esté reflejada directamente en los datos.

#### Acceptance Criteria

1. THE Hoja_Usuarios SHALL contener exactamente 7 columnas en el orden: EMAIL (A), ROL (B), ACTIVO (C), CUPO (D), EMAIL_DIRECTOR (E), EMAIL_GERENTE (F), EMAILS_ALTERNOS (G)
2. WHEN se ejecute el script de setup, THE Sistema_Auth SHALL crear la pestaña USUARIOS con los 7 headers definidos y formato de cabecera (negrita, fondo #253150, texto blanco, fila congelada)
3. THE Hoja_Usuarios SHALL almacenar en la columna ROL únicamente los valores: CONSULTOR, ANALISTA, AUXILIAR, DIRECTOR, GERENTE, ADMIN, ASESOR
4. THE Hoja_Usuarios SHALL almacenar en la columna ACTIVO un valor booleano (TRUE o FALSE)
5. WHEN un registro tenga ROL = CONSULTOR, ANALISTA o AUXILIAR, THE Hoja_Usuarios SHALL contener un valor válido en EMAIL_DIRECTOR (email del Director supervisor)
6. WHEN un registro tenga ROL = DIRECTOR, THE Hoja_Usuarios SHALL contener un valor válido en EMAIL_GERENTE (email del Gerente supervisor)

### Requirement 2: Autenticación unificada con emails alternos

**User Story:** Como usuario con múltiples cuentas de correo, quiero poder acceder al sistema con cualquiera de mis emails registrados, para no depender de cuál cuenta tenga abierta en el navegador.

#### Acceptance Criteria

1. WHEN un usuario inicia sesión, THE Sistema_Auth SHALL obtener el email de la sesión activa de Google Workspace y normalizarlo a minúsculas
2. WHEN el email de sesión coincida exactamente con un valor en la columna EMAIL (columna A), THE Sistema_Auth SHALL identificar al usuario por ese registro
3. WHEN el email de sesión no coincida en la columna EMAIL, THE Sistema_Auth SHALL buscar en la columna EMAILS_ALTERNOS (columna G), separando los valores por coma y comparando cada uno normalizado a minúsculas
4. WHEN se encuentre una coincidencia en EMAILS_ALTERNOS y el campo ACTIVO del registro sea TRUE, THE Sistema_Auth SHALL retornar el objeto de usuario con los datos del Email_Primario correspondiente (email, rol, cupo, emailDirector, emailGerente)
5. IF no se encuentra coincidencia en EMAIL ni en EMAILS_ALTERNOS, THEN THE Sistema_Auth SHALL denegar el acceso retornando { autorizado: false, email: emailSesion }
6. IF se encuentra coincidencia pero el campo ACTIVO es FALSE, THEN THE Sistema_Auth SHALL denegar el acceso retornando { autorizado: false, email: emailSesion }
7. THE Sistema_Auth SHALL cachear el resultado de autenticación en CacheService con TTL de 120 segundos, usando como clave tanto el email primario como cada email alterno del usuario encontrado

### Requirement 3: Vista jerárquica por rol

**User Story:** Como Director, quiero ver los datos de mi equipo (y como Gerente, los de mis Directores y sus equipos), para supervisar el proceso de inducciones sin necesidad de acceso total.

#### Acceptance Criteria

1. WHEN el usuario autenticado tenga ROL = CONSULTOR, ANALISTA o AUXILIAR, THE Sistema_Auth SHALL retornar una vista filtrada que incluya únicamente los registros asociados al email del propio usuario
2. WHEN el usuario autenticado tenga ROL = DIRECTOR, THE Sistema_Auth SHALL retornar una vista filtrada que incluya sus propios registros más los de todos los Usuarios cuyo campo EMAIL_DIRECTOR coincida con el Email_Primario del Director
3. WHEN el usuario autenticado tenga ROL = GERENTE, THE Sistema_Auth SHALL retornar una vista filtrada que incluya: los registros propios, los de todos los Directores cuyo EMAIL_GERENTE coincida con el Email_Primario del Gerente, y transitivamente los equipos de esos Directores
4. WHEN el usuario autenticado tenga ROL = GERENTE, THE Sistema_Auth SHALL permitir filtrar la vista por un Director específico dentro de su equipo
5. WHEN el usuario autenticado tenga ROL = ADMIN o ASESOR, THE Sistema_Auth SHALL retornar una vista sin filtro (acceso total a todos los registros)
6. THE Sistema_Auth SHALL exponer una función que reciba el email del usuario autenticado y retorne la lista de emails de su equipo visible (para usar como filtro en repositorios de datos)

### Requirement 4: Notificaciones con CC al Director (reemplazo de BACKUP)

**User Story:** Como Director, quiero recibir copia de las notificaciones enviadas a mis Consultores, para estar al tanto del estado de las inducciones sin depender de un campo BACKUP manual.

#### Acceptance Criteria

1. WHEN se envíe un correo de notificación a un Consultor, THE Sistema_Auth SHALL buscar en Hoja_Usuarios el registro del Consultor y obtener el valor de EMAIL_DIRECTOR
2. WHEN el campo EMAIL_DIRECTOR contenga un email válido, THE Sistema_Auth SHALL incluirlo como CC en la notificación
3. WHEN se envíe un correo de notificación y el usuario tenga ROL = DIRECTOR, THE Sistema_Auth SHALL buscar el EMAIL_GERENTE del Director y agregarlo como CC adicional
4. THE Sistema_Auth SHALL eliminar toda referencia a las funciones obtenerCorreoDeBackup y la lógica de BACKUP_ACTIVO
5. THE Sistema_Auth SHALL reemplazar la función obtenerCorreoDeDirector actual (que lee de la pestaña CORREOS) por una nueva implementación que lea de la columna EMAIL_DIRECTOR de Hoja_Usuarios

### Requirement 5: Migración de roles y datos existentes

**User Story:** Como administrador, quiero que los datos de usuarios existentes se migren automáticamente a la nueva estructura, para no perder la información ni tener que reconfigurar manualmente.

#### Acceptance Criteria

1. WHEN se ejecute la migración, THE Sistema_Auth SHALL renombrar el rol COMERCIAL a CONSULTOR en todos los registros existentes
2. WHEN se ejecute la migración, THE Sistema_Auth SHALL renombrar el rol LIDER a DIRECTOR en todos los registros existentes
3. WHEN se ejecute la migración, THE Sistema_Auth SHALL mapear la columna DIRECTOR actual (columna E vieja) al campo EMAIL_DIRECTOR (columna E nueva)
4. WHEN se ejecute la migración, THE Sistema_Auth SHALL descartar las columnas NOMBRE, BACKUP y BACKUP_ACTIVO de la estructura
5. WHEN se ejecute la migración, THE Sistema_Auth SHALL preservar los valores de EMAIL, ACTIVO y CUPO en sus nuevas posiciones de columna
6. THE Sistema_Auth SHALL proveer un script de migración idempotente que pueda ejecutarse múltiples veces sin duplicar datos

### Requirement 6: Gestión de usuarios (CRUD) con nueva estructura

**User Story:** Como administrador o Director, quiero crear y editar usuarios con la nueva estructura de 7 campos, para gestionar mi equipo dentro del sistema.

#### Acceptance Criteria

1. WHEN se invoque api_guardarUsuario con esNuevo = true, THE Sistema_Auth SHALL validar que el email no exista ya en la columna EMAIL ni en EMAILS_ALTERNOS de otro registro
2. WHEN se invoque api_guardarUsuario, THE Sistema_Auth SHALL escribir una fila con los 7 campos: email, rol, activo, cupo, emailDirector, emailGerente, emailsAlternos
3. WHEN se actualice un usuario, THE Sistema_Auth SHALL invalidar el cache de todos los emails asociados a ese usuario (primario + alternos)
4. THE Sistema_Auth SHALL validar que el campo ROL contenga uno de los valores permitidos: CONSULTOR, ANALISTA, AUXILIAR, DIRECTOR, GERENTE, ADMIN, ASESOR
5. WHEN un usuario con ROL = DIRECTOR o GERENTE invoque api_obtenerUsuarios, THE Sistema_Auth SHALL retornar únicamente los usuarios visibles según la vista jerárquica del solicitante
6. WHEN un usuario con ROL = ADMIN invoque api_obtenerUsuarios, THE Sistema_Auth SHALL retornar todos los usuarios registrados

### Requirement 7: Compatibilidad del frontend con nuevos roles

**User Story:** Como usuario del sistema, quiero que la lógica de visibilidad en el frontend (dashboard, lotes, cola auxiliar) use la nueva jerarquía en lugar del binario LIDER/ADMIN vs. otros.

#### Acceptance Criteria

1. WHEN el frontend solicite el resumen del dashboard (api_obtenerResumenDashboard), THE Sistema_Auth SHALL determinar la visibilidad usando la función de equipo visible por jerarquía en lugar de la condición binaria (rol === 'LIDER' || rol === 'ADMIN')
2. WHEN el frontend solicite los lotes (api_obtenerMisLotes, api_obtenerTodosLosLotes), THE Sistema_Auth SHALL filtrar usando los emails del equipo visible del usuario autenticado
3. WHEN el frontend solicite la cola auxiliar o errores pendientes, THE Sistema_Auth SHALL mantener el filtrado por estado (PENDIENTE RADICAR, ERROR EN TERCEROS) sin depender del rol para la visibilidad, excepto que roles con vista global (ADMIN, ASESOR) vean todos los registros
4. THE Sistema_Auth SHALL incluir en la respuesta de api_obtenerUsuarioActual los campos emailDirector y emailGerente para que el frontend pueda mostrar la cadena de supervisión
5. WHEN el código del frontend referencie el rol COMERCIAL o LIDER, THE Sistema_Auth SHALL reconocer esos valores como alias temporales de CONSULTOR y DIRECTOR durante el período de transición

### Requirement 8: Función obtenerCorreosLideres actualizada

**User Story:** Como sistema de notificaciones, quiero obtener los correos de roles con visibilidad global (Directores, Gerentes, Admin) para incluirlos en los CC de correos de operación.

#### Acceptance Criteria

1. THE Sistema_Auth SHALL actualizar la función obtenerCorreosLideres para que retorne los emails de usuarios con ROL = DIRECTOR, GERENTE o ADMIN que tengan ACTIVO = TRUE
2. WHEN se invoque obtenerCorreosLideres, THE Sistema_Auth SHALL cachear el resultado en memoria de ejecución para evitar múltiples lecturas a Sheets en la misma invocación
3. THE Sistema_Auth SHALL renombrar la función a obtenerCorreosSuperiores para reflejar la nueva semántica (manteniendo obtenerCorreosLideres como alias durante transición)
