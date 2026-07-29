# Fase 2 — Plan de UI/UX

---

## 1. Sistema de diseño → `styles/tokens.html`

Ver `docs/manual-marca.md` para la especificación completa. Los tokens se implementan como CSS custom properties en `:root`.

---

## 2. Pantallas / Vistas

### 2.1 Header (persistente)

```
┌──────────────────────────────────────────────────────────────┐
│ [gradient-brand]                                              │
│ [Logo 32px] │ Inducciones    [Nombre usuario] [Avatar] [▼]  │
└──────────────────────────────────────────────────────────────┘
```
- Gradiente corporativo como barra superior (4px) o fondo del header
- Logo SVG con separador vertical + título de app
- Badge con nombre del usuario (derivado de email), menú con "Cerrar sesión" (logout no aplica en GAS, pero se puede mostrar rol)

### 2.2 Sidebar / Navegación

```
┌────────────────┐
│ 📊 Dashboard   │  ← activa por defecto
│ 📤 Radicar     │  ← solo COMERCIAL
│ 📋 Mis lotes   │  ← solo COMERCIAL
│ ─────────────  │
│ 📥 Cola casos  │  ← solo ANALISTA
│ 📝 Mis casos   │  ← solo ANALISTA
│ ─────────────  │
│ ⚙️ Admin       │  ← solo LIDER/ADMIN
│ 📬 Correos     │
│ � Asignación  │
│ �📈 Reportes    │
└────────────────┘
```
- Mobile: hamburger menu con slide-in
- Desktop: sidebar fija de 240px
- Items visibles según rol del usuario

