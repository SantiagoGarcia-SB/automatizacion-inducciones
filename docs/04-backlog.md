# Fase 4 — Backlog Priorizado

> Tareas pequeñas, ordenadas, con criterios de aceptación. Ejecutar una por una.

---

## Épica 1: Setup

### T1.1 — Crear estructura de archivos del proyecto
**Descripción**: Crear la estructura de carpetas/archivos para el nuevo frontend y backend, sin eliminar código legacy.  
**Criterios de aceptación**:
- Existe `styles/tokens.html` con todos los CSS custom properties del Brand Book
- Existe `styles/main.html` vacío (placeholder)
- Existen carpetas `components/`, `views/`, `scripts/` con archivos placeholder
- Existe `Api.gs` con funciones stub (retornan datos mock)
- `clasp push` exitoso sin romper el deploy actual

### T1.2 — Configurar Script Properties
**Descripción**: Mover IDs hardcodeados a PropertiesService.  
**Criterios de aceptación**:
- Las propiedades `ID_HOJA_CONTROL`, `ID_ARCHIVO_ANALISIS`, `ID_CARPETA_RAIZ`, `NUEVO_FRONTEND` están en Script Properties
- Un helper `ConfigRepo.gs` las lee una sola vez por ejecución
- El código legacy sigue funcionando con las constantes existentes (no se rompe nada)

### T1.3 — Crear ambiente de pruebas
**Descripción**: Crear copias de las hojas de cálculo para desarrollo/testing + un deployment separado.  
**Criterios de aceptación**:
- Existe copia del Libro de Control (`ID_HOJA_CONTROL_TEST`) con datos de ejemplo (20-30 lotes en todos los estados)
- Existe copia del Libro de Análisis (`ID_ARCHIVO_ANALISIS_TEST`) con datos consistentes
- Script Properties del deployment de test apuntan a las copias
- El deployment de test tiene su propia URL y no afecta producción
- Se puede acceder al nuevo frontend (aunque esté vacío) sin afectar datos reales

---

## Épica 2: Design System / UI Base

### T2.1 — Implementar `styles/tokens.html`
**Descripción**: Convertir `docs/manual-marca.md` en CSS custom properties funcionales.  
**Criterios de aceptación**:
- Todas las variables documentadas están declaradas en `:root`
- Incluye colores, tipografía, espaciado, radios, sombras, gradiente
- Font-face con fallbacks declarado
- El archivo se puede incluir con `<?!= include('styles/tokens') ?>`

### T2.2 — Implementar `styles/main.html`
**Descripción**: Estilos base (reset, tipografía global, utilidades, layout grid).  
**Criterios de aceptación**:
- CSS reset mínimo (box-sizing, margin:0, etc.)
- Clases de layout (`.container`, `.grid`, `.flex`, `.stack`)
- Clases de tipografía (`.text-xs` a `.text-3xl`, `.font-bold`, etc.)
- Responsive breakpoints (`@media`)
- Estilos de scroll, selección, focus visible

### T2.3 — Componente: Header
**Descripción**: Header con gradiente, logo, título, badge de usuario.  
**Criterios de aceptación**:
- Logo SVG cargado desde URL oficial
- Nombre del usuario mostrado (vía `api_obtenerUsuarioActual`)
- Responsive: en mobile se colapsa el nombre

### T2.4 — Componente: Sidebar/Nav
**Descripción**: Navegación lateral con links a cada vista.  
**Criterios de aceptación**:
- Links funcionales que cambian el hash
- Indicador visual de ruta activa
- En mobile: hamburger → slide-in
- Items de admin visibles solo para rol LIDER/ADMIN

### T2.5 — Componente: Toast/Alerta
**Descripción**: Sistema de notificaciones in-app.  
**Criterios de aceptación**:
- Variantes: success, error, warning, info
- Auto-dismiss en 5s con animación
- Posición: top-right fija
- API JS: `showToast({ type, message, duration })`

### T2.6 — Componente: Loader/Skeleton
**Descripción**: Estados de carga.  
**Criterios de aceptación**:
- Spinner centrado para carga de página
- Skeleton shimmer para cards y tablas
- Overlay semitransparente para operaciones bloqueantes

### T2.7 — Componente: Badge de estado
**Descripción**: Pill con color según estado del lote/contrato.  
**Criterios de aceptación**:
- Colores mapeados a cada estado (PENDIENTE, EN ANÁLISIS, ERROR, TERMINADO, etc.)
- Usa tokens del Brand Book
- Accesible (no solo color, también texto)

### T2.8 — Componente: Paginación
**Descripción**: Controles de paginación reutilizables.  
**Criterios de aceptación**:
- Muestra: "Página X de Y" + botones anterior/siguiente
- Emite evento al cambiar de página
- Deshabilitado en extremos

