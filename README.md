# Automatización de Inducciones — El Libertador

> ⚠️ **Migración en curso**: Este proyecto tiene una arquitectura nueva en desarrollo que convive con el legacy. El frontend nuevo se accede con `?v=2` en la URL del deploy. Ver documentación completa en la carpeta `docs/` (arquitectura, UI/UX, migración, backlog, decisiones técnicas).

## Descripción General

Sistema web desarrollado sobre **Google Apps Script** que automatiza el proceso de radicación de inducciones para la empresa **Investigaciones y Cobranzas El Libertador**. Permite a los ejecutivos comerciales cargar lotes de contratos de arrendamiento mediante una planilla Excel, ejecutar una auditoría automática de calidad de datos, registrar la información en una hoja de control centralizada y notificar a los equipos involucrados mediante correos electrónicos transaccionales con diseño corporativo.

El flujo completo abarca:

1. **Ingreso** — El comercial carga la planilla y certifica el paz y salvo.
2. **Auditoría** — El motor valida encabezados, campos obligatorios, destinos, valores monetarios, contactos duplicados y registros repetidos.
3. **Registro** — Los datos aprobados se vuelcan a la hoja `Control_General` y se respaldan en Google Drive.
4. **Notificación** — Se envían correos de confirmación al comercial y de alerta a los líderes.
5. **Sincronización** — Un proceso programado replica los registros radicados hacia una hoja de análisis independiente.
6. **Seguimiento** — Correos automáticos de recordatorio cuando un lote permanece pendiente de paz y salvo.

---

## Estructura del Proyecto

| Archivo | Tipo | Responsabilidad |
|---------|------|-----------------|
| `Codigo.js` | Backend (GAS) | Motor principal de auditoría, punto de entrada web (`doGet`), validadores (destino heurístico + IA, celular, correo, campos monetarios), conversión Excel → Google Sheets, generación de archivo marcado con errores, volcado de datos a `Control_General` y consulta de lotes. |
| `IADestino.js` | Backend (GAS) | Validación semántica del campo Destino con Vertex AI (Gemini), como complemento a la heurística de `Codigo.js`. Autenticación por cuenta de servicio (librería OAuth2), llamada en lote (no por fila) y degradación controlada si Vertex AI no responde. |
| `Reportes.js` | Backend (GAS) | Reporte diario de gestión de inducciones por correo (métricas + tabla de seguimiento por lote), leyendo `Control_General`, `registro analisis` e `Historico_Envios`. Estrictamente de lectura. |
| `Notificaciones.js` | Backend (GAS) | Construcción modular de correos HTML con diseño corporativo (bloques reutilizables), envío de notificaciones de radicación exitosa (comercial + líderes), correo de solicitud de paz y salvo (trigger `onEdit`) y recordatorio diario de lotes estancados. |
| `Sincronizacion.js` | Backend (GAS) | Motor de sincronización automática que replica registros con estado `RADICADO` o `ERROR EN TERCEROS` desde `Control_General` hacia la hoja de análisis, manteniendo consecutividad por lote y actualizando estados. |
| `Cumplimiento.js` | Backend (GAS) | Gestión de Entregas Ley 2300: procesa entregas por UUID/participante/canal mediante ledger, registra trazabilidad enmascarada y deriva el estado de automatización. La bandeja ADMIN gestiona correcciones, reintentos y conciliaciones; no expone contactos completos. |
| `Index.html` | Frontend | Estructura HTML de la aplicación web: formulario de radicación, barra de consulta de lotes, zona de carga de archivos (Excel y PDF), panel de errores y modal de progreso. |
| `Estilos.html` | Frontend | Hoja de estilos CSS con variables de diseño, componentes visuales (cards, drop zones, botones, modales, badges de estado) y animaciones. |
| `Scripts.html` | Frontend | Lógica JavaScript del cliente: inicialización de zonas drag-and-drop, validaciones de formulario, conversión de archivos a Base64, comunicación con el backend vía `google.script.run`, consulta de lotes y persistencia local (borrador en `localStorage`). |
| `appsscript.json` | Configuración | Manifiesto del proyecto Apps Script: zona horaria, servicios avanzados (Drive API v3), scopes OAuth, configuración de webapp y runtime V8. |
| `.clasp.json` | Configuración | Configuración de `clasp` para sincronización local ↔ Google Apps Script (ID del script, extensiones permitidas). |

