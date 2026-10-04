# SPEC — Estética de Gráficas: Visme Modern Design

**Versión:** 1.0  
**Fecha:** 2026-10-03  
**Para:** lib/motor-graficas.js en CODE CELLS  
**Patrón:** Visme.co chart aesthetic — professional, clean, accessible

---

## 1. PALETA DE COLORES

### Paleta Principal (Medical/Professional)
```
Primario:     #0066CC (azul médico)
Secundario:   #00A86B (verde salud)
Terciario:    #FF6B35 (naranja alerta)
Neutro Dark:  #2B3140 (gris oscuro base)
Neutro Mid:   #6B7280 (gris medio, líneas, texto secundario)
Neutro Light: #F3F4F6 (gris claro, fondos)
Fondo:        #FFFFFF (blanco)
```

### Escala de Grises (Accesibilidad)
- Texto principal: #1F2937 (casi negro)
- Texto secundario: #6B7280
- Bordes: #D1D5DB
- Fondo secundario: #F9FAFB

### Colores por Serie (Multi-line, Multi-bar)
```
Serie 1: #0066CC (azul)
Serie 2: #00A86B (verde)
Serie 3: #FF6B35 (naranja)
Serie 4: #9333EA (púrpura)
Serie 5: #EC4899 (rosa)
Serie 6: #06B6D4 (cian)
```

### Estado/Alertas
```
Éxito:   #10B981 (verde oscuro)
Alerta:  #F59E0B (amarillo/naranja)
Crítico: #EF4444 (rojo)
Info:    #3B82F6 (azul claro)
```

---

## 2. TIPOGRAFÍA

### Familia Principal
- **Nombre:** Inter (o Segoe UI, fallback a system sans-serif)
- **Pesos usados:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Uso:** Todos los labels, leyendas, anotaciones

### Escalas de Texto

| Contexto | Size | Weight | Line-height | Uso |
|----------|------|--------|-------------|-----|
| Título gráfica | 18px | 700 | 1.4 | Encabezado principal |
| Subtítulo | 14px | 500 | 1.5 | Descripción breve |
| Label ejes | 12px | 400 | 1.4 | Nombres de categorías |
| Valor/Data | 13px | 600 | 1.3 | Números en gráfica |
| Leyenda | 11px | 400 | 1.4 | Labels de serie |
| Anotación | 10px | 400 | 1.3 | Notas pequeñas |

---

## 3. ESPACIADO Y LAYOUT

### Márgenes/Padding
```
Gráfica contenedor: 24px (arriba/abajo), 20px (izquierda/derecha)
Padding interno gráfica: 16px
Espacio título a gráfica: 12px
Espacio gráfica a leyenda: 16px
Espacio entre elementos: 8px, 12px, 16px (según jerarquía)
```

### Grid y Alineación
- **Grid base:** 4px (microspacing)
- **Columnas:** máximo 12 columnas responsivo
- **Breakpoints:**
  - Mobile: < 640px
  - Tablet: 640px - 1024px
  - Desktop: > 1024px

---

## 4. ESTILOS DE GRÁFICAS

### Bordes y Sombras
```
Contenedor:
  - border: 1px solid #D1D5DB
  - border-radius: 8px
  - box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)

Hover (interactivo):
  - box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15)
  - transition: all 200ms ease-in-out
```

### Líneas y Ejes
```
Ejes principales (X, Y):
  - stroke: #D1D5DB
  - stroke-width: 1px

Grid secundario:
  - stroke: #E5E7EB
  - stroke-width: 1px
  - stroke-dasharray: 4,4 (punteado opcional)

Líneas de datos:
  - stroke-width: 2.5px (líneas)
  - stroke-width: 1.5px (bordes barras)
  - stroke-linecap: round
  - stroke-linejoin: round
```

### Puntos de Datos (Scatter, Line)
```
Radio: 4px (normal), 6px (hover)
Borde: 2px sólido (color serie)
Relleno: color serie
Transición: 150ms
```

### Barras
```
Esquinas: border-radius 4px
Espaciado entre grupos: 20px
Espaciado entre barras: 4px
Opacidad serie secundaria: 0.7 (si aplica)
```

### Pie Charts / Donuts
```
Radio donut: 60% del contenedor
Grosor donut: 25px
Separación sectores: 2px (gap visual)
Etiqueta centrada en porcentaje
```

---

## 5. LEYENDAS Y ANOTACIONES

### Leyenda (Legend)
```
Posición: derecha o debajo (responsivo)
Layout: horizontal (tablets/desktop) o vertical (mobile)
Elemento:
  - Cuadrado de color: 12x12px, border-radius 2px
  - Texto: 11px, color #1F2937
  - Espaciado: 8px entre ícono y texto, 12px entre items
```

