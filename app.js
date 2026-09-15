/**
 * app.js - Puente entre la interfaz "Mi Kilometraje" y el motor GPS/Storage
 * Variante A: Formulario manual es la estrella, GPS es apoyo opcional.
 */

// ============================================================
// 1. GESTOR DE NOTIFICACIONES (reemplaza al antiguo notifications.js)
// ============================================================
class NotificationManager {
    constructor() {
        this.container = document.getElementById('notifications');
        if (!this.container) {
            this.createContainer();
        }
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'notifications';
        this.container.className = 'notifications-container';
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 4000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        this.container.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, duration);

        notification.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    success(msg) { this.show(msg, 'success'); }
    error(msg)   { this.show(msg, 'error', 6000); }
    warning(msg) { this.show(msg, 'warning', 5000); }
}

// ============================================================
// 2. APLICACIÓN PRINCIPAL
// ============================================================
class MiKilometrajeApp {
    constructor() {
        this.notifications = new NotificationManager();
        this.gpsReady = false;
        this.init();
    }

    async init() {
        console.log('🚗 Mi Kilometraje: inicializando...');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    async setup() {
        try {
            // 0. Auto-filtrado del historial al cambiar selects
            this.setupFiltrosAuto();

            // 1. Fecha actual en el encabezado
            this.mostrarFechaActual();

            // 2. Fecha por defecto en el formulario
            this.setFechaPorDefecto();

            // 3. Pestañas
            this.setupTabs();

            // 4. Formulario de registro
            this.setupFormulario();

            // 5. Botón GPS
            this.setupBotonGPS();

            // 5.b Modal de ajustes
            this.setupAjustes();

            // 6. Cargar datos guardados

            // 6. Cargar datos guardados
            await this.cargarUltimoViaje();
            await this.cargarMesesDisponibles();
            await this.cargarHistorial();
            await this.cargarMesesDisponiblesStats();
            await this.cargarEstadisticas();

            console.log('✅ Mi Kilometraje listo');
            this.notifications.success('Aplicación lista');

        } catch (error) {
            console.error('❌ Error inicializando la app:', error);
            this.notifications.error('Error al iniciar: ' + error.message);
        }
    }

    // ---------- Utilidades básicas ----------
    mostrarFechaActual() {
        const el = document.getElementById('fechaActual');
        if (!el) return;
        const hoy = new Date();
        const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        el.textContent = hoy.toLocaleDateString('es-ES', opciones);
    }

    setFechaPorDefecto() {
        const input = document.getElementById('fecha');
        if (!input) return;
        const hoy = new Date();
        const yyyy = hoy.getFullYear();
        const mm = String(hoy.getMonth() + 1).padStart(2, '0');
        const dd = String(hoy.getDate()).padStart(2, '0');
        input.value = `${yyyy}-${mm}-${dd}`;
    }

    // ---------- Pestañas ----------
    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        const content = document.getElementById(tabName);

        if (btn) btn.classList.add('active');
        if (content) content.classList.add('active');

        // Refrescar datos al cambiar de pestaña
        if (tabName === 'historial') {
            (async () => {
                await this.cargarMesesDisponibles();
                const filtroMes = document.getElementById('filtroMes');
                const filtroCat = document.getElementById('filtroCategoria');
                this.cargarHistorial(
                    filtroMes ? filtroMes.value : null,
                    filtroCat ? filtroCat.value : null
                );
            })();
        }
        if (tabName === 'lugares') this.cargarLugares();
        if (tabName === 'estadisticas') {
            (async () => {
                await this.cargarMesesDisponiblesStats();
                const sel = document.getElementById('statsMes');
                this.cargarEstadisticas(sel ? sel.value : null);
            })();
        }
    }

