import { pipeline, env } from '@xenova/transformers';
import nlp from 'compromise';

// Configuration
env.allowLocalModels = false;
env.useBrowserCache = true;

class NERService {
    constructor() {
        this.pipe = null;
        this.modelName = 'Xenova/bert-base-NER';
        
        // Medical terms allowlist to prevent false positives
        this.allowList = new Set([
            'HOSPITAL', 'CLINIC', 'CENTER', 'CENTRE', 'DEPARTMENT', 'UNIT',
            'MEDICAL', 'HEALTH', 'CARE', 'PATHOLOGY', 'DIAGNOSTICS', 'LAB',
            'PHARMACY', 'EMERGENCY', 'SURGERY', 'WARD', 'BLOCK',
            'MUMBAI', 'DELHI', 'BANGALORE', 'INDIA', 'ROAD', 'AVENUE', // Locations we might want to keep? Or redact? usually redact.
            // Clinical terms that might look like names/orgs
            'CHOLESTEROL', 'LIPID', 'PROFILE', 'TRIGLYCERIDES', 'VLDL', 'HDL', 'LDL', 
            'RISK', 'RATIO', 'INTERPRETATION', 'RECOMMENDATIONS', 'DYSLIPIDEMIA', 
            'CARDIOVASCULAR', 'DISEASE', 'METABOLIC', 'SYNDROME', 'PATHOLOGY',
            'TABLET', 'TAB', 'SYRUP', 'SYP', 'CAPSULE', 'CAP', 'INJECTION', 'INJ',
            'DAILY', 'TWICE', 'THRICE', 'FOOD', 'WATER', 'BED', 'REST'
        ]);
    }

    async load() {
        if (!this.pipe) {
            console.log("⬇️ Starting AI Model Download...");
            const start = performance.now();
            try {
                // Initialize pipeline
                this.pipe = await pipeline('token-classification', this.modelName, {
                    progress_callback: (data) => {
                        // This logs download progress to console
                        if (data.status === 'progress') {
                            console.log(`Loading Model: ${Math.round(data.progress)}%`);
                        }
                    }
                });
                const end = performance.now();
                console.log(`✅ AI Model Ready! (Took ${Math.round(end - start)}ms)`);
            } catch (err) {
                console.error("❌ AI Model Failed to Load:", err);
                throw new Error("Failed to load privacy model. Check connection.");
            }
        }
    }

    /**
     * Helper: Expand to whole words to avoid partial masking (Ape[REDACTED])
     */
    expandRange(text, start, end) {
        let s = start;
        let e = end;
        while (s > 0 && /\w/.test(text[s - 1])) s--;
        while (e < text.length && /\w/.test(text[e])) e++;
        return { start: s, end: e };
    }

    async anonymize(text, threshold = 0.35) {
        if (!text) return "";
        await this.load();

        // The Master Mask: true = redact this char
        const mask = new Array(text.length).fill(false);
        const tags = new Array(text.length).fill(null);

        const applyMask = (start, end, tag) => {
            const { start: s, end: e } = this.expandRange(text, start, end);
            for (let i = s; i < e; i++) {
                if (i === s) tags[i] = tag;
                mask[i] = true;
            }
        };

        // --- LAYER 1: REGEX (Structured Data) ---
        // Highest precision. Captures IDs, Dates, Phones.
        const patterns = [
            { regex: /\b[\w\.-]+@[\w\.-]+\.\w{2,6}\b/gi, tag: '[EMAIL]' },
            { regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, tag: '[PHONE]' },
            { regex: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, tag: '[DATE]' },
            { regex: /\b(MRN|ID|Patient|Ref|No|Reg|Ph)[:#\s\.]+\s*([A-Z0-9-]+)\b/gi, tag: '[ID]' },
            { regex: /\b(Dr|Mr|Mrs|Ms|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, tag: '[NAME]' }, // Honorifics Title Case
            { regex: /\b(DR|MR|MRS|MS|PROF)\.?\s+([A-Z]+(?:\s+[A-Z]+)*)/g, tag: '[NAME]' } // Honorifics UPPER CASE
        ];

        patterns.forEach(({ regex, tag }) => {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(text)) !== null) {
                // If capture group 2 exists (Values like IDs or Names), redact that. 
                // Otherwise redact whole match (Emails/Phones).
                let start = match.index;
                let end = match.index + match[0].length;
                
                if (match[2]) {
                    // Find where group 2 starts inside the match
                    const group2Index = match[0].indexOf(match[2]);
                    if (group2Index !== -1) {
                        start += group2Index;
                        end = start + match[2].length;
                    }
                }
                applyMask(start, end, tag);
            }
        });

        // --- LAYER 2: COMPROMISE.JS (Heuristic NLP) ---
        // Excellent at finding names based on linguistic patterns ("Anjali" is a name).
        const doc = nlp(text);
        
        // Find People
        const people = doc.people().out('offsets');
        people.forEach(p => {
            // Filter out false positives like "Cholesterol" if Compromise gets confused
            if (!this.allowList.has(p.text.toUpperCase())) {
                applyMask(p.offset, p.offset + p.len, '[NAME]');
            }
        });

        // Find Places/Organizations (Use with caution, can be aggressive)
        const places = doc.places().out('offsets');
        places.forEach(p => applyMask(p.offset, p.offset + p.len, '[LOCATION]'));

        const orgs = doc.organizations().out('offsets');
        orgs.forEach(o => {
            if (!this.allowList.has(o.text.toUpperCase())) {
                applyMask(o.offset, o.offset + o.len, '[ORG]');
            }
        });


        // --- LAYER 3: TRANSFORMERS AI (Deep Context) ---
        // Catches what Regex and Compromise miss.
        // We run this on the ORIGINAL text.
        try {
            const entities = await this.pipe(text, { 
                ignore_labels: ['O'], 
                aggregation_strategy: 'simple' 
            });

            entities.forEach(entity => {
                // BERT confidence check
                if (entity.score < threshold) return;
                
                // Allowlist check
                if (this.allowList.has(entity.word.toUpperCase())) return;

                let tag = '[REDACTED]';
                if (entity.entity_group === 'PER') tag = '[NAME]';
                if (entity.entity_group === 'ORG') tag = '[ORG]';
                if (entity.entity_group === 'LOC') tag = '[LOCATION]';

                if (typeof entity.index !== 'undefined') {
                    // Only apply if not already masked by Regex/Compromise (Conflict Resolution)
                    // We trust Regex/Compromise more for specific entities like "Mrs. Sharma"
                    if (!mask[entity.index]) {
                        applyMask(entity.index, entity.index + entity.word.length, tag);
                    }
                }
            });
        } catch (e) {
            console.warn("AI Model skipped or failed:", e);
        }

        // --- SYNTHESIS ---
        let result = "";
        for (let i = 0; i < text.length; i++) {
            if (mask[i]) {
                if (tags[i]) result += tags[i];
            } else {
                result += text[i];
            }
        }

        return result;
    }
}

export const nerService = new NERService();