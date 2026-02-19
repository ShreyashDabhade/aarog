import { pipeline, env } from '@xenova/transformers';
import nlp from 'compromise';

// Configuration
env.allowLocalModels = false;
env.useBrowserCache = true;

class NERService {
    constructor() {
        this.pipe = null;
        this.modelName = 'Xenova/bert-base-NER';
        this.chunkSize = 1200;
        this.chunkOverlap = 120;

        // Clinical allowlist to reduce false positives from generic NER models.
        this.allowList = new Set([
            'HOSPITAL', 'CLINIC', 'CENTER', 'CENTRE', 'DEPARTMENT', 'UNIT',
            'MEDICAL', 'HEALTH', 'CARE', 'PATHOLOGY', 'DIAGNOSTICS', 'LAB',
            'PHARMACY', 'EMERGENCY', 'SURGERY', 'WARD', 'BLOCK',
            'CHOLESTEROL', 'LIPID', 'PROFILE', 'TRIGLYCERIDES', 'VLDL', 'HDL', 'LDL',
            'RISK', 'RATIO', 'INTERPRETATION', 'RECOMMENDATIONS', 'DYSLIPIDEMIA',
            'CARDIOVASCULAR', 'DISEASE', 'METABOLIC', 'SYNDROME', 'PATHOLOGY',
            'TABLET', 'TAB', 'SYRUP', 'SYP', 'CAPSULE', 'CAP', 'INJECTION', 'INJ',
            'DAILY', 'TWICE', 'THRICE', 'FOOD', 'WATER', 'BED', 'REST'
        ]);
    }

    async load() {
        if (!this.pipe) {
            console.log('Starting privacy model download...');
            const start = performance.now();
            try {
                this.pipe = await pipeline('token-classification', this.modelName, {
                    progress_callback: (data) => {
                        if (data.status === 'progress') {
                            console.log(`Loading model: ${Math.round(data.progress)}%`);
                        }
                    }
                });
                const end = performance.now();
                console.log(`Privacy model ready (${Math.round(end - start)}ms).`);
            } catch (err) {
                console.error('Privacy model failed to load:', err);
                throw new Error('Failed to load privacy model. Check connection.');
            }
        }
    }

    normalizeToken(value) {
        return String(value || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/[^A-Za-z0-9]+/g, ' ')
            .trim()
            .toUpperCase();
    }

    isAllowListed(value) {
        const normalized = this.normalizeToken(value);
        if (!normalized) return false;
        if (this.allowList.has(normalized)) return true;

        const parts = normalized.split(/\s+/).filter(Boolean);
        if (!parts.length) return false;
        return parts.every((part) => this.allowList.has(part));
    }

    // Expand to whole tokens so we avoid partial masking artifacts.
    expandRange(text, start, end) {
        let s = start;
        let e = end;
        while (s > 0 && /[\w/.-]/.test(text[s - 1])) s--;
        while (e < text.length && /[\w/.-]/.test(text[e])) e++;
        return { start: s, end: e };
    }

    getOffsetSpan(item) {
        if (!item) return null;

        if (
            item.offset &&
            typeof item.offset.start === 'number' &&
            typeof item.offset.length === 'number'
        ) {
            return {
                start: item.offset.start,
                end: item.offset.start + item.offset.length,
            };
        }

        if (typeof item.start === 'number' && typeof item.end === 'number') {
            return { start: item.start, end: item.end };
        }

        if (typeof item.offset === 'number' && typeof item.len === 'number') {
            return { start: item.offset, end: item.offset + item.len };
        }

        return null;
    }

    splitIntoChunks(text) {
        if (!text) return [];

        const chunks = [];
        let start = 0;

        while (start < text.length) {
            let end = Math.min(text.length, start + this.chunkSize);

            if (end < text.length) {
                const breakAt = text.lastIndexOf('\n', end);
                if (breakAt > start + Math.floor(this.chunkSize * 0.6)) {
                    end = breakAt + 1;
                }
            }

            chunks.push({ start, end, text: text.slice(start, end) });
            if (end >= text.length) break;

            start = Math.max(end - this.chunkOverlap, start + 1);
        }

        return chunks;
    }

