// ----------------------------------------------------
//  CONFIGURACIÓN DE FIREBASE
// ----------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyDs0S4ckp8a3CowADsF5VWKFeLe1cytIKQ",
    authDomain: "ejgam1997-source.github.io",
    projectId: "estados-de-cuenta-d798e",
    storageBucket: "estados-de-cuenta-d798e.firebasestorage.app",
    messagingSenderId: "936988926580",
    appId: "1:936988926580:web:bb2e68f23bdb83b5236721"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencias a los servicios de Firebase
const auth = firebase.auth();
const db = firebase.firestore();

// Estado global de la aplicación
let currentUserRole = 'viewer';
let localTerceros = [];

// Configuración de retenciones
let aplicarRetencionRenta = localStorage.getItem('aplicarRetencionRenta') === 'true';
let aplicarRetencionICA = localStorage.getItem('aplicarRetencionICA') === 'true';

// Tercero seleccionado para estado de cuenta
let terceroSeleccionado = '';

// Estado para los filtros de las tablas
let filtroTerceroConsumos = '';
let filtroTerceroAnticipos = '';

// Listeners globales de DB
let unlistenTerceros = () => { };
let unlistenConsumos = () => { };
let unlistenAnticipos = () => { };
let unlistenUsers = () => { };

// --- INICIO: Lógica de Autenticación y Roles ---

document.addEventListener('DOMContentLoaded', function () {
    auth.onAuthStateChanged(handleAuthStateChange);

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.getElementById('show-register-btn').addEventListener('click', () => toggleLogin(false));
    document.getElementById('show-login-btn').addEventListener('click', () => toggleLogin(true));

    setupNavigation();
    setupRetencionCheckboxes();
    setupForms();

    document.getElementById('importar-facturas-btn').addEventListener('click', importarFacturasCSV);
    document.getElementById('importar-anticipos-btn').addEventListener('click', importarAnticiposCSV);

    setupTabs('consumos-tab-nav');
    setupTabs('anticipos-tab-nav');

    document.getElementById('tercero-estado-cuenta').addEventListener('change', function () {
        terceroSeleccionado = this.value;
        actualizarEstadoCuenta();
    });

    const today = new Date();
    const firstDay = new Date(today.getFullYear(), 0, 1);
    document.getElementById('fecha-inicio-filtro').valueAsDate = firstDay;
    document.getElementById('fecha-fin-filtro').valueAsDate = today;

    document.getElementById('btn-filtrar-estado').addEventListener('click', actualizarEstadoCuenta);

    document.getElementById('filtro-tercero-consumo').addEventListener('change', function () {
        filtroTerceroConsumos = this.value;
        unlistenConsumos();
        listenForConsumos();
    });

    document.getElementById('filtro-tercero-anticipo').addEventListener('change', function () {
        filtroTerceroAnticipos = this.value;
        unlistenAnticipos();
        listenForAnticipos();
    });

    document.getElementById('exportar-pdf').addEventListener('click', exportarPDF);
    document.getElementById('exportar-docx').addEventListener('click', exportarDOCX);
});

function toggleLogin(isLogin) {
    const title = document.getElementById('login-title');
    const btn = document.getElementById('login-btn');
    const loginForm = document.getElementById('login-form');
    const loginText = document.getElementById('login-text');
    const registerText = document.getElementById('register-text');

    if (isLogin) {
        title.textContent = 'Iniciar Sesión';
        btn.textContent = 'Ingresar';
        loginForm.onsubmit = handleLogin;
        loginText.style.display = 'block';
        registerText.style.display = 'none';
    } else {
        title.textContent = 'Crear Cuenta';
        btn.textContent = 'Registrarse';
        loginForm.onsubmit = handleRegister;
        loginText.style.display = 'none';
        registerText.style.display = 'block';
    }
    document.getElementById('login-alert').style.display = 'none';
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    auth.signInWithEmailAndPassword(email, password)
        .catch((error) => {
            mostrarAlerta('login-alert', 'error', traducirErrorFirebase(error.code));
        });
}

function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            return db.collection('users').doc(userCredential.user.uid).set({
                email: userCredential.user.email,
                role: 'viewer'
            });
        })
        .catch((error) => {
            mostrarAlerta('login-alert', 'error', traducirErrorFirebase(error.code));
        });
}

function handleLogout() {
    auth.signOut();
}

function handleAuthStateChange(user) {
    if (user) {
        db.collection('users').doc(user.uid).get()
            .then((doc) => {
                if (doc.exists) {
                    currentUserRole = doc.data().role;
                } else {
                    currentUserRole = 'viewer';
                    db.collection('users').doc(user.uid).set({ email: user.email, role: 'viewer' });
                }

                document.getElementById('login-overlay').style.display = 'none';
                document.getElementById('main-app').style.display = 'block';
                document.getElementById('user-info').textContent = `Usuario: ${user.email} (${currentUserRole})`;

                applyRolePermissions(currentUserRole);

                listenForTerceros();
                listenForConsumos();
                listenForAnticipos();
                if (currentUserRole === 'admin') {
                    listenForAdminPanel();
                }
            })
            .catch(err => {
                console.error("Error al obtener rol de usuario:", err);
                handleLogout();
            });
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
        currentUserRole = 'viewer';

        unlistenTerceros();
        unlistenConsumos();
        unlistenAnticipos();
        unlistenUsers();

        document.getElementById('terceros-tbody').innerHTML = '';
        document.getElementById('consumos-tbody').innerHTML = '';
        document.getElementById('anticipos-tbody').innerHTML = '';
        document.getElementById('users-tbody').innerHTML = '';
    }
}

