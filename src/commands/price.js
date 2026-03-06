const axios = require('axios');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

const CRYPTO_ASSETS = [
    { id: 'bitcoin', label: 'BTC' },
    { id: 'ethereum', label: 'ETH' },
    { id: 'solana', label: 'SOL' },
    { id: 'binancecoin', label: 'BNB' },
    { id: 'ripple', label: 'XRP' }
];

class PriceCommand {
    constructor() {
        this.commands = [
            { name: 'price', method: 'execute', description: 'Cek Harga Market' }
        ];
    }
    async execute(msg, sock) {
        try {
            await helpers.reactCommandReceived(sock, msg);
            await helpers.reactProcessing(sock, msg);

            const [cryptoQuotes, goldQuotes, ihsgQuote, usdToIdr] = await Promise.all([
                this.fetchCryptoQuotes(),
                this.fetchGoldQuotes(),
                this.fetchIhsgQuote(),
                this.fetchUsdToIdrRate()
            ]);

            if (!cryptoQuotes || !goldQuotes || !ihsgQuote || !usdToIdr) {
                throw new Error('Quote data missing');
            }

            const lines = [
                ...cryptoQuotes.map((quote) => `*${quote.label}*\n${this.formatAsset(quote, usdToIdr)}`),
                ...goldQuotes.map((quote) => `*${quote.label}*\n${this.formatAsset(quote, usdToIdr)}`),
                `*IHSG*\n${this.formatAsset(ihsgQuote, usdToIdr)}`
            ];

            const response = lines.join('\n\n');

            await helpers.replyWithTyping(sock, msg, response, 1200);
            await helpers.reactSuccess(sock, msg);
        } catch (error) {
            logger.error('Error in /price:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mengambil harga. Coba lagi nanti.');
        }
    }

    async fetchCryptoQuotes() {
        const ids = CRYPTO_ASSETS.map((asset) => asset.id).join(',');
        const url = `${COINGECKO_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
        const response = await axios.get(url, { timeout: 10000 });
        const quotes = [];

        for (const asset of CRYPTO_ASSETS) {
            const price = response?.data?.[asset.id]?.usd;
            const changePercent = response?.data?.[asset.id]?.usd_24h_change;

            if (typeof price !== 'number' || typeof changePercent !== 'number') {
                continue;
            }

            const change = this.calculateChangeFromPercent(price, changePercent);
            quotes.push({
                label: asset.label,
                price,
                change,
                changePercent,
                currency: 'USD'
            });
        }

        return quotes.length ? quotes : null;
    }

    async fetchGoldQuotes() {
        const assets = [
            { symbol: 'GC=F', label: 'GOLD' },
            { symbol: 'SI=F', label: 'SILVER' }
        ];

        const quotes = [];

        for (const asset of assets) {
            try {
                const url = `${YAHOO_CHART_URL}${encodeURIComponent(asset.symbol)}?interval=1d&range=2d`;
                const response = await axios.get(url, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });

                const meta = response?.data?.chart?.result?.[0]?.meta;
                const price = meta?.regularMarketPrice;
                const previousClose = meta?.chartPreviousClose;

                if (typeof price !== 'number' || typeof previousClose !== 'number') continue;

                const change = price - previousClose;
                const changePercent = (change / previousClose) * 100;

                quotes.push({
                    label: asset.label,
                    price,
                    change,
                    changePercent,
                    currency: 'USD'
                });
            } catch (e) {
                logger.warn(`Failed to fetch ${asset.label} from Yahoo:`, e.message);
            }
        }

        return quotes.length ? quotes : null;
    }

    async fetchIhsgQuote() {
        const url = `${YAHOO_CHART_URL}%5EJKSE?interval=1d&range=5d`;
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const meta = response?.data?.chart?.result?.[0]?.meta;
        const price = meta?.regularMarketPrice;
        const previousClose = meta?.chartPreviousClose;

        if (typeof price !== 'number' || typeof previousClose !== 'number') {
            return null;
        }

        const change = price - previousClose;
        const changePercent = (change / previousClose) * 100;

        return {
            label: 'IHSG',
            price,
            change,
            changePercent,
            currency: meta?.currency || 'IDR'
        };
    }

    async fetchUsdToIdrRate() {
        const response = await axios.get(FX_URL, { timeout: 10000 });
        const rate = response?.data?.rates?.IDR;

        if (typeof rate !== 'number') {
            return null;
        }

        return rate;
    }

    formatAsset(quote, usdToIdr) {
        const price = this.toNumber(quote.price);
        const change = this.toNumber(quote.change);
        const changePercent = this.toNumber(quote.changePercent);

        if (price === null || change === null || changePercent === null) {
            return 'Data tidak tersedia saat ini.';
        }

        const direction = change >= 0 ? 'Up' : 'Down';
        const changeAbs = Math.abs(change);
        const percentAbs = Math.abs(changePercent);

        const currency = quote.currency || 'USD';
        const changeText = this.formatChange(changeAbs, currency, usdToIdr);
        const nowText = this.formatNow(price, currency, usdToIdr);
        return `${direction} : ${changeText} (${percentAbs.toFixed(2)}%) from 24hr price\nNow : ${nowText}`;
    }

    formatChange(changeAbs, currency, usdToIdr) {
        if (currency === 'IDR') {
            return this.formatCurrency(changeAbs, 'IDR');
        }

        return this.formatCurrency(changeAbs, currency);
    }

    formatNow(price, currency, usdToIdr) {
        if (typeof usdToIdr !== 'number') {
            return this.formatCurrency(price, currency);
        }

        if (currency === 'USD') {
            const idrValue = price * usdToIdr;
            return `${this.formatCurrency(price, 'USD')} / ${this.formatCurrency(idrValue, 'IDR')}`;
        }

        if (currency === 'IDR') {
            return this.formatCurrency(price, 'IDR');
        }

        return this.formatCurrency(price, currency);
    }

    calculateChangeFromPercent(price, changePercent) {
        const ratio = changePercent / 100;
        if (ratio === -1) return 0;
        const previousPrice = price / (1 + ratio);
        return price - previousPrice;
    }


    toNumber(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return null;
        }
        return value;
    }

    formatCurrency(value, currency = 'USD') {
        if (currency === 'IDR') {
            const formatted = new Intl.NumberFormat('id-ID', {
                maximumFractionDigits: 0
            }).format(value);
            return `Rp. ${formatted}`;
        }

        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 2
        }).format(value);
    }
}

module.exports = new PriceCommand();
