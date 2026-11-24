require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const {
  Client, GatewayIntentBits, Partials, Events, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, PermissionsBitField, ChannelType
} = require("discord.js");
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnectionStatus
} = require("@discordjs/voice");
const play = require("play-dl");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

const DATA = path.join(__dirname, "..", "data");
const dbFile = path.join(DATA, "settings.json");
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ autoReplies: [], tickets: {} }, null, 2));
const readDB = () => JSON.parse(fs.readFileSync(dbFile, "utf8"));
const writeDB = d => fs.writeFileSync(dbFile, JSON.stringify(d, null, 2));
const cooldowns = new Map();
const voicePlayers = new Map();

const commands = [
  new SlashCommandBuilder().setName("panel").setDescription("إرسال لوحة التذاكر"),
  new SlashCommandBuilder().setName("embed").setDescription("إرسال إمبد مخصص")
    .addStringOption(o => o.setName("title").setDescription("عنوان الإمبد").setRequired(true))
    .addStringOption(o => o.setName("text").setDescription("نص الإمبد").setRequired(true))
    .addAttachmentOption(o => o.setName("image").setDescription("صورة اختيارية")),
  new SlashCommandBuilder().setName("ticket-setup").setDescription("إعداد قسم التذاكر")
    .addChannelOption(o => o.setName("category").setDescription("قسم التذاكر").addChannelTypes(ChannelType.GuildCategory).setRequired(true)),
  new SlashCommandBuilder().setName("close").setDescription("إغلاق التذكرة الحالية"),
  new SlashCommandBuilder().setName("autoreply-add").setDescription("إضافة رد تلقائي")
    .addStringOption(o => o.setName("keyword").setDescription("الكلمة").setRequired(true))
    .addStringOption(o => o.setName("reply").setDescription("الرد").setRequired(true)),
  new SlashCommandBuilder().setName("welcome-setup").setDescription("تحديد روم الترحيب")
    .addChannelOption(o => o.setName("channel").setDescription("روم الترحيب").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("play").setDescription("تشغيل رابط صوتي")
    .addStringOption(o => o.setName("url").setDescription("رابط صوتي").setRequired(true)),
  new SlashCommandBuilder().setName("stop").setDescription("إيقاف الصوت ومغادرة الروم"),
  new SlashCommandBuilder().setName("kick").setDescription("طرد عضو")
    .addUserOption(o => o.setName("member").setDescription("العضو").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب")),
  new SlashCommandBuilder().setName("ban").setDescription("حظر عضو")
    .addUserOption(o => o.setName("member").setDescription("العضو").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب"))
].map(c => c.toJSON());

client.once(Events.ClientReady, async c => {
  console.log(`LIBERTY CITY online as ${c.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log("Slash commands registered.");
  } catch (e) { console.error("Command registration:", e); }
});

client.on(Events.GuildMemberAdd, async member => {
  const channelId = process.env.WELCOME_CHANNEL_ID || readDB().welcomeChannel;
  const channel = channelId && member.guild.channels.cache.get(channelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor(0x087BCE)
    .setTitle("أهلاً بك في LIBERTY CITY")
    .setDescription(`حياك الله ${member} في سيرفرنا!\nنتمنى لك وقتاً ممتعاً.`)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: "LIBERTY CITY • Welcome" })
    .setTimestamp();
  channel.send({ embeds: [embed] }).catch(console.error);
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  const now = Date.now();
  const previous = cooldowns.get(message.author.id) || 0;
  if (now - previous < 900) {
    // Basic anti-spam: remove repeated rapid messages; does not punish automatically.
    if (message.content.length > 0) message.delete().catch(() => {});
    return;
  }
  cooldowns.set(message.author.id, now);

  const db = readDB();
  const content = message.content.toLowerCase();
  const match = db.autoReplies.find(x => content.includes(x.keyword.toLowerCase()));
  if (match) message.reply({ content: match.reply, allowedMentions: { repliedUser: false } }).catch(() => {});
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "lc_open_ticket") {
        const existing = interaction.guild.channels.cache.find(ch =>
          ch.type === ChannelType.GuildText && ch.topic === `ticket-owner:${interaction.user.id}`);
        if (existing) return interaction.reply({ content: `عندك تذكرة مفتوحة: ${existing}`, ephemeral: true });
        const db = readDB();
        const categoryId = db.ticketCategory || process.env.TICKET_CATEGORY_ID;
        const permissionOverwrites = [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
        ];
        if (process.env.TICKET_STAFF_ROLE_ID) permissionOverwrites.push({
          id: process.env.TICKET_STAFF_ROLE_ID,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
        });
        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90),
          type: ChannelType.GuildText, parent: categoryId || undefined,
          topic: `ticket-owner:${interaction.user.id}`, permissionOverwrites
        });
        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("lc_close_ticket").setLabel("إغلاق التذكرة").setStyle(ButtonStyle.Danger)
        );
        await channel.send({ content: `${interaction.user} أهلاً بك! اكتب طلبك وسيتم الرد عليك.`, components: [closeRow] });
        return interaction.reply({ content: `تم فتح تذكرتك: ${channel}`, ephemeral: true });
      }
      if (interaction.customId === "lc_close_ticket") {
        const isStaff = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);
        const isOwner = interaction.channel.topic === `ticket-owner:${interaction.user.id}`;
        if (!isStaff && !isOwner) return interaction.reply({ content: "ما عندكش صلاحية لإغلاق التذكرة.", ephemeral: true });
        await interaction.reply("سيتم إغلاق التذكرة بعد 3 ثوانٍ.");
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    if (["panel", "embed", "ticket-setup", "autoreply-add", "welcome-setup", "kick", "ban"].includes(commandName)
      && !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
      && !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "هذا الأمر للمسؤولين فقط.", ephemeral: true });
    }

    if (commandName === "panel") {
      const embed = new EmbedBuilder().setColor(0x087BCE).setTitle("LIBERTY CITY | الدعم الفني")
        .setDescription("اضغط الزر بالأسفل لفتح تذكرة خاصة مع فريق الدعم.")
        .setImage("https://dummyimage.com/1200x400/071b35/ffffff.png&text=LIBERTY+CITY");
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("lc_open_ticket").setLabel("فتح تذكرة").setEmoji("🎫").setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ embeds: [embed], components: [row] });
    }
    if (commandName === "embed") {
      const title = interaction.options.getString("title");
      const text = interaction.options.getString("text");
      const image = interaction.options.getAttachment("image");
      const embed = new EmbedBuilder().setColor(0x087BCE).setTitle(title).setDescription(text).setFooter({ text: "LIBERTY CITY" }).setTimestamp();
      if (image?.contentType?.startsWith("image/")) embed.setImage(image.url);
      return interaction.reply({ embeds: [embed] });
    }
    if (commandName === "ticket-setup") {
      const category = interaction.options.getChannel("category");
      const db = readDB(); db.ticketCategory = category.id; writeDB(db);
      return interaction.reply({ content: `تم تحديد قسم التذاكر: ${category}`, ephemeral: true });
    }
    if (commandName === "close") {
      if (interaction.channel.topic?.startsWith("ticket-owner:")) {
        await interaction.reply("سيتم إغلاق التذكرة بعد 3 ثوانٍ.");
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      } else return interaction.reply({ content: "هذا الأمر يعمل داخل التذكرة فقط.", ephemeral: true });
    }
    if (commandName === "autoreply-add") {
      const db = readDB();
      db.autoReplies.push({ keyword: interaction.options.getString("keyword"), reply: interaction.options.getString("reply") });
      writeDB(db);
      return interaction.reply({ content: "تم حفظ الرد التلقائي.", ephemeral: true });
    }
    if (commandName === "welcome-setup") {
      const channel = interaction.options.getChannel("channel");
      process.env.WELCOME_CHANNEL_ID = channel.id;
      const db = readDB(); db.welcomeChannel = channel.id; writeDB(db);
      return interaction.reply({ content: `تم تحديد روم الترحيب: ${channel}. ضع هذا المعرف في WELCOME_CHANNEL_ID داخل ملف .env حتى يبقى بعد إعادة التشغيل.`, ephemeral: true });
    }
    if (commandName === "kick" || commandName === "ban") {
      const user = interaction.options.getUser("member");
      const reason = interaction.options.getString("reason") || "بدون سبب";
      const member = await interaction.guild.members.fetch(user.id);
      if (commandName === "kick") await member.kick(reason);
      else await member.ban({ reason });
      return interaction.reply({ content: `تم ${commandName === "kick" ? "طرد" : "حظر"} ${user.tag}. السبب: ${reason}` });
    }
    if (commandName === "play") {
      const url = interaction.options.getString("url");
      const voice = interaction.member.voice?.channel;
      if (!voice) return interaction.reply({ content: "ادخل روم صوتي أولاً.", ephemeral: true });
      await interaction.deferReply();
      const streamInfo = await play.stream(url);
      const connection = joinVoiceChannel({
        channelId: voice.id, guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      const resource = createAudioResource(streamInfo.stream, { inputType: streamInfo.type });
      player.play(resource); connection.subscribe(player);
      voicePlayers.set(interaction.guild.id, { player, connection });
      player.once(AudioPlayerStatus.Idle, () => { connection.destroy(); voicePlayers.delete(interaction.guild.id); });
      return interaction.editReply("بدأ تشغيل الرابط الصوتي.");
    }
    if (commandName === "stop") {
      const state = voicePlayers.get(interaction.guild.id);
      if (!state) return interaction.reply({ content: "ما فيش تشغيل صوتي حالياً.", ephemeral: true });
      state.player.stop(); state.connection.destroy(); voicePlayers.delete(interaction.guild.id);
      return interaction.reply("تم إيقاف الصوت ومغادرة الروم.");
    }
  } catch (error) {
    console.error(error);
    const msg = "صار خطأ أثناء تنفيذ الأمر. راجع صلاحيات البوت وسجل التشغيل.";
    if (interaction.deferred || interaction.replied) interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