function applyRolePermissions(role) {
    const editorElements = document.querySelectorAll('.requires-editor');
    const adminElements = document.querySelectorAll('.requires-admin');

    if (role === 'admin') {
        editorElements.forEach(el => el.style.display = '');
        adminElements.forEach(el => el.style.display = '');
    } else if (role === 'editor') {
        editorElements.forEach(el => el.style.display = '');
        adminElements.forEach(el => el.style.display = 'none');
    } else {
        editorElements.forEach(el => el.style.display = 'none');
        adminElements.forEach(el => el.style.display = 'none');
    }
}

function traducirErrorFirebase(code) {
    switch (code) {
        case 'auth/wrong-password': return 'Contraseña incorrecta.';
        case 'auth/user-not-found': return 'No se encontró usuario con ese email.';
        case 'auth/invalid-email': return 'Email no válido.';
        case 'auth/email-already-in-use': return 'Ese email ya está en uso.';
        case 'auth/weak-password': return 'La contraseña debe tener al menos 6 caracteres.';
        default: return 'Error de autenticación. Intenta de nuevo.';
    }
}

// --- Funciones de Admin ---
function listenForAdminPanel() {
    unlistenUsers = db.collection('users').onSnapshot((snapshot) => {
        const tbody = document.getElementById('users-tbody');
        tbody.innerHTML = '';
        snapshot.forEach(doc => {
            const user = doc.data();
            const tr = document.createElement('tr');
            const roleSelect = `
                <select onchange="adminChangeRole('${doc.id}', this.value)">
                    <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Consulta (viewer)</option>
                    <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Emisor (editor)</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin (admin)</option>
                </select>`;
            tr.innerHTML = `
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${roleSelect}</td>`;
            tbody.appendChild(tr);
        });
    });
}

function adminChangeRole(uid, newRole) {
    db.collection('users').doc(uid).update({ role: newRole })
        .then(() => { mostrarAlerta('admin-alert', 'success', 'Rol actualizado correctamente.'); })
        .catch(err => { mostrarAlerta('admin-alert', 'error', 'Error al actualizar el rol.'); });
}

// --- Funciones para Terceros ---
function listenForTerceros() {
    unlistenTerceros = db.collection('terceros').orderBy('razonSocial').onSnapshot((snapshot) => {
        const tbody = document.getElementById('terceros-tbody');
        tbody.innerHTML = '';
        localTerceros = [];

        const showActions = currentUserRole === 'admin' || currentUserRole === 'editor';
        document.querySelector('#terceros-table .actions-header').style.display = showActions ? '' : 'none';

        snapshot.forEach(doc => {
            const tercero = doc.data();
            tercero.id = doc.id;
            localTerceros.push(tercero);

            const tr = document.createElement('tr');
            let actionsHTML = '';
            if (showActions) {
                actionsHTML = `<td class="actions"><button class="danger" onclick="eliminarTercero('${doc.id}')">Eliminar</button></td>`;
            }
            tr.innerHTML = `
                <td>${tercero.nit}</td>
                <td>${tercero.razonSocial}</td>
                ${actionsHTML}`;
            tbody.appendChild(tr);
        });

        actualizarSelectoresTerceros();
    });
}

function agregarTercero(e) {
    e.preventDefault();
    const nit = document.getElementById('nit').value;
    const razonSocial = document.getElementById('razon-social').value;

    if (localTerceros.some(tercero => tercero.nit === nit)) {
        mostrarAlerta('terceros-alert', 'error', 'Ya existe un tercero con ese NIT.');
        return;
    }

    db.collection('terceros').add({ nit, razonSocial })
        .then(() => {
            document.getElementById('tercero-form').reset();
            mostrarAlerta('terceros-alert', 'success', 'Tercero agregado correctamente.');
        })
        .catch(err => { mostrarAlerta('terceros-alert', 'error', 'Error al agregar tercero.'); });
}

async function eliminarTercero(docId) {
    const tercero = localTerceros.find(t => t.id === docId);
    if (!tercero) return;

    const consumosQuery = await db.collection('consumos').where('terceroId', '==', tercero.id).limit(1).get();
    const anticiposQuery = await db.collection('anticipos').where('terceroId', '==', tercero.id).limit(1).get();

    if (!consumosQuery.empty || !anticiposQuery.empty) {
        mostrarAlerta('terceros-alert', 'error', 'No se puede eliminar el tercero porque tiene consumos o anticipos asociados.');
        return;
    }

    if (confirm('¿Está seguro de que desea eliminar este tercero?')) {
        db.collection('terceros').doc(docId).delete()
            .then(() => { mostrarAlerta('terceros-alert', 'success', 'Tercero eliminado correctamente.'); })
            .catch(err => { mostrarAlerta('terceros-alert', 'error', 'Error al eliminar tercero.'); });
    }
}

