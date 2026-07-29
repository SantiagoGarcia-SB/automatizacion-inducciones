# Fase 0 — Descubrimiento (Discovery)

## 1. Resumen del Sistema Actual

### 1.1 Propósito
Sistema de **radicación de inducciones** para Investigaciones y Cobranzas El Libertador SA (filial de Seguros Bolívar). Permite a ejecutivos comerciales cargar lotes de contratos de arrendamiento, validarlos automáticamente, registrarlos y notificar a los equipos involucrados.

### 1.2 Stack Tecnológico Actual
| Componente | Tecnología |
|---|---|
| Runtime | Google Apps Script V8 |
| Backend | JavaScript (ES6+) en archivos `.js` |
| Frontend | HTML + CSS + JS servido por `HtmlService` (IFRAME sandbox) |
| Base de datos | Google Sheets (2 libros) |
| Almacenamiento | Google Drive (carpetas por lote) |
| IA | Vertex AI / Gemini (validación semántica de Destino) |
| Auth IA | OAuth2 for Apps Script (cuenta de servicio GCP) |
| Versionado | clasp (Git local ↔ GAS) |
| CDN Frontend | SweetAlert2, SheetJS (xlsx), Animate.css, Font Awesome 6, Google Fonts |

### 1.3 Arquitectura de la Web App Actual
```
doGet() → HtmlService.createTemplateFromFile('Index')
         └── include('Estilos')  → CSS
         └── include('Scripts')  → JavaScript del cliente

Cliente → google.script.run → Backend (motorDeAuditoria, consultarLote, etc.)
```

---

## 2. Estructura de las Hojas de Cálculo

### 2.1 Libro de Control (`ID_HOJA_CONTROL`: `1Z0GLLJvinwaU6MK_iaduKBri8VqfCDEPeOfh9gThQhI`)

| Pestaña | Función | Columnas clave |
|---|---|---|
| **Control_General** | Registro maestro de contratos radicados | ~62 columnas: ID Lote (A), Estado Cartera (B), Fecha ingreso (C), Estado (J), Comercial (K), Tasa Negociación (L), Datos inmueble (M-W), Arrendatario + docs (X-AB), COA 1-5 (AC-BL), UUID_SISTEMA (BJ) |
| **Hoja_Control** | Log de auditoría (éxito/fallo por radicación) | Fecha (A), Email usuario (B), Póliza (C), Resultado (D), Detalle (E), ID Lote (F), Observaciones (G) |
| **CORREOS** | Mapeo comercial → director → backup | Director (A), Correo Ejecutivo (B), BackUp (C), Activar BackUp (D, checkbox) |
| **Logs_Sistema** | Logging estructurado del sistema | Timestamp, Nivel, Módulo, Mensaje, Detalle |

**Modelo de datos de Control_General (columnas relevantes):**
- Col A (0): ID Lote — formato `d/M/yyyy-PÓLIZA-HHmm`
- Col B (1): Estado Cartera — siempre "PAZ Y SALVO"
- Col C (2): Fecha ingreso (timestamp)
- Col J (9): Estado — `PENDIENTE RADICAR`, `PENDIENTE PAZ Y SALVO`, `PENDIENTE ASIGNAR`, `EN ANÁLISIS`, `ERROR EN TERCEROS`, `RADICADO`, `TERMINADO`
- Col K (10): Nombre Comercial (uppercase)
- Col L (11): Tasa Negociación
- Col M-W (12-22): Datos del inmueble (nro, fecha inicio, amparo, tipo negociación, póliza, destino, ciudad, dirección, canon, administración, IVA)
- Col X-AB (23-27): Inquilino (nombre, TD, ID, celular, correo)
- Col AC-BL (28-57): Codeudores 1-5 (nombre, TD, ID, celular, correo × 5)
- Col BI (60): Fecha último aviso (paz y salvo / error terceros)
- Col BJ (61): UUID_SISTEMA — formato `IDLOTE_REG_NNN`

**Volumen estimado:** No verificable sin acceso directo a las hojas, pero por la lógica del código (TextFinder, batch reads) se infiere un volumen de cientos a bajo miles de registros.

### 2.2 Libro de Análisis (`ID_ARCHIVO_ANALISIS`: `1ph9pgf-ADc2hE6U4KaKXAGY8ghh5Z940PuLVU_PlOQ0`)

| Pestaña | Función | Columnas clave |
|---|---|---|
| **registro analisis** | Copia de trabajo para analistas (destino de sincronización) | UUID_SISTEMA, Fecha Lote, tipo negociación, Póliza, código lote, Destino, ciudad, Dirección, Arrendatario, TD_INQ, Id_arrendatario, TEL_INQ, CORREO_INQ, COA1-5 con TD/ID/TEL/CORREO, ASIGNADA A…, REGISTRO ANALISTA SAI, Fecha Evaluacion, Estado Automatización |
| **Historico_Envios** | Resultado final emitido por la aseguradora | Fecha de Emisión, Cantidad Solicitudes Aprobadas, Cantidad Solicitudes Negadas, Resultado Final Lote |