    async inferEntitiesInChunks(text) {
        const chunks = this.splitIntoChunks(text);
        const merged = [];
        const seen = new Set();

        for (const chunk of chunks) {
            const entities = await this.pipe(chunk.text, {
                ignore_labels: ['O'],
                aggregation_strategy: 'simple'
            });

            entities.forEach((entity) => {
                let start = null;
                let end = null;

                if (typeof entity.start === 'number' && typeof entity.end === 'number') {
                    start = chunk.start + entity.start;
                    end = chunk.start + entity.end;
                } else if (typeof entity.index === 'number' && typeof entity.word === 'string') {
                    // Fallback for runtimes that only return token index.
                    start = chunk.start + entity.index;
                    end = start + entity.word.length;
                }

                if (start === null || end === null || end <= start) return;

                const key = `${start}:${end}:${entity.entity_group || entity.entity || ''}`;
                if (seen.has(key)) return;
                seen.add(key);

                merged.push({ ...entity, start, end });
            });
        }

        return merged;
    }

    applyFieldAwareMask(text, applyMask) {
        const fieldRules = [
            { key: /\b(?:patient\s*name|pat(?:i|l)ent\s*name|doctor\s*name|payor\s*name)\b/i, tag: '[NAME]' },
            { key: /\b(?:patient\s*(?:id|mrn)|mrn|uhid|visit\s*id|ref(?:erence)?\s*no|reg(?:istration)?\s*no)\b/i, tag: '[ID]' },
            { key: /\b(?:phone|mobile|contact\s*no|ph)\b/i, tag: '[PHONE]' },
            { key: /\b(?:email|e-?mail)\b/i, tag: '[EMAIL]' },
            { key: /\b(?:address|patient\s*address)\b/i, tag: '[ADDRESS]' },
            { key: /\b(?:dob|date\s*of\s*birth|visit\s*date)\b/i, tag: '[DATE]' },
        ];

        const lineRegex = /[^\r\n]+/g;
        let lineMatch;

        while ((lineMatch = lineRegex.exec(text)) !== null) {
            const line = lineMatch[0];
            const lineStart = lineMatch.index;

            fieldRules.forEach((rule) => {
                const keyMatch = line.match(rule.key);
                if (!keyMatch || typeof keyMatch.index !== 'number') return;

                const keyEnd = keyMatch.index + keyMatch[0].length;
                const sep = line.slice(keyEnd).match(/^\s*[:#-]\s*/);
                const valueStartInLine = sep ? keyEnd + sep[0].length : keyEnd;

                const value = line.slice(valueStartInLine).trim();
                if (!value || value.length < 2) return;

                // Avoid over-redacting entire narrative lines for non-address fields.
                if (value.length > 120 && rule.tag !== '[ADDRESS]') return;

                const globalStart = lineStart + valueStartInLine;
                const globalEnd = lineStart + line.length;
                applyMask(globalStart, globalEnd, rule.tag, 3);
            });
        }
    }

    async anonymize(text, threshold = 0.4) {
        if (!text) return '';
        await this.load();

        const mask = new Array(text.length).fill(false);
        const tags = new Array(text.length).fill(null);
        const priority = new Array(text.length).fill(0);

        const applyMask = (start, end, tag, level = 1) => {
            if (typeof start !== 'number' || typeof end !== 'number') return;

            let s = Math.max(0, Math.floor(start));
            let e = Math.min(text.length, Math.ceil(end));
            if (e <= s) return;

            // For non-email entities, expand to whole tokens.
            if (tag !== '[EMAIL]') {
                const expanded = this.expandRange(text, s, e);
                s = Math.max(0, expanded.start);
                e = Math.min(text.length, expanded.end);
            }

            let firstTagged = -1;
            for (let i = s; i < e; i++) {
                if (level < priority[i]) continue;
                mask[i] = true;
                priority[i] = level;
                tags[i] = null;
                if (firstTagged === -1) firstTagged = i;
            }

            if (firstTagged !== -1) {
                tags[firstTagged] = tag;
            }
        };

        // --- LAYER 1: Regex (high precision structured PHI) ---
        const patterns = [
            { regex: /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,10}\b/g, tag: '[EMAIL]' },
            { regex: /\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/g, tag: '[PHONE]' },
            { regex: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/g, tag: '[PHONE]' },
            { regex: /\b\d{1,2}[/-](?:\d{1,2}|[A-Za-z]{3,9})[/-]\d{2,4}\b/gi, tag: '[DATE]' },
            { regex: /\b(?:DOB|D\.?O\.?B)\s*[:-]?\s*([^\n\r]+)/gi, tag: '[DATE]', group: 1 },
            { regex: /\b(?:patient\s*(?:id|mrn)|mrn|uhid|visit\s*id|ref(?:erence)?\s*no|reg(?:istration)?\s*no)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9/-]{3,})\b/gi, tag: '[ID]', group: 1 },
            { regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g, tag: '[ID]' },
            { regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g, tag: '[ID]' },
            { regex: /\b(Dr|Mr|Mrs|Ms|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g, tag: '[NAME]', group: 2 },
            { regex: /\b(DR|MR|MRS|MS|PROF)\.?\s+([A-Z]+(?:\s+[A-Z]+){0,3})\b/g, tag: '[NAME]', group: 2 },
            { regex: /\b(?:patient\s*name|pat(?:i|l)ent\s*name|doctor\s*name|payor\s*name)\s*[:-]?\s*([^\n\r|]{2,})/gi, tag: '[NAME]', group: 1 },
            { regex: /\b(?:patient\s*address|address)\s*[:-]?\s*([^\n\r]{4,})/gi, tag: '[ADDRESS]', group: 1 },
        ];

        patterns.forEach(({ regex, tag, group }) => {
            let match;
            regex.lastIndex = 0;

            while ((match = regex.exec(text)) !== null) {
                let start = match.index;
                let end = match.index + match[0].length;

                if (typeof group === 'number' && match[group]) {
                    const capture = match[group];
                    const captureIndex = match[0].indexOf(capture);
                    if (captureIndex !== -1) {
                        start = match.index + captureIndex;
                        end = start + capture.length;
                    }
                }

                applyMask(start, end, tag, 3);
            }
        });

        // Handles OCR lines such as: "Patient Name MR.SHREYASH DABHADE"
        this.applyFieldAwareMask(text, applyMask);

        // --- LAYER 2: Compromise.js (heuristic NLP) ---
        const doc = nlp(text);

        const people = doc.people().out('offsets');
        people.forEach((p) => {
            if (this.isAllowListed(p.text)) return;
            const span = this.getOffsetSpan(p);
            if (!span) return;
            applyMask(span.start, span.end, '[NAME]', 2);
        });

        const places = doc.places().out('offsets');
        places.forEach((p) => {
            if (this.isAllowListed(p.text)) return;
            const span = this.getOffsetSpan(p);
            if (!span) return;
            applyMask(span.start, span.end, '[LOCATION]', 2);
        });

        const orgs = doc.organizations().out('offsets');
        orgs.forEach((o) => {
            if (this.isAllowListed(o.text)) return;
            const span = this.getOffsetSpan(o);
            if (!span) return;
            applyMask(span.start, span.end, '[ORG]', 2);
        });

        // --- LAYER 3: Transformer NER (context) ---
        try {
            const entities = await this.inferEntitiesInChunks(text);

            entities.forEach((entity) => {
                if (typeof entity.score === 'number' && entity.score < threshold) return;

                const rawWord = entity.word || entity.text || '';
                if (this.isAllowListed(rawWord)) return;

                const group = String(entity.entity_group || entity.entity || '').toUpperCase();
                let tag = '[REDACTED]';
                if (group.includes('PER')) tag = '[NAME]';
                if (group.includes('ORG')) tag = '[ORG]';
                if (group.includes('LOC')) tag = '[LOCATION]';

                applyMask(entity.start, entity.end, tag, 1);
            });
        } catch (e) {
            console.warn('AI model skipped or failed:', e);
        }

        // --- SYNTHESIS ---
        let result = '';
        for (let i = 0; i < text.length; i++) {
            if (mask[i]) {
                if (tags[i]) result += tags[i];
            } else {
                result += text[i];
            }
        }

        // Cleanup visual artifacts.
        result = result.replace(/(\[(?:NAME|ORG|LOCATION|ID|PHONE|EMAIL|DATE|ADDRESS|REDACTED)\])(?:\s*\1)+/g, '$1');
        result = result.replace(/[ \t]{2,}/g, ' ');
        result = result.replace(/[ \t]+\n/g, '\n');
        result = result.replace(/\n{3,}/g, '\n\n');

        return result;
    }
}

export const nerService = new NERService();