function actualizarSelectoresTerceros() {
    const selectores = [
        'tercero-consumo', 'tercero-factura', 'tercero-factura-adicional',
        'tercero-recibo', 'tercero-anticipo', 'tercero-estado-cuenta',
        'filtro-tercero-consumo', 'filtro-tercero-anticipo'
    ];

    selectores.forEach(selectorId => {
        const selector = document.getElementById(selectorId);
        const valorActual = selector.value;
        const esFiltro = ['tercero-estado-cuenta', 'filtro-tercero-consumo', 'filtro-tercero-anticipo'].includes(selectorId);

        selector.innerHTML = esFiltro
            ? '<option value="">Todos los terceros</option>'
            : '<option value="">Seleccione un tercero</option>';

        localTerceros.forEach(tercero => {
            const option = document.createElement('option');
            option.value = tercero.id;
            option.textContent = `${tercero.nit} - ${tercero.razonSocial}`;
            selector.appendChild(option);
        });

        if (valorActual) selector.value = valorActual;
    });
}

function obtenerTerceroPorId(id) {
    return localTerceros.find(tercero => tercero.id === id) || { nit: 'N/A', razonSocial: 'Tercero no encontrado' };
}

// --- Funciones para Consumos y Facturas ---
function listenForConsumos() {
    let query = db.collection('consumos');
    if (filtroTerceroConsumos) {
        query = query.where('terceroId', '==', filtroTerceroConsumos);
    }

    unlistenConsumos = query.orderBy('fecha', 'desc').onSnapshot((snapshot) => {
        const tbody = document.getElementById('consumos-tbody');
        tbody.innerHTML = '';

        const showActions = currentUserRole === 'admin' || currentUserRole === 'editor';
        document.querySelector('#consumos-table .actions-header').style.display = showActions ? '' : 'none';

        snapshot.forEach(doc => {
            const consumo = doc.data();
            const tercero = obtenerTerceroPorId(consumo.terceroId);
            const tr = document.createElement('tr');

            let noDocumento = consumo.noDocumento || '-';
            let estadoHTML = '';
            if (consumo.tipo === 'factura') {
                estadoHTML = `<span class="status-badge ${consumo.estado}">${consumo.estado === 'borrador' ? 'Borrador' : 'Completada'}</span>`;
            } else {
                estadoHTML = '-';
            }

            let accionesHTML = '';
            if (showActions) {
                let actionsContent = `<button class="danger" onclick="eliminarConsumo('${doc.id}')">Eliminar</button>`;
                if (consumo.tipo === 'factura' && consumo.estado === 'borrador') {
                    actionsContent += `<button class="success" onclick="completarFactura('${doc.id}')">Completar</button>`;
                }
                accionesHTML = `<td class="actions">${actionsContent}</td>`;
            }

            tr.innerHTML = `
                <td>${tercero.razonSocial}</td>
                <td>${formatearFecha(consumo.fecha)}</td>
                <td>${noDocumento}</td>
                <td>${formatearMoneda(consumo.valor)}</td>
                <td>${formatearMoneda(consumo.retencionRenta)}</td>
                <td>${formatearMoneda(consumo.retencionICA)}</td>
                <td>${formatearMoneda(consumo.total)}</td>
                <td>${estadoHTML}</td>
                ${accionesHTML}`;
            tbody.appendChild(tr);
        });

        actualizarEstadoCuenta();
    });
}

function agregarConsumo(e) {
    e.preventDefault();
    const terceroId = document.getElementById('tercero-consumo').value;
    const fecha = document.getElementById('fecha-consumo').value;
    const valor = parseFloat(document.getElementById('valor-consumo').value);

    const nuevoConsumo = {
        terceroId, fecha, tipo: 'consumo', valor,
        retencionRenta: aplicarRetencionRenta ? valor * 0.001 : 0,
        retencionICA: aplicarRetencionICA ? valor * 0.0138 : 0,
        total: calcularTotal(valor, aplicarRetencionRenta, aplicarRetencionICA)
    };

    db.collection('consumos').add(nuevoConsumo)
        .then(() => {
            document.getElementById('consumo-form').reset();
            mostrarAlerta('consumos-alert', 'success', 'Consumo agregado correctamente.');
        })
        .catch(err => { mostrarAlerta('consumos-alert', 'error', 'Error al agregar consumo.'); });
}

function agregarFactura(e) {
    e.preventDefault();
    const terceroId = document.getElementById('tercero-factura').value;
    const fecha = document.getElementById('fecha-factura').value;
    const noDocumento = document.getElementById('no-documento-factura').value;
    const valor = parseFloat(document.getElementById('valor-factura').value);
    const borrador = document.getElementById('factura-borrador').checked;

    const nuevaFactura = {
        terceroId, fecha, tipo: 'factura', noDocumento,
        valor, estado: borrador ? 'borrador' : 'completada',
        retencionRenta: aplicarRetencionRenta ? valor * 0.001 : 0,
        retencionICA: aplicarRetencionICA ? valor * 0.0138 : 0,
        total: calcularTotal(valor, aplicarRetencionRenta, aplicarRetencionICA)
    };

    db.collection('consumos').add(nuevaFactura)
        .then(() => {
            document.getElementById('factura-form').reset();
            mostrarAlerta('consumos-alert', 'success', 'Factura agregada correctamente.');
        })
        .catch(err => { mostrarAlerta('consumos-alert', 'error', 'Error al agregar factura.'); });
}

