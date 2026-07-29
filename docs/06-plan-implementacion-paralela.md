# Plan de Implementación Paralela (sin interrumpir operación)

---

## Principio: La operación sigue en Sheets mientras construimos la Web App al lado

Nadie se entera de que estamos construyendo. No se toca nada de lo que ya funciona. Solo se AGREGA código nuevo. Cuando esté listo y probado, se hace el switch.

---

## ¿Qué podemos hacer YA sin que la operación se dé cuenta?

### Fase A: Infraestructura invisible (0 impacto en operación)

| Tarea | Qué es | ¿Afecta la operación? |
|---|---|---|
| Crear pestaña USUARIOS en Libro de Control | Nueva pestaña, no toca las existentes | ❌ No |
| Crear pestaña COLA_ANALISIS en Libro de Control | Nueva pestaña vacía | ❌ No |
| Crear pestaña Errores_Terceros en Libro de Control | Nueva pestaña vacía | ❌ No |
| Crear archivos nuevos de backend (Api.gs, servicios, repos) | Código nuevo que no se ejecuta hasta que alguien lo llame | ❌ No |
| Crear archivos de frontend (index.html nuevo, styles, views) | HTML nuevo que no se sirve hasta que doGet lo use | ❌ No |
| Crear Script Properties nuevas | No afecta las existentes | ❌ No |
| Crear deployment de test (URL separada) | Deploy nuevo, URL distinta, no toca el deploy actual | ❌ No |

**Todo esto se puede hacer HOY y nadie nota nada.**

---

### Fase B: Backend nuevo que LEE datos existentes (0 impacto)

| Tarea | Qué hace | ¿Afecta? |
|---|---|---|
| Repos que leen Control_General | Solo getValues(), no escribe nada | ❌ No |
| Repos que leen registro analisis | Solo lectura | ❌ No |
| Repos que leen Hoja_Control | Solo lectura | ❌ No |
| Api.gs con funciones de consulta | Solo retorna datos, no modifica | ❌ No |
| AuthService que lee USUARIOS | Solo lectura de la pestaña nueva | ❌ No |

**El backend nuevo puede leer toda la info existente sin tocar nada.** Se prueba desde el deployment de test.

---

### Fase C: Frontend nuevo en deployment de test (0 impacto)

| Tarea | Qué hace | ¿Afecta? |
|---|---|---|
| Dashboard que muestra métricas (solo lectura) | Lee datos reales pero en URL de test | ❌ No |
| Vista de lotes (solo lectura) | Idem | ❌ No |
| Vista de solicitudes (solo lectura) | Idem | ❌ No |
| Vista de logs (solo lectura) | Idem | ❌ No |

**El equipo de desarrollo puede ver el nuevo frontend funcionando con datos reales SIN que la operación se afecte.** Solo nosotros tenemos la URL de test.

---

### Fase D: Funcionalidades de ESCRITURA (se prueban en copia)

Aquí es donde empezamos a escribir en hojas. Para no arriesgar datos reales:

| Tarea | Estrategia |
|---|---|
| Radicación (nuevo frontend) | Se prueba contra COPIA de las hojas (deploy de test apunta a copias) |
| Asignación de solicitudes | Idem — escribe en COLA_ANALISIS de la copia |
| Evaluación del analista | Idem — escribe en registro analisis de la copia |
| Error en terceros + corrección | Idem — escribe en Errores_Terceros de la copia |

**Cuando todo esté probado contra la copia, se apunta a las hojas reales y se hace el switch.**

---

## Orden de construcción recomendado

```
SEMANA 1-2: Fase A (infraestructura)
├── Crear pestañas nuevas (USUARIOS, COLA_ANALISIS, Errores_Terceros)
├── Poblar USUARIOS con los datos actuales de CORREOS + emails de analistas/auxiliares
├── Crear estructura de archivos (Api.gs, servicios, repos, frontend)
├── Crear tokens.html con el Brand Book
├── Crear deployment de test
└── doGet() con feature flag: ?page=nuevo → nuevo frontend (solo accesible con param)

SEMANA 2-3: Fase B (backend solo lectura)
├── ConfigRepo, AuthService, obtenerUsuarioCacheado()
├── ControlGeneralRepo (solo lectura)
├── AnalisisRepo (solo lectura)
├── Api.gs funciones de consulta
└── Probar desde deployment de test

SEMANA 3-4: Fase C (frontend solo lectura)
├── Shell (header, sidebar, router)
├── Dashboard (métricas reales, solo lectura)
├── Vista de lotes (datos reales, solo lectura)
├── Vista de solicitudes completa (datos reales, solo lectura)
├── Vistas de logs, histórico
└── El Líder puede empezar a VER la nueva app sin gestionar nada

SEMANA 4-5: Fase D (escritura contra copias)
├── Formulario de radicación (funcional, probado contra copia)
├── Cola del auxiliar + marcar RADICADO/ERROR (contra copia)
├── Pedir solicitud + evaluar + finalizar (contra copia)
├── Flujo de error en terceros completo (contra copia)
└── Testing completo

SEMANA 5-6: Switch
├── Apuntar a hojas reales
├── Activar feature flag
├── Proteger hojas
├── Comunicar a usuarios
└── Monitorear
```

---

## ¿Qué puede VER el equipo mientras construimos (sin gestionar)?

A partir de la **semana 3** los líderes pueden acceder a la URL de test y:

- ✅ Ver el dashboard con métricas reales
- ✅ Ver todos los lotes y solicitudes con todos sus campos
- ✅ Ver logs y histórico
- ✅ Navegar por las vistas

Pero:
- ❌ No pueden radicar (aún no funciona contra datos reales)
- ❌ No pueden asignar ni evaluar (no conectado aún)
- ❌ No reemplaza su operación en Sheets (siguen trabajando allá)

Es como una "vitrina" del nuevo sistema mientras siguen operando en Sheets.

---

## Diagrama de convivencia:

```
                    PRODUCCIÓN (hoy)              TEST (nuevo)
                    ────────────────              ────────────
URL:                /exec (deploy actual)         /exec?page=nuevo (o URL test)
Frontend:           Index.html (legacy)           index.html (nuevo)
Backend:            Codigo.js, Notif.js, etc.     Api.gs, Servicios/*.gs
Datos:              Hojas reales                  Hojas reales (lectura) o copias (escritura)
Usuarios:           Comerciales operando          Solo devs/líderes probando
Triggers:           Funcionando normal            No se tocan
```

**Nada se rompe. Todo convive.**
