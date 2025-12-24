const chalk = require('chalk');

class Logger {
    constructor() {
        this.getTimestamp = () => {
            const now = new Date();
            return now.toLocaleString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year:  'numeric'
            });
        };
    }

    info(message, ...args) {
        console.log(
            chalk.blue(`[${this.getTimestamp()}] [INFO]`),
            message,
            ...args
        );
    }

    success(message, ...args) {
        console.log(
            chalk.green(`[${this.getTimestamp()}] [SUCCESS]`),
            message,
            ...args
        );
    }

    warn(message, ...args) {
        console.log(
            chalk.yellow(`[${this.getTimestamp()}] [WARN]`),
            message,
            ...args
        );
    }

    error(message, ...args) {
        console.log(
            chalk.red(`[${this.getTimestamp()}] [ERROR]`),
            message,
            ...args
        );
    }
}

module.exports = new Logger();