'use strict';

const fs = require('fs');
const path = require('path');
const levenshtein = require('fast-levenshtein');
const { analyzeText, fullNormalize, stripSeparators } = require('./normalizeText');

const BADWORDS_PATH = path.join(__dirname, '..', 'data', 'badwords.json');
const badwordsData = JSON.parse(fs.readFileSync(BADWORDS_PATH, 'utf8'));

// نبني قائمة موحدة من كل الكلمات مع تطبيعها مسبقاً (Precompute) لأداء أسرع
const WORD_DB = [];
for (const [category, data] of Object.entries(badwordsData)) {
  for (const word of data.words) {
    WORD_DB.push({
      original: word,
      normalized: fullNormalize(word),
      compact: stripSeparators(fullNormalize(word)),
      category,
      severity: data.severity,
    });
  }
}

// نرتب من الأطول للأقصر عشان الكلمات الطويلة تُكتشف أولاً (أدق)
WORD_DB.sort((a, b) => b.compact.length - a.compact.length);

const SEVERITY_WEIGHT = { low: 1, medium: 2, high: 3, critical: 5 };

/**
 * أقصى مسافة ليفنشتاين مسموحة حسب طول الكلمة
 * كلمات قصيرة = تسامح أقل (تفادي False Positives)
 */
function maxAllowedDistance(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

/**
 * فحص التطابق التقريبي (يكشف كتابة خاطئة/محرّفة متعمدة زي "كلبج" أو "fck")
 */
function fuzzyMatch(token, entry) {
  if (token.length < 2) return false;
  const lenDiff = Math.abs(token.length - entry.compact.length);
  if (lenDiff > 2) return false;
  const dist = levenshtein.get(token, entry.compact);
  return dist <= maxAllowedDistance(entry.compact.length);
}

/**
 * الفحص الرئيسي لأي رسالة - يرجع تقرير كامل بكل المطابقات المكتشفة
 */
function scanMessage(rawContent) {
  const { tokens, compact } = analyzeText(rawContent);
  const matches = [];
  const seen = new Set();

  function addMatch(entry, mode) {
    const key = `${entry.original}-${mode}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({
      word: entry.original,
      category: entry.category,
      severity: entry.severity,
      mode, // 'exact' | 'substring' | 'fuzzy' | 'spaced'
    });
  }

  // الطبقة 1: تطابق مباشر أو كجزء من كلمة (لكل توكن على حدة - أدق وأقل false positive)
  for (const token of tokens) {
    if (token.length < 2) continue;
    for (const entry of WORD_DB) {
      if (entry.compact.length < 2) continue;
      if (token === entry.compact) {
        addMatch(entry, 'exact');
      } else if (token.includes(entry.compact)) {
        addMatch(entry, 'substring');
      } else if (entry.severity === 'high' || entry.severity === 'critical') {
        // فقط للكلمات الخطيرة نستخدم التطابق التقريبي على مستوى التوكن الواحد
        if (fuzzyMatch(token, entry)) {
          addMatch(entry, 'fuzzy');
        }
      }
    }
  }

  // الطبقة 2: كشف "التباعد المتعمد" بين الحروف (مثال: "س ب ك" أو "s.p.a.m")
  // بدل فحص الرسالة كاملة (اللي يسبب false positives عشوائية بين كلمتين مجاورتين)،
  // نجمع فقط سلاسل التوكنز المتتالية القصيرة (حرف أو حرفين) - نمط نموذجي للتحايل بالتباعد
  const shortRuns = [];
  let currentRun = [];
  for (const token of tokens) {
    if (token.length > 0 && token.length <= 2) {
      currentRun.push(token);
    } else {
      if (currentRun.length >= 2) shortRuns.push(currentRun.join(''));
      currentRun = [];
    }
  }
  if (currentRun.length >= 2) shortRuns.push(currentRun.join(''));

  for (const run of shortRuns) {
    for (const entry of WORD_DB) {
      if (entry.compact.length < 3) continue;
      if (run.includes(entry.compact)) {
        addMatch(entry, 'spaced');
      }
    }
  }

  // فحص إضافي محصور على الكلمات الخطيرة جداً (critical) على كامل النص المضغوط،
  // لأن احتمال الضرر أكبر من احتمال الـ false positive العرضي في هذه الحالة تحديداً
  for (const entry of WORD_DB) {
    if (entry.severity !== 'critical') continue;
    if (entry.compact.length < 4) continue;
    if (compact.includes(entry.compact)) {
      addMatch(entry, 'spaced-critical');
    }
  }

  // درجة الخطورة الإجمالية للرسالة
  const score = matches.reduce((sum, m) => sum + SEVERITY_WEIGHT[m.severity], 0);
  const highestSeverity = matches.reduce((max, m) => {
    return SEVERITY_WEIGHT[m.severity] > SEVERITY_WEIGHT[max] ? m.severity : max;
  }, 'low');

  return {
    flagged: matches.length > 0,
    matches,
    score,
    highestSeverity: matches.length > 0 ? highestSeverity : null,
  };
}

/**
 * إضافة كلمة جديدة للقائمة السوداء (يستخدمها أمر /addword) + حفظها في الملف
 */
function addWord(word, category = 'insults', severity = 'medium') {
  if (!badwordsData[category]) {
    badwordsData[category] = { severity, words: [] };
  }
  if (badwordsData[category].words.includes(word)) return false;
  badwordsData[category].words.push(word);
  fs.writeFileSync(BADWORDS_PATH, JSON.stringify(badwordsData, null, 2));

  WORD_DB.push({
    original: word,
    normalized: fullNormalize(word),
    compact: stripSeparators(fullNormalize(word)),
    category,
    severity: badwordsData[category].severity,
  });
  WORD_DB.sort((a, b) => b.compact.length - a.compact.length);
  return true;
}

/**
 * حذف كلمة من القائمة السوداء (يستخدمها أمر /removeword)
 */
function removeWord(word) {
  let removed = false;
  for (const category of Object.keys(badwordsData)) {
    const idx = badwordsData[category].words.indexOf(word);
    if (idx !== -1) {
      badwordsData[category].words.splice(idx, 1);
      removed = true;
    }
  }
  if (removed) {
    fs.writeFileSync(BADWORDS_PATH, JSON.stringify(badwordsData, null, 2));
    const dbIdx = WORD_DB.findIndex((e) => e.original === word);
    if (dbIdx !== -1) WORD_DB.splice(dbIdx, 1);
  }
  return removed;
}

module.exports = { scanMessage, addWord, removeWord, WORD_DB };
