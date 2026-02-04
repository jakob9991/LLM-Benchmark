export const helpers = {
    ensureToastContainer() {
        let container = document.getElementById('toast-container');
        if (container) return container;
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
        return container;
    },

    showToast(type, message, { timeoutMs = 4500 } = {}) {
        const container = this.ensureToastContainer();

        // Simple cap so we don't spam the UI.
        while (container.children.length >= 3) {
            container.removeChild(container.firstChild);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

        const text = document.createElement('div');
        text.className = 'toast-text';
        text.textContent = String(message || '');

        const close = document.createElement('button');
        close.className = 'toast-close';
        close.type = 'button';
        close.setAttribute('aria-label', 'Schliessen');
        close.textContent = 'x';
        close.addEventListener('click', () => toast.remove());

        toast.appendChild(text);
        toast.appendChild(close);
        container.appendChild(toast);

        if (timeoutMs > 0) {
            window.setTimeout(() => {
                toast.classList.add('toast-leave');
                window.setTimeout(() => toast.remove(), 250);
            }, timeoutMs);
        }
    },

    debounce(fn, waitMs = 150) {
        let t = null;
        return (...args) => {
            if (t) window.clearTimeout(t);
            t = window.setTimeout(() => fn.apply(this, args), waitMs);
        };
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatDate(isoString) {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString('de-DE');
    },

    showError(message) {
        console.error('[UI] Error:', message);
        this.showToast('error', message);
    },

    showSuccess(message) {
        console.log('[UI] Success:', message);
        this.showToast('success', message, { timeoutMs: 2500 });
    },

    showCompareDialog() {
        // TODO: Implement model comparison dialog
        this.showToast('info', 'Model-Vergleich: Waehle mehrere Modelle aus und starte den Vergleich.', { timeoutMs: 7000 });
    },

    isHtmlDocument(text) {
        if (!text) return false;
        const normalized = text.trim().toLowerCase();
        return normalized.includes('<!doctype html') || normalized.includes('<html');
    },

    extractHtmlFromOutput(text) {
        if (!text) return '';
        const trimmed = text.trim();
        const fenceMatch = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
        if (fenceMatch) {
            return fenceMatch[1].trim();
        }
        if (trimmed.startsWith('```') && this.isHtmlDocument(text)) {
            const withoutFence = trimmed.replace(/^```(?:html)?/i, '').replace(/```$/, '');
            return withoutFence.trim();
        }
        if (this.isHtmlDocument(text)) {
            return trimmed;
        }
        return '';
    },

    openHtmlPreview(html) {
        const content = String(html || '').trim();
        if (!content) {
            this.showError('Kein gueltiges HTML zum Anzeigen gefunden.');
            return;
        }

        // NOTE: Do NOT use "noopener" here. Some browsers return null for window.open when noopener is used,
        // which makes document.write impossible and results in a blank tab.
        let preview = null;
        try {
            preview = window.open('', '_blank');
        } catch {
            preview = null;
        }

        if (!preview) {
            // Fallback: Blob URL (no window handle needed for document.write).
            try {
                const blob = new Blob([content], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const opened = window.open(url, '_blank');
                if (!opened) throw new Error('popup_blocked');
                window.setTimeout(() => URL.revokeObjectURL(url), 30000);
                return;
            } catch {
                this.showError('Popup blockiert. Erlaube Popups fuer diese Seite.');
                return;
            }
        }

        try {
            preview.opener = null;
        } catch {
            // ignore
        }

        try {
            preview.document.open();
            preview.document.write(content);
            preview.document.close();
            preview.focus?.();
        } catch (error) {
            // Fallback: navigate the already opened tab to a Blob URL.
            try {
                const blob = new Blob([content], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                preview.location.href = url;
                window.setTimeout(() => URL.revokeObjectURL(url), 30000);
            } catch {
                this.showError('Konnte HTML Preview nicht oeffnen: ' + (error?.message || String(error)));
            }
        }
    }
};