---

## Épica 3: Router y Shell de la SPA

### T3.1 — Implementar `scripts/router.html`
**Descripción**: Hash router mínimo para la SPA.  
**Criterios de aceptación**:
- Escucha `hashchange`
- Muestra/oculta secciones `[data-view="..."]`
- Ruta por defecto: `#/dashboard`
- Soporta parámetros: `#/lote/:id`

### T3.2 — Implementar `scripts/api-client.html`
**Descripción**: Wrapper promisificado de `google.script.run`.  
**Criterios de aceptación**:
- Función `callServer(fnName, ...args)` retorna Promise
- Manejo global de errores (muestra toast)
- Spinner automático para llamadas largas

### T3.3 — Implementar `index.html` (shell)
**Descripción**: HTML principal que ensambla todo con includes.  
**Criterios de aceptación**:
- Incluye tokens, main, componentes, views, scripts
- Meta viewport, título, favicon
- Estructura: header + sidebar + main[data-view]
- Carga sin errores en el deployment de test

---

## Épica 4: Backend / API

### T4.1 — Implementar `AuthService.gs`
**Descripción**: Servicio de autenticación y roles.  
**Criterios de aceptación**:
- `obtenerUsuarioActual()` retorna `{ email, nombre, rol }`
- Rol derivado de: email en CORREOS_LIDERES → LIDER, BCC_AUDITORIA → ADMIN, resto → COMERCIAL
- Test: verificar con 3 emails distintos

### T4.2 — Implementar `ConfigRepo.gs`
**Descripción**: Acceso centralizado a configuración.  
**Criterios de aceptación**:
- Lee Script Properties una vez y cachea en variable global
- Funciones: `getHojaControlId()`, `getArchivoAnalisisId()`, `getCarpetaRaizId()`, `isNuevoFrontendActivo()`

### T4.3 — Implementar `ControlGeneralRepo.gs`
**Descripción**: Acceso a datos de Control_General.  
**Criterios de aceptación**:
- `obtenerTodosLosLotes()` — retorna array de objetos lote (agrupados)
- `obtenerLotePorId(idLote)` — retorna lote con sus contratos
- `obtenerLotesDeUsuario(email, limite)` — últimos N lotes del usuario
- `insertarFilas(filas)` — escritura batch
- Usa batch read (`getValues()`) y TextFinder donde aplique

### T4.4 — Implementar `ConsultaService.gs`
**Descripción**: Búsquedas con filtros y paginación.  
**Criterios de aceptación**:
- `buscarLotes(filtros, pagina)` — filtra por estado, fecha, póliza, comercial
- Retorna `{ datos, total, pagina, totalPaginas }`
- Paginación en servidor (no enviar todo al cliente)

### T4.5 — Implementar `Api.gs` (funciones expuestas)
**Descripción**: Capa de funciones llamables desde el frontend.  
**Criterios de aceptación**:
- Cada función verifica sesión antes de ejecutar
- Manejo de errores consistente (try/catch → objeto de error)
- Funciones: `api_obtenerUsuarioActual`, `api_radicarLote`, `api_consultarLote`, `api_obtenerLotesUsuario`, `api_obtenerResumenSemanal`, `api_obtenerDashboardMetricas`, `api_buscarLotes`, `api_obtenerCatalogos`

### T4.6 — Migrar lógica de radicación al nuevo servicio
**Descripción**: Extraer `motorDeAuditoria()` a `RadicacionService.gs` con la misma lógica pero estructura limpia.  
**Criterios de aceptación**:
- La función existente `motorDeAuditoria()` sigue funcionando (no se rompe legacy)
- `RadicacionService.radicarLote(formData)` replica la misma lógica
- Usa repos en vez de acceso directo a hojas
- Tests manuales con datos de prueba pasan

### T4.7 — Implementar `AnalisisService.gs`
**Descripción**: Servicio para el flujo completo del analista (cola, asignación, evaluación).  
**Criterios de aceptación**:
- `obtenerColaDisponible(pagina)` — retorna casos con PENDIENTE ASIGNAR y ASIGNADA A… vacío, paginados
- `tomarCaso(uuid, emailAnalista)` — usa LockService, escribe ASIGNADA A… y cambia estado a EN ANÁLISIS. Falla si el caso ya está tomado.
- `obtenerMisCasos(emailAnalista)` — retorna casos donde ASIGNADA A… = email
- `obtenerCasoParaEvaluar(uuid)` — retorna todos los datos del caso (inmueble + participantes) para el formulario
- `guardarEvaluacion(uuid, datos)` — guarda campos parciales sin finalizar
- `finalizarEvaluacion(uuid, datos)` — escribe REGISTRO ANALISTA SAI, Fecha Evaluacion, resultados. Cambia estado a TERMINADO.
- `reasignarCaso(uuid, nuevoEmail)` — solo para LIDER/ADMIN
- `liberarCaso(uuid)` — devuelve a cola (borra ASIGNADA A…, estado → PENDIENTE ASIGNAR)

