const isAdministrator =
  interaction.memberPermissions?.has(
    PermissionsBitField.Flags.Administrator
  ) ||
  interaction.member?.permissions?.has(
    PermissionsBitField.Flags.Administrator
  );

if (!isAdministrator) {
  return interaction.reply({
    content:
      '❌ You need **Administrator** permission to force close tickets.',
    ephemeral: true,
  });
}