function agregarFacturaAdicional(e) {
    e.preventDefault();
    const terceroId = document.getElementById('tercero-factura-adicional').value;
    const fecha = document.getElementById('fecha-factura-adicional').value;
    const noDocumento = document.getElementById('no-documento-factura-adicional').value;
    const valor = parseFloat(document.getElementById('valor-factura-adicional').value);

    if (!noDocumento.startsWith('ASFE')) {
        mostrarAlerta('consumos-alert', 'error', 'El número de documento debe empezar con "ASFE".');
        return;
    }

    const nuevaFacturaAdicional = {
        terceroId, fecha, tipo: 'factura-adicional', noDocumento,
        valor, estado: 'completada', retencionRenta: 0, retencionICA: 0, total: valor
    };

    db.collection('consumos').add(nuevaFacturaAdicional)
        .then(() => {
            document.getElementById('factura-adicional-form').reset();
            mostrarAlerta('consumos-alert', 'success', 'Factura adicional agregada.');
        })
        .catch(err => { mostrarAlerta('consumos-alert', 'error', 'Error al agregar factura.'); });
}

function agregarReciboContado(e) {
    e.preventDefault();
    const terceroId = document.getElementById('tercero-recibo').value;
    const fecha = document.getElementById('fecha-recibo').value;
    const noDocumento = document.getElementById('no-documento-recibo').value;
    const valor = parseFloat(document.getElementById('valor-recibo').value);

    if (!noDocumento.includes('**')) {
        mostrarAlerta('consumos-alert', 'error', 'El número de documento debe incluir "**".');
        return;
    }
    if (valor >= 0) {
        mostrarAlerta('consumos-alert', 'error', 'El valor debe ser negativo.');
        return;
    }

    const nuevoReciboContado = {
        terceroId, fecha, tipo: 'recibo-contado', noDocumento,
        valor, estado: 'completada', retencionRenta: 0, retencionICA: 0, total: valor
    };

    db.collection('consumos').add(nuevoReciboContado)
        .then(() => {
            document.getElementById('recibo-contado-form').reset();
            mostrarAlerta('consumos-alert', 'success', 'Recibo de contado agregado.');
        })
        .catch(err => { mostrarAlerta('consumos-alert', 'error', 'Error al agregar recibo.'); });
}

function completarFactura(docId) {
    db.collection('consumos').doc(docId).update({ estado: 'completada' })
        .then(() => { mostrarAlerta('consumos-alert', 'success', 'Factura completada.'); })
        .catch(err => { mostrarAlerta('consumos-alert', 'error', 'Error al completar factura.'); });
}

function eliminarConsumo(docId) {
    if (confirm('¿Está seguro de que desea eliminar este registro?')) {
        db.collection('consumos').doc(docId).delete()
            .then(() => { mostrarAlerta('consumos-alert', 'success', 'Registro eliminado.'); })
            .catch(err => { mostrarAlerta('consumos-alert', 'error', 'Error al eliminar.'); });
    }
}

// --- Funciones para Anticipos ---
function listenForAnticipos() {
    let query = db.collection('anticipos');
    if (filtroTerceroAnticipos) {
        query = query.where('terceroId', '==', filtroTerceroAnticipos);
    }

    unlistenAnticipos = query.orderBy('fecha', 'desc').onSnapshot((snapshot) => {
        const tbody = document.getElementById('anticipos-tbody');
        tbody.innerHTML = '';

        const showActions = currentUserRole === 'admin' || currentUserRole === 'editor';
        document.querySelector('#anticipos-table .actions-header').style.display = showActions ? '' : 'none';

        snapshot.forEach(doc => {
            const anticipo = doc.data();
            const tercero = obtenerTerceroPorId(anticipo.terceroId);
            const tr = document.createElement('tr');

            let actionsHTML = '';
            if (showActions) {
                actionsHTML = `<td class="actions"><button class="danger" onclick="eliminarAnticipo('${doc.id}')">Eliminar</button></td>`;
            }

            tr.innerHTML = `
                <td>${tercero.razonSocial}</td>
                <td>${formatearFecha(anticipo.fecha)}</td>
                <td>${anticipo.noDocumento}</td>
                <td>${formatearMoneda(anticipo.valor)}</td>
                ${actionsHTML}`;
            tbody.appendChild(tr);
        });

        actualizarEstadoCuenta();
    });
}

function agregarAnticipo(e) {
    e.preventDefault();
    const terceroId = document.getElementById('tercero-anticipo').value;
    const fecha = document.getElementById('fecha-anticipo').value;
    const noDocumento = document.getElementById('no-documento-anticipo').value;
    const valor = parseFloat(document.getElementById('valor-anticipo').value);

    const nuevoAnticipo = { terceroId, fecha, noDocumento, valor };

    db.collection('anticipos').add(nuevoAnticipo)
        .then(() => {
            document.getElementById('anticipo-form').reset();
            mostrarAlerta('anticipos-alert', 'success', 'Anticipo agregado.');
        })
        .catch(err => { mostrarAlerta('anticipos-alert', 'error', 'Error al agregar anticipo.'); });
}

