/* ==========================================================================
   TORNEO ESCOLAR DE CARROS ROBOTS — main.js
   JavaScript ES6 Vanilla, modular, sin librerías externas.
   Módulos incluidos:
     1. Utilidades compartidas
     2. Loader inicial
     3. Navbar sticky + cambio de estilo al hacer scroll
     4. Menú hamburguesa (responsive)
     5. Scroll Spy (resaltado del link activo)
     6. Tabs dinámicos (categorías del torneo)
     7. Back To Top
     8. Modo responsive (cierre automático de menú en desktop)
     9. Animaciones de navegación (scroll suave por anclas)
     10. Inicialización general
   ========================================================================== */

/* ==========================================================================
   1. UTILIDADES COMPARTIDAS
   ========================================================================== */

/**
 * Limita la frecuencia de ejecución de una función usando requestAnimationFrame.
 * Evita disparar lógica costosa en cada evento de scroll/resize.
 * @param {Function} callback - Función a ejecutar en el siguiente frame.
 * @returns {Function} Función envuelta lista para usarse como listener.
 */
function rafThrottle(callback) {
    let ticking = false;
    return function throttled(...args) {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
            callback(...args);
            ticking = false;
        });
    };
}

/**
 * Atajo para document.querySelector.
 * @param {string} selector
 * @param {ParentNode} [context=document]
 */
function qs(selector, context = document) {
    return context.querySelector(selector);
}

/**
 * Atajo para document.querySelectorAll devuelto como array.
 * @param {string} selector
 * @param {ParentNode} [context=document]
 */
function qsa(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

/* ==========================================================================
   2. LOADER INICIAL
   Crea un overlay de carga que desaparece cuando la ventana termina de cargar
   todos los recursos (imágenes, modelo 3D, fuentes, etc.).
   ========================================================================== */
function initLoader() {
    const loader = document.createElement('div');
    loader.id = 'pageLoader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-label', 'Cargando el sitio del torneo');
    loader.style.position = 'fixed';
    loader.style.inset = '0';
    loader.style.zIndex = '999';
    loader.style.display = 'flex';
    loader.style.alignItems = 'center';
    loader.style.justifyContent = 'center';
    loader.style.background = '#030304';
    loader.style.transition = 'opacity 500ms cubic-bezier(0.16, 1, 0.3, 1)';

    const spinner = document.createElement('div');
    spinner.style.width = '42px';
    spinner.style.height = '42px';
    spinner.style.borderRadius = '50%';
    spinner.style.border = '2px solid rgba(255,255,255,0.15)';
    spinner.style.borderTopColor = '#0a84ff';
    spinner.style.animation = 'spin 900ms linear infinite';

    // Keyframe del spinner definido dinámicamente para no tocar el CSS existente.
    const styleTag = document.createElement('style');
    styleTag.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(styleTag);

    loader.appendChild(spinner);
    document.body.prepend(loader);

    const removeLoader = () => {
        loader.style.opacity = '0';
        window.setTimeout(() => loader.remove(), 550);
    };

    if (document.readyState === 'complete') {
        removeLoader();
    } else {
        window.addEventListener('load', removeLoader, { once: true });
    }
}

/* ==========================================================================
   3. NAVBAR STICKY + CAMBIO DE ESTILO AL HACER SCROLL
   ========================================================================== */
function initNavbarScrollStyle() {
    const navbar = qs('#navbar');
    if (!navbar) return;

    const SCROLL_THRESHOLD = 24;

    const updateNavbarState = () => {
        if (window.scrollY > SCROLL_THRESHOLD) {
            navbar.classList.add('is-scrolled');
        } else {
            navbar.classList.remove('is-scrolled');
        }
    };

    updateNavbarState();
    window.addEventListener('scroll', rafThrottle(updateNavbarState), { passive: true });
}

/* ==========================================================================
   4. MENÚ HAMBURGUESA (RESPONSIVE)
   ========================================================================== */
function initHamburgerMenu() {
    const toggle = qs('#navToggle');
    const menu = qs('#navMenu');
    if (!toggle || !menu) return;

    const closeMenu = () => {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir menú de navegación');
        menu.classList.remove('is-open');
    };

    const openMenu = () => {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Cerrar menú de navegación');
        menu.classList.add('is-open');
    };

    toggle.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        isOpen ? closeMenu() : openMenu();
    });

    // Cierra el menú al seleccionar un link (experiencia móvil esperada).
    qsa('.navbar__link', menu).forEach((link) => {
        link.addEventListener('click', closeMenu);
    });

    // Cierra el menú con la tecla Escape por accesibilidad.
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });

    // Se expone la función de cierre para que el módulo de "modo responsive" la reutilice.
    initHamburgerMenu.close = closeMenu;
}

/* ==========================================================================
   5. SCROLL SPY
   Resalta el link de navegación correspondiente a la sección visible.
   ========================================================================== */
