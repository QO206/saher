const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Saher is alive!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
// ================================================================
// 🛡️  بوت الحماية الشامل - Discord Moderation Bot
// Node.js + discord.js v14
// ================================================================
// ✅ يحذف الشتائم / الروابط المشبوهة / السبام تلقائياً
// ✅ نظام عقوبات متصاعد (تحذير → كتم → طرد → حظر) قابل للتعديل بالكامل
// ✅ كل الإعدادات والرسائل والعقوبات في القسم العلوي - سهل التعديل
// ✅ إضافة كلمات ممنوعة بسهولة (سطر واحد فقط)
// ✅ يحفظ المخالفات على القرص (offenses.json) فما تضيع بعد إعادة التشغيل
// ✅ أوامر إدارية: عرض المخالفات ومسحها
// ✅ استثناء رتب/قنوات/أعضاء معينين
// ✅ سجل (Log) اختياري في قناة مخصصة
//
// التشغيل:
//   npm init -y
//   npm install discord.js dotenv
//   ضع التوكن في ملف .env هكذا:  DISCORD_TOKEN=your_token_here
//   node moderation-bot.js
// ================================================================

try { require('dotenv').config(); } catch (_) { /* dotenv اختياري */ }

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField,
  ApplicationCommandOptionType,
} = require('discord.js');
const fs = require('fs');
const path = require('path');



// ================================================================
// 1) ⚙️  الإعدادات العامة القابلة للتعديل
// ================================================================
const CONFIG = {
  // ------------------------------------------------------------
  // استثناءات - ضع IDs هنا (رتب / أعضاء / قنوات لا يُطبَّق عليها الفلتر)
  // ------------------------------------------------------------
  EXEMPT_ROLE_IDS: [],      // مثال: ['123456789012345678']
  EXEMPT_USER_IDS: [],
  EXEMPT_CHANNEL_IDS: [],

  // ------------------------------------------------------------
  // قناة السجل (اختياري) - إذا حطيت ID راح يرسل تقرير بكل مخالفة
  // ------------------------------------------------------------
  LOG_CHANNEL_ID: null,     // مثال: '123456789012345678'

  // ------------------------------------------------------------
  // إعدادات كشف السبام
  // ------------------------------------------------------------
  SPAM: {
    WINDOW_MS: 5000,          // النافذة الزمنية لعدّ الرسائل (5 ثواني)
    MAX_MESSAGES_IN_WINDOW: 5,// أقصى عدد رسائل بالنافذة قبل اعتبارها سبام
    REPEAT_LIMIT: 3,          // تكرار نفس الرسالة كم مرة يُعتبر سبام
  },

  // ------------------------------------------------------------
  // مدة تتبّع السبام والمخالفات في الذاكرة (تنظيف تلقائي)
  // ------------------------------------------------------------
  TRACKING_EXPIRY_MS: 3 * 24 * 60 * 60 * 1000, // 3 أيام
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,          // كل ساعة

  // ------------------------------------------------------------
  // إعدادات كشف الكلمات الممنوعة الذكي
  // ------------------------------------------------------------
  DETECTION: {
    // كلمات أقل من هذا الطول ما تُفحص بطريقة "الالتصاق بدون مسافات"
    // (لتفادي false positives زي: ass داخل class) - تُفحص فقط ككلمة كاملة
    SHORT_WORD_SQUASH_THRESHOLD: 4,
  },

  // ------------------------------------------------------------
  // ⚖️  سلّم العقوبات المتصاعد - عدّل بحرية!
  // كل فئة (profanity / link / invite / spam) لها سلّمها الخاص
  // action ممكن تكون: 'warn' | 'timeout' | 'kick' | 'ban'
  // durationMs مطلوبة فقط مع 'timeout'
  // آخر عنصر بالسلّم يتكرر لو تجاوز العضو عدد المستويات
  // ------------------------------------------------------------
  PUNISHMENT_LADDERS: {
    profanity: [
      { action: 'warn' },
      { action: 'timeout', durationMs: 10 * 60 * 1000 },      // 10 دقائق
      { action: 'timeout', durationMs: 60 * 60 * 1000 },      // ساعة
      { action: 'timeout', durationMs: 24 * 60 * 60 * 1000 }, // يوم
      { action: 'kick' },
      { action: 'ban' },
    ],
    suspicious_link: [
      { action: 'timeout', durationMs: 60 * 60 * 1000 },      // ساعة
      { action: 'timeout', durationMs: 24 * 60 * 60 * 1000 }, // يوم
      { action: 'kick' },
      { action: 'ban' },
    ],
    spam: [
      { action: 'warn' },
      { action: 'timeout', durationMs: 15 * 60 * 1000 },      // 15 دقيقة
      { action: 'timeout', durationMs: 60 * 60 * 1000 },      // ساعة
      { action: 'kick' },
    ],
  },

  // ------------------------------------------------------------
  // 🎨 الرسائل - عدّلها كيفما تحب
  // المتغيرات المتاحة: {user} {reason} {duration} {count} {action}
  // ------------------------------------------------------------
  MESSAGES: {
    REASONS: {
      profanity: 'استخدام ألفاظ مسيئة أو عنصرية',
      suspicious_link: 'إرسال رابط مشبوه',
      spam: 'إرسال سبام / تكرار رسائل',
    },
    ACTION_TEXT: {
      warn: 'تم توجيه تحذير له',
      timeout: 'تم كتمه لمدة **{duration}**',
      kick: 'تم طرده من السيرفر',
      ban: 'تم حظره من السيرفر',
    },
    WARNING_TITLE: '⚠️ تنبيه مخالفة',
    WARNING_TEMPLATE: '{user} — السبب: **{reason}**\n{action}\n(المخالفة رقم {count})',
    EMBED_COLOR: 0xff3b3b,
    DELETE_WARNING_AFTER_MS: 8000, // يحذف رسالة التحذير تلقائياً بعد كذا (null = بدون حذف)
    LOG_TITLE: '📋 سجل مخالفة',
  },
};