---

## Funcionalidades Clave

### Módulo de Auditoría (`Codigo.js`)

- **Validación de formato**: Verifica que el archivo sea Excel válido (.xlsx/.xls) y que use la plantilla actualizada (formato rojo con encabezado "AMPARO INTEGRAL").
- **Validación de encabezados**: Comprueba que los metadatos del lote (tipo de negociación, póliza, inmobiliaria) estén completos.
- **Auditoría fila por fila**:
  - Campos obligatorios por participante (inquilino y codeudores).
  - Contacto mínimo: al menos celular o correo por cada participante, con **validación de formato** (celular: 10 dígitos empezando en 3; correo: formato de email válido).
  - Validación de destino en dos pasos: heurística barata (rechaza valores genéricos, evasivos, de relleno o demasiado cortos) + **juicio semántico con IA (Vertex AI/Gemini)** para valores que pasan la heurística pero no describen un uso real del inmueble. Ver `IADestino.js`.
  - Validación monetaria: detecta letras o símbolos no permitidos en canon, administración e IVA.
  - Detección de contactos duplicados dentro de la misma fila.
  - Detección de contratos duplicados verticalmente (misma identificación + dirección).
- **Generación de archivo marcado**: Exporta el Excel con una columna de diagnóstico y filas resaltadas en rojo para facilitar la corrección.
- **Consulta de lotes**: Permite buscar el estado de un lote por ID desde la interfaz.

### Módulo de IA de Destino (`IADestino.js`)

