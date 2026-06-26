const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const sondages = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName('sondage')
    .setDescription('Crée un sondage pour organiser une soirée gaming')
    .addStringOption(opt =>
      opt.setName('titre')
         .setDescription('Question du sondage (ex: Du monde joue ce soir ?)')
         .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('joueurs')
         .setDescription('Nombre maximum de joueurs (ex: 5)')
         .setRequired(true)
         .setMinValue(1)
         .setMaxValue(50))
    .toJSON()
];

client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commande /sondage enregistrée globalement');
  } catch (err) {
    console.error('Erreur enregistrement commandes:', err);
  }
});

function buildSondage(data) {
  const { titre, max, participants, refus, attente } = data;

  const listeParticipants = participants.length
    ? participants.map((u, i) => `\`${i + 1}.\` ${u}`).join('\n')
    : '*Personne pour l\'instant…*';

  const listeRefus = refus.length
    ? refus.map(u => `${u}`).join('\n')
    : '*—*';

  const listeAttente = attente.length
    ? attente.map((u, i) => `\`${i + 1}.\` ${u}`).join('\n')
    : '*—*';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎮 ${titre}`)
    .setDescription(`Places disponibles : **${participants.length}/${max}**`)
    .addFields(
      { name: `✅  Participants  (${participants.length}/${max})`, value: listeParticipants, inline: false },
      { name: `❌  Indisponibles  (${refus.length})`, value: listeRefus, inline: true },
      { name: `⏳  Liste d'attente  (${attente.length})`, value: listeAttente, inline: true }
    )
    .setFooter({ text: 'Clique sur un bouton pour répondre • Tu peux changer d\'avis' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sondage_participer')
      .setLabel('Je joue !')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId('sondage_refuser')
      .setLabel('Pas dispo')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
    new ButtonBuilder()
      .setCustomId('sondage_attente')
      .setLabel('Si place dispo')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏳')
  );

  return { embeds: [embed], components: [row] };
}

function retirerUser(data, userId) {
  data.participants = data.participants.filter(u => u !== userId);
  data.refus        = data.refus.filter(u => u !== userId);
  data.attente      = data.attente.filter(u => u !== userId);
}

function promouvoir(data) {
  if (data.participants.length < data.max && data.attente.length > 0) {
    const promu = data.attente.shift();
    data.participants.push(promu);
  }
}

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'sondage') {
    const titre = interaction.options.getString('titre');
    const max   = interaction.options.getInteger('joueurs');
    const data = { titre, max, participants: [], refus: [], attente: [] };
    const msg = await interaction.reply({ ...buildSondage(data), fetchReply: true });
    sondages.set(msg.id, data);
    return;
  }

  if (!interaction.isButton()) return;

  const data = sondages.get(interaction.message.id);
  if (!data) {
    return interaction.reply({ content: '❌ Sondage introuvable (bot redémarré ?)', ephemeral: true });
  }

  const userId = `<@${interaction.user.id}>`;
  const action = interaction.customId;

  retirerUser(data, userId);

  if (action === 'sondage_participer') {
    if (data.participants.length < data.max) {
      data.participants.push(userId);
      await interaction.reply({ content: `✅ **${interaction.user.username}** — tu es inscrit(e) à la soirée !`, ephemeral: true });
    } else {
      data.attente.push(userId);
      await interaction.reply({ content: `⏳ **${interaction.user.username}** — plus de place ! Tu es en liste d'attente (position ${data.attente.length}).`, ephemeral: true });
    }
  } else if (action === 'sondage_refuser') {
    data.refus.push(userId);
    promouvoir(data);
    await interaction.reply({ content: `❌ **${interaction.user.username}** — absence enregistrée.`, ephemeral: true });
  } else if (action === 'sondage_attente') {
    if (data.participants.length < data.max) {
      data.participants.push(userId);
      await interaction.reply({ content: `✅ **${interaction.user.username}** — il reste de la place, tu es directement inscrit(e) !`, ephemeral: true });
    } else {
      data.attente.push(userId);
      await interaction.reply({ content: `⏳ **${interaction.user.username}** — placé(e) en liste d'attente (position ${data.attente.length}).`, ephemeral: true });
    }
  }

  await interaction.message.edit(buildSondage(data));
});

client.login(TOKEN);