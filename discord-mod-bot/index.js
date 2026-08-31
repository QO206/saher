// ============================================================
// بوت ديسكورد شامل للحماية - ملف واحد فقط - Node.js + discord.js v14
// - يحذف الشتائم/الروابط المشبوهة/السبام تلقائياً
// - يكتم المخالف ساعة كاملة (Timeout)
// - يعمل في كل قنوات السيرفر بدون استثناء أي رتبة
// - لا قاعدة بيانات دائمة - تتبع مؤقت في الذاكرة (حد أقصى 3 أيام)
// - التوكن من متغير البيئة DISCORD_TOKEN
// ============================================================

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ------------------------------------------------------------
// إعدادات عامة
// ------------------------------------------------------------
const TIMEOUT_DURATION_MS = 60 * 60 * 1000;         // ساعة كاملة
const TRACKING_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000; // 3 أيام (حد أقصى للتتبع في الذاكرة)
const SPAM_WINDOW_MS = 5000;                        // نافذة فحص السبام: 5 ثواني
const SPAM_MAX_MESSAGES = 5;                        // أكثر من 5 رسائل خلال النافذة = سبام
const SPAM_REPEAT_LIMIT = 3;                        // تكرار نفس الرسالة 3 مرات = سبام

// ------------------------------------------------------------
// قائمة الكلمات الممنوعة (الشاملة)
// ------------------------------------------------------------
const BANNED_WORDS = [
  'اهين ابوك', 'كس امك', 'منيوك', 'يا منيوك', 'يا عبد', 'كسامك', 'ابن الكلب',
  'خول', 'شرموط', 'قحبة', 'كلب', 'حمار', 'اهين امك', 'يلعن ابوك', 'يلعن امك',
  'كس ابوك', 'كس اختك', 'كس اهلك', 'كس خالتك', 'كس عمتك', 'كس جدتك',
  'ابن الحرام', 'ابن القحبة', 'بنت الحرام', 'بنت الكلب', 'ابن الزانية',
  'منيوكة', 'شرموطة', 'عاهرة', 'خنيث', 'لوطي', 'زاني', 'زانية', 'داعر',
  'داعرة', 'خنزير', 'خنزيرة', 'بهيمة', 'حيوان', 'قرد', 'قردة', 'تيس',
  'يا حقير', 'يا نجس', 'يا وسخ', 'يا قذر', 'يا تافه', 'يا حثالة', 'يا زبالة',
  'يا نذل', 'يا خسيس', 'يا جبان', 'يا غبي', 'يا احمق', 'يا معتوه', 'يا مجنون',
  'يا عرص', 'يا ديوث', 'يا نصاب', 'يا كذاب', 'يا منافق', 'يا وقح', 'يا سافل',
  'يا رخيص', 'يا فاشل', 'يا ذليل', 'يا مسخ', 'يا خرا', 'يا زفت', 'يا قليل الادب',
  'يا وضيع', 'يا خبيث', 'يا شيطان', 'يا لعين', 'الله يلعنك', 'يخرب بيتك',
  'الله يخرب بيتك', 'تفو عليك', 'يقطع رزقك', 'يا عيل وسخ', 'يا زبالة بشرية',

  // مصري
  'يا معفن', 'يا عبيط', 'يا متخلف', 'يا فاسد', 'يا محتال', 'يا كداب', 'يا خايب',
  'يا نكرة', 'يا زفت يا معفن', 'يا واطي', 'يا حقير يا وسخ', 'يا بايظ', 'يا ابن الوسخة',
  'يا ابن المتناكة', 'يا متناك', 'يا خرابيط', 'يا مغفل', 'يا بهيم', 'يا زق',
  'يا قرف', 'يا نتن', 'يا مقرف', 'يا عفن', 'يا كلب ابن كلب', 'يا حمار ابن حمار',
  'يا خول يا وسخ', 'يا معاق', 'يا اهبل', 'يا اتخن', 'يا مسخره', 'يا فاشل يا زبالة',

  // شامي (سوري/لبناني)
  'يا حيوان يا وسخ', 'يا زلمة وسخ', 'يا قحبة يا وسخة', 'يا خرا يا نجس',
  'يا شرموط يا خنيث', 'يا معفن يا قذر', 'يا داعر يا خبيث', 'يا نجس يا وسخ',
  'يا قليل الاصل', 'يا ناقص', 'يا مقطوع', 'يا بلا اصل', 'يا مو رجال',
  'يا خرب بيتك', 'يا الله يخربيتك', 'يا ابن الكلبة', 'يا زبالة يا حقير',
  'يا وقح يا قليل الادب', 'يا خاين', 'يا غادر', 'يا جبان يا خاين',

  // يمني
  'يا كلب يا نجس', 'يا حمار يا غبي', 'يا خنيث يا وسخ', 'يا وسخ يا قذر',
  'يا نجس يا حقير', 'يا قذر يا سافل', 'يا حقير يا رخيص', 'يا سافل يا خسيس',
  'يا رخيص يا نذل', 'يا خسيس يا وضيع', 'يا نذل يا خبيث', 'يا حيوان يا بهيمة',
  'يا كافر الضمير', 'يا قليل الدين', 'يا فاجر يا خاين', 'يا ملعون',

  // جيزاني/خليجي
  'يا معيوب', 'يا قبيح', 'يا سمج', 'يا وقح يا سمج', 'يا نذل يا معيوب',
  'يا غشيم', 'يا خايس', 'يا مو رجّال', 'يا ناقص رجولة', 'يا خبل', 'يا فالت',
  'يا مدلل وسخ', 'يا حثالة المجتمع', 'يا عار', 'يا فضيحة', 'يا خايب الرجا',

  // إنجليزي
  'fuck', 'fucker', 'fucking', 'fuckyou', 'motherfucker', 'shit', 'bullshit',
  'bitch', 'asshole', 'ass', 'bastard', 'slut', 'whore', 'dick', 'dickhead',
  'pussy', 'cunt', 'faggot', 'fag', 'retard', 'douchebag', 'douche', 'scum',
  'idiot', 'moron', 'jerk', 'loser', 'freak', 'creep', 'pathetic', 'trash',
  'garbage', 'stupid', 'dumbass', 'crap', 'piece of shit', 'screw you',
  'suck my', 'skank', 'twat', 'wanker', 'prick', 'shithead', 'imbecile',
];

