/* ============================================
   LA BIBLIOTECA DE KMI - v3.0
   ============================================ */

class BookReader {
    constructor() {
        this.currentBook = null;
        this.currentBookKey = null;
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
        this.library = { epub: [], pdf: [] };
        this.isFullscreen = false;
        this.barsVisible = true;
        this.barsTimer = null;

        // Swipe state
        this.swipeActive = false;
        this.swipeStartX = 0;
        this.swipeStartY = 0;
        this.swipeCurrentX = 0;
        this.swipeLocked = false;
        this.swipeDirection = null;
        this.pageAnimating = false;

        // File storage (IndexedDB)
        this.db = null;

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        this.initDB().then(() => this.init());
    }

    // ============================================
    // INDEXEDDB para guardar archivos
    // ============================================
    initDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('KmiLibrary', 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('books')) {
                    db.createObjectStore('books', { keyPath: 'key' });
                }
            };
            req.onsuccess = e => { this.db = e.target.result; resolve(); };
            req.onerror = () => resolve(); // continuar sin DB
        });
    }

    saveFileToDB(key, arrayBuffer, name, type) {
        if (!this.db) return;
        const tx = this.db.transaction('books', 'readwrite');
        tx.objectStore('books').put({ key, data: arrayBuffer, name, type });
    }

    loadFileFromDB(key) {
        return new Promise((resolve) => {
            if (!this.db) return resolve(null);
            const tx = this.db.transaction('books', 'readonly');
            const req = tx.objectStore('books').get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    deleteFileFromDB(key) {
        if (!this.db) return;
        const tx = this.db.transaction('books', 'readwrite');
        tx.objectStore('books').delete(key);
    }

    // ============================================
    // INIT
    // ============================================
    init() {
        this.loadSettings();
        this.bindEvents();
        this.renderLibrary();
        this.applyTheme(this.currentTheme);
    }

    // ============================================
    // TOAST
    // ============================================
    showToast(msg, type = 'info') {
        const c = document.getElementById('toast-container');
        const t = document.createElement('div');
        t.className = `toast-item ${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => { if (t.parentNode) t.remove(); }, 3200);
    }

    // ============================================
    // EVENTS
    // ============================================
    bindEvents() {
        const fileInput = document.getElementById('file-input');
        const dropZone = document.getElementById('drop-zone');

        document.getElementById('btn-select-file').addEventListener('click', e => {
            e.stopPropagation();
            fileInput.click();
        });
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => {
            if (e.target.files[0]) this.handleFile(e.target.files[0]);
            fileInput.value = '';
        });

        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
        });

        document.getElementById('btn-back').addEventListener('click', () => this.goHome());

        // ===== SWIPE =====
        const wrapper = document.getElementById('reader-wrapper');
        wrapper.addEventListener('touchstart', e => this.handleTouchStart(e), { passive: true });
        wrapper.addEventListener('touchmove', e => this.handleTouchMove(e), { passive: false });
        wrapper.addEventListener('touchend', e => this.handleTouchEnd(e), { passive: true });

        // Teclado
        document.addEventListener('keydown', e => this.onKeyDown(e));

        // Paneles
        document.getElementById('btn-chapters').addEventListener('click', () => this.togglePanel('chapters-panel'));
        document.getElementById('btn-bookmarks').addEventListener('click', () => this.togglePanel('bookmarks-panel'));
        document.getElementById('btn-add-bookmark').addEventListener('click', () => this.addBookmark());
        document.getElementById('btn-theme').addEventListener('click', () => this.togglePanel('theme-panel'));
        document.getElementById('btn-font').addEventListener('click', () => this.togglePanel('font-panel'));
        document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());

        ['close-chapters','close-bookmarks','close-theme','close-font'].forEach(id => {
            document.getElementById(id).addEventListener('click', () => this.closeAllPanels());
        });
        document.getElementById('overlay').addEventListener('click', () => this.closeAllPanels());

        document.querySelectorAll('.theme-card').forEach(btn => {
            btn.addEventListener('click', () => this.applyTheme(btn.dataset.theme));
        });

        document.getElementById('font-decrease').addEventListener('click', () => this.changeFontSize(-2));
        document.getElementById('font-increase').addEventListener('click', () => this.changeFontSize(2));
        document.querySelectorAll('.font-option').forEach(btn => {
            btn.addEventListener('click', () => this.changeFontFamily(btn.dataset.font));
        });

        document.getElementById('progress-slider').addEventListener('input', e => {
            this.goToProgress(parseInt(e.target.value));
        });

        // Tap central para fullscreen bars
        document.getElementById('reader-content').addEventListener('click', e => {
            if (this.isFullscreen) {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const w = rect.width;
                if (x > w * 0.3 && x < w * 0.7) this.toggleBars();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove('fullscreen-mode', 'show-bars');
                this.isFullscreen = false;
            }
        });
    }

    // ============================================
    // SWIPE REALISTA CON EFECTO DE PÁGINA
    // ============================================
    handleTouchStart(e) {
        if (this.pageAnimating) return;
        const t = e.touches[0];
        this.swipeStartX = t.clientX;
        this.swipeStartY = t.clientY;
        this.swipeCurrentX = t.clientX;
        this.swipeActive = true;
        this.swipeLocked = false;
        this.swipeDirection = null;
    }

    handleTouchMove(e) {
        if (!this.swipeActive || this.pageAnimating) return;

        const t = e.touches[0];
        const dx = t.clientX - this.swipeStartX;
        const dy = t.clientY - this.swipeStartY;

        // Lock direction after 10px
        if (!this.swipeLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
            this.swipeLocked = true;
            if (Math.abs(dy) > Math.abs(dx)) {
                // Vertical - cancel
                this.swipeActive = false;
                return;
            }
            this.swipeDirection = dx < 0 ? 'next' : 'prev';
        }

        if (!this.swipeLocked) return;

        e.preventDefault();
        this.swipeCurrentX = t.clientX;

        const wrapper = document.getElementById('reader-wrapper');
        const progress = Math.abs(dx) / wrapper.clientWidth;
        this.renderSwipeVisual(this.swipeDirection, Math.min(progress, 1));
    }

    handleTouchEnd(e) {
        if (!this.swipeActive || !this.swipeLocked || this.pageAnimating) {
            this.swipeActive = false;
            return;
        }

        this.swipeActive = false;

        const dx = this.swipeCurrentX - this.swipeStartX;
        const wrapper = document.getElementById('reader-wrapper');
        const progress = Math.abs(dx) / wrapper.clientWidth;

        if (progress > 0.2) {
            // Completar animación
            this.completeSwipe(this.swipeDirection);
        } else {
            // Cancelar
            this.cancelSwipe();
        }
    }

    renderSwipeVisual(direction, progress) {
        const page = document.getElementById('swipe-page');
        const shadow = document.getElementById('swipe-shadow');
        const wrapper = document.getElementById('reader-wrapper');
        const w = wrapper.clientWidth;

        page.style.display = 'block';
        shadow.style.display = 'block';
        page.style.background = getComputedStyle(document.documentElement).getPropertyValue('--reader-bg').trim();
        page.style.transition = 'none';

        if (direction === 'next') {
            // Página se levanta desde la derecha, gira hacia la izquierda
            page.style.transformOrigin = 'left center';
            const angle = progress * 180;
            page.style.left = '0';
            page.style.right = 'auto';
            page.style.width = '100%';
            page.style.transform = `perspective(1800px) rotateY(${-angle}deg)`;

            // Sombra
            shadow.style.left = (w * (1 - progress * 0.5)) + 'px';
            shadow.style.opacity = progress * 0.6;
            shadow.style.background = 'linear-gradient(to right, rgba(0,0,0,0.3), transparent)';
        } else {
            // Página viene desde la izquierda
            page.style.transformOrigin = 'right center';
            const angle = 180 - (progress * 180);
            page.style.left = '0';
            page.style.right = 'auto';
            page.style.width = '100%';
            page.style.transform = `perspective(1800px) rotateY(${angle}deg)`;

            // Sombra
            shadow.style.left = (w * progress * 0.5) - 50 + 'px';
            shadow.style.opacity = progress * 0.6;
            shadow.style.background = 'linear-gradient(to left, rgba(0,0,0,0.3), transparent)';
        }
    }

    completeSwipe(direction) {
        this.pageAnimating = true;
        const page = document.getElementById('swipe-page');
        const shadow = document.getElementById('swipe-shadow');

        page.style.transition = 'transform 0.35s ease-in';
        shadow.style.transition = 'opacity 0.35s ease-in';

        if (direction === 'next') {
            page.style.transform = 'perspective(1800px) rotateY(-180deg)';
        } else {
            page.style.transform = 'perspective(1800px) rotateY(0deg)';
        }
        shadow.style.opacity = '0';

        setTimeout(() => {
            page.style.display = 'none';
            shadow.style.display = 'none';
            page.style.transition = 'none';
            shadow.style.transition = 'none';
            this.pageAnimating = false;

            if (direction === 'next') this.doNextPage();
            else this.doPrevPage();
        }, 380);
    }

    cancelSwipe() {
        const page = document.getElementById('swipe-page');
        const shadow = document.getElementById('swipe-shadow');

        page.style.transition = 'transform 0.3s ease-out';
        shadow.style.transition = 'opacity 0.3s ease-out';

        if (this.swipeDirection === 'next') {
            page.style.transform = 'perspective(1800px) rotateY(0deg)';
        } else {
            page.style.transform = 'perspective(1800px) rotateY(180deg)';
        }
        shadow.style.opacity = '0';

        setTimeout(() => {
            page.style.display = 'none';
            shadow.style.display = 'none';
            page.style.transition = 'none';
            shadow.style.transition = 'none';
        }, 320);
    }

    // ============================================
    // KEYBOARD
    // ============================================
    onKeyDown(e) {
        if (!document.getElementById('reader-screen').classList.contains('active')) return;
        switch (e.key) {
            case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); this.triggerPrev(); break;
            case 'ArrowRight': case 'ArrowDown': e.preventDefault(); this.triggerNext(); break;
            case 'Escape': if (this.isFullscreen) this.toggleFullscreen(); break;
        }
    }

    triggerNext() {
        if (this.pageAnimating) return;
        this.pageAnimating = true;
        this.renderSwipeVisual('next', 0);

        const page = document.getElementById('swipe-page');
        const shadow = document.getElementById('swipe-shadow');
        page.style.display = 'block';
        shadow.style.display = 'block';

        requestAnimationFrame(() => {
            page.style.transition = 'transform 0.45s ease-in-out';
            shadow.style.transition = 'opacity 0.45s ease-in-out';
            page.style.transform = 'perspective(1800px) rotateY(-180deg)';
            shadow.style.opacity = '0';
        });

        setTimeout(() => {
            page.style.display = 'none';
            shadow.style.display = 'none';
            page.style.transition = 'none';
            shadow.style.transition = 'none';
            this.pageAnimating = false;
            this.doNextPage();
        }, 480);
    }

    triggerPrev() {
        if (this.pageAnimating) return;
        this.pageAnimating = true;

        const page = document.getElementById('swipe-page');
        const shadow = document.getElementById('swipe-shadow');

        page.style.display = 'block';
        shadow.style.display = 'block';
        page.style.background = getComputedStyle(document.documentElement).getPropertyValue('--reader-bg').trim();
        page.style.transformOrigin = 'right center';
        page.style.left = '0';
        page.style.width = '100%';
        page.style.transition = 'none';
        page.style.transform = 'perspective(1800px) rotateY(180deg)';
        shadow.style.opacity = '0';

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                page.style.transition = 'transform 0.45s ease-in-out';
                shadow.style.transition = 'opacity 0.45s ease-in-out';
                page.style.transform = 'perspective(1800px) rotateY(0deg)';
                shadow.style.opacity = '0.3';
            });
        });

        setTimeout(() => {
            page.style.display = 'none';
            shadow.style.display = 'none';
            page.style.transition = 'none';
            shadow.style.transition = 'none';
            this.pageAnimating = false;
            this.doPrevPage();
        }, 480);
    }

    // ============================================
    // ACTUAL PAGE CHANGES
    // ============================================
    doNextPage() {
        if (this.bookType === 'epub' && this.epubRendition) {
            this.epubRendition.next();
        } else if (this.bookType === 'pdf' && this.pdfPage < this.pdfTotal) {
            this.renderPdfPage(this.pdfPage + 1);
        }
    }

    doPrevPage() {
        if (this.bookType === 'epub' && this.epubRendition) {
            this.epubRendition.prev();
        } else if (this.bookType === 'pdf' && this.pdfPage > 1) {
            this.renderPdfPage(this.pdfPage - 1);
        }
    }

    goToProgress(pct) {
        if (this.bookType === 'epub' && this.epubBook) {
            try {
                const cfi = this.epubBook.locations.cfiFromPercentage(pct / 100);
                if (cfi) this.epubRendition.display(cfi);
            } catch (e) {}
        } else if (this.bookType === 'pdf') {
            const pg = Math.max(1, Math.round((pct / 100) * this.pdfTotal));
            this.renderPdfPage(pg);
        }
    }

    // ============================================
    // FILE HANDLING
    // ============================================
    async handleFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'epub' && ext !== 'pdf') {
            this.showToast('Formato no soportado', 'error');
            return;
        }

        const key = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') + '_' + file.size;
        const arrayBuffer = await file.arrayBuffer();

        // Guardar en IndexedDB
        this.saveFileToDB(key, arrayBuffer, file.name, ext);

        // Agregar a la biblioteca
        this.addToLibrary(key, file.name, ext);

        // Abrir
        this.openBook(key, arrayBuffer, file.name, ext);
    }

    addToLibrary(key, name, type) {
        const list = this.library[type];
        if (list.some(b => b.key === key)) return;
        list.unshift({ key, name, date: new Date().toLocaleDateString() });
        if (list.length > 50) list.pop();
        this.saveSettings();
        this.renderLibrary();
    }

    removeFromLibrary(key, type) {
        this.library[type] = this.library[type].filter(b => b.key !== key);
        this.deleteFileFromDB(key);
        // Borrar marcadores y posición
        const positions = JSON.parse(localStorage.getItem('bookPositions') || '{}');
        delete positions[key];
        localStorage.setItem('bookPositions', JSON.stringify(positions));
        delete this.bookmarks[key];
        this.saveSettings();
        this.renderLibrary();
        this.showToast('Libro eliminado', 'info');
    }

    async openBookFromLibrary(key, name, type) {
        const record = await this.loadFileFromDB(key);
        if (!record) {
            this.showToast('Archivo no encontrado. Súbelo de nuevo.', 'error');
            this.removeFromLibrary(key, type);
            return;
        }
        this.openBook(key, record.data, name, type);
    }

    openBook(key, arrayBuffer, name, type) {
        this.currentBook = name;
        this.currentBookKey = key;
        this.bookType = type;

        if (type === 'epub') this.openEpub(arrayBuffer, name);
        else this.openPdf(arrayBuffer, name);
    }

    // ============================================
    // EPUB
    // ============================================
    async openEpub(buf, name) {
        try {
            this.showToast('Cargando libro...', 'info');

            if (this.epubBook) this.epubBook.destroy();

            document.getElementById('epub-viewer').style.display = 'block';
            document.getElementById('epub-viewer').innerHTML = '';
            document.getElementById('pdf-canvas').style.display = 'none';

            this.epubBook = ePub(buf);
            this.showReaderScreen();
            await new Promise(r => setTimeout(r, 150));

            const el = document.getElementById('epub-viewer');
            this.epubRendition = this.epubBook.renderTo('epub-viewer', {
                width: el.clientWidth,
                height: el.clientHeight,
                spread: 'none',
                flow: 'paginated',
                manager: 'default'
            });

            this.applyEpubStyles();
            await this.epubRendition.display();

            const meta = await this.epubBook.loaded.metadata;
            const title = meta.title || name.replace(/\.epub$/i, '');
            document.getElementById('current-book-title').textContent = title;

            const nav = await this.epubBook.loaded.navigation;
            this.renderChapters(nav.toc);

            this.epubRendition.on('relocated', loc => {
                const pct = Math.round((loc.start.percentage || 0) * 100);
                document.getElementById('progress-slider').value = pct;
                document.getElementById('progress-label-left').textContent = pct + '%';
                document.getElementById('page-info').textContent = pct + '%';
                this.savePosition();
            });

            try { await this.epubBook.locations.generate(1024); } catch (e) {}

            this.restorePosition();
            this.showToast('📖 ¡Libro cargado!', 'success');
            this.setupResize();

        } catch (err) {
            console.error(err);
            this.showToast('Error al abrir ePub', 'error');
        }
    }

    setupResize() {
        if (this._rh) window.removeEventListener('resize', this._rh);
        this._rh = () => {
            if (this.epubRendition) {
                const el = document.getElementById('epub-viewer');
                if (el) this.epubRendition.resize(el.clientWidth, el.clientHeight);
            }
        };
        window.addEventListener('resize', this._rh);
    }

    applyEpubStyles() {
        if (!this.epubRendition) return;
        const c = this.getThemeColors();
        this.epubRendition.themes.default({
            'html': { 'background': c.bg + '!important' },
            'body': {
                'background': c.bg + '!important',
                'color': c.text + '!important',
                'font-size': this.fontSize + 'px!important',
                'font-family': this.fontFamily + '!important',
                'line-height': '1.8!important',
                'padding': '10px!important',
            },
            'p,span,div,li,td,th,dd,dt,blockquote,figcaption': {
                'color': c.text + '!important',
            },
            'h1,h2,h3,h4,h5,h6': { 'color': c.text + '!important' },
            'a': { 'color': '#6c5ce7!important' },
            'img': { 'max-width': '100%!important', 'height': 'auto!important' }
        });
    }

    getThemeColors() {
        const map = {
            'theme-light':     { bg:'#ffffff', text:'#333333' },
            'theme-dark':      { bg:'#1a1a2e', text:'#d4d4d4' },
            'theme-sepia':     { bg:'#f4ecd8', text:'#5b4636' },
            'theme-old-paper': { bg:'#d4c5a9', text:'#3e2f1c' },
            'theme-green':     { bg:'#e8f5e9', text:'#1b5e20' },
            'theme-blue':      { bg:'#1a237e', text:'#c5cae9' },
            'theme-rose':      { bg:'#fce4ec', text:'#880e4f' },
            'theme-cream':     { bg:'#fff8e1', text:'#4e342e' },
        };
        return map[this.currentTheme] || map['theme-light'];
    }

    // ============================================
    // PDF
    // ============================================
    async openPdf(buf, name) {
        try {
            this.showToast('Cargando PDF...', 'info');

            document.getElementById('epub-viewer').style.display = 'none';
            document.getElementById('pdf-canvas').style.display = 'block';

            this.pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
            this.pdfTotal = this.pdfDoc.numPages;
            this.pdfPage = 1;

            const title = name.replace(/\.pdf$/i, '');
            document.getElementById('current-book-title').textContent = title;

            this.renderPdfChapters();
            this.showReaderScreen();
            await new Promise(r => setTimeout(r, 150));

            this.restorePosition();
            await this.renderPdfPage(this.pdfPage);
            this.showToast(`📄 PDF cargado · ${this.pdfTotal} págs`, 'success');
        } catch (err) {
            console.error(err);
            this.showToast('Error al abrir PDF', 'error');
        }
    }

    async renderPdfPage(num) {
        if (!this.pdfDoc || num < 1 || num > this.pdfTotal) return;
        this.pdfPage = num;

        const page = await this.pdfDoc.getPage(num);
        const canvas = document.getElementById('pdf-canvas');
        const ctx = canvas.getContext('2d');

        const wrapper = document.getElementById('reader-wrapper');
        const maxW = wrapper.clientWidth;
        const maxH = wrapper.clientHeight;

        const vp0 = page.getViewport({ scale: 1 });
        const scale = Math.min(maxW / vp0.width, maxH / vp0.height, 2.5);
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
            const d = document.createElement('div');
            d.className = 'chapter-item';
            d.textContent = `Página ${i}`;
            d.addEventListener('click', () => {
                this.renderPdfPage(i);
                this.closeAllPanels();
            });
            list.appendChild(d);
        }
    }

    // ============================================
    // CHAPTERS
    // ============================================
    renderChapters(toc) {
        const list = document.getElementById('chapters-list');
        list.innerHTML = '';
        if (!toc || !toc.length) {
            list.innerHTML = '<div class="empty-state">Sin capítulos disponibles</div>';
            return;
        }
        const build = (items, lvl = 0) => {
            items.forEach(item => {
                const d = document.createElement('div');
                d.className = 'chapter-item';
                d.style.paddingLeft = (14 + lvl * 16) + 'px';
                d.textContent = item.label.trim();
                d.addEventListener('click', () => {
                    this.epubRendition.display(item.href);
                    this.closeAllPanels();
                });
                list.appendChild(d);
                if (item.subitems) build(item.subitems, lvl + 1);
            });
        };
        build(toc);
    }

    // ============================================
    // BOOKMARKS
    // ============================================
    addBookmark() {
        const k = this.currentBookKey;
        if (!k) return;
        if (!this.bookmarks[k]) this.bookmarks[k] = [];

        let data;
        if (this.bookType === 'epub' && this.epubRendition) {
            const loc = this.epubRendition.currentLocation();
            if (!loc || !loc.start) { this.showToast('No se pudo guardar', 'warning'); return; }
            const pct = Math.round((loc.start.percentage || 0) * 100);
            data = { id: Date.now(), cfi: loc.start.cfi, label: `${pct}% · ${new Date().toLocaleTimeString()}`, page: pct + '%', type: 'epub' };
            if (this.bookmarks[k].some(b => b.cfi === data.cfi)) { this.showToast('Ya existe', 'warning'); return; }
        } else if (this.bookType === 'pdf') {
            data = { id: Date.now(), page: this.pdfPage, label: `Pág ${this.pdfPage} · ${new Date().toLocaleTimeString()}`, type: 'pdf' };
            if (this.bookmarks[k].some(b => b.page === data.page)) { this.showToast('Ya existe', 'warning'); return; }
        }

        this.bookmarks[k].push(data);
        this.saveSettings();
        this.showToast('⭐ Marcador guardado', 'success');
    }

    renderBookmarks() {
        const list = document.getElementById('bookmarks-list');
        const k = this.currentBookKey;
        list.innerHTML = '';
        const marks = this.bookmarks[k] || [];

        if (!marks.length) {
            list.innerHTML = '<div class="empty-state">Sin marcadores.<br>Toca ⭐ para añadir.</div>';
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
                <button class="bookmark-delete">✕</button>
            `;
            item.querySelector('.bookmark-info').addEventListener('click', () => {
                if (bm.type === 'epub') this.epubRendition.display(bm.cfi);
                else this.renderPdfPage(bm.page);
                this.closeAllPanels();
            });
            item.querySelector('.bookmark-delete').addEventListener('click', e => {
                e.stopPropagation();
                this.bookmarks[k] = this.bookmarks[k].filter(b => b.id !== bm.id);
                this.saveSettings();
                this.renderBookmarks();
                this.showToast('Eliminado', 'info');
            });
            list.appendChild(item);
        });
    }

    // ============================================
    // THEMES
    // ============================================
    applyTheme(theme) {
        const wasFS = document.body.classList.contains('fullscreen-mode');
        const showB = document.body.classList.contains('show-bars');
        document.body.className = theme;
        if (wasFS) document.body.classList.add('fullscreen-mode');
        if (showB) document.body.classList.add('show-bars');
        this.currentTheme = theme;

        document.querySelectorAll('.theme-card').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
        if (this.epubRendition) this.applyEpubStyles();
        this.saveSettings();
        this.showToast('🎨 Tema aplicado', 'success');
    }

    // ============================================
    // FONTS
    // ============================================
    changeFontSize(d) {
        this.fontSize = Math.max(10, Math.min(36, this.fontSize + d));
        document.getElementById('font-size-display').textContent = this.fontSize + 'px';
        document.documentElement.style.setProperty('--font-size', this.fontSize + 'px');
        if (this.epubRendition) this.applyEpubStyles();
        this.saveSettings();
    }

    changeFontFamily(f) {
        this.fontFamily = f;
        document.documentElement.style.setProperty('--font-family', f);
        document.querySelectorAll('.font-option').forEach(b => b.classList.toggle('active', b.dataset.font === f));
        if (this.epubRendition) this.applyEpubStyles();
        this.saveSettings();
    }

    // ============================================
    // FULLSCREEN
    // ============================================
    toggleFullscreen() {
        if (!this.isFullscreen) {
            const el = document.documentElement;
            const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
            if (rfs) {
                rfs.call(el).then(() => {
                    this.isFullscreen = true;
                    document.body.classList.add('fullscreen-mode');
                    this.barsVisible = false;
                    this.showToast('Toca el centro para ver controles', 'info');
                }).catch(() => {
                    this.isFullscreen = true;
                    document.body.classList.add('fullscreen-mode');
                    this.barsVisible = false;
                    this.showToast('Modo inmersivo', 'info');
                });
            } else {
                this.isFullscreen = true;
                document.body.classList.add('fullscreen-mode');
                this.barsVisible = false;
            }
        } else {
            const efs = document.exitFullscreen || document.webkitExitFullscreen;
            if (efs && document.fullscreenElement) efs.call(document);
            this.isFullscreen = false;
            document.body.classList.remove('fullscreen-mode', 'show-bars');
            this.barsVisible = true;
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
    // PANELS
    // ============================================
    togglePanel(id) {
        const p = document.getElementById(id);
        const isOpen = p.classList.contains('open');
        this.closeAllPanels();
        if (!isOpen) {
            p.classList.add('open');
            document.getElementById('overlay').classList.add('active');
            if (id === 'bookmarks-panel') this.renderBookmarks();
        }
    }
    closeAllPanels() {
        document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
        document.getElementById('overlay').classList.remove('active');
    }

    // ============================================
    // SCREENS
    // ============================================
    showReaderScreen() {
        document.getElementById('home-screen').classList.remove('active');
        document.getElementById('reader-screen').classList.add('active');
    }

    goHome() {
        this.savePosition();
        if (this.epubBook) { this.epubBook.destroy(); this.epubBook = null; this.epubRendition = null; }
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
    // LIBRARY RENDER
    // ============================================
    renderLibrary() {
        this.renderShelf('epub');
        this.renderShelf('pdf');
    }

    renderShelf(type) {
        const section = document.getElementById(`${type}-library`);
        const shelf = document.getElementById(`${type}-shelf`);
        const count = document.getElementById(`${type}-count`);
        const books = this.library[type];

        if (!books.length) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        count.textContent = books.length;
        shelf.innerHTML = '';

        books.forEach(book => {
            const card = document.createElement('div');
            card.className = 'book-card';

            const shortName = book.name.replace(/\.(epub|pdf)$/i, '');

            card.innerHTML = `
                <div class="book-cover ${type}-cover">
                    ${type === 'epub' ? '📗' : '📕'}
                </div>
                <div class="book-name">${shortName}</div>
                <div class="book-actions">
                    <button class="book-btn book-btn-read">📖 Leer</button>
                    <button class="book-btn book-btn-delete">🗑️</button>
                </div>
            `;

            card.querySelector('.book-btn-read').addEventListener('click', e => {
                e.stopPropagation();
                this.openBookFromLibrary(book.key, book.name, type);
            });

            card.querySelector('.book-btn-delete').addEventListener('click', e => {
                e.stopPropagation();
                if (confirm(`¿Eliminar "${shortName}"?`)) {
                    this.removeFromLibrary(book.key, type);
                }
            });

            shelf.appendChild(card);
        });
    }

    // ============================================
    // PERSISTENCE
    // ============================================
    savePosition() {
        const k = this.currentBookKey;
        if (!k) return;
        let pos;
        if (this.bookType === 'epub' && this.epubRendition) {
            const loc = this.epubRendition.currentLocation();
            if (loc && loc.start) pos = { type: 'epub', cfi: loc.start.cfi };
        } else if (this.bookType === 'pdf') {
            pos = { type: 'pdf', page: this.pdfPage };
        }
        if (pos) {
            const all = JSON.parse(localStorage.getItem('bookPositions') || '{}');
            all[k] = pos;
            localStorage.setItem('bookPositions', JSON.stringify(all));
        }
    }

    restorePosition() {
        const k = this.currentBookKey;
        if (!k) return;
        const all = JSON.parse(localStorage.getItem('bookPositions') || '{}');
        const pos = all[k];
        if (pos) {
            if (pos.type === 'epub' && this.epubRendition) {
                try { this.epubRendition.display(pos.cfi); } catch (e) {}
            } else if (pos.type === 'pdf') {
                this.pdfPage = pos.page || 1;
            }
        }
    }

    saveSettings() {
        localStorage.setItem('kmiReaderSettings', JSON.stringify({
            theme: this.currentTheme,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            bookmarks: this.bookmarks,
            library: this.library
        }));
    }

    loadSettings() {
        const s = JSON.parse(localStorage.getItem('kmiReaderSettings') || '{}');
        if (s.theme) this.currentTheme = s.theme;
        if (s.fontSize) this.fontSize = s.fontSize;
        if (s.fontFamily) this.fontFamily = s.fontFamily;
        if (s.bookmarks) this.bookmarks = s.bookmarks;
        if (s.library) this.library = { epub: s.library.epub || [], pdf: s.library.pdf || [] };

        document.getElementById('font-size-display').textContent = this.fontSize + 'px';
        document.documentElement.style.setProperty('--font-size', this.fontSize + 'px');
        document.documentElement.style.setProperty('--font-family', this.fontFamily);
    }
}

// INIT
document.addEventListener('DOMContentLoaded', () => { window.reader = new BookReader(); });
document.addEventListener('gesturestart', e => e.preventDefault());
