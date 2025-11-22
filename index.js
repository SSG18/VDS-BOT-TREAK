// index.js (ОПТИМИЗИРОВАННАЯ ВЕРСИЯ)
import 'dotenv/config';
import { nanoid } from "nanoid";
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from "discord.js";
import db from "./database.js";

// ================== CONFIG ==================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// ================== DATABASE ERROR HANDLING ==================
async function safeDatabaseCall(operation, fallback = null) {
  try {
    return await operation();
  } catch (error) {
    console.error(`❌ Database error in ${operation.name}:`, error.message);
    return fallback;
  }
}

const CHAMBER_CHANNELS = {
  'sf': process.env.SF_CHANNEL_ID,
  'gd_rublevka': process.env.GD_RUBLEVKA_CHANNEL_ID,
  'gd_arbat': process.env.GD_ARBAT_CHANNEL_ID,
  'gd_patricki': process.env.GD_PATRICKI_CHANNEL_ID,
  'gd_tverskoy': process.env.GD_TVERSKOY_CHANNEL_ID
};

const MEETING_CHANNELS = {
  'sf': process.env.SF_MEETING_CHANNEL_ID,
  'gd_rublevka': process.env.GD_RUBLEVKA_MEETING_CHANNEL_ID,
  'gd_arbat': process.env.GD_ARBAT_MEETING_CHANNEL_ID,
  'gd_patricki': process.env.GD_PATRICKI_MEETING_CHANNEL_ID,
  'gd_tverskoy': process.env.GD_TVERSKOY_MEETING_CHANNEL_ID
};

const MEETING_MENTION_ROLES = {
  'sf': process.env.SF_MENTION_ROLE_ID,
  'gd_rublevka': process.env.GD_RUBLEVKA_MENTION_ROLE_ID,
  'gd_arbat': process.env.GD_ARBAT_MENTION_ROLE_ID,
  'gd_patricki': process.env.GD_PATRICKI_MENTION_ROLE_ID,
  'gd_tverskoy': process.env.GD_TVERSKOY_MENTION_ROLE_ID
};

const DELEGATION_CHANNEL_ID = '1441159654284464148';

const ROLES = {
  SENATOR: process.env.SENATOR_ROLE_ID,
  SENATOR_NO_VOTE: process.env.SENATOR_NO_VOTE_ROLE_ID,
  DEPUTY: process.env.DEPUTY_ROLE_ID,
  DEPUTY_NO_VOTE: process.env.DEPUTY_NO_VOTE_ROLE_ID,
  CHAIRMAN: process.env.CHAIRMAN_ROLE_ID,
  VICE_CHAIRMAN: process.env.VICE_CHAIRMAN_ROLE_ID,
  GOVERNMENT_CHAIRMAN: process.env.GOVERNMENT_CHAIRMAN_ROLE_ID,
  PRESIDENT: process.env.PRESIDENT_USER_ID,
  RUBLEVKA: process.env.RUBLEVKA_ROLE_ID,
  ARBAT: process.env.ARBAT_ROLE_ID,
  PATRICKI: process.env.PATRICKI_ROLE_ID,
  TVERSKOY: process.env.TVERSKOY_ROLE_ID
};

const FORUM_TAGS = {
  ON_REVIEW: process.env.FORUM_TAG_ON_REVIEW,
  APPROVED: process.env.FORUM_TAG_APPROVED,
  REJECTED: process.env.FORUM_TAG_REJECTED,
  NOT_APPROVED: process.env.FORUM_TAG_NOT_APPROVED,
  SIGNED: process.env.FORUM_TAG_SIGNED,
  VETOED: process.env.FORUM_TAG_VETOED
};

const ADMIN_ROLE_SEND_ID = process.env.ADMIN_ROLE_SEND_ID;
const SYSADMIN_ROLE_ID = process.env.SYSADMIN_ROLE_ID;

const FOOTER = "РЕАЛИЗОВАНО ПРИ ПОДДЕРЖКЕ ВСЕРОССИЙСКОЙ ПОЛИТИЧЕСКОЙ ПАРТИИ «ДОБРОДЕТЕЛИ РОССИИ»";

const COLORS = {
  PRIMARY: 0x3498db,
  SUCCESS: 0x2ecc71,
  DANGER: 0xe74c3c,
  WARNING: 0xf39c12,
  SECONDARY: 0x95a5a6,
  INFO: 0x9b59b6
};

const CHAMBER_NAMES = {
  'sf': 'Совет Федерации',
  'gd_rublevka': 'Государственная дума | Рублевка',
  'gd_arbat': 'Государственная дума | Арбат', 
  'gd_patricki': 'Государственная дума | Патрики',
  'gd_tverskoy': 'Государственная дума | Тверской'
};

const CHAMBER_CHAIRMAN_ROLES = {
  'sf': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN],
  'gd_rublevka': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN, ROLES.RUBLEVKA],
  'gd_arbat': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN, ROLES.ARBAT],
  'gd_patricki': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN, ROLES.PATRICKI],
  'gd_tverskoy': [ROLES.CHAIRMAN, ROLES.VICE_CHAIRMAN, ROLES.TVERSKOY]
};

const CHANNEL_TO_CHAMBER = Object.fromEntries(
  Object.entries(MEETING_CHANNELS).map(([chamber, channelId]) => [channelId, chamber])
);

const EVENT_EMOJIS = {
  'registration': '📥',
  'vote_result': '🗳️',
  'government_approval': '✅',
  'government_return': '↩️',
  'president_sign': '🖊️',
  'president_veto': '❌',
  'transfer': '🔄',
  'agenda_inclusion': '📋',
  'default': '📌'
};

// ================== GLOBAL VARIABLES ==================
let delegationMessageId = null;
const meetingTimers = new Map();
const voteTimers = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction],
});

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ================== UTILITY FUNCTIONS ==================
function isAdmin(member) {
  return member.roles.cache.has(ADMIN_ROLE_SEND_ID) || member.roles.cache.has(SYSADMIN_ROLE_ID);
}

function isChamberChairman(member, chamber) {
  const requiredRoles = CHAMBER_CHAIRMAN_ROLES[chamber];
  if (!requiredRoles) return false;
  return requiredRoles.some(roleId => member.roles.cache.has(roleId));
}

function isGovernmentChairman(member, chamber) {
  return member.roles.cache.has(ROLES.GOVERNMENT_CHAIRMAN) && 
         member.roles.cache.has(getChamberTerritoryRole(chamber));
}

function getChamberTerritoryRole(chamber) {
  switch(chamber) {
    case 'gd_rublevka': return ROLES.RUBLEVKA;
    case 'gd_arbat': return ROLES.ARBAT;
    case 'gd_patricki': return ROLES.PATRICKI;
    case 'gd_tverskoy': return ROLES.TVERSKOY;
    default: return null;
  }
}

function getChamberByChannel(channelId) {
  return CHANNEL_TO_CHAMBER[channelId];
}

function parseCustomDuration(str) {
  const timeUnits = {
    'd': 24 * 60 * 60 * 1000,
    'h': 60 * 60 * 1000, 
    'm': 60 * 1000,
    's': 1000
  };

  let totalMs = 0;
  const regex = /(\d+)([dhms])/g;
  let match;

  while ((match = regex.exec(str)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];
    totalMs += value * timeUnits[unit];
  }

  return totalMs || 60 * 60 * 1000;
}

function formatTimeLeft(ms) {
  if (ms <= 0) return "0s";
  
  const sec = Math.ceil(ms / 1000);
  const days = Math.floor(sec / (24 * 60 * 60));
  const hours = Math.floor((sec % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((sec % (60 * 60)) / 60);
  const seconds = sec % 60;

  const parts = [];
  
  if (days > 0) {
    parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
  } else if (hours > 0) {
    parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
  } else if (minutes > 0) {
    parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
  } else {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

function formatMoscowTime(timestamp) {
  try {
    const date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) return "Некорректная дата";
    
    return date.toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error("❌ Error formatting Moscow time:", error);
    return "Ошибка формата даты";
  }
}

function getFormulaDescription(formula) {
  switch (formula) {
    case '0': return 'Простое большинство';
    case '1': return '2/3 голосов';
    case '2': return '3/4 голосов';
    case '3': return 'Большинство от общего количества';
    default: return 'Простое большинство';
  }
}

function calculateVoteResult(forCount, againstCount, abstainCount, formula, totalMembers = 53) {
  const totalVoted = forCount + againstCount + abstainCount;
  
  let requiredFor = 0;
  let requiredTotal = 0;
  
  switch (formula) {
    case '0':
      requiredFor = Math.floor(totalVoted / 2) + 1;
      requiredTotal = totalVoted;
      break;
    case '1':
      requiredFor = Math.ceil(totalVoted * 2 / 3);
      requiredTotal = totalVoted;
      break;
    case '2':
      requiredFor = Math.ceil(totalVoted * 3 / 4);
      requiredTotal = totalVoted;
      break;
    case '3':
      requiredFor = Math.ceil(totalMembers / 2);
      requiredTotal = totalMembers;
      break;
    default:
      requiredFor = Math.floor(totalVoted / 2) + 1;
      requiredTotal = totalVoted;
  }
  
  return { requiredFor, requiredTotal, isPassed: forCount >= requiredFor };
}

function getEventTitle(event) {
  switch (event.type) {
    case 'registration': return `Внесение в ${CHAMBER_NAMES[event.chamber]}`;
    case 'vote_result': return `Результат голосования в ${CHAMBER_NAMES[event.chamber]}`;
    case 'government_approval': return 'Одобрено Правительством';
    case 'government_return': return 'Возвращено Правительством';
    case 'president_sign': return 'Подписано Президентом';
    case 'president_veto': return 'Отклонено Президентом';
    case 'transfer': return 'Передача в Совет Федерации';
    case 'agenda_inclusion': return 'Включен в повестку';
    default: return 'Событие';
  }
}

function getAvailableChambers(member) {
  const available = [];
  
  const chamberRoles = {
    'sf': [ROLES.SENATOR, ROLES.SENATOR_NO_VOTE],
    'gd_rublevka': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.RUBLEVKA],
    'gd_arbat': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.ARBAT],
    'gd_patricki': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.PATRICKI],
    'gd_tverskoy': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.TVERSKOY]
  };
  
  for (const [chamber, requiredRoles] of Object.entries(chamberRoles)) {
    if (requiredRoles.some(roleId => member.roles.cache.has(roleId))) {
      available.push({
        value: chamber,
        label: CHAMBER_NAMES[chamber]
      });
    }
  }
  
  return available;
}

async function canUserVote(proposal, userId, voting, meetingId = null) {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    const member = await guild.members.fetch(userId);
    
    let meeting;
    if (meetingId) {
      meeting = await db.getMeeting(meetingId);
    } else {
      meeting = await db.getLastMeetingByChamber(proposal.chamber);
    }
    
    if (!meeting) {
      return { canVote: false, reason: "❌ Нет активного заседания для этой палаты." };
    }
    
    const inAgenda = await db.isProposalInAgenda(meeting.id, proposal.id);
    if (!inAgenda) {
      return { canVote: false, reason: "❌ Этот законопроект не в повестке текущего заседания." };
    }
    
    const isRegistered = await db.isUserRegistered(meeting.id, userId);
    if (!isRegistered) {
      return { canVote: false, reason: "❌ Вы не зарегистрированы на текущее заседание." };
    }
    
    const chamberRoles = {
      'sf': [ROLES.SENATOR, ROLES.SENATOR_NO_VOTE],
      'gd_rublevka': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.RUBLEVKA],
      'gd_arbat': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.ARBAT],
      'gd_patricki': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.PATRICKI],
      'gd_tverskoy': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.TVERSKOY]
    };
    
    const userChamberRoles = chamberRoles[proposal.chamber] || [];
    const hasChamberRole = userChamberRoles.some(roleId => member.roles.cache.has(roleId));
    
    if (!hasChamberRole) {
      return { canVote: false, reason: "❌ Вы не принадлежите к этой палате." };
    }
    
    return { canVote: true, meetingId: meeting.id };
  } catch (error) {
    console.error("❌ Error checking voting permission:", error);
    return { canVote: false, reason: "❌ Ошибка проверки прав голосования." };
  }
}

async function getDelegatedVote(userId) {
  return await db.getActiveDelegation(userId);
}

// ================== DELEGATION SYSTEM ==================
async function updateDelegationMessage() {
  return await safeDatabaseCall(async () => {
    try {
      const channel = await client.channels.fetch(DELEGATION_CHANNEL_ID);
      const delegations = await db.getAllActiveDelegations();
      
      let description = '**📊 Текущие делегирования голосов:**\n\n';
      
      if (!delegations || delegations.length === 0) {
        description += '*На данный момент нет активных делегирований.*';
      } else {
        for (const delegation of delegations) {
          try {
            description += `• <@${delegation.delegator_id}> → <@${delegation.delegate_id}>\n`;
          } catch (error) {
            description += `• <@${delegation.delegator_id}> → <@${delegation.delegate_id}>\n`;
          }
        }
      }
      
      const embed = new EmbedBuilder()
        .setTitle('🎯 Система делегирования голосов')
        .setDescription(description)
        .setColor(COLORS.INFO)
        .setFooter({ text: FOOTER })
        .setTimestamp();
      
      if (delegationMessageId) {
        try {
          const message = await channel.messages.fetch(delegationMessageId);
          await message.edit({ embeds: [embed] });
        } catch (error) {
          const message = await channel.send({ embeds: [embed] });
          delegationMessageId = message.id;
        }
      } else {
        const message = await channel.send({ embeds: [embed] });
        delegationMessageId = message.id;
      }
      
      return delegationMessageId;
    } catch (error) {
      console.error('❌ Error updating delegation message:', error);
      return null;
    }
  }, null);
}

// ================== COMMANDS REGISTRATION ==================
const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Показать справку по использованию бота"),
  new SlashCommandBuilder().setName("send").setDescription("Открыть форму регистрации законопроекта"),
  new SlashCommandBuilder()
    .setName("create_meeting")
    .setDescription("Создать заседание (только для председателей)"),
  new SlashCommandBuilder().setName("res_meeting").setDescription("Снять роль голосующего у всех (админы)"),
  new SlashCommandBuilder()
    .setName("delegate")
    .setDescription("Делегировать свой голос другому сенатору")
    .addUserOption((o) => o.setName("target").setDescription("Сенатор, которому делегируется голос").setRequired(true)),
  new SlashCommandBuilder()
    .setName("undelegate")
    .setDescription("Отозвать делегирование голоса")
    .addUserOption((o) => o.setName("target").setDescription("Сенатор, у которого отзывается делегирование").setRequired(false)),
].map((c) => c.toJSON());

