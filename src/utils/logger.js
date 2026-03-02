const chalk = require('chalk');

class Logger {
    constructor() {
        this.timestamp = () => {
            const now = new Date();
            return now.toLocaleTimeString('id-ID', { hour12: false });
        };
    }

    log(level, message, args) {
        let levelTag = '';
        let messageColor = (msg) => msg;

        switch (level) {
            case 'info':
                levelTag = chalk.bgBlue.white.bold(' INFO ');
                messageColor = chalk.cyan;
                break;
            case 'success':
                levelTag = chalk.bgGreen.white.bold(' SUCCESS ');
                messageColor = chalk.green;
                break;
            case 'warn':
                levelTag = chalk.bgYellow.black.bold(' WARN ');
                messageColor = chalk.yellow;
                break;
            case 'error':
                levelTag = chalk.bgRed.white.bold(' ERROR ');
                messageColor = chalk.red;
                break;
            default:
                levelTag = chalk.bgWhite.black.bold(` ${level.toUpperCase()} `);
        }

        const time = chalk.gray(`[${this.timestamp()}]`);
        const formattedMessage = messageColor(message);

        console.log(`${time} ${levelTag} ${formattedMessage}`);

        if (args.length > 0) {
            args.forEach(arg => {
                if (typeof arg === 'object') {
                    console.log(chalk.gray(JSON.stringify(arg, null, 2)));
                } else {
                    console.log(chalk.gray(`  > ${arg}`));
                }
            });
        }
    }

    info(message, ...args) {
        this.log('info', message, args);
    }

    success(message, ...args) {
        this.log('success', message, args);
    }

    warn(message, ...args) {
        this.log('warn', message, args);
    }

    error(message, ...args) {
        this.log('error', message, args);
    }
}

module.exports = new Logger();