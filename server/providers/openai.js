/**
 * OpenAI Provider - Cloud LLM Anbindung
 */

const BaseProvider = require('./base');

class OpenAIProvider extends BaseProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'openai';
        this.type = 'cloud';
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;

        console.log('[OpenAI] Constructor called');
        console.log('[OpenAI] API Key from env:', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 10)}...` : 'NOT SET');
        console.log('[OpenAI] API Key used:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT SET');
    }

    async isAvailable() {
        console.log('[OpenAI] isAvailable() called');
        console.log('[OpenAI] API Key exists:', !!this.apiKey);

        if (!this.apiKey) {
            console.log('[OpenAI] No API key - returning false');
            return false;
        }

        try {
            console.log('[OpenAI] Testing connection to:', `${this.baseUrl}/models`);
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
                signal: AbortSignal.timeout(10000)
            });
            console.log('[OpenAI] Response status:', response.status, response.ok ? 'OK' : 'FAILED');
            return response.ok;
        } catch (error) {
            console.log('[OpenAI] Connection error:', error.message);
            return false;
        }
    }

    async getModels() {
        if (!this.apiKey) {
            return [];
        }

        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });

            if (!response.ok) {
                throw new Error(`OpenAI API Error: ${response.status}`);
            }

            const data = await response.json();

            // Filtere nur Chat-Modelle
            const chatModels = (data.data || [])
                .filter(m => m.id.includes('gpt'))
                .map(m => ({
                    id: m.id,
                    name: m.id,
                    created: m.created,
                    provider: 'openai'
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            return chatModels;
        } catch (error) {
            console.error('OpenAI getModels error:', error.message);
            return [];
        }
    }

    async run({ model, prompt, options = {}, onStream = null }) {
        if (!this.apiKey) {
            throw new Error('OpenAI API Key nicht konfiguriert');
        }

        const startTime = Date.now();

        const requestBody = {
            model: model,
            messages: [
                { role: 'user', content: prompt }
            ],
            stream: !!onStream,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens ?? 2048
        };

        // Optional: Seed für Reproduzierbarkeit (falls unterstützt)
        if (options.seed !== undefined) {
            requestBody.seed = options.seed;
        }

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI Error: ${errorData.error?.message || response.statusText}`);
            }

            if (onStream) {
                return await this.handleStream(response, onStream, startTime, model);
            }

            const data = await response.json();
            const endTime = Date.now();

            return {
                text: data.choices?.[0]?.message?.content || '',
                meta: {
                    provider: 'openai',
                    model: data.model,
                    tokens_in: data.usage?.prompt_tokens || null,
                    tokens_out: data.usage?.completion_tokens || null,
                    total_tokens: data.usage?.total_tokens || null,
                    latency_ms: endTime - startTime,
                    time_to_first_token: null,
                    finish_reason: data.choices?.[0]?.finish_reason,
                    system_fingerprint: data.system_fingerprint
                }
            };
        } catch (error) {
            throw error;
        }
    }

    async handleStream(response, onStream, startTime, model) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let timeToFirstToken = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() && line.startsWith('data:'));

            for (const line of lines) {
                const data = line.replace('data: ', '');
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content || '';

                    if (content) {
                        if (timeToFirstToken === null) {
                            timeToFirstToken = Date.now() - startTime;
                        }
                        fullText += content;
                        onStream(content, fullText);
                    }
                } catch (e) {
                    // Ignoriere Parse-Fehler
                }
            }
        }

        const endTime = Date.now();

        return {
            text: fullText,
            meta: {
                provider: 'openai',
                model: model,
                tokens_in: null, // Nicht verfügbar bei Streaming
                tokens_out: null,
                latency_ms: endTime - startTime,
                time_to_first_token: timeToFirstToken
            }
        };
    }
}

module.exports = OpenAIProvider;
