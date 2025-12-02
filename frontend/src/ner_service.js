import { pipeline, env } from '@xenova/transformers';

// Skip local model checks since we are running in browser
env.allowLocalModels = false;
env.useBrowserCache = true;

class NERService {
    constructor() {
        this.pipe = null;
        this.modelName = 'Xenova/bert-base-NER'; // Or 'Xenova/distilbert-base-ner' for speed
    }

    async load() {
        if (!this.pipe) {
            console.log("Loading NER model... (This will download ~50MB on first run)");
            // TokenClassification pipeline handles NER
            this.pipe = await pipeline('token-classification', this.modelName);
        }
    }

    async analyze(text) {
        if (!this.pipe) await this.load();

        // The model returns a list of entities with scores
        // Example: [{ entity_group: 'PER', word: 'Sarah', score: 0.98 }, ...]
        const output = await this.pipe(text);
        return output;
    }

    /**
     * Replaces detected entities with placeholders
     */
    async anonymize(text, threshold = 0.85) {
        const entities = await this.analyze(text);
        
        // Sort entities by position descending to replace from end to start
        // (Prevents index shifting issues)
        // Note: Transformers.js tokenization can be tricky, real implementation 
        // needs careful index mapping, but this is the logic:
        
        let anonymized = text;
        
        // Naive string replacement (Production needs character index mapping)
        // Grouping common entities
        const uniqueEntities = [...new Set(entities.map(e => e.word))];
        
        uniqueEntities.forEach(word => {
            // Only redact if word length > 2 to avoid replacing "a", "is" falsely detected
            if (word.length > 2) {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                anonymized = anonymized.replace(regex, '[REDACTED]');
            }
        });

        return anonymized;
    }
}

export const nerService = new NERService();