function eliminarAnticipo(docId) {
    if (confirm('¿Está seguro de que desea eliminar este anticipo?')) {
        db.collection('anticipos').doc(docId).delete()
            .then(() => { mostrarAlerta('anticipos-alert', 'success', 'Anticipo eliminado.'); })
            .catch(err => { mostrarAlerta('anticipos-alert', 'error', 'Error al eliminar.'); });
    }
}

// --- Funciones para Estado de Cuenta ---
async function actualizarEstadoCuenta() {
    const fechaInicioInput = document.getElementById('fecha-inicio-filtro').value;
    const fechaFinInput = document.getElementById('fecha-fin-filtro').value;

    const fechaInicio = fechaInicioInput ? new Date(fechaInicioInput) : new Date('2000-01-01');
    const fechaFin = fechaFinInput ? new Date(fechaFinInput) : new Date();
    fechaFin.setHours(23, 59, 59, 999);

    let consumosQuery = db.collection('consumos');
    let anticiposQuery = db.collection('anticipos');

    if (terceroSeleccionado) {
        consumosQuery = consumosQuery.where('terceroId', '==', terceroSeleccionado);
        anticiposQuery = anticiposQuery.where('terceroId', '==', terceroSeleccionado);
    }

    try {
        const [consumosSnapshot, anticiposSnapshot] = await Promise.all([
            consumosQuery.get(),
            anticiposQuery.get()
        ]);

        const consumosTodos = consumosSnapshot.docs.map(doc => doc.data());
        const anticiposTodos = anticiposSnapshot.docs.map(doc => doc.data());

        const consumosHastaFin = consumosTodos.filter(c => {
            const f = new Date(c.fecha);
            f.setHours(12, 0, 0, 0);
            return f <= fechaFin;
        });

        const anticiposHastaFin = anticiposTodos.filter(a => {
            const f = new Date(a.fecha);
            f.setHours(12, 0, 0, 0);
            return f <= fechaFin;
        });

        const totalAnticipos = anticiposHastaFin.reduce((sum, a) => sum + a.valor, 0);
        const totalConsumos = consumosHastaFin.reduce((sum, c) => sum + c.total, 0);
        const saldo = totalAnticipos - totalConsumos;

        document.getElementById('total-anticipos').textContent = formatearMoneda(totalAnticipos);
        document.getElementById('total-consumos').textContent = formatearMoneda(totalConsumos);

        const saldoElement = document.getElementById('saldo');
        const saldoCard = document.getElementById('saldo-card');

        saldoElement.textContent = formatearMoneda(saldo);
        if (saldo >= 0) {
            saldoCard.classList.remove('negative');
            saldoCard.classList.add('positive');
        } else {
            saldoCard.classList.remove('positive');
            saldoCard.classList.add('negative');
        }

        const fechaFinStr = fechaFinInput || formatearFecha(new Date().toISOString().split('T')[0]);
        document.getElementById('fecha-saldo').textContent = `hasta el ${fechaFinStr}`;

        fechaInicio.setHours(0, 0, 0, 0);
        const consumosRango = consumosHastaFin.filter(c => {
            const f = new Date(c.fecha);
            f.setHours(12, 0, 0, 0);
            return f >= fechaInicio;
        });
        const anticiposRango = anticiposHastaFin.filter(a => {
            const f = new Date(a.fecha);
            f.setHours(12, 0, 0, 0);
            return f >= fechaInicio;
        });

        actualizarTablasDetalleEstadoCuenta(consumosRango, anticiposRango);

    } catch (err) {
        console.error("Error al actualizar estado de cuenta:", err);
    }
}

function actualizarTablasDetalleEstadoCuenta(consumosFiltrados, anticiposFiltrados) {
    const tbodyConsumos = document.getElementById('estado-consumos-tbody');
    tbodyConsumos.innerHTML = '';

    const consumosOrdenados = [...consumosFiltrados].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    consumosOrdenados.forEach(consumo => {
        const tercero = obtenerTerceroPorId(consumo.terceroId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${tercero.razonSocial}</td>
            <td>${formatearFecha(consumo.fecha)}</td>
            <td>${consumo.noDocumento || '-'}</td>
            <td>${formatearMoneda(consumo.valor)}</td>
            <td>${formatearMoneda(consumo.retencionRenta)}</td>
            <td>${formatearMoneda(consumo.retencionICA)}</td>
            <td>${formatearMoneda(consumo.total)}</td>`;
        tbodyConsumos.appendChild(tr);
    });

    const tbodyAnticipos = document.getElementById('estado-anticipos-tbody');
    tbodyAnticipos.innerHTML = '';

    const anticiposOrdenados = [...anticiposFiltrados].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    anticiposOrdenados.forEach(anticipo => {
        const tercero = obtenerTerceroPorId(anticipo.terceroId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${tercero.razonSocial}</td>
            <td>${formatearFecha(anticipo.fecha)}</td>
            <td>${anticipo.noDocumento}</td>
            <td>${formatearMoneda(anticipo.valor)}</td>`;
        tbodyAnticipos.appendChild(tr);
    });
}

// --- Funciones de Importación CSV ---
function importarFacturasCSV() {
    const input = document.getElementById('csv-facturas-input');
    if (!input.files || input.files.length === 0) {
        mostrarAlerta('consumos-alert', 'error', 'Por favor, seleccione un archivo CSV.');
        return;
    }
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        try { procesarCSVFacturas(e.target.result); }
        catch (error) { mostrarAlerta('consumos-alert', 'error', 'Error al procesar el archivo.'); }
    };
    reader.readAsText(file);
    input.value = '';
}