// ================================================================
// 2) 📋 قائمة الكلمات والعبارات الممنوعة
// ================================================================
// الإضافة سهلة: بس روح لأي فئة تحت وزيد الكلمة بسطرها، مثال:
//   'يا حقير', 'الكلمة الجديدة',
//
// أو سوّي فئة جديدة كاملة بنفس الشكل وأضفها بمصفوفة BANNED_WORDS بالأسفل.
//
// ملاحظة: العبارات المكوّنة من أكثر من كلمة تُكتب بمسافة عادية زي
// 'كس امك' وتُكتشف تلقائياً حتى لو انكتبت ملتصقة أو متباعدة بحروف.
// ================================================================

// --- ألفاظ جنسية / عرضية (الأشد) ---
const SEXUAL_AND_FAMILY_INSULTS = [
  'كسمك', 'كس امك', 'كس ابوك', 'كس اختك', 'كس اهلك',
  'يلعن ابوك', 'يلعن امك', 'يلعن اختك', 'يلعن عرضك',
  'منيوك', 'منيوكة', 'منياك',
  'ابن الكلب', 'بنت الكلب', 'ابن الحرام', 'بنت الحرام', 'ابن القحبة', 'بنت القحبة', 'ابن الزانية',
  'شرموط', 'شرموطة', 'عاهرة', 'قحبة',
  'خول', 'خنيث', 'لوطي', 'لواط', 'ديوث', 'عرص',
  'زاني', 'زانية', 'متناك', 'متناكة',
];

// --- سبّات وإهانات شائعة (استخدام يومي في السيرفرات) ---
const GENERAL_INSULTS = [
  'يا حقير', 'يا نجس', 'يا وسخ', 'يا قذر', 'يا سافل', 'يا رخيص', 'يا حيوان',
  'يا كلب', 'يا حمار', 'يا خنزير', 'يا تافه', 'يا معتوه',
  'يا زبالة', 'يا حثالة', 'يا نذل', 'يا وضيع', 'يا خبيث',
  'قليل الحيا', 'قليل تربية', 'عديم التربية', 'عديم الاصل',
];

