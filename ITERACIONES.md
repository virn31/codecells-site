# 📋 Iteraciones Pendientes — i18n & Bugs

**Estado:** v3.0 en producción. Motor funcional, diccionario ~260 términos.
**Responsable:** Víctor | **Feedback de:** Jorge Torres (CEO Regene)

---

## 🔴 CRÍTICOS (bloquean a Jorge)

### Bug #1: Posición del botón del test
- **Reporte:** Botón "TAKE YOUR ASSESSMENT" está mal ubicado (screenshot)
- **Probable causa:** CSS media query o contenido dinámico no se posiciona al traducir
- **Acción:** Revisar index.html línea ~2200, selector `.cta-hero button`
- **Status:** 🔴 PENDIENTE

### Bug #2: Modal del test en español
- **Reporte:** "Evaluación Cronodegenerativa CODE CELLS™" y botón "COMENZAR" no traducen
- **Probable causa:** Modal cargado por JS después del MutationObserver inicial
- **Acción:** Forzar re-escaneo del DOM cuando se abre modal (click en botón test)
- **Status:** 🔴 PENDIENTE

---

## 🟡 TRADUCCIÓN INCOMPLETA (baja prioridad)

### Términos faltantes (+600 más)
- Privacidad: secciones 1-7 (datos del controlador, seguridad, derechos, etc)
- Números (no deben traducirse, pero están en la lista de `i18nMissing()`)
- Fragmentos dinámicos (formularios, modales, tooltips que llegan por JS)

**Estrategia:** Ir agregando conforme Jorge reporta qué ve mal. No intentar traducirlo TODO de golpe.

---

## 🟢 COMPLETADO

- ✅ Motor i18n v3.0 funcional (recorre DOM por coincidencia exacta)
- ✅ 28 páginas cargan el script
- ✅ Selector ES/EN visible
- ✅ Preferencia guardada en localStorage
- ✅ Seguridad de datos clínicos verificada (pacientes, códigos, diagnósticos intactos)
- ✅ ~260 términos traducidos (principales)
- ✅ Repo organizado (.gitignore, README, docs/)

---

## 📝 Cómo Reportar (para Jorge)

1. **Abre** https://codecells.mx en navegador limpio
2. **Haz clic** en botón **EN** (arriba a la derecha)
3. **Si algo no traduce o se ve mal:**
   - Screenshot del problema
   - Copiar el texto que falta traducir
   - Nombre de la página (index, portal-medico, etc)

4. **Si hay error visual/CSS:**
   - Screenshot con selector abierto (F12)
   - Notar si es mobile o desktop
   - Navegador (Chrome, Safari, Firefox)

---

## 🛠️ Próximos pasos (cuando Víctor pueda)

1. **Arreglar bug de posición del botón** (CSS Media Query)
2. **Mejorar MutationObserver** para modales tardíos
3. **Agregar términos** que Jorge reporte
4. **Migrar assets** de index.html (6.5 MB) a carpeta `assets/`
5. **Subdomios multiidioma** (`/en/`, `/es/`) para SEO

---

## 📊 Diccionario actual

| Métrica | Valor |
|---|---|
| Total strings en páginas | 830 |
| En diccionario | 260 |
| Cobertura | 31% |
| Objetivo | 80%+ (priorizar lo que ve el usuario) |

**Nota:** No todos los 830 necesitan traducción (incluye CSS classes, números, fragmentos de privacidad). Enfocarse en lo visible es mejor.