### 2.3 Relaciones entre hojas (modelo relacional simulado)
```
Control_General.UUID_SISTEMA ←→ registro analisis.UUID_SISTEMA  (1:1)
Control_General.ID Lote      ←→ Hoja_Control.ID Lote             (1:N)
CORREOS.Correo Ejecutivo     ←→ Hoja_Control.Email usuario        (lookup)
```

---

## 3. Flujos de Negocio Identificados

### 3.1 Radicación (flujo principal)
1. Comercial abre la Web App → formulario con póliza, tasa, paz y salvo, planilla Excel
2. Frontend parsea Excel con SheetJS → pre-validación instantánea
3. `google.script.run.motorDeAuditoria(formData)` → servidor
4. Servidor: lock → validar formato → validar encabezados → auditoría fila por fila (heurística + IA Vertex AI) → preparar filas → crear carpeta Drive → volcar a Control_General → log → notificar por correo → responder

### 3.2 Sincronización (automática, cada 10 min)
- `sincronizarLoteAutomatico`: RADICADO/ERROR EN TERCEROS → copia a registro analisis, cambia estado a PENDIENTE ASIGNAR
- `sincronizarEstadoDesdeAnalisis`: Lee ASIGNADA A… y REGISTRO ANALISTA SAI → actualiza estado en Control_General (EN ANÁLISIS / TERMINADO)

### 3.3 Notificaciones
- **onEdit**: cuando todo un lote cambia a PENDIENTE PAZ Y SALVO → correo al comercial
- **Diario 8am**: recordatorios de paz y salvo (escalamiento 3/7/14/21 días) + error en terceros
- **Cambio de estado**: al pasar a EN ANÁLISIS o TERMINADO → correo al comercial

### 3.4 Reportes
- **Diario 5pm L-V / 12:30pm sábado**: reporte de gestión a líderes (métricas + tabla de lotes activos)

### 3.5 Cumplimiento Ley 2300
- **Cada 15 días**: genera CSV con datos de contacto de solicitudes aprobadas → envía a equipo para carga manual en Infobip

### 3.6 Consulta de lotes
- Frontend permite buscar por ID de lote → muestra estado y detalle de cada contrato
- Historial de lotes recientes del usuario

---

## 4. Roles de Usuario Identificados

| Rol | Permisos actuales | Autenticación |
|---|---|---|
| **Ejecutivo Comercial** | Radicar lotes, consultar estado de sus lotes, ver historial propio | Session.getActiveUser() (Google Workspace) |
| **Líderes** (lista fija en `CORREOS_LIDERES`) | Reciben todas las notificaciones, reportes, copias de correos | Email CC |
| **Director** (por mapeo en hoja CORREOS) | Recibe copia de notificaciones del comercial que supervisa | Email CC dinámico |
| **Analistas** | Trabajan directamente en "registro analisis" (hoja) — NO usan la Web App | Acceso directo a Sheets |
| **Administrador del sistema** | Configura triggers, propiedades del script, deploys | Editor del proyecto GAS |

> **Nota importante:** Actualmente NO hay un panel administrativo. Los analistas y líderes operan directamente sobre las hojas de cálculo. Este es precisamente el problema que se busca resolver.

---

## 5. Sistema de Diseño Actual (extraído del código)

### 5.1 Paleta de Colores (Brand Book oficial El Libertador)

**Primarios (predominan siempre):**
| Token | HEX | Uso |
|---|---|---|
| `--color-primary-navy` | `#253150` | Azul marca (Pantone 533 C). Headers, textos principales, botones |
| `--color-primary-red` | `#BD0F14` | Rojo marca (Pantone 186 C). Acentos, alertas, logo |

**Secundarios (solo puntualmente — badges, alertas, CTAs destacados):**
| Token | HEX |
|---|---|
| `--color-accent-darkred` | `#a1161b` |
| `--color-accent-red` | `#e11f27` |
| `--color-accent-orange` | `#ffa300` |
| `--color-accent-teal` | `#0fbdb7` |

**Escala monocromática:**
| Token | HEX | Uso |
|---|---|---|
| `--color-mono-900` | `#231f20` | Texto principal |
| `--color-mono-800` | `#403f3f` | Texto secundario |
| `--color-mono-500` | `#807e7e` | Gris medio, placeholders |
| `--color-mono-300` | `#bfbebe` | Bordes, líneas |
| `--color-mono-100` | `#ebe7e8` | Fondos alternos |
| `--color-mono-0` | `#ffffff` | Blanco |

**Gradiente corporativo:**
```css
linear-gradient(90deg, #BD0F14 0%, #253150 100%)
```
Rojo izquierda → azul derecha. Usar en headers/banners, nunca en cuerpos de texto.

