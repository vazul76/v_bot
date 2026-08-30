const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('./logger');

class WebScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive'
        };
    }

    async fetchHTML(url) {
        try {
            const response = await axios.get(url, {
                headers: this.headers,
                timeout: 10000
            });
            return response.data;
        } catch (error) {
            logger.error(`Failed to fetch ${url}:`, error.message);
            return null;
        }
    }

    async scrapeUINNews() {
        try {
            const url = 'https://uin-suka.ac.id';
            const html = await this.fetchHTML(url);
            
            if (!html) return [];

            const $ = cheerio.load(html);
            const news = [];

            // Scrape news from the news section
            // Looking for news cards with title and link
            $('.news-item, .card-news, [class*="news"], article').each((index, element) => {
                if (index >= 5) return; // Limit to 5 items

                const $el = $(element);
                const title = $el.find('h3, h4, .title, [class*="title"]').first().text().trim();
                const link = $el.find('a').first().attr('href');
                const fullLink = link && !link.startsWith('http') ? `${url}${link}` : link;

                if (title && link) {
                    news.push({
                        title: title.substring(0, 150), // Limit title length
                        link: fullLink || url,
                        source: 'uin-suka.ac.id',
                        date: null,
                        scrapedAt: new Date()
                    });
                }
            });

            if (news.length === 0) {
                // Fallback scraping method
                logger.warn('No news found with primary selector, trying fallback');
                $('a').each((index, element) => {
                    if (news.length >= 5) return;
                    
                    const $el = $(element);
                    const text = $el.text().trim();
                    const href = $el.attr('href');
                    
                    if (text.length > 20 && text.length < 200 && href) {
                        news.push({
                            title: text,
                            link: href.startsWith('http') ? href : `${url}${href}`,
                            source: 'uin-suka.ac.id',
                            date: null,
                            scrapedAt: new Date()
                        });
                    }
                });
            }

            logger.info(`Scraped ${news.length} news from uin-suka.ac.id`);
            return news;
        } catch (error) {
            logger.error('Error scraping UIN News:', error.message);
            return [];
        }
    }

    async scrapeSaintekAnnouncements() {
        try {
            const url = 'https://saintek.uin-suka.ac.id/id/list/pengumuman';
            const html = await this.fetchHTML(url);
            
            if (!html) return [];

            const $ = cheerio.load(html);
            const announcements = [];

            // Scrape announcements from pengumuman section
            // Structure: h4 > a (title + link), then text node (date)
            $('h4').each((index, element) => {
                if (index >= 5) return; // Limit to 5 items

                const $heading = $(element);
                const $link = $heading.find('a');
                const title = $link.text().trim();
                const link = $link.attr('href');

                // Get date from next sibling text
                let dateText = '';
                const $parent = $heading.parent();
                const parentText = $parent.text();
                
                // Extract date pattern: day name, date month year
                const dateMatch = parentText.match(/([A-Za-z]+),\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
                if (dateMatch) {
                    dateText = dateMatch[0]; // Full date string
                }

                const fullLink = link && !link.startsWith('http') 
                    ? `https://saintek.uin-suka.ac.id${link}` 
                    : link;

                if (title && link) {
                    announcements.push({
                        title: title.substring(0, 150),
                        link: fullLink || 'https://saintek.uin-suka.ac.id/id/list/pengumuman',
                        source: 'saintek.uin-suka.ac.id',
                        date: dateText || null,
                        scrapedAt: new Date()
                    });
                }
            });

            logger.info(`Scraped ${announcements.length} announcements from saintek.uin-suka.ac.id`);
            return announcements;
        } catch (error) {
            logger.error('Error scraping Saintek Announcements:', error.message);
            return [];
        }
    }

    // Hash content for comparison
    contentHash(item) {
        const str = `${item.title}${item.link}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }
}

module.exports = new WebScraper();
