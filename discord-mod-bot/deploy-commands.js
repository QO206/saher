'use strict';

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('عرض إنذارات عضو')
    .addUserOption((opt) => opt.setName('user').setDescription('العضو').setRequired(false)),

  new SlashCommandBuilder()
    .setName('clear-warnings')
    .setDescription('مسح جميع إنذارات عضو (للمشرفين فقط)')
    .addUserOption((opt) => opt.setName('user').setDescription('العضو').setRequired(true)),

  new SlashCommandBuilder()
    .setName('addword')
    .setDescription('إضافة كلمة للقائمة السوداء (للمشرفين فقط)')
    .addStringOption((opt) => opt.setName('word').setDescription('الكلمة').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('category')
        .setDescription('التصنيف')
        .addChoices(
          { name: 'insults - إهانات', value: 'insults' },
          { name: 'profanity - سب وشتم', value: 'profanity' },
          { name: 'bullying - تنمر', value: 'bullying' },
          { name: 'racism - عنصرية', value: 'racism' },
          { name: 'sexual_harassment - تحرش', value: 'sexual_harassment' },
          { name: 'severe_hate - كراهية شديدة', value: 'severe_hate' },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('severity')
        .setDescription('مستوى الخطورة')
        .addChoices(
          { name: 'low', value: 'low' },
          { name: 'medium', value: 'medium' },
          { name: 'high', value: 'high' },
          { name: 'critical', value: 'critical' },
        ),
    ),

  new SlashCommandBuilder()
    .setName('removeword')
    .setDescription('حذف كلمة من القائمة السوداء (للمشرفين فقط)')
    .addStringOption((opt) => opt.setName('word').setDescription('الكلمة').setRequired(true)),

  new SlashCommandBuilder()
    .setName('testfilter')
    .setDescription('اختبار الفلتر على نص معيّن (للمشرفين فقط)')
    .addStringOption((opt) => opt.setName('text').setDescription('النص المراد اختباره').setRequired(true)),
].map((c) => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ جاري تسجيل الأوامر...');
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
      body: commands,
    });
    console.log('✅ تم تسجيل الأوامر بنجاح على السيرفر المحدد.');
  } catch (error) {
    console.error(error);
  }
})();
