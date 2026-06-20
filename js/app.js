/* ============================================
   LECTOR DE LIBROS - v2.0
   ============================================ */

class BookReader {
    constructor() {
        this.currentBook = null;
        this.bookType = null;
        this.epubBook = null;
        this.epubRendition = null;
        this.pdfDoc = null;
        this.pdfPage = 1;
        this.pdfTotal = 0;
        this.fontSize = 16;
        this.fontFamily = 'Georgia, serif';
        this.currentTheme = 'theme-light';
        this.bookmarks = {};
        this.recentBooks = [];
        this.isFullscreen = false;
        this.isTurning = false;
        this.barsVisible = true;
        this.barsTimer = null;
        this.swipeStartX = 0;
        this.swipeStartY = 0;
        this.swipeThreshold = 50;

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

    // ============================================
    // TOAST MEJORADO
    // ============================================
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast-item ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3000);
    }

    // ============================================
    // EVENTOS
    // ============================================
    bindEvents() {
        const fileInput = document.getElementById('file-input');
        const btnSelect = document.getElementById('btn-select-file');
        const dropZone = document.getElementById('drop-zone');

        btnSelect.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => {
            if (e.target.files[0]) this.handleFile(e.target.files[0]);
        });

        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
        });

        // Navegación
        document.getElementById('btn-back').addEventListener('click', () => this.goHome());
        document.getElementById('touch-left').addEventListener('click', () => this.prevPage());
        document.getElementById('touch-right').addEventListener('click', () => this.nextPage());

        // Swipe táctil
        const wrapper = document.getElementById('reader-wrapper');
        wrapper.addEventListener('touchstart', e => this.onTouchStart(e), { passive: true });
        wrapper.addEventListener('touchend', e => this.onTouchEnd(e), { passive: true });

        // Teclado (flechas + volumen)
        document.addEventListener('keydown', e => this.onKeyDown(e));

        // Paneles
        document.getElementById('btn-chapters').addEventListener('click', () => this.togglePanel('chapters-panel'));
        document.getElementById('btn-bookmarks').addEventListener('click', () => this.togglePanel('bookmarks-panel'));
        document.getElementById('btn-add-bookmark').addEventListener('click', () => this.addBookmark());
        document.getElementById('btn-theme').addEventListener('click', () => this.togglePanel('theme-panel'));
        document.getElementById('btn-font').addEventListener('click', () => this.togglePanel('font-panel'));
        document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());

        // Cerrar paneles
        ['close-chapters', 'close-bookmarks', 'close-theme', 'close-font'].forEach(id => {
            document.getElementById(id).addEventListener('click', () => this.closeAllPanels());
        });
        document.getElementById('overlay').addEventListener('click', () => this.closeAllPanels());

        // Temas
        document.querySelectorAll('.theme-card').forEach(btn => {
            btn.addEventListener('click', () => this.applyTheme(btn.dataset.theme));
        });

        // Fuentes
        document.getElementById('font-decrease').addEventListener('click', () => this.changeFontSize(-2));
        document.getElementById('font-increase').addEventListener('click', () => this.changeFontSize(2));
        document.querySelectorAll('.font-option').forEach(btn => {
            btn.addEventListener('click', () => this.changeFontFamily(btn.dataset.font));
        });

        // Slider
        document.getElementById('progress-slider').addEventListener('input', e => {
            this.goToProgress(parseInt(e.target.value));
        });

        // Tap central para mostrar/ocultar barras en fullscreen
        const readerContent = document.getElementById('reader-content');
        readerContent.addEventListener('click', e => {
            if (this.isFullscreen) {
                const rect = readerContent.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const w = rect.width;
                // Solo zona central (30%-70%)
                if (x > w * 0.3 && x < w * 0.7) {
                    this.toggleBars();
                }
            }
        });

        // Escuchar fullscreen change nativo
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove('fullscreen-mode', 'show-bars');
                this.isFullscreen = false;
            }
        });
    }

    // ============================================
    // SWIPE TÁCTIL
    // ============================================
    onTouchStart(e) {
        const touch = e.touches[0];
        this.swipeStartX = touch.clientX;
        this.swipeStartY = touch.clientY;
    }

    onTouchEnd(e) {
        const touch = e.changedTouches[0];
        const dx = touch.clientX - this.swipeStartX;
        const dy = touch.clientY - this.swipeStartY;

        // Solo considerar swipe horizontal (no vertical)
        if (Math.abs(dx) > this.swipeThreshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) {
                this.nextPage(); // Swipe izquierda = siguiente
            } else {
                this.prevPage(); // Swipe derecha = anterior
            }
        }
    }

    // ============================================
    // TECLADO + BOTONES DE VOLUMEN
    // ============================================
    onKeyDown(e) {
        if (!document.getElementById('reader-screen').classList.contains('active')) return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.prevPage();
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.nextPage();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.prevPage();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.nextPage();
                break;
            case 'Escape':
                if (this.isFullscreen) this.toggleFullscreen();
                break;
            case 'AudioVolumeUp':
                e.preventDefault();
                this.nextPage();
                break;
            case 'AudioVolumeDown':
                e.preventDefault();
                this.prevPage();
                break;
        }
    }

    // ============================================
    // ANIMACIÓN DE PASO DE PÁGINA
    // ============================================
    playPageTurn(direction) {
        if (this.isTurning) return;
        this.isTurning = true;

        const page = document.getElementById('page-turn-page');
        page.className = 'page-turn-page';

        // Forzar reflow
        void page.offsetWidth;

        page.classList.add(direction === 'next' ? 'turn-next' : 'turn-prev');

        setTimeout(() => {
            page.className = 'page-turn-page';
            page.style.display = 'none';
            this.isTurning = false;
        }, 500);
    }

    // ============================================
    // ARCHIVOS
    // ============================================
    handleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'epub') {
            this.bookType = 'epub';
            this.openEpub(file);
        } else if (ext === 'pdf') {
            this.bookType = 'pdf';
            this.openPdf(file);
        } else {
            this.showToast('Formato no soportado. Usa .epub o .pdf', 'error');
            return;
        }

        this.addToRecent(file.name, ext);
    }

    // ============================================
    // EPUB
    // ============================================
    async openEpub(file) {
        try {
            this.showToast('Cargando libro...', 'info');

            const buf = await file.arrayBuffer();
            if (this.epubBook) this.epubBook.destroy();

            document.getElementById('epub-viewer').style.display = 'block';
            document.getElementById('epub-viewer').innerHTML = '';
            document.getElementById('pdf-canvas').style.display = 'none';

            this.epubBook = ePub(buf);

            // Esperar a que el contenedor esté visible
            this.showReaderScreen();

            await new Promise(r => setTimeout(r, 100));

            const viewerEl = document.getElementById('epub-viewer');
            const w = viewerEl.clientWidth;
            const h = viewerEl.clientHeight;

            this.epubRendition = this.epubBook.renderTo('epub-viewer', {
                width: w,
                height: h,
                spread: 'none',
                flow: 'paginated',
                manager: 'default'
            });

            this.applyEpubStyles();
            await this.epubRendition.display();

            const meta = await this.epubBook.loaded.metadata;
            const title = meta.title || file.name.replace(/\.epub$/i, '');
            document.getElementById('current-book-title').textContent = title;
            this.currentBook = title;

            const nav = await this.epubBook.loaded.navigation;
            this.renderChapters(nav.toc);

            this.epubRendition.on('relocated', loc => {
                const pct = Math.round((loc.start.percentage || 0) * 100);
                document.getElementById('progress-slider').value = pct;
                document.getElementById('progress-label-left').textContent = pct + '%';
                document.getElementById('page-info').textContent = pct + '%';
                this.savePosition();
            });

            try {
                await this.epubBook.locations.generate(1024);
            } catch (e) { /* ok */ }

            this.restorePosition();
            this.showToast('📖 ¡Libro cargado!', 'success');

            // Resize handler
            this.setupResizeHandler();

        } catch (err) {
            console.error(err);
            this.showToast('Error al abrir el ePub', 'error');
        }
    }

    setupResizeHandler() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        this._resizeHandler = () => {
            if (this.epubRendition) {
                const el = document.getElementById('epub-viewer');
                if (el) {
                    this.epubRendition.resize(el.clientWidth, el.clientHeight);
                }
            }
        };
        window.addEventListener('resize', this._resizeHandler);
    }

    applyEpubStyles() {
        if (!this.epubRendition) return;
        const c = this.getThemeColors();

        this.epubRendition.themes.default({
            'html': {
                'background': c.bg + ' !important',
            },
            'body': {
                'background': c.bg + ' !important',
                'color': c.text + ' !important',
                'font-size': this.fontSize + 'px !important',
                'font-family': this.fontFamily + ' !important',
                'line-height': '1.8 !important',
                'padding': '10px !important',
            },
            'p, span, div, li, td, th, dd, dt, figcaption, blockquote': {
                'color': c.text + ' !important',
                'font-size': 'inherit !important',
                'font-family': 'inherit !important',
            },
            'h1,h2,h3,h4,h5,h6': {
                'color': c.text + ' !important',
            },
            'a': { 'color': '#6c5ce7 !important' },
            'img': { 'max-width': '100% !important', 'height': 'auto !important' }
        });
    }

    getThemeColors() {
        const t = {
            'theme-light': { bg: '#ffffff', text: '#333333' },
            'theme-dark': { bg: '#1a1a2e', text: '#d4d4d4' },
            'theme-sepia': { bg: '#f4ecd8', text: '#5b4636' },
            'theme-old-paper': { bg: '#d4c5a9', text: '#3e2f1c' },
            'theme-green': { bg: '#e8f5e9', text: '#1b5e20' },
            'theme-blue': { bg: '#1a237e', text: '#c5cae9' },
            'theme-rose': { bg: '#fce4ec', text: '#880e4f' },
            'theme-cream': { bg: '#fff8e1', text: '#4e342e' },
        };
        return t[this.currentTheme] || t['theme-light'];
    }

    // ============================================
    // PDF
    // ============================================
    async openPdf(file) {
        try {
            this.showToast('Cargando PDF...', 'info');

            const buf = await file.arrayBuffer();

            document.getElementById('epub-viewer').style.display = 'none';
            const canvas = document.getElementById('pdf-canvas');
            canvas.style.display = 'block';

            this.pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
            this.pdfTotal = this.pdfDoc.numPages;
            this.pdfPage = 1;

            const title = file.name.replace(/\.pdf$/i, '');
            document.getElementById('current-book-title').textContent = title;
            this.currentBook = title;

            this.renderPdfChapters();
            this.showReaderScreen();

            await new Promise(r => setTimeout(r, 100));
            this.restorePosition();
            await this.renderPdfPage(this.pdfPage);

            this.showToast(`📄 PDF cargado · ${this.pdfTotal} páginas`, 'success');
        } catch (err) {
            console.error(err);
            this.showToast('Error al abrir el PDF', 'error');
        }
    }

    async renderPdfPage(num) {
        if (!this.pdfDoc || num < 1 || num > this.pdfTotal) return;
        this.pdfPage = num;

        const page = await this.pdfDoc.getPage(num);
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');

        // Adaptar al contenedor
        const wrapper = document.getElementById('reader-wrapper');
        const maxW = wrapper.clientWidth - 20;
        const maxH = wrapper.clientHeight - 20;

        const origVP = page.getViewport({ scale: 1 });
        const scaleW = maxW / origVP.width;
        const scaleH = maxH / origVP.height;
        const scale = Math.min(scaleW, scaleH, 2.5);

        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const pct = Math.round((num / this.pdfTotal) * 100);
        document.getElementById('progress-slider').value = pct;
        document.getElementById('progress-label-left').textContent = pct + '%';
        document.getElementById('page-info').textContent = `${num} / ${this.pdfTotal}`;

        this.savePosition();
    }

    renderPdfChapters() {
        const list = document.getElementById('chapters-list');
        list.innerHTML = '';

        for (let i = 1; i <= this.pdfTotal; i++) {
            const item = document.createElement('div');
            item.className = 'chapter-item';
            item.textContent = `Página ${i}`;
            item.addEventListener('click', () => {
                this.playPageTurn('next');
                setTimeout(() => this.renderPdfPage(i), 200);
                this.closeAllPanels();
            });
            list.appendChild(item);
        }
    }

    // ============================================
    // NAVEGACIÓN
    // ============================================
    prevPage() {
        if (this.isTurning) return;

        this.playPageTurn('prev');

        if (this.bookType === 'epub' && this.epubRendition) {
            this.epubRendition.prev();
        } else if (this.bookType === 'pdf') {
            if (this.pdfPage > 1) {
                setTimeout(() => this.renderPdfPage(this.pdfPage - 1), 150);
            }
        }
    }

    nextPage() {
        if (this.isTurning) return;

        this.playPageTurn('next');

        if (this.bookType === 'epub' && this.epubRendition) {
            this.epubRendition.next();
        } else if (this.bookType === 'pdf') {
            if (this.pdfPage < this.pdfTotal) {
                setTimeout(() => this.renderPdfPage(this.pdfPage + 1), 150);
            }
        }
    }

    goToProgress(pct) {
        if (this.bookType === 'epub' && this.epubBook) {
            try {
                const cfi = this.epubBook.locations.cfiFromPercentage(pct / 100);
                if (cfi) this.epubRendition.display(cfi);
            } catch (e) { /* ok */ }
        } else if (this.bookType === 'pdf') {
            const pg = Math.max(1, Math.round((pct / 100) * this.pdfTotal));
            this.renderPdfPage(pg);
        }
    }

    // ============================================
    // CAPÍTULOS
    // ============================================
    renderChapters(toc) {
        const list = document.getElementById('chapters-list');
        list.innerHTML = '';

        if (!toc || toc.length === 0) {
            list.innerHTML = '<div class="empty-state">No se encontraron capítulos</div>';
            return;
        }

        const build = (items, level = 0) => {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'chapter-item';
                div.style.paddingLeft = (14 + level * 16) + 'px';
                div.textContent = item.label.trim();
                div.addEventListener('click', () => {
                    this.epubRendition.display(item.href);
                    this.closeAllPanels();
                    this.playPageTurn('next');
                });
                list.appendChild(div);
                if (item.subitems) build(item.subitems, level + 1);
            });
        };

        build(toc);
    }

    // ============================================
    // MARCADORES
    // ============================================
    addBookmark() {
        const id = this.getBookId();
        if (!id) return;
        if (!this.bookmarks[id]) this.bookmarks[id] = [];

        let data;

        if (this.bookType === 'epub' && this.epubRendition) {
            const loc = this.epubRendition.currentLocation();
            if (!loc || !loc.start) {
                this.showToast('No se pudo guardar el marcador', 'warning');
                return;
            }
            const pct = Math.round((loc.start.percentage || 0) * 100);
            data = {
                id: Date.now(),
                cfi: loc.start.cfi,
                label: `${pct}% · ${new Date().toLocaleTimeString()}`,
                page: pct + '%',
                type: 'epub'
            };

            if (this.bookmarks[id].some(b => b.cfi === data.cfi)) {
                this.showToast('Ya hay un marcador aquí', 'warning');
                return;
            }
        } else if (this.bookType === 'pdf') {
            data = {
                id: Date.now(),
                page: this.pdfPage,
                label: `Página ${this.pdfPage} · ${new Date().toLocaleTimeString()}`,
                type: 'pdf'
            };

            if (this.bookmarks[id].some(b => b.page === data.page)) {
                this.showToast('Ya hay un marcador aquí', 'warning');
                return;
            }
        }

        this.bookmarks[id].push(data);
        this.saveSettings();
        this.showToast('⭐ Marcador guardado', 'success');
    }

    renderBookmarks() {
        const list = document.getElementById('bookmarks-list');
        const id = this.getBookId();
        list.innerHTML = '';

        const marks = this.bookmarks[id] || [];

        if (marks.length === 0) {
            list.innerHTML = '<div class="empty-state">No tienes marcadores.<br>Toca ⭐ para añadir uno.</div>';
            return;
        }

        marks.forEach(bm => {
            const item = document.createElement('div');
            item.className = 'bookmark-item';
            item.innerHTML = `
                <div class="bookmark-info">
                    <div class="bookmark-title">🔖 ${bm.label}</div>
                    <div class="bookmark-page">${bm.type === 'pdf' ? 'Página ' + bm.page : bm.page}</div>
                </div>
                <button class="bookmark-delete" title="Eliminar">✕</button>
            `;

            item.querySelector('.bookmark-info').addEventListener('click', () => {
                if (bm.type === 'epub') this.epubRendition.display(bm.cfi);
                else this.renderPdfPage(bm.page);
                this.closeAllPanels();
                this.playPageTurn('next');
            });

            item.querySelector('.bookmark-delete').addEventListener('click', e => {
                e.stopPropagation();
                this.bookmarks[id] = this.bookmarks[id].filter(b => b.id !== bm.id);
                this.saveSettings();
                this.renderBookmarks();
                this.showToast('Marcador eliminado', 'info');
            });

            list.appendChild(item);
        });
    }

    // ============================================
    // TEMAS
    // ============================================
    applyTheme(theme) {
        const wasFullscreen = document.body.classList.contains('fullscreen-mode');
        document.body.className = theme;
        if (wasFullscreen) document.body.classList.add('fullscreen-mode');
        if (this.barsVisible && wasFullscreen) document.body.classList.add('show-bars');

        this.currentTheme = theme;

        document.querySelectorAll('.theme-card').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });

        if (this.epubRendition) {
            this.applyEpubStyles();
        }

        this.saveSettings();
        this.showToast('🎨 Tema aplicado', 'success');
    }

    // ============================================
    // FUENTES
    // ============================================
    changeFontSize(delta) {
        this.fontSize = Math.max(10, Math.min(36, this.fontSize + delta));
        document.getElementById('font-size-display').textContent = this.fontSize + 'px';
        document.documentElement.style.setProperty('--font-size', this.fontSize + 'px');

        if (this.epubRendition) this.applyEpubStyles();
        this.saveSettings();
    }

    changeFontFamily(family) {
        this.fontFamily = family;
        document.documentElement.style.setProperty('--font-family', family);

        document.querySelectorAll('.font-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.font === family);
        });

        if (this.epubRendition) this.applyEpubStyles();
        this.saveSettings();
    }

    // ============================================
    // PANTALLA COMPLETA
    // ============================================
    toggleFullscreen() {
        if (!this.isFullscreen) {
            const el = document.documentElement;
            const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;

            if (rfs) {
                rfs.call(el).then(() => {
                    this.isFullscreen = true;
                    document.body.classList.add('fullscreen-mode');
                    this.barsVisible = false;
                    this.showToast('Pantalla completa · Toca el centro para ver controles', 'info');
                }).catch(() => {
                    // Fallback
                    this.isFullscreen = true;
                    document.body.classList.add('fullscreen-mode');
                    this.barsVisible = false;
                    this.showToast('Modo inmersivo activado', 'info');
                });
            } else {
                this.isFullscreen = true;
                document.body.classList.add('fullscreen-mode');
                this.barsVisible = false;
                this.showToast('Modo inmersivo activado', 'info');
            }
        } else {
            const efs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (efs && document.fullscreenElement) {
                efs.call(document);
            }
            this.isFullscreen = false;
            document.body.classList.remove('fullscreen-mode', 'show-bars');
            this.barsVisible = true;
            this.showToast('Pantalla completa desactivada', 'info');
        }
    }

    toggleBars() {
        this.barsVisible = !this.barsVisible;
        document.body.classList.toggle('show-bars', this.barsVisible);

        if (this.barsVisible) {
            clearTimeout(this.barsTimer);
            this.barsTimer = setTimeout(() => {
                this.barsVisible = false;
                document.body.classList.remove('show-bars');
            }, 4000);
        }
    }

    // ============================================
    // PANELES
    // ============================================
    togglePanel(id) {
        const panel = document.getElementById(id);
        const isOpen = panel.classList.contains('open');

        this.closeAllPanels();

        if (!isOpen) {
            panel.classList.add('open');
            document.getElementById('overlay').classList.add('active');
            if (id === 'bookmarks-panel') this.renderBookmarks();
        }
    }

    closeAllPanels() {
        document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
        document.getElementById('overlay').classList.remove('active');
    }

    // ============================================
    // PANTALLAS
    // ============================================
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
        this.pdfDoc = null;

        document.getElementById('epub-viewer').innerHTML = '';
        document.getElementById('pdf-canvas').style.display = 'none';

        document.getElementById('reader-screen').classList.remove('active');
        document.getElementById('home-screen').classList.add('active');

        if (this.isFullscreen) {
            const efs = document.exitFullscreen || document.webkitExitFullscreen;
            if (efs && document.fullscreenElement) efs.call(document);
            document.body.classList.remove('fullscreen-mode', 'show-bars');
            this.isFullscreen = false;
        }

        this.closeAllPanels();
    }

    // ============================================
    // RECIENTES
    // ============================================
    addToRecent(name, type) {
        this.recentBooks = this.recentBooks.filter(b => b.name !== name);
        this.recentBooks.unshift({ name, type, date: new Date().toLocaleDateString() });
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

        this.recentBooks.forEach((book, i) => {
            const card = document.createElement('div');
            card.className = 'book-card';
            card.innerHTML = `
                <div class="book-emoji">${book.type === 'epub' ? '📗' : '📕'}</div>
                <div class="book-name">${book.name}</div>
                <div class="book-type">${book.type.toUpperCase()} · ${book.date}</div>
                <button class="book-delete" title="Eliminar">✕</button>
            `;

            card.querySelector('.book-delete').addEventListener('click', e => {
                e.stopPropagation();
                this.recentBooks.splice(i, 1);
                this.saveSettings();
                this.renderRecentBooks();
                this.showToast('Libro eliminado del historial', 'info');
            });

            grid.appendChild(card);
        });
    }

    // ============================================
    // PERSISTENCIA
    // ============================================
    getBookId() {
        return this.currentBook ? this.currentBook.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100) : null;
    }

    savePosition() {
        const id = this.getBookId();
        if (!id) return;

        let pos;
        if (this.bookType === 'epub' && this.epubRendition) {
            const loc = this.epubRendition.currentLocation();
            if (loc && loc.start) pos = { type: 'epub', cfi: loc.start.cfi };
        } else if (this.bookType === 'pdf') {
            pos = { type: 'pdf', page: this.pdfPage };
        }

        if (pos) {
            const all = JSON.parse(localStorage.getItem('bookPositions') || '{}');
            all[id] = pos;
            localStorage.setItem('bookPositions', JSON.stringify(all));
        }
    }

    restorePosition() {
        const id = this.getBookId();
        if (!id) return;

        const all = JSON.parse(localStorage.getItem('bookPositions') || '{}');
        const pos = all[id];

        if (pos) {
            if (pos.type === 'epub' && this.epubRendition) {
                try { this.epubRendition.display(pos.cfi); } catch (e) { /* ok */ }
            } else if (pos.type === 'pdf') {
                this.pdfPage = pos.page || 1;
            }
        }
    }

    saveSettings() {
        localStorage.setItem('readerSettings', JSON.stringify({
            theme: this.currentTheme,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            bookmarks: this.bookmarks,
            recentBooks: this.recentBooks
        }));
    }

    loadSettings() {
        const s = JSON.parse(localStorage.getItem('readerSettings') || '{}');
        if (s.theme) this.currentTheme = s.theme;
        if (s.fontSize) this.fontSize = s.fontSize;
        if (s.fontFamily) this.fontFamily = s.fontFamily;
        if (s.bookmarks) this.bookmarks = s.bookmarks;
        if (s.recentBooks) this.recentBooks = s.recentBooks;

        document.getElementById('font-size-display').textContent = this.fontSize + 'px';
        document.documentElement.style.setProperty('--font-size', this.fontSize + 'px');
        document.documentElement.style.setProperty('--font-family', this.fontFamily);
    }
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    window.reader = new BookReader();
});

// Prevenir zoom en iOS
document.addEventListener('gesturestart', e => e.preventDefault());