(async () => {
  try {
    console.log("🔄 Registering commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Commands registered.");
  } catch (e) {
    console.error("❌ Error registering commands:", e);
  }
})();

// ================== CORE FUNCTIONALITY ==================
async function updateHistoryMessage(proposalId) {
  try {
    const proposal = await db.getProposal(proposalId);
    if (!proposal || !proposal.threadid) return;

    const thread = await client.channels.fetch(proposal.threadid);
    
    let description = '';
    if (proposal.events && proposal.events.length > 0) {
      const sortedEvents = [...proposal.events].sort((a, b) => a.timestamp - b.timestamp);
      
      for (const event of sortedEvents) {
        const timestamp = formatMoscowTime(event.timestamp);
        const emoji = EVENT_EMOJIS[event.type] || EVENT_EMOJIS.default;
        
        let eventText = `${emoji} **${getEventTitle(event)}**\n`;
        eventText += `⏰ ${timestamp}\n`;
        
        if (event.description) {
          let formattedDescription = event.description.replace(/<@!?(\d+)>/g, (match, userId) => {
            return `**<@${userId}>**`;
          });
          
          if (event.type === 'vote_result') {
            const resultEmoji = event.result === 'Принято' ? '✅' : 
                               event.result === 'Отклонено' ? '❌' : '⚪';
            formattedDescription = `${resultEmoji} ${formattedDescription}`;
          }
          
          eventText += `${formattedDescription}\n`;
        }
        
        eventText += '\\_\\_\\_\\_\\_\n\n';
        description += eventText;
      }
    } else {
      description = '📝 *Событий пока нет. История начнет заполняться после регистрации и рассмотрения законопроекта.*';
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📜 Хронология законопроекта')
      .setDescription(description)
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: FOOTER })
      .setTimestamp();
    
    if (proposal.historymessageid) {
      try {
        const message = await thread.messages.fetch(proposal.historymessageid);
        await message.edit({ embeds: [embed] });
        return;
      } catch (e) {
        console.log("ℹ️ History message not found, sending new one");
      }
    }
    
    const message = await thread.send({ embeds: [embed] });
    await db.updateProposalHistoryMessage(proposalId, message.id);
    
  } catch (error) {
    console.error("❌ Error updating history message:", error);
  }
}

async function addProposalEvent(proposalId, event) {
  try {
    const proposal = await db.getProposal(proposalId);
    if (!proposal) return;

    const events = proposal.events || [];
    events.push(event);
    await db.updateProposalEvents(proposalId, events);
    await updateHistoryMessage(proposalId);
  } catch (error) {
    console.error("❌ Error adding proposal event:", error);
  }
}

// ================== MEETING SYSTEM ==================
async function createMeetingWithAgenda(interaction, chamber, title, selectedProposals) {
  const id = nanoid(8);
  const meeting = {
    id,
    title,
    meetingDate: new Date().toLocaleDateString('ru-RU'),
    chamber: chamber,
    channelId: interaction.channelId,
    messageId: null,
    threadId: null,
    createdAt: Date.now(),
    durationMs: 0,
    expiresAt: 0,
    open: false,
    quorum: 0,
    totalMembers: 0,
    status: 'planned'
  };

  await db.createMeeting(meeting);

  for (const proposalId of selectedProposals) {
    await db.addToAgenda(id, proposalId);
    
    await addProposalEvent(proposalId, {
      type: 'agenda_inclusion',
      timestamp: Date.now(),
      chamber: chamber,
      description: `Включен в повестку заседания "${title}"`
    });
  }

  return id;
}

async function createMeetingFromSelection(interaction, chamber, selectedProposals) {
  await interaction.deferReply({ flags: 64 });
  
  try {
    const now = new Date();
    const dateString = now.toLocaleDateString('ru-RU');
    const title = `Заседание ${CHAMBER_NAMES[chamber]} от ${dateString}`;
    
    const meetingId = await createMeetingWithAgenda(interaction, chamber, title, selectedProposals);
    
    const mentionRoleId = MEETING_MENTION_ROLES[chamber];
    const agenda = await db.getAgenda(meetingId);
    
    let agendaText = '';
    if (agenda.length > 0) {
      agendaText = '**📋 Повестка дня:**\n';
      for (const proposal of agenda) {
        agendaText += `• [${proposal.number}](${proposal.link}) - ${proposal.name}\n`;
      }
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`📅 Заседание: ${title}`)
      .setDescription(`Заседание создано автоматически`)
      .addFields(
        { name: "🏛️ Палата", value: CHAMBER_NAMES[chamber], inline: true },
        { name: "📅 Дата создания", value: dateString, inline: true },
        { name: "📋 Статус", value: "Запланировано", inline: true },
        { name: "📜 Повестка", value: agendaText || "*Повестка не сформирована*", inline: false }
      )
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`start_registration_${meetingId}`).setLabel("Начать регистрацию").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancel_meeting_${meetingId}`).setLabel("Отменить").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`edit_meeting_${meetingId}`).setLabel("Редактировать").setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({ 
      content: mentionRoleId ? `<@&${mentionRoleId}>` : null, 
      embeds: [embed], 
      components: [buttons]
    });
    
    const message = await interaction.fetchReply();
    await db.updateMeetingMessage(meetingId, message.id);
    
  } catch (error) {
    console.error("❌ Error creating meeting from selection:", error);
    await interaction.editReply({ content: "❌ Ошибка при создании заседания." });
  }
}

// ================== COMMAND HANDLERS ==================
async function handleSlashCommand(interaction) {
  const cmd = interaction.commandName;
  
  if (cmd === "help") {
    await showHelp(interaction);
  } else if (cmd === "send") {
    await showChamberSelect(interaction);
  } else if (cmd === "create_meeting") {
    await createMeeting(interaction);
  } else if (cmd === "res_meeting") {
    await resetMeetingRoles(interaction);
  } else if (cmd === "delegate") {
    await delegateVote(interaction);
  } else if (cmd === "undelegate") {
    await undelegateVote(interaction);
  }
}

async function delegateVote(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const member = interaction.member;
  const targetUser = interaction.options.getUser("target");
  
  if (!member.roles.cache.has(ROLES.SENATOR) && !member.roles.cache.has(ROLES.SENATOR_NO_VOTE)) {
    await interaction.editReply({ 
      content: "❌ Только сенаторы могут делегировать свои голоса." 
    });
    return;
  }
  
  const targetMember = await interaction.guild.members.fetch(targetUser.id);
  if (!targetMember.roles.cache.has(ROLES.SENATOR) && !targetMember.roles.cache.has(ROLES.SENATOR_NO_VOTE)) {
    await interaction.editReply({ 
      content: "❌ Можно делегировать голос только другому сенатору." 
    });
    return;
  }
  
  if (member.id === targetUser.id) {
    await interaction.editReply({ 
      content: "❌ Нельзя делегировать голос самому себе." 
    });
    return;
  }
  
  try {
    await db.createDelegation(member.id, targetUser.id);
    await updateDelegationMessage();
    
    await interaction.editReply({ 
      content: `✅ Вы успешно делегировали свой голос <@${targetUser.id}>.` 
    });
  } catch (error) {
    console.error("❌ Error delegating vote:", error);
    await interaction.editReply({ 
      content: "❌ Ошибка при делегировании голоса." 
    });
  }
}

async function undelegateVote(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const member = interaction.member;
  const targetUser = interaction.options.getUser("target");
  
  const isAuthorized = isAdmin(member) || 
                      isChamberChairman(member, 'sf') || 
                      (targetUser && member.id === targetUser.id);
  
  if (!isAuthorized) {
    await interaction.editReply({ 
      content: "❌ У вас нет прав для отзыва делегирования." 
    });
    return;
  }
  
  try {
    const delegatorId = targetUser ? targetUser.id : member.id;
    const delegation = await db.getActiveDelegation(delegatorId);
    
    if (!delegation) {
      await interaction.editReply({ 
        content: "❌ Активное делегирование не найдено." 
      });
      return;
    }
    
    await db.removeDelegation(delegatorId);
    await updateDelegationMessage();
    
    await interaction.editReply({ 
      content: `✅ Делегирование голоса от <@${delegation.delegator_id}> к <@${delegation.delegate_id}> отозвано.` 
    });
  } catch (error) {
    console.error("❌ Error undeleggating vote:", error);
    await interaction.editReply({ 
      content: "❌ Ошибка при отзыве делегирования." 
    });
  }
}

async function showHelp(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const member = interaction.member;
  let description = '';
  
  if (member.roles.cache.has(ROLES.DEPUTY) || member.roles.cache.has(ROLES.DEPUTY_NO_VOTE)) {
    description += `**👥 Для депутатов:**\n`;
    description += `• Используйте команду \`/send\` для внесения законопроекта\n`;
    description += `• Выберите палату и тип голосования\n`;
    description += `• Заполните информацию о законопроекте\n`;
    description += `• Участвуйте в голосованиях в соответствующих ветках\n`;
    description += `• Следите за ходом рассмотрения в хронологии\n\n`;
  }
  
  if (member.roles.cache.has(ROLES.SENATOR) || member.roles.cache.has(ROLES.SENATOR_NO_VOTE)) {
    description += `**🏛️ Для членов Совета Федерации:**\n`;
    description += `• Используйте команду \`/send\` для внесения законопроекта\n`;
    description += `• Рассматривайте законопроекты, переданные из ГосДумы\n`;
    description += `• Участвуйте в окончательном голосовании\n`;
    description += `• Следите за подписанием Президентом\n`;
    description += `• Используйте \`/delegate\` для делегирования голоса\n`;
    description += `• Используйте \`/undelegate\` для отзыва делегирования\n\n`;
  }
  
  if (isChamberChairman(member, 'sf') || isChamberChairman(member, 'gd_rublevka') || 
      isChamberChairman(member, 'gd_arbat') || isChamberChairman(member, 'gd_patricki') || 
      isChamberChairman(member, 'gd_tverskoy') || isAdmin(member)) {
    description += `**🎯 Для председателей и администраторов:**\n`;
    description += `• Используйте \`/create_meeting\` для создания заседаний\n`;
    description += `• Выбирайте законопроекты для повестки дня\n`;
    description += `• Начинайте регистрацию с установкой кворума\n`;
    description += `• Запускайте голосования по законопроектам из повестки\n`;
    description += `• Используйте \`/res_meeting\` для снятия ролей голосования\n`;
    description += `• Используйте \`/undelegate\` для отзыва делегирования\n\n`;
  }
  
  description += `**📋 Общие сведения:**\n`;
  description += `• Каждая палата имеет свой канал для обсуждений\n`;
  description += `• Голосования могут быть открытыми или тайными\n`;
  description += `• Поддерживаются разные формулы подсчета голосов\n`;
  description += `• Ведется полная хронология рассмотрения\n`;
  description += `• Делегирование голосов доступно только для сенаторов\n`;
  
  const helpEmbed = new EmbedBuilder()
    .setTitle('📖 Справка по использованию бота')
    .setDescription(description)
    .setColor(COLORS.PRIMARY)
    .setFooter({ text: FOOTER })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [helpEmbed] });
}

async function showChamberSelect(interaction) {
  const availableChambers = getAvailableChambers(interaction.member);
  
  if (availableChambers.length === 0) {
    await interaction.reply({ 
      content: "❌ У вас нет доступа ни к одной палате для внесения законопроектов.", 
      flags: 64 
    });
    return;
  }
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`chamber_select_send`)
    .setPlaceholder('Выберите палату для внесения законопроекта')
    .addOptions(
      availableChambers.map(chamber => 
        new StringSelectMenuOptionBuilder()
          .setLabel(chamber.label)
          .setValue(chamber.value)
      )
    );
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  await interaction.reply({
    content: '📋 Выберите палату для внесения законопроекта:',
    components: [row],
    flags: 64
  });
}

async function createMeeting(interaction) {
  const member = interaction.member;
  const chamber = getChamberByChannel(interaction.channelId);
  
  if (!chamber) {
    await interaction.reply({ 
      content: "❌ Эта команда может быть использована только в канале для заседаний.", 
      flags: 64 
    });
    return;
  }
  
  if (!isChamberChairman(member, chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для создания заседания в этой палате.", flags: 64 });
    return;
  }
  
  const pendingProposals = await db.getPendingProposalsByChamber(chamber);
  
  if (pendingProposals.length === 0) {
    await interaction.reply({ 
      content: "❌ Нет законопроектов, ожидающих рассмотрения в этой палате.", 
      flags: 64 
    });
    return;
  }
  
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`meeting_agenda_select_${chamber}`)
    .setPlaceholder('Выберите законопроекты для повестки дня')
    .setMinValues(1)
    .setMaxValues(Math.min(pendingProposals.length, 10))
    .addOptions(
      pendingProposals.map(proposal => 
        new StringSelectMenuOptionBuilder()
          .setLabel(`${proposal.number} - ${proposal.name.substring(0, 45)}${proposal.name.length > 45 ? '...' : ''}`)
          .setValue(proposal.id)
          .setDescription(proposal.name.substring(0, 50))
      )
    );
  
  const row = new ActionRowBuilder().addComponents(selectMenu);
  
  await interaction.reply({
    content: '📋 Выберите законопроекты для включения в повестку дня заседания:',
    components: [row],
    flags: 64
  });
}

async function resetMeetingRoles(interaction) {
  const member = interaction.member;
  if (!isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для этой команды.", flags: 64 });
    return;
  }
  
  await interaction.reply({ content: "🔄 Запуск снятия роли у всех (начинаю)...", flags: 64 });
  
  try {
    await interaction.followUp({ content: `✅ Система ролей для голосования отключена. Используется проверка регистрации на заседаниях.`, flags: 64 });
  } catch (e) {
    console.error("❌ Error in res_meeting:", e);
    await interaction.followUp({ content: "❌ Ошибка при выполнении команды.", flags: 64 });
  }
}

