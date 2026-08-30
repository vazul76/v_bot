const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class IdGrupCommand {
    constructor() {
        this.commands = [
            { name: 'idgrup', method: 'execute', description: 'Lihat daftar ID grup yang diikuti bot' }
        ];
    }

    async execute(msg, sock) {
        try {
            logger.info('Executing /idgrup command');
            await helpers.reactCommandReceived(sock, msg);
            await helpers.reactProcessing(sock, msg);

            const groups = await sock.groupFetchAllParticipating();
            const groupList = Object.values(groups || {});

            if (groupList.length === 0) {
                await helpers.reactSuccess(sock, msg);
                return helpers.replyWithTyping(sock, msg, 'Bot tidak berada di grup manapun.');
            }

            const lines = ['*DAFTAR ID GRUP BOT*', ''];

            groupList
                .sort((a, b) => (a.subject || '').localeCompare(b.subject || '', 'id'))
                .forEach((group, index) => {
                    const groupName = group.subject || 'Tanpa Nama';
                    lines.push(`${index + 1}. *Nama Grup : ${groupName}*`);
                    lines.push(`ID Grup : ${group.id}`);
                    lines.push('');
                });

            await helpers.reactSuccess(sock, msg);
            return helpers.replyWithTyping(sock, msg, lines.join('\n'));
        } catch (error) {
            logger.error('Error in idgrup command:', error.message);
            await helpers.reactError(sock, msg);
            return helpers.replyWithTyping(sock, msg, '❌ Gagal mengambil daftar ID grup!\n\nError: ' + error.message);
        }
    }
}

module.exports = new IdGrupCommand();