### T4.8 — Implementar `AnalisisRepo.gs`
**Descripción**: Acceso a datos de la hoja "registro analisis".  
**Criterios de aceptación**:
- `obtenerCasosPendientes()` — lee filas donde ASIGNADA A… está vacío y hay datos
- `obtenerCasosPorAnalista(email)` — lee filas donde ASIGNADA A… = email
- `obtenerCasoPorUUID(uuid)` — retorna toda la fila como objeto con campos nombrados
- `actualizarCamposEvaluacion(uuid, campos)` — escribe solo los campos proporcionados en la fila correcta
- Todos los métodos usan batch read/write y mapeo dinámico de columnas (por headers, no por índice fijo)

---

## Épica 5: Vistas Frontend

### T5.1 — Vista: Dashboard
**Descripción**: Pantalla de inicio con KPIs y resumen.  
**Criterios de aceptación**:
- Saludo personalizado con nombre del usuario
- Cards de KPIs (pendientes por radicar, en análisis, paz y salvo, terminados)
- Tabla de últimos 5 lotes
- Loading skeleton mientras carga
- Responsive (cards apiladas en mobile)

### T5.2 — Vista: Radicación
**Descripción**: Formulario de radicación con stepper.  
**Criterios de aceptación**:
- Stepper visual de 3 pasos
- Validaciones en cliente (póliza, tasa, planilla cargada, opción PS seleccionada)
- Parseo de Excel con SheetJS en cliente
- Pre-validación de datos antes de enviar al servidor
- Modal de progreso durante envío
- Resultado: éxito con confetti + ID, o tabla de errores
- Persistencia de borrador en localStorage

### T5.3 — Vista: Listado de lotes
**Descripción**: Tabla paginada con filtros.  
**Criterios de aceptación**:
- Filtros: estado, rango de fechas, búsqueda por ID/póliza
- Tabla con columnas: ID, Póliza, Comercial, Fecha, Contratos, Estado
- Paginación (20 por página)
- Click en fila → navega a detalle
- Estado vacío si no hay resultados

### T5.4 — Vista: Detalle de lote
**Descripción**: Vista completa de un lote y sus contratos.  
**Criterios de aceptación**:
- Datos del lote en header
- Tabla de contratos con estado individual
- Badge de estado en cada contrato
- Botón "Volver al listado"

### T5.5 — Vista: Panel admin
**Descripción**: Gestión administrativa (solo para líderes/admin).  
**Criterios de aceptación**:
- Acceso restringido por rol (verificado en servidor)
- Tab de métricas globales
- Tab de catálogo de correos (tabla + CRUD)
- Tab de asignaciones (ver/reasignar/liberar casos)
- Tab de reportes (exportar Excel/CSV)

### T5.6 — Vista: Cola de análisis
**Descripción**: Lista de casos disponibles para que el analista tome.  
**Criterios de aceptación**:
- Tabla paginada con casos en PENDIENTE ASIGNAR
- Click en caso → modal de confirmación "¿Tomar este caso?"
- Al confirmar: llamada a `api_tomarCaso` con lock → toast de éxito → redirige a "Mis casos"
- Si otro analista tomó el caso primero: toast de error "Este caso ya fue tomado por otro analista"
- Estado vacío: "No hay casos disponibles en este momento"

### T5.7 — Vista: Mis casos (analista)
**Descripción**: Casos asignados al analista logueado.  
**Criterios de aceptación**:
- Cards con datos resumidos del caso + badge de estado
- Botón "Evaluar →" en cada card → navega a formulario de evaluación
- Si no hay casos: CTA "Ir a la cola de casos"

### T5.8 — Vista: Formulario de evaluación
**Descripción**: Formulario completo para que el analista evalúe un caso.  
**Criterios de aceptación**:
- Datos del inmueble mostrados en card colapsable (solo lectura)
- Sección de inquilino: datos personales (solo lectura) + campos de evaluación (editables)
- Sección de codeudores: se renderiza dinámicamente solo si COA[N] existe (1-5)
- Sección de resultado: campos de resumen de la solicitud
- "Guardar borrador" → guarda sin cambiar estado
- "Finalizar evaluación" → confirma → escribe REGISTRO ANALISTA SAI + fecha + cambia a TERMINADO
- Validaciones: campos obligatorios antes de finalizar
- Responsive: formulario legible en tablet/mobile

