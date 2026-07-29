# Consolidado Final — Diseño Completo del Sistema

---

## 1. Roles y acceso

| Rol | Quién es | Qué hace en la Web App |
|---|---|---|
| **COMERCIAL** | Ejecutivo comercial | Radica lotes, responde errores en terceros (adjunta docs), consulta sus lotes |
| **AUXILIAR** | Auxiliar de Análisis | Toma solicitudes de cola, radica en SAI, marca RADICADO o ERROR EN TERCEROS |
| **ANALISTA** | Analista de inducciones | Pide solicitudes (cupo), evalúa financieramente, registra resultado |
| **LIDER** | Coordinador/jefe | Ve todo, gestiona usuarios, reasigna, reportes |
| **ADMIN** | Desarrollador/superadmin | Todo + configuración del sistema |

**Regla de acceso**: Si el email no está en la pestaña USUARIOS → no entra. Todos deben estar registrados.

---

## 2. Pestaña USUARIOS (reemplaza CORREOS)

```
| EMAIL | NOMBRE | ROL | CUPO | DIRECTOR | BACKUP | BACKUP_ACTIVO | ACTIVO |
```

- CUPO: solo aplica para ANALISTA (máx solicitudes activas simultáneas)
- DIRECTOR/BACKUP: solo aplica para COMERCIAL
- Líderes gestionan esta tabla desde el panel admin

---

## 3. Flujo de estados completo

```
COMERCIAL radica planilla → PENDIENTE RADICAR
    │
    │ (sync ≤10 min)
    ▼
PENDIENTE ASIGNAR ← cola del Auxiliar
    │
    │ Auxiliar toma y radica en SAI
    ├── SAI OK → RADICADO ← cola del Analista
    │                │
    │                │ Analista pide y evalúa
    │                ▼
    │            TERMINADO
    │
    └── SAI rechaza → ERROR EN TERCEROS
                        │
                        │ (ciclo de corrección Web App)
                        ▼
                     RADICADO (cuando se resuelve)
```

Estados paralelos (pueden ocurrir en cualquier momento):
- `PENDIENTE PAZ Y SALVO`
- `ERROR EN TERCEROS`

**Importante**: Los estados son POR SOLICITUD (contrato individual), no por lote. Un lote puede tener solicitudes en estados distintos.

---

## 4. Flujo del COMERCIAL

### Dashboard
- Saludo personalizado + KPIs personales (radicados esta semana, en análisis, etc.)
- Últimos lotes + consulta por ID
- Alerta si tiene errores pendientes de responder

### Radicar (igual que hoy, misma lógica + IA)
- Stepper: Datos del lote → Paz y salvo → Planilla Excel
- Pre-validación en frontend (SheetJS)
- Backend: misma auditoría + Vertex AI para destinos
- Resultado: éxito (confetti + ID) o tabla de errores

### Responder error en terceros
- Ve qué le pidieron POR PARTICIPANTE (inquilino o codeudor específico)
- Escribe respuesta de texto
- Adjunta archivos (van a Drive)
- Todo desde la Web App, nunca por correo

---

## 5. Flujo del AUXILIAR

### Cola
- Solicitudes en PENDIENTE ASIGNAR
- Toma UNA a la vez

### Radicar en SAI
- Ve todos los datos de la solicitud (solo lectura) para ingresarlos en SAI
- Marca: RADICADO o ERROR EN TERCEROS

### Error en terceros
- Selecciona quién tiene error (inquilino y/o COAs)
- Por cada participante: marca qué se necesita (checkboxes):
  - Confirmar celular o correo
  - Adjuntar documento de identidad
  - Adjuntar cert. existencia y representación legal
  - Confirmar destino específico
  - Confirmar dirección
  - Otro (texto libre)
- Nota interna (solo visible para el equipo)
- Al guardar → correo de notificación al comercial ("entra al aplicativo")

### Revisar corrección
- Ve lo que se pidió + lo que respondió el comercial + archivos
- Marca RADICADO (si SAI aceptó) o pide más info (nuevo ciclo)

---

## 6. Flujo del ANALISTA

### Pedir solicitudes
- Ve su cupo: "3 de 5 ocupados (puedes pedir 2 más)"
- Botón "Pedir solicitud" = se le asigna UNA solicitud (la más antigua de la cola)
- LockService solo al asignar (breve)
- Si cupo lleno → botón deshabilitado
- Si no hay cola → botón deshabilitado

### Evaluar (formulario)

**Datos que VE (solo lectura):**

| Sección | Campos |
|---|---|
| Inmueble | Tipo negociación, Póliza, Inmobiliaria, Sucursal, Destino, Ciudad, Dirección, Fecha inicio, Amparo integral, Tasa, Canon, Administración, IVA, Valor a asegurar |
| Inquilino (datos) | Arrendatario, TD_INQ, Id_arrendatario, TEL_INQ, CORREO_INQ, Solicitud Inquilino |
| Codeudor N (datos) | COA[N], TD_COA[N], Id_COA[N], TEL_COA[N], CORREO_COA[N], NRO COA[N] |
| Lote | Código lote, Fecha lote |

**Campos que EDITA el analista (se escriben en "registro analisis"):**

