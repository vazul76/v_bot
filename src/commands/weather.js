const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class WeatherCommand {
    constructor() {
        // BMKG API - FREE, no API key needed!
        this.baseUrl = 'https://api.bmkg.go.id/publik/prakiraan-cuaca';
        this.cityCodesCache = {};
        this.wilayahData = null;
    }

    async execute(msg, sock, messageBody) {
        try {
            logger.info('Memproses command /cuaca');
            await helpers.reactCommandReceived(sock, msg);

            // Extract location
            const location = messageBody.replace(/^[\.\/](cuaca|weather)\s+/i, '').trim();

            if (!location) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, 
                    '❌ Format: /cuaca [nama tempat]\n\n💡 Contoh:\n/cuaca Tirtoadi\n/cuaca Tlogoadi\n/cuaca Brontokusuman');
            }

            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Mengambil data cuaca dari BMKG...', 1500);

            // Find location code
            const locationCode = await this.findLocationCode(location);
            
            if (!locationCode) {
                throw new Error('Lokasi tidak ditemukan');
            }

            // Get weather data
            const weatherData = await this.getWeatherData(locationCode);

            if (!weatherData) {
                throw new Error('Data cuaca tidak tersedia');
            }

            // Format response
            const response = this.formatWeatherResponse(weatherData);

            await helpers.reactSuccess(sock, msg);
            await helpers.replyWithTyping(sock, msg, response, 2000);

            logger.info('Cuaca berhasil diambil dari BMKG');
        } catch (error) {
            logger.error('Error:', error);
            await helpers.reactError(sock, msg);
            
            let errorMsg = '❌ Gagal mengambil data cuaca!';
            if (error.message.includes('tidak ditemukan')) {
                errorMsg = '❌ Lokasi tidak ditemukan!\n\n💡 Hanya support wilayah DI Yogyakarta.\nContoh: /cuaca tirtoadi, /cuaca tlogoadi, /cuaca brontokusuman';
            }
            
            await helpers.replyWithTyping(sock, msg, errorMsg);
        }
    }

    // Load wilayah data from CSV
    loadWilayahData() {
        if (this.wilayahData) {
            return this.wilayahData;
        }

        try {
            const csvPath = path.join(__dirname, '../../data/wilayah.csv');
            const csvContent = fs.readFileSync(csvPath, 'utf-8');
            const lines = csvContent.split('\n');
            
            this.wilayahData = [];
            for (const line of lines) {
                if (!line.trim()) continue;
                const [kode, nama] = line.split(',');
                if (kode && nama && kode.includes('.')) {
                    // Include kecamatan (3 segments) and kelurahan/desa (4 segments)
                    const segments = kode.split('.');
                    if (segments.length === 3 || segments.length === 4) {
                        this.wilayahData.push({
                            kode: kode.trim(),
                            nama: nama.trim().toLowerCase(),
                            level: segments.length === 3 ? 'kecamatan' : 'kelurahan'
                        });
                    }
                }
            }
            
            logger.info(`Loaded ${this.wilayahData.length} wilayah DI Yogyakarta from CSV`);
            return this.wilayahData;
        } catch (error) {
            logger.error('Error loading wilayah data:', error);
            return [];
        }
    }

    async findLocationCode(location) {
        // Check cache first
        const locationLower = location.toLowerCase().trim();
        if (this.cityCodesCache[locationLower]) {
            return this.cityCodesCache[locationLower];
        }

        // Load CSV data
        const wilayahList = this.loadWilayahData();
        
        if (wilayahList.length === 0) {
            logger.error('Wilayah data not loaded');
            return null;
        }
        
        // Direct exact match
        let match = wilayahList.find(w => w.nama === locationLower);
        if (match) {
            this.cityCodesCache[locationLower] = match.kode;
            return match.kode;
        }
        
        // Fuzzy match - starts with
        match = wilayahList.find(w => w.nama.startsWith(locationLower));
        if (match) {
            this.cityCodesCache[locationLower] = match.kode;
            return match.kode;
        }
        
        // Fuzzy match - contains
        match = wilayahList.find(w => w.nama.includes(locationLower));
        if (match) {
            this.cityCodesCache[locationLower] = match.kode;
            return match.kode;
        }

        return null;
    }

    async getWeatherData(locationCode) {
        const url = `${this.baseUrl}?adm4=${locationCode}`;
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
    }

    formatWeatherResponse(data) {
        const lokasi = data.lokasi;
        const cuacaData = data.data[0].cuaca;

        // Location info
        const locationName = `${lokasi.desa || lokasi.kecamatan}, Kec. ${lokasi.kecamatan}, ${lokasi.kotkab}`;
        
        // Get current time
        const now = new Date();
        
        // Flatten all forecast items
        const allForecasts = cuacaData.flat();
        
        // Find closest current/future forecast
        let current = allForecasts[0];
        for (const item of allForecasts) {
            const itemTime = new Date(item.local_datetime);
            if (itemTime >= now) {
                current = item;
                break;
            }
        }
        
        const currentDesc = current.weather_desc;
        const currentTemp = Math.round(current.t);
        const currentHumidity = current.hu;
        const windSpeed = current.ws;
        const windDir = current.wd;

        // Build response
        let response = `🌤️ *Prakiraan Cuaca BMKG*\n`;
        response += `📍 ${locationName}\n\n`;
        
        response += `*Saat ini:*\n`;
        response += `${this.getWeatherEmoji(current.weather)} ${currentDesc}\n`;
        response += `🌡️ Suhu: ${currentTemp}°C\n`;
        response += `💧 Kelembaban: ${currentHumidity}%\n`;
        response += `💨 Angin: ${windSpeed} km/j (${windDir})\n\n`;

        response += `*Prakiraan selanjutnya:*\n`;

        // Get next 4 future forecast intervals
        const futureForecasts = allForecasts.filter(item => {
            const itemTime = new Date(item.local_datetime);
            return itemTime > now;
        }).slice(0, 4);
        
        futureForecasts.forEach(item => {
            const time = new Date(item.local_datetime);
            const hours = time.getHours().toString().padStart(2, '0');
            const minutes = time.getMinutes().toString().padStart(2, '0');
            const desc = item.weather_desc;
            const temp = Math.round(item.t);
            const emoji = this.getWeatherEmoji(item.weather);
            
            response += `${emoji} ${hours}:${minutes} - ${desc}, ${temp}°C\n`;
        });

        response += `\n_Data dari BMKG_`;
        return response;
    }

    getWeatherEmoji(weatherCode) {
        // BMKG weather codes
        if (weatherCode >= 95) return '⛈️'; // Thunderstorm
        if (weatherCode >= 80) return '🌧️'; // Heavy rain
        if (weatherCode >= 60) return '🌦️'; // Rain
        if (weatherCode >= 50) return '🌦️'; // Drizzle
        if (weatherCode >= 20) return '🌨️'; // Snow
        if (weatherCode >= 10) return '🌫️'; // Fog
        if (weatherCode >= 4) return '☁️'; // Cloudy
        if (weatherCode >= 3) return '⛅'; // Mostly cloudy
        if (weatherCode >= 2) return '🌤️'; // Partly cloudy
        return '☀️'; // Clear/sunny
    }
}

module.exports = new WeatherCommand();