// ------------------------------------------------------------
// أنماط الروابط المشبوهة
// ------------------------------------------------------------
const SUSPICIOUS_LINK_PATTERNS = [
  /discord(app)?\.(com|gg)\/invite\/\S+/i,
  /discord\.gg\/\S+/i,
  /\bfree.?nitro\b/i,
  /steamcommunity\S*\.(ru|xyz|top|click|site)/i,
  /\b(bit\.ly|tinyurl\.com|is\.gd|t\.co|shorturl\.at|cutt\.ly|rebrand\.ly)\/\S+/i,
  /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i, // روابط بصيغة IP مباشرة
  /https?:\/\/[^\s]*\.(zip|exe|scr|bat)(\?|$)/i,     // روابط تنتهي بملفات تنفيذية
];

// ------------------------------------------------------------
// تطبيع النص لكشف التحايل بالحروف/الرموز/التكرار
// ------------------------------------------------------------
function normalize(text) {
  let t = text.toLowerCase();
  t = t.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
  t = t
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي');

  const leet = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 'ح', '@': 'a', '$': 's', '!': 'i' };
  t = t.replace(/[013457@$!]/g, (c) => leet[c] || c);

  t = t.replace(/[^ء-يa-z\s]/g, '');

  const noSpaces = t.replace(/\s+/g, '');
  const collapsedWithSpaces = t.replace(/(.)\1+/g, '$1');
  const collapsedNoSpaces = noSpaces.replace(/(.)\1+/g, '$1');

  return [t, noSpaces, collapsedWithSpaces, collapsedNoSpaces];
}

function containsBannedWord(content) {
  const variants = normalize(content);
  return BANNED_WORDS.some((word) => {
    const normWord = normalize(word)[3];
    return variants.some((v) => v.includes(normWord));
  });
}

function containsSuspiciousLink(content) {
  return SUSPICIOUS_LINK_PATTERNS.some((pattern) => pattern.test(content));
}

// ------------------------------------------------------------
// تتبع السبام في الذاكرة (بدون قاعدة بيانات)
// خريطة: userId -> { timestamps: [...], lastContent, repeatCount, updatedAt }
// ------------------------------------------------------------
const spamTracker = new Map();

function checkSpam(userId, content) {
  const now = Date.now();
  let entry = spamTracker.get(userId);

  if (!entry) {
    entry = { timestamps: [], lastContent: content, repeatCount: 1, updatedAt: now };
    spamTracker.set(userId, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < SPAM_WINDOW_MS);
  entry.timestamps.push(now);

  if (entry.lastContent === content) {
    entry.repeatCount += 1;
  } else {
    entry.lastContent = content;
    entry.repeatCount = 1;
  }
  entry.updatedAt = now;

  const isFlood = entry.timestamps.length > SPAM_MAX_MESSAGES;
  const isRepeat = entry.repeatCount >= SPAM_REPEAT_LIMIT;

  return isFlood || isRepeat;
}

// تنظيف دوري للبيانات القديمة (أكثر من 3 أيام) لمنع تضخم الذاكرة
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of spamTracker.entries()) {
    if (now - entry.updatedAt > TRACKING_EXPIRY_MS) {
      spamTracker.delete(userId);
    }
  }
}, 60 * 60 * 1000); // كل ساعة

// ------------------------------------------------------------
// إعداد البوت
// ------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ البوت يعمل الآن: ${client.user.tag}`);
});

async function punish(message, reason) {
  await message.delete().catch(() => {});

  const warning = new EmbedBuilder()
    .setColor(0xff0000)
    .setDescription(`⚠️ ${message.author} — ${reason}\nتم كتمك لمدة **ساعة كاملة**.`);

  const sent = await message.channel.send({ embeds: [warning] }).catch(() => {});
  if (sent) setTimeout(() => sent.delete().catch(() => {}), 8000);

  const member = message.member;
  if (member && member.moderatable) {
    await member.timeout(TIMEOUT_DURATION_MS, reason).catch(() => {});
  }
}

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!message.content) return;

    // النظام يطبّق على الجميع بلا استثناء أي رتبة (بما فيها الإدارة)

    if (containsBannedWord(message.content)) {
      await punish(message, 'استخدام ألفاظ مسيئة.');
      return;
    }

    if (containsSuspiciousLink(message.content)) {
      await punish(message, 'إرسال رابط مشبوه.');
      return;
    }

    if (checkSpam(message.author.id, message.content)) {
      await punish(message, 'إرسال سبام/تكرار رسائل.');
      return;
    }
  } catch (err) {
    console.error('خطأ أثناء معالجة الرسالة:', err);
  }
});

// ------------------------------------------------------------
// تسجيل الدخول
// ------------------------------------------------------------
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ لم يتم العثور على DISCORD_TOKEN في متغيرات البيئة.');
  process.exit(1);
}

client.login(token);
