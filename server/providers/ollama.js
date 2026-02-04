/**
 * Ollama Provider - Lokale LLM Anbindung
 */

const BaseProvider = require('./base');

class OllamaProvider extends BaseProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'ollama';
        this.type = 'local';
        this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    }

    async isAvailable() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async getModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Ollama API Error: ${response.status}`);
            }
            const data = await response.json();
            return (data.models || []).map(m => ({
                id: m.name,
                name: m.name,
                size: m.size,
                modified: m.modified_at,
                provider: 'ollama'
            }));
        } catch (error) {
            console.error('Ollama getModels error:', error.message);
            return [];
        }
    }

    async run({ model, prompt, options = {}, onStream = null, signal = undefined }) {
        const startTime = Date.now();
        let timeToFirstToken = null;

        const requestBody = {
            model: model,
            prompt: prompt,
            stream: !!onStream,
            options: {
                temperature: options.temperature ?? 0,
                seed: options.seed ?? undefined
            }
        };

        if (Number.isFinite(options.max_tokens)) {
            requestBody.options.num_predict = options.max_tokens;
        }

        // Entferne undefined Werte
        if (requestBody.options.seed === undefined) {
            delete requestBody.options.seed;
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama Error: ${response.status} - ${errorText}`);
            }

            if (onStream) {
                return await this.handleStream(response, onStream, startTime);
            }

            const data = await response.json();
            const endTime = Date.now();

            return {
                text: data.response || '',
                meta: {
                    provider: 'ollama',
                    model: model,
                    tokens_in: data.prompt_eval_count || null,
                    tokens_out: data.eval_count || null,
                    latency_ms: endTime - startTime,
                    time_to_first_token: null,
                    eval_duration: data.eval_duration ? Math.round(data.eval_duration / 1000000) : null, // ns -> ms
                    load_duration: data.load_duration ? Math.round(data.load_duration / 1000000) : null
                }
            };
        } catch (error) {
            if (error.message.includes('ECONNREFUSED') || error.message.includes('Failed to fetch')) {
                throw new Error('Ollama ist nicht erreichbar. Starte Ollama mit: ollama serve');
            }
            throw error;
        }
    }

    async handleStream(response, onStream, startTime) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let timeToFirstToken = null;
        let lastData = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    lastData = json;

                    if (json.response) {
                        if (timeToFirstToken === null) {
                            timeToFirstToken = Date.now() - startTime;
                        }
                        fullText += json.response;
                        onStream(json.response, fullText);
                    }
                } catch (e) {
                    // Ignoriere Parse-Fehler bei unvollständigen Chunks
                }
            }
        }

        const endTime = Date.now();

        return {
            text: fullText,
            meta: {
                provider: 'ollama',
                model: lastData?.model || null,
                tokens_in: lastData?.prompt_eval_count || null,
                tokens_out: lastData?.eval_count || null,
                latency_ms: endTime - startTime,
                time_to_first_token: timeToFirstToken
            }
        };
    }
}

module.exports = OllamaProvider;
