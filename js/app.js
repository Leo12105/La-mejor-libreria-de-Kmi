/* ============================================
   LECTOR DE LIBROS - APP PRINCIPAL
   ============================================ */

class BookReader {
    constructor() {
        // Estado
        this.currentBook = null;
        this.bookType = null; // 'epub' o 'pdf'
        this.epubBook = null;
        this.epubRendition = null;
        this.pdfDoc = null;
        this.pdfCurrentPage = 1;
        this.pdfTotalPages = 0;
        this.fontSize = 16;
        this.fontFamily = 'Georgia, serif';
        this.currentTheme = 'theme-light';
        this.bookmarks = {};
        this.recentBooks = [];
        this.isFullscreen = false;

        // Configurar PDF.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        this.init();
    }

    init() {
        this.loadSettings();
        this.bindEvents();
        this.renderRecentBooks();
        this.applyTheme(this.currentTheme);
    }

    // =========================================
    // EVENTOS
    // =========================================
    bindEvents() {
        // Selección de archivo
        const fileInput = document.getElementById('file-input');
        const btnSelectFile = document.getElementById('btn-select-file');
        const dropZone = document.getElementById('drop-zone');

        btnSelectFile.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });

        dropZone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
            }
        });

        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // Navegación
        document.getElementById('btn-back').addEventListener('click', () => this.goHome());
        document.getElementById('btn-prev').addEventListener('click', () => this.prevPage());
        document.getElementById('btn-next').addEventListener('click', () => this.nextPage());

        // Teclado
        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('reader-screen').classList.contains('active')) return;
            if (e.key === 'ArrowLeft') this.prevPage();
            if (e.key === 'ArrowRight') this.nextPage();
            if (e.key === 'Escape' && this.isFullscreen) this.toggleFullscreen();
        });

        // Paneles
        document.getElementById('btn-chapters').addEventListener('click', () => this.togglePanel('chapters-panel'));
        document.getElementById('btn-bookmarks').addEventListener('click', () => this.togglePanel('bookmarks-panel'));
        document.getElementById('btn-add-bookmark').addEventListener('click', () => this.addBookmark());
        document.getElementById('btn-theme').addEventListener('click', () => this.togglePanel('theme-panel'));
        document.getElementById('btn-font').addEventListener('click', () => this.togglePanel('font-panel'));
        document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());

        // Cerrar paneles
        document.getElementById('close-chapters').addEventListener('click', () => this.closeAllPanels());
        document.getElementById('close-bookmarks').addEventListener('click', () => this.closeAllPanels());
        document.getElementById('close-theme').addEventListener('click', () => this.closeAllPanels());
        document.getElementById('close-font').addEventListener('click', () => this.closeAllPanels());
        document.getElementById('overlay').addEventListener('click', () => this.closeAllPanels());

        // Temas
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                this.applyTheme(theme);
            });
        });

        // Fuentes
        document.getElementById('font-decrease').addEventListener('click', () => this.changeFontSize(-2));
        document.getElementById('font-increase').addEventListener('click', () => this.changeFontSize(2));

        document.querySelectorAll('.font-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.changeFontFamily(btn.dataset.font);
                document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Slider de progreso
        document.getElementById('progress-slider').addEventListener('input', (e) => {
            this.goToProgress(parseInt(e.target.value));
        });
    }

    // =========================================
    // MANEJO DE ARCHIVOS
    // =========================================
    handleFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();

        if (extension === 'epub') {
            this.bookType = 'epub';
            this.openEpub(file);
        } else if (extension === 'pdf') {
            this.bookType = 'pdf';
            this.openPdf(file);
        } else {
            this.showToast('❌ Formato no soportado. Usa .epub o .pdf');
            return;
        }

        this.addToRecentBooks(file.name, extension);
    }

    // =========================================
    // EPUB
    // =========================================
    async openEpub(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();

            // Limpiar anterior
            if (this.epubBook) {
                this.epubBook.destroy();
            }

            document.getElementById('epub-viewer').style.display = 'block';
            document.getElementById('pdf-canvas').style.display = 'none';

            this.epubBook = ePub(arrayBuffer);
            this.epubRendition = this.epubBook.renderTo('epub-viewer', {
                width: '100%',
                height: '100%',
                spread: 'none',
                flow: 'paginated'
            });

            await this.epubRendition.display();

            // Aplicar estilos
            this.applyEpubStyles();

            // Obtener metadata
            const metadata = await this.epubBook.loaded.metadata;
            document.getElementById('current-book-title').textContent = metadata.title || file.name;
            this.currentBook = metadata.title || file.name;

            // Cargar capítulos
            const navigation = await this.epubBook.loaded.navigation;
            this.renderChapters(navigation.toc);

            // Eventos de cambio de ubicación
            this.epubRendition.on('relocated', (location) => {
                const progress = this.epubBook.locations ? Math.round(location.start.percentage * 100) : 0;
                document.getElementById('progress-slider').value = progress;
                document.getElementById('progress-text').textContent = progress + '%';
                document.getElementById('page-info').textContent = `${progress}%`;
            });

            // Generar ubicaciones para el slider
            await this.epubBook.locations.generate(1024);

            // Restaurar posición guardada
            this.restorePosition();

            this.showReaderScreen();
            this.showToast('📖 ¡Libro cargado!');

        } catch (error) {
            console.error('Error al abrir ePub:', error);
            this.showToast('❌ Error al abrir el archivo ePub');
        }
    }

    applyEpubStyles() {
        if (!this.epubRendition) return;

        const themeColors = this.getThemeColors();

        this.epubRendition.themes.default({
            'body': {
                'background-color': themeColors.bg + ' !important',
                'color': themeColors.text + ' !important',
                'font-size': this.fontSize + 'px !important',
                'font-family': this.fontFamily + ' !important',
                'line-height': '1.8 !important'
            },
            'p': {
                'color': themeColors.text + ' !important',
                'font-size': this.fontSize + 'px !important',
                'font-family': this.fontFamily + ' !important',
            },
            'h1, h2, h3, h4, h5, h6': {
                'color': themeColors.text + ' !important'
            },
            'a': {
                'color': '#6c5ce7 !important'
            },
            'span': {
                'color': themeColors.text + ' !important'
            },
            'div': {
                'color': themeColors.text + ' !important'
            }
        });
    }

    getThemeColors() {
        const themes = {
            'theme-light': { bg: '#ffffff', text: '#333333' },
            'theme-dark': { bg: '#1a1a2e', text: '#d4d4d4' },
            'theme-sepia': { bg: '#f4ecd8', text: '#5b4636' },
            'theme-old-paper': { bg: '#d4c5a9', text: '#3e2f1c' },
            'theme-green': { bg: '#e8f5e9', text: '#1b5e20' },
            'theme-blue': { bg: '#1a237e', text: '#c5cae9' },
            'theme-rose': { bg: '#fce4ec', text: '#880e4f' },
            'theme-cream': { bg: '#fff8e1', text: '#4e342e' }
        };
        return themes[this.currentTheme] || themes['theme-light'];
    }

    // =========================================
    // PDF
    // =========================================
    async openPdf(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();

            document.getElementById('epub-viewer').style.display = 'none';
            document.getElementById('pdf-canvas').style.display = 'block';

            this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            this.pdfTotalPages = this.pdfDoc.numPages;
            this.pdfCurrentPage = 1;

            document.getElementById('current-book-title').textContent = file.name;
            this.currentBook = file.name;

            // Generar capítulos (por páginas)
            this.renderPdfChapters();

            // Restaurar posición
            this.restorePosition();

            await this.renderPdfPage(this.pdfCurrentPage);
            this.showReaderScreen();
            this.showToast('📄 ¡PDF cargado! - ' + this.pdfTotalPages + ' páginas');

        } catch (error) {
            console.error('Error al abrir PDF:', error);
            this.showToast('❌ Error al abrir el archivo PDF');
        }
    }

    async renderPdfPage(pageNumber) {
        if (!this.pdfDoc || pageNumber < 1 || pageNumber > this.pdfTotalPages) return;

        this.pdfCurrentPage = pageNumber;

        const page = await this.pdfDoc.getPage(pageNumber);
        const canvas = document.getElementById('pdf-canvas');
        const context = canvas.getContext('2d');

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Actualizar UI
        const progress = Math.round((pageNumber / this.pdfTotalPages) * 100);
        document.getElementById('progress-slider').value = progress;
        document.getElementById('progress-text').textContent = progress + '%';
        document.getElementById('page-info').textContent = `Página ${pageNumber} de ${this.pdfTotalPages}`;

        // Guardar posición
        this.savePosition();
    }

    renderPdfChapters() {
        const list = document.getElementById('chapters-list');
        list.innerHTML = '';

        // Crear entradas cada 10 páginas + páginas individuales
        const step = this.pdfTotalPages > 50 ? 10 : 1;

        for (let i = 1; i <= this.pdfTotalPages; i += step) {
            const item = document.createElement('div');
            item.className = 'chapter-item';
            item.textContent = step > 1 ? `Páginas ${i} - ${Math.min(i + step - 1, this.pdfTotalPages)}` : `Página ${i}`;
            item.addEventListener('click', () => {
                this.renderPdfPage(i);
                this.closeAllPanels();
            });
            list.appendChild(item);
        }
    }

    // =========================================
    // NAVEGACIÓN
    // =========================================
    prevPage() {
        if (this.bookType === 'epub' && this.epubRendition) {
            this.epubRendition.prev();
            this.savePosition();
        } else if (this.bookType === 'pdf') {
            this.renderPdfPage(this.pdfCurrentPage - 1);
        }
    }

    nextPage() {
        if (this.bookType === 'epub' && this.epubRendition) {
            this.epubRendition.next();
            this.savePosition();
        } else if (this.bookType === 'pdf') {
            this.renderPdfPage(this.pdfCurrentPage + 1);
        }
    }

    goToProgress(percent) {
        if (this.bookType === 'epub' && this.epubBook && this.epubBook.locations) {
            const cfi = this.epubBook.locations.cfiFromPercentage(percent / 100);
            this.epubRendition.display(cfi);
        } else if (this.bookType === 'pdf') {
            const page = Math.max(1, Math.round((percent / 100) * this.pdfTotalPages));
            this.renderPdfPage(page);
        }
    }

    // =========================================
    // CAPÍTULOS
    // =========================================
    renderChapters(toc) {
        const list = document.getElementById('chapters-list');
        list.innerHTML = '';

        if (!toc || toc.length === 0) {
            list.innerHTML = '<div class="empty-state">No se encontraron capítulos</div>';
            return;
        }

        const renderItems = (items, level = 0) => {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'chapter-item';
                div.style.paddingLeft = (15 + level * 20) + 'px';
                div.textContent = item.label.trim();
                div.addEventListener('click', () => {
                    this.epubRendition.display(item.href);
                    this.closeAllPanels();
                });
                list.appendChild(div);

                if (item.subitems && item.subitems.length > 0) {
                    renderItems(item.subitems, level + 1);
                }
            });
        };

        renderItems(toc);
    }

    // =========================================
    // MARCADORES
    // =========================================
    addBookmark() {
        const bookId = this.getBookId();
        if (!bookId) return;

        if (!this.bookmarks[bookId]) {
            this.bookmarks[bookId] = [];
        }

        let bookmarkData;

        if (this.bookType === 'epub' && this.epubRendition) {
            const location = this.epubRendition.currentLocation();
            if (!location || !location.start) {
                this.showToast('⚠️ No se pudo obtener la ubicación');
                return;
            }
            bookmarkData = {
                id: Date.now(),
                cfi: location.start.cfi,
                label: 'Marcador - ' + new Date().toLocaleString(),
                page: Math.round((location.start.percentage || 0) * 100) + '%',
                type: 'epub'
            };
        } else if (this.bookType === 'pdf') {
            bookmarkData = {
                id: Date.now(),
                page: this.pdfCurrentPage,
                label: 'Página ' + this.pdfCurrentPage + ' - ' + new Date().toLocaleString(),
                type: 'pdf'
            };
        }

        // Verificar si ya existe
        const exists = this.bookmarks[bookId].some(b => {
            if (b.type === 'epub') return b.cfi === bookmarkData.cfi;
            return b.page === bookmarkData.page;
        });

        if (exists) {
            this.showToast('⚠️ Ya existe un marcador aquí');
            return;
        }

        this.bookmarks[bookId].push(bookmarkData);
        this.saveSettings();
        this.renderBookmarks();
        this.showToast('⭐ ¡Marcador añadido!');
    }

    renderBookmarks() {
        const list = document.getElementById('bookmarks-list');
        const bookId = this.getBookId();
        list.innerHTML = '';

        const bookBookmarks = this.bookmarks[bookId] || [];

        if (bookBookmarks.length === 0) {
            list.innerHTML = '<div class="empty-state">📌 No tienes marcadores aún.<br>Pulsa ⭐ para añadir uno.</div>';
            return;
        }

        bookBookmarks.forEach(bookmark => {
            const item = document.createElement('div');
            item.className = 'bookmark-item';
            item.innerHTML = `
                <div class="bookmark-info">
                    <div class="bookmark-title">${bookmark.label}</div>
                    <div class="bookmark-page">${bookmark.type === 'pdf' ? 'Página ' + bookmark.page : bookmark.page}</div>
                </div>
                <button class="bookmark-delete" data-id="${bookmark.id}" title="Eliminar">🗑️</button>
            `;

            // Ir al marcador
            item.querySelector('.bookmark-info').addEventListener('click', () => {
                if (bookmark.type === 'epub') {
                    this.epubRendition.display(bookmark.cfi);
                } else {
                    this.renderPdfPage(bookmark.page);
                }
                this.closeAllPanels();
            });

            // Eliminar marcador
            item.querySelector('.bookmark-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeBookmark(bookId, bookmark.id);
            });

            list.appendChild(item);
        });
    }

    removeBookmark(bookId, bookmarkId) {
        this.bookmarks[bookId] = this.bookmarks[bookId].filter(b => b.id !== bookmarkId);
        this.saveSettings();
        this.renderBookmarks();
        this.showToast('🗑️ Marcador eliminado');
    }

    // =========================================
    // TEMAS
    // =========================================
    applyTheme(theme) {
        document.body.className = theme;
        if (document.body.classList.contains('fullscreen-mode')) {
            document.body.classList.add('fullscreen-mode');
        }
        this.currentTheme = theme;

        // Actualizar botones activos
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });

        // Aplicar al ePub
        if (this.epubRendition) {
            this.applyEpubStyles();
        }

        this.saveSettings();
    }

    // =========================================
    // FUENTES
    // =========================================
    changeFontSize(delta) {
        this.fontSize = Math.max(12, Math.min(32, this.fontSize + delta));
        document.getElementById('font-size-display').textContent = this.fontSize + 'px';
        document.documentElement.style.setProperty('--font-size', this.fontSize + 'px');

        if (this.epubRendition) {
            this.applyEpubStyles();
        }

        this.saveSettings();
    }

    changeFontFamily(family) {
        this.fontFamily = family;
        document.documentElement.style.setProperty('--font-family', family);

        if (this.epubRendition) {
            this.applyEpubStyles();
        }

        this.saveSettings();
    }

    // =========================================
    // PANTALLA COMPLETA
    // =========================================
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                document.body.classList.add('fullscreen-mode');
                this.isFullscreen = true;
                this.showToast('⛶ Pantalla completa activada');
            }).catch(err => {
                // Fallback sin API nativa
                document.body.classList.add('fullscreen-mode');
                this.isFullscreen = true;
                this.showToast('⛶ Modo inmersivo activado');
            });
        } else {
            document.exitFullscreen().then(() => {
                document.body.classList.remove('fullscreen-mode');
                this.isFullscreen = false;
            });
        }
    }

    // =========================================
    // PANELES
    // =========================================
    togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        const isOpen = panel.classList.contains('open');

        this.closeAllPanels();

        if (!isOpen) {
            panel.classList.add('open');
            document.getElementById('overlay').classList.add('active');

            if (panelId === 'bookmarks-panel') {
                this.renderBookmarks();
            }
        }
    }

    closeAllPanels() {
        document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
        document.getElementById('overlay').classList.remove('active');
    }

    // =========================================
    // NAVEGACIÓN DE PANTALLAS
    // =========================================
    showReaderScreen() {
        document.getElementById('home-screen').classList.remove('active');
        document.getElementById('reader-screen').classList.add('active');
    }

    goHome() {
        this.savePosition();

        if (this.epubBook) {
            this.epubBook.destroy();
            this.epubBook = null;
            this.epubRendition = null;
        }

        document.getElementById('epub-viewer').innerHTML = '';
        document.getElementById('reader-screen').classList.remove('active');
        document.getElementById('home-screen').classList.add('active');

        if (this.isFullscreen && document.fullscreenElement) {
            document.exitFullscreen();
            document.body.classList.remove('fullscreen-mode');
            this.isFullscreen = false;
        }

        this.closeAllPanels();
    }

    // =========================================
    // LIBROS RECIENTES
    // =========================================
    addToRecentBooks(name, type) {
        // Evitar duplicados
        this.recentBooks = this.recentBooks.filter(b => b.name !== name);

        this.recentBooks.unshift({
            name: name,
            type: type,
            date: new Date().toLocaleDateString()
        });

        // Máximo 20
        this.recentBooks = this.recentBooks.slice(0, 20);
        this.saveSettings();
        this.renderRecentBooks();
    }

    renderRecentBooks() {
        const grid = document.getElementById('books-grid');
        const container = document.getElementById('recent-books');

        if (this.recentBooks.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        grid.innerHTML = '';

        this.recentBooks.forEach((book, index) => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.innerHTML = `
                <div class="book-emoji">${book.type === 'epub' ? '📗' : '📕'}</div>
                <div class="book-name">${book.name}</div>
                <div class="book-type">${book.type.toUpperCase()} · ${book.date}</div>
                <button class="book-delete" data-index="${index}" title="Eliminar">✕</button>
            `;

            card.querySelector('.book-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.recentBooks.splice(index, 1);
                this.saveSettings();
                this.renderRecentBooks();
                this.showToast('🗑️ Libro eliminado del historial');
            });

            grid.appendChild(card);
        });
    }

    // =========================================
    // PERSISTENCIA (localStorage)
    // =========================================
    getBookId() {
        return this.currentBook ? this.currentBook.replace(/[^a-zA-Z0-9]/g, '_') : null;
    }

    savePosition() {
        const bookId = this.getBookId();
        if (!bookId) return;

        let position;
        if (this.bookType === 'epub' && this.epubRendition) {
            const location = this.epubRendition.currentLocation();
            if (location && location.start) {
                position = { type: 'epub', cfi: location.start.cfi };
            }
        } else if (this.bookType === 'pdf') {
            position = { type: 'pdf', page: this.pdfCurrentPage };
        }

        if (position) {
            const positions = JSON.parse(localStorage.getItem('bookPositions') || '{}');
            positions[bookId] = position;
            localStorage.setItem('bookPositions', JSON.stringify(positions));
        }
    }

    restorePosition() {
        const bookId = this.getBookId();
        if (!bookId) return;

        const positions = JSON.parse(localStorage.getItem('bookPositions') || '{}');
        const position = positions[bookId];

        if (position) {
            if (position.type === 'epub' && this.epubRendition) {
                this.epubRendition.display(position.cfi);
            } else if (position.type === 'pdf') {
                this.pdfCurrentPage = position.page;
                this.renderPdfPage(this.pdfCurrentPage);
            }
        }
    }

    saveSettings() {
        const settings = {
            theme: this.currentTheme,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            bookmarks: this.bookmarks,
            recentBooks: this.recentBooks
        };
        localStorage.setItem('readerSettings', JSON.stringify(settings));
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('readerSettings') || '{}');

        if (settings.theme) this.currentTheme = settings.theme;
        if (settings.fontSize) this.fontSize = settings.fontSize;
        if (settings.fontFamily) this.fontFamily = settings.fontFamily;
        if (settings.bookmarks) this.bookmarks = settings.bookmarks;
        if (settings.recentBooks) this.recentBooks = settings.recentBooks;

        document.getElementById('font-size-display').textContent = this.fontSize + 'px';
        document.documentElement.style.setProperty('--font-size', this.fontSize + 'px');
        document.documentElement.style.setProperty('--font-family', this.fontFamily);
    }

    // =========================================
    // UTILIDADES
    // =========================================
    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

// ============================================
// INICIALIZAR APP
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    window.reader = new BookReader();
});