// ================== SELECT MENU HANDLERS ==================
async function handleSelectMenu(interaction) {
  if (interaction.customId === 'chamber_select_send') {
    const chamber = interaction.values[0];
    
    const voteTypeSelect = new StringSelectMenuBuilder()
      .setCustomId(`vote_type_select_${chamber}`)
      .setPlaceholder('Выберите тип голосования')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Обычное голосование')
          .setDescription('За/Против/Воздержался')
          .setValue('regular'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Рейтинговое голосование')
          .setDescription('Голосование по пунктам')
          .setValue('quantitative')
      );
    
    const row = new ActionRowBuilder().addComponents(voteTypeSelect);
    
    await interaction.update({
      content: '🗳️ Выберите тип голосования для законопроекта:',
      components: [row]
    });
    return;
  }
  
  if (interaction.customId.startsWith('vote_type_select_')) {
    const chamber = interaction.customId.split('vote_type_select_')[1];
    const voteType = interaction.values[0];
    
    let modal;
    
    if (voteType === 'regular') {
      modal = new ModalBuilder()
        .setCustomId(`send_modal_${chamber}_regular`)
        .setTitle(`Регистрация законопроекта`);
      
      const nameInput = new TextInputBuilder()
        .setCustomId("proj_name")
        .setLabel("Наименование законопроекта")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const partyInput = new TextInputBuilder()
        .setCustomId("proj_party")
        .setLabel("Партия/организация")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const linkInput = new TextInputBuilder()
        .setCustomId("proj_link")
        .setLabel("Ссылка на документ")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(partyInput),
        new ActionRowBuilder().addComponents(linkInput)
      );
    } else if (voteType === 'quantitative') {
      modal = new ModalBuilder()
        .setCustomId(`send_modal_${chamber}_quantitative`)
        .setTitle(`Регистрация (рейтинговое голосование)`);
      
      const nameInput = new TextInputBuilder()
        .setCustomId("proj_name")
        .setLabel("Наименование законопроекта")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const partyInput = new TextInputBuilder()
        .setCustomId("proj_party")
        .setLabel("Партия/организация")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const linkInput = new TextInputBuilder()
        .setCustomId("proj_link")
        .setLabel("Ссылка на документ")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const itemsInput = new TextInputBuilder()
        .setCustomId("items")
        .setLabel("Пункты (через ;)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder("Пункт 1; Пункт 2; Пункт 3");
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(partyInput),
        new ActionRowBuilder().addComponents(linkInput),
        new ActionRowBuilder().addComponents(itemsInput)
      );
    }
    
    await interaction.showModal(modal);
    return;
  }
  
  if (interaction.customId.startsWith('meeting_agenda_select_')) {
    const chamber = interaction.customId.split('meeting_agenda_select_')[1];
    const selectedProposals = interaction.values;
    await createMeetingFromSelection(interaction, chamber, selectedProposals);
    return;
  }
}

// ================== MODAL HANDLERS ==================
async function handleModalSubmit(interaction) {
  if (interaction.customId.startsWith("send_modal_")) {
    await handleProposalModal(interaction);
  } else if (interaction.customId.startsWith("start_vote_modal_")) {
    await handleStartVoteModal(interaction);
  } else if (interaction.customId.startsWith("delete_proposal_modal_")) {
    await handleDeleteProposalModal(interaction);
  } else if (interaction.customId.startsWith("start_registration_modal_")) {
    await handleStartRegistrationModal(interaction);
  } else if (interaction.customId.startsWith("cancel_meeting_modal_")) {
    await handleCancelMeetingModal(interaction);
  } else if (interaction.customId.startsWith("edit_meeting_modal_")) {
    await handleEditMeetingModal(interaction);
  }
}

