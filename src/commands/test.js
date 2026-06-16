const os = require('os');
const { exec } = require('child_process');
const fs = require('fs/promises');
const util = require('util');
const axios = require('axios');

const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const healthChecker = require('../utils/healthChecker');

const execPromise = util.promisify(exec);

function formatDateID(date = new Date()) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year}, ${hours}.${minutes}.${seconds}`;
}

function shellEscape(value) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return 'N/A';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function readCgroupBytes(content) {
    if (!content) return null;

    const value = String(content).trim();
    if (!value || value === 'max') return null;

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    if (parsed > 1e15) return null;

    return parsed;
}

async function readFirstExisting(paths) {
    for (const filePath of paths) {
        try {
            return await fs.readFile(filePath, 'utf8');
        } catch {
            // Continue searching.
        }
    }

    return null;
}

class TestCommand {
    constructor() {
        this.commands = [
            { name: 'test', method: 'execute', description: 'Cek server, bot, dan health check' }
        ];
    }

    async execute(msg, sock) {
        const startedAt = Date.now();

        try {
            logger.info('Memproses command /test');
            await helpers.reactCommandReceived(sock, msg);
            await helpers.reactProcessing(sock, msg);
            const reactionDoneAt = Date.now();

            const [serverStats, results] = await Promise.all([
                this.getServerStats(),
                healthChecker.checkAll()
            ]);
            const processingDoneAt = Date.now();

            const responsiveLatency = reactionDoneAt - startedAt;
            const processingTime = processingDoneAt - reactionDoneAt;
            const totalDuration = processingDoneAt - startedAt;

            const report = this.buildReport({
                responsiveLatency,
                processingTime,
                totalDuration,
                serverStats,
                results
            });

            await helpers.replyWithTyping(sock, msg, report, 800);
            await helpers.reactSuccess(sock, msg);

            logger.info('Command /test completed');
        } catch (error) {
            logger.error('Error running /test:', error);

            try {
                await helpers.reactError(sock, msg);
                await helpers.replyWithTyping(sock, msg, '❌ Gagal menjalankan test status!');
            } catch (replyError) {
                logger.error('Error sending /test error reply:', replyError);
            }
        }
    }

    async getServerStats() {
        const [cpuUsage, diskUsage, memoryInfo, networkStats] = await Promise.all([
            this.getCpuUsage(),
            this.getDiskUsage(process.cwd()),
            this.getMemoryInfo(),
            this.getNetworkStats()
        ]);

        return {
            cpuUsage,
            memoryUsed: memoryInfo.used,
            memoryTotal: memoryInfo.total,
            diskUsed: diskUsage.used,
            diskTotal: diskUsage.total,
            botRam: process.memoryUsage().rss,
            networkStats
        };
    }

    async getCpuUsage() {
        const sampleCpus = () => os.cpus().reduce((acc, cpu) => {
            const times = cpu.times;
            acc.idle += times.idle;
            acc.total += times.user + times.nice + times.sys + times.irq + times.idle;
            return acc;
        }, { idle: 0, total: 0 });

        const start = sampleCpus();

        return new Promise(resolve => {
            setTimeout(() => {
                const end = sampleCpus();
                const idleDelta = end.idle - start.idle;
                const totalDelta = end.total - start.total;
                const usage = totalDelta > 0 ? (1 - (idleDelta / totalDelta)) * 100 : 0;
                resolve(Math.max(0, Math.min(100, usage)));
            }, 120);
        });
    }

    async getDiskUsage(targetPath = process.cwd()) {
        try {
            const { stdout } = await execPromise(`df -kP ${shellEscape(targetPath)} | tail -1`);
            const parts = stdout.trim().split(/\s+/);

            if (parts.length < 6) {
                throw new Error('Unexpected df output');
            }

            return {
                total: Number(parts[1]) * 1024,
                used: Number(parts[2]) * 1024
            };
        } catch (error) {
            logger.warn(`Failed to read disk usage: ${error.message}`);
            return {
                total: 0,
                used: 0
            };
        }
    }

    async getMemoryInfo() {
        const cgroupTotal = readCgroupBytes(await readFirstExisting([
            '/sys/fs/cgroup/memory.max',
            '/sys/fs/cgroup/memory/memory.limit_in_bytes'
        ]));

        const cgroupUsed = readCgroupBytes(await readFirstExisting([
            '/sys/fs/cgroup/memory.current',
            '/sys/fs/cgroup/memory/memory.usage_in_bytes'
        ]));

        const total = cgroupTotal || os.totalmem();
        const used = cgroupUsed || Math.max(0, total - os.freemem());

        return {
            total,
            used: Math.min(used, total)
        };
    }

    async getNetworkStats() {
        try {
            const [ispData, speedData] = await Promise.all([
                this.getISPInfo(),
                this.getSpeedTest()
            ]);
            
            return {
                ...ispData,
                ...speedData
            };
        } catch (error) {
            logger.warn(`Failed to retrieve network stats: ${error.message}`);
            return {
                hostedBy: 'N/A',
                isp: 'N/A',
                download: 'N/A',
                upload: 'N/A'
            };
        }
    }

    async getISPInfo() {
        try {
            const response = await axios.get('https://ipapi.co/json/', {
                timeout: 5000
            });
            
            const data = response.data;
            return {
                hostedBy: data.org || 'N/A',
                isp: data.org || 'N/A'
            };
        } catch (error) {
            return {
                hostedBy: 'N/A',
                isp: 'N/A'
            };
        }
    }

    async getSpeedTest() {
        try {
            // Try using speedtest CLI first
            const { stdout } = await execPromise('speedtest-cli --simple --timeout 120', {
                timeout: 130000
            });
            
            const output = stdout.trim();
            const pingMatch = output.match(/Ping:\s*([\d.]+)/i);
            const downloadMatch = output.match(/Download:\s*([\d.]+)/i);
            const uploadMatch = output.match(/Upload:\s*([\d.]+)/i);

            const ping = pingMatch ? Number(pingMatch[1]) : 0;
            const download = downloadMatch ? Number(downloadMatch[1]) : 0;
            const upload = uploadMatch ? Number(uploadMatch[1]) : 0;

            if (download > 0 || upload > 0) {
                logger.info(`Speedtest result - Ping: ${ping}ms, Download: ${download}Mbps, Upload: ${upload}Mbps`);
                return {
                    download: download > 0 ? `${download.toFixed(2)} Mbps` : 'N/A',
                    upload: upload > 0 ? `${upload.toFixed(2)} Mbps` : 'N/A'
                };
            }

            logger.warn(`Unexpected speedtest output format: ${output}`);
            return {
                download: 'N/A',
                upload: 'N/A'
            };
        } catch (error) {
            logger.warn(`Speedtest-cli error: ${error.message}`);
            
            // Fallback: simple manual speed test
            try {
                const testUrl = 'https://speed.cloudflare.com/__down?bytes=10000000'; // 10MB test file
                const startTime = Date.now();
                
                const response = await axios.get(testUrl, {
                    timeout: 30000,
                    responseType: 'arraybuffer'
                });
                
                const endTime = Date.now();
                const sizeInBytes = response.data.length;
                const durationInSeconds = (endTime - startTime) / 1000;
                const speedMbps = (sizeInBytes * 8) / (durationInSeconds * 1000000);
                
                logger.warn(`Using fallback speed test: ${speedMbps.toFixed(2)} Mbps`);
                
                return {
                    download: `${speedMbps.toFixed(2)} Mbps`,
                    upload: 'N/A'
                };
            } catch (fallbackError) {
                logger.warn(`Speed test fallback failed: ${fallbackError.message}`);
                return {
                    download: 'N/A',
                    upload: 'N/A'
                };
            }
        }
    }

    buildReport(timingData) {
        const { responsiveLatency, processingTime, totalDuration, serverStats, results } = timingData;
        const failed = results.filter(result => result.status === '❌');
        const warning = results.filter(result => result.status === '⚠️');
        const passed = results.filter(result => result.status === '✅');

        let message = `*Response Time*\n`;
        message += `Bot latency: ${responsiveLatency}ms\n`;
        message += `Processing: ${processingTime}ms\n`;
        message += `Total time: ${totalDuration}ms\n\n`;
        
        message += `*Server Status*\n`;
        message += `CPU = ${serverStats.cpuUsage.toFixed(1)}%\n`;
        message += `RAM = ${formatSize(serverStats.memoryUsed)}/${formatSize(serverStats.memoryTotal)}\n`;
        message += `DISK = ${formatSize(serverStats.diskUsed)}/${formatSize(serverStats.diskTotal)}\n\n`;

        message += `*Network Status*\n`;
        message += `Hosted By = ${serverStats.networkStats.hostedBy}\n`;
        message += `ISP = ${serverStats.networkStats.isp}\n`;
        message += `Download = ${serverStats.networkStats.download}\n`;
        message += `Upload = ${serverStats.networkStats.upload}\n\n`;

        message += `*Bot Status*\n`;
        message += `RAM Usage = ${formatSize(serverStats.botRam)}\n`;
        message += `Command healthy = ${passed.length}/${results.length}\n`;
        message += `*Command warning* = ${warning.length}\n`;
        message += `*Command failed* = ${failed.length}\n`;

        if (warning.length > 0) {
            message += `*Warning command* = ${warning.map(result => `${result.name}`).join(', ')}\n`;
        }

        if (failed.length > 0) {
            message += `*Failed command* = ${failed.map(result => `${result.name}`).join(', ')}\n`;
        }

        return message;
    }
}

module.exports = new TestCommand();