- **Validación semántica con Vertex AI (Gemini)**: complementa la heurística — solo se envían a la IA los valores de Destino que ya pasaron el filtro barato, y en **una sola llamada por lote de radicación** (no una por fila), para no afectar el tiempo de espera del usuario.
- **Autenticación por cuenta de servicio**: usa la librería OAuth2 for Apps Script contra el proyecto GCP `proyecto-ia-servicios-bolivar`. Credenciales en Propiedades del Script (`VERTEX_SA_KEY_JSON`, `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `VERTEX_MODEL`), nunca en el código.
- **Degradación controlada**: si Vertex AI no responde, la radicación **no se bloquea** — sigue solo con la heurística y deja constancia en `Hoja_Control`.

### Módulo de Reportes de Gestión (`Reportes.js`)

- **Correo diario automático** a los líderes (`enviarReporteGestionInducciones`, disparado por trigger lunes a viernes 5:00pm y sábado 12:30pm) con: analizadas hoy, pendientes por radicar, pendientes paz y salvo, pendiente por asignar, en análisis, pendientes error en terceros, resultados enviados (de `Historico_Envios`) y tabla de seguimiento por lote.
- **Estrictamente de lectura**: no escribe en ninguna hoja, no requiere `LockService`.
- **Funciones de prueba** (`probarReporteGestion`, `probarReporteGestionConFecha`): envían una vista previa solo a quien las ejecuta, nunca a los líderes.

### Módulo de Notificaciones (`Notificaciones.js`)

- **Correo de radicación exitosa (al comercial)**: Confirmación con detalle del lote, contratos incluidos y estado del paz y salvo.
- **Correo de nuevo lote (a líderes)**: Alerta con botón de acceso directo a `Control_General` y adjunto del paz y salvo si aplica.
- **Correo de solicitud de paz y salvo**: Se dispara automáticamente cuando el estado de todo un lote cambia a "PENDIENTE PAZ Y SALVO" (trigger `onEdit`). Incluye instrucciones para el comercial.
- **Recordatorio diario**: Función programada que identifica lotes estancados (≥3 días sin respuesta) y reenvía recordatorio al comercial con copia a líderes y director.
- **Diseño modular**: Bloques HTML reutilizables (cabecera, barra de estado, chips de datos, contratos, notas, botones, pie) con tokens de color de marca.

### Módulo de Sincronización (`Sincronizacion.js`)

- **Replicación selectiva**: Solo procesa registros con estado `RADICADO` o `ERROR EN TERCEROS`.
- **Inserción consecutiva por lote**: Garantiza que los registros de un mismo lote queden en filas adyacentes en el destino.
- **Actualización inteligente**: Si un UUID ya existe en destino, solo actualiza las celdas que cambiaron.
- **Transición de estados**: Los registros `RADICADO` pasan a `PENDIENTE ASIGNAR` en origen tras sincronizarse; los `ERROR EN TERCEROS` permanecen sin cambio.
- **Mapeo dinámico de columnas**: Usa los encabezados para resolver índices, lo que permite reordenar columnas sin romper el proceso.

---

## Tecnologías Utilizadas

| Tecnología | Uso |
|------------|-----|
| **Google Apps Script (V8)** | Runtime del backend; manejo de Spreadsheets, Drive, Mail y triggers. |
| **clasp** | CLI para desarrollo local y sincronización bidireccional con el proyecto en la nube. |
| **JavaScript (ES6+)** | Lógica de negocio (backend) y lógica de interfaz (frontend). |
| **HTML5** | Estructura de la webapp servida por `HtmlService`. |
| **CSS3** | Estilos con variables CSS, grid, flexbox, animaciones y backdrop-filter. |
| **Google Drive API v3** | Conversión de Excel a Google Sheets y gestión de carpetas. |
| **Vertex AI (Gemini)** | Validación semántica del campo Destino, vía cuenta de servicio del proyecto GCP `proyecto-ia-servicios-bolivar`. |
| **OAuth2 for Apps Script** (librería) | Autenticación de la cuenta de servicio de Vertex AI desde Apps Script. |
| **SweetAlert2** | Diálogos de confirmación y error en el frontend. |
| **Animate.css** | Animaciones de entrada para elementos de la interfaz. |
| **Font Awesome 6** | Iconografía de la aplicación. |
| **Google Fonts (Inter, Montserrat, Roboto Mono)** | Tipografías corporativas. |

---

## Instrucciones de Despliegue / Sincronización

### Prerrequisitos

1. **Node.js** instalado (v20+ recomendado).
2. **clasp** instalado globalmente:
   ```bash
   npm install -g @google/clasp
   ```
3. Sesión activa en clasp:
   ```bash
   clasp login
   ```

### Flujo de trabajo

#### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd automatizacion-inducciones
```

#### 2. Descargar cambios desde Google Apps Script (si hay modificaciones en la nube)

```bash
clasp pull
```

Esto descarga la versión más reciente del proyecto vinculado (según el `scriptId` en `.clasp.json`) y sobrescribe los archivos locales.

#### 3. Desarrollar localmente

Edita los archivos `.js` y `.html` con tu editor preferido. La estructura plana del proyecto es compatible con el formato que espera Apps Script.

#### 4. Subir cambios a Google Apps Script

```bash
clasp push
```

Esto sube todos los archivos locales al proyecto en la nube, reemplazando la versión remota.

> **Nota**: Si deseas ver los cambios sin crear un nuevo despliegue, usa `clasp push` y prueba desde el editor de Apps Script con "Ejecutar > doGet" o la URL de desarrollo.

#### 5. Crear un nuevo despliegue (producción)

```bash
clasp deploy --description "v1.x.x - Descripción del cambio"
```

Esto genera una nueva versión inmutable accesible por la URL de webapp configurada.

#### 6. Abrir el editor en línea (opcional)

```bash
clasp open
```

### Configuración de Triggers

Los triggers de sincronización se configuran desde el editor de Apps Script. Las notificaciones programadas se administran desde **Configuración → Notificaciones** por un usuario `ADMIN`:

| Función | Evento | Administración |
|---------|--------|----------------|
| `enviarCorreoPazYSalvo` | `onEdit` en la hoja de cálculo | Se asegura al guardar una configuración; la notificación se activa/desactiva desde Configuración. |
| `registrarCambioEstadoManual` | `onEdit` en `Control_General` | Registra cada cambio individual y manual del desplegable `Estado` en `Historial_Estados`. Un administrador debe ejecutar una vez `configurarTriggerHistorialEstados`. |
| `ejecutarRecordatoriosDiarios` | Time-driven | Hora y frecuencia desde Configuración. |
| `sincronizarUnificado` | Time-driven | Cada 10 minutos; se configura con `configurarTriggerSincronizacionUnificada`. |
| `procesarDatosMejorado` | Time-driven | Trigger administrado por la política `cumplimiento_ley_2300` en `CONFIG_NOTIFICACIONES`; su activación y agenda vigente se configuran desde ADMIN, sin frecuencia fija embebida. |
| `enviarReporteGestionInducciones` | Time-driven | Días, horarios y activación desde Configuración. Valores iniciales: lunes a viernes 5:00pm y sábado 12:30pm. |
| `enviarReportesCierreMes` | Time-driven | Día del mes, hora y activación desde Configuración. |
| `verificarSaludDelSistema` | Time-driven | Hora, frecuencia y activación desde Configuración. |

> La configuración de notificaciones se inicializa automáticamente en la pestaña `CONFIG_NOTIFICACIONES` al abrir la vista **Configuración** como ADMIN. Al guardar una agenda, el sistema reemplaza únicamente los triggers administrados por esta funcionalidad. Las notificaciones por evento se activan o desactivan desde la misma vista, pero conservan su envío inmediato cuando están activas.

### Propiedades del Script requeridas

Configurables en el editor de Apps Script (⚙️ Configuración del proyecto → Propiedades del script). Nunca se guardan en el código ni en este repositorio.

| Propiedad | Uso |
|-----------|-----|
| `VERTEX_SA_KEY_JSON` | Contenido completo del JSON de la cuenta de servicio con acceso a Vertex AI. |
| `VERTEX_PROJECT_ID` | ID del proyecto GCP (`proyecto-ia-servicios-bolivar`). |
| `VERTEX_LOCATION` | Región de Vertex AI (`us-central1`). |
| `VERTEX_MODEL` | Modelo de Gemini a usar (`gemini-2.5-flash-lite`). |
| `INFOBIP_BASE_URL` | Base URL de Infobip para los canales de Ley 2300. |
| `INFOBIP_API_KEY` | Credencial de Infobip para los canales de Ley 2300. |
| `INFOBIP_EMAIL_FROM` | Remitente de correo verificado para Ley 2300. |
| `INFOBIP_EMAIL_TEMPLATE_ID` | ID de la plantilla de correo Ley 2300. |
| `INFOBIP_SENDER` | Remitente SMS, cuando aplique. |
| `LEY2300_HMAC_SECRET` | Secreto opcional y recomendado para huellas HMAC de destinos; nunca registrar su valor. |

---

## Operación de Entregas Ley 2300

- **Bandeja ADMIN y estados:** La gestión accionable se realiza en la bandeja ADMIN de Entregas Ley 2300. Por defecto muestra `PENDIENTE`, `EN_PROCESO`, `PENDIENTE_CORRECCION`, `LISTO_PARA_REINTENTO`, `FALLIDO_DEFINITIVO` y `PENDIENTE_CONCILIACION`; `ENVIADO` solo aparece con el selector explícito de todos los registros no eliminados. Los destinos permanecen enmascarados.
- **Cierre automático:** Tras confirmar `Estado Automatización = Procesado`, el trigger registra un marcador temporal bajo su lock, elimina el grupo completo de entregas `ENVIADO` del UUID y sus bitácoras asociadas, y conserva una auditoría agregada sin PII. Si una fase se interrumpe, el siguiente trigger reanuda el cierre antes de preparar fuentes. Las fuentes procesadas se omiten en corridas posteriores, por lo que no se recrean ni reenvían contactos. Los grupos parciales nunca pierden entregas `ENVIADO`.
- **Corrección y reintento:** Una corrección actualiza y verifica de forma coordinada `Control_General` y `registro analisis`. Solo al completar ambos pasos queda lista para reintento en la siguiente ejecución configurada. Los fallos temporales respetan el máximo de intentos y el circuito de EMAIL pausa nuevas invocaciones después de cinco fallos consecutivos.
- **Conciliación y migración:** Resultados ambiguos y correcciones incompletas requieren conciliación. Los históricos con marca `Parcial` se migran a conciliación sin envío ni consumo de intentos.
- **Retención:** Las entregas y bitácoras operativas tienen una retención máxima de 90 días, con depuración manual autorizada y trazable. Solo se depuran grupos completos totalmente `ENVIADO`, cuya fuente sigue `Procesado`, usando `ENVIADA_EN` para calcular antigüedad; `FALLIDO_DEFINITIVO` y grupos parciales se conservan.
- **Preflight seguro:** `diagnosticarGestionEntregasLey2300()` en `TestUtils.js` solo lee la presencia de hojas, propiedades, política/trigger y conteos agregados. No envía comunicaciones ni escribe datos. Consulte [la guía operativa](docs/configuracion-email-ley2300.md) antes de operar o migrar.

---

## Arquitectura de Datos

```
┌─────────────────────────────────────────────────────────────┐
│  Google Sheets: "Hoja de Control" (ID_HOJA_CONTROL)         │
│  ├── Control_General  → Registro maestro de contratos       │
│  ├── Hoja_Control     → Log de auditoría (éxito/fallo)      │
│  ├── Historial_Estados → Bitácora de cambios manuales de Estado │
│  └── CORREOS          → Mapeo comercial → director          │
└─────────────────────────────────────────────────────────────┘
          │ sincronización automática
          ▼
┌─────────────────────────────────────────────────────────────┐
│  Google Sheets: "Archivo de Análisis" (ID_ARCHIVO_ANALISIS)  │
│  ├── registro analisis → Copia de trabajo para analistas    │
│  └── Historico_Envios  → Resultado final por lote emitido   │
│                          por la aseguradora (aprobadas/      │
│                          negadas), fuente del reporte de     │
│                          gestión                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Google Drive: Carpeta Raíz (ID_CARPETA_RAIZ)               │
│  └── <ID_LOTE>/  → Excel original + PDF paz y salvo         │
└─────────────────────────────────────────────────────────────┘
```

---

## Autores

- **Equipo de Desarrollo CRM** — Investigaciones y Cobranzas El Libertador
- Contacto: desarrollocrmlibertador@ellibertador.co


### Gestión segura de Entregas Ley 2300

- Antes de seleccionar nuevas comunicaciones, el proceso recupera reclamos `EN_PROCESO` vencidos como `PENDIENTE_CONCILIACION`, con control de versión y trazabilidad; no los reenvía automáticamente.
- La URL de Infobip se valida como HTTPS y contra la allowlist oficial antes de construir solicitudes con API key o datos de contacto. No se aceptan hosts privados, IPs, credenciales en URL ni puertos no estándar.
- La bandeja ADMIN incorpora filtros por participante, canal y rango de fecha; también presenta la agenda vigente y una próxima ejecución **estimada** desde `CONFIG_NOTIFICACIONES`. Apps Script puede variar el horario real.
- El reporte administrativo incluye comunicaciones fallidas definitivas. Los destinos continúan enmascarados en UI, reportes y bitácoras.
- La depuración de retención es estrictamente manual: `depurarRetencionEntregasLey2300Manual()` exige confirmación explícita, lock, auditoría agregada y solo elimina registros terminales con más de 90 días. No existe un trigger de purga.
- Los contactos vacíos o inválidos se registran como `PENDIENTE_CORRECCION` sin persistir su valor; se corrigen exclusivamente desde ADMIN y nunca se envían al proveedor. La estimación de la próxima agenda usa la última ejecución registrada; si no existe, la bandeja lo informa en lugar de inventar una fecha.