async function handleProposalModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  try {
    const customId = interaction.customId;
    const prefix = "send_modal_";
    const rest = customId.slice(prefix.length);
    const parts = rest.split('_');
    
    if (parts.length < 2) {
      await interaction.editReply({ content: "❌ Ошибка: неверный формат запроса." });
      return;
    }
    
    const voteType = parts[parts.length - 1];
    const chamber = parts.slice(0, -1).join('_');
    
    if (!CHAMBER_CHANNELS[chamber]) {
      await interaction.editReply({ content: `❌ Ошибка конфигурации: указанная палата "${chamber}" не найдена.` });
      return;
    }

    const forumChannelId = CHAMBER_CHANNELS[chamber];
    let forumChannel;
    try {
      forumChannel = await client.channels.fetch(forumChannelId);
      if (!forumChannel) throw new Error("Channel not found");
    } catch (channelError) {
      console.error("❌ Forum channel access error:", channelError);
      await interaction.editReply({ content: `❌ Ошибка доступа к каналу палаты.` });
      return;
    }

    const name = interaction.fields.getTextInputValue("proj_name");
    const party = interaction.fields.getTextInputValue("proj_party");
    const link = interaction.fields.getTextInputValue("proj_link");

    if (!name || !party || !link) {
      await interaction.editReply({ content: "❌ Все поля обязательны для заполнения." });
      return;
    }

    const number = await db.getNextProposalNumber(chamber);
    const id = nanoid(8);
    
    const initialEvents = [{
      type: 'registration',
      chamber: chamber,
      timestamp: Date.now(),
      description: `Внесение в ${CHAMBER_NAMES[chamber]} (Автор: <@${interaction.user.id}>)`
    }];
    
    const proposal = {
      id,
      number,
      name,
      party,
      link,
      chamber,
      status: "На рассмотрении",
      createdAt: Date.now(),
      authorId: interaction.user.id,
      threadId: null,
      channelId: forumChannelId,
      isQuantitative: voteType === 'quantitative',
      events: initialEvents
    };

    await db.createProposal(proposal);

    if (voteType === 'quantitative') {
      const itemsText = interaction.fields.getTextInputValue("items");
      const items = itemsText 
        ? itemsText.split(';')
            .map(item => item.trim())
            .filter(item => item !== '')
            .slice(0, 5)
        : [];

      for (const [index, itemText] of items.entries()) {
        await db.addQuantitativeItem({
          proposalId: id,
          itemIndex: index + 1,
          text: itemText
        });
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 ЗАКОНОПРОЕКТ ${number}${voteType === 'quantitative' ? ' (Рейтинговое голосование)' : ''}`)
      .setDescription(`Зарегистрирован новый законопроект${voteType === 'quantitative' ? ' с рейтинговым голосованием' : ''}`)
      .addFields(
        { name: "🏛️ Палата", value: CHAMBER_NAMES[chamber], inline: false },
        { name: "📝 Наименование", value: name, inline: false },
        { name: "🏛️ Партия / Организация", value: party, inline: false },
        { name: "🔗 Ссылка на документ", value: `[Кликабельно](${link})`, inline: false },
        { name: "👤 Автор инициативы", value: `<@${interaction.user.id}>`, inline: false },
        { name: "📅 Дата регистрации", value: formatMoscowTime(Date.now()), inline: false }
      )
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    // УБРАНА КНОПКА ВЫСТУПЛЕНИЯ
    const threadMessage = await forumChannel.threads.create({
      name: `${number} — ${name.substring(0, 50)}${name.length > 50 ? '...' : ''}`,
      appliedTags: [FORUM_TAGS.ON_REVIEW],
      message: {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`start_vote_${id}`).setLabel("▶️ Начать голосование").setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId(`delete_proposal_${id}`).setLabel("🗑️ Удалить/Отозвать").setStyle(ButtonStyle.Danger)
          ),
        ],
      },
    });

    const firstMessage = await threadMessage.fetchStarterMessage();
    await db.updateProposalInitialMessage(id, firstMessage.id);
    await db.updateProposalThread(id, threadMessage.id);
    
    await updateHistoryMessage(id);
    
    if (voteType === 'quantitative') {
      const items = await db.getQuantitativeItems(id);
      if (items.length > 0) {
        const itemsEmbed = new EmbedBuilder()
          .setTitle(`📊 Пункты для рейтингового голосования`)
          .setDescription(`Данный законопроект подразумевает рейтинговое голосование по следующим пунктам:`)
          .setColor(COLORS.INFO)
          .setFooter({ text: FOOTER })
          .setTimestamp();
        
        items.forEach((item, index) => {
          itemsEmbed.addFields({
            name: `Пункт ${index + 1}`,
            value: item.text,
            inline: false
          });
        });
        
        await threadMessage.send({ embeds: [itemsEmbed] });
      }
    }
    
    await interaction.editReply({ content: `✅ Законопроект успешно зарегистрирован: ${threadMessage.url}` });
  } catch (error) {
    console.error("❌ Critical error in handleProposalModal:", error);
    await interaction.editReply({ content: "❌ Критическая ошибка при создании законопроекта." });
  }
}

async function updateVoteButtonStatus(proposalId) {
  try {
    const proposal = await db.getProposal(proposalId);
    if (!proposal || !proposal.threadid || !proposal.initialmessageid) return;
    
    const thread = await client.channels.fetch(proposal.threadid);
    if (thread.archived) return;
    
    const initialMessage = await thread.messages.fetch(proposal.initialmessageid);
    
    const lastMeeting = await db.getLastMeetingByChamber(proposal.chamber);
    let isInAgenda = false;
    
    if (lastMeeting && lastMeeting.open) {
      isInAgenda = await db.isProposalInAgenda(lastMeeting.id, proposalId);
    }
    
    // УБРАНА КНОПКА ВЫСТУПЛЕНИЯ
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`start_vote_${proposal.id}`)
        .setLabel("▶️ Начать голосование")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!isInAgenda),
      new ButtonBuilder()
        .setCustomId(`delete_proposal_${proposal.id}`)
        .setLabel("🗑️ Удалить/Отозвать")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(false)
    );
    
    await initialMessage.edit({ components: [row] });
  } catch (error) {
    if (error.code !== 50083 && error.code !== 10008) {
      console.error(`❌ Error updating vote button for proposal ${proposalId}:`, error);
    }
  }
}

// ================== BUTTON HANDLERS ==================
async function handleButton(interaction) {
  const cid = interaction.customId;

  try {
    if (cid.startsWith("vote_")) {
      if (cid.startsWith("vote_for_") || cid.startsWith("vote_against_") || cid.startsWith("vote_abstain_")) {
        await handleRegularVoteButtons(interaction);
        return;
      }
      if (cid.startsWith("vote_item_")) {
        await handleQuantitativeVoteButtons(interaction);
        return;
      }
      if (cid.startsWith("vote_abstain_") && !cid.includes("_against_") && !cid.includes("_for_")) {
        await handleQuantitativeAbstainButton(interaction);
        return;
      }
    }

    if (cid.startsWith("get_card_")) {
      await handleGetCardButton(interaction);
      return;
    }

    if (cid.startsWith("clear_roles_")) {
      await handleClearRolesButton(interaction);
      return;
    }

    if (cid.startsWith("start_registration_")) {
      await handleStartRegistrationButton(interaction);
      return;
    }

    if (cid.startsWith("cancel_meeting_")) {
      await handleCancelMeetingButton(interaction);
      return;
    }

    if (cid.startsWith("edit_meeting_")) {
      await handleEditMeetingButton(interaction);
      return;
    }

    if (cid.startsWith("start_vote_")) {
      await handleStartVoteButton(interaction);
      return;
    }

    if (cid.startsWith("end_vote_")) {
      await handleEndVoteButton(interaction);
      return;
    }

    if (cid.startsWith("delete_proposal_")) {
      await handleDeleteProposalButton(interaction);
      return;
    }

    if (cid.startsWith("gov_approve_") || cid.startsWith("gov_return_")) {
      await handleGovernmentButtons(interaction);
      return;
    }

    if (cid.startsWith("president_sign_") || cid.startsWith("president_veto_")) {
      await handlePresidentButtons(interaction);
      return;
    }

    console.warn(`⚠️ Unknown button interaction: ${cid}`);
    await safeReply(interaction, "❌ Неизвестная команда или действие устарело.");

  } catch (error) {
    console.error("❌ Error in handleButton:", error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: "❌ Произошла ошибка при обработке действия." });
      } else {
        await interaction.reply({ content: "❌ Произошла ошибка при обработке действия.", flags: 64 });
      }
    } catch (replyError) {
      console.error("❌ Could not send error message:", replyError);
    }
  }
}

async function handleGetCardButton(interaction) {
  const meetingId = interaction.customId.split("get_card_")[1];
  const meeting = await db.getMeeting(meetingId);
  
  if (!meeting || !meeting.open) {
    await interaction.reply({ content: "❌ Регистрация закрыта.", flags: 64 });
    return;
  }
  
  try {
    const member = interaction.member;
    const chamber = meeting.chamber;
    
    const chamberRoles = {
      'sf': [ROLES.SENATOR, ROLES.SENATOR_NO_VOTE],
      'gd_rublevka': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.RUBLEVKA],
      'gd_arbat': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.ARBAT],
      'gd_patricki': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.PATRICKI],
      'gd_tverskoy': [ROLES.DEPUTY, ROLES.DEPUTY_NO_VOTE, ROLES.TVERSKOY]
    };
    
    const userChamberRoles = chamberRoles[chamber] || [];
    const hasChamberRole = userChamberRoles.some(roleId => member.roles.cache.has(roleId));
    
    if (!hasChamberRole) {
      await interaction.reply({ content: `❌ Вы не принадлежите к палате "${CHAMBER_NAMES[chamber]}".`, flags: 64 });
      return;
    }
    
    if (!await db.isUserRegistered(meetingId, interaction.user.id)) {
      await db.registerForMeeting(meetingId, interaction.user.id);
      
      const agenda = await db.getAgenda(meetingId);
      for (const proposal of agenda) {
        await updateVoteButtonStatus(proposal.id);
      }
    }
    
    await interaction.reply({ content: "✅ Вы успешно зарегистрированы на заседание!", flags: 64 });
  } catch (error) {
    console.error("❌ Error in get card button:", error);
    await interaction.reply({ content: "❌ Ошибка при регистрации.", flags: 64 });
  }
}

async function handleClearRolesButton(interaction) {
  const meetingId = interaction.customId.split("clear_roles_")[1];
  const meeting = await db.getMeeting(meetingId);
  
  if (!meeting) {
    await interaction.reply({ content: "❌ Заседание не найдено.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для завершения заседания.", flags: 64 });
    return;
  }
  
  await interaction.deferReply({ flags: 64 });
  
  try {
    const protocolText = await createMeetingProtocol(meetingId);
    await db.closeMeeting(meetingId);
    await db.updateMeeting(meetingId, { status: 'completed' });
    
    await interaction.message.edit({ components: [] });
    
    if (meeting.threadid) {
      try {
        const thread = await client.channels.fetch(meeting.threadid);
        
        const protocolEmbed = new EmbedBuilder()
          .setTitle(`📄 Протокол заседания`)
          .setDescription(protocolText.substring(0, 4096))
          .setColor(COLORS.INFO)
          .setFooter({ text: FOOTER })
          .setTimestamp();
        
        await thread.send({ embeds: [protocolEmbed] });
        
        setTimeout(async () => {
          try {
            await thread.setArchived(true, 'Заседание завершено');
          } catch (e) {
            console.error("❌ Error archiving thread:", e);
          }
        }, 30000);
        
        await interaction.editReply({ content: `✅ Заседание завершено. Протокол отправлен в ветку.` });
        
      } catch (threadError) {
        console.error("❌ Error sending protocol to thread:", threadError);
        await interaction.editReply({ content: `✅ Заседание завершено. (Ошибка отправки протокола в ветку)` });
      }
    } else {
      const ch = await client.channels.fetch(meeting.channelid);
      
      const protocolEmbed = new EmbedBuilder()
        .setTitle(`📄 Протокол заседания`)
        .setDescription(protocolText.substring(0, 4096))
        .setColor(COLORS.INFO)
        .setFooter({ text: FOOTER })
        .setTimestamp();
      
      await ch.send({ embeds: [protocolEmbed] });
      await interaction.editReply({ content: `✅ Заседание завершено. Протокол отправлен.` });
    }
    
  } catch (e) {
    console.error("❌ Error clearing meeting:", e);
    await interaction.editReply({ content: "❌ Ошибка при завершении заседания." });
  }
}

async function createMeetingProtocol(meetingId) {
  try {
    const meeting = await db.getMeeting(meetingId);
    const agenda = await db.getAgenda(meetingId);
    const registrations = await db.getMeetingRegistrations(meetingId);

    let protocolText = `# 🏛️ Протокол заседания\n\n`;
    protocolText += `**Заседание:** ${meeting.title}\n`;
    protocolText += `**Палата:** ${CHAMBER_NAMES[meeting.chamber]}\n`;
    protocolText += `**Дата:** ${meeting.meetingDate}\n`;
    protocolText += `**Время проведения:** ${formatMoscowTime(meeting.createdat)} - ${formatMoscowTime(Date.now())}\n\n`;

    protocolText += `## 👥 Присутствовали:\n`;
    for (const reg of registrations) {
      try {
        const user = await client.users.fetch(reg.userid);
        const delegation = await getDelegatedVote(reg.userid);
        
        if (delegation) {
          const delegator = await client.users.fetch(delegation.delegator_id);
          protocolText += `• ${user.username} (делегат от ${delegator.username})\n`;
        } else {
          protocolText += `• ${user.username}\n`;
        }
      } catch (error) {
        protocolText += `• <@${reg.userid}>\n`;
      }
    }

    protocolText += `\n## 📊 Результаты по повестке:\n`;

    for (const proposal of agenda) {
      const voting = await db.getVoting(proposal.id);
      
      if (voting && voting.endedat) {
        const votes = await db.getVotes(proposal.id);
        const forCount = votes.filter(v => v.votetype === 'for').length;
        const againstCount = votes.filter(v => v.votetype === 'against').length;
        const abstainCount = votes.filter(v => v.votetype === 'abstain').length;
        
        const delegations = await db.getAllActiveDelegations();
        for (const delegation of delegations) {
          const delegateVoted = votes.some(v => v.userid === delegation.delegate_id);
          if (delegateVoted && await db.isUserRegistered(meetingId, delegation.delegate_id)) {
            const delegateVote = votes.find(v => v.userid === delegation.delegate_id);
            if (delegateVote) {
              if (delegateVote.votetype === 'for') forCount++;
              else if (delegateVote.votetype === 'against') againstCount++;
              else if (delegateVote.votetype === 'abstain') abstainCount++;
            }
          }
        }
        
        const result = forCount > againstCount ? '✅ ПРИНЯТО' : '❌ ОТКЛОНЕНО';
        protocolText += `\n**${proposal.number} - ${proposal.name}** - ${result}\n`;
        protocolText += `   Голосов: ЗА ${forCount}, ПРОТИВ ${againstCount}, ВОЗДЕРЖАЛОСЬ ${abstainCount}\n`;
      } else {
        protocolText += `\n**${proposal.number} - ${proposal.name}** - НЕ РАССМАТРИВАЛСЯ\n`;
      }
    }

    return protocolText;
  } catch (error) {
    console.error("❌ Error creating meeting protocol:", error);
    return "Ошибка при создании протокола заседания";
  }
}

async function handleStartVoteButton(interaction) {
  const pid = interaction.customId.split("start_vote_")[1];
  const proposal = await db.getProposal(pid);
  
  if (!proposal) {
    await interaction.reply({ content: "❌ Законопроект не найден.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  
  if (!isChamberChairman(member, proposal.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав запускать голосование в этой палате.", flags: 64 });
    return;
  }
  
  const lastMeeting = await db.getLastMeetingByChamber(proposal.chamber);
  if (!lastMeeting || !lastMeeting.open) {
    await interaction.reply({ content: "❌ Нет активного заседания для этой палаты.", flags: 64 });
    return;
  }
  
  const inAgenda = await db.isProposalInAgenda(lastMeeting.id, pid);
  if (!inAgenda) {
    await interaction.reply({ content: "❌ Этот законопроект не в повестке текущего заседания.", flags: 64 });
    return;
  }
  
  const modal = new ModalBuilder()
    .setCustomId(`start_vote_modal_${pid}`)
    .setTitle("Настройки голосования");
    
  const durInput = new TextInputBuilder()
    .setCustomId("vote_duration")
    .setLabel("Время голосования (1d, 1h, 1m, 30s)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Пример: 1h30m или 5m");
    
  const voteTypeInput = new TextInputBuilder()
    .setCustomId("vote_type")
    .setLabel("Тип голосования (0-тайное, 1-открытое)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("0 - тайное, 1 - открытое")
    .setMaxLength(1);
    
  const formulaInput = new TextInputBuilder()
    .setCustomId("vote_formula")
    .setLabel("Формула (0-больш, 1-2/3, 2-3/4, 3-от общего)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("0-больш, 1-2/3, 2-3/4, 3-от общего")
    .setMaxLength(1);
    
  modal.addComponents(
    new ActionRowBuilder().addComponents(durInput),
    new ActionRowBuilder().addComponents(voteTypeInput),
    new ActionRowBuilder().addComponents(formulaInput)
  );
  
  await interaction.showModal(modal);
}

async function handleRegularVoteButtons(interaction) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ flags: 64 });
  }
  
  const parts = interaction.customId.split("_");
  const voteType = parts[1];
  const proposalId = parts.slice(2).join("_");
  
  try {
    const proposal = await db.getProposal(proposalId);
    if (!proposal) {
      await interaction.editReply({ content: "❌ Законопроект не найден." });
      return;
    }
    
    const voting = await db.getVoting(proposalId);
    if (!voting?.open) {
      await interaction.editReply({ content: "❌ Голосование не активно или завершено." });
      return;
    }
    
    const lastMeeting = await db.getLastMeetingByChamber(proposal.chamber);
    const canVote = await canUserVote(proposal, interaction.user.id, voting, lastMeeting?.id);
    if (!canVote.canVote) {
      await interaction.editReply({ content: canVote.reason });
      return;
    }
    
    const hasVoted = await db.hasUserVoted(proposalId, interaction.user.id, voting.stage || 1);
    if (hasVoted) {
      await interaction.editReply({ content: "❌ Вы уже проголосовали по этому законопроекту." });
      return;
    }
    
    const vote = {
      proposalId: proposalId,
      userId: interaction.user.id,
      voteType: voteType,
      createdAt: Date.now(),
      stage: voting.stage || 1
    };
    
    const added = await db.addVote(vote);
    if (!added) {
      await interaction.editReply({ content: "❌ Вы уже проголосовали по этому законопроекту." });
      return;
    }
    
    if (!proposal.events.some(e => e.type === 'meeting_consideration' && e.meetingId === lastMeeting.id)) {
      await addProposalEvent(proposalId, {
        type: 'meeting_consideration',
        timestamp: Date.now(),
        chamber: proposal.chamber,
        meetingId: lastMeeting.id,
        description: `Начато рассмотрение на заседании "${lastMeeting.title}"`
      });
    }
    
    await interaction.editReply({ content: `✅ Ваш голос "${getVoteTypeText(voteType)}" учтен!` });
    
  } catch (error) {
    console.error("❌ Error in regular vote button:", error);
    try {
      await interaction.editReply({ content: "❌ Ошибка при обработке голоса." });
    } catch (e) {
      // Ignore if already replied
    }
  }
}

function getVoteTypeText(voteType) {
  switch(voteType) {
    case 'for': return 'ЗА';
    case 'against': return 'ПРОТИВ';
    case 'abstain': return 'ВОЗДЕРЖАЛСЯ';
    default: return voteType;
  }
}

async function handleStartVoteModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const pid = interaction.customId.split("start_vote_modal_")[1];
  const durInput = interaction.fields.getTextInputValue("vote_duration").trim();
  const voteTypeInput = interaction.fields.getTextInputValue("vote_type").trim();
  const formulaInput = interaction.fields.getTextInputValue("vote_formula").trim();
  
  const ms = parseCustomDuration(durInput);
  const isSecret = voteTypeInput === "0";
  const formula = ["0", "1", "2", "3"].includes(formulaInput) ? formulaInput : "0";

  const proposal = await db.getProposal(pid);
  if (!proposal) {
    await interaction.editReply({ content: "❌ Проект не найден." });
    return;
  }

  const existingVoting = await db.getVoting(pid);
  if (existingVoting?.open) {
    await interaction.editReply({ content: "❌ Голосование уже идёт." });
    return;
  }

  const voting = {
    proposalId: pid,
    open: true,
    startedAt: Date.now(),
    durationMs: ms,
    expiresAt: ms > 0 ? Date.now() + ms : null,
    messageId: null,
    isSecret: isSecret,
    formula,
    stage: 1
  };

  await db.startVoting(voting);

  try {
    const thread = await client.channels.fetch(proposal.threadid);
    const timeText = ms > 0 ? 
      `🕐 **Начало:** ${formatMoscowTime(Number(voting.startedat))}\n⏰ **Завершение:** ${formatMoscowTime(voting.expiresAt)}` :
      `🕐 **Начало:** ${formatMoscowTime(Number(voting.startedat))}\n⏰ **Завершение:** До ручного завершения`;

    let voteRows = [];
    let controlRow;
    
    if (proposal.isquantitative) {
      const items = await db.getQuantitativeItems(pid);
      let currentRow = new ActionRowBuilder();
      
      items.forEach(item => {
        if (currentRow.components.length >= 3) {
          voteRows.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`vote_item_${item.itemindex}_${pid}`)
            .setLabel(`Пункт ${item.itemindex}`)
            .setStyle(ButtonStyle.Primary)
        );
      });
      
      if (currentRow.components.length >= 3) {
        voteRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_abstain_${pid}`)
          .setLabel("⚪ Воздержаться")
          .setStyle(ButtonStyle.Secondary)
      );
      
      if (currentRow.components.length > 0) {
        voteRows.push(currentRow);
      }
      
      controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`end_vote_${pid}`).setLabel("⏹️ Завершить голосование").setStyle(ButtonStyle.Danger)
      );
      
    } else {
      voteRows = [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`vote_for_${pid}`).setLabel("✅ За").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`vote_against_${pid}`).setLabel("❌ Против").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`vote_abstain_${pid}`).setLabel("⚪ Воздержался").setStyle(ButtonStyle.Secondary)
        )
      ];
      
      controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`end_vote_${pid}`).setLabel("⏹️ Завершить голосование").setStyle(ButtonStyle.Danger)
      );
    }

    const embed = new EmbedBuilder()
      .setTitle(`🗳️ Голосование по инициативе ${proposal.number}${proposal.isquantitative ? ' (Рейтинговое)' : ''}`)
      .setDescription(`Голосование началось!\n\n${timeText}`)
      .addFields(
        { name: "🔒 Тип голосования", value: isSecret ? "Тайное" : "Открытое", inline: true },
        { name: "📋 Формула", value: getFormulaDescription(formula), inline: true }
      )
      .setColor(COLORS.INFO)
      .setFooter({ text: FOOTER })
      .setTimestamp();
      
    const allComponents = [...voteRows, controlRow];
    const voteMsg = await thread.send({ embeds: [embed], components: allComponents });

    voting.messageId = voteMsg.id;
    await db.startVoting(voting);

    if (ms > 0) {
      await startVoteTicker(pid);
    }

    const durationText = ms > 0 ? durInput : "до ручного завершения";
    await interaction.editReply({ 
      content: `✅ Голосование запущено на ${durationText}. Тип: ${isSecret ? "тайное" : "открытое"}, формула: ${getFormulaDescription(formula)}.` 
    });
  } catch (e) {
    console.error("❌ Error starting vote:", e);
    await interaction.editReply({ content: "❌ Ошибка при запуске голосования." });
  }
}

async function handleQuantitativeVoteButtons(interaction) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ flags: 64 });
  }
  
  const parts = interaction.customId.split("_");
  const itemIndex = parts[2];
  const proposalId = parts.slice(3).join("_");
  
  try {
    const proposal = await db.getProposal(proposalId);
    if (!proposal) {
      await interaction.editReply({ content: "❌ Законопроект не найден." });
      return;
    }
    
    const voting = await db.getVoting(proposalId);
    if (!voting?.open) {
      await interaction.editReply({ content: "❌ Голосование не активно или завершено." });
      return;
    }
    
    const lastMeeting = await db.getLastMeetingByChamber(proposal.chamber);
    const canVote = await canUserVote(proposal, interaction.user.id, voting, lastMeeting?.id);
    if (!canVote.canVote) {
      await interaction.editReply({ content: canVote.reason });
      return;
    }
    
    if (!proposal.isquantitative) {
      await interaction.editReply({ content: "❌ Это не количественное голосование." });
      return;
    }
    
    const hasVoted = await db.hasUserVoted(proposalId, interaction.user.id, voting.stage || 1);
    if (hasVoted) {
      await interaction.editReply({ content: "❌ Вы уже проголосовали по этому законопроекту." });
      return;
    }
    
    const vote = {
      proposalId: proposalId,
      userId: interaction.user.id,
      voteType: `item_${itemIndex}`,
      createdAt: Date.now(),
      stage: voting.stage || 1
    };
    
    const added = await db.addVote(vote);
    if (!added) {
      await interaction.editReply({ content: "❌ Вы уже проголосовали по этому законопроекту." });
      return;
    }
    
    if (!proposal.events.some(e => e.type === 'meeting_consideration' && e.meetingId === lastMeeting.id)) {
      await addProposalEvent(proposalId, {
        type: 'meeting_consideration',
        timestamp: Date.now(),
        chamber: proposal.chamber,
        meetingId: lastMeeting.id,
        description: `Начато рассмотрение на заседании "${lastMeeting.title}"`
      });
    }
    
    await interaction.editReply({ content: `✅ Ваш голос за пункт ${itemIndex} учтен!` });
    
  } catch (error) {
    console.error("❌ Error in quantitative vote button:", error);
    try {
      await interaction.editReply({ content: "❌ Ошибка при обработке голоса." });
    } catch (e) {
      // Ignore if already replied
    }
  }
}

async function handleQuantitativeAbstainButton(interaction) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ flags: 64 });
  }
  
  const proposalId = interaction.customId.split("vote_abstain_")[1];
  
  try {
    const proposal = await db.getProposal(proposalId);
    if (!proposal) {
      await interaction.editReply({ content: "❌ Законопроект не найден." });
      return;
    }
    
    const voting = await db.getVoting(proposalId);
    if (!voting?.open) {
      await interaction.editReply({ content: "❌ Голосование не активно или завершено." });
      return;
    }
    
    const lastMeeting = await db.getLastMeetingByChamber(proposal.chamber);
    const canVote = await canUserVote(proposal, interaction.user.id, voting, lastMeeting?.id);
    if (!canVote.canVote) {
      await interaction.editReply({ content: canVote.reason });
      return;
    }
    
    if (!proposal.isquantitative) {
      await interaction.editReply({ content: "❌ Ошибка голосования (неверный тип)." });
      return;
    }
    
    const hasVoted = await db.hasUserVoted(proposalId, interaction.user.id, voting.stage || 1);
    if (hasVoted) {
      await interaction.editReply({ content: "❌ Вы уже проголосовали по этому законопроекту." });
      return;
    }
    
    const vote = {
      proposalId: proposalId,
      userId: interaction.user.id,
      voteType: 'abstain',
      createdAt: Date.now(),
      stage: voting.stage || 1
    };
    
    const added = await db.addVote(vote);
    if (!added) {
      await interaction.editReply({ content: "❌ Вы уже проголосовали по этому законопроекту." });
      return;
    }
    
    if (!proposal.events.some(e => e.type === 'meeting_consideration' && e.meetingId === lastMeeting.id)) {
      await addProposalEvent(proposalId, {
        type: 'meeting_consideration',
        timestamp: Date.now(),
        chamber: proposal.chamber,
        meetingId: lastMeeting.id,
        description: `Начато рассмотрение на заседании "${lastMeeting.title}"`
      });
    }
    
    await interaction.editReply({ content: `✅ Ваш голос (воздержались) учтен!` });
    
  } catch (error) {
    console.error("❌ Error in quantitative abstain button:", error);
    try {
      await interaction.editReply({ content: "❌ Ошибка при обработке голоса." });
    } catch (e) {
      // Ignore if already replied
    }
  }
}

async function startVoteTicker(proposalId) {
  if (voteTimers.has(proposalId)) {
    clearInterval(voteTimers.get(proposalId));
    voteTimers.delete(proposalId);
  }

  const updateFn = async () => {
    const proposal = await db.getProposal(proposalId);
    const voting = await db.getVoting(proposalId);
    
    if (!proposal || !voting?.open) {
      if (voteTimers.has(proposalId)) {
        clearInterval(voteTimers.get(proposalId));
        voteTimers.delete(proposalId);
      }
      return;
    }

    if (voting.durationms === 0) return;

    const left = voting.expiresat - Date.now();
    try {
      const thread = await client.channels.fetch(proposal.threadid);
      
      const messageId = voting.stage === 2 && voting.runoffmessageid ? voting.runoffmessageid : voting.messageid;
      const voteMsg = await thread.messages.fetch(messageId);
      
      if (left <= 0) {
        await finalizeVote(proposalId);
        if (voteTimers.has(proposalId)) {
          clearInterval(voteTimers.get(proposalId));
          voteTimers.delete(proposalId);
        }
        return;
      } else {
        const leftStr = formatTimeLeft(left);
        const embed = new EmbedBuilder()
          .setTitle(`🗳️ Голосование — ${proposal.number}${voting.stage === 2 ? ' (Второй тур)' : ''}`)
          .setDescription(`Голосование активно`)
          .addFields(
            { name: "⏳ До завершения", value: leftStr, inline: true },
            { name: "🕐 Начало", value: formatMoscowTime(Number(voting.startedat)), inline: true },
            { name: "🔒 Тип голосования", value: voting.issecret ? "Тайное" : "Открытое", inline: true },
            { name: "📊 Формула", value: getFormulaDescription(voting.formula), inline: true }
          )
          .setColor(COLORS.INFO)
          .setFooter({ text: FOOTER })
          .setTimestamp();
        await voteMsg.edit({ content: null, embeds: [embed] });
      }
    } catch (e) {
      console.error("❌ Vote ticker update failed:", e);
    }
  };

  await updateFn();
  const id = setInterval(updateFn, 10_000);
  voteTimers.set(proposalId, id);
}

async function finalizeVote(proposalId) {
  const proposal = await db.getProposal(proposalId);
  if (!proposal) return;

  const voting = await db.getVoting(proposalId);
  const isQuantitative = proposal.isquantitative;
  const stage = voting?.stage || 1;

  if (isQuantitative && stage === 1) {
    await finalizeQuantitativeVote(proposalId);
  } else if (isQuantitative && stage === 2) {
    await finalizeQuantitativeRunoff(proposalId);
  } else {
    await finalizeRegularVote(proposalId);
  }
}

async function finalizeRegularVote(proposalId) {
  const proposal = await db.getProposal(proposalId);
  if (!proposal) return;

  const lastMeeting = await db.getLastMeetingByChamber(proposal.chamber);
  if (!lastMeeting) return;

  const { forCount, againstCount, abstainCount, totalVoted } = await getVoteCountsWithDelegations(proposalId, lastMeeting.id);
  
  const voteQuorum = lastMeeting.quorum || 1;
  const totalMembers = lastMeeting.totalmembers || 53;
  const registeredCount = await db.getRegistrationCount(lastMeeting.id);
  
  const totalPossible = totalMembers;
  const notVoted = Math.max(0, totalPossible - totalVoted);
  const notVotedRegistered = Math.max(0, registeredCount - totalVoted);

  const voting = await db.getVoting(proposalId);
  const formula = voting?.formula || '0';
  const isSecret = voting?.issecret || false;
  
  const { requiredFor, requiredTotal, isPassed } = calculateVoteResult(forCount, againstCount, abstainCount, formula, totalMembers);
  
  let resultText = "Не принято";
  let resultColor = COLORS.SECONDARY;
  let resultEmoji = "❌";
  let tagId = FORUM_TAGS.NOT_APPROVED;
  
  const isQuorumMet = totalVoted >= voteQuorum;
  
  if (!isQuorumMet) {
    resultText = "Не принято";
  } else if (againstCount > forCount) {
    resultText = "Отклонено";
    resultColor = COLORS.DANGER;
    resultEmoji = "❌";
    tagId = FORUM_TAGS.REJECTED;
  } else if (abstainCount > (forCount + againstCount)) {
    resultText = "Не принято";
  } else if (isPassed) {
    resultText = "Принято";
    resultColor = COLORS.SUCCESS;
    resultEmoji = "✅";
    tagId = FORUM_TAGS.APPROVED;
  } else {
    resultText = "Не принято";
  }

  const allVotes = isSecret ? [] : await db.getVotes(proposalId);
  let listParts = [];
  
  if (!isSecret) {
    const delegations = await db.getAllActiveDelegations();
    const delegationMap = new Map();
    
    for (const delegation of delegations) {
      delegationMap.set(delegation.delegate_id, delegation.delegator_id);
    }
    
    for (const vote of allVotes) {
      const emoji = vote.votetype === 'for' ? '✅' : vote.votetype === 'against' ? '❌' : '⚪';
      const delegation = delegationMap.get(vote.userid);
      
      if (delegation) {
        listParts.push(`${emoji} <@${vote.userid}> (делегат от <@${delegation}>)`);
      } else {
        listParts.push(`${emoji} <@${vote.userid}>`);
      }
    }
  }
  
  const listText = listParts.length ? listParts.join("\n") : (isSecret ? "Голосование было тайным" : "Нет голосов");

  const embed = new EmbedBuilder()
    .setTitle(`📊 Результаты голосования — ${proposal.number}`)
    .setDescription(`## ${resultEmoji} ${resultText}`)
    .addFields(
      { name: "✅ За", value: String(forCount), inline: true },
      { name: "❌ Против", value: String(againstCount), inline: true },
      { name: "⚪ Воздержалось", value: String(abstainCount), inline: true },
      { name: "📊 Всего проголосовало", value: String(totalVoted), inline: true },
      { name: "📋 Требуемый кворум", value: `${voteQuorum} голосов`, inline: true },
      { name: "📈 Статус кворума", value: isQuorumMet ? "✅ Собран" : "❌ Не собран", inline: true },
      { name: "👥 Общее количество", value: String(totalMembers), inline: true },
      { name: "❓ Не голосовало", value: `${notVoted} (из них ${notVotedRegistered} зарегистрированных)`, inline: true },
      { name: "📈 Явка", value: `${Math.round((totalVoted / totalPossible) * 100)}%`, inline: true },
      { name: "📈 Требуется голосов", value: `${requiredFor}/${requiredTotal}`, inline: true },
      { name: "🔒 Тип голосования", value: isSecret ? "Тайное" : "Открытое", inline: true },
      { name: "📋 Формула", value: getFormulaDescription(formula), inline: false }
    )
    .setColor(resultColor)
    .setFooter({ text: FOOTER })
    .setTimestamp();

  if (!isSecret) {
    embed.addFields({ 
      name: "🗳️ Поимённое голосование", 
      value: listText.substring(0, 1024), 
      inline: false 
    });
  }

  embed.addFields(
    { name: "🕐 Начало", value: voting?.startedat ? formatMoscowTime(Number(voting.startedat)) : "—", inline: true },
    { name: "🕐 Завершено", value: formatMoscowTime(Date.now()), inline: true }
  );

  try {
    const thread = await client.channels.fetch(proposal.threadid);
    
    const actionRow = new ActionRowBuilder();
    
    if (resultText === "Принято" && proposal.chamber !== 'sf' && !proposal.isquantitative) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`gov_approve_${proposal.id}`)
          .setLabel("✅ Одобрить")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`gov_return_${proposal.id}`)
          .setLabel("↩️ Вернуть")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    
    if (resultText === "Принято" && proposal.chamber === 'sf' && !proposal.isquantitative) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`president_sign_${proposal.id}`)
          .setLabel("✅ Подписать")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`president_veto_${proposal.id}`)
          .setLabel("❌ Отклонить")
          .setStyle(ButtonStyle.Danger)
      );
    }

    const components = actionRow.components.length > 0 ? [actionRow] : [];

    if (voting?.messageid) {
      try {
        const voteMsg = await thread.messages.fetch(voting.messageid);
        await voteMsg.edit({ content: null, embeds: [embed], components });
      } catch (e) {
        await thread.send({ embeds: [embed], components });
      }
    } else {
      await thread.send({ embeds: [embed], components });
    }

    if (proposal.isquantitative || resultText !== "Принято") {
      setTimeout(async () => {
        await closeThreadWithTag(proposal.threadid, tagId);
      }, 30000);
    }

  } catch (e) {
    console.error("❌ Error publishing vote results:", e);
  }

  await db.endVoting(proposalId, Date.now());
  await db.updateProposalStatus(proposalId, resultText);

  const events = proposal.events || [];
  events.push({
    type: 'vote_result',
    result: resultText,
    timestamp: Date.now(),
    chamber: proposal.chamber,
    description: `Голосование в ${CHAMBER_NAMES[proposal.chamber]} завершено. Результат: ${resultText} (За: ${forCount}, Против: ${againstCount}, Воздержалось: ${abstainCount})`
  });
  await db.updateProposalEvents(proposalId, events);
  
  await updateHistoryMessage(proposalId);

  if (voteTimers.has(proposalId)) {
    clearInterval(voteTimers.get(proposalId));
    voteTimers.delete(proposalId);
  }
}