// --- كتابة مشفّرة/متحايلة شائعة (بالنقاط أو الشرطات) ---
const OBFUSCATED_VARIANTS = [
  'ك.س.م.ك', 'ك-س-م-ك', 'م.ن.ي.و.ك', 'ش.ر.م.و.ط', 'ق.ح.ب.ه', 'خ.و.ل', 'د.ي.و.ث', 'ع.ر.ص',
];

// --- إنجليزي ---
const ENGLISH_PROFANITY = [
  'fuck', 'fucker', 'fucking', 'fuckyou', 'motherfucker', 'shit', 'bullshit',
  'bitch', 'bitches', 'asshole', 'bastard', 'slut', 'whore', 'dick', 'dickhead',
  'pussy', 'cunt', 'faggot', 'retard', 'douchebag', 'scumbag',
  'dumbass', 'piece of shit', 'screw you', 'twat', 'shithead',
];

// اجمع كل الفئات هنا. لإضافة فئة جديدة: عرّف مصفوفة زي اللي فوق
// وأضفها بهذا السطر.
const BANNED_WORDS = [
  ...SEXUAL_AND_FAMILY_INSULTS,
  ...GENERAL_INSULTS,
  ...OBFUSCATED_VARIANTS,
  ...ENGLISH_PROFANITY,
];

// كلمات/عبارات مستثناة صراحة حتى لو تشابهت مع الممنوعة (لتفادي false positives)
const WORD_WHITELIST = [
  // مثال: 'kassab', 'classic'
];

// ================================================================
// 3) 🔗 أنماط الروابط المشبوهة - أضف Regex جديد بسهولة
// ================================================================
const SUSPICIOUS_LINK_PATTERNS = [
  /discord(app)?\.(com|gg)\/invite\/\S+/i,
  /discord\.gg\/\S+/i,
  /\bfree.?nitro\b/i,
  /steamcommunity\S*\.(ru|xyz|top|click|site)/i,
  /\b(bit\.ly|tinyurl\.com|is\.gd|t\.co|shorturl\.at|cutt\.ly|rebrand\.ly|grabify\.link|iplogger\.org)\/\S+/i,
  /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, // روابط IP مباشرة
  /https?:\/\/[^\s]*\.(zip|exe|scr|bat|msi|jar)(\?|$)/i, // ملفات تنفيذية
];

// روابط الدعوات تُعامل كفئة منفصلة (يمكن السماح بروابط دعوة سيرفرك نفسه)
const OWN_INVITE_WHITELIST = [
  // مثال: 'discord.gg/your-server-code'
];

// ================================================================
// 4) 🧠 محرك التطبيع والكشف الذكي
// ================================================================
const LEET_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
  '7': 'ح', '@': 'a', '$': 's', '!': 'i', '8': 'ب', '9': 'و',
};

