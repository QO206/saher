'use strict';

/**
 * محرك تطبيع النصوص - قلب النظام الذكي لكشف التلاعب
 * يحوّل أي نص (مهما حاول الشخص تمويهه) إلى صيغة موحدة قابلة للمقارنة
 */

// خريطة الأرابيزي (الأرقام اللي تستخدم كحروف عربية) -> الحرف العربي الأصلي
const ARABIZI_MAP = {
  '2': 'ء',
  '3': 'ع',
  '5': 'خ',
  '6': 'ط',
  '7': 'ح',
  '8': 'غ',
  '9': 'ص',
  "3'": 'غ',
  '6\'': 'ظ',
};

// خريطة الحروف اللاتينية الشائعة الاستخدام كبديل لحروف عربية (leetspeak عربي)
const LEET_MAP = {
  '@': 'ا',
  '4': 'ا',
  '0': 'و',
  '1': 'ي',
  '$': 'س',
  '|<': 'ك',
  'vv': 'و',
};

// حروف عربية لها أكثر من شكل، نوحدها لشكل واحد
const ARABIC_NORMALIZE_MAP = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ة': 'ه',
  'ى': 'ي', 'ئ': 'ي',
  'ؤ': 'و',
  'ً': '', 'ٌ': '', 'ٍ': '', 'َ': '', 'ُ': '', 'ِ': '', 'ّ': '', 'ْ': '', 'ٰ': '',
  'ـ': '', // تطويل
};

// رموز/محارف غير مرئية تُستخدم للتحايل (zero-width, RTL/LTR marks..)
const INVISIBLE_CHARS_REGEX = /[\u200B-\u200F\u202A-\u202E\uFEFF]/g;

// أي رمز مو حرف أو رقم (مسافات، نقاط، شرطات، نجوم..) نستخدمه لكشف "التباعد المتعمد"
const SEPARATORS_REGEX = /[\s\.\-_\*\+~`'"^,،؟!?\/\\|#%&()\[\]{}<>:;=]+/g;

function applyCharMap(text, map) {
  let result = text;
  for (const [from, to] of Object.entries(map)) {
    result = result.split(from).join(to);
  }
  return result;
}

/**
 * تطبيع أساسي: توحيد الحروف العربية + إزالة التشكيل + إزالة المحارف المخفية
 */
function baseNormalize(text) {
  let t = text.toLowerCase();
  t = t.replace(INVISIBLE_CHARS_REGEX, '');
  t = applyCharMap(t, ARABIC_NORMALIZE_MAP);
  return t;
}

/**
 * تحويل الأرابيزي والليتسبيك إلى حروف عربية موحدة
 */
function convertArabiziAndLeet(text) {
  let t = applyCharMap(text, ARABIZI_MAP);
  t = applyCharMap(t, LEET_MAP);
  return t;
}

/**
 * ضغط الحروف المكررة أكثر من مرتين -> حرف واحد
 * يكشف محاولات مثل "كلببببب" أو "fuuuuuck"
 */
function collapseRepeatedChars(text) {
  return text.replace(/(.)\1{2,}/g, '$1');
}

/**
 * إزالة كل الفواصل (مسافات/رموز) - يكشف التباعد المتعمد مثل "س ب ك" أو "س.ب.ك"
 */
function stripSeparators(text) {
  return text.replace(SEPARATORS_REGEX, '');
}

/**
 * التطبيع الكامل لكلمة أو نص - النسخة النهائية الجاهزة للمقارنة
 */
function fullNormalize(text) {
  let t = baseNormalize(text);
  t = convertArabiziAndLeet(t);
  t = collapseRepeatedChars(t);
  return t;
}

/**
 * يرجع نسختين من النص:
 * 1) tokens: كل كلمة متطبعة لحالها (يحافظ على حدود الكلمات لتقليل False Positives)
 * 2) compact: النص كامل بدون أي فواصل (لكشف التباعد المتعمد بين الحروف)
 */
function analyzeText(rawText) {
  const normalizedFull = fullNormalize(rawText);
  const tokens = normalizedFull
    .split(/\s+/)
    .map(stripSeparators)
    .filter(Boolean);

  const compact = stripSeparators(normalizedFull);

  return { tokens, compact, normalizedFull };
}

module.exports = {
  fullNormalize,
  stripSeparators,
  collapseRepeatedChars,
  analyzeText,
};
