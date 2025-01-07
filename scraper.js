const puppeteer = require('puppeteer-core');
const chromeFinder = require('chrome-finder');
const downloadChromium = require('download-chromium');
const path = require('path');
const fs = require('fs').promises;

class MapsScraper {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.isRunning = false;
        this.progressCallback = options.onProgress || (() => {});
        this.resultCallback = options.onResult || (() => {});
    }

    async findOrDownloadChrome() {
        try {
            // First try to find installed Chrome
            const chromePath = chromeFinder();
            if (chromePath) {
                return chromePath;
            }
        } catch (error) {
            console.log('No Chrome installation found, downloading Chromium...');
        }

        // If no Chrome found, download Chromium
        try {
            const downloadPath = path.join(process.cwd(), 'chrome');
            
            // Check if Chromium is already downloaded
            try {
                await fs.access(downloadPath);
                return downloadPath;
            } catch {
                // Download if not exists
                this.progressCallback({ 
                    status: 'info', 
                    message: 'Downloading Chrome (required for first run)...' 
                });
                
                const chromePath = await downloadChromium({
                    revision: '1000044',
                    installPath: downloadPath,
                    progressCallback: (progress) => {
                        this.progressCallback({
                            status: 'progress',
                            message: `Downloading Chrome: ${Math.round(progress * 100)}%`,
                            current: progress * 100,
                            total: 100
                        });
                    }
                });
                
                return chromePath;
            }
        } catch (error) {
            throw new Error(`Failed to download Chrome: ${error.message}`);
        }
    }

    async initialize(isHeadless = true) {
        try {
            const chromePath = await this.findOrDownloadChrome();
            
            this.browser = await puppeteer.launch({
                headless: isHeadless,
                executablePath: chromePath,
                defaultViewport: { width: 1366, height: 768 },
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            this.page = await this.browser.newPage();
            await this.page.setDefaultNavigationTimeout(30000);
        } catch (error) {
            throw new Error(`Failed to initialize browser: ${error.message}`);
        }
    }


    async wait(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    async scrape(searchTerm, location, resultCount) {
        try {
            this.isRunning = true;
            
            // Navigate to Google Maps
            this.progressCallback({ status: 'info', message: 'Opening Google Maps...' });
            await this.page.goto('https://www.google.com/maps');
            await this.page.waitForSelector('#searchboxinput');

            // Enter search query
            const searchQuery = location ? `${searchTerm} in ${location}` : searchTerm;
            this.progressCallback({ status: 'info', message: `Searching for: ${searchQuery}` });
            await this.page.type('#searchboxinput', searchQuery);
            
            // Click search button and wait for results
            await this.page.click('#searchbox-searchbutton');
            await this.page.waitForSelector('.hfpxzc');

            // Collection for storing results
            const results = new Set();
            let noNewResultsStartTime = null;
            const MAX_WAIT_TIME = 10000; // 10 seconds

            while (results.size < resultCount && this.isRunning) {
                const newResults = await this.extractVisibleResults();
                const previousSize = results.size;
                
                newResults.forEach(result => {
                    if (!Array.from(results).some(r => JSON.parse(r).name === result.name)) {
                        results.add(JSON.stringify(result));
                    }
                });

                this.progressCallback({
                    status: 'progress',
                    message: `Found ${results.size} results...`,
                    current: results.size,
                    total: resultCount
                });

                if (previousSize === results.size) {
                    if (!noNewResultsStartTime) {
                        noNewResultsStartTime = Date.now();
                    }
                    else if (Date.now() - noNewResultsStartTime >= MAX_WAIT_TIME) {
                        break;
                    }
                } else {
                    noNewResultsStartTime = null;
                }

                if (results.size < resultCount) {
                    await this.scrollResultsList();
                    await this.wait(1000);
                }
            }

            const parsedResults = [...results].map(r => JSON.parse(r));
            const detailedResults = [];

            for (const result of parsedResults.slice(0, resultCount)) {
                if (!this.isRunning) break;
                
                this.progressCallback({
                    status: 'info',
                    message: `Scraping business ${detailedResults.length + 1} of ${resultCount}`,
                    current: detailedResults.length + 1,
                    total: resultCount,
                    currentTask: `Getting details for: ${result.name}`
                });

                try {
                    const details = await this.getPlaceDetails(result);
                    detailedResults.push({ ...result, ...details });
                    this.resultCallback(detailedResults);
                    await this.wait(500);
                } catch (error) {
                    console.error(`Error getting details for ${result.name}:`, error);
                    detailedResults.push({ ...result, error: 'Failed to get details' });
                }
            }

            return detailedResults;

        } catch (error) {
            throw new Error(`Scraping failed: ${error.message}`);
        }
    }

    async extractVisibleResults() {
        return await this.page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('.hfpxzc');
            
            items.forEach(item => {
                const name = item.getAttribute('aria-label');
                const link = item.getAttribute('href');
                
                if (name && link) {
                    results.push({
                        name: name,
                        link: link
                    });
                }
            });
            
            return results;
        });
    }

    async getPlaceDetails(result) {
        try {
            await this.page.goto(result.link, { waitUntil: 'networkidle0' });
            await this.wait(1000);

            return await this.page.evaluate(() => {
                const getElement = (selector) => {
                    const element = document.querySelector(selector);
                    return element ? element.textContent.trim() : null;
                };

                // Basic Information
                const name = document.querySelector('h1.DUwDvf')?.textContent?.trim();
                const ratingElement = document.querySelector('.F7nice');
                const rating = ratingElement ? parseFloat(ratingElement.textContent) : null;
                const totalReviews = document.querySelector('.F7nice + span')?.textContent?.match(/\d+/)?.[0];
                const category = document.querySelector('button.DkEaL')?.textContent?.trim();
                
                // Contact & Location
                const address = document.querySelector('button[data-item-id="address"]')?.textContent?.trim();
                const phoneButton = document.querySelector('button[data-item-id^="phone:tel:"]');
                const phone = phoneButton ? phoneButton.getAttribute('aria-label')?.replace('Phone: ', '') : null;
                const website = document.querySelector('a[data-item-id="authority"]')?.href;
                const plusCode = document.querySelector('button[data-item-id="oloc"]')?.textContent?.trim();

                // Operating Hours
                const hoursData = {};
                const hoursRows = document.querySelectorAll('table.eK4R0e tbody tr');
                hoursRows.forEach(row => {
                    const day = row.querySelector('.ylH6lf')?.textContent?.trim();
                    const hours = row.querySelector('.mxowUb')?.textContent?.trim();
                    if (day && hours) {
                        hoursData[day] = hours;
                    }
                });

                // Current Status
                const openStatus = document.querySelector('.ZDu9vd')?.textContent?.trim();

                // Reviews Summary
                const reviewsStats = {};
                const ratingBars = document.querySelectorAll('.Bd93Zb tr.BHOKXe');
                ratingBars.forEach(bar => {
                    const stars = bar.querySelector('.yxmtmf')?.textContent?.trim();
                    const count = bar.getAttribute('aria-label')?.match(/\d+/)?.[0];
                    if (stars && count) {
                        reviewsStats[stars] = parseInt(count);
                    }
                });

                // Popular Topics
                const topics = Array.from(document.querySelectorAll('.KNfEk .tXNTee'))
                    .map(topic => ({
                        name: topic.querySelector('.uEubGf')?.textContent?.trim(),
                        count: topic.querySelector('.bC3Nkc')?.textContent?.trim()
                    }))
                    .filter(topic => topic.name && topic.count);

                // Amenities
                const amenities = Array.from(document.querySelectorAll('.Io6YTe'))
                    .map(amenity => amenity.textContent.trim())
                    .filter(Boolean);

                return {
                    basicInfo: {
                        name,
                        rating,
                        totalReviews: totalReviews ? parseInt(totalReviews) : null,
                        category
                    },
                    contact: {
                        address,
                        phone,
                        website,
                        plusCode
                    },
                    hours: {
                        currentStatus: openStatus,
                        schedule: hoursData
                    },
                    reviews: {
                        summary: reviewsStats,
                        topics
                    },
                    amenities,
                    scrapedAt: new Date().toISOString()
                };
            });
        } catch (error) {
            console.error('Error in getPlaceDetails:', error);
            return {
                error: error.message
            };
        }
    }

    async scrollResultsList() {
        await this.page.evaluate(() => {
            const resultContainer = document.querySelector('div[role="feed"]');
            if (resultContainer) {
                resultContainer.scrollTo(0, resultContainer.scrollHeight);
            } else {
                window.scrollTo(0, document.body.scrollHeight);
            }
        });
    }

    async stop() {
        this.isRunning = false;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

module.exports = MapsScraper;