async function getVoteCountsWithDelegations(proposalId, meetingId, stage = 1) {
  const votes = await db.getVotes(proposalId, stage);
  const registrations = await db.getMeetingRegistrations(meetingId);
  
  let forCount = 0;
  let againstCount = 0;
  let abstainCount = 0;
  
  const userVotes = new Map();
  
  for (const vote of votes) {
    userVotes.set(vote.userid, vote.votetype);
    
    if (vote.votetype === 'for') forCount++;
    else if (vote.votetype === 'against') againstCount++;
    else if (vote.votetype === 'abstain') abstainCount++;
  }
  
  const delegations = await db.getAllActiveDelegations();
  for (const delegation of delegations) {
    const delegateRegistered = registrations.some(r => r.userid === delegation.delegate_id);
    const delegateVoted = userVotes.has(delegation.delegate_id);
    
    if (delegateRegistered && delegateVoted) {
      const delegateVoteType = userVotes.get(delegation.delegate_id);
      if (delegateVoteType === 'for') forCount++;
      else if (delegateVoteType === 'against') againstCount++;
      else if (delegateVoteType === 'abstain') abstainCount++;
    }
  }
  
  return { forCount, againstCount, abstainCount, totalVoted: forCount + againstCount + abstainCount };
}

async function handleEndVoteButton(interaction) {
  const pid = interaction.customId.split("end_vote_")[1];
  const proposal = await db.getProposal(pid);
  
  if (!proposal) {
    await interaction.reply({ content: "❌ Законопроект не найден.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  
  if (!isChamberChairman(member, proposal.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав завершать голосование в этой палате.", flags: 64 });
    return;
  }
  
  await interaction.deferReply({ flags: 64 });
  await finalizeVote(pid);
  await interaction.editReply({ content: "⏹️ Голосование завершено.", flags: 64 });
}

async function handleDeleteProposalButton(interaction) {
  const pid = interaction.customId.split("delete_proposal_")[1];
  const proposal = await db.getProposal(pid);
  
  if (!proposal) {
    await interaction.reply({ content: "❌ Законопроект не найден.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  
  const isAuthor = interaction.user.id === proposal.authorid;
  const isChairman = isChamberChairman(member, proposal.chamber);
  const isAdminUser = isAdmin(member);
  
  if (!isAuthor && !isChairman && !isAdminUser) {
    await interaction.reply({ content: "❌ У вас нет прав для удаления этого законопроекта.", flags: 64 });
    return;
  }
  
  const voting = await db.getVoting(pid);
  if (voting?.open) {
    await interaction.reply({ content: "❌ Нельзя удалить законопроект во время голосования.", flags: 64 });
    return;
  }
  
  const modal = new ModalBuilder()
    .setCustomId(`delete_proposal_modal_${pid}`)
    .setTitle("Удаление законопроекта");
    
  const reasonInput = new TextInputBuilder()
    .setCustomId("delete_reason")
    .setLabel("Причина удаления/отзыва")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Опишите причину удаления или отзыва законопроекта");
    
  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

async function handleDeleteProposalModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const pid = interaction.customId.split("delete_proposal_modal_")[1];
  const reason = interaction.fields.getTextInputValue("delete_reason");
  
  const proposal = await db.getProposal(pid);
  if (!proposal) {
    await interaction.editReply({ content: "❌ Законопроект не найден." });
    return;
  }

  const voting = await db.getVoting(pid);
  if (voting?.open) {
    await interaction.editReply({ content: "❌ Нельзя удалить законопроект во время голосования." });
    return;
  }

  try {
    const thread = await client.channels.fetch(proposal.threadid);
    
    const deleteEmbed = new EmbedBuilder()
      .setTitle(`🗑️ Законопроект отозван`)
      .setDescription(`Законопроект **${proposal.number}** был отозван`)
      .addFields(
        { name: "📝 Наименование", value: proposal.name, inline: false },
        { name: "👤 Отозвал", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📅 Дата отзыва", value: formatMoscowTime(Date.now()), inline: true },
        { name: "📋 Причина", value: reason, inline: false }
      )
      .setColor(COLORS.DANGER)
      .setFooter({ text: FOOTER })
      .setTimestamp();
    
    await thread.send({ embeds: [deleteEmbed] });
    await thread.setArchived(true, 'Законопроект отозван');
    await db.deleteProposal(pid);
    
    await interaction.editReply({ content: "✅ Законопроект успешно отозван." });
  } catch (e) {
    console.error("❌ Error deleting proposal:", e);
    await interaction.editReply({ content: "❌ Ошибка при отзыве законопроекта." });
  }
}

async function handleStartRegistrationButton(interaction) {
  const meetingId = interaction.customId.split("start_registration_")[1];
  const meeting = await db.getMeeting(meetingId);
  
  if (!meeting) {
    await interaction.reply({ content: "❌ Заседание не найдено.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для начала регистрации.", flags: 64 });
    return;
  }
  
  const modal = new ModalBuilder()
    .setCustomId(`start_registration_modal_${meetingId}`)
    .setTitle("Настройки регистрации");
    
  const durationInput = new TextInputBuilder()
    .setCustomId("registration_duration")
    .setLabel("Время регистрации")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("30s, 1m, 2m, 3m, 5m, 1h, 2h");
    
  const quorumInput = new TextInputBuilder()
    .setCustomId("registration_quorum")
    .setLabel("Кворум (минимальное количество)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Например: 10");
    
  const totalMembersInput = new TextInputBuilder()
    .setCustomId("registration_total_members")
    .setLabel("Общее количество депутатов/сенаторов")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Например: 53");
    
  modal.addComponents(
    new ActionRowBuilder().addComponents(durationInput),
    new ActionRowBuilder().addComponents(quorumInput),
    new ActionRowBuilder().addComponents(totalMembersInput)
  );
  
  await interaction.showModal(modal);
}

async function handleStartRegistrationModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const meetingId = interaction.customId.split("start_registration_modal_")[1];
  const duration = interaction.fields.getTextInputValue("registration_duration");
  const quorum = parseInt(interaction.fields.getTextInputValue("registration_quorum"));
  const totalMembers = parseInt(interaction.fields.getTextInputValue("registration_total_members"));
  
  const meeting = await db.getMeeting(meetingId);
  if (!meeting) {
    await interaction.editReply({ content: "❌ Заседание не найдено." });
    return;
  }

  const ms = parseCustomDuration(duration);
  
  await db.updateMeeting(meetingId, {
    durationMs: ms,
    expiresAt: Date.now() + ms,
    open: true,
    quorum: quorum,
    totalMembers: totalMembers,
    status: 'registration'
  });

  try {
    const ch = await client.channels.fetch(meeting.channelid);
    const msg = await ch.messages.fetch(meeting.messageid);
    
    const regBtn = new ButtonBuilder()
      .setCustomId(`get_card_${meetingId}`)
      .setLabel("🎫 Зарегистрироваться на заседание")
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(regBtn);
    
    const embed = new EmbedBuilder()
      .setTitle(`🔔 Открыта регистрация`)
      .setDescription(`**${meeting.title}**`)
      .addFields(
        { name: "⏱️ Время регистрации", value: formatTimeLeft(ms), inline: true },
        { name: "📊 Требуемый кворум", value: String(quorum), inline: true },
        { name: "👥 Общее количество", value: String(totalMembers), inline: true },
        { name: "🕐 Начало регистрации", value: formatMoscowTime(Date.now()), inline: true }
      )
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: FOOTER })
      .setTimestamp();
      
    await msg.edit({ embeds: [embed], components: [row] });
    await startMeetingTicker(meetingId);
    await interaction.editReply({ content: "✅ Регистрация начата." });
  } catch (e) {
    console.error("❌ Error starting registration:", e);
    await interaction.editReply({ content: "❌ Ошибка при запуске регистрации." });
  }
}

async function startMeetingTicker(meetingId) {
  if (meetingTimers.has(meetingId)) {
    clearInterval(meetingTimers.get(meetingId));
    meetingTimers.delete(meetingId);
  }

  const updateFn = async () => {
    const meeting = await db.getMeeting(meetingId);
    if (!meeting) {
      if (meetingTimers.has(meetingId)) clearInterval(meetingTimers.get(meetingId));
      return;
    }
    
    const left = meeting.expiresat - Date.now();
    try {
      const ch = await client.channels.fetch(meeting.channelid);
      const msg = await ch.messages.fetch(meeting.messageid);
      
      if (left <= 0) {
        await db.closeMeeting(meetingId);
        await db.updateMeeting(meetingId, { status: 'completed' });
        
        const listText = await getRegistrationListWithDelegations(meetingId);
        const registeredCount = await db.getRegistrationCount(meetingId);
        const quorum = meeting.quorum || 1;
        const totalMembers = meeting.totalmembers || 53;
        
        const isQuorumMet = registeredCount >= quorum;
        const quorumStatus = isQuorumMet ? "✅ Кворум собран" : "❌ Кворум не собран";
        
        const finalEmbed = new EmbedBuilder()
          .setTitle(`📋 Регистрация завершена`)
          .setDescription(`**${meeting.title}**`)
          .addFields(
            { name: "👥 Количество зарегистрированных", value: String(registeredCount), inline: true },
            { name: "📊 Требуемый кворум", value: String(quorum), inline: true },
            { name: "📈 Статус кворума", value: quorumStatus, inline: true },
            { name: "👥 Общее количество членов", value: String(totalMembers), inline: true },
            { name: "⏱️ Время регистрации", value: formatTimeLeft(meeting.durationms), inline: true },
            { name: "🕐 Начало регистрации", value: formatMoscowTime(Number(meeting.createdat)), inline: false },
            { name: "📝 Список зарегистрированных", value: listText, inline: false }
          )
          .setColor(isQuorumMet ? COLORS.SUCCESS : COLORS.DANGER)
          .setFooter({ text: FOOTER })
          .setTimestamp();

        const buttonsRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`clear_roles_${meetingId}`)
            .setLabel("🧹 Завершить заседание")
            .setStyle(ButtonStyle.Danger)
        );
          
        await msg.edit({ content: null, embeds: [finalEmbed], components: [buttonsRow] });
        
        const agenda = await db.getAgenda(meetingId);
        for (const proposal of agenda) {
          await updateVoteButtonStatus(proposal.id);
        }
        
        const thread = await msg.startThread({
          name: `📊 ${meeting.title} - Обсуждение`,
          autoArchiveDuration: 1440,
          reason: `Обсуждение заседания`
        });
        
        await db.updateMeetingThread(meetingId, thread.id);
        
        if (isQuorumMet) {
          await thread.send(`✅ **Кворум собран!** Зарегистрировано ${registeredCount} из ${quorum} необходимых участников.`);
        } else {
          await thread.send(`❌ **Кворум не собран!** Зарегистрировано ${registeredCount} из ${quorum} необходимых участников.`);
        }
        
        clearInterval(meetingTimers.get(meetingId));
        meetingTimers.delete(meetingId);
        
      } else {
        const leftStr = formatTimeLeft(left);
        const registeredCount = await db.getRegistrationCount(meetingId);
        const quorum = meeting.quorum || 1;
        
        const embed = new EmbedBuilder()
          .setTitle(`🔔 Открыта регистрация`)
          .setDescription(`**${meeting.title}**`)
          .addFields(
            { name: "⏳ Время до конца регистрации", value: leftStr, inline: true },
            { name: "👥 Зарегистрировано", value: `${registeredCount}/${quorum}`, inline: true },
            { name: "📊 Статус кворума", value: registeredCount >= quorum ? "✅ Собран" : "❌ Не собран", inline: true }
          )
          .setColor(registeredCount >= quorum ? COLORS.SUCCESS : COLORS.WARNING)
          .setFooter({ text: FOOTER })
          .setTimestamp();
          
        await msg.edit({ content: null, embeds: [embed] });
      }
    } catch (e) {
      console.error("❌ Update meeting message failed:", e);
    }
  };

  await updateFn();
  const id = setInterval(updateFn, 10_000);
  meetingTimers.set(meetingId, id);
}


async function handleCancelMeetingButton(interaction) {
  const meetingId = interaction.customId.split("cancel_meeting_")[1];
  const meeting = await db.getMeeting(meetingId);
  
  if (!meeting) {
    await interaction.reply({ content: "❌ Заседание не найдено.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для отмены заседания.", flags: 64 });
    return;
  }
  
  const modal = new ModalBuilder()
    .setCustomId(`cancel_meeting_modal_${meetingId}`)
    .setTitle("Отмена заседания");
    
  const reasonInput = new TextInputBuilder()
    .setCustomId("cancel_reason")
    .setLabel("Причина отмены")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Опишите причину отмены заседания");
    
  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

async function handleCancelMeetingModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const meetingId = interaction.customId.split("cancel_meeting_modal_")[1];
  const reason = interaction.fields.getTextInputValue("cancel_reason");
  
  const meeting = await db.getMeeting(meetingId);
  if (!meeting) {
    await interaction.editReply({ content: "❌ Заседание не найдено." });
    return;
  }

  await db.updateMeeting(meetingId, {
    status: 'cancelled',
    open: false
  });

  try {
    const ch = await client.channels.fetch(meeting.channelid);
    const msg = await ch.messages.fetch(meeting.messageid);
    
    const embed = new EmbedBuilder()
      .setTitle(`❌ Заседание отменено`)
      .setDescription(`**${meeting.title}**`)
      .addFields(
        { name: "📅 Изначальная дата", value: meeting.meetingdate, inline: true },
        { name: "👤 Отменил", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📅 Дата отмены", value: formatMoscowTime(Date.now()), inline: true },
        { name: "📋 Причина", value: reason, inline: false }
      )
      .setColor(COLORS.DANGER)
      .setFooter({ text: FOOTER })
      .setTimestamp();
      
    await msg.edit({ embeds: [embed], components: [] });
    await interaction.editReply({ content: "✅ Заседание отменено." });
  } catch (e) {
    console.error("❌ Error canceling meeting:", e);
    await interaction.editReply({ content: "❌ Ошибка при отмене заседания." });
  }
}

async function handleEditMeetingButton(interaction) {
  const meetingId = interaction.customId.split("edit_meeting_")[1];
  const meeting = await db.getMeeting(meetingId);
  
  if (!meeting) {
    await interaction.reply({ content: "❌ Заседание не найдено.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для редактирования заседания.", flags: 64 });
    return;
  }
  
  const modal = new ModalBuilder()
    .setCustomId(`edit_meeting_modal_${meetingId}`)
    .setTitle("Редактирование заседания");
    
  const titleInput = new TextInputBuilder()
    .setCustomId("meeting_title")
    .setLabel("Название заседания")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(meeting.title || '');
    
  const dateInput = new TextInputBuilder()
    .setCustomId("meeting_date")
    .setLabel("Дата и время заседания")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(meeting.meetingdate || '')
    .setPlaceholder("Например: 15.12.2024 14:00");
    
  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(dateInput)
  );
  
  await interaction.showModal(modal);
}

async function handleEditMeetingModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const meetingId = interaction.customId.split("edit_meeting_modal_")[1];
  const title = interaction.fields.getTextInputValue("meeting_title");
  const date = interaction.fields.getTextInputValue("meeting_date");
  
  const meeting = await db.getMeeting(meetingId);
  if (!meeting) {
    await interaction.editReply({ content: "❌ Заседание не найдено." });
    return;
  }

  await db.updateMeeting(meetingId, {
    title: title,
    meetingDate: date
  });

  try {
    const ch = await client.channels.fetch(meeting.channelid);
    const msg = await ch.messages.fetch(meeting.messageid);
    
    const agenda = await db.getAgenda(meetingId);
    
    let agendaText = '';
    if (agenda.length > 0) {
      agendaText = '**📋 Повестка дня:**\n';
      for (const proposal of agenda) {
        agendaText += `• [${proposal.number}](${proposal.link}) - ${proposal.name}\n`;
      }
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`📅 Заседание: ${title}`)
      .setDescription(`Заседание запланировано на **${date}**`)
      .addFields(
        { name: "🏛️ Палата", value: CHAMBER_NAMES[meeting.chamber], inline: true },
        { name: "📅 Дата и время", value: date, inline: true },
        { name: "📋 Статус", value: "Запланировано", inline: true },
        { name: "📜 Повестка", value: agendaText || "*Повестка не сформирована*", inline: false }
      )
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`start_registration_${meetingId}`).setLabel("Начать регистрацию").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancel_meeting_${meetingId}`).setLabel("Отменить").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`edit_meeting_${meetingId}`).setLabel("Редактировать").setStyle(ButtonStyle.Secondary)
    );

    await msg.edit({ embeds: [embed], components: [buttons] });
    await interaction.editReply({ content: "✅ Заседание успешно обновлено." });
    
  } catch (e) {
    console.error("❌ Error updating meeting:", e);
    await interaction.editReply({ content: "❌ Ошибка при обновлении заседания." });
  }
}

async function handleGovernmentButtons(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const pid = interaction.customId.split("_").slice(2).join("_");
  const action = interaction.customId.startsWith("gov_approve_") ? 'approve' : 'return';
  
  const proposal = await db.getProposal(pid);
  if (!proposal) {
    await interaction.editReply({ content: "❌ Законопроект не найден." });
    return;
  }
  
  const member = interaction.member;
  
  if (!isGovernmentChairman(member, proposal.chamber)) {
    await interaction.editReply({ content: "❌ У вас нет прав для одобрения законопроектов в этой палате." });
    return;
  }
  
  try {
    await interaction.message.edit({ components: [] });
  } catch (e) {
    console.error("❌ Error removing government buttons:", e);
  }
  
  if (action === 'approve') {
    const newNumber = await db.getNextProposalNumber('sf');
    const newId = nanoid(8);
    
    const events = proposal.events || [];
    events.push({
      type: 'government_approval',
      timestamp: Date.now(),
      description: `Одобрен Председателем Правительства (<@${interaction.user.id}>)`
    });
    await db.updateProposalEvents(pid, events);
    await db.updateProposalStatus(pid, 'Одобрен Правительством');
    
    await updateHistoryMessage(pid);
    
    const newEvents = [{
      type: 'transfer',
      timestamp: Date.now(),
      description: `Передан из ${CHAMBER_NAMES[proposal.chamber]} (исх. номер ${proposal.number})`
    }];
    
    proposal.events.forEach(e => newEvents.push(e));
    
    const newProposal = {
      id: newId,
      number: newNumber,
      name: proposal.name,
      party: proposal.party,
      link: proposal.link,
      chamber: 'sf',
      status: "На рассмотрении",
      createdAt: proposal.createdat,
      authorId: proposal.authorid,
      threadId: null,
      channelId: CHAMBER_CHANNELS['sf'],
      isQuantitative: false,
      parentProposalId: pid,
      events: newEvents
    };
    
    await db.createProposal(newProposal);
    
    try {
      const forum = await client.channels.fetch(CHAMBER_CHANNELS['sf']);
      const embed = new EmbedBuilder()
        .setTitle(`📋 ЗАКОНОПРОЕКТ ${newNumber}`)
        .setDescription(`Законопроект передан в Совет Федерации после одобрения Правительством`)
        .addFields(
          { name: "🏛️ Исходная палата", value: CHAMBER_NAMES[proposal.chamber], inline: false },
          { name: "📝 Наименование", value: proposal.name, inline: false },
          { name: "🏛️ Партия / Организация", value: proposal.party, inline: false },
          { name: "🔗 Ссылка на документ", value: `[Кликабельно](${proposal.link})`, inline: false },
          { name: "👤 Автор инициативы", value: `<@${proposal.authorid}>`, inline: false }
        )
        .setColor(COLORS.SUCCESS)
        .setFooter({ text: FOOTER })
        .setTimestamp();

      // УБРАНА КНОПКА ВЫСТУПЛЕНИЯ
      const threadMessage = await forum.threads.create({
        name: `${newNumber} — ${proposal.name.substring(0, 50)}${proposal.name.length > 50 ? '...' : ''}`,
        appliedTags: [FORUM_TAGS.ON_REVIEW],
        message: {
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`start_vote_${newId}`).setLabel("▶️ Начать голосование").setStyle(ButtonStyle.Success).setDisabled(true)
            ),
          ],
        },
      });
      
      const firstMessage = await threadMessage.fetchStarterMessage();
      await db.updateProposalInitialMessage(newId, firstMessage.id);
      await db.updateProposalThread(newId, threadMessage.id);
      
      await updateHistoryMessage(newId);
      
      const originalThread = await client.channels.fetch(proposal.threadid);
      const approvalEmbed = new EmbedBuilder()
        .setTitle(`✅ Законопроект одобрен Правительством`)
        .setDescription(`Законопроект **${proposal.number}** был одобрен Председателем Правительства и передан в Совет Федерации под номером **${newNumber}**`)
        .setColor(COLORS.SUCCESS)
        .setFooter({ text: FOOTER })
        .setTimestamp();
      
      await originalThread.send({ embeds: [approvalEmbed] });
      await closeThreadWithTag(proposal.threadid, FORUM_TAGS.APPROVED);
      
      await interaction.editReply({ 
        content: `✅ Законопроект одобрен и передан в Совет Федерации под номером ${newNumber}.`
      });
    } catch (e) {
      console.error("❌ Error creating SF proposal:", e);
      await interaction.editReply({ content: "❌ Ошибка при передаче законопроекта в Совет Федерации." });
    }
  } else {
    const events = proposal.events || [];
    events.push({
      type: 'government_return',
      timestamp: Date.now(),
      description: `Возвращен Председателем Правительства (<@${interaction.user.id}>)`
    });
    await db.updateProposalEvents(pid, events);
    await db.updateProposalStatus(pid, 'Возвращен Правительством');
    
    await updateHistoryMessage(pid);
    
    const thread = await client.channels.fetch(proposal.threadid);
    const returnEmbed = new EmbedBuilder()
      .setTitle(`↩️ Законопроект возвращен Правительством`)
      .setDescription(`Законопроект **${proposal.number}** был возвращен Председателем Правительства для доработки`)
      .setColor(COLORS.WARNING)
      .setFooter({ text: FOOTER })
      .setTimestamp();
    
    await thread.send({ embeds: [returnEmbed] });
    
    await interaction.editReply({ 
      content: "✅ Законопроект возвращен для доработки."
    });
  }
}

async function handlePresidentButtons(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const pid = interaction.customId.split("_").slice(2).join("_");
  const action = interaction.customId.startsWith("president_sign_") ? 'sign' : 'veto';
  
  if (interaction.user.id !== ROLES.PRESIDENT) {
    await interaction.editReply({ content: "❌ Только Президент может подписывать или отклонять законопроекты." });
    return;
  }
  
  const proposal = await db.getProposal(pid);
  if (!proposal) {
    await interaction.editReply({ content: "❌ Законопроект не найден." });
    return;
  }
  
  try {
    await interaction.message.edit({ components: [] });
  } catch (e) {
    console.error("❌ Error removing president buttons:", e);
  }
  
  if (action === 'sign') {
    const events = proposal.events || [];
    events.push({
      type: 'president_sign',
      timestamp: Date.now(),
      description: `Подписан Президентом (<@${interaction.user.id}>) ✅`
    });
    await db.updateProposalEvents(pid, events);
    await db.updateProposalStatus(pid, 'Подписан');
    
    await updateHistoryMessage(pid);
    
    const thread = await client.channels.fetch(proposal.threadid);
    const signEmbed = new EmbedBuilder()
      .setTitle(`✅ Законопроект подписан Президентом`)
      .setDescription(`Законопроект **${proposal.number}** был подписан Президентом и вступает в силу`)
      .setColor(COLORS.SUCCESS)
      .setFooter({ text: FOOTER })
      .setTimestamp();
    
    await thread.send({ embeds: [signEmbed] });
    await closeThreadWithTag(proposal.threadid, FORUM_TAGS.SIGNED);
    
    await interaction.editReply({ 
      content: "✅ Законопроект подписан и вступает в силу." 
    });
  } else {
    const events = proposal.events || [];
    events.push({
      type: 'president_veto',
      timestamp: Date.now(),
      description: `Отклонен Президентом (<@${interaction.user.id}>) ❌`
    });
    await db.updateProposalEvents(pid, events);
    await db.updateProposalStatus(pid, 'Отклонен Президентом');
    
    await updateHistoryMessage(pid);
    
    const thread = await client.channels.fetch(proposal.threadid);
    const vetoEmbed = new EmbedBuilder()
      .setTitle(`❌ Законопроект отклонен Президентом`)
      .setDescription(`Законопроект **${proposal.number}** был отклонен Президентом`)
      .setColor(COLORS.DANGER)
      .setFooter({ text: FOOTER })
      .setTimestamp();
    
    await thread.send({ embeds: [vetoEmbed] });
    await closeThreadWithTag(proposal.threadid, FORUM_TAGS.VETOED);
    
    await interaction.editReply({ 
      content: "✅ Законопроект отклонен." 
    });
  }
}

async function closeThreadWithTag(threadId, tagId) {
  try {
    const thread = await client.channels.fetch(threadId);
    console.log(`🔄 Attempting to close thread ${threadId} and set tag ${tagId}`);

    if (thread.parent?.type === 15) {
      try {
        await thread.edit({
          archived: true,
          locked: true,
          appliedTags: tagId ? [tagId] : thread.appliedTags,
          reason: 'Голосование завершено'
        });
        console.log(`✅ Successfully closed thread and set tag ${tagId} for ${threadId}`);
      } catch (e) {
        console.error("❌ Failed to set tag and close thread:", e.message);
        try {
          if (tagId) {
            await thread.edit({ appliedTags: [tagId] });
          }
          await thread.setArchived(true, 'Голосование завершено');
        } catch (e2) {
          console.error("❌ Failed separate operations:", e2.message);
        }
      }
    } else {
      if (thread.manageable && !thread.archived) {
        await thread.setArchived(true, 'Голосование завершено');
      }
    }
  } catch (e) {
    console.error("❌ Error in closeThreadWithTag:", e.message);
  }
}

async function safeReply(interaction, content, options = {}) {
  try {
    // Если interaction устарел или нет возможности ответить обычным способом,
    // пробуем отправить сообщение в канал (если доступен)
    if (!interaction || !interaction.inGuild()) {
      try {
        const ch = await client.channels.fetch(interaction.channelId);
        return await ch.send(content);
      } catch (err) {
        console.error('❌ safeReply: cannot fetch channel to send fallback message', err);
        return null;
      }
    }

    // Если interaction была отложена (deferred) — используем editReply
    if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({ content, ...options });
        return true;
      } catch (err) {
        // Если editReply упал (например, interaction устарел) — fallback to channel
        console.warn('⚠️ safeReply: editReply failed, falling back to channel:', err?.message || err);
      }
    }

    // Если уже ответили — используем followUp
    if (interaction.replied) {
      try {
        await interaction.followUp({ content, ...options });
        return true;
      } catch (err) {
        console.warn('⚠️ safeReply: followUp failed, falling back to channel:', err?.message || err);
      }
    }

    // Если ещё ничего не делали — обычный reply
    try {
      await interaction.reply({ content, flags: 64, ...options });
      return true;
    } catch (err) {
      console.warn('⚠️ safeReply: reply failed, falling back to channel:', err?.message || err);
    }

    // Последний шанс — отправить сообщение в канал
    try {
      const ch = await client.channels.fetch(interaction.channelId);
      await ch.send(content);
      return true;
    } catch (err) {
      console.error('❌ safeReply: final fallback failed:', err);
      return null;
    }
  } catch (error) {
    console.error("❌ Error in safeReply:", error);
    return null;
  }
}


// ================== VOTE FINALIZATION FUNCTIONS ==================
async function finalizeQuantitativeVote(proposalId) {
  const proposal = await db.getProposal(proposalId);
  if (!proposal) return;

  const voting = await db.getVoting(proposalId);
  const items = await db.getQuantitativeItems(proposalId);
  const lastMeeting = await db.getLastMeetingByChamber(proposal.chamber);
  
  const votes = await db.getVotes(proposalId);
  
  const itemVotes = {};
  items.forEach(item => {
    itemVotes[item.itemindex] = 0;
  });
  
  let abstainCount = 0;
  const voters = new Set();
  
  votes.forEach(vote => {
    voters.add(vote.userid);
    if (vote.votetype.startsWith('item_')) {
      const itemIndex = parseInt(vote.votetype.split('_')[1]);
      if (itemVotes[itemIndex] !== undefined) {
        itemVotes[itemIndex]++;
      }
    } else if (vote.votetype === 'abstain') {
      abstainCount++;
    }
  });
  
  const delegations = await db.getAllActiveDelegations();
  for (const delegation of delegations) {
    const delegateVoted = votes.some(v => v.userid === delegation.delegate_id);
    const delegateRegistered = await db.isUserRegistered(lastMeeting.id, delegation.delegate_id);
    
    if (delegateVoted && delegateRegistered) {
      const delegateVote = votes.find(v => v.userid === delegation.delegate_id);
      if (delegateVote?.votetype.startsWith('item_')) {
        const itemIndex = parseInt(delegateVote.votetype.split('_')[1]);
        if (itemVotes[itemIndex] !== undefined) {
          itemVotes[itemIndex]++;
        }
      } else if (delegateVote?.votetype === 'abstain') {
        abstainCount++;
      }
    }
  }
  
  const totalVoted = voters.size + delegations.filter(d => 
    votes.some(v => v.userid === d.delegate_id) && 
    db.isUserRegistered(lastMeeting.id, d.delegate_id)
  ).length;
  
  const voteQuorum = lastMeeting ? lastMeeting.quorum : 1;
  const totalMembers = lastMeeting ? lastMeeting.totalmembers : 53;
  
  const isQuorumMet = totalVoted >= voteQuorum;
  
  const winningItems = [];
  for (const [itemIndex, voteCount] of Object.entries(itemVotes)) {
    if (voteCount > totalVoted / 2) {
      winningItems.push({
        index: parseInt(itemIndex),
        votes: voteCount,
        text: items.find(item => item.itemindex === parseInt(itemIndex))?.text || 'Неизвестный пункт'
      });
    }
  }
  
  winningItems.sort((a, b) => b.votes - a.votes);
  
  let resultText = "Не принято";
  let resultColor = COLORS.SECONDARY;
  let resultEmoji = "❌";
  let tagId = FORUM_TAGS.NOT_APPROVED;
  
  if (!isQuorumMet) {
    resultText = "Не принято (кворум не собран)";
  } else if (winningItems.length === 0) {
    resultText = "Ни один пункт не набрал большинства";
  } else if (winningItems.length === 1) {
    resultText = "Принят один пункт";
    resultColor = COLORS.SUCCESS;
    resultEmoji = "✅";
    tagId = FORUM_TAGS.APPROVED;
  } else {
    resultText = "Принято несколько пунктов";
    resultColor = COLORS.SUCCESS;
    resultEmoji = "✅";
    tagId = FORUM_TAGS.APPROVED;
    
    await startQuantitativeRunoff(proposalId, winningItems);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📊 Результаты рейтингового голосования — ${proposal.number}`)
    .setDescription(`## ${resultEmoji} ${resultText}`)
    .addFields(
      { name: "📊 Всего проголосовало", value: String(totalVoted), inline: true },
      { name: "📋 Требуемый кворум", value: `${voteQuorum} голосов`, inline: true },
      { name: "📈 Статус кворума", value: isQuorumMet ? "✅ Собран" : "❌ Не собран", inline: true },
      { name: "⚪ Воздержалось", value: String(abstainCount), inline: true }
    )
    .setColor(resultColor)
    .setFooter({ text: FOOTER })
    .setTimestamp();

  for (const [itemIndex, voteCount] of Object.entries(itemVotes)) {
    const item = items.find(item => item.itemindex === parseInt(itemIndex));
    const percentage = totalVoted > 0 ? Math.round((voteCount / totalVoted) * 100) : 0;
    const isWinner = winningItems.some(winning => winning.index === parseInt(itemIndex));
    
    embed.addFields({
      name: `Пункт ${itemIndex} ${isWinner ? '✅' : ''}`,
      value: `${item.text}\nГолосов: ${voteCount} (${percentage}%)`,
      inline: false
    });
  }

  if (winningItems.length > 0) {
    embed.addFields({
      name: "🎯 Победившие пункты",
      value: winningItems.map(item => `**Пункт ${item.index}:** ${item.text} (${item.votes} голосов)`).join('\n'),
      inline: false
    });
  }

  try {
    const thread = await client.channels.fetch(proposal.threadid);
    
    if (voting?.messageid) {
      try {
        const voteMsg = await thread.messages.fetch(voting.messageid);
        await voteMsg.edit({ content: null, embeds: [embed], components: [] });
      } catch (e) {
        await thread.send({ embeds: [embed] });
      }
    } else {
      await thread.send({ embeds: [embed] });
    }

    if (winningItems.length <= 1) {
      await db.endVoting(proposalId, Date.now());
      await db.updateProposalStatus(proposalId, resultText);
      
      const events = proposal.events || [];
      events.push({
        type: 'vote_result',
        result: resultText,
        timestamp: Date.now(),
        chamber: proposal.chamber,
        description: `Рейтинговое голосование в ${CHAMBER_NAMES[proposal.chamber]} завершено. Результат: ${resultText}`
      });
      await db.updateProposalEvents(proposalId, events);
      
      await updateHistoryMessage(proposalId);
      
      if (voteTimers.has(proposalId)) {
        clearInterval(voteTimers.get(proposalId));
        voteTimers.delete(proposalId);
      }
      
      if (winningItems.length <= 1) {
        setTimeout(async () => {
          await closeThreadWithTag(proposal.threadid, tagId);
        }, 30000);
      }
    }
    
  } catch (e) {
    console.error("❌ Error publishing quantitative vote results:", e);
  }
}

async function startQuantitativeRunoff(proposalId, winningItems) {
  const proposal = await db.getProposal(proposalId);
  if (!proposal) return;

  const voting = {
    proposalId: proposalId,
    open: true,
    startedAt: Date.now(),
    durationMs: 300000,
    expiresAt: Date.now() + 300000,
    messageId: null,
    isSecret: false,
    formula: '0',
    stage: 2
  };

  await db.startVoting(voting);

  try {
    const thread = await client.channels.fetch(proposal.threadid);
    
    const embed = new EmbedBuilder()
      .setTitle(`🗳️ Второй тур рейтингового голосования — ${proposal.number}`)
      .setDescription(`Несколько пунктов набрали большинство голосов. Во втором туре выберите ОДИН наиболее предпочтительный пункт.`)
      .setColor(COLORS.INFO)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    const voteRows = [];
    let currentRow = new ActionRowBuilder();
    
    winningItems.forEach((item, index) => {
      if (currentRow.components.length >= 3) {
        voteRows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_item_${item.index}_${proposalId}`)
          .setLabel(`Пункт ${item.index}`)
          .setStyle(ButtonStyle.Primary)
      );
    });
    
    if (currentRow.components.length >= 3) {
      voteRows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_abstain_${proposalId}`)
        .setLabel("⚪ Воздержаться")
        .setStyle(ButtonStyle.Secondary)
    );
    
    if (currentRow.components.length > 0) {
      voteRows.push(currentRow);
    }
    
    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`end_vote_${proposalId}`).setLabel("⏹️ Завершить голосование").setStyle(ButtonStyle.Danger)
    );
    
    voteRows.push(controlRow);

    const runoffMsg = await thread.send({ 
      embeds: [embed], 
      components: voteRows 
    });

    voting.runoffMessageId = runoffMsg.id;
    await db.startVoting(voting);

    await startVoteTicker(proposalId);
    
  } catch (e) {
    console.error("❌ Error starting quantitative runoff:", e);
  }
}

