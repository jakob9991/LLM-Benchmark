import { CONFIG } from '../config.js';

export const modal = {
    /**
     * Modal
     */
    bindModal() {
        const modal = document.getElementById('detail-modal');
        if (!modal) return;
        modal.querySelector('.modal-close')?.addEventListener('click', () => this.closeModal());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });
    },

    showModal(title, content) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('detail-modal').classList.add('active');
    },

    closeModal() {
        document.getElementById('detail-modal').classList.remove('active');
    },

    /**
     * Zeigt Test-Details im Modal
     */
    showTestDetails(test) {
        if (!test) return;

        const categoryInfo = CONFIG.categories[test.category] || { name: test.category, icon: '📁' };
        const difficultyInfo = CONFIG.difficulties[test.difficulty] || { name: test.difficulty, color: '#6b7280' };

        // Expected Output formatieren
        let expectedHtml = '';
        if (test.expected) {
            if (Array.isArray(test.expected)) {
                expectedHtml = test.expected.map(exp => `
                    <div class="expected-item">
                        <strong>${exp.type}:</strong> <code>${this.escapeHtml(exp.pattern || exp.value || JSON.stringify(exp))}</code>
                    </div>
                `).join('');
            } else {
                expectedHtml = `<code>${this.escapeHtml(test.expected.pattern || test.expected.value || JSON.stringify(test.expected))}</code>`;
            }
        }

        // Manuelle Kriterien
        let criteriaHtml = '';
        if (test.manualCriteria && test.manualCriteria.length > 0) {
            criteriaHtml = `
                <div class="test-detail-section">
                    <h4>Manuelle Bewertungskriterien</h4>
                    <ul class="criteria-list">
                        ${test.manualCriteria.map(c => `<li>${this.escapeHtml(c)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        const content = `
            <div class="test-detail-view">
                <div class="test-detail-header">
                    <span class="test-category-icon-large">${categoryInfo.icon}</span>
                    <div>
                        <h3>${this.escapeHtml(test.name)}</h3>
                        <div class="test-detail-meta">
                            <span class="test-category">${categoryInfo.name}</span>
                            <span class="test-difficulty" style="background: ${difficultyInfo.color}">${difficultyInfo.name}</span>
                            <span class="test-eval-type">${test.evaluationType === 'auto' ? '🤖 Automatisch' : '👤 Manuell'}</span>
                        </div>
                    </div>
                </div>

                <div class="test-detail-section">
                    <h4>Beschreibung</h4>
                    <p>${this.escapeHtml(test.description)}</p>
                </div>

                <div class="test-detail-section">
                    <h4>Prompt Template</h4>
                    <pre class="code-block">${this.escapeHtml(test.promptTemplate)}</pre>
                </div>

                <div class="test-detail-section">
                    <h4>Input</h4>
                    <pre class="code-block">${this.escapeHtml(test.input)}</pre>
                </div>

                ${test.expected ? `
                <div class="test-detail-section">
                    <h4>Erwartetes Ergebnis (${test.expected.type || 'pattern'})</h4>
                    ${expectedHtml}
                </div>
                ` : ''}

                ${test.checkCommand ? `
                <div class="test-detail-section">
                    <h4>Check Command</h4>
                    <code>${this.escapeHtml(test.checkCommand)}</code>
                </div>
                ` : ''}

                ${criteriaHtml}
            </div>
        `;

        this.showModal(`Test: ${test.id}`, content);
    },

    bindModalPreview() {
        const btn = document.getElementById('modal-preview-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (!this.state.modalPreviewOutput) {
                this.showError('Kein Output zum Anzeigen vorhanden.');
                return;
            }
            this.openHtmlPreview(this.state.modalPreviewOutput);
        });
    }
};
