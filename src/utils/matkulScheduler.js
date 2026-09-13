const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const MATKUL_DB_PATH = path.join(__dirname, '../../data/matkul.json');
const DAYS_MAP = {
    0: 'Minggu',
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu'
};

class MatkulScheduler {
    constructor() {
        this.morningSchedulerJob = null;
        this.eveningSchedulerJob = null;
    }

    loadMatkul() {
        try {
            if (!fs.existsSync(MATKUL_DB_PATH)) {
                return [];
            }
            const data = fs.readFileSync(MATKUL_DB_PATH, 'utf8');
            return JSON.parse(data || '[]');
        } catch (error) {
            logger.error('Error loading matkul in scheduler:', error);
            return [];
        }
    }

    getTodayMatkul() {
        const today = new Date();
        const dayName = DAYS_MAP[today.getDay()];

        const matkulList = this.loadMatkul();
        return matkulList.filter(matkul => matkul.hari === dayName);
    }

    getTomorrowMatkul() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayName = DAYS_MAP[tomorrow.getDay()];

        const matkulList = this.loadMatkul();
        return matkulList.filter(matkul => matkul.hari === dayName);
    }

    sortMatkulByTime(matkulList) {
        // Sort matkul by start time (jam format: HH.MM-HH.MM)
        return matkulList.sort((a, b) => {
            const timeA = a.jam.split('-')[0].replace('.', ':');
            const timeB = b.jam.split('-')[0].replace('.', ':');
            return timeA.localeCompare(timeB);
        });
    }

    formatReminderMessage() {
        const todayMatkul = this.getTodayMatkul();

        if (todayMatkul.length === 0) {
            return null;
        }

        const sortedMatkul = this.sortMatkulByTime(todayMatkul);

        let message = `*🔔 REMINDER MATKUL HARI INI*\n`;
        message += `📅 ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`;

        sortedMatkul.forEach((matkul, index) => {
            message += `${index + 1}. *${matkul.nama}*\n`;
            message += `🕐 Jam: ${matkul.jam}\n`;
            message += `📍 Tempat: ${matkul.tempat}\n`;
            message += '\n';
        });

        message += `_Jangan lupa siapkan diri! 💪_`;
        return message;
    }

    formatEveningReminderMessage() {
        const tomorrowMatkul = this.getTomorrowMatkul();

        if (tomorrowMatkul.length === 0) {
            return null;
        }

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const sortedMatkul = this.sortMatkulByTime(tomorrowMatkul);

        let message = `*🔔 REMINDER MATKUL BESOK*\n`;
        message += `📅 ${tomorrow.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`;

        sortedMatkul.forEach((matkul, index) => {
            message += `${index + 1}. *${matkul.nama}*\n`;
            message += `🕐 Jam: ${matkul.jam}\n`;
            message += `📍 Tempat: ${matkul.tempat}\n`;
            message += '\n';
        });

        message += `_Jangan lupa siapkan diri! 💪_`;
        return message;
    }

    start(sock, adminNumber) {
        if (!sock || !adminNumber) {
            logger.warn('MatkulScheduler: sock or adminNumber not available');
            return;
        }

        // Schedule for 05:00 every day - reminder for today's matkul
        // Cron format: minute hour day month dayOfWeek
        this.morningSchedulerJob = cron.schedule('0 5 * * *', async () => {
            try {
                logger.info('MatkulScheduler: Running daily reminder check at 05:00');

                const reminderMessage = this.formatReminderMessage();

                if (reminderMessage) {
                    // Send to admin
                    await sock.sendMessage(adminNumber, {
                        text: reminderMessage
                    });

                    logger.info('MatkulScheduler: Morning reminder sent to admin');
                } else {
                    logger.info('MatkulScheduler: No matkul today, no morning reminder sent');
                }

            } catch (error) {
                logger.error('MatkulScheduler: Error sending morning reminder:', error);
            }
        });

        // Schedule for 20:00 every day - reminder for tomorrow's matkul
        this.eveningSchedulerJob = cron.schedule('0 20 * * *', async () => {
            try {
                logger.info('MatkulScheduler: Running evening reminder check at 20:00');

                const eveningReminderMessage = this.formatEveningReminderMessage();

                if (eveningReminderMessage) {
                    // Send to admin
                    await sock.sendMessage(adminNumber, {
                        text: eveningReminderMessage
                    });

                    logger.info('MatkulScheduler: Evening reminder sent to admin');
                } else {
                    logger.info('MatkulScheduler: No matkul tomorrow, no evening reminder sent');
                }

            } catch (error) {
                logger.error('MatkulScheduler: Error sending evening reminder:', error);
            }
        });

        logger.info('MatkulScheduler: Initialized - reminders at 05:00 (today\'s matkul) and 20:00 (tomorrow\'s matkul) every day');
    }

    stop() {
        if (this.morningSchedulerJob) {
            this.morningSchedulerJob.stop();
            logger.info('MatkulScheduler: Morning scheduler stopped');
        }
        if (this.eveningSchedulerJob) {
            this.eveningSchedulerJob.stop();
            logger.info('MatkulScheduler: Evening scheduler stopped');
        }
    }

    // For testing purposes - send reminder immediately
    async sendTestReminder(sock, adminNumber) {
        try {
            const reminderMessage = this.formatReminderMessage();
            if (reminderMessage) {
                await sock.sendMessage(adminNumber, {
                    text: reminderMessage
                });
                logger.info('MatkulScheduler: Test reminder sent');
                return true;
            }
            logger.info('MatkulScheduler: No matkul today for test reminder');
            return false;
        } catch (error) {
            logger.error('MatkulScheduler: Error sending test reminder:', error);
            return false;
        }
    }
}

module.exports = new MatkulScheduler();