async function finalizeQuantitativeRunoff(proposalId) {
  const proposal = await db.getProposal(proposalId);
  if (!proposal) return;

  const voting = await db.getVoting(proposalId);
  const items = await db.getQuantitativeItems(proposalId);
  const lastMeeting = await db.getLastMeetingByChamber(proposal.chamber);
  
  const votes = await db.getVotes(proposalId, 2);
  
  const itemVotes = {};
  const voters = new Set();
  let abstainCount = 0;
  
  votes.forEach(vote => {
    voters.add(vote.userid);
    if (vote.votetype.startsWith('item_')) {
      const itemIndex = parseInt(vote.votetype.split('_')[1]);
      itemVotes[itemIndex] = (itemVotes[itemIndex] || 0) + 1;
    } else if (vote.votetype === 'abstain') {
      abstainCount++;
    }
  });
  
  const delegations = await db.getAllActiveDelegations();
  for (const delegation of delegations) {
    const delegateVoted = votes.some(v => v.userid === delegation.delegate_id);
    const delegateRegistered = await db.isUserRegistered(lastMeeting.id, delegation.delegate_id);
    
    if (delegateVoted && delegateRegistered) {
      const delegateVote = votes.find(v => v.userid === delegation.delegate_id);
      if (delegateVote?.votetype.startsWith('item_')) {
        const itemIndex = parseInt(delegateVote.votetype.split('_')[1]);
        itemVotes[itemIndex] = (itemVotes[itemIndex] || 0) + 1;
      } else if (delegateVote?.votetype === 'abstain') {
        abstainCount++;
      }
    }
  }
  
  const totalVoted = voters.size + delegations.filter(d => 
    votes.some(v => v.userid === d.delegate_id) && 
    db.isUserRegistered(lastMeeting.id, d.delegate_id)
  ).length;
  
  let winner = null;
  let maxVotes = 0;
  
  for (const [itemIndex, voteCount] of Object.entries(itemVotes)) {
    if (voteCount > maxVotes) {
      maxVotes = voteCount;
      winner = {
        index: parseInt(itemIndex),
        votes: voteCount,
        text: items.find(item => item.itemindex === parseInt(itemIndex))?.text || 'Неизвестный пункт'
      };
    }
  }
  
  const resultText = winner ? `Принят пункт ${winner.index}` : "Ни один пункт не выбран";
  const resultColor = winner ? COLORS.SUCCESS : COLORS.DANGER;
  const resultEmoji = winner ? "✅" : "❌";
  const tagId = winner ? FORUM_TAGS.APPROVED : FORUM_TAGS.NOT_APPROVED;

  const embed = new EmbedBuilder()
    .setTitle(`📊 Результаты второго тура — ${proposal.number}`)
    .setDescription(`## ${resultEmoji} ${resultText}`)
    .addFields(
      { name: "📊 Всего проголосовало", value: String(totalVoted), inline: true },
      { name: "⚪ Воздержалось", value: String(abstainCount), inline: true }
    )
    .setColor(resultColor)
    .setFooter({ text: FOOTER })
    .setTimestamp();

  if (winner) {
    embed.addFields({
      name: "🎯 Победивший пункт",
      value: `**Пункт ${winner.index}:** ${winner.text}\n**Голосов:** ${winner.votes}`,
      inline: false
    });
  }

  for (const [itemIndex, voteCount] of Object.entries(itemVotes)) {
    const item = items.find(item => item.itemindex === parseInt(itemIndex));
    const percentage = totalVoted > 0 ? Math.round((voteCount / totalVoted) * 100) : 0;
    const isWinner = winner && winner.index === parseInt(itemIndex);
    
    embed.addFields({
      name: `Пункт ${itemIndex} ${isWinner ? '👑' : ''}`,
      value: `${item.text}\nГолосов: ${voteCount} (${percentage}%)`,
      inline: false
    });
  }

  try {
    const thread = await client.channels.fetch(proposal.threadid);
    
    if (voting?.runoffmessageid) {
      try {
        const runoffMsg = await thread.messages.fetch(voting.runoffmessageid);
        await runoffMsg.edit({ content: null, embeds: [embed], components: [] });
      } catch (e) {
        await thread.send({ embeds: [embed] });
      }
    } else {
      await thread.send({ embeds: [embed] });
    }

    await db.endVoting(proposalId, Date.now());
    await db.updateProposalStatus(proposalId, resultText);
    
    const events = proposal.events || [];
    events.push({
      type: 'vote_result',
      result: resultText,
      timestamp: Date.now(),
      chamber: proposal.chamber,
      description: `Второй тур рейтингового голосования в ${CHAMBER_NAMES[proposal.chamber]} завершено. ${resultText}`
    });
    await db.updateProposalEvents(proposalId, events);
    
    await updateHistoryMessage(proposalId);
    
    if (voteTimers.has(proposalId)) {
      clearInterval(voteTimers.get(proposalId));
      voteTimers.delete(proposalId);
    }
    
    setTimeout(async () => {
      await closeThreadWithTag(proposal.threadid, tagId);
    }, 30000);
    
  } catch (e) {
    console.error("❌ Error publishing runoff results:", e);
  }
}

