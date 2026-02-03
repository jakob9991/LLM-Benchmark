/**
 * OpenRouter Provider - Zugang zu vielen Modellen über eine API
 * https://openrouter.ai/
 */

const BaseProvider = require('./base');

class OpenRouterProvider extends BaseProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'openrouter';
        this.type = 'cloud';
        this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
        this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;

        console.log('[OpenRouter] Constructor called');
        console.log('[OpenRouter] API Key:', this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT SET');
    }

    async isAvailable() {
        console.log('[OpenRouter] isAvailable() called');

        if (!this.apiKey) {
            console.log('[OpenRouter] No API key - returning false');
            return false;
        }

        try {
            // OpenRouter hat keinen /models endpoint der Auth braucht, also testen wir anders
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'LLM Benchmark Tester'
                },
                signal: AbortSignal.timeout(10000)
            });
            console.log('[OpenRouter] Response status:', response.status);
            return response.ok;
        } catch (error) {
            console.log('[OpenRouter] Connection error:', error.message);
            return false;
        }
    }

    async getModels() {
        if (!this.apiKey) {
            return [];
        }

        try {
            console.log('[OpenRouter] Fetching models from API...');
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'LLM Benchmark Tester'
                }
            });

            if (!response.ok) {
                console.log('[OpenRouter] Failed to fetch models:', response.status);
                return [];
            }

            const data = await response.json();
            console.log('[OpenRouter] Fetched', data.data?.length || 0, 'models');

            // Transformiere die Modelle und sortiere nach Name
            const models = (data.data || [])
                .map(m => ({
                    id: m.id,
                    name: m.name || m.id,
                    provider: 'openrouter',
                    context_length: m.context_length,
                    pricing: m.pricing,
                    description: m.description
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            return models;
        } catch (error) {
            console.log('[OpenRouter] Error fetching models:', error.message);
            return [];
        }
    }

    async run({ model, prompt, options = {}, onStream = null }) {
        if (!this.apiKey) {
            throw new Error('OpenRouter API Key nicht konfiguriert');
        }

        const startTime = Date.now();

        const requestBody = {
            model: model,
            messages: [
                { role: 'user', content: prompt }
            ],
            stream: !!onStream,
            temperature: options.temperature ?? 0
        };

        if (Number.isFinite(options.max_tokens)) {
            requestBody.max_tokens = options.max_tokens;
        }

        if (options.seed !== undefined) {
            requestBody.seed = options.seed;
        }

        try {
            console.log('[OpenRouter] Sending request to model:', model);

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'LLM Benchmark Tester'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.log('[OpenRouter] Error response:', errorData);
                throw new Error(`OpenRouter Error: ${errorData.error?.message || response.statusText}`);
            }

            if (onStream) {
                return await this.handleStream(response, onStream, startTime, model);
            }

            const data = await response.json();
            const endTime = Date.now();

            console.log('[OpenRouter] Response received, tokens:', data.usage);

            return {
                text: data.choices?.[0]?.message?.content || '',
                meta: {
                    provider: 'openrouter',
                    model: data.model || model,
                    tokens_in: data.usage?.prompt_tokens || null,
                    tokens_out: data.usage?.completion_tokens || null,
                    total_tokens: data.usage?.total_tokens || null,
                    latency_ms: endTime - startTime,
                    time_to_first_token: null,
                    finish_reason: data.choices?.[0]?.finish_reason,
                    cost: data.usage?.total_cost || null
                }
            };
        } catch (error) {
            console.log('[OpenRouter] Request error:', error.message);
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
                provider: 'openrouter',
                model: model,
                tokens_in: null,
                tokens_out: null,
                latency_ms: endTime - startTime,
                time_to_first_token: timeToFirstToken
            }
        };
    }
}

module.exports = OpenRouterProvider;