/** يطبّع نص عربي/إنجليزي: يوحّد الحروف، يفك leet-speak، يزيل التشكيل */
function normalizeText(text) {
  let t = text.toLowerCase();
  t = t.replace(/[\u064B-\u0652\u0670\u0640]/g, ''); // إزالة التشكيل والتطويل
  t = t
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي');
  t = t.replace(/[0134578@$!]/g, (c) => LEET_MAP[c] || c);
  // يبقي فقط الحروف العربية/الإنجليزية والمسافات
  t = t.replace(/[^ء-يa-z\s]/g, ' ');
  // يقلّص المسافات المتعددة لمسافة وحدة
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** يقلّص الحروف المكررة المتتالية: كسسسسمك -> كسمك */
function collapseRepeats(str) {
  return str.replace(/(.)\1+/g, '$1');
}

/** يجهز عبارة ممنوعة إلى مصفوفة توكنز مطبّعة */
function bannedPhraseToTokens(phrase) {
  return normalizeText(phrase)
    .split(' ')
    .filter(Boolean)
    .map((tok) => collapseRepeats(tok));
}

const BANNED_PHRASES_TOKENIZED = BANNED_WORDS.map((w) => ({
  original: w,
  tokens: bannedPhraseToTokens(w),
  squashed: collapseRepeats(bannedPhraseToTokens(w).join('')),
}));

const WHITELIST_NORMALIZED = WORD_WHITELIST.map((w) => normalizeText(w));

function isWhitelisted(normalizedMessage) {
  return WHITELIST_NORMALIZED.some((w) => w && normalizedMessage.includes(w));
}

/**
 * كشف ذكي للكلمات الممنوعة:
 * 1) مطابقة توكن-بتوكن (نافذة منزلقة) - تحمي من false positives (ass في class)
 * 2) مطابقة "ملتصقة بدون مسافات" فقط للكلمات الطويلة كفاية - تكشف
 *    التحايل بالتباعد الحرفي (ك س م ك) بدون التضحية بالدقة
 */
function containsBannedWord(content) {
  const normalized = normalizeText(content);
  if (isWhitelisted(normalized)) return { found: false };

  const rawTokens = normalized.split(' ').filter(Boolean);
  const collapsedTokens = rawTokens.map(collapseRepeats);
  const squashedNoSpaces = collapseRepeats(collapsedTokens.join(''));

  for (const entry of BANNED_PHRASES_TOKENIZED) {
    const len = entry.tokens.length;
    if (len === 0) continue;

    // --- المطابقة 1: توكنز متتالية مطابقة تماماً ---
    for (let i = 0; i <= collapsedTokens.length - len; i++) {
      let match = true;
      for (let j = 0; j < len; j++) {
        if (collapsedTokens[i + j] !== entry.tokens[j]) { match = false; break; }
      }
      if (match) return { found: true, word: entry.original, method: 'exact' };
    }

    // --- المطابقة 2: نص ملتصق (لمقاومة التباعد الحرفي) للكلمات الطويلة فقط ---
    if (entry.squashed.length >= CONFIG.DETECTION.SHORT_WORD_SQUASH_THRESHOLD) {
      if (squashedNoSpaces.includes(entry.squashed)) {
        return { found: true, word: entry.original, method: 'squashed' };
      }
    }
  }

  return { found: false };
}

function containsSuspiciousLink(content) {
  for (const own of OWN_INVITE_WHITELIST) {
    if (own && content.includes(own)) return false;
  }
  return SUSPICIOUS_LINK_PATTERNS.some((pattern) => pattern.test(content));
}

// ================================================================
// 5) 💾 نظام تتبّع المخالفات (يُحفظ على القرص)
// ================================================================
const OFFENSES_FILE = path.join(__dirname, 'offenses.json');

/** الشكل: { [userId]: { [category]: count } } */
let offensesData = {};

function loadOffenses() {
  try {
    if (fs.existsSync(OFFENSES_FILE)) {
      offensesData = JSON.parse(fs.readFileSync(OFFENSES_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('⚠️ فشل تحميل ملف المخالفات، سيتم البدء من جديد:', err.message);
    offensesData = {};
  }
}

let saveTimer = null;
function saveOffenses() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(OFFENSES_FILE, JSON.stringify(offensesData, null, 2), (err) => {
      if (err) console.error('⚠️ فشل حفظ ملف المخالفات:', err.message);
    });
  }, 500); // تجميع الكتابات المتقاربة
}

function incrementOffense(userId, category) {
  if (!offensesData[userId]) offensesData[userId] = {};
  offensesData[userId][category] = (offensesData[userId][category] || 0) + 1;
  saveOffenses();
  return offensesData[userId][category];
}

function getOffenseCount(userId, category) {
  return offensesData[userId]?.[category] || 0;
}

function resetOffenses(userId, category = null) {
  if (!offensesData[userId]) return;
  if (category) delete offensesData[userId][category];
  else delete offensesData[userId];
  saveOffenses();
}

loadOffenses();

// ================================================================
// 6) 🚫 تتبّع السبام في الذاكرة
// ================================================================
const spamTracker = new Map();

function checkSpam(userId, content) {
  const now = Date.now();
  let entry = spamTracker.get(userId);

  if (!entry) {
    entry = { timestamps: [], lastContent: content, repeatCount: 1, updatedAt: now };
    spamTracker.set(userId, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < CONFIG.SPAM.WINDOW_MS);
  entry.timestamps.push(now);

  if (entry.lastContent === content) {
    entry.repeatCount += 1;
  } else {
    entry.lastContent = content;
    entry.repeatCount = 1;
  }
  entry.updatedAt = now;

  const isFlood = entry.timestamps.length > CONFIG.SPAM.MAX_MESSAGES_IN_WINDOW;
  const isRepeat = entry.repeatCount >= CONFIG.SPAM.REPEAT_LIMIT;

  return isFlood || isRepeat;
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of spamTracker.entries()) {
    if (now - entry.updatedAt > CONFIG.TRACKING_EXPIRY_MS) {
      spamTracker.delete(userId);
    }
  }
}, CONFIG.CLEANUP_INTERVAL_MS);