// ================== MISSING FUNCTION ==================
async function getRegistrationListWithDelegations(meetingId) {
  const registrations = await db.getMeetingRegistrations(meetingId);
  let listText = '';
  
  for (const reg of registrations) {
    try {
      const user = await client.users.fetch(reg.userid);
      const delegation = await getDelegatedVote(reg.userid);
      
      if (delegation) {
        const delegator = await client.users.fetch(delegation.delegator_id);
        listText += `• <@${reg.userid}> (${user.username}) - делегат от ${delegator.username}\n`;
      } else {
        listText += `• <@${reg.userid}> (${user.username})\n`;
      }
    } catch (error) {
      listText += `• <@${reg.userid}>\n`;
    }
  }
  
  return listText || "Никто не зарегистрирован";
}


// ================== CONFIG VALIDATION ==================
function validateConfig() {
  const requiredEnvVars = [
    'DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID',
    'SF_CHANNEL_ID', 'GD_RUBLEVKA_CHANNEL_ID', 'GD_ARBAT_CHANNEL_ID', 
    'GD_PATRICKI_CHANNEL_ID', 'GD_TVERSKOY_CHANNEL_ID',
    'SF_MEETING_CHANNEL_ID', 'GD_RUBLEVKA_MEETING_CHANNEL_ID',
    'GD_ARBAT_MEETING_CHANNEL_ID', 'GD_PATRICKI_MEETING_CHANNEL_ID', 
    'GD_TVERSKOY_MEETING_CHANNEL_ID',
    'FORUM_TAG_ON_REVIEW', 'FORUM_TAG_APPROVED', 'FORUM_TAG_REJECTED',
    'FORUM_TAG_NOT_APPROVED', 'FORUM_TAG_SIGNED', 'FORUM_TAG_VETOED',
    'SENATOR_ROLE_ID', 'SENATOR_NO_VOTE_ROLE_ID', 'DEPUTY_ROLE_ID',
    'DEPUTY_NO_VOTE_ROLE_ID', 'CHAIRMAN_ROLE_ID', 'VICE_CHAIRMAN_ROLE_ID',
    'GOVERNMENT_CHAIRMAN_ROLE_ID', 'PRESIDENT_USER_ID',
    'RUBLEVKA_ROLE_ID', 'ARBAT_ROLE_ID', 'PATRICKI_ROLE_ID', 'TVERSKOY_ROLE_ID',
    'ADMIN_ROLE_SEND_ID', 'SYSADMIN_ROLE_ID'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:", missing);
    return false;
  }
  
  for (const [chamber, channelId] of Object.entries(CHAMBER_CHANNELS)) {
    if (!channelId) {
      console.error(`❌ Missing channel ID for chamber: ${chamber}`);
      return false;
    }
  }

  console.log("✅ All configuration validated successfully");
  return true;
}

