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
| `Codigo.js` | Backend (GAS) | Motor principal de auditoría, punto de entrada web (`doGet`), validadores heurísticos (destino, campos monetarios), conversión Excel → Google Sheets, generación de archivo marcado con errores, volcado de datos a `Control_General` y consulta de lotes. |
| `Notificaciones.js` | Backend (GAS) | Construcción modular de correos HTML con diseño corporativo (bloques reutilizables), envío de notificaciones de radicación exitosa (comercial + líderes), correo de solicitud de paz y salvo (trigger `onEdit`) y recordatorio diario de lotes estancados. |
| `Sincronizacion.js` | Backend (GAS) | Motor de sincronización automática que replica registros con estado `RADICADO` o `ERROR EN TERCEROS` desde `Control_General` hacia la hoja de análisis, manteniendo consecutividad por lote y actualizando estados. |
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
  - Contacto mínimo: al menos celular o correo por cada participante.
  - Validación heurística de destino: rechaza valores genéricos, evasivos, de relleno o demasiado cortos.
  - Validación monetaria: detecta letras o símbolos no permitidos en canon, administración e IVA.
  - Detección de contactos duplicados dentro de la misma fila.
  - Detección de contratos duplicados verticalmente (misma identificación + dirección).
- **Generación de archivo marcado**: Exporta el Excel con una columna de diagnóstico y filas resaltadas en rojo para facilitar la corrección.
- **Consulta de lotes**: Permite buscar el estado de un lote por ID desde la interfaz.

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
│  Google Sheets: "Archivo de Análisis"                       │
│  └── registro analisis → Copia de trabajo para analistas    │
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
