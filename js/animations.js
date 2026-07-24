/* ==========================================================================
   TORNEO ESCOLAR DE CARROS ROBOTS — animations.js
   JavaScript ES6 Vanilla, modular, sin librerías externas.
   Optimizado con requestAnimationFrame para animaciones ligadas a scroll
   y a movimiento del cursor.
   Módulos incluidos:
     1. Utilidades compartidas
     2. Intersection Observer + Scroll Reveal (fade / slide)
     3. Auto-etiquetado de elementos a revelar
     4. Parallax suave (hero / fondo aurora)
     5. Progress Bar de scroll
     6. Cursor elegante
     7. Partículas suaves (canvas)
     8. Microinteracciones (botones y cards)
     9. Inicialización general
   ========================================================================== */

/* ==========================================================================
   1. UTILIDADES COMPARTIDAS
   ========================================================================== */
function qs(selector, context = document) {
    return context.querySelector(selector);
}

function qsa(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

/** Detecta si el usuario prefiere movimiento reducido (accesibilidad). */
function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Detecta dispositivos táctiles, donde el cursor personalizado no aplica. */
function isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Interpolación lineal, usada para suavizar el seguimiento del cursor
 * y del efecto parallax cuadro a cuadro.
 * @param {number} start
 * @param {number} end
 * @param {number} amount - Factor de suavizado entre 0 y 1.
 */
function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

/* ==========================================================================
   2. INTERSECTION OBSERVER + SCROLL REVEAL (FADE / SLIDE)
   Observa elementos marcados con la clase ".reveal" (definida en
   animations.css) y añade ".is-visible" cuando entran en el viewport.
   ========================================================================== */
function initScrollReveal() {
    const revealItems = qsa('.reveal');
    if (!revealItems.length) return;

    // Si el usuario prefiere menos movimiento, se muestran directamente.
    if (prefersReducedMotion()) {
        revealItems.forEach((item) => item.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver(
        (entries, obs) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    // Una vez revelado, se deja de observar para liberar recursos.
                    obs.unobserve(entry.target);
                }
            });
        },
        {
            threshold: 0.15,
            rootMargin: '0px 0px -8% 0px',
        }
    );

    revealItems.forEach((item) => observer.observe(item));
}

/* ==========================================================================
   3. AUTO-ETIQUETADO DE ELEMENTOS A REVELAR
   Asigna automáticamente las clases "reveal" a bloques clave del sitio
   que en el HTML no las traen explícitas, para no depender de marcado
   adicional en index.html.
   ========================================================================== */
function autoTagRevealElements() {
    const targets = [
        { selector: '.info-card', variant: 'reveal' },
        { selector: '.upcoming-card', variant: 'reveal' },
        { selector: '.tab-panel__content', variant: 'reveal--scale' },
        { selector: '.model-viewer', variant: 'reveal--scale' },
        { selector: '.contact-form', variant: 'reveal' },
        { selector: '.contact-section__info', variant: 'reveal' },
    ];

    targets.forEach(({ selector, variant }) => {
        qsa(selector).forEach((element, index) => {
            element.classList.add('reveal', variant);
            // Retraso escalonado reutilizando las clases ya definidas en animations.css.
            const delayClass = `reveal--delay-${(index % 4) + 1}`;
            element.classList.add(delayClass);
        });
    });
}

/* ==========================================================================
   4. PARALLAX SUAVE (HERO / FONDO AURORA)
   Desplaza el fondo del hero a una velocidad distinta a la del scroll
   para dar sensación de profundidad, usando requestAnimationFrame.
   ========================================================================== */
function initParallax() {
    const hero = qs('.hero');
    if (!hero || prefersReducedMotion()) return;

    const PARALLAX_FACTOR = 0.35;
    let latestScrollY = window.scrollY;
    let ticking = false;

    const applyParallax = () => {
        // Solo se traslada el fondo, nunca el contenido de texto (accesibilidad y legibilidad).
        const offset = latestScrollY * PARALLAX_FACTOR;
        hero.style.backgroundPosition = `center ${offset * -1}px`;
        ticking = false;
    };

    window.addEventListener(
        'scroll',
        () => {
            latestScrollY = window.scrollY;
            if (!ticking) {
                window.requestAnimationFrame(applyParallax);
                ticking = true;
            }
        },
        { passive: true }
    );
}