if (!validateConfig()) {
  console.error("❌ Configuration validation failed. Please check your environment variables.");
  process.exit(1);
}

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("❌ Please set DISCORD_TOKEN, CLIENT_ID, GUILD_ID env vars.");
  process.exit(1);
}


// ================== INITIALIZATION ==================
async function restoreAllTimers() {
  try {
    const openMeetings = await db.getOpenMeetings();
    for (const meeting of openMeetings) {
      startMeetingTicker(meeting.id).catch(console.error);
    }
    
    const openVotings = await db.getOpenVotings();
    for (const voting of openVotings) {
      startVoteTicker(voting.proposalid).catch(console.error);
    }
    
    await updateDelegationMessage();
    
    const allProposals = await db.getAllProposals();
    for (const proposal of allProposals) {
      if (proposal.status === 'На рассмотрении') {
        await updateVoteButtonStatus(proposal.id);
      }
    }
    
    console.log(`✅ Restored ${openMeetings.length} meetings and ${openVotings.length} votes`);
  } catch (error) {
    console.error("❌ Error restoring timers:", error);
  }
}

// ================== EVENT HANDLERS ==================
client.on(Events.ClientReady, async () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);
  await restoreAllTimers();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand?.()) {
      await handleSlashCommand(interaction);
    }
    
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    }
    
    if (interaction.isModalSubmit?.()) {
      await handleModalSubmit(interaction);
    }
    
    if (interaction.isButton?.()) {
      await handleButton(interaction);
    }
    
  } catch (err) {
    console.error("❌ Interaction error:", err);
    
    try {
      if (interaction.replied) {
        console.log('🔄 Interaction already replied, using followUp');
        await interaction.followUp({ 
          content: "❌ Ошибка при обработке команды.", 
          flags: 64,
          ephemeral: true 
        });
      } else if (interaction.deferred) {
        await interaction.editReply({ 
          content: "❌ Ошибка при обработке команды." 
        });
      } else {
        await interaction.reply({ 
          content: "❌ Ошибка при обработке команды.", 
          flags: 64,
          ephemeral: true 
        });
      }
    } catch (e2) {
      console.error("❌ Error sending error reply:", e2);
    }
  }
});

// ================== ERROR HANDLING ==================
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

// ================== LOGIN ==================
client.login(TOKEN).catch((e) => {
  console.error("❌ Login error:", e);
  process.exit(1);
});
