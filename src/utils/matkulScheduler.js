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
        this.schedulerJob = null;
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

    formatReminderMessage() {
        const todayMatkul = this.getTodayMatkul();

        if (todayMatkul.length === 0) {
            return null;
        }

        let message = `*🔔 REMINDER MATKUL HARI INI*\n`;
        message += `📅 ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`;

        todayMatkul.forEach((matkul, index) => {
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

        // Schedule for 05:00 every day
        // Cron format: minute hour day month dayOfWeek
        this.schedulerJob = cron.schedule('0 5 * * *', async () => {
            try {
                logger.info('MatkulScheduler: Running daily reminder check at 05:00');

                const reminderMessage = this.formatReminderMessage();

                if (reminderMessage) {
                    // Send to admin
                    await sock.sendMessage(adminNumber, {
                        text: reminderMessage
                    });

                    logger.info('MatkulScheduler: Reminder sent to admin');
                } else {
                    logger.info('MatkulScheduler: No matkul today, no reminder sent');
                }

            } catch (error) {
                logger.error('MatkulScheduler: Error sending reminder:', error);
            }
        });

        logger.info('MatkulScheduler: Initialized - reminders at 05:00 every day');
    }

    stop() {
        if (this.schedulerJob) {
            this.schedulerJob.stop();
            logger.info('MatkulScheduler: Stopped');
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