async function procesarCSVFacturas(csvData) {
    const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) {
        mostrarAlerta('consumos-alert', 'error', 'El archivo CSV está vacío.');
        return;
    }

    const batch = db.batch();
    let importados = 0, errores = 0;

    for (const line of lines) {
        const parts = line.split(',');
        if (parts.length < 4) { errores++; continue; }

        const nitTercero = parts[0].trim();
        const fecha = parts[1].trim();
        const noDocumento = parts[2].trim();
        const valor = parseFloat(parts[3].trim());
        const tercero = localTerceros.find(t => t.nit === nitTercero);

        if (!tercero || isNaN(valor)) { errores++; continue; }

        const nuevaFactura = {
            terceroId: tercero.id, fecha, tipo: 'factura', noDocumento,
            valor, estado: 'borrador',
            retencionRenta: aplicarRetencionRenta ? valor * 0.001 : 0,
            retencionICA: aplicarRetencionICA ? valor * 0.0138 : 0,
            total: calcularTotal(valor, aplicarRetencionRenta, aplicarRetencionICA)
        };

        const docRef = db.collection('consumos').doc();
        batch.set(docRef, nuevaFactura);
        importados++;
    }

    try {
        await batch.commit();
        mostrarAlerta('consumos-alert', 'success', `Importación completada. Agregados: ${importados}. Errores: ${errores}.`);
    } catch (err) {
        mostrarAlerta('consumos-alert', 'error', 'Error al guardar el lote en Firebase.');
    }
}

function importarAnticiposCSV() {
    const input = document.getElementById('csv-anticipos-input');
    if (!input.files || input.files.length === 0) {
        mostrarAlerta('anticipos-alert', 'error', 'Por favor, seleccione un archivo CSV.');
        return;
    }
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        try { procesarCSVAnticipos(e.target.result); }
        catch (error) { mostrarAlerta('anticipos-alert', 'error', 'Error al procesar el archivo.'); }
    };
    reader.readAsText(file);
    input.value = '';
}

async function procesarCSVAnticipos(csvData) {
    const lines = csvData.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) {
        mostrarAlerta('anticipos-alert', 'error', 'El archivo CSV está vacío.');
        return;
    }

    const batch = db.batch();
    let importados = 0, errores = 0;

    for (const line of lines) {
        const parts = line.split(',');
        if (parts.length < 4) { errores++; continue; }

        const nitTercero = parts[0].trim();
        const fecha = parts[1].trim();
        const noDocumento = parts[2].trim();
        const valor = parseFloat(parts[3].trim());
        const tercero = localTerceros.find(t => t.nit === nitTercero);

        if (!tercero || isNaN(valor) || valor < 0) { errores++; continue; }

        const nuevoAnticipo = { terceroId: tercero.id, fecha, noDocumento, valor };
        const docRef = db.collection('anticipos').doc();
        batch.set(docRef, nuevoAnticipo);
        importados++;
    }

    try {
        await batch.commit();
        mostrarAlerta('anticipos-alert', 'success', `Importación completada. Agregados: ${importados}. Errores: ${errores}.`);
    } catch (err) {
        mostrarAlerta('anticipos-alert', 'error', 'Error al guardar el lote en Firebase.');
    }
}

// --- Funciones de Configuración y Utilidad ---
function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const target = this.getAttribute('data-target');
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
            document.getElementById(target).classList.add('active');
        });
    });
}

function setupRetencionCheckboxes() {
    const rentaCheck = document.getElementById('aplicar-retencion-renta');
    const icaCheck = document.getElementById('aplicar-retencion-ica');

    rentaCheck.checked = aplicarRetencionRenta;
    icaCheck.checked = aplicarRetencionICA;

    rentaCheck.addEventListener('change', function () {
        aplicarRetencionRenta = this.checked;
        localStorage.setItem('aplicarRetencionRenta', aplicarRetencionRenta);
    });
    icaCheck.addEventListener('change', function () {
        aplicarRetencionICA = this.checked;
        localStorage.setItem('aplicarRetencionICA', aplicarRetencionICA);
    });
}

function setupForms() {
    document.getElementById('tercero-form').addEventListener('submit', agregarTercero);
    document.getElementById('consumo-form').addEventListener('submit', agregarConsumo);
    document.getElementById('factura-form').addEventListener('submit', agregarFactura);
    document.getElementById('factura-adicional-form').addEventListener('submit', agregarFacturaAdicional);
    document.getElementById('recibo-contado-form').addEventListener('submit', agregarReciboContado);
    document.getElementById('anticipo-form').addEventListener('submit', agregarAnticipo);
}

