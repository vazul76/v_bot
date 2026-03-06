const dns = require('dns').promises;
const axios = require('axios');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class NslookupCommand {
    constructor() {
        this.commands = [
            { name: 'nslookup', method: 'lookup', description: 'IP/Domain Lookup & DNS Info' }
        ];
    }

    async lookup(msg, sock, messageBody) {
        try {
            logger.info('Memproses command /nslookup');
            await helpers.reactCommandReceived(sock, msg);

            const target = messageBody.replace(/^\/nslookup\s*/i, '').trim();

            if (!target) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Format: `/nslookup [IP atau domain]`\n\n💡 Contoh:\n`/nslookup 8.8.8.8`\n`/nslookup google.com`\n`/nslookup github.com`'
                );
            }

            // Validasi input — only allow valid IP or domain-like strings
            if (!this.isValidTarget(target)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format IP atau domain tidak valid!');
            }

            await helpers.reactProcessing(sock, msg);
            logger.info(`NSLookup untuk: ${target}`);

            const isIP = this.isIPAddress(target);

            // Jalankan semua lookup secara paralel
            const [geoInfo, dnsInfo] = await Promise.all([
                this.fetchGeoInfo(isIP ? target : await this.resolveToIP(target), target),
                !isIP ? this.fetchDNSRecords(target) : null
            ]);

            const response = this.formatResponse(target, isIP, geoInfo, dnsInfo);

            await helpers.replyWithTyping(sock, msg, response, 1500);
            await helpers.reactSuccess(sock, msg);
            logger.success('NSLookup berhasil');

        } catch (error) {
            logger.error('Error in /nslookup:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal lookup. Pastikan IP/domain valid dan coba lagi.');
        }
    }

    isValidTarget(target) {
        // IPv4
        const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
        // IPv6 (basic)
        const ipv6 = /^[0-9a-fA-F:]{2,39}$/;
        // Domain
        const domain = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
        return ipv4.test(target) || ipv6.test(target) || domain.test(target);
    }

    isIPAddress(target) {
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(target) || /^[0-9a-fA-F:]{4,39}$/.test(target);
    }

    async resolveToIP(domain) {
        try {
            const addrs = await dns.resolve4(domain);
            return addrs[0] || null;
        } catch {
            return null;
        }
    }

    async fetchGeoInfo(ip, originalTarget) {
        if (!ip) return null;
        try {
            const fields = 'status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,reverse,query';
            const r = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`, {
                timeout: 8000
            });
            if (r.data?.status !== 'success') return null;
            return r.data;
        } catch (e) {
            logger.warn('Geo lookup failed:', e.message);
            return null;
        }
    }

    async fetchDNSRecords(domain) {
        const results = {};

        const tryResolve = async (type, fn) => {
            try {
                results[type] = await fn();
            } catch {
                results[type] = null;
            }
        };

        await Promise.all([
            tryResolve('A', () => dns.resolve4(domain)),
            tryResolve('AAAA', () => dns.resolve6(domain)),
            tryResolve('MX', () => dns.resolveMx(domain)),
            tryResolve('NS', () => dns.resolveNs(domain)),
            tryResolve('TXT', () => dns.resolveTxt(domain)),
            tryResolve('CNAME', () => dns.resolveCname(domain)),
        ]);

        return results;
    }

    formatResponse(target, isIP, geoInfo, dnsInfo) {
        const lines = [];

        lines.push(`*NSLookup: ${target}*`);
        lines.push('');

        // Geo / IP Info
        if (geoInfo) {
            lines.push('*Informasi IP*');
            lines.push(`• IP       : \`${geoInfo.query}\``);
            if (geoInfo.reverse && geoInfo.reverse !== geoInfo.query) {
                lines.push(`• Hostname : ${geoInfo.reverse}`);
            }
            lines.push(`• Negara   : ${(geoInfo.countryCode)} ${geoInfo.country}`);
            if (geoInfo.regionName) lines.push(`• Wilayah  : ${geoInfo.regionName}${geoInfo.city ? ', ' + geoInfo.city : ''}`);
            if (geoInfo.isp)        lines.push(`• ISP      : ${geoInfo.isp}`);
            if (geoInfo.org && geoInfo.org !== geoInfo.isp) {
                lines.push(`• Org      : ${geoInfo.org}`);
            }
            if (geoInfo.as)         lines.push(`• AS       : ${geoInfo.as}`);
            if (geoInfo.timezone)   lines.push(`• Timezone : ${geoInfo.timezone}`);
            if (geoInfo.lat && geoInfo.lon) {
                lines.push(`• Koordinat: ${geoInfo.lat.toFixed(4)}, ${geoInfo.lon.toFixed(4)}`);
            }
        } else {
            lines.push('Informasi geo IP tidak tersedia');
        }

        // DNS Records (hanya untuk domain, bukan IP)
        if (!isIP && dnsInfo) {
            lines.push('');
            lines.push('*DNS Records*');

            if (dnsInfo.A?.length) {
                lines.push(`• A (IPv4)  : ${dnsInfo.A.slice(0, 4).join(', ')}`);
            }
            if (dnsInfo.AAAA?.length) {
                lines.push(`• AAAA (v6) : ${dnsInfo.AAAA.slice(0, 2).join(', ')}`);
            }
            if (dnsInfo.CNAME?.length) {
                lines.push(`• CNAME     : ${dnsInfo.CNAME.slice(0, 2).join(', ')}`);
            }
            if (dnsInfo.MX?.length) {
                const mx = dnsInfo.MX
                    .sort((a, b) => a.priority - b.priority)
                    .slice(0, 3)
                    .map(r => `${r.exchange} (${r.priority})`)
                    .join(', ');
                lines.push(`• MX (Mail) : ${mx}`);
            }
            if (dnsInfo.NS?.length) {
                lines.push(`• NS        : ${dnsInfo.NS.slice(0, 4).join(', ')}`);
            }
            if (dnsInfo.TXT?.length) {
                const txts = dnsInfo.TXT
                    .flat()
                    .filter(t => t.length < 120)
                    .slice(0, 2);
                if (txts.length) lines.push(`• TXT       : ${txts.join(' | ')}`);
            }

            // Jika semua null
            const hasAny = Object.values(dnsInfo).some(v => v !== null && v?.length > 0);
            if (!hasAny) {
                lines.push('_Tidak ada DNS record yang ditemukan_');
            }
        }

        lines.push('');
        lines.push(`_Sumber: ip-api.com + Node DNS_`);

        return lines.join('\n');
    }

    flagEmoji(countryCode) {
        if (!countryCode || countryCode.length !== 2) return '🌐';
        const offset = 127397;
        return [...countryCode.toUpperCase()].map(c => String.fromCodePoint(c.charCodeAt(0) + offset)).join('');
    }
}

module.exports = new NslookupCommand();