// ================================================================
// 7) ⚖️ منفّذ العقوبات المتصاعد
// ================================================================
function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `${days} يوم`;
}

function fillTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : ''));
}

function isExempt(message) {
  if (CONFIG.EXEMPT_USER_IDS.includes(message.author.id)) return true;
  if (CONFIG.EXEMPT_CHANNEL_IDS.includes(message.channel.id)) return true;
  if (message.member && CONFIG.EXEMPT_ROLE_IDS.some((r) => message.member.roles.cache.has(r))) return true;
  return false;
}

async function sendLog(guild, { user, category, reason, action, count }) {
  if (!CONFIG.LOG_CHANNEL_ID) return;
  const channel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(CONFIG.MESSAGES.EMBED_COLOR)
    .setTitle(CONFIG.MESSAGES.LOG_TITLE)
    .addFields(
      { name: 'العضو', value: `${user} (${user.id})`, inline: false },
      { name: 'الفئة', value: category, inline: true },
      { name: 'السبب', value: reason, inline: true },
      { name: 'الإجراء', value: action, inline: true },
      { name: 'عدد المخالفات بهذه الفئة', value: String(count), inline: true },
    )
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
}

async function applyPunishment(message, category) {
  const member = message.member;
  const guild = message.guild;
  const reason = CONFIG.MESSAGES.REASONS[category] || category;

  await message.delete().catch(() => {});

  const count = incrementOffense(message.author.id, category);
  const ladder = CONFIG.PUNISHMENT_LADDERS[category] || [];
  if (ladder.length === 0) return;

  const level = ladder[Math.min(count - 1, ladder.length - 1)];
  let actionText = '';

  try {
    switch (level.action) {
      case 'warn':
        actionText = CONFIG.MESSAGES.ACTION_TEXT.warn;
        break;

      case 'timeout':
        if (member && member.moderatable) {
          await member.timeout(level.durationMs, reason);
        }
        actionText = fillTemplate(CONFIG.MESSAGES.ACTION_TEXT.timeout, {
          duration: formatDuration(level.durationMs),
        });
        break;

      case 'kick':
        if (member && member.kickable) {
          await member.kick(reason);
        }
        actionText = CONFIG.MESSAGES.ACTION_TEXT.kick;
        break;

      case 'ban':
        if (member && member.bannable) {
          await member.ban({ reason });
        }
        actionText = CONFIG.MESSAGES.ACTION_TEXT.ban;
        break;
    }
  } catch (err) {
    console.error(`⚠️ فشل تنفيذ العقوبة (${level.action}) على ${message.author.tag}:`, err.message);
    actionText = 'تعذّر تنفيذ العقوبة (تحقق من صلاحيات البوت وترتيب الرتب)';
  }

  const warningEmbed = new EmbedBuilder()
    .setColor(CONFIG.MESSAGES.EMBED_COLOR)
    .setDescription(
      fillTemplate(CONFIG.MESSAGES.WARNING_TEMPLATE, {
        user: `${message.author}`,
        reason,
        action: actionText,
        count,
      })
    );

  const sent = await message.channel.send({ embeds: [warningEmbed] }).catch(() => {});
  if (sent && CONFIG.MESSAGES.DELETE_WARNING_AFTER_MS) {
    setTimeout(() => sent.delete().catch(() => {}), CONFIG.MESSAGES.DELETE_WARNING_AFTER_MS);
  }

  await sendLog(guild, {
    user: message.author,
    category,
    reason,
    action: actionText,
    count,
  });
}