/* ==========================================================================
   5. PROGRESS BAR DE SCROLL
   Barra fija en la parte superior que indica el avance de lectura.
   ========================================================================== */
function initScrollProgressBar() {
    const bar = document.createElement('div');
    bar.id = 'scrollProgressBar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Progreso de lectura de la página');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');

    Object.assign(bar.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        height: '3px',
        width: '0%',
        background: 'linear-gradient(135deg, #0a84ff, #bf5af2)',
        zIndex: '200',
        transition: 'width 120ms linear',
    });

    document.body.appendChild(bar);

    let ticking = false;

    const updateProgress = () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

        bar.style.width = `${progress}%`;
        bar.setAttribute('aria-valuenow', String(Math.round(progress)));
        ticking = false;
    };

    window.addEventListener(
        'scroll',
        () => {
            if (!ticking) {
                window.requestAnimationFrame(updateProgress);
                ticking = true;
            }
        },
        { passive: true }
    );

    updateProgress();
}

/* ==========================================================================
   6. CURSOR ELEGANTE
   Cursor personalizado con seguimiento suavizado (lerp) y reacción al
   pasar sobre elementos interactivos. Se omite en dispositivos táctiles.
   ========================================================================== */
function initElegantCursor() {
    if (isTouchDevice() || prefersReducedMotion()) return;

    const cursor = document.createElement('div');
    cursor.id = 'elegantCursor';
    Object.assign(cursor.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        border: '1.5px solid rgba(245,245,247,0.8)',
        pointerEvents: 'none',
        zIndex: '300',
        transform: 'translate3d(-50%, -50%, 0)',
        transition: 'width 200ms ease, height 200ms ease, background 200ms ease, opacity 200ms ease',
        mixBlendMode: 'difference',
        opacity: '0',
    });

    document.body.appendChild(cursor);

    let mouseX = 0;
    let mouseY = 0;
    let cursorX = 0;
    let cursorY = 0;
    const EASE_AMOUNT = 0.18;

    const showCursor = () => {
        cursor.style.opacity = '1';
    };

    window.addEventListener('mousemove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
        showCursor();
    });

    // Interactuar con links, botones y cards agranda el cursor (microinteracción).
    const interactiveSelectors = 'a, button, .info-card, .upcoming-card, .tabs__button';
    document.addEventListener('mouseover', (event) => {
        if (event.target.closest(interactiveSelectors)) {
            cursor.style.width = '38px';
            cursor.style.height = '38px';
            cursor.style.background = 'rgba(245,245,247,0.15)';
        }
    });

    document.addEventListener('mouseout', (event) => {
        if (event.target.closest(interactiveSelectors)) {
            cursor.style.width = '18px';
            cursor.style.height = '18px';
            cursor.style.background = 'transparent';
        }
    });

    document.addEventListener('mouseleave', () => {
        cursor.style.opacity = '0';
    });

    const renderCursor = () => {
        cursorX = lerp(cursorX, mouseX, EASE_AMOUNT);
        cursorY = lerp(cursorY, mouseY, EASE_AMOUNT);
        cursor.style.left = `${cursorX}px`;
        cursor.style.top = `${cursorY}px`;
        window.requestAnimationFrame(renderCursor);
    };

    window.requestAnimationFrame(renderCursor);
}

/* ==========================================================================
   7. PARTÍCULAS SUAVES (CANVAS)
   Capa decorativa y ambiental dentro del hero, con partículas flotantes
   de bajo contraste que refuerzan el estilo "Liquid Glass".
   ========================================================================== */
