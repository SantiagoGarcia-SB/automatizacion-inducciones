# Fase 1 — Arquitectura y Modelo de Datos

---

## 1. Decisión de persistencia

**Se mantiene Google Sheets como base de datos.** Razones:
- Volumen bajo-medio (cientos a bajo miles de registros) — dentro de los límites de Sheets.
- Costo cero adicional (ya pagado con Google Workspace).
- Continuidad con el sistema existente — migración no destructiva.
- Conveniencia para auditoría manual de emergencia (admin puede abrir la hoja si es necesario).

**Complementos:**
- `PropertiesService` (Script Properties) para configuración: IDs de hojas, feature flags.
- `CacheService` para catálogos que cambian poco (hoja CORREOS, estados válidos) — TTL 5 min.
- `LockService` para escrituras concurrentes.

---

## 2. Modelo de datos (entidades y relaciones)

### 2.1 Entidades identificadas

```
┌─────────────────────────────────────────────────────────────────────┐
│ LOTE (Control_General — agrupado por ID Lote)                       │
│ PK: ID Lote (compuesto: fecha-póliza-hora)                          │
│ Campos: fecha_ingreso, estado_cartera, poliza, tipo_negociacion,    │
│         tasa_negociacion, comercial, estado                          │
└─────────────────────────────────────────────────────────────────────┘
         │ 1:N
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CONTRATO (Control_General — cada fila es un contrato)               │
│ PK: UUID_SISTEMA                                                     │
│ FK: ID Lote                                                          │
│ Campos: nro, fecha_inicio, amparo, destino, ciudad, direccion,      │
│         canon, administracion, iva, arrendatario (nombre, td, id,   │
│         cel, correo), codeudores 1-5 (nombre, td, id, cel, correo), │
│         estado, fecha_ultimo_aviso                                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ LOG_RADICACION (Hoja_Control)                                        │
│ Campos: fecha, email_usuario, poliza, resultado, detalle, id_lote,  │
│         observaciones                                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ CATALOGO_CORREOS (CORREOS)                                           │
│ PK: correo_ejecutivo                                                 │
│ Campos: correo_director, correo_backup, backup_activo                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ ANALISIS (registro analisis — libro de Análisis)                     │
│ PK: UUID_SISTEMA                                                     │
│ Campos: espejo de Contrato + asignada_a, registro_analista_sai,     │
│         fecha_evaluacion, estado_automatizacion                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ HISTORICO_ENVIOS (Historico_Envios — libro de Análisis)              │
│ Campos: fecha_emision, solicitudes_aprobadas, solicitudes_negadas,  │
│         resultado_final_lote                                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ LOGS_SISTEMA (Logs_Sistema)                                          │
│ Campos: timestamp, nivel, modulo, mensaje, detalle                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Entidad ANALISIS (estructura real — headers de "registro analisis")

```
┌─────────────────────────────────────────────────────────────────────┐
│ ANALISIS (registro analisis — hoja completa)                         │
│ PK: UUID_SISTEMA (implícito, mapeado como "Solicitud Inquilino"     │
│     + "codigo lote")                                                 │
│                                                                      │
│ --- Datos del lote/contrato (sincronizados desde Control_General) -- │
│ Fecha Lote, tipo negociacion, Poliza, inmobiliaria, sucursal,       │
│ Destino, ciudad del inmueble, Direccion, Fecha inicio de contrato,  │
│ Amparo integral, Tasa Negociación, Canon, Administracion, Iva,      │
│ valor a asegurar, codigo lote                                        │
│                                                                      │
│ --- Datos del inquilino ------------------------------------------- │
│ Arrendatario, TD_INQ, Id_arrendatario, TEL_INQ, CORREO_INQ,        │
│ Solicitud Inquilino                                                  │
│                                                                      │
│ --- Evaluación del inquilino (DILIGENCIADOS POR EL ANALISTA) ------ │
│ Ingresos, Acierta, ocupacion, Respuesta modelo inquilino,           │
│ Regla Dura Inquilino, Resultado Final Inquilino                      │
│                                                                      │
│ --- Codeudores 1-5 (datos + evaluación × cada uno) --------------- │
│ COA[N], TD_COA[N], Id_COA[N], TEL_COA[N], CORREO_COA[N],           │
│ NRO COA[N], Ingresos COA[N], Acierta COA[N], Ocupacion COA[N],     │
│ Respuesta modelo COA[N], Regla Dura COA[N], Resultado Final COA[N]  │
│                                                                      │
│ --- Resumen de evaluación del caso -------------------------------- │
│ Num coa aprob, #ERROR!, Num coa negados analisis, coa evaluados,    │
│ Política ingresos solicitud, RESULTADO SOLICITUD,                    │
│ RESULTADO SOLICITUD LNeg, DETALLE RESULTADO SOLICITUD,              │
│ RESULTADO LOTE, contrato_de, comentarios del analista,              │
│ REGISTRO ANALISTA SAI, DETALLE RESULTADO COMERCIAL                  │
│                                                                      │
│ --- Asignación y control ------------------------------------------ │
│ ASIGNADA A…, Fecha Evaluacion, Estado Automatización                │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Relaciones
```
LOTE ──1:N──→ CONTRATO (por ID Lote)
CONTRATO ──1:1──→ ANALISIS (por UUID_SISTEMA / Solicitud Inquilino)
CATALOGO_CORREOS ←──lookup──→ LOG_RADICACION (por email)
```

