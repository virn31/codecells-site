# 🌍 Sistema i18n - CODE CELLS™

Sistema de internacionalización global para toda la plataforma CODE CELLS™.

**Estado:** ✅ Implementado y operativo  
**Idiomas:** Español (es) + English (en)  
**Diccionario:** 1200+ términos  
**Páginas:** 28 archivos HTML  
**Módulos:** 12 módulos de capacitación  

---

## 📁 Estructura

```
lib/
  i18n.js           ← Sistema i18n (846 líneas, 1200+ términos)

*.html              ← 28 páginas (todas con <script src="/lib/i18n.js">)
capacitacion/*.html ← 12 módulos de capacitación
```

---

## 🚀 Uso Básico

### 1. Agregar a una página
```html
<head>
  <script src="/lib/i18n.js"></script>
</head>

<body>
  <h1 data-i18n="titulo_hero">Medicina Regenerativa</h1>
  <button data-i18n="buscar">🔎 Buscar</button>
  <input data-i18n-placeholder="ciudad_placeholder" />
</body>
```

### 2. Cambiar idioma (manual)
```javascript
setLanguage('en');  // Cambiar a inglés
setLanguage('es');  // Cambiar a español
```

### 3. Selector automático
- Aparece en top-right de todas las páginas
- Guarda preferencia en localStorage
- Disponible en todos los idiomas

---

## 🎯 Atributos disponibles

| Atributo | Uso | Ejemplo |
|----------|-----|---------|
| `data-i18n` | Contenu de elemento | `<h1 data-i18n="clave">Texto</h1>` |
| `data-i18n-placeholder` | Placeholder input | `<input data-i18n-placeholder="clave" />` |
| `data-i18n-value` | Value input | `<input data-i18n-value="clave" />` |
| `data-i18n-title` | Title/tooltip | `<button data-i18n-title="clave">Click</button>` |

---

## 📚 Funciones disponibles

### `t(clave, idioma)`
Obtener texto traducido
```javascript
t('titulo_hero')      // Español (default)
t('titulo_hero', 'en') // Inglés
```

### `setLanguage(idioma)`
Cambiar idioma y aplicar a toda la página
```javascript
setLanguage('en');  // Cambiar a inglés
```

### `agregarIdioma(codigo, diccionario)`
Agregar nuevo idioma (para francés, portugués, etc.)
```javascript
agregarIdioma('fr', {
  titulo_hero: "Médecine Régénérative",
  // ... 1200+ términos en francés
});
```

### `aplicarTraduccion(idioma)`
Aplicar traducción a elementos con data-i18n
```javascript
aplicarTraduccion('en');  // Aplicar inglés
```

---

## 🔑 Diccionario

Ubicación: `lib/i18n.js`

**Estructura:**
```javascript
const i18nDictionary = {
  es: {
    // 1200+ términos en español
    titulo_hero: "Medicina Regenerativa Precision",
    buscar: "🔎 Buscar",
    // ...
  },
  en: {
    // 1200+ términos en inglés
    titulo_hero: "Precision Regenerative Medicine",
    buscar: "🔎 Search",
    // ...
  }
};
```

**Categorías:**
- Navegación global
- Index.html (hero, valor, sistemas, niveles, CTA, footer)
- Portal médico (login, dashboard, expediente, receta, interconsulta)
- Búsqueda de médicos
- Afiliación de médicos
- Capacitación (módulos, evaluación, certificado)
- Páginas influencer (descubre, bienestar, DEZAWA VIP)
- NOVA (chatbot)
- Validaciones y mensajes
- Seguridad y privacidad
- Contacto

---

## ➕ Agregar nueva clave

### 1. Agregar a diccionario
```javascript
// lib/i18n.js - Agregar en ambas secciones (es e en):

es: {
  mi_nueva_clave: "Texto en español",
},

en: {
  mi_nueva_clave: "Text in English",
}
```

### 2. Usar en HTML
```html
<h1 data-i18n="mi_nueva_clave">Texto en español</h1>
```

### 3. Commit
```bash
git add lib/i18n.js
git commit -m "feat: agregar nueva clave i18n 'mi_nueva_clave'"
git push
```

---

## 🌐 Agregar nuevo idioma

### Ejemplo: Francés (30 min)

1. **Traducir diccionario:**
```javascript
// lib/i18n.js - Agregar sección 'fr'
fr: {
  titulo_hero: "Médecine Régénérative de Précision",
  buscar: "🔎 Rechercher",
  // ... 1200+ términos en francés
}
```

2. **En console (opcional):**
```javascript
// Para testing sin commit
agregarIdioma('fr', i18nDictionary.fr);
setLanguage('fr');
```

