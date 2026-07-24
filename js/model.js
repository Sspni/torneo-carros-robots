/* ==========================================================================
   TORNEO ESCOLAR DE CARROS ROBOTS — model.js
   Control del visor 3D (<model-viewer>) del carro robot.
   JavaScript ES6 Vanilla, modular, sin librerías externas.
   Módulos incluidos:
     1. Configuración y constantes
     2. Utilidades compartidas
     3. Lazy Loading del modelo (carga optimizada)
     4. Auto Rotate inteligente (pausa fuera de viewport)
     5. Float Animation (flotación ambiental)
     6. Rotación según scroll
     7. Parallax del visor
     8. Ocultar controles visibles / UI nativa de model-viewer
     9. Inicialización general
   ========================================================================== */

/* ==========================================================================
   1. CONFIGURACIÓN Y CONSTANTES
   ========================================================================== */
const MODEL_CONFIG = {
    SELECTOR: '#robotModel',

    // Ángulo base y sensibilidad de la rotación controlada por scroll.
    SCROLL_ROTATION_BASE_DEG: 0,
    SCROLL_ROTATION_RANGE_DEG: 140,

    // Amplitud y velocidad de la flotación ambiental (efecto "float").
    FLOAT_AMPLITUDE_PX: 10,
    FLOAT_SPEED: 0.0016,

    // Factor de desplazamiento del parallax del visor respecto al scroll.
    PARALLAX_FACTOR: 0.12,

    // Margen usado por el IntersectionObserver para lazy loading.
    LAZY_LOAD_ROOT_MARGIN: '200px 0px',
};

/* ==========================================================================
   2. UTILIDADES COMPARTIDAS
   ========================================================================== */
function qs(selector, context = document) {
    return context.querySelector(selector);
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ==========================================================================
   3. LAZY LOADING DEL MODELO (CARGA OPTIMIZADA)
   El atributo "src" del <model-viewer> se retira temporalmente y solo se
   restaura cuando la sección entra en el viewport, evitando descargar el
   archivo .glb/.usdz si el usuario nunca llega a esa parte de la página.
   ========================================================================== */
function initLazyLoading(modelViewer) {
    if (!modelViewer) return;

    const originalSrc = modelViewer.getAttribute('src');
    const originalIosSrc = modelViewer.getAttribute('ios-src');

    // Se retiran las fuentes hasta que el visor sea visible.
    modelViewer.removeAttribute('src');
    modelViewer.removeAttribute('ios-src');

    // Atributo nativo adicional de <model-viewer> para diferir la carga.
    modelViewer.setAttribute('loading', 'lazy');
    modelViewer.setAttribute('reveal', 'auto');

    const observer = new IntersectionObserver(
        (entries, obs) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    if (originalSrc) modelViewer.setAttribute('src', originalSrc);
                    if (originalIosSrc) modelViewer.setAttribute('ios-src', originalIosSrc);
                    obs.disconnect();
                }
            });
        },
        { rootMargin: MODEL_CONFIG.LAZY_LOAD_ROOT_MARGIN }
    );

    observer.observe(modelViewer);
}

/* ==========================================================================
   4. AUTO ROTATE INTELIGENTE
   El modelo gira automáticamente (atributo nativo "auto-rotate"), pero se
   pausa cuando el visor sale del viewport o la pestaña pierde el foco,
   ahorrando GPU/batería del dispositivo del usuario.
   ========================================================================== */
function initSmartAutoRotate(modelViewer) {
    if (!modelViewer) return;

    modelViewer.setAttribute('auto-rotate', '');
    modelViewer.setAttribute('auto-rotate-delay', '0');

    const pauseRotation = () => modelViewer.removeAttribute('auto-rotate');
    const resumeRotation = () => modelViewer.setAttribute('auto-rotate', '');

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    resumeRotation();
                } else {
                    pauseRotation();
                }
            });
        },
        { threshold: 0.05 }
    );

    observer.observe(modelViewer);

    // Pausa adicional si el usuario cambia de pestaña o minimiza la ventana.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseRotation();
        } else if (modelViewer.getBoundingClientRect().top < window.innerHeight) {
            resumeRotation();
        }
    });
}

/* ==========================================================================
   5. FLOAT ANIMATION (FLOTACIÓN AMBIENTAL)
   Aplica un desplazamiento vertical suave tipo "flotación" al contenedor
   del visor, calculado con requestAnimationFrame para máximo rendimiento.
   ========================================================================== */
