const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class CalcCommand {
    constructor() {
        // Safe characters for math evaluation
        // Allows: numbers, +, -, *, /, (, ), ., %, ^, and letters for functions/constants
        this.validChars = /^[0-9+\-*/().\s%^a-zA-Z]+$/;
    }

    async evaluate(msg, sock, body) {
        try {
            logger.info('Memproses command .itung');

            // 1. Get expression from body
            // Strip the command itself (e.g. ".itung ") from the body
            let expression = body.trim().replace(/^\S+\s*/, '');

            if (!expression) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Masukkan soal matematika!\nContoh: `.itung 1+1`, `.itung 5x5`, atau `.itung akar(144)`');
            }

            // 2. Normalize input (user friendly replacements)
            let parsedExpression = expression
                .replace(/[xX]/g, '*')
                .replace(/:/g, '/')
                .replace(/,/g, '.')
                .toLowerCase(); // Normalized to lowercase for easier mapping

            // 3. Map scientific functions/constants to JS Math
            // 'e' handling is tricky because it might be in words, but with stripped command and validChars restricted, 
            // straightforward 'e' mapping might be risky if we allow other text? 
            // But validChars allows a-z. If user types "apel", it becomes "Math.apel" (undefined) or something.
            // Let's rely on regex checking.

            // Re-doing replacement with boundaries for safer substitution
            const keywordMap = {
                'sin': 'Math.sin',
                'cos': 'Math.cos',
                'tan': 'Math.tan',
                'sqrt': 'Math.sqrt',
                'akar': 'Math.sqrt',
                'pi': 'Math.PI',
                'abs': 'Math.abs',
                'floor': 'Math.floor',
                'ceil': 'Math.ceil',
                'round': 'Math.round',
                'e': 'Math.E'
            };

            // Replace words strictly
            parsedExpression = parsedExpression.replace(/[a-z]+/g, (match) => {
                return keywordMap[match] || match; // If not in map, leave as is (will probably cause error later)
            });

            // 4. Validate characters AGAIN after processing? 
            // No, validate ORIGINAL input vs allowed set, then trust the transformation if validChars allowed letters.
            // But now validChars allows a-z. If user enters "halo", parsedExpression becomes "halo" (mapped to nothing).
            // "new Function" will throw error "halo is not defined". That's ACCEPTABLE error handling.

            if (!this.validChars.test(expression)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Input mengandung karakter ilegal!\nHanya angka, operator, dan fungsi matematika yang diperbolehkan.');
            }

            // 5. Evaluate
            const result = new Function('return ' + parsedExpression)();

            // 5.Check compatibility and format result
            if (!isFinite(result) || isNaN(result)) {
                throw new Error('Hasil tidak valid (Infinity/NaN)');
            }

            // Format result ID style (Ribuan = Titik, Desimal = Koma)
            // Example: 10000.5 -> 10.000,5
            const formatter = new Intl.NumberFormat('id-ID', {
                maximumFractionDigits: 10,
                minimumFractionDigits: 0
            });
            const formattedResult = formatter.format(result);

            logger.success(`Math evaluated: ${expression} = ${formattedResult}`);

            await helpers.reactSuccess(sock, msg);
            await helpers.replyWithTyping(sock, msg, `Hasil: *${formattedResult}*`);

        } catch (error) {
            logger.error('Error calculating:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal menghitung! Pastikan format soal benar.');
        }
    }
}

module.exports = new CalcCommand();