3. **Commit:**
```bash
git add lib/i18n.js
git commit -m "feat: agregar francés al sistema i18n

- 1200+ términos en francés
- Selector actualizado (Español/English/Français)
- Disponible en https://codecells.mx"
git push
```

---

## 🧪 Testing

### En DevTools console:

```javascript
// Verificar idiomas disponibles
console.log(Object.keys(i18nDictionary));
// Output: ['es', 'en']

// Obtener un término
t('titulo_hero');
t('titulo_hero', 'en');

// Cambiar idioma
setLanguage('en');

// Agregar idioma test
agregarIdioma('test', { prueba: "test value" });
setLanguage('test');
```

### En navegador:

1. Abrir DevTools (F12)
2. Ir a Application → Storage → Local Storage
3. Verificar `language` = `'es'` o `'en'`
4. Click en selector de idioma
5. Verificar que `language` cambió

---

## 📊 Estadísticas

- **Archivos HTML:** 28
- **Módulos capacitación:** 12
- **Diccionario tamaño:** ~30 KB (minificado ~4 KB)
- **Términos traducidos:** 1200+
- **Lenguajes soportados:** 2 (es, en)
- **Lenguajes planeados:** Francés, Portugués
- **Performance:** <50ms para cambiar idioma

---

## 🔗 Eventos

Escuchar cambios de idioma:

```javascript
// Evento cuando se cambia idioma
document.addEventListener('languagechange', (e) => {
  console.log('Idioma cambiado a:', e.detail.language);
});

// Evento cuando se aplica traducción
window.addEventListener('i18nchange', (e) => {
  console.log('Traducción aplicada:', e.detail.language);
});
```

---

## 🛠️ Mantenimiento

### Actualizar diccionario:
```bash
# Editar lib/i18n.js
# Agregar/modificar claves según sea necesario

git add lib/i18n.js
git commit -m "docs: actualizar términos i18n"
git push
```

### Migrar nueva página:
```bash
# 1. Agregar script en <head>
<script src="/lib/i18n.js"></script>

# 2. Marcar elementos
<h1 data-i18n="clave">Texto original</h1>

# 3. Agregar claves al diccionario si es necesario
# En lib/i18n.js

# 4. Commit
git add *.html lib/i18n.js
git commit -m "feat: migrar página_nueva a i18n"
git push
```

---

## 📋 Checklist: Nueva página

- [ ] Importar `<script src="/lib/i18n.js"></script>` en `<head>`
- [ ] Marcar todos los títulos con `data-i18n="clave"`
- [ ] Marcar todos los botones con `data-i18n="clave"`
- [ ] Marcar labels con `data-i18n="clave"`
- [ ] Marcar placeholders con `data-i18n-placeholder="clave"`
- [ ] Marcar tooltips con `data-i18n-title="clave"`
- [ ] Agregar claves faltantes a diccionario
- [ ] Testar en ambos idiomas
- [ ] Testar selector de idioma
- [ ] Verificar localStorage
- [ ] Commit con mensaje descriptivo

---

## 📖 Documentación adicional

- `PLAN-ACCION-I18N.md` — Plan de implementación (2-3 horas)
- `GUIA-MIGRACION-COMPLETA-I18N.md` — Guía técnica detallada
- `analizar-traduccion.js` — Script helper para detectar elementos sin traducir

---

## 🎯 Roadmap

### ✅ Completado (Agosto 2026)
- Sistema i18n global
- Diccionario (es, en) con 1200+ términos
- 28 páginas HTML migradas
- Selector de idioma automático
- localStorage para preferencia

### 📋 Próximo (Septiembre 2026)
- Agregar francés (30 min)
- Agregar portugués (30 min)
- SEO multiidioma (hreflang tags)
- Analytics por idioma
- Subdirectorios `/en/`, `/fr/`, `/pt/`

### 🔮 Futuro
- 50+ idiomas (estructura lista)
- Traducción automática (DeepL API)
- Detección de idioma por geolocalización
- Sincronización con herramientas de traducción

---

## 💬 Soporte

**Problema:** Elemento no se traduce  
**Solución:** Verificar que tenga `data-i18n="clave"` y clave esté en diccionario

**Problema:** Selector no aparece  
**Solución:** Verificar que página importe `<script src="/lib/i18n.js"></script>`

**Problema:** localStorage no funciona  
**Solución:** Desactivar modo incógnito (localStorage es privado en incógnito)

---

**Última actualización:** Agosto 2, 2026  
**Versión:** 2.0  
**Estado:** ✅ Operativo