### 2.3 Dashboard (`#/dashboard`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Saludo personalizado (Buenos días, [Nombre])                    │
│  Resumen semanal en pills:                                       │
│  [3 radicados] [2 en análisis] [1 paz y salvo] [5 terminados]  │
├─────────────────────────────────────────────────────────────────┤
│  KPIs (cards grandes):                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ Pend.   │ │ En      │ │ Pend.   │ │ Termi-  │              │
│  │ Radicar │ │ Análisis│ │ P&S     │ │ nados   │              │
│  │   12    │ │    8    │ │    3    │ │   45    │              │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
├─────────────────────────────────────────────────────────────────┤
│  Últimos lotes (tabla reducida, máx 5):                          │
│  ID Lote | Fecha | Contratos | Estado | [Ver →]                  │
├─────────────────────────────────────────────────────────────────┤
│  Accesos rápidos:                                                │
│  [+ Radicar nuevo lote]  [Consultar lote por ID]                │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Radicación (`#/radicar`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Stepper: ① Datos del lote → ② Paz y salvo → ③ Planilla → ④ ✓ │
├─────────────────────────────────────────────────────────────────┤
│  PASO 1: Información del lote                                    │
│  [Póliza *]  [Tasa de inducción *]                              │
│  [Notas de radicación (textarea)]                               │
│                                                                  │
│  PASO 2: Certificación de paz y salvo                           │
│  (○) Certificación manual                                        │
│  (○) Adjuntar PDF                                               │
│      → [Drop zone PDF]                                           │
│                                                                  │
│  PASO 3: Planilla de inducción                                  │
│  [Drop zone Excel] → "3 contratos detectados ✓"                 │
│                                                                  │
│  [████████ Revisar y enviar ████████]                            │
├─────────────────────────────────────────────────────────────────┤
│  RESULTADO:                                                      │
│  ✓ Éxito → confetti + ID de lote en card destacada              │
│  ✗ Error → tabla de errores por fila/campo (existente)          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.5 Listado de lotes (`#/lotes`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Filtros:                                                        │
│  [Estado ▼] [Fecha desde] [Fecha hasta] [Buscar ID/Póliza]     │
│  [Aplicar filtros]  [Limpiar]                                   │
├─────────────────────────────────────────────────────────────────┤
│  Tabla:                                                          │
│  ID Lote | Póliza | Comercial | Fecha | Contratos | Estado      │
│  ─────────────────────────────────────────────────────────────  │
│  7/4/... │  1985  │ Santiago  │ 7 abr │     3     │ [EN ANÁL.] │
│  ...     │  ...   │    ...    │  ...  │    ...    │    ...      │
├─────────────────────────────────────────────────────────────────┤
│  Paginación: [← Anterior] Página 1 de 5 [Siguiente →]          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.6 Detalle de lote (`#/lote/:id`)

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Volver a listado                                              │
│  Header: ID Lote (mono) | Estado (badge) | Fecha ingreso        │
├─────────────────────────────────────────────────────────────────┤
│  Chips de datos:                                                 │
│  [Póliza: 1985] [Comercial: Santiago] [Tasa: 2,3%]             │
│  [Paz y Salvo: Certificación manual]                            │
├─────────────────────────────────────────────────────────────────┤
│  Tabla de contratos:                                             │
│  # | Arrendatario | Dirección | Canon | Estado                   │
│  1 | JUAN PÉREZ   | Cra 7 #45 | $1.5M | [PEND. ASIGNAR]       │
│  2 | MARÍA GÓMEZ  | Cl 100 #3 | $2.0M | [EN ANÁLISIS]         │
├─────────────────────────────────────────────────────────────────┤
│  Timeline de eventos (si aplica):                                │
│  • 7 abr 14:30 — Radicado por santiago.garcia@...               │
│  • 7 abr 14:45 — Sincronizado a análisis                        │
│  • 10 abr 08:00 — Recordatorio paz y salvo enviado             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.7 Cola de análisis (`#/analisis`) — ROL: ANALISTA

```
┌─────────────────────────────────────────────────────────────────┐
│  Casos disponibles para tomar                                    │
│  (Estado = PENDIENTE ASIGNAR, ASIGNADA A… = vacío)              │
├─────────────────────────────────────────────────────────────────┤
│  Tabla:                                                          │
│  Código Lote | Arrendatario | Ciudad | Destino | Fecha Lote     │
│  ─────────────────────────────────────────────────────────────  │
│  7/4/..._01  │ JUAN PÉREZ   │ Bogotá │ Peluc. │ 7 abr         │
│  7/4/..._02  │ MARÍA GÓMEZ  │ Cali   │ Rest.  │ 7 abr         │
│  ...                                                             │
├─────────────────────────────────────────────────────────────────┤
│  Click en fila → Modal de confirmación:                          │
│  "¿Quieres tomar este caso? Se te asignará y nadie más podrá   │
│   tomarlo."                                                      │
│  [Cancelar] [Tomar caso]                                        │
├─────────────────────────────────────────────────────────────────┤
│  Paginación: [← Anterior] Página 1 de 3 [Siguiente →]          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.8 Mis casos (`#/analisis/mis-casos`) — ROL: ANALISTA

```
┌─────────────────────────────────────────────────────────────────┐
│  Mis casos asignados                                             │
├─────────────────────────────────────────────────────────────────┤
│  Cards (o tabla):                                                │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ JUAN PÉREZ · CC 1032456789                              │     │
│  │ Lote: 7/4/2026-1985-1456 · Póliza: 1985               │     │
│  │ Ciudad: Bogotá · Destino: Peluquería                   │     │
│  │ Estado: [EN ANÁLISIS]  Tomado: hace 2 horas            │     │
│  │ [Evaluar →]                                             │     │
│  └────────────────────────────────────────────────────────┘     │
│  Si no hay casos: "No tienes casos asignados. Ve a la cola."   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.9 Evaluación de caso (`#/analisis/caso/:uuid`) — ROL: ANALISTA

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Volver a mis casos                                            │
│  Header: Arrendatario | Código lote | [Badge EN ANÁLISIS]       │
├─────────────────────────────────────────────────────────────────┤
│  DATOS DEL INMUEBLE (solo lectura, card colapsable):            │
│  Tipo negociación | Póliza | Inmobiliaria | Sucursal            │
│  Ciudad | Dirección | Destino | Canon | Adm | IVA              │
│  Fecha inicio | Amparo | Tasa | Valor a asegurar               │
├─────────────────────────────────────────────────────────────────┤
│  EVALUACIÓN DEL INQUILINO:                                       │
│  Nombre: JUAN PÉREZ | TD: CC | ID: 1032456789                   │
│  Tel: 3105551234 | Correo: juan@...                             │
│  Solicitud Inquilino: [solo lectura]                            │
│  ─────────── Campos editables: ───────────                      │
│  [Ingresos]  [Acierta ▼]  [Ocupación]                          │
│  [Respuesta modelo ▼]  [Regla Dura ▼]                          │
│  [Resultado Final Inquilino ▼]                                  │
├─────────────────────────────────────────────────────────────────┤
│  CODEUDOR 1 (si existe):                                        │
│  Nombre: ANA LÓPEZ | TD: CC | ID: 52456789                     │
│  ─────────── Campos editables: ───────────                      │
│  [Ingresos COA1] [Acierta COA1 ▼] [Ocupación COA1]            │
│  [Respuesta modelo COA1 ▼] [Regla Dura COA1 ▼]                │
│  [Resultado Final COA1 ▼]                                       │
│  ... (repetir para COA 2-5 si existen)                          │
├─────────────────────────────────────────────────────────────────┤
│  RESULTADO DE LA SOLICITUD:                                      │
│  [Política ingresos solicitud ▼]                                │
│  [RESULTADO SOLICITUD ▼]                                        │
│  [RESULTADO SOLICITUD LNeg ▼]                                   │
│  [DETALLE RESULTADO SOLICITUD (textarea)]                       │
│  [RESULTADO LOTE ▼]                                             │
│  [contrato_de]                                                  │
│  [comentarios del analista (textarea)]                          │
│  [DETALLE RESULTADO COMERCIAL (textarea)]                       │
├─────────────────────────────────────────────────────────────────┤
│  Acciones:                                                       │
│  [Guardar borrador]  [Finalizar evaluación ✓]                   │
│  Finalizar → confirma: "¿Estás seguro? El caso se marcará      │
│  como TERMINADO y no podrás modificarlo."                       │
│  → Escribe REGISTRO ANALISTA SAI + Fecha Evaluacion             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.10 Panel administrativo (`#/admin`)

```
┌─────────────────────────────────────────────────────────────────┐
│  Tabs: [Dashboard admin] [Catálogo correos] [Asignaciones]      │
│        [Reportes]                                                │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard admin:                                                │
│  - Métricas globales (todos los comerciales)                    │
│  - Lotes estancados (>7 días)                                   │
│  - Casos sin asignar vs en análisis vs terminados               │
│  - Estado de triggers / salud del sistema                       │
│                                                                  │
│  Catálogo correos:                                              │
│  Tabla CRUD: Director | Ejecutivo | Backup | Activo             │
│  [+ Agregar] [Editar] [Desactivar]                              │
│                                                                  │
│  Asignaciones:                                                   │
│  Tabla: Caso | Asignado a | Fecha | Estado | Acciones           │
│  Acciones: [Reasignar ▼] [Liberar (devolver a cola)]           │
│  Filtro: [Solo pendientes] [Solo en análisis] [Todos]           │
│                                                                  │
│  Reportes:                                                       │
│  [Exportar reporte de gestión (Excel)]                          │
│  [Exportar cumplimiento Ley 2300 (CSV)]                         │
│  [Periodo: desde/hasta]                                         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.8 Estados especiales

| Estado | Diseño |
|---|---|
| **Carga (loading)** | Skeleton shimmer en cards/tablas + spinner sutil en header |
| **Vacío** | Ilustración dúotono + mensaje amigable ("Aún no tienes lotes radicados. ¡Radica tu primer lote!") + CTA |
| **Error** | Toast con border-left rojo + mensaje accionable ("No pudimos cargar tus lotes. Intenta de nuevo.") |
| **Sin permisos** | Card con candado + "No tienes acceso a esta sección" |

---

## 3. Responsive (mobile-first)

| Breakpoint | Comportamiento |
|---|---|
| `< 768px` | Sidebar oculta (hamburger), tabla → cards apiladas, grid 1 col |
| `768px – 1024px` | Sidebar colapsada (íconos), grid 2 col |
| `> 1024px` | Sidebar expandida, grid 3-4 col |

---

## 4. Accesibilidad

- Contraste mínimo 4.5:1 (navy sobre blanco = 11.4:1 ✓, rojo sobre blanco = 7.2:1 ✓)
- Focus visible: outline 2px `--color-primary-navy` con offset 2px
- Todos los inputs con `<label>` asociado
- Roles ARIA en componentes dinámicos (tabs, modales, toasts)
- Navegación por teclado en tablas y menús
