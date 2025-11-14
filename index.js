// index.js
import 'dotenv/config';
import { nanoid } from "nanoid";
import {
  Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, EmbedBuilder, Events, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} from "discord.js";

// Repositories
import { ProposalRepository } from './src/database/repositories/proposal.repository.js';
import { MeetingRepository } from './src/database/repositories/meeting.repository.js';
import { VoteRepository } from './src/database/repositories/vote.repository.js';
import { VotingRepository } from './src/database/repositories/voting.repository.js';
import { SpeakerRepository } from './src/database/repositories/speaker.repository.js';

// Services
import { MeetingService } from './src/services/meeting.service.js';

// Config and Utils
import { 
  TOKEN, CLIENT_ID, GUILD_ID, FORUM_TAGS, CHAMBER_CHANNELS, 
  VOTER_ROLES_BY_CHAMBER, ROLES, FOOTER, COLORS, CHAMBER_NAMES, EVENT_EMOJIS
} from './config.js';
import {
  isAdmin, isChamberChairman, isGovernmentChairman, getChamberByChannel,
  parseCustomDuration, formatTimeLeft, formatMoscowTime, getFormulaDescription,
  calculateVoteResult, getEventTitle, getAvailableChambers, safeReply
} from './utils.js';


/* ===== In-memory timers ===== */
const voteTimers = new Map();