    // ---------- Formulario ----------
    setupFormulario() {
        const form = document.getElementById('formViaje');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.guardarViaje();
        });
    }

    async guardarViaje() {
        // Leer valores
        const fecha = document.getElementById('fecha').value;
        const hodoInicial = parseFloat(document.getElementById('hodometroInicial').value);
        const hodoFinal = parseFloat(document.getElementById('hodometroFinal').value);
        const lugar = document.getElementById('lugar').value.trim();
        const proposito = document.getElementById('proposito').value;

        // Validaciones
        if (!fecha) {
            this.notifications.error('Falta la fecha');
            return;
        }
        if (isNaN(hodoInicial) || isNaN(hodoFinal)) {
            this.notifications.error('Los hodómetros deben ser números');
            return;
        }
        if (hodoFinal < hodoInicial) {
            this.notifications.error('El hodómetro final no puede ser menor al inicial');
            return;
        }
        if (!lugar) {
            this.notifications.error('Falta el lugar de destino');
            return;
        }

        const distanciaKm = hodoFinal - hodoInicial;

        // Estructura del viaje
        const viaje = {
            id: Date.now().toString(),
            type: 'manual',        // para distinguir de sesiones GPS
            fecha: fecha,          // "YYYY-MM-DD"
            startTime: new Date(fecha + 'T12:00:00').getTime(), // para filtros mensuales
            timestamp: Date.now(),
            hodometroInicial: hodoInicial,
            hodometroFinal: hodoFinal,
            distance: distanciaKm * 1000, // guardamos en metros (consistente con GPS)
            distanciaKm: distanciaKm,
            lugar: lugar,
            proposito: proposito || 'otro',
            notas: ''
        };

        // Guardar usando data-storage (saveSession)
        try {
            if (!window.dataStorage) {
                throw new Error('dataStorage no disponible');
            }
            await window.dataStorage.saveSession(viaje);
            this.notifications.success(`Viaje guardado: ${distanciaKm.toFixed(1)} km`);

            // Limpiar formulario
            document.getElementById('hodometroInicial').value = '';
            document.getElementById('hodometroFinal').value = '';
            document.getElementById('lugar').value = '';
            document.getElementById('proposito').value = '';

            // Refrescar vistas
            await this.cargarUltimoViaje();
            await this.cargarMesesDisponibles();
            await this.cargarHistorial();
            await this.cargarMesesDisponiblesStats();
            await this.cargarEstadisticas();

        } catch (error) {
            console.error('Error guardando viaje:', error);
            this.notifications.error('No se pudo guardar: ' + error.message);
        }
    }

    // ---------- Botón GPS ----------
    setupBotonGPS() {
        const btn = document.getElementById('btn-usar-gps');
        const status = document.getElementById('gps-status');
        if (!btn || !status) return;

        if (!window.gpsTracker) {
            status.textContent = 'GPS: no disponible';
            status.className = 'gps-status error';
            return;
        }

        // Habilitar botón (el GPS ya está cargado)
        btn.disabled = false;
        status.textContent = 'GPS: listo';
        status.className = 'gps-status ok';

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            status.textContent = 'GPS: obteniendo ubicación...';
            status.className = 'gps-status';

            try {
                const position = await window.gpsTracker.getCurrentLocation();
                const lat = position.coords.latitude.toFixed(6);
                const lng = position.coords.longitude.toFixed(6);

                const lugarInput = document.getElementById('lugar');
                if (lugarInput) {
                    // No sobreescribir si ya hay texto
                    if (!lugarInput.value.trim()) {
                        lugarInput.value = `Ubicación GPS (${lat}, ${lng})`;
                    }
                }

                // Guardar coordenadas en un atributo temporal para el submit
                if (lugarInput) {
                    lugarInput.dataset.lat = lat;
                    lugarInput.dataset.lng = lng;
                }

                status.textContent = `GPS: ${lat}, ${lng}`;
                status.className = 'gps-status ok';
                this.notifications.success('Ubicación GPS obtenida');

            } catch (error) {
                console.error('Error GPS:', error);
                status.textContent = 'GPS: error al obtener ubicación';
                status.className = 'gps-status error';
                this.notifications.error('No se pudo obtener la ubicación');
            } finally {
                btn.disabled = false;
            }
        });
    }

    // ---------- Cargar último viaje ----------
    async cargarUltimoViaje() {
        const contenedor = document.getElementById('ultimoViaje');
        if (!contenedor || !window.dataStorage) return;

        try {
            const sesiones = await window.dataStorage.getAllSessions();
            if (!sesiones || sesiones.length === 0) {
                contenedor.innerHTML = '';
                return;
            }
            // Ordenar por timestamp descendente
            sesiones.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const ultimo = sesiones[0];

            contenedor.innerHTML = `
                <h4>Último viaje registrado</h4>
                <p><strong>${ultimo.lugar || 'Sin lugar'}</strong></p>
                <p class="fecha">${this.formatearFecha(ultimo.fecha || ultimo.startTime)}</p>
                <p class="kilometros">${((ultimo.distance || 0) / 1000).toFixed(2)} km</p>
            `;
        } catch (error) {
            console.error('Error cargando último viaje:', error);
        }
    }

        // ---------- Auto-filtro al cambiar los selects ----------
    setupFiltrosAuto() {
        const filtroMes = document.getElementById('filtroMes');
        const filtroCat = document.getElementById('filtroCategoria');

        const aplicar = () => {
            const mes = filtroMes ? filtroMes.value : null;
            const cat = filtroCat ? filtroCat.value : null;
            this.cargarHistorial(mes || null, cat || null);
        };

        if (filtroMes) filtroMes.addEventListener('change', aplicar);
        if (filtroCat) filtroCat.addEventListener('change', aplicar);

        // Selector de mes de estadísticas
        const statsMes = document.getElementById('statsMes');
        if (statsMes) {
            statsMes.addEventListener('change', (e) => {
                this.cargarEstadisticas(e.target.value || null);
            });
        }
    }



        // ---------- Cargar meses disponibles en el filtro ----------
    async cargarMesesDisponibles() {
        const select = document.getElementById('filtroMes');
        if (!select || !window.dataStorage) return;

        try {
            const sesiones = await window.dataStorage.getAllSessions() || [];

            // Agrupar por año-mes
            const meses = new Set();
            sesiones.forEach(s => {
                const fecha = s.fecha || (s.startTime ? new Date(s.startTime).toISOString().split('T')[0] : null);
                if (fecha && fecha.length >= 7) {
                    meses.add(fecha.substring(0, 7)); // "YYYY-MM"
                }
            });
        
    
            // Ordenar descendente (más reciente primero)
            const mesesOrdenados = Array.from(meses).sort().reverse();

            // Nombres de meses en español
            const nombresMeses = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            // Preservar selección actual
            const seleccionActual = select.value;

            // Reconstruir opciones
            select.innerHTML = '<option value="">Todos los meses</option>' +
                mesesOrdenados.map(ym => {
                    const [year, month] = ym.split('-');
                    const nombreMes = nombresMeses[parseInt(month, 10) - 1];
                    return `<option value="${ym}">${nombreMes} ${year}</option>`;
                }).join('');

            // Restaurar selección si sigue existiendo
            if (seleccionActual && mesesOrdenados.includes(seleccionActual)) {
                select.value = seleccionActual;
            }

        } catch (error) {
            console.error('Error cargando meses disponibles:', error);
        }
    }


        // ---------- Historial ----------
    async cargarHistorial(filtroMes = null, filtroCategoria = null) {
        const contenedor = document.getElementById('listaViajes');
        const resumen = document.getElementById('resumenFiltro');
        if (!contenedor || !window.dataStorage) return;

        try {
            let sesiones = await window.dataStorage.getAllSessions();
            if (!sesiones) sesiones = [];

            // Ordenar por timestamp descendente
            sesiones.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            // --- Mapa de categorías por lugar ---
            const placesGuardados = await window.dataStorage.getPlaces() || [];
            const mapaCategorias = {};
            placesGuardados.forEach(p => {
                if (p.name) mapaCategorias[p.name] = p.category;
            });

            const categoriaDe = (viaje) => {
                const nombre = (viaje.lugar || 'Sin lugar').trim();
                return mapaCategorias[nombre] || '';
            };

            // --- Filtro por mes ---
            let filtroActivo = false;
            let descripcionFiltro = [];

            if (filtroMes) {
                const [year, month] = filtroMes.split('-').map(Number);
                sesiones = sesiones.filter(s => {
                    const fecha = s.fecha || new Date(s.startTime).toISOString().split('T')[0];
                    const [y, m] = fecha.split('-').map(Number);
                    return y === year && m === month;
                });
                filtroActivo = true;
                descripcionFiltro.push(`Mes: <strong>${filtroMes}</strong>`);
            }

            // --- Filtro por categoría ---
            if (filtroCategoria) {
                sesiones = sesiones.filter(s => categoriaDe(s) === filtroCategoria);
                filtroActivo = true;
                const nombreCat = {
                    casa: '🏠 Casa',
                    trabajo: '💼 Trabajo',
                    salud: '🏥 Salud',
                    personal: '👤 Personal',
                    otros: '📦 Otros'
                }[filtroCategoria] || filtroCategoria;
                descripcionFiltro.push(`Categoría: <strong>${nombreCat}</strong>`);
            }

            // --- Resumen ---
            if (resumen) {
                if (filtroActivo) {
                    const kmTotal = sesiones.reduce((sum, s) => sum + ((s.distance || 0) / 1000), 0);
                    resumen.innerHTML = `${descripcionFiltro.join(' · ')} — ${sesiones.length} viaje${sesiones.length !== 1 ? 's' : ''}, <strong>${kmTotal.toFixed(1)} km</strong>`;
                    resumen.classList.add('visible');
                } else {
                    resumen.classList.remove('visible');
                    resumen.innerHTML = '';
                }
            }

            // --- Render ---
            if (sesiones.length === 0) {
                contenedor.innerHTML = '<p style="text-align:center;color:#999;">No hay viajes con esos filtros</p>';
                return;
            }

            contenedor.innerHTML = sesiones.map(s => {
                const cat = categoriaDe(s);
                const badgeCat = cat ? `<span class="badge cat-${cat}">${cat}</span>` : '';
                const badgeProp = s.proposito ? `<span class="badge proposito">${s.proposito}</span>` : '';

                return `
                    <div class="viaje-item">
                        <div class="viaje-header">
                            <span class="fecha">${this.formatearFecha(s.fecha || s.startTime)}</span>
                            ${badgeCat}
                        </div>
                        <div class="lugar">${this.escaparHTML(s.lugar || 'Sin lugar')}</div>
                        <div class="viaje-footer">
                            ${badgeProp}
                            <span class="kilometros">${((s.distance || 0) / 1000).toFixed(2)} km</span>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Error cargando historial:', error);
            contenedor.innerHTML = '<p style="color:red;">Error al cargar historial</p>';
        }
    }

        // ---------- Estadísticas ----------
    async cargarEstadisticas(mesSeleccionado = null) {
        if (!window.dataStorage) return;

        try {
            const sesiones = await window.dataStorage.getAllSessions() || [];
            const placesGuardados = await window.dataStorage.getPlaces() || [];
            const mapaCategorias = {};
            placesGuardados.forEach(p => {
                if (p.name) mapaCategorias[p.name] = p.category;
            });

            const categoriaDe = (viaje) => {
                const nombre = (viaje.lugar || 'Sin lugar').trim();
                return mapaCategorias[nombre] || 'otros';
            };

            // --- Determinar el mes a consultar ---
            const ahora = new Date();
            let yearConsultado, mesConsultado, tituloMes;

            const nombresMeses = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            if (mesSeleccionado) {
                // Formato "YYYY-MM"
                const [y, m] = mesSeleccionado.split('-').map(Number);
                yearConsultado = y;
                mesConsultado = m - 1;
                tituloMes = `${nombresMeses[mesConsultado]} ${y}`;
            } else {
                yearConsultado = ahora.getFullYear();
                mesConsultado = ahora.getMonth();
                tituloMes = 'Este Mes';
            }

            // --- Filtrar sesiones del mes ---
            const sesionesMes = sesiones.filter(s => {
                const fecha = s.fecha || (s.startTime ? new Date(s.startTime).toISOString().split('T')[0] : null);
                if (!fecha) return false;
                const d = new Date(fecha + 'T12:00:00');
                return d.getFullYear() === yearConsultado && d.getMonth() === mesConsultado;
            });

            // --- Métricas del mes ---
            const kmMes = sesionesMes.reduce((sum, s) => sum + ((s.distance || 0) / 1000), 0);
            const numViajesMes = sesionesMes.length;
            const distanciaMedia = numViajesMes > 0 ? kmMes / numViajesMes : 0;

            // --- Métricas históricas ---
            const kmTotalHistorico = sesiones.reduce((sum, s) => sum + ((s.distance || 0) / 1000), 0);

            // --- Actualizar DOM ---
            const elTitulo = document.getElementById('statsTituloMes');
            const elKmMes = document.getElementById('kmMes');
            const elViajes = document.getElementById('totalViajes');
            const elMedia = document.getElementById('distanciaMedia');
            const elHistKm = document.getElementById('totalHistoricoKm');
            const elHistViajes = document.getElementById('totalHistoricoViajes');

            if (elTitulo) elTitulo.textContent = tituloMes;
            if (elKmMes) elKmMes.textContent = kmMes.toFixed(1) + ' km';
            if (elViajes) elViajes.textContent = numViajesMes;
            if (elMedia) elMedia.textContent = distanciaMedia.toFixed(1) + ' km';
            if (elHistKm) elHistKm.textContent = kmTotalHistorico.toFixed(1) + ' km';
            if (elHistViajes) elHistViajes.textContent = `${sesiones.length} viaje${sesiones.length !== 1 ? 's' : ''} en total`;

            // --- Desglose por categoría (solo del mes filtrado) ---
            const categorias = ['casa', 'trabajo', 'salud', 'personal', 'otros'];
            const etiquetas = {
                casa: '🏠 Casa',
                trabajo: '💼 Trabajo',
                salud: '🏥 Salud',
                personal: '👤 Personal',
                otros: '📦 Otros'
            };

            const kmPorCategoria = {};
            categorias.forEach(c => kmPorCategoria[c] = 0);

            sesionesMes.forEach(s => {
                const cat = categoriaDe(s);
                kmPorCategoria[cat] = (kmPorCategoria[cat] || 0) + ((s.distance || 0) / 1000);
            });

            const maxKm = Math.max(...Object.values(kmPorCategoria), 1);
            const contenedorCat = document.getElementById('statsCategorias');

            if (contenedorCat) {
                if (kmMes === 0) {
                    contenedorCat.innerHTML = '<p style="color:#999;text-align:center;">Sin datos aún</p>';
                } else {
                    contenedorCat.innerHTML = categorias
                        .filter(c => kmPorCategoria[c] > 0)
                        .sort((a, b) => kmPorCategoria[b] - kmPorCategoria[a])
                        .map(cat => {
                            const km = kmPorCategoria[cat];
                            const porcentaje = (km / maxKm) * 100;
                            return `
                                <div class="categoria-barra">
                                    <div class="categoria-barra-header">
                                        <span class="nombre">${etiquetas[cat]}</span>
                                        <span class="valor">${km.toFixed(1)} km</span>
                                    </div>
                                    <div class="categoria-barra-track">
                                        <div class="categoria-barra-fill cat-${cat}" style="width: ${porcentaje}%"></div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                }
            }

            // --- Lugares frecuentes (del mes filtrado) ---
            const contadorLugares = {};
            sesionesMes.forEach(s => {
                const key = (s.lugar || 'Sin lugar').trim();
                if (!contadorLugares[key]) {
                    contadorLugares[key] = { visitas: 0, categoria: categoriaDe(s) };
                }
                contadorLugares[key].visitas++;
            });

            const topLugares = Object.entries(contadorLugares)
                .sort((a, b) => b[1].visitas - a[1].visitas)
                .slice(0, 5);

            const elLugares = document.getElementById('lugaresFrecuentes');
            if (elLugares) {
                if (topLugares.length === 0) {
                    elLugares.innerHTML = '<p style="color:#999;text-align:center;">Sin datos aún</p>';
                } else {
                    elLugares.innerHTML = topLugares.map(([lugar, info]) => `
                        <div class="lugar-frecuente cat-${info.categoria}">
                            <span class="nombre">${this.escaparHTML(lugar)}</span>
                            <span class="visitas">${info.visitas} visita${info.visitas !== 1 ? 's' : ''}</span>
                        </div>
                    `).join('');
                }
            }

        } catch (error) {
            console.error('Error cargando estadísticas:', error);
        }
    }

    // ---------- Cargar meses disponibles en estadísticas ----------
    async cargarMesesDisponiblesStats() {
        const select = document.getElementById('statsMes');
        if (!select || !window.dataStorage) return;

        try {
            const sesiones = await window.dataStorage.getAllSessions() || [];
            const meses = new Set();

            sesiones.forEach(s => {
                const fecha = s.fecha || (s.startTime ? new Date(s.startTime).toISOString().split('T')[0] : null);
                if (fecha && fecha.length >= 7) {
                    meses.add(fecha.substring(0, 7));
                }
            });

            const mesesOrdenados = Array.from(meses).sort().reverse();
            const nombresMeses = [
                'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
            ];

            const seleccionActual = select.value;

            select.innerHTML = '<option value="">Mes actual</option>' +
                mesesOrdenados.map(ym => {
                    const [year, month] = ym.split('-');
                    const nombreMes = nombresMeses[parseInt(month, 10) - 1];
                    return `<option value="${ym}">${nombreMes} ${year}</option>`;
                }).join('');

            if (seleccionActual && mesesOrdenados.includes(seleccionActual)) {
                select.value = seleccionActual;
            }

        } catch (error) {
            console.error('Error cargando meses para stats:', error);
        }
    }

        // ---------- Lugares y categorías ----------
    async cargarLugares() {
        const contenedor = document.getElementById('listaLugares');
        if (!contenedor || !window.dataStorage) return;

        try {
            // 1. Obtener todos los viajes
            const sesiones = await window.dataStorage.getAllSessions() || [];

            if (sesiones.length === 0) {
                contenedor.innerHTML = '<p style="text-align:center;color:#999;">Aún no hay lugares. Registra un viaje primero.</p>';
                return;
            }

            // 2. Agrupar por nombre de lugar
            const agrupados = {};
            sesiones.forEach(s => {
                const nombre = (s.lugar || 'Sin lugar').trim();
                if (!agrupados[nombre]) {
                    agrupados[nombre] = { nombre, visitas: 0 };
                }
                agrupados[nombre].visitas++;
            });

            // 3. Obtener categorías guardadas desde store "places"
            const placesGuardados = await window.dataStorage.getPlaces() || [];
            const mapaCategorias = {};
            placesGuardados.forEach(p => {
                if (p.name) mapaCategorias[p.name] = p;
            });

            // 4. Ordenar por número de visitas descendente
            const lista = Object.values(agrupados).sort((a, b) => b.visitas - a.visitas);

            // 5. Renderizar
            const categorias = [
                { value: '', label: '— Sin categoría —' },
                { value: 'casa', label: '🏠 Casa' },
                { value: 'trabajo', label: '💼 Trabajo' },
                { value: 'salud', label: '🏥 Salud' },
                { value: 'personal', label: '👤 Personal' },
                { value: 'otros', label: '📦 Otros' }
            ];

            contenedor.innerHTML = lista.map(lugar => {
                const guardado = mapaCategorias[lugar.nombre];
                const categoriaActual = guardado ? guardado.category : '';
                const claseCategoria = categoriaActual ? `cat-${categoriaActual}` : '';

                const opciones = categorias.map(c =>
                    `<option value="${c.value}" ${c.value === categoriaActual ? 'selected' : ''}>${c.label}</option>`
                ).join('');

                return `
                    <div class="lugar-item ${claseCategoria}" data-lugar="${this.escaparHTML(lugar.nombre)}">
                        <div class="lugar-nombre">
                            <span>${this.escaparHTML(lugar.nombre)}</span>
                            <span class="lugar-visitas">${lugar.visitas} visita${lugar.visitas !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="lugar-selector">
                            <label>Categoría:</label>
                            <select data-lugar="${this.escaparHTML(lugar.nombre)}" data-place-id="${guardado ? guardado.id : ''}">
                                ${opciones}
                            </select>
                        </div>
                    </div>
                `;
            }).join('');

            // 6. Conectar eventos de cambio
            contenedor.querySelectorAll('select[data-lugar]').forEach(sel => {
                sel.addEventListener('change', (e) => {
                    this.asignarCategoria(
                        e.target.dataset.lugar,
                        e.target.value,
                        e.target.dataset.placeId
                    );
                });
            });

        } catch (error) {
            console.error('Error cargando lugares:', error);
            contenedor.innerHTML = '<p style="color:red;text-align:center;">Error al cargar lugares</p>';
        }
    }

    async asignarCategoria(nombreLugar, categoria, placeId) {
        if (!window.dataStorage) return;

        try {
            // Contar visitas actuales a este lugar
            const sesiones = await window.dataStorage.getAllSessions() || [];
            const visitCount = sesiones.filter(s =>
                ((s.lugar || 'Sin lugar').trim()) === nombreLugar
            ).length;

            if (placeId && placeId !== '') {
                // Actualizar registro existente
                await window.dataStorage.updatePlace({
                    id: Number(placeId),
                    name: nombreLugar,
                    category: categoria,
                    visitCount: visitCount,
                    updatedAt: Date.now()
                });
            } else {
                // Crear nuevo registro
                await window.dataStorage.savePlace({
                    name: nombreLugar,
                    category: categoria,
                    visitCount: visitCount,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
            }

            if (categoria) {
                this.notifications.success(`"${nombreLugar}" → ${categoria}`);
            } else {
                this.notifications.show(`Categoría de "${nombreLugar}" eliminada`, 'info');
            }

            // Recargar la vista para actualizar el color del borde
            await this.cargarLugares();

        } catch (error) {
            console.error('Error asignando categoría:', error);
            this.notifications.error('No se pudo guardar la categoría');
        }
    }

    // ---------- Ajustes: modal, exportar, importar, borrar ----------
    setupAjustes() {
        const btnAbrir = document.getElementById('btn-ajustes');
        const btnCerrar = document.getElementById('cerrarAjustes');
        const overlay = document.getElementById('modalAjustes');
        const btnExportar = document.getElementById('btn-exportar');
        const btnImportar = document.getElementById('btn-importar');
        const inputArchivo = document.getElementById('inputArchivo');
        const btnBorrar = document.getElementById('btn-borrar-todo');

        if (!overlay) return;

        // Abrir
        if (btnAbrir) {
            btnAbrir.addEventListener('click', () => {
                overlay.classList.add('visible');
                this.actualizarInfoDatos();
            });
        }

        // Cerrar con la X
        if (btnCerrar) {
            btnCerrar.addEventListener('click', () => this.cerrarModal());
        }

        // Cerrar clicando fuera del modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.cerrarModal();
        });

        // Cerrar con Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('visible')) {
                this.cerrarModal();
            }
        });

        // Exportar
        if (btnExportar) {
            btnExportar.addEventListener('click', () => this.exportarDatos());
        }

        // Importar (abre el input file)
        if (btnImportar && inputArchivo) {
            btnImportar.addEventListener('click', () => inputArchivo.click());
            inputArchivo.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.importarDatos(e.target.files[0]);
                    e.target.value = ''; // permitir reimportar el mismo archivo
                }
            });
        }

        // Borrar todo
        if (btnBorrar) {
            btnBorrar.addEventListener('click', () => this.borrarTodo());
        }
    }

    cerrarModal() {
        const overlay = document.getElementById('modalAjustes');
        if (overlay) overlay.classList.remove('visible');
    }

    async actualizarInfoDatos() {
        const contenedor = document.getElementById('infoDatos');
        if (!contenedor || !window.dataStorage) return;

        try {
            const [sesiones, places] = await Promise.all([
                window.dataStorage.getAllSessions() || [],
                window.dataStorage.getPlaces() || []
            ]);

            const kmTotal = sesiones.reduce((sum, s) => sum + ((s.distance || 0) / 1000), 0);

            contenedor.innerHTML = `
                <p>📝 Viajes: <strong>${sesiones.length}</strong></p>
                <p>📍 Lugares categorizados: <strong>${places.filter(p => p.category).length}</strong></p>
                <p>📏 Total recorrido: <strong>${kmTotal.toFixed(1)} km</strong></p>
            `;
        } catch (error) {
            console.error('Error actualizando info de datos:', error);
            contenedor.innerHTML = '<p style="color:red;">Error al cargar información</p>';
        }
    }

    async exportarDatos() {
        if (!window.dataStorage) {
            this.notifications.error('dataStorage no disponible');
            return;
        }

        try {
            const datos = await window.dataStorage.exportAllData();
            if (!datos) {
                this.notifications.error('No se pudieron exportar los datos');
                return;
            }

            // Crear nombre con fecha
            const hoy = new Date();
            const yyyy = hoy.getFullYear();
            const mm = String(hoy.getMonth() + 1).padStart(2, '0');
            const dd = String(hoy.getDate()).padStart(2, '0');
            const nombreArchivo = `mi-kilometraje-backup-${yyyy}-${mm}-${dd}.json`;

            // Crear blob y descargar
            const contenido = JSON.stringify(datos, null, 2);
            const blob = new Blob([contenido], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.notifications.success(`Respaldo descargado: ${nombreArchivo}`);

        } catch (error) {
            console.error('Error exportando:', error);
            this.notifications.error('Error al exportar: ' + error.message);
        }
    }

    async importarDatos(archivo) {
        if (!window.dataStorage) return;

        try {
            // Leer archivo
            const texto = await archivo.text();
            let datos;
            try {
                datos = JSON.parse(texto);
            } catch (parseError) {
                this.notifications.error('El archivo no es un JSON válido');
                return;
            }

            // Validar estructura básica
            if (!datos || !datos.data) {
                this.notifications.error('Formato de archivo no reconocido');
                return;
            }

            const { locations = [], sessions = [], places = [] } = datos.data;

            // Confirmación con resumen
            const mensaje = `¿Importar este respaldo?\n\n` +
                `📝 Viajes: ${sessions.length}\n` +
                `📍 Lugares: ${places.length}\n` +
                `🛰️ Puntos GPS: ${locations.length}\n` +
                `📅 Fecha del respaldo: ${datos.exportDate ? new Date(datos.exportDate).toLocaleString('es-ES') : 'desconocida'}\n\n` +
                `⚠️ ATENCIÓN: Se reemplazarán TODOS los datos actuales.`;

            if (!confirm(mensaje)) {
                this.notifications.show('Importación cancelada', 'info');
                return;
            }

            // Importar
            const exito = await window.dataStorage.importData(datos);
            if (!exito) {
                this.notifications.error('No se pudo importar el respaldo');
                return;
            }

            this.notifications.success(`Respaldo restaurado: ${sessions.length} viajes`);

            // Refrescar todas las vistas
            await this.cargarUltimoViaje();
            await this.cargarMesesDisponibles();
            await this.cargarHistorial();
            await this.cargarMesesDisponiblesStats();
            await this.cargarEstadisticas();
            await this.actualizarInfoDatos();

            // Cerrar modal tras éxito
            setTimeout(() => this.cerrarModal(), 800);

        } catch (error) {
            console.error('Error importando:', error);
            this.notifications.error('Error al importar: ' + error.message);
        }
    }

    async borrarTodo() {
        if (!window.dataStorage) return;

        // Doble confirmación
        const primera = confirm(
            '⚠️ ¿Estás seguro de que quieres borrar TODOS los datos?\n\n' +
            'Se eliminarán todos los viajes, lugares y categorías.'
        );
        if (!primera) return;

        const segunda = confirm(
            '🗑️ ÚLTIMA ADVERTENCIA\n\n' +
            'Esta acción es PERMANENTE y no se puede deshacer.\n\n' +
            '¿Confirmas que quieres borrar todo?'
        );
        if (!segunda) return;

        try {
            await window.dataStorage.clearAllData();
            this.notifications.success('Todos los datos han sido eliminados');

            // Refrescar todas las vistas
            await this.cargarUltimoViaje();
            await this.cargarMesesDisponibles();
            await this.cargarHistorial();
            await this.cargarMesesDisponiblesStats();
            await this.cargarEstadisticas();
            await this.actualizarInfoDatos();

        } catch (error) {
            console.error('Error borrando datos:', error);
            this.notifications.error('No se pudieron borrar los datos');
        }
    }

    escaparHTML(texto) {
        if (!texto) return '';
        return String(texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }


    // ---------- Helpers ----------
    formatearFecha(fecha) {
        if (!fecha) return 'Sin fecha';
        if (typeof fecha === 'number') {
            return new Date(fecha).toLocaleDateString('es-ES');
        }
        if (typeof fecha === 'string' && fecha.includes('-')) {
            const [y, m, d] = fecha.split('-');
            return `${d}/${m}/${y}`;
        }
        return fecha;
    }
}

// ============================================================
// 3. Funciones globales usadas por el HTML (onclick)
// ============================================================
window.aplicarFiltros = function () {
    const inputMes = document.getElementById('filtroMes');
    const inputCat = document.getElementById('filtroCategoria');
    const mes = inputMes ? inputMes.value : null;
    const cat = inputCat ? inputCat.value : null;

    if (!mes && !cat) {
        window.app.notifications.warning('Selecciona un mes o una categoría');
        return;
    }

    window.app.cargarHistorial(mes || null, cat || null);
};

window.limpiarFiltro = function () {
    const inputMes = document.getElementById('filtroMes');
    const inputCat = document.getElementById('filtroCategoria');
    if (inputMes) inputMes.value = '';
    if (inputCat) inputCat.value = '';
    window.app.cargarHistorial();
};

// Mantengo esta por compatibilidad con el botón "Filtrar" viejo si quedó en algún HTML cacheado
window.filtrarPorMes = window.aplicarFiltros;

// ============================================================
// 4. Arrancar la app
// ============================================================
window.notifications = new NotificationManager();
window.app = new MiKilometrajeApp();