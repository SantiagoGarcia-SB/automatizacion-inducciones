# Automatización de Inducciones — El Libertador

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
| `Cumplimiento.js` | Backend (GAS) | Cumplimiento Ley 2300: genera CSV de contacto (correo/celular) de solicitudes aprobadas cada 15 días para envío manual a Infobip. **Envío automático vía API de Infobip pendiente** — ver [Pendientes](#pendientes--próximos-pasos). |
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

Los siguientes triggers deben configurarse manualmente desde el editor de Apps Script (`Triggers` > `Add Trigger`):

| Función | Evento | Frecuencia |
|---------|--------|------------|
| `enviarCorreoPazYSalvo` | `onEdit` en la hoja de cálculo | Cada edición |
| `enviarRecordatoriosPazYSalvoDiario` | Time-driven | Diario (hora configurable) |
| `sincronizarLoteAutomatico` | Time-driven | Cada 5–15 minutos (según volumen) |
| `procesarDatosMejorado` | Time-driven | Cada 15 días — se crea ejecutando `configurarTriggerCumplimiento` una sola vez desde el editor |
| `enviarReporteGestionInducciones` | Time-driven | Lunes a viernes 5:00pm y sábado 12:30pm — se crea ejecutando `configurarTriggerReporteGestion` una sola vez desde el editor (idempotente por reemplazo: se puede re-ejecutar sin duplicar) |

### Propiedades del Script requeridas

Configurables en el editor de Apps Script (⚙️ Configuración del proyecto → Propiedades del script). Nunca se guardan en el código ni en este repositorio.

| Propiedad | Uso |
|-----------|-----|
| `VERTEX_SA_KEY_JSON` | Contenido completo del JSON de la cuenta de servicio con acceso a Vertex AI. |
| `VERTEX_PROJECT_ID` | ID del proyecto GCP (`proyecto-ia-servicios-bolivar`). |
| `VERTEX_LOCATION` | Región de Vertex AI (`us-central1`). |
| `VERTEX_MODEL` | Modelo de Gemini a usar (`gemini-2.5-flash-lite`). |

---

## Pendientes / Próximos pasos

- **Automatizar envío de Ley 2300 vía API de Infobip** (reemplazar la subida manual de CSV en `Cumplimiento.js` por un envío directo). Bloqueado: la cuenta de Infobip no tiene un remitente alfanumérico de SMS configurado (canal requerido — WhatsApp está disponible pero se descarta a propósito para evitar interacciones con el bot de la empresa). En espera de guía de la coordinación de operaciones sobre cómo solicitar ese remitente antes de construir la integración.

---

## Arquitectura de Datos

```
┌─────────────────────────────────────────────────────────────┐
│  Google Sheets: "Hoja de Control" (ID_HOJA_CONTROL)         │
│  ├── Control_General  → Registro maestro de contratos       │
│  ├── Hoja_Control     → Log de auditoría (éxito/fallo)      │
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
