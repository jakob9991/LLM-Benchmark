/**
 * Base Provider Interface
 * Definiert die einheitliche Schnittstelle für alle LLM Provider
 */

class BaseProvider {
    constructor(config = {}) {
        this.config = config;
        this.name = 'base';
        this.type = 'unknown'; // 'local' oder 'cloud'
    }

    /**
     * Prüft ob der Provider verfügbar ist
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        throw new Error('Not implemented');
    }

    /**
     * Holt verfügbare Modelle
     * @returns {Promise<Array<{id: string, name: string, size?: number}>>}
     */
    async getModels() {
        throw new Error('Not implemented');
    }

    /**
     * Führt einen Request aus
     * @param {Object} params
     * @param {string} params.model - Modell-ID
     * @param {string} params.prompt - Der Prompt
     * @param {Object} params.options - Zusätzliche Optionen (temperature, max_tokens, etc.)
     * @param {Function} params.onStream - Callback für Streaming (optional)
     * @returns {Promise<{text: string, meta: Object}>}
     */
    async run({ model, prompt, options = {}, onStream = null }) {
        throw new Error('Not implemented');
    }

    /**
     * Extrahiert Metriken aus der Response
     * @param {Object} response - Die API Response
     * @returns {Object} - Metriken (tokens_in, tokens_out, etc.)
     */
    extractMetrics(response) {
        return {
            tokens_in: null,
            tokens_out: null,
            model: null,
            provider: this.name
        };
    }
}

module.exports = BaseProvider;