### 5.2 Tipografías
| Fuente | Uso |
|---|---|
| **Ciencuadras** (oficial) | No disponible como web font → se usa como placeholder en CSS |
| **Inter** (fallback principal) | Fuente de cuerpo y títulos (geométrica sans-serif similar a Ciencuadras) |
| **Roboto Mono** | Códigos de lote, datos monoespaciados |

### 5.3 Espaciado y Grid
- `--radius: 16px` — Border radius de cards
- Grid de formulario: `grid-template-columns: 1fr 1fr; gap: 24px`
- Max-width contenido: `850px`
- Padding cards: `28px`
- Padding general: `40px 20px`

### 5.4 Componentes Existentes
- Cards/glass-section (bordes sutiles, sombras suaves)
- Drop zones (drag & drop con estados loaded/hover)
- Botón principal (navy, full-width, 18px padding, 16px radius)
- Badge de estado (por color según estado)
- Modal de carga (overlay blur + spinner + barra de progreso)
- Barra de consulta (input + botón inline)
- Panel de errores (tabla con headers rojo)
- Confetti de éxito (canvas puro)
- SweetAlert2 para diálogos

### 5.5 Logo
- SVG desde `https://www.ellibertador.co/assets/img/logo.svg`
- Favicon desde `https://www.ellibertador.co/favicon.ico`

---

## 6. Triggers Configurados

| Función | Tipo | Frecuencia |
|---|---|---|
| `enviarCorreoPazYSalvo` | onEdit (installable) | Cada edición en Control |
| `enviarRecordatoriosPazYSalvoDiario` | Time-driven | Diario 8am |
| `enviarRecordatoriosErrorTercerosDiario` | Time-driven | Diario 8am |
| `sincronizarLoteAutomatico` | Time-driven | Cada 10 min |
| `sincronizarEstadoDesdeAnalisis` | Time-driven | Cada 10 min |
| `enviarReporteGestionInducciones` | Time-driven | L-V 5pm + Sáb 12:30pm |
| `procesarDatosMejorado` | Time-driven | Cada 15 días |
| `verificarSaludDelSistema` | Time-driven | Diario 7am |

---

## 7. Riesgos y Supuestos

### 7.1 Riesgos
1. **Acceso al manual de marca**: El URL del manual (`digital.experienciasbolivar.segurosbolivar.com/manual-marca-libertador`) renderiza un visor PDF dinámico cuyas imágenes no son extraíbles programáticamente. Los colores y tipografías documentados arriba provienen del código existente y son consistentes con lo que ya se usa en el sistema.
2. **Migración de datos**: Control_General tiene 62 columnas con formato heterogéneo. La normalización requerirá mapeo cuidadoso.
3. **Concurrencia**: Actualmente se usa `LockService.getScriptLock()` — adecuado para el volumen actual pero no escala.
4. **Rendimiento de Sheets**: Con miles de filas y lecturas cada 10 min, el sistema puede degradarse. CacheService se usa para catálogos pero no para datos volátiles.
5. **Operación de analistas**: Hoy trabajan directamente sobre "registro analisis". Migrar esa operación requiere entender su workflow (no está codificado, es manual).

### 7.2 Supuestos
1. Se mantiene Google Sheets como base de datos (por volumen, costo y continuidad).
2. La Web App se despliega como webapp de GAS (`executeAs: USER_DEPLOYING`, `access: DOMAIN`).
3. La autenticación sigue siendo SSO con Google Workspace vía `Session.getActiveUser()`.
4. Los colores usados en el código actual (`#BD0F14`, `#253150`, `#706F6F`) son correctos según el manual de marca del Libertador.
5. El alcance del frontend cubre: radicación (comerciales), consulta/seguimiento, y panel administrativo (líderes/analistas).

---

## 8. Preguntas de Aclaración (RESUELTAS)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Los analistas usan la Web App? | **SÍ** — deben poder pedir casos y evaluarlos desde la interfaz. |
| 2 | ¿Panel administrativo? | Incluye: correos, asignación/reasignación de casos, reportes, métricas. |
| 3 | ¿Historico_Envios? | Permanece como carga manual por ahora (fase futura). |
| 4 | ¿Permisos? | 4 roles: COMERCIAL, ANALISTA, LIDER, ADMIN. Verificación en servidor. |
| 5 | ¿Manual de marca? | Colores/tipografías confirmados. Ciencuadras no disponible → Inter como principal. |
| 6 | ¿Volumen actual? | Pendiente de confirmar, pero la arquitectura soporta miles de filas. |
| 7 | ¿Ambiente de prueba? | **No existe** — se crea como parte del setup (T1.3). |

### Pregunta nueva:
8. **Catálogo de analistas**: ¿Ya tienes una lista de quiénes son analistas (emails)? Propongo crear una pestaña "ANALISTAS" en el Libro de Control (similar a CORREOS) para gestionar quién puede tomar casos. ¿Te parece bien?