### 2.4 No se normaliza (por ahora)
- Los datos de arrendatario y codeudores permanecen desnormalizados (62+ columnas en cada hoja). Normalizar a tablas PARTICIPANTE/EVALUACION separadas agregaría complejidad sin beneficio dado el volumen.
- Los campos de evaluación del analista (Ingresos, Acierta, Ocupación, Respuesta modelo, Regla Dura, Resultado Final) se replican por participante — esto es intencional por cómo opera el proceso de scoring.

---

## 3. Arquitectura de la Web App

### 3.1 Diagrama de capas

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTACIÓN (Frontend)                │
│  index.html                                              │
│  ├── <?!= include('styles/tokens') ?>                    │
│  ├── <?!= include('styles/main') ?>                      │
│  ├── <?!= include('components/header') ?>                │
│  ├── <?!= include('components/sidebar') ?>               │
│  ├── <?!= include('views/dashboard') ?>                  │
│  ├── <?!= include('views/radicacion') ?>                 │
│  ├── <?!= include('views/seguimiento') ?>                │
│  ├── <?!= include('views/admin') ?>                      │
│  ├── <?!= include('scripts/api-client') ?>               │
│  ├── <?!= include('scripts/router') ?>                   │
│  └── <?!= include('scripts/app') ?>                      │
│                                                          │
│  Navegación: SPA con hash routing (#/dashboard,          │
│  #/radicar, #/lotes, #/lote/:id, #/admin)                │
└──────────────────────────┬──────────────────────────────┘
                           │ google.script.run
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     CAPA API (Api.gs)                     │
│  Funciones expuestas a google.script.run:                 │
│  - api_obtenerUsuarioActual()                            │
│  - api_radicarLote(formData)                             │
│  - api_consultarLote(idLote)                             │
│  - api_obtenerLotesUsuario()                             │
│  - api_obtenerResumenSemanal()                           │
│  - api_obtenerDashboardMetricas()                        │
│  - api_buscarContratos(filtros, pagina)                  │
│  - api_obtenerCatalogos()                                │
│  - api_actualizarEstado(uuid, nuevoEstado)               │
│  - api_exportarReporte(tipo, filtros)                    │
│  --- Funciones de analista ---                           │
│  - api_obtenerColaAnalisis(pagina)                       │
│  - api_tomarCaso(uuid)                                   │
│  - api_obtenerMisCasos()                                 │
│  - api_obtenerCasoParaEvaluar(uuid)                      │
│  - api_guardarEvaluacion(uuid, datosEvaluacion)          │
│  - api_finalizarEvaluacion(uuid, resultado)              │
│  --- Funciones de admin ---                              │
│  - api_reasignarCaso(uuid, emailAnalista)                │
│  - api_liberarCaso(uuid)                                 │
│  Cada función: valida sesión → llama servicio → retorna  │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│               CAPA SERVICIO (Servicios/*.gs)              │
│  RadicacionService.gs  — lógica de auditoría y registro  │
│  ConsultaService.gs    — búsquedas, filtros, paginación  │
│  AnalisisService.gs   — cola, asignación, evaluación     │
│  NotificacionService.gs— envío de correos                │
│  SincronizacionService.gs — sync entre hojas             │
│  ReporteService.gs     — métricas y exportación          │
│  AuthService.gs        — verificar rol del usuario       │
│  ValidacionService.gs  — validadores (destino, cel, etc) │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│            CAPA ACCESO A DATOS (Repositorios/*.gs)        │
│  ControlGeneralRepo.gs  — CRUD sobre Control_General     │
│  HojaControlRepo.gs     — escritura de logs              │
│  CorreosRepo.gs         — lectura catálogo correos       │
│  AnalisisRepo.gs        — lectura/escritura análisis     │
│  ConfigRepo.gs          — PropertiesService              │
│  Cada repo: abre hoja → getValues/setValues en batch     │
│             → usa CacheService cuando aplica             │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              PERSISTENCIA (Google Sheets)                 │
│  Libro de Control (4 pestañas)                           │
│  Libro de Análisis (2 pestañas)                          │
│  Google Drive (carpetas por lote)                        │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Punto de entrada

```javascript
// Code.gs
function doGet(e) {
  const page = e.parameter.page || 'app';
  
  if (page === 'app') {
    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Inducciones | El Libertador')
      .setFaviconUrl('https://www.ellibertador.co/favicon.ico')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

### 3.3 Navegación (SPA con hash routing)

| Ruta | Vista | Rol |
|---|---|---|
| `#/dashboard` | Dashboard con KPIs y resumen | Todos |
| `#/radicar` | Formulario de radicación | Comercial |
| `#/lotes` | Listado de lotes con filtros y paginación | Todos |
| `#/lote/:id` | Detalle de un lote y sus contratos | Todos |
| `#/analisis` | Cola de casos disponibles para tomar | Analista |
| `#/analisis/mis-casos` | Casos asignados al analista logueado | Analista |
| `#/analisis/caso/:uuid` | Formulario de evaluación de un caso | Analista |
| `#/admin` | Panel administrativo | Líder/Admin |
| `#/admin/correos` | Gestión de catálogo de correos | Admin |
| `#/admin/asignaciones` | Reasignación de casos | Líder/Admin |
| `#/admin/reportes` | Generación de reportes | Líder/Admin |

### 3.4 Roles y permisos (verificados en servidor)

```javascript
// AuthService.gs
function obtenerRolUsuario() {
  const email = Session.getActiveUser().getEmail();
  if (email === BCC_AUDITORIA) return 'ADMIN';
  if (CORREOS_LIDERES.includes(email)) return 'LIDER';
  if (esAnalista(email)) return 'ANALISTA';
  return 'COMERCIAL';
}
```

| Rol | Acceso |
|---|---|
| COMERCIAL | Dashboard propio, radicar, consultar sus lotes |
| ANALISTA | Dashboard propio, cola de casos, tomar caso, evaluar, registrar resultado |
| LIDER | Todo lo de comercial + analista + admin (métricas globales, reportes, catálogos) |
| ADMIN | Todo + configuración del sistema |

### 3.5 Flujo del analista — Asignación manual de casos

```
                         ┌──────────────────────────────┐
                         │  Cola de casos disponibles    │
                         │  (estado = PENDIENTE ASIGNAR) │
                         └───────────────┬──────────────┘
                                         │ Analista hace clic
                                         │ "Tomar este caso"
                                         ▼
                         ┌──────────────────────────────┐
                         │  Caso asignado al analista    │
                         │  estado → EN ANÁLISIS         │
                         │  ASIGNADA A… → email analista │
                         └───────────────┬──────────────┘
                                         │ Analista evalúa
                                         │ (llena campos de resultado)
                                         ▼
                         ┌──────────────────────────────┐
                         │  Registro de evaluación       │
                         │  REGISTRO ANALISTA SAI = ✓    │
                         │  Fecha Evaluacion = hoy       │
                         │  Resultado solicitud/lote     │
                         │  estado → TERMINADO           │
                         └──────────────────────────────┘
```

**Reglas de la asignación:**
- Solo se muestran en cola los casos con estado `PENDIENTE ASIGNAR` y `ASIGNADA A…` vacío.
- Cuando un analista toma un caso, se escribe su email en `ASIGNADA A…` y el estado cambia a `EN ANÁLISIS`.
- Un analista solo puede tomar un caso a la vez (o un límite configurable).
- Un líder puede reasignar casos desde el panel admin.
- Se usa LockService para evitar que dos analistas tomen el mismo caso simultáneamente.

---

## 4. Patrones técnicos

### 4.1 Llamadas cliente-servidor (promisificadas)

```javascript
// scripts/api-client.html
function callServer(functionName, ...args) {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      [functionName](...args);
  });
}
```

### 4.2 Paginación en servidor

```javascript
// ConsultaService.gs
function buscarContratos(filtros, pagina, porPagina = 20) {
  const todos = obtenerTodosLosContratos(filtros);
  const total = todos.length;
  const inicio = (pagina - 1) * porPagina;
  const datos = todos.slice(inicio, inicio + porPagina);
  return { datos, total, pagina, porPagina, totalPaginas: Math.ceil(total / porPagina) };
}
```

### 4.3 Caché para catálogos

```javascript
// CorreosRepo.gs
function obtenerCorreosCacheado() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('CATALOGO_CORREOS');
  if (cached) return JSON.parse(cached);
  
  const datos = leerHojaCorreos();
  cache.put('CATALOGO_CORREOS', JSON.stringify(datos), 300); // 5 min TTL
  return datos;
}
```

### 4.4 Lock para escrituras

```javascript
// RadicacionService.gs
function radicarLote(formData) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    throw new Error('Otro usuario está radicando. Intenta de nuevo en unos segundos.');
  }
  try {
    // ... lógica de radicación
  } finally {
    lock.releaseLock();
  }
}
```

---

## 5. Convivencia con el código actual

### 5.1 Estrategia de migración del código

El código existente (`Codigo.js`, `Notificaciones.js`, etc.) **NO se elimina** inmediatamente. Se sigue esta secuencia:

1. **Fase Setup**: Crear la nueva estructura de archivos junto a los existentes. El `doGet()` actual se mantiene pero se parametriza con `?page=legacy` vs `?page=app`.
2. **Fase Backend**: Extraer la lógica a la nueva capa de servicios/repos, reutilizando funciones existentes como `motorDeAuditoria()`, `validarDestino()`, etc.
3. **Fase Frontend**: Construir el nuevo frontend que consume la nueva API.
4. **Fase Cutover**: Redirigir `doGet()` al nuevo frontend. Mantener el legacy accesible por parámetro durante 2 semanas.
5. **Fase Limpieza**: Eliminar código legacy tras validación completa.

### 5.2 Feature flag

```javascript
// ConfigRepo.gs
function isNuevoFrontendActivo() {
  return PropertiesService.getScriptProperties().getProperty('NUEVO_FRONTEND') === 'true';
}
```

---

## 6. Estructura de archivos propuesta

```
├── Code.gs                    # Punto de entrada (doGet, include)
├── Api.gs                     # Funciones expuestas a google.script.run
├── Servicios/
│   ├── AuthService.gs
│   ├── RadicacionService.gs
│   ├── ConsultaService.gs
│   ├── NotificacionService.gs
│   ├── SincronizacionService.gs
│   ├── ReporteService.gs
│   └── ValidacionService.gs
├── Repositorios/
│   ├── ControlGeneralRepo.gs
│   ├── HojaControlRepo.gs
│   ├── CorreosRepo.gs
│   ├── AnalisisRepo.gs
│   └── ConfigRepo.gs
├── index.html                 # Shell de la SPA
├── styles/
│   ├── tokens.html            # Design tokens CSS
│   └── main.html              # Estilos de componentes
├── components/
│   ├── header.html
│   ├── sidebar.html
│   ├── toast.html
│   ├── loader.html
│   ├── pagination.html
│   └── badge.html
├── views/
│   ├── dashboard.html
│   ├── radicacion.html
│   ├── seguimiento.html
│   ├── detalle-lote.html
│   └── admin.html
├── scripts/
│   ├── api-client.html        # Wrapper promisificado de google.script.run
│   ├── router.html            # Hash routing
│   ├── validators.html        # Validaciones frontend
│   └── app.html               # Inicialización y orquestación
├── appsscript.json
├── .clasp.json
│
│   # --- Legacy (se mantiene temporalmente) ---
├── Codigo.js
├── Config.js
├── Cumplimiento.js
├── IADestino.js
├── Notificaciones.js
├── Reportes.js
├── Sincronizacion.js
├── Index.html (legacy)
├── Estilos.html (legacy)
└── Scripts.html (legacy)
```

> **Nota GAS**: Apps Script no soporta carpetas reales. Los prefijos `Servicios/`, `Repositorios/`, etc. se implementan con convención de nombres: `Servicios_AuthService.gs`, `Repositorios_ControlGeneralRepo.gs`, etc. O bien se usa `clasp` con `rootDir` para mantener la estructura local.
