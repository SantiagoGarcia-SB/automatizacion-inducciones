# Sistema de Diseño — El Libertador (Brand Book)

> Fuente única de verdad para la Web App de Inducciones. Trasladar íntegramente a `styles/tokens.css` como CSS custom properties.

---

## 1. Colores

### 1.1 Primarios (predominan siempre)

| Token CSS | Uso | HEX | RGB |
|---|---|---|---|
| `--color-primary-navy` | Azul marca (Pantone 533 C) | `#253150` | 37, 49, 80 |
| `--color-primary-red` | Rojo marca (Pantone 186 C) | `#bd0f14` | 189, 15, 20 |

### 1.2 Secundarios / Acento (uso puntual: badges, alertas, CTAs especiales)

> Nunca como fondo/base. Nunca predominar sobre los primarios.

| Token CSS | HEX |
|---|---|
| `--color-accent-darkred` | `#a1161b` |
| `--color-accent-red` | `#e11f27` |
| `--color-accent-orange` | `#ffa300` |
| `--color-accent-teal` | `#0fbdb7` |

### 1.3 Escala monocromática

| Token CSS | HEX | Uso |
|---|---|---|
| `--color-mono-900` | `#231f20` | Texto principal / casi negro |
| `--color-mono-800` | `#403f3f` | Texto secundario |
| `--color-mono-500` | `#807e7e` | Gris medio (placeholders) |
| `--color-mono-300` | `#bfbebe` | Bordes, líneas |
| `--color-mono-100` | `#ebe7e8` | Fondos alternos |
| `--color-mono-0` | `#ffffff` | Blanco |

### 1.4 Gradiente corporativo

```css
--gradient-brand: linear-gradient(90deg, var(--color-primary-red) 0%, var(--color-primary-navy) 100%);
```

- Dirección: horizontal (90°), rojo izquierda → azul derecha.
- Usar en: headers, banners, portadas, splash de bienvenida.
- NO usar en: cuerpos de texto, tablas, fondos de formularios.

---

## 2. Tipografía

### 2.1 Familia oficial

**Ciencuadras** — pesos: Light, Regular, SemiBold, Bold, ExtraBold. Variante: Condensed.

Si Ciencuadras no está disponible como web font, el fallback es:

```css
--font-body: 'Ciencuadras', 'Inter', 'Poppins', system-ui, sans-serif;
--font-heading: 'Ciencuadras', 'Inter', 'Poppins', system-ui, sans-serif;
--font-mono: 'Roboto Mono', monospace;
```

### 2.2 Reglas de uso

| Peso | Contexto |
|---|---|
| Light / Regular | Párrafos, texto largo, contenido informativo |
| Bold / ExtraBold | Títulos, encabezados, mensajes cortos, CTAs, hero text |
| Condensed | Títulos largos donde el espacio es limitado |

### 2.3 Escala de tamaños (propuesta para la Web App)

```css
--text-xs: 0.75rem;    /* 12px — captions, labels auxiliares */
--text-sm: 0.875rem;   /* 14px — texto secundario, meta */
--text-base: 1rem;     /* 16px — cuerpo principal */
--text-lg: 1.125rem;   /* 18px — subtítulos */
--text-xl: 1.25rem;    /* 20px — títulos de sección */
--text-2xl: 1.5rem;    /* 24px — títulos principales */
--text-3xl: 2rem;      /* 32px — hero / dashboard KPIs */
```

---

## 3. Logo

### 3.1 Estructura
- **Logosímbolo** = símbolo (casa + edificio + mano, en rojo) + logotipo "EL LIBERTADOR"
- Fuente del logotipo: `https://www.ellibertador.co/assets/img/logo.svg`
- Favicon/ícono de app: usar solo el símbolo (mano con ciudad), nunca el logotipo completo

### 3.2 Reglas irrompibles
- Nunca redibujar, deformar, cambiar proporciones, tipografía o color
- Respetar área de exclusión (zona de seguridad) libre de otros elementos
- Variantes monocromáticas (blanco/negro) solo sobre fondos oscuros o de una tinta
- Tamaño mínimo: logo horizontal ≥ 202px digital; símbolo solo ≥ 136px

### 3.3 Implementación en header
```
[Logo SVG 32px height] | [Separador vertical] | [Título de la app]
```

---

## 4. Tono de voz y copy

| Regla | Ejemplo correcto | Ejemplo incorrecto |
|---|---|---|
| Tuteo siempre | "Tu lote fue radicado" | "Su lote fue radicado" |
| Primera persona de marca | "Te ayudamos a completar" | "El sistema completará" |
| Tono amigable y directo | "Carga la planilla para radicar" | "Por favor proceda a realizar la carga del archivo" |
| Sin lenguaje inclusivo con e/x/@ | "Todos los comerciales" | "Todes les comerciales" |
| Mensajes breves y accionables | "Corrige el celular y vuelve a cargar" | "Se ha detectado un error en el campo de número de celular del participante" |

---

## 5. Fotografía / Ilustración

- Fotografía humana, natural, diversa, luz natural, planos abiertos y limpios
- Sin poses forzadas
- Filtro dúotono permitido: rojo/azul de marca sobre fotos para reforzar identidad
- Usar en: estados vacíos, banners de bienvenida, onboarding

---

## 6. Espaciado y Layout (propuesta para la Web App)

```css
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
--spacing-2xl: 48px;

--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-full: 9999px;

--shadow-sm: 0 1px 3px rgba(35, 31, 32, 0.08);
--shadow-md: 0 4px 6px -1px rgba(35, 31, 32, 0.06), 0 2px 4px -2px rgba(35, 31, 32, 0.04);
--shadow-lg: 0 10px 20px -4px rgba(35, 31, 32, 0.1);

--max-width-content: 960px;
--max-width-wide: 1200px;
```

---

## 7. Componentes base (convenciones)

| Componente | Estilo |
|---|---|
| Botón primario | bg: `--color-primary-navy`, texto: blanco, radius: `--radius-md`, padding: 12px 24px |
| Botón de alerta/acción | bg: `--color-primary-red`, texto: blanco |
| Botón secundario | border: 1.5px `--color-primary-navy`, texto: navy, bg: transparente |
| Card/sección | bg: `--color-mono-0`, border: 1px `--color-mono-300`, radius: `--radius-lg`, shadow: `--shadow-sm` |
| Badge de estado | radius: `--radius-full`, padding: 4px 12px, font-weight: 600, font-size: `--text-xs` |
| Input | border: 1.5px `--color-mono-300`, radius: `--radius-md`, focus: border `--color-primary-navy` |
| Toast/alerta success | border-left: 4px `--color-accent-teal`, bg: teal/5% |
| Toast/alerta error | border-left: 4px `--color-primary-red`, bg: red/5% |
| Toast/alerta warning | border-left: 4px `--color-accent-orange`, bg: orange/5% |