---

## Épica 6: Integración y QA

### T6.1 — Integrar frontend con backend real
**Descripción**: Reemplazar datos mock por llamadas reales a Api.gs.  
**Criterios de aceptación**:
- Dashboard carga datos reales
- Radicación funciona end-to-end en deployment de test
- Listado y detalle muestran datos reales
- Errores se muestran como toasts

### T6.2 — Testing end-to-end
**Descripción**: Pruebas completas de cada flujo.  
**Criterios de aceptación**:
- Radicación exitosa con planilla válida
- Radicación fallida con errores mostrados correctamente
- Consulta de lote existente vs inexistente
- Paginación con >20 registros
- Admin: CRUD de correos funcional
- **Analista: tomar caso desde cola → evaluar → finalizar → caso desaparece de cola y aparece como TERMINADO**
- **Analista: dos analistas intentan tomar el mismo caso → solo uno lo obtiene**
- **Admin: reasignar un caso de un analista a otro**
- Mobile: todas las vistas usables en 375px

### T6.3 — Testing de concurrencia
**Descripción**: Verificar que LockService funciona bajo carga.  
**Criterios de aceptación**:
- Dos radicaciones simultáneas: una espera y completa después
- Mensaje amigable si timeout de lock

### T6.4 — Testing de permisos
**Descripción**: Verificar que roles restringen acceso.  
**Criterios de aceptación**:
- COMERCIAL no puede ver #/admin ni #/analisis
- COMERCIAL no puede llamar `api_tomarCaso()` ni `api_actualizarEstado()` desde consola
- ANALISTA puede ver #/analisis pero no #/admin ni #/radicar
- ANALISTA no puede llamar `api_reasignarCaso()` desde consola
- LIDER puede ver todo

---

## Épica 7: Migración y Deploy

### T7.1 — Activar feature flag en producción
**Descripción**: Cambiar `NUEVO_FRONTEND = true`.  
**Criterios de aceptación**:
- Usuarios ven el nuevo frontend
- Legacy accesible con `?page=legacy`
- Monitoreo de Logs_Sistema sin errores críticos

### T7.2 — Proteger hojas de cálculo
**Descripción**: Restringir acceso directo a las hojas.  
**Criterios de aceptación**:
- Comerciales tienen acceso "Viewer" (no "Editor")
- Protección de rangos aplicada en pestañas clave
- El script sigue pudiendo escribir (executeAs: USER_DEPLOYING)

### T7.3 — Comunicación y capacitación
**Descripción**: Notificar a usuarios del cambio.  
**Criterios de aceptación**:
- Correo enviado a todos los comerciales con URL y guía
- Video/documento de 1 página con los flujos principales
- Canal de soporte definido (email/chat)

### T7.4 — Limpieza de código legacy
**Descripción**: Remover archivos y funciones legacy.  
**Criterios de aceptación**:
- Archivos legacy renombrados a `_legacy_*` (2 semanas de gracia)
- Tras validación: eliminados definitivamente
- `doGet()` sin bifurcación legacy
- Solo la nueva estructura de archivos permanece

---

## Orden de ejecución recomendado

```
T1.1 → T1.2 → T1.3
  ↓
T2.1 → T2.2 → T2.3 → T2.4 → T2.5 → T2.6 → T2.7 → T2.8
  ↓
T3.1 → T3.2 → T3.3
  ↓ (paralelo con Épica 4)
T4.1 → T4.2 → T4.3 → T4.4 → T4.5 → T4.6 → T4.7 → T4.8
  ↓
T5.1 → T5.2 → T5.3 → T5.4 → T5.6 → T5.7 → T5.8 → T5.5
  ↓
T6.1 → T6.2 → T6.3 → T6.4
  ↓
T7.1 → T7.2 → T7.3 → T7.4
```

**Estimación total**: ~6-8 semanas de desarrollo iterativo (el flujo de analista agrega ~2 semanas).

---

## Catálogo de analistas

Para determinar si un usuario es ANALISTA, se necesita una fuente de verdad. Opciones:

1. **Nueva pestaña "ANALISTAS"** en el Libro de Control (email, nombre, activo) — recomendado por consistencia con CORREOS.
2. **Script Property** con lista de emails separados por coma — simple pero frágil.
3. **Derivar del campo ASIGNADA A…** — si alguna vez aparece tu email como asignado, eres analista. Insuficiente para nuevos analistas.

**Recomendación**: Opción 1 — crear pestaña ANALISTAS. Se gestiona desde el panel admin (#/admin).
