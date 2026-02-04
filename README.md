# LLM Benchmark

Benchmark-Tool zum Testen und Vergleichen von LLM-Modellen.

GitHub: https://github.com/jakob9991/LLM-Benchmark

## Setup

### 1. Repository klonen

```bash
git clone https://github.com/jakob9991/LLM-Benchmark.git
cd LLM-Benchmark
npm install
```

### 2. .env konfigurieren

Erstelle eine `.env` Datei im Root-Verzeichnis:

```
PORT=3000
OLLAMA_BASE_URL=http://localhost:11434
OPENAI_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
```

### 3. Ollama (optional, für lokale Modelle)

```bash
# Ollama installieren: https://ollama.ai
# Modelle herunterladen:
ollama pull llama3
ollama pull mistral
```

### 4. Starten

```bash
npm run dev
```

Öffne http://localhost:3000
