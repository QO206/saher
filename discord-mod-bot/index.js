'use strict';

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes,
} = require('discord.js');

const { scanMessage, addWord, removeWord } = require('./utils/filter');
const db = require('./utils/db');
const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const SEVERITY_LABEL_AR = {
  low: 'بسيطة 🟡',
  medium: 'متوسطة 🟠',
  high: 'عالية 🔴',
  critical: 'خطيرة جداً ⛔',
};

// ------------------------- أدوات مساعدة -------------------------

function isImmune(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return member.roles.cache.some((r) => config.ignoredRoles.includes(r.name));
}

function isIgnoredChannel(channel) {
  return config.ignoredChannels.includes(channel.id) || config.ignoredChannels.includes(channel.name);
}

async function getOrCreateLogChannel(guild) {
  let channel = guild.channels.cache.find((c) => c.name === config.logChannelName);
  return channel || null;
}

async function logViolation(guild, member, message, report) {
  const logChannel = await getOrCreateLogChannel(guild);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(report.highestSeverity === 'critical' ? 0xff0000 : 0xffa500)
    .setTitle('🚨 تم رصد مخالفة')
    .addFields(
      { name: 'العضو', value: `${member} (${member.user.tag})`, inline: true },
      { name: 'القناة', value: `${message.channel}`, inline: true },
      { name: 'مستوى الخطورة', value: SEVERITY_LABEL_AR[report.highestSeverity] || 'غير محدد', inline: true },
      {
        name: 'الكلمات المكتشفة',
        value: report.matches.map((m) => `\`${m.word}\` (${m.category} / ${m.mode})`).join('\n').slice(0, 1024) || '-',
      },
      { name: 'نص الرسالة الأصلي', value: message.content.slice(0, 1000) || '-' },
    )
    .setTimestamp();

  await logChannel.send({ embeds: [embed] }).catch(() => {});
}

async function applyPunishment(member, severityAction, warningCount) {
  // 1) عقوبة حسب خطورة الكلمة نفسها
  if (severityAction?.action === 'timeout') {
    const ms = severityAction.durationMinutes * 60 * 1000;
    await member.timeout(ms, 'مخالفة قواعد السيرفر - محتوى مسيء').catch(() => {});
  }

  // 2) عقوبة تصاعدية حسب عدد الإنذارات المتراكمة
  const thresholdAction = config.warningThresholds[String(warningCount)];
  if (thresholdAction) {
    if (thresholdAction.action === 'timeout') {
      const ms = thresholdAction.durationMinutes * 60 * 1000;
      await member.timeout(ms, `تجاوز ${warningCount} إنذارات`).catch(() => {});
    } else if (thresholdAction.action === 'kick') {
      await member.kick('تجاوز الحد المسموح من الإنذارات').catch(() => {});
    } else if (thresholdAction.action === 'ban') {
      await member.ban({ reason: 'تجاوز الحد الأقصى من الإنذارات' }).catch(() => {});
    }
    return thresholdAction;
  }
  return null;
}

// ------------------------- معالجة الرسائل -------------------------

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !message.guild) return;
    if (isIgnoredChannel(message.channel)) return;

    const member = message.member;
    if (isImmune(member)) return;

    const report = scanMessage(message.content);
    if (!report.flagged) return;

    // حذف الرسالة المخالفة
    if (config.deleteViolatingMessages) {
      await message.delete().catch(() => {});
    }

    // تسجيل الإنذار
    const warningCount = db.addWarning(
      message.guild.id,
      message.author.id,
      report.matches.map((m) => m.word).join(', '),
    );

    // تطبيق العقوبة
    const severityAction = config.punishments[report.highestSeverity];
    const escalated = await applyPunishment(member, severityAction, warningCount);

    // تنبيه العضو في الروم (رسالة تختفي تلقائياً)
    const warnMsg = await message.channel
      .send({
        content: `⚠️ ${message.author}، تم رصد محتوى مخالف لقوانين السيرفر وحذف رسالتك. هذا الإنذار رقم **${warningCount}**.${
          escalated ? ` تم اتخاذ إجراء إضافي: **${escalated.action}**.` : ''
        }`,
      })
      .catch(() => null);
    if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 8000);

    // تسجيل في روم اللوقز
    await logViolation(message.guild, member, message, report);
  } catch (err) {
    console.error('خطأ أثناء معالجة رسالة:', err);
  }
});

// ------------------------- الأوامر (Slash Commands) -------------------------

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'warnings') {
    const target = interaction.options.getUser('user') || interaction.user;
    const warnings = db.getWarnings(interaction.guild.id, target.id);
    const embed = new EmbedBuilder()
      .setTitle(`إنذارات ${target.username}`)
      .setColor(0xffa500)
      .setDescription(
        warnings.length
          ? warnings.map((w, i) => `**${i + 1}.** ${w.reason} — <t:${Math.floor(new Date(w.date).getTime() / 1000)}:R>`).join('\n')
          : 'لا يوجد أي إنذارات ✅',
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'clear-warnings') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({ content: '❌ ما عندك صلاحية لهذا الأمر.', ephemeral: true });
    }
    const target = interaction.options.getUser('user');
    db.clearWarnings(interaction.guild.id, target.id);
    await interaction.reply({ content: `✅ تم مسح جميع إنذارات ${target.username}.`, ephemeral: true });
  }

  if (commandName === 'addword') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: '❌ ما عندك صلاحية لهذا الأمر.', ephemeral: true });
    }
    const word = interaction.options.getString('word');
    const category = interaction.options.getString('category') || 'insults';
    const severity = interaction.options.getString('severity') || 'medium';
    const added = addWord(word, category, severity);
    await interaction.reply({
      content: added ? `✅ تمت إضافة الكلمة إلى القائمة.` : `⚠️ الكلمة موجودة مسبقاً.`,
      ephemeral: true,
    });
  }

  if (commandName === 'removeword') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: '❌ ما عندك صلاحية لهذا الأمر.', ephemeral: true });
    }
    const word = interaction.options.getString('word');
    const removed = removeWord(word);
    await interaction.reply({
      content: removed ? `✅ تم حذف الكلمة من القائمة.` : `⚠️ الكلمة غير موجودة.`,
      ephemeral: true,
    });
  }

  if (commandName === 'testfilter') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.reply({ content: '❌ ما عندك صلاحية لهذا الأمر.', ephemeral: true });
    }
    const text = interaction.options.getString('text');
    const report = scanMessage(text);
    await interaction.reply({
      content: report.flagged
        ? `🚨 **مخالف!**\nالخطورة: ${SEVERITY_LABEL_AR[report.highestSeverity]}\nالمطابقات:\n${report.matches
            .map((m) => `- \`${m.word}\` (${m.mode})`)
            .join('\n')}`
        : '✅ لا يوجد أي مخالفات في هذا النص.',
      ephemeral: true,
    });
  }
});

client.once('ready', () => {
  console.log(`✅ البوت جاهز ويعمل باسم: ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
