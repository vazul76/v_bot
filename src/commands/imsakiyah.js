const axios = require('axios');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class ImsakiyahCommand {
    constructor() {
        this.commands = [
            { name: 'imsakiyah', method: 'execute', description: 'Jadwal Imsakiyah Ramadan' },
        ];
    }

    async execute(msg, sock, messageBody) {
        try {
            logger.info('Processing /imsakiyah command');
            await helpers.reactCommandReceived(sock, msg);

            // Default location: D.I. Yogyakarta - Kab. Sleman
            const provinsi = 'D.I. Yogyakarta';
            const kabkota = 'Kab. Sleman';

            // Fetch imsakiyah schedule from equran.id API
            const response = await axios.post(
                'https://equran.id/api/v2/imsakiyah',
                { provinsi, kabkota },
                { timeout: 10000 }
            );

            if (response.data.code !== 200) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Gagal mengambil data jadwal imsakiyah.');
            }

            const data = response.data.data;
            const imsakiyah = data.imsakiyah;

            // Calculate current Ramadan day
            const ramadhanStart = new Date(2026, 1, 19); // Feb 19, 2026 = Ramadan 1
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            ramadhanStart.setHours(0, 0, 0, 0);

            const daysDiff = Math.floor((today - ramadhanStart) / (1000 * 60 * 60 * 24));
            const currentRamadhanDay = daysDiff + 1; // +1 because Ramadan 1 is day 1

            // Validate if we're in Ramadan period (day 1-30)
            if (currentRamadhanDay < 1 || currentRamadhanDay > 30) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, 
                    `⚠️ Hari ini bukan periode Ramadan.\n` +
                    `📅 Ramadan 1447H dimulai: 19 Februari 2026`);
            }

            // Get current day's schedule
            const todaySchedule = imsakiyah.find(day => day.tanggal === currentRamadhanDay);

            if (!todaySchedule) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Data jadwal tidak ditemukan.');
            }

            // Format the response
            let text = `*JADWAL IMSAKIYAH RAMADAN ${data.hijriah}H / ${data.masehi}M*\n`;
            text += `${data.provinsi} - ${data.kabkota}\n`;
            text += `Hari Ini: Ramadhan ${currentRamadhanDay} (${today.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})\n`;
            text += `${'='.repeat(50)}\n\n`;

            text += `Imsak    : ${todaySchedule.imsak}\n`;
            text += `Subuh    : ${todaySchedule.subuh}\n`;
            text += `Terbit    : ${todaySchedule.terbit}\n`;
            text += `Dhuha    : ${todaySchedule.dhuha}\n`;
            text += `Dzuhur   : ${todaySchedule.dzuhur}\n`;
            text += `Ashar    : ${todaySchedule.ashar}\n`;
            text += `Maghrib  : ${todaySchedule.maghrib}\n`;
            text += `Isya     : ${todaySchedule.isya}\n\n`;

            text += `${'='.repeat(50)}\n`;
            text += `_Data dari Bimas Islam Kementerian Agama RI_`;

            await helpers.replyWithTyping(sock, msg, text, 1000);
            await helpers.reactSuccess(sock, msg);
            logger.success(`Imsakiyah jadwal for Ramadan ${currentRamadhanDay} sent`);

        } catch (error) {
            logger.error('Imsakiyah error:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, `❌ Error: ${error.message}`);
        }
    }
}

module.exports = new ImsakiyahCommand();