function initFloatAnimation(modelViewer) {
    if (!modelViewer || prefersReducedMotion()) return;

    let startTime = null;

    const animateFloat = (timestamp) => {
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;

        const offsetY = Math.sin(elapsed * MODEL_CONFIG.FLOAT_SPEED) * MODEL_CONFIG.FLOAT_AMPLITUDE_PX;
        modelViewer.style.setProperty('--model-float-offset', `${offsetY}px`);
        modelViewer.style.transform = `translateY(${offsetY}px)`;

        window.requestAnimationFrame(animateFloat);
    };

    window.requestAnimationFrame(animateFloat);
}

/* ==========================================================================
   6. ROTACIÓN SEGÚN SCROLL
   El ángulo horizontal de la cámara (theta) cambia progresivamente según
   qué tanto ha avanzado la sección del modelo dentro del viewport.
   ========================================================================== */
function initScrollRotation(modelViewer) {
    if (!modelViewer || prefersReducedMotion()) return;

    const section = modelViewer.closest('.model-section') || modelViewer.parentElement;
    let ticking = false;

    /**
     * Calcula el progreso (0 a 1) de la sección respecto al viewport.
     * 0 = la sección apenas entra por abajo, 1 = ya salió por arriba.
     */
    const getSectionProgress = () => {
        const rect = section.getBoundingClientRect();
        const total = rect.height + window.innerHeight;
        const scrolled = window.innerHeight - rect.top;
        return Math.min(Math.max(scrolled / total, 0), 1);
    };

    const updateCameraOrbit = () => {
        const progress = getSectionProgress();
        const theta = MODEL_CONFIG.SCROLL_ROTATION_BASE_DEG + progress * MODEL_CONFIG.SCROLL_ROTATION_RANGE_DEG;

        // Se conserva el radio y la inclinación (phi) por defecto de model-viewer.
        modelViewer.cameraOrbit = `${theta}deg 75deg auto`;
        ticking = false;
    };

    window.addEventListener(
        'scroll',
        () => {
            if (!ticking) {
                window.requestAnimationFrame(updateCameraOrbit);
                ticking = true;
            }
        },
        { passive: true }
    );

    updateCameraOrbit();
}

/* ==========================================================================
   7. PARALLAX DEL VISOR
   Desplaza ligeramente el visor en sentido vertical respecto a la
   velocidad normal de scroll, reforzando la sensación de profundidad.
   ========================================================================== */
function initModelParallax(modelViewer) {
    if (!modelViewer || prefersReducedMotion()) return;

    const wrapper = modelViewer.parentElement;
    let ticking = false;

    const applyParallax = () => {
        const rect = wrapper.getBoundingClientRect();
        const distanceFromCenter = rect.top + rect.height / 2 - window.innerHeight / 2;
        const parallaxOffset = distanceFromCenter * MODEL_CONFIG.PARALLAX_FACTOR * -1;

        wrapper.style.transform = `translateY(${parallaxOffset}px)`;
        ticking = false;
    };

    window.addEventListener(
        'scroll',
        () => {
            if (!ticking) {
                window.requestAnimationFrame(applyParallax);
                ticking = true;
            }
        },
        { passive: true }
    );

    applyParallax();
}

/* ==========================================================================
   8. OCULTAR CONTROLES VISIBLES / UI NATIVA DE MODEL-VIEWER
   Se conserva la interacción por arrastre (camera-controls), pero se
   eliminan los indicadores visuales nativos: barra de progreso, ícono de
   "interaction-prompt" y el resaltado por defecto al enfocar el visor.
   ========================================================================== */
function hideNativeControls(modelViewer) {
    if (!modelViewer) return;

    modelViewer.setAttribute('interaction-prompt', 'none');
    modelViewer.setAttribute('disable-zoom', '');
    modelViewer.removeAttribute('interaction-prompt-style');

    // Variables CSS nativas de model-viewer, ajustadas desde JS para no tocar los .css.
    modelViewer.style.setProperty('--progress-bar-height', '0px');
    modelViewer.style.setProperty('--progress-bar-color', 'transparent');
    modelViewer.style.setProperty('--poster-color', 'transparent');
    modelViewer.style.outline = 'none';
}

/* ==========================================================================
   9. INICIALIZACIÓN GENERAL
   ========================================================================== */
function initModelViewer() {
    const modelViewer = qs(MODEL_CONFIG.SELECTOR);
    if (!modelViewer) return;

    initLazyLoading(modelViewer);
    initSmartAutoRotate(modelViewer);
    hideNativeControls(modelViewer);

    // Espera a que el componente web esté listo antes de animar cámara/transform.
    modelViewer.addEventListener(
        'load',
        () => {
            initFloatAnimation(modelViewer);
            initScrollRotation(modelViewer);
            initModelParallax(modelViewer);
        },
        { once: true }
    );
}

document.addEventListener('DOMContentLoaded', initModelViewer);