function initScrollSpy() {
    const links = qsa('.navbar__link');
    if (!links.length) return;

    const sections = links
        .map((link) => {
            const id = link.getAttribute('href');
            return id && id.startsWith('#') ? qs(id) : null;
        })
        .filter(Boolean);

    if (!sections.length) return;

    const setActiveLink = (id) => {
        links.forEach((link) => {
            const isActive = link.getAttribute('href') === `#${id}`;
            link.classList.toggle('is-active', isActive);
            if (isActive) {
                link.setAttribute('aria-current', 'true');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    };

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    setActiveLink(entry.target.id);
                }
            });
        },
        {
            // El margen vertical simula el punto donde el navbar fijo "activa" la sección.
            rootMargin: '-45% 0px -50% 0px',
            threshold: 0,
        }
    );

    sections.forEach((section) => observer.observe(section));
}

/* ==========================================================================
   6. TABS DINÁMICOS (CATEGORÍAS DEL TORNEO)
   ========================================================================== */
function initTabs() {
    const tabButtons = qsa('.tabs__button');
    if (!tabButtons.length) return;

    const activateTab = (selectedButton) => {
        tabButtons.forEach((button) => {
            const isSelected = button === selectedButton;
            const panel = document.getElementById(button.getAttribute('aria-controls'));

            button.setAttribute('aria-selected', String(isSelected));
            button.setAttribute('tabindex', isSelected ? '0' : '-1');

            if (panel) {
                const article = panel.closest('.tab-panel');
                if (article) {
                    article.hidden = !isSelected;
                }
            }
        });

        selectedButton.focus();
    };

    tabButtons.forEach((button, index) => {
        button.addEventListener('click', () => activateTab(button));

        // Navegación por teclado con "roving tabindex", según el patrón ARIA de tabs.
        button.addEventListener('keydown', (event) => {
            let targetIndex = null;

            if (event.key === 'ArrowRight') targetIndex = (index + 1) % tabButtons.length;
            if (event.key === 'ArrowLeft') targetIndex = (index - 1 + tabButtons.length) % tabButtons.length;
            if (event.key === 'Home') targetIndex = 0;
            if (event.key === 'End') targetIndex = tabButtons.length - 1;

            if (targetIndex !== null) {
                event.preventDefault();
                activateTab(tabButtons[targetIndex]);
            }
        });
    });
}

/* ==========================================================================
   7. BACK TO TOP
   ========================================================================== */
function initBackToTop() {
    const button = document.createElement('button');
    button.id = 'backToTop';
    button.type = 'button';
    button.setAttribute('aria-label', 'Volver al inicio de la página');
    button.textContent = '↑';

    Object.assign(button.style, {
        position: 'fixed',
        right: '1.5rem',
        bottom: '1.5rem',
        width: '48px',
        height: '48px',
        borderRadius: '999px',
        border: '1px solid rgba(255,255,255,0.16)',
        background: 'rgba(255,255,255,0.09)',
        backdropFilter: 'blur(24px)',
        color: '#f5f5f7',
        fontSize: '1.1rem',
        cursor: 'pointer',
        opacity: '0',
        pointerEvents: 'none',
        transform: 'translateY(12px)',
        transition: 'opacity 280ms cubic-bezier(0.16,1,0.3,1), transform 280ms cubic-bezier(0.16,1,0.3,1)',
        zIndex: '90',
    });

    document.body.appendChild(button);

    const SHOW_AFTER_PX = 480;

    const updateVisibility = () => {
        const shouldShow = window.scrollY > SHOW_AFTER_PX;
        button.style.opacity = shouldShow ? '1' : '0';
        button.style.transform = shouldShow ? 'translateY(0)' : 'translateY(12px)';
        button.style.pointerEvents = shouldShow ? 'auto' : 'none';
    };

    window.addEventListener('scroll', rafThrottle(updateVisibility), { passive: true });

    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* ==========================================================================
   8. MODO RESPONSIVE
   Sincroniza el estado del menú móvil cuando el viewport cruza el
   breakpoint de escritorio, evitando estados inconsistentes.
   ========================================================================== */
function initResponsiveMode() {
    const desktopQuery = window.matchMedia('(min-width: 768px)');

    const handleBreakpointChange = (event) => {
        if (event.matches && typeof initHamburgerMenu.close === 'function') {
            initHamburgerMenu.close();
        }
    };

    desktopQuery.addEventListener('change', handleBreakpointChange);
}

/* ==========================================================================
   9. ANIMACIONES DE NAVEGACIÓN (SCROLL SUAVE POR ANCLAS)
   ========================================================================== */
function initSmoothAnchorNavigation() {
    const navbar = qs('#navbar');

    qsa('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (event) => {
            const targetId = anchor.getAttribute('href');
            if (!targetId || targetId === '#') return;

            const target = qs(targetId);
            if (!target) return;

            event.preventDefault();

            const navbarHeight = navbar ? navbar.offsetHeight : 0;
            const targetPosition = target.getBoundingClientRect().top + window.scrollY - navbarHeight;

            window.scrollTo({ top: targetPosition, behavior: 'smooth' });

            // Actualiza el hash de la URL sin provocar un salto brusco adicional.
            window.setTimeout(() => {
                history.pushState(null, '', targetId);
            }, 400);
        });
    });
}

/* ==========================================================================
   10. INICIALIZACIÓN GENERAL
   ========================================================================== */
function initMain() {
    initLoader();
    initNavbarScrollStyle();
    initHamburgerMenu();
    initScrollSpy();
    initTabs();
    initBackToTop();
    initResponsiveMode();
    initSmoothAnchorNavigation();
}

document.addEventListener('DOMContentLoaded', initMain);