/* ===== Discord client ===== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction],
});

const rest = new REST({ version: "10" }).setToken(TOKEN);

const commands = [
  new SlashCommandBuilder().setName("help").setDescription("Показать справку по использованию бота"),
  new SlashCommandBuilder().setName("send").setDescription("Открыть форму регистрации законопроекта"),
  new SlashCommandBuilder()
    .setName("create_meeting")
    .setDescription("Создать заседание (только для председателей)")
    .addStringOption((o) => o.setName("title").setDescription("Наименование заседания").setRequired(true))
    .addStringOption((o) => o.setName("date").setDescription("Дата и время заседания").setRequired(true)),
  new SlashCommandBuilder().setName("res_meeting").setDescription("Снять роль голосующего у всех (админы)"),
].map((c) => c.toJSON());

// Регистрация команд
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
    const proposal = await ProposalRepository.findById(proposalId);
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
        
        eventText += '\_\_\_\_\_\n\n';
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
    await ProposalRepository.updateField(proposalId, 'historyMessageId', message.id);
    
  } catch (error) {
    console.error("❌ Error updating history message:", error);
  }
}

async function updateSpeakersMessage(proposalId) {
  try {
    const proposal = await ProposalRepository.findById(proposalId);
    if (!proposal || !proposal.threadid) return;

    const speakers = await SpeakerRepository.findByProposalId(proposalId);
    const thread = await client.channels.fetch(proposal.threadid);
    
    const speakersByType = {
      'доклад': [],
      'содоклад': [],
      'прения': []
    };
    
    speakers.forEach(speaker => {
      if (speakersByType[speaker.type]) {
        speakersByType[speaker.type].push(speaker);
      }
    });
    
    let description = '';
    
    if (speakersByType['доклад'].length > 0) {
      description += `**1. Доклад:**\n`;
      speakersByType['доклад'].forEach((speaker, index) => {
        description += `   ${index + 1}. <@${speaker.userid}> (${speaker.displayname})\n`;
      });
    } else {
      description += `**1. Доклад:**\n`;
      description += `   1. <@${proposal.authorid}> (автор инициативы)\n`;
      
      const authorSpeaker = {
        proposalId,
        userId: proposal.authorid,
        type: 'доклад',
        displayName: 'автор инициативы',
        registeredAt: Date.now()
      };
      await SpeakerRepository.upsert(authorSpeaker);
    }
    
    if (speakersByType['содоклад'].length > 0) {
      description += `**2. Содоклад:**\n`;
      speakersByType['содоклад'].forEach((speaker, index) => {
        description += `   ${index + 1}. <@${speaker.userid}> (${speaker.displayname})\n`;
      });
    }
    
    if (speakersByType['прения'].length > 0) {
      description += `**3. Прения:**\n`;
      speakersByType['прения'].forEach((speaker, index) => {
        description += `   ${index + 1}. <@${speaker.userid}> (${speaker.displayname})\n`;
      });
    }
    
    if (description === '') {
      description = 'Пока нет зарегистрированных выступающих.';
    }
    
    const embed = new EmbedBuilder()
      .setTitle('🎤 Список выступающих')
      .setDescription(description)
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: FOOTER })
      .setTimestamp();
    
    if (proposal.speakersmessageid) {
      try {
        const message = await thread.messages.fetch(proposal.speakersmessageid);
        await message.edit({ embeds: [embed] });
        return;
      } catch (e) {
        console.log("ℹ️ Speakers message not found, sending new one");
      }
    }
    
    const message = await thread.send({ embeds: [embed] });
    await ProposalRepository.updateField(proposalId, 'speakersMessageId', message.id);
    
  } catch (error) {
    console.error("❌ Error updating speakers message:", error);
  }
}

async function disableRegistrationButtonForProposal(proposalId) {
  try {
    const proposal = await ProposalRepository.findById(proposalId);
    if (!proposal || !proposal.threadid || !proposal.initialmessageid) return;
    
    const thread = await client.channels.fetch(proposal.threadid);
    
    if (thread.archived) return;
    
    const initialMessage = await thread.messages.fetch(proposal.initialmessageid);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`start_vote_${proposal.id}`)
        .setLabel("▶️ Начать голосование")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`register_speaker_${proposal.id}`)
        .setLabel("🎤 Зарегистрироваться выступить")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );
    
    await initialMessage.edit({ components: [row] });
  } catch (error) {
    if (error.code === 50083 || error.code === 10008) {
      console.log(`ℹ️ Skipping button disable for proposal ${proposalId}: Thread archived or message not found.`);
    } else {
      console.error(`❌ Error disabling button for proposal ${proposalId}:`, error);
    }
  }
}

async function startVoteTicker(proposalId) {
  if (voteTimers.has(proposalId)) {
    clearInterval(voteTimers.get(proposalId));
    voteTimers.delete(proposalId);
  }

  const updateFn = async () => {
    const proposal = await ProposalRepository.findById(proposalId);
    const voting = await VotingRepository.findByProposalId(proposalId);
    
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
  const id = setInterval(updateFn, 10000);
  voteTimers.set(proposalId, id);
}

async function finalizeVote(proposalId) {
  const proposal = await ProposalRepository.findById(proposalId);
  if (!proposal) return;

  const voting = await VotingRepository.findByProposalId(proposalId);
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
  const proposal = await ProposalRepository.findById(proposalId);
  if (!proposal) return;

  const uniqueVotes = await VoteRepository.getVotes(proposalId);
  const totalVoted = new Set(uniqueVotes.map(vote => vote.userid)).size;

  const forCount = uniqueVotes.filter(v => v.votetype === 'for').length;
  const againstCount = uniqueVotes.filter(v => v.votetype === 'against').length;
  const abstainCount = uniqueVotes.filter(v => v.votetype === 'abstain').length;
  
  const meetingInfo = await MeetingRepository.getLastByChamber(proposal.chamber);
  
  const voteQuorum = meetingInfo ? meetingInfo.quorum : 1;
  const totalMembers = meetingInfo ? meetingInfo.totalmembers : 53;
  const registeredCount = meetingInfo ? await MeetingRepository.getRegistrationCount(meetingInfo.id) : 0;
  
  const totalPossible = totalMembers;
  const notVoted = Math.max(0, totalPossible - totalVoted);
  const notVotedRegistered = Math.max(0, registeredCount - totalVoted);

  const voting = await VotingRepository.findByProposalId(proposalId);
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
    resultColor = COLORS.SECONDARY;
    resultEmoji = "❌";
    tagId = FORUM_TAGS.NOT_APPROVED;
  } else if (againstCount > forCount) {
    resultText = "Отклонено";
    resultColor = COLORS.DANGER;
    resultEmoji = "❌";
    tagId = FORUM_TAGS.REJECTED;
  } else if (abstainCount > (forCount + againstCount)) {
    resultText = "Не принято";
    resultColor = COLORS.SECONDARY;
    resultEmoji = "❌";
    tagId = FORUM_TAGS.NOT_APPROVED;
  } else if (isPassed) {
    resultText = "Принято";
    resultColor = COLORS.SUCCESS;
    resultEmoji = "✅";
    tagId = FORUM_TAGS.APPROVED;
  } else {
    resultText = "Не принято";
    resultColor = COLORS.SECONDARY;
    resultEmoji = "❌";
    tagId = FORUM_TAGS.NOT_APPROVED;
  }

  const allVotes = isSecret ? [] : uniqueVotes;
  const listParts = allVotes.map(vote => {
    const emoji = vote.votetype === 'for' ? '✅' : vote.votetype === 'against' ? '❌' : '⚪';
    return `${emoji} <@${vote.userid}>`;
  });
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

  await VotingRepository.end(proposalId, Date.now());
  await ProposalRepository.updateField(proposalId, 'status', resultText);

  const events = proposal.events || [];
  events.push({
    type: 'vote_result',
    result: resultText,
    timestamp: Date.now(),
    chamber: proposal.chamber,
    description: `Голосование в ${CHAMBER_NAMES[proposal.chamber]} завершено. Результат: ${resultText}`
  });
  await ProposalRepository.updateEvents(proposalId, events);
  
  await updateHistoryMessage(proposalId);

  if (voteTimers.has(proposalId)) {
    clearInterval(voteTimers.get(proposalId));
    voteTimers.delete(proposalId);
  }
}

async function finalizeQuantitativeVote(proposalId) {
  const proposal = await ProposalRepository.findById(proposalId);
  if (!proposal) return;

  const voting = await VotingRepository.findByProposalId(proposalId);
  const items = await ProposalRepository.getQuantitativeItems(proposalId);
  
  const votes = await VoteRepository.getVotes(proposalId);
  
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
  
  const totalVoted = voters.size;
  
  const meetingInfo = await MeetingRepository.getLastByChamber(proposal.chamber);
  const voteQuorum = meetingInfo ? meetingInfo.quorum : 1;
  const totalMembers = meetingInfo ? meetingInfo.totalmembers : 53;
  
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
      await VotingRepository.end(proposalId, Date.now());
      await ProposalRepository.updateField(proposalId, 'status', resultText);
      
      const events = proposal.events || [];
      events.push({
        type: 'vote_result',
        result: resultText,
        timestamp: Date.now(),
        chamber: proposal.chamber,
        description: `Рейтинговое голосование в ${CHAMBER_NAMES[proposal.chamber]} завершено. Результат: ${resultText}`
      });
      await ProposalRepository.updateEvents(proposalId, events);
      
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
  const proposal = await ProposalRepository.findById(proposalId);
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

  await VotingRepository.upsert(voting);

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
    await VotingRepository.upsert(voting);

    await startVoteTicker(proposalId);
    
  } catch (e) {
    console.error("❌ Error starting quantitative runoff:", e);
  }
}

async function finalizeQuantitativeRunoff(proposalId) {
  const proposal = await ProposalRepository.findById(proposalId);
  if (!proposal) return;

  const voting = await VotingRepository.findByProposalId(proposalId);
  const items = await ProposalRepository.getQuantitativeItems(proposalId);
  
  const votes = await VoteRepository.getVotes(proposalId, 2);
  
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
  
  const totalVoted = voters.size;
  
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

    await VotingRepository.end(proposalId, Date.now());
    await ProposalRepository.updateField(proposalId, 'status', resultText);
    
    const events = proposal.events || [];
    events.push({
      type: 'vote_result',
      result: resultText,
      timestamp: Date.now(),
      chamber: proposal.chamber,
      description: `Второй тур рейтингового голосования в ${CHAMBER_NAMES[proposal.chamber]} завершено. ${resultText}`
    });
    await ProposalRepository.updateEvents(proposalId, events);
    
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
  }
}

async function showHelp(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const member = interaction.member;
  let description = '';
  
  if (member.roles.cache.has(ROLES.DEPUTY) || member.roles.cache.has(ROLES.DEPUTY_NO_VOTE)) {
    description += `**👥 Для депутатов:**\n`;
    description += `• Используйте команду \
/send\n для внесения законопроекта\n`;
    description += `• Выберите палату и тип голосования\n`;
    description += `• Заполните информацию о законопроекте\n`;
    description += `• Регистрируйтесь для выступлений в обсуждениях\n`;
    description += `• Участвуйте в голосованиях в соответствующих ветках\n`;
    description += `• Следите за ходом рассмотрения в хронологии\n\n`;
  }
  
  if (member.roles.cache.has(ROLES.SENATOR) || member.roles.cache.has(ROLES.SENATOR_NO_VOTE)) {
    description += `**🏛️ Для членов Совета Федерации:**\n`;
    description += `• Используйте команду 
/send\n для внесения законопроекта\n`;
    description += `• Рассматривайте законопроекты, переданные из ГосДумы\n`;
    description += `• Участвуйте в окончательном голосовании\n`;
    description += `• Следите за подписанием Президентом\n\n`;
  }
  
  if (isChamberChairman(member, 'sf') || isChamberChairman(member, 'gd_rublevka') || 
      isChamberChairman(member, 'gd_arbat') || isChamberChairman(member, 'gd_patricki') || 
      isChamberChairman(member, 'gd_tverskoy') || isAdmin(member)) {
    description += `**🎯 Для председателей и администраторов:**\n`;
    description += `• Используйте 
/create_meeting\n для создания заседаний\n`;
    description += `• Начинайте регистрацию с установкой кворума\n`;
    description += `• Запускайте голосования по законопроектам\n`;
    description += `• Управляйте списком выступающих\n`;
    description += `• Одобряйте/возвращайте законопроекты (Правительство)\n`;
    description += `• Подписывайте/отклоняйте законопроекты (Президент)\n`;
    description += `• Используйте 
/res_meeting\n для снятия ролей голосования\n\n`;
  }
  
  description += `**📋 Общие сведения:**\n`;
  description += `• Каждая палата имеет свой канал для обсуждений\n`;
  description += `• Голосования могут быть открытыми или тайными\n`;
  description += `• Поддерживаются разные формулы подсчета голосов\n`;
  description += `• Ведется полная хронология рассмотрения\n`;
  description += `• Автоматическая выдача ролей для голосования\n`;
  
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
  
  const title = interaction.options.getString("title", true);
  const date = interaction.options.getString("date", true);

  const id = nanoid(8);
  const meeting = {
    id,
    title,
    meetingDate: date,
    chamber: chamber,
    channelId: interaction.channelId,
    messageId: null,
    threadId: null,
    createdAt: Date.now(),
    durationMs: 0,
    expiresAt: 0,
    open: 0,
    quorum: 0,
    totalMembers: 0,
    status: 'planned'
  };

  await MeetingRepository.create(meeting);

  try {
    const mentionRoleId = MEETING_MENTION_ROLES[chamber];
    
    const embed = new EmbedBuilder()
      .setTitle(`📅 Заседание: ${title}`)
      .setDescription(`Заседание запланировано на **${date}**`)
      .addFields(
        { name: "🏛️ Палата", value: CHAMBER_NAMES[chamber], inline: true },
        { name: "📅 Дата и время", value: date, inline: true },
        { name: "📋 Статус", value: "Запланировано", inline: true }
      )
      .setColor(COLORS.PRIMARY)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`start_registration_${id}`).setLabel("Начать регистрацию").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancel_meeting_${id}`).setLabel("Отменить").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`postpone_meeting_${id}`).setLabel("Перенести").setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: mentionRoleId ? `<@&${mentionRoleId}>` : null, 
      embeds: [embed], 
      components: [buttons]
    });
    
    const message = await interaction.fetchReply();
    await MeetingRepository.update(id, { messageId: message.id });
  } catch (e) {
    console.error("❌ Error sending meeting message:", e);
    await interaction.editReply({ content: "❌ Ошибка при создании заседания." });
  }
}

async function resetMeetingRoles(interaction) {
  const member = interaction.member;
  if (!isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для этой команды.", flags: 64 });
    return;
  }
  
  await interaction.reply({ content: "🔄 Запуск снятия роли у всех (начинаю)...", flags: 64 });
  
  try {
    const guildMembers = await interaction.guild.members.fetch();
    let count = 0;
    
    for (const [, m] of guildMembers) {
      for (const roleId of Object.values(VOTER_ROLES_BY_CHAMBER)) {
        if (m.roles.cache.has(roleId)) {
          try {
            await m.roles.remove(roleId, "Снято командой /res_meeting");
            count++;
          } catch (e) {
            console.error("❌ Failed to remove role:", m.id, e);
          }
        }
      }
    }
    
    await interaction.followUp({ content: `✅ Роли сняты у ${count} участников.`, flags: 64 });
  } catch (e) {
    console.error("❌ Error in res_meeting:", e);
    await interaction.followUp({ content: "❌ Ошибка при снятии ролей.", flags: 64 });
  }
}

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
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("proj_name").setLabel("Наименование законопроекта").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("proj_party").setLabel("Партия/организация").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("proj_link").setLabel("Ссылка на документ").setStyle(TextInputStyle.Short).setRequired(true))
      );
    } else if (voteType === 'quantitative') {
      modal = new ModalBuilder()
        .setCustomId(`send_modal_${chamber}_quantitative`)
        .setTitle(`Регистрация (рейтинговое голос.)`);
      
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("proj_name").setLabel("Наименование законопроекта").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("proj_party").setLabel("Партия/организация").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("proj_link").setLabel("Ссылка на документ").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("items").setLabel("Пункты (через ;)") .setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder("Пункт 1; Пункт 2; Пункт 3"))
      );
    }
    
    await interaction.showModal(modal);
    return;
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId.startsWith("send_modal_")) {
    await handleProposalModal(interaction);
  } else if (interaction.customId.startsWith("start_vote_modal_")) {
    await handleStartVoteModal(interaction);
  } else if (interaction.customId.startsWith("speaker_modal_")) {
    await handleSpeakerModal(interaction);
  } else if (interaction.customId.startsWith("delete_proposal_modal_")) {
    await handleDeleteProposalModal(interaction);
  } else if (interaction.customId.startsWith("start_registration_modal_")) {
    await handleStartRegistrationModal(interaction);
  } else if (interaction.customId.startsWith("cancel_meeting_modal_")) {
    await handleCancelMeetingModal(interaction);
  } else if (interaction.customId.startsWith("postpone_meeting_modal_")) {
    await handlePostponeMeetingModal(interaction);
  } else if (interaction.customId.startsWith("reject_late_modal_")) {
    await handleRejectLateModal(interaction);
  }
}

async function handleProposalModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  try {
    const customId = interaction.customId;
    const prefix = "send_modal_";
    
    if (!customId.startsWith(prefix)) {
      await interaction.editReply({ content: "❌ Ошибка: неверный формат запроса." });
      return;
    }
    
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
      if (!forumChannel) {
        throw new Error("Channel not found");
      }
    } catch (channelError) {
      console.error("❌ Forum channel access error:", channelError);
      await interaction.editReply({ content: `❌ Ошибка доступа к каналу палаты. Проверьте настройки бота. (ID: ${forumChannelId})` });
      return;
    }

    const name = interaction.fields.getTextInputValue("proj_name");
    const party = interaction.fields.getTextInputValue("proj_party");
    const link = interaction.fields.getTextInputValue("proj_link");

    if (!name || !party || !link) {
      await interaction.editReply({ content: "❌ Все поля обязательны для заполнения." });
      return;
    }

    const number = await ProposalRepository.getNextProposalNumber(chamber);
    const id = nanoid(8);
    
    const initialEvents = [{
      type: 'registration',
      chamber: chamber,
      timestamp: Date.now(),
      description: `Внесение в ${CHAMBER_NAMES[chamber]} (Автор: <@${interaction.user.id}>)`
    }];
    
    const proposal = {
      id, number, name, party, link, chamber,
      status: "На рассмотрении",
      createdAt: Date.now(),
      authorId: interaction.user.id,
      threadId: null,
      channelId: forumChannelId,
      isQuantitative: voteType === 'quantitative',
      events: initialEvents
    };

    await ProposalRepository.create(proposal);

    if (voteType === 'quantitative') {
      const itemsText = interaction.fields.getTextInputValue("items");
      const items = itemsText 
        ? itemsText.split(';').map(item => item.trim()).filter(item => item !== '').slice(0, 5)
        : [];

      for (const [index, itemText] of items.entries()) {
        await ProposalRepository.addQuantitativeItem({
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

    const threadMessage = await forumChannel.threads.create({
      name: `${number} — ${name.substring(0, 50)}${name.length > 50 ? '...' : ''}`,
      appliedTags: [FORUM_TAGS.ON_REVIEW],
      message: {
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`start_vote_${id}`).setLabel("▶️ Начать голосование").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`register_speaker_${id}`).setLabel("🎤 Зарегистрироваться выступить").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`delete_proposal_${id}`).setLabel("🗑️ Удалить/Отозвать").setStyle(ButtonStyle.Danger)
          ),
        ],
      },
    });

    const firstMessage = await threadMessage.fetchStarterMessage();
    await ProposalRepository.updateField(id, 'initialMessageId', firstMessage.id);
    await ProposalRepository.updateField(id, 'threadId', threadMessage.id);
    
    await updateHistoryMessage(id);
    await updateSpeakersMessage(id);
    
    if (voteType === 'quantitative') {
      const items = await ProposalRepository.getQuantitativeItems(id);
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
    
    await interaction.editReply({ 
      content: `✅ Законопроект успешно зарегистрирован: ${threadMessage.url}` 
    });
  } catch (error) {
    console.error("❌ Critical error in handleProposalModal:", error);
    await interaction.editReply({ 
      content: "❌ Критическая ошибка при создании законопроекта. Проверьте настройки бота и права доступа."
    });
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

  const proposal = await ProposalRepository.findById(pid);
  if (!proposal) {
    await interaction.editReply({ content: "❌ Проект не найден." });
    return;
  }

  const existingVoting = await VotingRepository.findByProposalId(pid);
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

  await VotingRepository.upsert(voting);

  try {
    const thread = await client.channels.fetch(proposal.threadid);
    const timeText = ms > 0 ? 
      `🕐 **Начало:** ${formatMoscowTime(Number(voting.startedat))}\n⏰ **Завершение:** ${formatMoscowTime(voting.expiresAt)}` :
      `🕐 **Начало:** ${formatMoscowTime(Number(voting.startedat))}\n⏰ **Завершение:** До ручного завершения`;

    let voteRows = [];
    let controlRow;
    
    if (proposal.isquantitative) {
      const items = await ProposalRepository.getQuantitativeItems(pid);
      let currentRow = new ActionRowBuilder();
      
      items.forEach(item => {
        if (currentRow.components.length >= 3) {
          voteRows.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`vote_item_${item.index}_${pid}`)
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
    await VotingRepository.upsert(voting);

    await disableRegistrationButtonForProposal(pid);

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

async function handleSpeakerModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const pid = interaction.customId.split("speaker_modal_")[1];
  const typeInput = interaction.fields.getTextInputValue("speaker_type");
  
  let speakerType = 'прения';
  let displayName = 'участник прений';
  
  if (typeInput === '1') {
    speakerType = 'доклад';
    displayName = 'докладчик';
  } else if (typeInput === '2') {
    speakerType = 'содоклад';
    displayName = 'содокладчик';
  } else if (typeInput === '3') {
    speakerType = 'прения';
    displayName = 'участник прений';
  }
  
  try {
    const existingSpeakers = await SpeakerRepository.findByProposalId(pid);
    const alreadyRegistered = existingSpeakers.find(s => s.userid === interaction.user.id);
    
    if (alreadyRegistered) {
      await SpeakerRepository.remove(pid, interaction.user.id);
    }
    
    const speaker = {
      proposalId: pid,
      userId: interaction.user.id,
      type: speakerType,
      displayName: displayName,
      registeredAt: Date.now()
    };
    
    await SpeakerRepository.upsert(speaker);
    
    await updateSpeakersMessage(pid);
    
    await interaction.editReply({
      content: `✅ Вы зарегистрированы как **${displayName}** для выступления по этой инициативе.`
    });
  } catch (error) {
    console.error("❌ Error in speaker modal:", error);
    await interaction.editReply({ content: "❌ Ошибка при регистрации выступающего." });
  }
}

async function handleDeleteProposalModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const pid = interaction.customId.split("delete_proposal_modal_")[1];
  const reason = interaction.fields.getTextInputValue("delete_reason");
  
  const proposal = await ProposalRepository.findById(pid);
  if (!proposal) {
    await interaction.editReply({ content: "❌ Законопроект не найден." });
    return;
  }

  const voting = await VotingRepository.findByProposalId(pid);
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
    
    await ProposalRepository.delete(pid);
    
    await interaction.editReply({ content: "✅ Законопроект успешно отозван." });
  } catch (e) {
    console.error("❌ Error deleting proposal:", e);
    await interaction.editReply({ content: "❌ Ошибка при отзыве законопроекта." });
  }
}

async function handleStartRegistrationModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const meetingId = interaction.customId.split("start_registration_modal_")[1];
  const duration = interaction.fields.getTextInputValue("registration_duration");
  const quorum = parseInt(interaction.fields.getTextInputValue("registration_quorum"));
  const totalMembers = parseInt(interaction.fields.getTextInputValue("registration_total_members"));
  
  const meeting = await MeetingRepository.findById(meetingId);
  if (!meeting) {
    await interaction.editReply({ content: "❌ Заседание не найдено." });
    return;
  }

  const ms = parseCustomDuration(duration);
  
  await MeetingRepository.update(meetingId, {
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
      .setLabel("🎫 Получить карточку для голосования")
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

    await MeetingService.startTicker(client, meetingId);
    await interaction.editReply({ content: "✅ Регистрация начата." });
  } catch (e) {
    console.error("❌ Error starting registration:", e);
    await interaction.editReply({ content: "❌ Ошибка при запуске регистрации." });
  }
}

async function handleCancelMeetingModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const meetingId = interaction.customId.split("cancel_meeting_modal_")[1];
  const reason = interaction.fields.getTextInputValue("cancel_reason");
  
  const meeting = await MeetingRepository.findById(meetingId);
  if (!meeting) {
    await interaction.editReply({ content: "❌ Заседание не найдено." });
    return;
  }

  await MeetingRepository.update(meetingId, {
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

async function handlePostponeMeetingModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const meetingId = interaction.customId.split("postpone_meeting_modal_")[1];
  const newDate = interaction.fields.getTextInputValue("postpone_new_date");
  const reason = interaction.fields.getTextInputValue("postpone_reason");
  
  const meeting = await MeetingRepository.findById(meetingId);
  if (!meeting) {
    await interaction.editReply({ content: "❌ Заседание не найдено." });
    return;
  }

  const oldDate = meeting.meetingdate;
  
  await MeetingRepository.update(meetingId, {
    meetingDate: newDate,
    status: 'postponed'
  });

  try {
    const ch = await client.channels.fetch(meeting.channelid);
    const msg = await ch.messages.fetch(meeting.messageid);
    
    const embed = new EmbedBuilder()
      .setTitle(`🔄 Заседание перенесено`)
      .setDescription(`**${meeting.title}**`)
      .addFields(
        { name: "📅 Старая дата", value: oldDate, inline: true },
        { name: "📅 Новая дата", value: newDate, inline: true },
        { name: "👤 Перенес", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📅 Дата переноса", value: formatMoscowTime(Date.now()), inline: true },
        { name: "📋 Причина", value: reason, inline: false }
      )
      .setColor(COLORS.WARNING)
      .setFooter({ text: FOOTER })
      .setTimestamp();
      
    await msg.edit({ embeds: [embed], components: [] });
    await interaction.editReply({ content: "✅ Заседание перенесено." });
  } catch (e) {
    console.error("❌ Error postponing meeting:", e);
    await interaction.editReply({ content: "❌ Ошибка при переносе заседания." });
  }
}

async function handleRejectLateModal(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const parts = interaction.customId.split("_");
  const meetingId = parts[3];
  const userId = parts[4];
  const reason = interaction.fields.getTextInputValue("reject_reason");
  
  const meeting = await MeetingRepository.findById(meetingId);
  if (!meeting) {
    await interaction.editReply({ content: "❌ Заседание не найдено." });
    return;
  }

  try {
    await interaction.message.edit({ components: [] });

    await interaction.editReply({
      content: `❌ Регистрация пользователя <@${userId}> отклонена.`
    });

    const rejectEmbed = new EmbedBuilder()
      .setTitle(`❌ Регистрация отклонена`)
      .setDescription(`Поздняя регистрация пользователя <@${userId}> на заседание "${meeting.title}" была отклонена.`) 
      .addFields(
        { name: "👤 Отклонил", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📅 Время", value: formatMoscowTime(Date.now()), inline: true },
        { name: "📋 Причина отказа", value: reason, inline: false }
      )
      .setColor(COLORS.DANGER)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    await interaction.followUp({ embeds: [rejectEmbed] });

  } catch (e) {
    console.error("❌ Error rejecting late registration:", e);
    await interaction.editReply({ content: "❌ Ошибка при отклонении поздней регистрации." });
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

    if (cid.startsWith("late_registration_")) {
      await handleLateRegistrationButton(interaction);
      return;
    }

    if (cid.startsWith("approve_late_")) {
      await handleApproveLateButton(interaction);
      return;
    }

    if (cid.startsWith("reject_late_")) {
      await handleRejectLateButton(interaction);
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

    if (cid.startsWith("postpone_meeting_")) {
      await handlePostponeMeetingButton(interaction);
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

    if (cid.startsWith("register_speaker_")) {
      await handleRegisterSpeakerButton(interaction);
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
        await interaction.editReply({
          content: "❌ Произошла ошибка при обработке действия."
        });
      } else {
        await interaction.reply({
          content: "❌ Произошла ошибка при обработке действия.", 
          flags: 64 
        });
      }
    } catch (replyError) {
      console.error("❌ Error sending error reply:", replyError);
    }
  }
}

async function handleGetCardButton(interaction) {
  if (interaction.replied || interaction.deferred) return;
  
  const meetingId = interaction.customId.split("get_card_")[1];
  const meeting = await MeetingRepository.findById(meetingId);
  
  if (!meeting || !meeting.open) {
    await safeReply(interaction, "❌ Регистрация закрыта.");
    return;
  }
  
  try {
    if (!await MeetingRepository.isUserRegistered(meetingId, interaction.user.id)) {
      await MeetingRepository.registerUser(meetingId, interaction.user.id);
    }
    
    await safeReply(interaction, "✅ Вы зарегистрированы! Роль для голосования будет выдана после завершения регистрации, если будет собран кворум.");
  } catch (error) {
    console.error("❌ Error in get card button:", error);
    await safeReply(interaction, "❌ Ошибка при регистрации.");
  }
}

async function handleClearRolesButton(interaction) {
  const meetingId = interaction.customId.split("clear_roles_")[1];
  const meeting = await MeetingRepository.findById(meetingId);
  
  if (!meeting) {
    await safeReply(interaction, "❌ Заседание не найдено.");
    return;
  }
  
  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await safeReply(interaction, "❌ У вас нет прав для очистки ролей.");
    return;
  }
  
  await interaction.deferReply({ flags: 64 });
  
  try {
    const voterRoleId = VOTER_ROLES_BY_CHAMBER[meeting.chamber];
    const guildMembers = await interaction.guild.members.fetch();
    let count = 0;
    
    for (const [, m] of guildMembers) {
      if (m.roles.cache.has(voterRoleId)) {
        try {
          await m.roles.remove(voterRoleId, `Очистка ролей после заседания ${meeting.title}`);
          count++;
        } catch (e) {
          console.error("❌ Failed to remove role:", m.id, e);
        }
      }
    }
    
    await interaction.message.edit({ components: [] });
    
    if (meeting.threadid) {
      try {
        const thread = await client.channels.fetch(meeting.threadid);
        const embed = new EmbedBuilder()
          .setTitle(`🏁 Заседание завершено`)
          .setDescription(`**${meeting.title}**`)
          .addFields(
            { name: "📅 Дата заседания", value: meeting.meetingdate, inline: true },
            { name: "👤 Завершил", value: `<@${interaction.user.id}>`, inline: true },
            { name: "🕐 Время завершения", value: formatMoscowTime(Date.now()), inline: true },
            { name: "🎫 Карточки регистрации изъяты", value: `У ${count} участников`, inline: false }
          )
          .setColor(COLORS.SUCCESS)
          .setFooter({ text: FOOTER })
          .setTimestamp();
        
        await thread.send({ embeds: [embed] });
        
        setTimeout(async () => {
          try {
            await thread.setArchived(true, 'Заседание завершено');
          } catch (e) {
            console.error("❌ Error archiving thread:", e);
          }
        }, 30000);
        
        await interaction.editReply({
          content: `✅ Сообщение о завершении заседания отправлено в ветку. Карточки регистрации изъяты у ${count} участников.`
        });
        
      } catch (threadError) {
        console.error("❌ Error sending message to thread:", threadError);
        await interaction.editReply({
          content: `✅ Роли очищены у ${count} участников. (Ошибка отправки в ветку)`
        });
      }
    } else {
      const ch = await client.channels.fetch(meeting.channelid);
      const embed = new EmbedBuilder()
        .setTitle(`🏁 Заседание завершено`)
        .setDescription(`**${meeting.title}**`)
        .addFields(
          { name: "📅 Дата заседания", value: meeting.meetingdate, inline: true },
          { name: "👤 Завершил", value: `<@${interaction.user.id}>`, inline: true },
          { name: "🕐 Время завершения", value: formatMoscowTime(Date.now()), inline: true },
          { name: "🎫 Карточки регистрации изъяты", value: `У ${count} участников`, inline: false }
        )
        .setColor(COLORS.SUCCESS)
        .setFooter({ text: FOOTER })
        .setTimestamp();
      
      await ch.send({ embeds: [embed] });
      
      await interaction.editReply({
        content: `✅ Сообщение о завершении заседания отправлено. Карточки регистрации изъяты у ${count} участников.`
      });
    }
    
  } catch (e) {
    console.error("❌ Error clearing roles:", e);
    await interaction.editReply({ content: "❌ Ошибка при очистке ролей." });
  }
}

async function handleLateRegistrationButton(interaction) {
  const meetingId = interaction.customId.split("late_registration_")[1];
  const meeting = await MeetingRepository.findById(meetingId);
  
  if (!meeting) {
    await safeReply(interaction, "❌ Заседание не найдено.");
    return;
  }

  if (meeting.open) {
    await safeReply(interaction, "❌ Регистрация еще не завершена. Дождитесь окончания.");
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    let thread;
    
    if (interaction.message.thread) {
      thread = interaction.message.thread;
    } else {
      try {
        thread = await interaction.message.startThread({
          name: `📝 Поздняя регистрация - ${interaction.user.displayName}`,
          autoArchiveDuration: 1440,
          reason: `Поздняя регистрация на заседание: ${meeting.title}`
        });
      } catch (error) {
        if (error.code === 'MessageExistingThread') {
          thread = interaction.message.thread;
        } else {
          throw error;
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`⏰ Запрос на позднюю регистрацию`)
      .setDescription(`Пользователь <@${interaction.user.id}> хочет зарегистрироваться на заседание "${meeting.title}" после окончания срока регистрации.`) 
      .addFields(
        { name: "👤 Пользователь", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📅 Заседание", value: meeting.title, inline: true },
        { name: "🕐 Время запроса", value: formatMoscowTime(Date.now()), inline: true }
      )
      .setColor(COLORS.WARNING)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_late_${meetingId}_${interaction.user.id}`)
        .setLabel("✅ Зарегистрировать")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_late_${meetingId}_${interaction.user.id}`)
        .setLabel("❌ Отказать")
        .setStyle(ButtonStyle.Danger)
    );

    await thread.send({ 
      embeds: [embed], 
      components: [buttons] 
    });

    await interaction.editReply({
      content: `✅ Запрос на позднюю регистрацию отправлен. Обсуждение создано в ветке: ${thread}`
    });

  } catch (e) {
    console.error("❌ Error creating late registration thread:", e);
    await interaction.editReply({ content: "❌ Ошибка при создании запроса на позднюю регистрацию." });
  }
}

async function handleApproveLateButton(interaction) {
  const parts = interaction.customId.split("_");
  const meetingId = parts[2];
  const userId = parts[3];
  
  const meeting = await MeetingRepository.findById(meetingId);
  if (!meeting) {
    await interaction.reply({ content: "❌ Заседание не найдено.", flags: 64 });
    return;
  }

  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для одобрения поздней регистрации.", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    if (!await MeetingRepository.isUserRegistered(meetingId, userId)) {
      await MeetingRepository.registerUser(meetingId, userId);
    }

    const voterRoleId = VOTER_ROLES_BY_CHAMBER[meeting.chamber];
    const guildMember = await interaction.guild.members.fetch(userId);
    await guildMember.roles.add(voterRoleId, `Поздняя регистрация для заседания ${meeting.title}`);

    const ch = await client.channels.fetch(meeting.channelid);
    const meetingMsg = await ch.messages.fetch(meeting.messageid);
    
    const registered = await MeetingRepository.getRegistrations(meetingId);
    const registeredCount = registered.length;
    const quorum = meeting.quorum || 1;
    
    let listText;
    if (registeredCount) {
      const registrationPromises = registered.map(async (r) => {
        const time = await MeetingRepository.getRegistrationTime(meetingId, r.userid);
        return `<@${r.userid}> (${formatMoscowTime(time)})`;
      });
      
      const registrationLines = await Promise.all(registrationPromises);
      listText = registrationLines.join("\n");
    } else {
      listText = "Никто не зарегистрирован";
    }

    const embed = new EmbedBuilder()
      .setTitle(`📋 Регистрация завершена`)
      .setDescription(`**${meeting.title}**`)
      .addFields(
        { name: "👥 Количество зарегистрированных", value: String(registeredCount), inline: true },
        { name: "📊 Требуемый кворум", value: String(quorum), inline: true },
        { name: "📈 Статус кворума", value: registeredCount >= quorum ? "✅ Собран" : "❌ Не собран", inline: true },
        { name: "👥 Общее количество членов", value: String(meeting.totalmembers), inline: true },
        { name: "⏱️ Время регистрации", value: formatTimeLeft(meeting.durationms), inline: true },
        { name: "🕐 Начало регистрации", value: formatMoscowTime(Number(meeting.createdat)), inline: false },
        { name: "📝 Список зарегистрированных", value: listText, inline: false }
      )
      .setColor(registeredCount >= quorum ? COLORS.SUCCESS : COLORS.DANGER)
      .setFooter({ text: FOOTER })
      .setTimestamp();

    await meetingMsg.edit({ embeds: [embed] });

    await interaction.message.edit({ components: [] });

    await interaction.editReply({
      content: `✅ Пользователь <@${userId}> успешно зарегистрирован и получил роль для голосования.`
    });

    await interaction.followUp({
      content: `✅ <@${userId}> был зарегистрирован на заседание "${meeting.title}" с выдачей роли для голосования.`
    });

  } catch (e) {
    console.error("❌ Error approving late registration:", e);
    await interaction.editReply({ content: "❌ Ошибка при одобрении поздней регистрации." });
  }
}

async function handleRejectLateButton(interaction) {
  const parts = interaction.customId.split("_");
  const meetingId = parts[2];
  const userId = parts[3];
  
  const meeting = await MeetingRepository.findById(meetingId);
  if (!meeting) {
    await interaction.reply({ content: "❌ Заседание не найдено.", flags: 64 });
    return;
  }

  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для отклонения поздней регистрации.", flags: 64 });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`reject_late_modal_${meetingId}_${userId}`)
    .setTitle("Причина отказа в регистрации");
    
  const reasonInput = new TextInputBuilder()
    .setCustomId("reject_reason")
    .setLabel("Укажите причину отказа")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Опишите причину, по которой регистрация была отклонена...");
    
  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

async function handleStartRegistrationButton(interaction) {
  const meetingId = interaction.customId.split("start_registration_")[1];
  const meeting = await MeetingRepository.findById(meetingId);
  
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

async function handleCancelMeetingButton(interaction) {
  const meetingId = interaction.customId.split("cancel_meeting_")[1];
  const meeting = await MeetingRepository.findById(meetingId);
  
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

async function handlePostponeMeetingButton(interaction) {
  const meetingId = interaction.customId.split("postpone_meeting_")[1];
  const meeting = await MeetingRepository.findById(meetingId);
  
  if (!meeting) {
    await interaction.reply({ content: "❌ Заседание не найдено.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  if (!isChamberChairman(member, meeting.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав для переноса заседания.", flags: 64 });
    return;
  }
  
  const modal = new ModalBuilder()
    .setCustomId(`postpone_meeting_modal_${meetingId}`)
    .setTitle("Перенос заседания");
    
  const newDateInput = new TextInputBuilder()
    .setCustomId("postpone_new_date")
    .setLabel("Новая дата и время")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("Например: 15.12.2024 14:00");
    
  const reasonInput = new TextInputBuilder()
    .setCustomId("postpone_reason")
    .setLabel("Причина переноса")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder("Опишите причину переноса заседания");
    
  modal.addComponents(
    new ActionRowBuilder().addComponents(newDateInput),
    new ActionRowBuilder().addComponents(reasonInput)
  );
  await interaction.showModal(modal);
}

async function handleStartVoteButton(interaction) {
  const pid = interaction.customId.split("start_vote_")[1];
  const proposal = await ProposalRepository.findById(pid);
  
  if (!proposal) {
    await interaction.reply({ content: "❌ Законопроект не найден.", flags: 64 });
    return;
  }
  
  const member = interaction.member;
  
  if (!isChamberChairman(member, proposal.chamber) && !isAdmin(member)) {
    await interaction.reply({ content: "❌ У вас нет прав запускать голосование в этой палате.", flags: 64 });
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

async function handleEndVoteButton(interaction) {
  const pid = interaction.customId.split("end_vote_")[1];
  const proposal = await ProposalRepository.findById(pid);
  
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

async function handleRegisterSpeakerButton(interaction) {
  const pid = interaction.customId.split("register_speaker_")[1];
  
  const modal = new ModalBuilder()
    .setCustomId(`speaker_modal_${pid}`)
    .setTitle("Тип выступления");
    
  const typeInput = new TextInputBuilder()
    .setCustomId("speaker_type")
    .setLabel("Введите 1, 2 или 3")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder("1 - доклад, 2 - содоклад, 3 - прения")
    .setMaxLength(1);
    
  modal.addComponents(new ActionRowBuilder().addComponents(typeInput));
  await interaction.showModal(modal);
}

async function handleDeleteProposalButton(interaction) {
  const pid = interaction.customId.split("delete_proposal_")[1];
  const proposal = await ProposalRepository.findById(pid);
  
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
  
  const voting = await VotingRepository.findByProposalId(pid);
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

async function handleGovernmentButtons(interaction) {
  await interaction.deferReply({ flags: 64 });
  
  const pid = interaction.customId.split("_").slice(2).join("_");
  const action = interaction.customId.startsWith("gov_approve_") ? 'approve' : 'return';
  
  const proposal = await ProposalRepository.findById(pid);
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
    const newNumber = await ProposalRepository.getNextProposalNumber('sf');
    const newId = nanoid(8);
    
    const events = proposal.events || [];
    events.push({
      type: 'government_approval',
      timestamp: Date.now(),
      description: `Одобрен Председателем Правительства (<@${interaction.user.id}>)`
    });
    await ProposalRepository.updateEvents(pid, events);
    await ProposalRepository.updateField(pid, 'status', 'Одобрен Правительством');
    
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
    
    await ProposalRepository.create(newProposal);
    
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

      const threadMessage = await forum.threads.create({
        name: `${newNumber} — ${proposal.name.substring(0, 50)}${proposal.name.length > 50 ? '...' : ''}`,
        appliedTags: [FORUM_TAGS.ON_REVIEW],
        message: {
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`start_vote_${newId}`).setLabel("▶️ Начать голосование").setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`register_speaker_${newId}`).setLabel("🎤 Зарегистрироваться выступить").setStyle(ButtonStyle.Primary)
            ),
          ],
        },
      });
      
      const firstMessage = await threadMessage.fetchStarterMessage();
      await ProposalRepository.updateField(newId, 'initialMessageId', firstMessage.id);
      await ProposalRepository.updateField(newId, 'threadId', threadMessage.id);
      
      await updateHistoryMessage(newId);
      await updateSpeakersMessage(newId);
      
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
    await ProposalRepository.updateEvents(pid, events);
    await ProposalRepository.updateField(pid, 'status', 'Возвращен Правительством');
    
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
  
  const proposal = await ProposalRepository.findById(pid);
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
    await ProposalRepository.updateEvents(pid, events);
    await ProposalRepository.updateField(pid, 'status', 'Подписан');
    
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
    await ProposalRepository.updateEvents(pid, events);
    await ProposalRepository.updateField(pid, 'status', 'Отклонен Президентом');
    
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

async function handleRegularVoteButtons(interaction) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ flags: 64 });
  }
  
  const parts = interaction.customId.split("_");
  const voteType = parts[1];
  const proposalId = parts.slice(2).join("_");
  
  try {
    const proposal = await ProposalRepository.findById(proposalId);
    if (!proposal) {
      await interaction.editReply({ content: "❌ Законопроект не найден." });
      return;
    }
    
    const voterRoleId = VOTER_ROLES_BY_CHAMBER[proposal.chamber];
    if (!interaction.member.roles.cache.has(voterRoleId)) {
      await interaction.editReply({ content: "❌ У вас нет роли для голосования в этой палате." });
      return;
    }
    
    const voting = await VotingRepository.findByProposalId(proposalId);
    if (!voting?.open) {
      await interaction.editReply({ content: "❌ Голосование не активно или завершено." });
      return;
    }
    
    const vote = {
      proposalId: proposalId,
      userId: interaction.user.id,
      voteType: voteType,
      createdAt: Date.now(),
      stage: voting.stage || 1
    };
    
    await VoteRepository.upsert(vote);
    await interaction.editReply({
      content: `✅ Ваш голос "${getVoteTypeText(voteType)}" учтен!`
    });
    
  } catch (error) {
    console.error("❌ Error in regular vote button:", error);
    try {
      await interaction.editReply({ content: "❌ Ошибка при обработке голоса." });
    } catch (e) {}
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
    const proposal = await ProposalRepository.findById(proposalId);
    if (!proposal) {
      await interaction.editReply({ content: "❌ Законопроект не найден." });
      return;
    }
    
    const voterRoleId = VOTER_ROLES_BY_CHAMBER[proposal.chamber];
    if (!interaction.member.roles.cache.has(voterRoleId)) {
      await interaction.editReply({ content: "❌ У вас нет роли для голосования в этой палате." });
      return;
    }
    
    const voting = await VotingRepository.findByProposalId(proposalId);
    if (!voting?.open) {
      await interaction.editReply({ content: "❌ Голосование не активно или завершено." });
      return;
    }
    
    if (!proposal.isquantitative) {
      await interaction.editReply({ content: "❌ Это не количественное голосование." });
      return;
    }
    
    const vote = {
      proposalId: proposalId,
      userId: interaction.user.id,
      voteType: `item_${itemIndex}`,
      createdAt: Date.now(),
      stage: voting.stage || 1
    };
    
    await VoteRepository.upsert(vote);
    await interaction.editReply({
      content: `✅ Ваш голос за пункт ${itemIndex} учтен!`
    });
    
  } catch (error) {
    console.error("❌ Error in quantitative vote button:", error);
    try {
      await interaction.editReply({ content: "❌ Ошибка при обработке голоса." });
    } catch (e) {}
  }
}

async function handleQuantitativeAbstainButton(interaction) {
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ flags: 64 });
  }
  
  const proposalId = interaction.customId.split("vote_abstain_")[1];
  
  try {
    const proposal = await ProposalRepository.findById(proposalId);
    if (!proposal) {
      await interaction.editReply({ content: "❌ Законопроект не найден." });
      return;
    }
    
    const voterRoleId = VOTER_ROLES_BY_CHAMBER[proposal.chamber];
    if (!interaction.member.roles.cache.has(voterRoleId)) {
      await interaction.editReply({ content: "❌ У вас нет роли для голосования в этой палате." });
      return;
    }
    
    const voting = await VotingRepository.findByProposalId(proposalId);
    if (!voting?.open) {
      await interaction.editReply({ content: "❌ Голосование не активно или завершено." });
      return;
    }
    
    if (!proposal.isquantitative) {
      await interaction.editReply({ content: "❌ Ошибка голосования (неверный тип)." });
      return;
    }
    
    const vote = {
      proposalId: proposalId,
      userId: interaction.user.id,
      voteType: 'abstain',
      createdAt: Date.now(),
      stage: voting.stage || 1
    };
    
    await VoteRepository.upsert(vote);
    await interaction.editReply({
      content: `✅ Ваш голос (воздержались) учтен!`
    });
    
  } catch (error) {
    console.error("❌ Error in quantitative abstain button:", error);
    try {
      await interaction.editReply({ content: "❌ Ошибка при обработке голоса." });
    } catch (e) {}
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

async function restoreAllTimers() {
  try {
    const restoredMeetings = await MeetingService.restoreAll(client);
    
    const openVotings = await VotingRepository.getOpenVotings();
    for (const voting of openVotings) {
      startVoteTicker(voting.proposalid).catch(console.error);
    }
    
    console.log(`✅ Restored ${restoredMeetings} meetings and ${openVotings.length} votes`);
  } catch (error) {
    console.error("❌ Error restoring timers:", error);
  }
}

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

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

client.login(TOKEN).catch((e) => {
  console.error("❌ Login error:", e);
  process.exit(1);
});