function setupTabs(navContainerId) {
    const navContainer = document.getElementById(navContainerId);
    if (!navContainer) return;
    const tabButtons = navContainer.querySelectorAll('.tab-nav-button');
    const tabContents = navContainer.parentElement.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            const targetContent = document.getElementById(button.getAttribute('data-target'));
            if (targetContent) targetContent.classList.add('active');
        });
    });
}

function calcularTotal(valor, aplicarRenta, aplicarICA) {
    let total = valor;
    if (aplicarRenta) total -= valor * 0.001;
    if (aplicarICA) total -= valor * 0.0138;
    return total;
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP',
        minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(valor);
}

function formatearFecha(fecha) {
    const d = new Date(fecha);
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function mostrarAlerta(contenedorId, tipo, mensaje) {
    const contenedor = document.getElementById(contenedorId);
    contenedor.textContent = mensaje;
    contenedor.className = `alert ${tipo}`;
    contenedor.style.display = 'block';
    setTimeout(() => { contenedor.style.display = 'none'; }, 5000);
}

// --- Funciones de Exportación ---
function exportarPDF() {
    document.getElementById('loading-overlay').style.display = 'flex';
    const terceroId = document.getElementById('tercero-estado-cuenta').value;
    const tercero = terceroId ? obtenerTerceroPorId(terceroId) : null;
    generarPDFNativo(tercero);
}

function generarPDFNativo(tercero) {
    const nombreArchivo = tercero
        ? `Estado_Cuenta_${tercero.razonSocial.replace(/\s+/g, '_')}.pdf`
        : 'Estado_Cuenta_General.pdf';

    const totalAnticipos = document.getElementById('total-anticipos').textContent;
    const totalConsumos = document.getElementById('total-consumos').textContent;
    const saldo = document.getElementById('saldo').textContent;
    const fechaSaldo = document.getElementById('fecha-saldo').textContent;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'letter');

    const margin = 12;
    const pageWidth = 215.9;
    const pageHeight = 279.4;
    const contentWidth = pageWidth - (2 * margin);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(44, 62, 80);
    pdf.text("ESTADO DE CUENTA", pageWidth / 2, margin + 10, { align: "center" });

    pdf.setDrawColor(44, 62, 80);
    pdf.setLineWidth(0.5);
    pdf.line(margin, margin + 15, pageWidth - margin, margin + 15);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);

    let yPos = margin + 25;

    pdf.text(`Empresa: SERVICIOS PARA VEHICULOS DE TRANSPORTE S.A.`, margin, yPos);
    if (tercero) {
        pdf.text(`Tercero: ${tercero.razonSocial}`, margin, yPos + 5);
        pdf.text(`NIT: ${tercero.nit}`, margin, yPos + 10);
    } else {
        pdf.text("Todos los terceros", margin, yPos);
    }

    pdf.text(`Fecha del estado: ${fechaSaldo}`, pageWidth - margin, yPos, { align: "right" });
    yPos += 15;

    const cardWidth = (contentWidth - 10) / 3;
    const cardHeight = 25;

    // Tarjeta Anticipos
    pdf.setFillColor(236, 240, 241);
    pdf.roundedRect(margin, yPos, cardWidth, cardHeight, 2, 2, 'F');
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(52, 73, 94);
    pdf.text("TOTAL ANTICIPOS", margin + (cardWidth / 2), yPos + 7, { align: "center" });
    pdf.setFontSize(12); pdf.setTextColor(0, 0, 0);
    pdf.text(totalAnticipos, margin + (cardWidth / 2), yPos + 17, { align: "center" });

    // Tarjeta Consumos
    pdf.setFillColor(236, 240, 241);
    pdf.roundedRect(margin + cardWidth + 5, yPos, cardWidth, cardHeight, 2, 2, 'F');
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(52, 73, 94);
    pdf.text("TOTAL CONSUMOS", margin + cardWidth + 5 + (cardWidth / 2), yPos + 7, { align: "center" });
    pdf.setFontSize(12); pdf.setTextColor(0, 0, 0);
    pdf.text(totalConsumos, margin + cardWidth + 5 + (cardWidth / 2), yPos + 17, { align: "center" });

    // Tarjeta Saldo
    pdf.setFillColor(236, 240, 241);
    pdf.roundedRect(margin + (2 * (cardWidth + 5)), yPos, cardWidth, cardHeight, 2, 2, 'F');
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); pdf.setTextColor(52, 73, 94);
    pdf.text("SALDO", margin + (2 * (cardWidth + 5)) + (cardWidth / 2), yPos + 7, { align: "center" });
    pdf.setFontSize(12);
    const saldoNum = parseFloat(saldo.replace(/[^0-9.-]+/g, ""));
    pdf.setTextColor(saldoNum >= 0 ? 39 : 231, saldoNum >= 0 ? 174 : 76, saldoNum >= 0 ? 96 : 60);
    pdf.text(saldo, margin + (2 * (cardWidth + 5)) + (cardWidth / 2), yPos + 17, { align: "center" });

    yPos += cardHeight + 15;

    // Tabla de Consumos
    pdf.setTextColor(0, 0, 0); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
    pdf.text("DETALLE DE CONSUMOS Y FACTURAS", margin, yPos);
    yPos += 8;

    const tablaConsumos = document.getElementById('estado-consumos-table');
    const filasConsumos = tablaConsumos.querySelectorAll('tbody tr');

    const colConsumoValor = 120;
    const colConsumoRenta = 145;
    const colConsumoICA = 170;
    const colConsumoTotal = pageWidth - margin;

    const dibujarEncabezadoConsumos = (y) => {
        pdf.setFillColor(44, 62, 80);
        pdf.rect(margin, y, contentWidth, 8, 'F');
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(255, 255, 255);
        pdf.text("Tercero", margin + 2, y + 5);
        pdf.text("Fecha", margin + 55, y + 5);
        pdf.text("Documento", margin + 75, y + 5);
        pdf.text("Valor", colConsumoValor, y + 5, { align: "right" });
        pdf.text("Ret. Renta", colConsumoRenta, y + 5, { align: "right" });
        pdf.text("Ret. ICA", colConsumoICA, y + 5, { align: "right" });
        pdf.text("Total", colConsumoTotal, y + 5, { align: "right" });
        return y + 10;
    };

    yPos = dibujarEncabezadoConsumos(yPos);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(0, 0, 0);

    let filaIndex = 0;
    filasConsumos.forEach(fila => {
        if (yPos > pageHeight - margin - 10) {
            pdf.addPage();
            yPos = dibujarEncabezadoConsumos(margin);
            pdf.setFont("helvetica", "normal"); pdf.setFontSize(7);
        }
        if (filaIndex % 2 === 0) { pdf.setFillColor(249, 249, 249); pdf.rect(margin, yPos, contentWidth, 6, 'F'); }
        const celdas = fila.querySelectorAll('td');
        pdf.setTextColor(0, 0, 0);
        pdf.text(celdas[0].textContent.substring(0, 25), margin + 2, yPos + 4);
        pdf.text(celdas[1].textContent, margin + 55, yPos + 4);
        pdf.text(celdas[2].textContent.substring(0, 12), margin + 75, yPos + 4);
        pdf.text(celdas[3].textContent, colConsumoValor, yPos + 4, { align: "right" });
        pdf.text(celdas[4].textContent, colConsumoRenta, yPos + 4, { align: "right" });
        pdf.text(celdas[5].textContent, colConsumoICA, yPos + 4, { align: "right" });
        pdf.text(celdas[6].textContent, colConsumoTotal, yPos + 4, { align: "right" });
        yPos += 6; filaIndex++;
    });

    yPos += 10;

    // Tabla de Anticipos
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(0, 0, 0);
    pdf.text("DETALLE DE ANTICIPOS", margin, yPos);
    yPos += 8;

    const colAnticipoValor = pageWidth - margin;

    const dibujarEncabezadoAnticipos = (y) => {
        pdf.setFillColor(44, 62, 80);
        pdf.rect(margin, y, contentWidth, 8, 'F');
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.setTextColor(255, 255, 255);
        pdf.text("Tercero", margin + 2, y + 5);
        pdf.text("Fecha", margin + 60, y + 5);
        pdf.text("Documento", margin + 90, y + 5);
        pdf.text("Valor", colAnticipoValor, y + 5, { align: "right" });
        return y + 10;
    };

    yPos = dibujarEncabezadoAnticipos(yPos);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(0, 0, 0);

    const filasAnticipos = document.getElementById('estado-anticipos-table').querySelectorAll('tbody tr');
    filaIndex = 0;
    filasAnticipos.forEach(fila => {
        if (yPos > pageHeight - margin - 10) {
            pdf.addPage();
            yPos = dibujarEncabezadoAnticipos(margin);
            pdf.setFont("helvetica", "normal"); pdf.setFontSize(7);
        }
        if (filaIndex % 2 === 0) { pdf.setFillColor(249, 249, 249); pdf.rect(margin, yPos, contentWidth, 6, 'F'); }
        const celdas = fila.querySelectorAll('td');
        pdf.setTextColor(0, 0, 0);
        pdf.text(celdas[0].textContent.substring(0, 30), margin + 2, yPos + 4);
        pdf.text(celdas[1].textContent, margin + 60, yPos + 4);
        pdf.text(celdas[2].textContent.substring(0, 20), margin + 90, yPos + 4);
        pdf.text(celdas[3].textContent, colAnticipoValor, yPos + 4, { align: "right" });
        yPos += 6; filaIndex++;
    });

    const fechaGeneracion = new Date().toLocaleDateString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    pdf.setFont("helvetica", "italic"); pdf.setFontSize(7); pdf.setTextColor(128, 128, 128);
    pdf.text(`Generado el ${fechaGeneracion} - ACUALIANZA & BAQUERO S.A.S.`, pageWidth / 2, pageHeight - 5, { align: "center" });

    if (pdf.setCompression) pdf.setCompression(true);
    pdf.save(nombreArchivo);
    document.getElementById('loading-overlay').style.display = 'none';
}

function exportarDOCX() {
    alert('Funcionalidad de exportación a DOCX en desarrollo.');
}

// Exponer funciones al ámbito global (necesario por los onclick en el HTML)
window.eliminarTercero = eliminarTercero;
window.eliminarAnticipo = eliminarAnticipo;
window.eliminarConsumo = eliminarConsumo;
window.completarFactura = completarFactura;
window.adminChangeRole = adminChangeRole;