### Tooltip (Hover)
```
Fondo: #1F2937 (oscuro)
Texto: #FFFFFF
Padding: 8px 12px
Border-radius: 4px
Sombra: 0 4px 12px rgba(0, 0, 0, 0.25)
Transición: 100ms
Punta triangular (pointer): incluir
```

### Anotaciones de Valor
```
Formato: número con 1-2 decimales
Fondo: #F9FAFB (opcional, solo si contraste)
Texto: #1F2937 bold
Padding: 2px 6px
Border-radius: 2px
```

---

## 6. INTERACCIÓN Y ANIMACIÓN

### Hover
```
Elemento:
  - opacity: 0.8 (elementos inactivos)
  - transform: scale(1.05) (optional, subtle)
  - cursor: pointer
  - transition: all 150ms ease-in-out
```

### Carga (Skeleton/Loading)
```
Pulse: opacity animation 1.5s infinite
Color: #E5E7EB
Border-radius: mantener forma esperada
```

### Transiciones
```
Default: 200ms ease-in-out
Hover: 150ms ease-in-out
Entrada: 300ms ease-out
```

---

## 7. RESPONSIVE DESIGN

### Mobile (< 640px)
- Leyenda debajo (vertical stack)
- Título 16px, labels 10px
- Padding: 16px (reducido)
- Una serie por defecto, swipe para más

### Tablet (640px - 1024px)
- Leyenda derecha o debajo (flexible)
- Escala normal con ajustes de padding
- 2-3 series máximo visibles

### Desktop (> 1024px)
- Leyenda derecha (preferido)
- Escala completa
- Todas las series visibles
- Tooltips en hover
- Anotaciones completas

---

## 8. ACCESIBILIDAD

### Contraste
- Mínimo WCAG AA (4.5:1 para texto, 3:1 para gráficos)
- Alto contraste: #1F2937 sobre #FFFFFF ✓
- Labels en gráficas deben ser legibles

### Color
- NO confiar SOLO en color para distinguir series
- Usar patrones, líneas punteadas, o formas distintas
- Incluir leyenda clara + tooltips

### ARIA
- role="img" en gráfica
- aria-label descriptivo
- alt text para gráficas exportadas

---

## 9. EJEMPLOS ESPECÍFICOS POR TIPO

### Línea (Time Series)
```
Líneas: 2.5px, color serie, rounded joins
Puntos: 4px radio, stroke 2px
Grid: líneas punteadas suaves
Área bajo línea: relleno con opacity 0.1
Tooltip: mostrar todos los valores alineados
```

### Barras Agrupadas
```
Barras: 4px border-radius, ancho proporcional
Espaciado: 20px entre grupos, 4px entre barras
Color: serie primaria opaca, otras 0.7
Labels X: 10px, rotados -45° si muchos
```

### Presión Arterial (Área)
```
Mín (inferior): color #FF6B35, opacity 0.3
Máx (superior): color #0066CC, opacity 0.3
Línea media: stroke 2px, color #0066CC
Relleno entre: gradient suave
Anotación: "Sistólica / Diastólica"
```

---

## 10. IMPLEMENTACIÓN EN CODE

### CSS Variables (Recomendado)
```css
:root {
  --color-primary: #0066CC;
  --color-secondary: #00A86B;
  --color-alert: #FF6B35;
  --color-text-primary: #1F2937;
  --color-border: #D1D5DB;
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-size-title: 18px;
  --spacing-base: 4px;
  --border-radius: 8px;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### Estructura HTML
```html
<div class="grafica-contenedor">
  <h3 class="grafica-titulo">Presión Arterial Sistémica</h3>
  <div class="grafica-svg-wrapper">
    <!-- SVG chart here -->
  </div>
  <div class="grafica-leyenda">
    <!-- Legend items -->
  </div>
</div>
```

### Clases CSS Base
```css
.grafica-contenedor {
  background: #FFFFFF;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 24px 20px;
  box-shadow: var(--shadow-sm);
}

.grafica-titulo {
  font-size: var(--font-size-title);
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

.grafica-serie-1 { stroke: var(--color-primary); }
.grafica-serie-2 { stroke: var(--color-secondary); }
.grafica-serie-3 { stroke: var(--color-alert); }
```

---

## 11. CHECKLIST IMPLEMENTACIÓN

- [ ] Colores aplicados según paleta
- [ ] Tipografía Inter/system sans-serif
- [ ] Espaciado basado en grid 4px
- [ ] Bordes y sombras suaves
- [ ] Leyendas claras y posicionadas
- [ ] Tooltips funcionando en hover
- [ ] Responsive en mobile/tablet/desktop
- [ ] Contraste WCAG AA verificado
- [ ] Sin dependencia exclusiva de color
- [ ] Animaciones suaves, no jarring

---

**Notas:** Este spec es la traducción de la estética Visme al motor de gráficas de CODE CELLS. La implementación será en SVG/Canvas con React o vanilla JS, manteniendo estos principios visuales.