// ================================================================
// 8) 🤖 إعداد العميل والأحداث
// ================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', async () => {
  console.log(`✅ البوت يعمل الآن: ${client.user.tag}`);
  await registerSlashCommands();
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content) return;
    if (isExempt(message)) return;

    const wordCheck = containsBannedWord(message.content);
    if (wordCheck.found) {
      await applyPunishment(message, 'profanity');
      return;
    }

    if (containsSuspiciousLink(message.content)) {
      await applyPunishment(message, 'suspicious_link');
      return;
    }

    if (checkSpam(message.author.id, message.content)) {
      await applyPunishment(message, 'spam');
      return;
    }
  } catch (err) {
    console.error('❌ خطأ أثناء معالجة الرسالة:', err);
  }
});

// ================================================================
// 9) 🧾 أوامر الأدمن (Slash Commands)
//    /مخالفات @عضو        -> يعرض عدد مخالفات العضو بكل فئة
//    /مسح-مخالفات @عضو    -> يمسح مخالفات العضو (يتطلب صلاحية إدارة)
// ================================================================
async function registerSlashCommands() {
  const commands = [
    {
      name: 'مخالفات',
      description: 'عرض عدد مخالفات عضو',
      options: [
        {
          name: 'العضو',
          description: 'العضو المطلوب عرض مخالفاته',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
      ],
    },
    {
      name: 'مسح-مخالفات',
      description: 'مسح مخالفات عضو (إداري)',
      options: [
        {
          name: 'العضو',
          description: 'العضو المطلوب مسح مخالفاته',
          type: ApplicationCommandOptionType.User,
          required: true,
        },
        {
          name: 'الفئة',
          description: 'فئة محددة فقط (اتركه فارغ لمسح الكل)',
          type: ApplicationCommandOptionType.String,
          required: false,
          choices: [
            { name: 'شتائم', value: 'profanity' },
            { name: 'روابط', value: 'suspicious_link' },
            { name: 'سبام', value: 'spam' },
          ],
        },
      ],
    },
  ];

  for (const [, guild] of client.guilds.cache) {
    await guild.commands.set(commands).catch((err) => {
      console.error(`⚠️ فشل تسجيل الأوامر في ${guild.name}:`, err.message);
    });
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'مخالفات') {
    const target = interaction.options.getUser('العضو');
    const data = offensesData[target.id] || {};
    const lines = Object.entries(CONFIG.MESSAGES.REASONS).map(
      ([key, label]) => `**${label}:** ${data[key] || 0}`
    );

    const embed = new EmbedBuilder()
      .setColor(CONFIG.MESSAGES.EMBED_COLOR)
      .setTitle(`📊 مخالفات ${target.username}`)
      .setDescription(lines.join('\n') || 'لا توجد مخالفات مسجّلة');

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (interaction.commandName === 'مسح-مخالفات') {
    const hasPerm = interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers);
    if (!hasPerm) {
      await interaction.reply({ content: '❌ ما عندك صلاحية استخدام هذا الأمر.', ephemeral: true });
      return;
    }

    const target = interaction.options.getUser('العضو');
    const category = interaction.options.getString('الفئة');
    resetOffenses(target.id, category);

    await interaction.reply({
      content: `✅ تم مسح مخالفات ${target.username}${category ? ` (فئة: ${category})` : ' (الكل)'}.`,
      ephemeral: true,
    });
  }
});

// ================================================================
// 10) 🚀 تسجيل الدخول
// ================================================================
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ لم يتم العثور على DISCORD_TOKEN. أضفه في ملف .env أو متغيرات البيئة.');
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error('❌ فشل تسجيل دخول البوت:', err.message);
  process.exit(1);
});
