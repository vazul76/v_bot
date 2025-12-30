class Logger {
    constructor() {
        this.timestamp = () => new Date().toISOString();
    }

    sanitize(value) {
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: value.stack
            };
        }
        return value;
    }

    log(level, message, args) {
        const entry = {
            level,
            timestamp: this.timestamp(),
            message: typeof message === 'string' ? message : String(message || '')
        };

        const meta = args.map((item) => this.sanitize(item));
        if (meta.length) entry.meta = meta;

        const line = JSON.stringify(entry);
        if (level === 'error') {
            console.error(line);
        } else {
            console.log(line);
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