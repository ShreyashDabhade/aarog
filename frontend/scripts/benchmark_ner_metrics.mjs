import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import nlp from 'compromise';
import { env } from '@xenova/transformers';
import { nerService } from '../src/ner_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TEXT_DIR = path.join(REPO_ROOT, 'backend', 'data', 'ocr_test_results', 'texts');
const GOLD_ANNOTATION_PATH = path.join(REPO_ROOT, 'backend', 'data', 'ocr_test_results', 'pii_gold_annotations.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'backend', 'data', 'ocr_test_results', 'ner_metrics.json');

const TAG_PATTERN = /\[(?:NAME|ORG|LOCATION|ID|PHONE|EMAIL|DATE|ADDRESS|REDACTED)\]/g;

function computeStats(values) {
  if (!values.length) {
    return { count: 0, mean: 0, median: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    count: sorted.length,
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function overlapLength(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

function greedySpanMatching(predictedSpans, goldSpans) {
  const pairs = [];
  for (let predIndex = 0; predIndex < predictedSpans.length; predIndex += 1) {
    for (let goldIndex = 0; goldIndex < goldSpans.length; goldIndex += 1) {
      const overlap = overlapLength(predictedSpans[predIndex], goldSpans[goldIndex]);
      if (overlap > 0) {
        pairs.push({ predIndex, goldIndex, overlap });
      }
    }
  }

  pairs.sort((a, b) => b.overlap - a.overlap);
  const usedPred = new Set();
  const usedGold = new Set();
  const matches = [];

  for (const pair of pairs) {
    if (usedPred.has(pair.predIndex) || usedGold.has(pair.goldIndex)) {
      continue;
    }
    usedPred.add(pair.predIndex);
    usedGold.add(pair.goldIndex);
    matches.push(pair);
  }

  return {
    tp: matches.length,
    fp: predictedSpans.length - matches.length,
    fn: goldSpans.length - matches.length,
    matches,
  };
}

function findOccurrenceSpan(text, value, occurrence = 1) {
  const target = String(value || '').toLowerCase();
  if (!target) {
    return null;
  }

  const source = text.toLowerCase();
  let index = -1;
  let from = 0;
  for (let count = 0; count < occurrence; count += 1) {
    index = source.indexOf(target, from);
    if (index === -1) {
      return null;
    }
    from = index + target.length;
  }

  return { start: index, end: index + target.length };
}

function buildGoldSpans(text, annotations, fileName) {
  const spans = [];
  const unresolved = [];

  for (const entity of annotations || []) {
    const occurrence = Number.isInteger(entity.occurrence) ? entity.occurrence : 1;
    const span = findOccurrenceSpan(text, entity.value, occurrence);
    if (!span) {
      unresolved.push({
        file: fileName,
        value: entity.value,
        tag: entity.tag || 'UNKNOWN',
        occurrence,
      });
      continue;
    }

    spans.push({
      start: span.start,
      end: span.end,
      tag: entity.tag || 'UNKNOWN',
      value: entity.value,
    });
  }

  return { spans, unresolved };
}

function deduplicateSpans(spans) {
  const seen = new Set();
  const deduped = [];

  for (const span of spans) {
    const key = `${span.start}:${span.end}:${span.tag}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(span);
  }

  deduped.sort((a, b) => a.start - b.start || a.end - b.end);
  return deduped;
}

async function collectPredictedSpans(text, threshold = 0.4) {
  const mask = new Array(text.length).fill(false);
  const tags = new Array(text.length).fill(null);
  const priority = new Array(text.length).fill(0);

  const applyMask = (start, end, tag, level = 1) => {
    if (typeof start !== 'number' || typeof end !== 'number') return;

    let s = Math.max(0, Math.floor(start));
    let e = Math.min(text.length, Math.ceil(end));
    if (e <= s) return;

    if (tag !== '[EMAIL]') {
      const expanded = nerService.expandRange(text, s, e);
      s = Math.max(0, expanded.start);
      e = Math.min(text.length, expanded.end);
    }

    let firstTagged = -1;
    for (let i = s; i < e; i += 1) {
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

  for (const pattern of patterns) {
    let match;
    pattern.regex.lastIndex = 0;

    while ((match = pattern.regex.exec(text)) !== null) {
      let start = match.index;
      let end = match.index + match[0].length;

      if (typeof pattern.group === 'number' && match[pattern.group]) {
        const capture = match[pattern.group];
        const captureIndex = match[0].indexOf(capture);
        if (captureIndex !== -1) {
          start = match.index + captureIndex;
          end = start + capture.length;
        }
      }

      applyMask(start, end, pattern.tag, 3);
    }
  }

  nerService.applyFieldAwareMask(text, applyMask);

  const doc = nlp(text);
  const people = doc.people().out('offsets');
  for (const person of people) {
    if (nerService.isAllowListed(person.text)) continue;
    const span = nerService.getOffsetSpan(person);
    if (!span) continue;
    applyMask(span.start, span.end, '[NAME]', 2);
  }

  const places = doc.places().out('offsets');
  for (const place of places) {
    if (nerService.isAllowListed(place.text)) continue;
    const span = nerService.getOffsetSpan(place);
    if (!span) continue;
    applyMask(span.start, span.end, '[LOCATION]', 2);
  }

  const orgs = doc.organizations().out('offsets');
  for (const org of orgs) {
    if (nerService.isAllowListed(org.text)) continue;
    const span = nerService.getOffsetSpan(org);
    if (!span) continue;
    applyMask(span.start, span.end, '[ORG]', 2);
  }

  try {
    const entities = await nerService.inferEntitiesInChunks(text);
    for (const entity of entities) {
      if (typeof entity.score === 'number' && entity.score < threshold) continue;

      const rawWord = entity.word || entity.text || '';
      if (nerService.isAllowListed(rawWord)) continue;

      const group = String(entity.entity_group || entity.entity || '').toUpperCase();
      let tag = '[REDACTED]';
      if (group.includes('PER')) tag = '[NAME]';
      if (group.includes('ORG')) tag = '[ORG]';
      if (group.includes('LOC')) tag = '[LOCATION]';

      applyMask(entity.start, entity.end, tag, 1);
    }
  } catch {
  }

  const spans = [];
  let index = 0;
  while (index < text.length) {
    if (!mask[index]) {
      index += 1;
      continue;
    }

    const start = index;
    let tag = tags[index];
    index += 1;
    while (index < text.length && mask[index]) {
      if (!tag && tags[index]) {
        tag = tags[index];
      }
      index += 1;
    }

    const end = index;
    spans.push({
      start,
      end,
      tag: tag || '[REDACTED]',
      text: text.slice(start, end),
    });
  }

  return deduplicateSpans(spans);
}

async function loadInputData() {
  const fileNames = (await fs.readdir(TEXT_DIR))
    .filter((name) => name.endsWith('.table.txt'))
    .sort();

  const records = [];
  for (const fileName of fileNames) {
    const filePath = path.join(TEXT_DIR, fileName);
    const text = await fs.readFile(filePath, 'utf-8');
    records.push({ fileName, filePath, text });
  }

  const gold = JSON.parse(await fs.readFile(GOLD_ANNOTATION_PATH, 'utf-8'));
  return { records, gold };
}

async function run() {
  env.useBrowserCache = false;

  const { records, gold } = await loadInputData();
  if (!records.length) {
    throw new Error(`No .table.txt records found in ${TEXT_DIR}`);
  }

  const loadStart = performance.now();
  await nerService.load();
  const coldStartSeconds = (performance.now() - loadStart) / 1000;

  const inferenceSamples = [];
  for (const record of records) {
    const start = performance.now();
    await nerService.inferEntitiesInChunks(record.text);
    const elapsedMs = performance.now() - start;
    const msPer1000Chars = (elapsedMs * 1000) / Math.max(record.text.length, 1);
    inferenceSamples.push({
      file: record.fileName,
      chars: record.text.length,
      elapsed_ms: elapsedMs,
      ms_per_1000_chars: msPer1000Chars,
    });
  }

  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;
  const unresolvedGold = [];
  const perFile = [];

  for (const record of records) {
    const annotations = (gold[record.fileName] && gold[record.fileName].entities) || [];
    const built = buildGoldSpans(record.text, annotations, record.fileName);
    const goldSpans = built.spans;
    unresolvedGold.push(...built.unresolved);

    const predictedSpans = await collectPredictedSpans(record.text);
    const matched = greedySpanMatching(predictedSpans, goldSpans);
    const anonymizedText = await nerService.anonymize(record.text);
    const placeholderCount = (anonymizedText.match(TAG_PATTERN) || []).length;

    totalTp += matched.tp;
    totalFp += matched.fp;
    totalFn += matched.fn;

    perFile.push({
      file: record.fileName,
      gold_entities: goldSpans.length,
      predicted_entities: predictedSpans.length,
      tp: matched.tp,
      fp: matched.fp,
      fn: matched.fn,
      precision: matched.tp + matched.fp > 0 ? matched.tp / (matched.tp + matched.fp) : 0,
      recall: matched.tp + matched.fn > 0 ? matched.tp / (matched.tp + matched.fn) : 0,
      placeholders_in_output: placeholderCount,
    });
  }

  const precision = totalTp + totalFp > 0 ? totalTp / (totalTp + totalFp) : 0;
  const recall = totalTp + totalFn > 0 ? totalTp / (totalTp + totalFn) : 0;

  const result = {
    generated_at: new Date().toISOString(),
    dataset_files: records.map((record) => record.fileName),
    ner_model: nerService.modelName,
    wasm_ner_cold_start_seconds: coldStartSeconds,
    wasm_ner_inference_ms_per_1000_chars: {
      ...computeStats(inferenceSamples.map((sample) => sample.ms_per_1000_chars)),
      samples: inferenceSamples,
    },
    anonymization_accuracy: {
      total_gold_entities: totalTp + totalFn,
      total_predicted_entities: totalTp + totalFp,
      true_positives: totalTp,
      false_positives: totalFp,
      false_negatives: totalFn,
      precision,
      recall,
      per_file: perFile,
      unresolved_gold_entities: unresolvedGold,
    },
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');

  console.log(`NER cold start (s): ${coldStartSeconds.toFixed(3)}`);
  console.log(`NER inference per 1000 chars (ms, mean): ${result.wasm_ner_inference_ms_per_1000_chars.mean.toFixed(3)}`);
  console.log(`Anonymization precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`Anonymization recall: ${(recall * 100).toFixed(1)}%`);
  console.log(`Saved metrics to: ${OUTPUT_PATH}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