function initSoftParticles() {
    const hero = qs('.hero');
    if (!hero || prefersReducedMotion()) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'heroParticles';
    Object.assign(canvas.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '1',
        pointerEvents: 'none',
    });

    // Se inserta detrás del contenido textual del hero (que usa z-index: 2).
    hero.style.position = hero.style.position || 'relative';
    hero.prepend(canvas);

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let particles = [];

    const PARTICLE_COUNT = 42;

    const resizeCanvas = () => {
        width = canvas.width = hero.offsetWidth;
        height = canvas.height = hero.offsetHeight;
    };

    const createParticles = () => {
        particles = Array.from({ length: PARTICLE_COUNT }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() * 1.6 + 0.4,
            speedY: Math.random() * 0.25 + 0.05,
            drift: Math.random() * 0.4 - 0.2,
            opacity: Math.random() * 0.35 + 0.05,
        }));
    };

    const drawParticles = () => {
        ctx.clearRect(0, 0, width, height);

        particles.forEach((particle) => {
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(245, 245, 247, ${particle.opacity})`;
            ctx.fill();

            // Movimiento ascendente lento, simulando polvo de luz flotante.
            particle.y -= particle.speedY;
            particle.x += particle.drift;

            if (particle.y < -4) {
                particle.y = height + 4;
                particle.x = Math.random() * width;
            }
        });

        window.requestAnimationFrame(drawParticles);
    };

    resizeCanvas();
    createParticles();
    window.requestAnimationFrame(drawParticles);

    window.addEventListener(
        'resize',
        () => {
            resizeCanvas();
            createParticles();
        },
        { passive: true }
    );
}

/* ==========================================================================
   8. MICROINTERACCIONES (BOTONES Y CARDS)
   Efecto de "magnetismo" e inclinación suave en botones y tarjetas al
   pasar el cursor, calculado y aplicado dentro de requestAnimationFrame.
   ========================================================================== */
function initMicroInteractions() {
    if (isTouchDevice() || prefersReducedMotion()) return;

    const magneticTargets = qsa('.btn');
    const tiltTargets = qsa('.info-card, .upcoming-card');

    // --- Efecto magnético en botones ---
    magneticTargets.forEach((button) => {
        let targetX = 0;
        let targetY = 0;
        let currentX = 0;
        let currentY = 0;
        let frameRequested = false;

        const render = () => {
            currentX = lerp(currentX, targetX, 0.2);
            currentY = lerp(currentY, targetY, 0.2);
            button.style.transform = `translate(${currentX}px, ${currentY}px)`;
            frameRequested = false;
        };

        button.addEventListener('mousemove', (event) => {
            const rect = button.getBoundingClientRect();
            targetX = (event.clientX - rect.left - rect.width / 2) * 0.25;
            targetY = (event.clientY - rect.top - rect.height / 2) * 0.25;

            if (!frameRequested) {
                window.requestAnimationFrame(render);
                frameRequested = true;
            }
        });

        button.addEventListener('mouseleave', () => {
            targetX = 0;
            targetY = 0;
            window.requestAnimationFrame(render);
        });
    });

    // --- Efecto de inclinación (tilt) suave en cards de cristal ---
    tiltTargets.forEach((card) => {
        let frameRequested = false;
        let rotateX = 0;
        let rotateY = 0;

        const applyTilt = () => {
            card.style.transform = `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
            frameRequested = false;
        };

        card.addEventListener('mousemove', (event) => {
            const rect = card.getBoundingClientRect();
            const relX = (event.clientX - rect.left) / rect.width - 0.5;
            const relY = (event.clientY - rect.top) / rect.height - 0.5;

            rotateY = relX * 6;
            rotateX = relY * -6;

            if (!frameRequested) {
                window.requestAnimationFrame(applyTilt);
                frameRequested = true;
            }
        });

        card.addEventListener('mouseleave', () => {
            rotateX = 0;
            rotateY = 0;
            card.style.transform = '';
        });
    });
}

/* ==========================================================================
   9. INICIALIZACIÓN GENERAL
   ========================================================================== */
function initAnimations() {
    autoTagRevealElements();
    initScrollReveal();
    initParallax();
    initScrollProgressBar();
    initElegantCursor();
    initSoftParticles();
    initMicroInteractions();
}

document.addEventListener('DOMContentLoaded', initAnimations);
