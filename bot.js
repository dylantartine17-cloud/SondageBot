const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const sondages = new Map();
const roues = new Map();

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
    .toJSON(),
  new SlashCommandBuilder()
    .setName('roue')
    .setDescription('Tire au sort un joueur parmi une liste')
    .addUserOption(opt => opt.setName('joueur1').setDescription('Joueur 1').setRequired(true))
    .addUserOption(opt => opt.setName('joueur2').setDescription('Joueur 2').setRequired(true))
    .addUserOption(opt => opt.setName('joueur3').setDescription('Joueur 3').setRequired(false))
    .addUserOption(opt => opt.setName('joueur4').setDescription('Joueur 4').setRequired(false))
    .addUserOption(opt => opt.setName('joueur5').setDescription('Joueur 5').setRequired(false))
    .toJSON()
];

client.once('clientReady', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commandes enregistrées globalement');
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

function getMessageRoue(gagnant) {
  const messages = [
   `🔪 **${gagnant} est désigné(e) !** 🔪\n\n*L'Entité a parlé... bonne chance pour survivre !*`,
   `😈 **${gagnant} sera le Killer !** 😈\n\n*Montre leur qui est le vrai monstre dans cette partie !*`,
   `💀 **L'Entité désigne ${gagnant} !** 💀\n\n*Personne ne sort vivant du Royaume de l'Entité !*` ,
   `👁️ **L'œil de l'Entité choisit ${gagnant} !** 👁️\n\n*Tu ne peux pas échapper à ton destin !*`,
   `🔪 **${gagnant} joue le Tueur ce soir !** 🔪\n\n*L'Entité t'a choisi... les survivants ne savent pas encore ce qui les attend !*`,
   `😤 **${gagnant} est le Killer !** 😤\n\n*4K ou rien, l'honneur du Killer est en jeu !*`,
   `🩸 **${gagnant} part en Tueur !** 🩸\n\n*Tunnelle, campe, slug... fais ce qu'il faut !*`,
   `🎯 **${gagnant} est choisi(e) !** 🎯\n\n*Ce soir tu es le prédateur, eux sont ta proie !*`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function buildRoueButtons(msgId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`roue_relancer_${msgId}`)
      .setLabel('🔄 Relancer')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`roue_annuler_${msgId}`)
      .setLabel('❌ Annuler')
      .setStyle(ButtonStyle.Danger)
  );
}

client.on('interactionCreate', async interaction => {

  // ── /sondage ───────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === 'sondage') {
    const titre = interaction.options.getString('titre');
    const max   = interaction.options.getInteger('joueurs');
    const data = { titre, max, participants: [], refus: [], attente: [] };
    const sondageData = buildSondage(data);
    sondageData.content = '@everyone 🎮 Un nouveau sondage vient d\'être créé !';
    const msg = await interaction.reply({ ...sondageData, fetchReply: true });
    sondages.set(msg.id, data);
    return;
  }

  // ── /roue ──────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === 'roue') {
    const joueurs = [];
    for (let i = 1; i <= 5; i++) {
      const user = interaction.options.getUser(`joueur${i}`);
      if (user) joueurs.push(`<@${user.id}>`);
    }

    if (joueurs.length < 2) {
      return interaction.reply({ content: '❌ Il faut au moins 2 joueurs !', ephemeral: true });
    }

 const msg = await interaction.reply({ content: '🎰 La roue tourne...', fetchReply: true });
const msgId = msg.id;
roues.set(msgId, { joueurs });

await new Promise(r => setTimeout(r, 1500));
await interaction.editReply({ content: '🎰 La roue tourne... ⚡' });
await new Promise(r => setTimeout(r, 1500));

const gagnant = joueurs[Math.floor(Math.random() * joueurs.length)];

await interaction.editReply({
  content: getMessageRoue(gagnant),
  components: [buildRoueButtons(msgId)]
});

    // Après 5 minutes → remplace le message
    setTimeout(async () => {
      try {
        if (roues.has(msgId)) {
          await interaction.editReply({
            content: '⏰ **Le tirage a expiré !** Que faire ?',
            components: [buildRoueButtons(msgId)]
          });
        }
      } catch (err) {}
    }, 5 * 60 * 1000);

    return;
  }

  // ── Boutons roue ───────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('roue_')) {
    const membre = interaction.member;
    if (!membre.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Seul un administrateur peut utiliser ces boutons !', ephemeral: true });
    }

    const parts = interaction.customId.split('_');
    const action = parts[1];
    const msgId = parts[2];
    const data = roues.get(msgId);

    if (!data) {
      return interaction.reply({ content: '❌ Session expirée, relance une nouvelle /roue !', ephemeral: true });
    }

    if (action === 'annuler') {
      roues.delete(msgId);
      await interaction.update({ content: '❌ **Tirage annulé.**', components: [] });
      setTimeout(async () => {
        try { await interaction.deleteReply(); } catch (err) {}
      }, 5000);
      return;
    }

    if (action === 'relancer') {
      await interaction.update({ content: '🎰 La roue tourne...', components: [] });
      await new Promise(r => setTimeout(r, 1500));
      await interaction.editReply({ content: '🎰 La roue tourne... ⚡' });
      await new Promise(r => setTimeout(r, 1500));

      const gagnant = data.joueurs[Math.floor(Math.random() * data.joueurs.length)];

      await interaction.editReply({
        content: getMessageRoue(gagnant),
        components: [buildRoueButtons(msgId)]
      });

      // Remet le timer de 5 minutes
      setTimeout(async () => {
        try {
          if (roues.has(msgId)) {
            await interaction.editReply({
              content: '⏰ **Le tirage a expiré !** Que faire ?',
              components: [buildRoueButtons(msgId)]
            });
          }
        } catch (err) {}
      }, 5 * 60 * 1000);

      return;
    }
  }

  // ── Boutons sondage ────────────────────────────────────────
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

  try {
    await interaction.message.edit(buildSondage(data));
  } catch (err) {
    console.error('Erreur mise à jour:', err);
  }
});

client.login(TOKEN);
