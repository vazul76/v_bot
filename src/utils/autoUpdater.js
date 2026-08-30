const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');
const logger = require('./logger');
const os = require('os');

class AutoUpdater {
    constructor() {
        this.updateTask = null;
        this.isUpdating = false;
        this.lastUpdateTime = null;
    }

    start(timeString = '0 0 * * *') {
        // Default: 00:00 setiap hari (WIB timezone)
        // Format: minute hour day month dayOfWeek
        // '0 0 * * *' = 00:00 setiap hari
        
        try {
            this.updateTask = cron.schedule(timeString, async () => {
                if (this.isUpdating) {
                    logger.warn('Auto-update already running, skipping this schedule');
                    return;
                }
                await this.performUpdate();
            }, {
                scheduled: true,
                timezone: 'Asia/Jakarta' // WIB timezone
            });

            logger.success(`Auto-updater started! Schedule: ${timeString} (WIB)`);
        } catch (error) {
            logger.error('Failed to start auto-updater:', error.message);
        }
    }

    async performUpdate() {
        this.isUpdating = true;
        const startTime = new Date();
        
        try {
            logger.info('🔄 Starting auto-update process...');
            this.lastUpdateTime = startTime;

            const platform = os.platform();
            
            // Step 1: Update npm packages
            logger.info('📦 Updating npm packages...');
            await this.executeCommand('npm update', 'npm packages');

            // Step 2: Update yt-dlp
            logger.info('🎬 Updating yt-dlp...');
            if (platform === 'win32') {
                await this.executeCommand('pip install --upgrade yt-dlp', 'yt-dlp (Windows)');
            } else {
                // Linux/Mac
                await this.executeCommand('pip3 install --upgrade yt-dlp', 'yt-dlp (Unix)');
            }

            const endTime = new Date();
            const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
            
            logger.success(`✅ Auto-update completed! (${duration} minutes)`);
            logger.info(`Last update: ${startTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);

        } catch (error) {
            logger.error('❌ Auto-update failed:', error.message);
        } finally {
            this.isUpdating = false;
        }
    }

    async executeCommand(command, description) {
        return new Promise((resolve, reject) => {
            exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
                if (error) {
                    logger.warn(`⚠️  ${description} update warning:`, error.message);
                    // Don't reject, continue with next update
                    resolve();
                } else {
                    logger.info(`✓ ${description} updated successfully`);
                    resolve();
                }
            });
        });
    }

    stop() {
        if (this.updateTask) {
            this.updateTask.stop();
            logger.info('Auto-updater stopped');
        }
    }

    getStatus() {
        return {
            isRunning: this.updateTask !== null,
            isUpdating: this.isUpdating,
            lastUpdateTime: this.lastUpdateTime
        };
    }

    // Method untuk manual trigger update
    async manualUpdate() {
        if (this.isUpdating) {
            logger.warn('Update already in progress, please wait');
            return false;
        }
        await this.performUpdate();
        return true;
    }
}

module.exports = new AutoUpdater();