| Sección | Campo | Tipo | Columna en sheet |
|---|---|---|---|
| **Inquilino** | Ingresos | Número | `Ingresos` |
| | Acierta | Select: SI/NO | `Acierta` |
| | Ocupación | Texto libre | `ocupacion` |
| | Respuesta modelo | Select (opciones a confirmar) | `Respuesta modelo inquilino` |
| | Regla Dura | Select (opciones a confirmar) | `Regla Dura Inquilino` |
| **Codeudor N** (×1-5, si existe) | Ingresos COA[N] | Número | `Ingresos COA[N]` |
| | Acierta COA[N] | Select: SI/NO | `Acierta COA[N]` |
| | Ocupacion COA[N] | Texto libre | `Ocupacion COA[N]` / `ocupacion COA[N]` |
| | Respuesta modelo COA[N] | Select | `Respuesta modelo COA[N]` |
| | Regla Dura COA[N] | Select | `Regla Dura COA[N]` |
| **General** | Comentarios del analista | Textarea libre | `comentarios del analista` |

**Total: 5 campos × cada participante + 1 textarea general.**

**Campos que se calculan SOLOS (fórmulas del sheet, el analista NO los toca):**
- Resultado Final Inquilino / COA[N]
- Num coa aprob, Num coa negados, coa evaluados
- Política ingresos solicitud
- RESULTADO SOLICITUD, RESULTADO SOLICITUD LNeg
- DETALLE RESULTADO SOLICITUD
- RESULTADO LOTE
- contrato_de
- DETALLE RESULTADO COMERCIAL

**La Web App NO muestra estos campos calculados.** El analista guarda sus campos y las fórmulas recalculan en el sheet automáticamente.

**Campos que se escriben AUTOMÁTICAMENTE al finalizar:**

| Campo | Valor |
|---|---|
| REGISTRO ANALISTA SAI | Email del analista |
| Fecha Evaluacion | Fecha/hora actual |

### Acciones:
- **Guardar** → escribe SOLO los campos editables en la fila de "registro analisis" (sin lock, fila exclusiva). Las fórmulas del sheet recalculan solas. No se lee nada de vuelta.
- **Finalizar evaluación** → valida que todos los campos obligatorios estén llenos → confirma → escribe campos + REGISTRO ANALISTA SAI (email) + Fecha Evaluacion (ahora) → la solicitud sale de su lista → TERMINADO

### Dónde se escriben los datos:
- Directamente en la fila correspondiente de "registro analisis" (identificada por UUID/Solicitud Inquilino)
- SIN lock (la fila es exclusiva del analista asignado, nadie más la toca)
- Escritura: TextFinder para ubicar la fila, luego escritura de solo las columnas editables (batch por rango de fila)
- No se lee de vuelta — una sola operación de escritura, rápida

---

## 7. Flujo del LÍDER/ADMIN

### Ve TODA la información de las hojas:
- Todos los lotes (Control_General)
- Todas las solicitudes con todos sus ~100 campos (registro analisis)
- Log de radicaciones (Hoja_Control)
- Histórico de envíos (Historico_Envios)
- Logs del sistema (Logs_Sistema)

### Gestiona:
- Usuarios (CRUD, cualquier rol, cupos de analistas)
- Asignaciones (reasignar/liberar solicitudes)
- Reportes (exportar gestión, Ley 2300, rendimiento)
- Configuración del sistema

---

## 8. Notificaciones (solo correo de aviso → acción en Web App)

| Evento | Para | Acción en correo |
|---|---|---|
| Radicación exitosa | Comercial + CC | "Ver lote →" |
| Error en terceros | Comercial | "Ver y responder →" |
| Recordatorio error (3/7/14/21d) | Comercial + CC escala | "Resolver pendiente →" |
| Corrección recibida | Auxiliar | "Revisar corrección →" |
| Pendiente paz y salvo | Comercial + CC | "Ver lote →" |
| Recordatorio P&S (3/7/14/21d) | Comercial + CC escala | "Resolver pendiente →" |
| Cambio de estado | Comercial | "Ver lote →" |
| Analista habilitado | Analista | "Ingresar →" |
| Reporte diario | Líderes | (métricas en el correo) |
| Alerta sistema | Admin | (lista de problemas) |
| Ley 2300 | Líderes específicos | (adjuntos CSV) |

---

## 9. Optimización técnica

| Componente | Estrategia |
|---|---|
| **COLA_ANALISIS** (pestaña nueva) | Índice liviano (~8 cols) de solicitudes radicadas. Se lee rápido |
| **Cache (JSON)** | Copia en memoria de la cola y catálogos. TTL 60s. Lecturas instantáneas |
| **LockService** | SOLO al asignar solicitudes (ms). NO al guardar evaluación |
| **TextFinder** | Para buscar 1 fila específica en hojas grandes (más rápido que leer todo) |
| **Batch read/write** | Siempre getValues/setValues, nunca celda por celda |
| **Mapeo por headers** | Columnas se identifican por nombre, no por índice fijo |

---

## 10. Arquitectura de persistencia

```
Libro de Control:
├── Control_General      → Registro maestro de lotes/solicitudes
├── Hoja_Control         → Log de radicaciones
├── USUARIOS             → Todos los usuarios con roles (reemplaza CORREOS)
├── COLA_ANALISIS        → Índice liviano para asignación rápida
├── Errores_Terceros     → Historial de errores y correcciones
└── Logs_Sistema         → Logging estructurado

Libro de Análisis:
├── registro analisis    → Datos completos + evaluación del analista
└── Historico_Envios     → Resultados de la aseguradora

Google Drive:
└── /[LOTE]/
    ├── planilla.xlsx
    ├── paz_y_salvo.pdf
    └── correcciones/[UUID]/[PARTICIPANTE]/*.pdf
```
