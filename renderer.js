const { ipcRenderer } = require('electron');

class ScraperUI {
    constructor() {
        this.form = document.getElementById('scraperForm');
        this.searchTerm = document.getElementById('searchTerm');
        this.location = document.getElementById('location');
        this.resultCount = document.getElementById('resultCount');
        this.headlessMode = document.getElementById('headless');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.exportBtn = document.getElementById('exportBtn');
        this.exportFormat = document.getElementById('exportFormat');
        this.statusText = document.getElementById('statusText');
        this.results = document.getElementById('results');
        this.progressBar = document.querySelector('.progress-bar-fill');
        
        this.setupEventListeners();
        this.setupIpcListeners();
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startScraping());
        this.stopBtn.addEventListener('click', () => this.stopScraping());
        this.exportBtn.addEventListener('click', () => this.exportResults());
        this.resultCount.addEventListener('input', this.validateResultCount.bind(this));
    }

    setupIpcListeners() {
        ipcRenderer.on('scraping-progress', (_, data) => this.updateProgress(data));
        ipcRenderer.on('scraping-results', (_, data) => this.updateResults(data));
        ipcRenderer.on('scraping-error', (_, data) => this.handleError(data));
        ipcRenderer.on('scraping-stopped', (_, data) => this.handleStopped(data));
        ipcRenderer.on('scraping-complete', (_, data) => this.handleComplete(data));
        ipcRenderer.on('export-complete', (_, data) => this.handleExportComplete(data));
    }

    validateResultCount() {
        const value = parseInt(this.resultCount.value);
        if (value < 5 || value > 120) {
            this.resultCount.setCustomValidity('Please enter a number between 5 and 120');
        } else {
            this.resultCount.setCustomValidity('');
        }
    }

    startScraping() {
        if (!this.searchTerm.value) {
            alert('Please enter a search term');
            return;
        }

        const data = {
            searchTerm: this.searchTerm.value,
            location: this.location.value,
            resultCount: parseInt(this.resultCount.value),
            isHeadless: this.headlessMode.checked
        };

        this.results.innerHTML = '';
        this.progressBar.style.width = '0%';
        this.exportBtn.disabled = true;
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;

        ipcRenderer.send('start-scraping', data);
    }

    stopScraping() {
        ipcRenderer.send('stop-scraping');
    }

    exportResults() {
        const format = this.exportFormat.value;
        ipcRenderer.send('export-results', { format });
    }

    updateProgress(data) {
        this.statusText.textContent = `Status: ${data.message}`;
        if (data.current && data.total) {
            const percent = Math.round((data.current / data.total) * 100);
            this.progressBar.style.width = `${percent}%`;
        }
    }

    updateResults(data) {
        this.results.innerHTML = this.createResultsHTML(data);
        this.exportBtn.disabled = false;
    }

    handleError(data) {
        this.statusText.textContent = `Error: ${data.message}`;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    handleStopped(data) {
        this.statusText.textContent = `Status: ${data.message}`;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
    }

    handleComplete(data) {
        this.statusText.textContent = 'Status: Scraping completed successfully';
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        if (data.results) {
            this.results.innerHTML = this.createResultsHTML(data.results);
            this.exportBtn.disabled = false;
        }
    }

    handleExportComplete(data) {
        this.statusText.textContent = `Status: Export completed - ${data.message}`;
    }

    createResultsHTML(data) {
        return data.map(result => this.createResultCard(result)).join('');
    }

    createResultCard(data) {
        return `
            <div class="result-card">
                <h3>${this.escapeHtml(data.basicInfo.name)}</h3>
                <div class="details-grid">
                    ${this.createBasicInfoSection(data.basicInfo)}
                    ${this.createContactSection(data.contact)}
                    ${this.createHoursSection(data.hours)}
                    ${this.createReviewsSection(data.reviews)}
                    ${this.createAmenitiesSection(data.amenities)}
                </div>
            </div>
        `;
    }

    createBasicInfoSection(basicInfo) {
        const rating = basicInfo.rating ? `${basicInfo.rating}/5` : 'No rating';
        const reviews = basicInfo.totalReviews ? `(${basicInfo.totalReviews} reviews)` : '';
        
        return `
            <div class="detail-section">
                <h4>Basic Information</h4>
                <p>Category: ${this.escapeHtml(basicInfo.category || 'N/A')}</p>
                <p>Rating: ${rating} ${reviews}</p>
            </div>
        `;
    }

    createContactSection(contact) {
        return `
            <div class="detail-section">
                <h4>Contact Information</h4>
                <p>Address: ${this.escapeHtml(contact.address || 'N/A')}</p>
                <p>Phone: ${this.escapeHtml(contact.phone || 'N/A')}</p>
                <p>Website: ${contact.website ? 
                    `<a href="${this.escapeHtml(contact.website)}" target="_blank">Visit</a>` : 
                    'N/A'}</p>
                <p>Plus Code: ${this.escapeHtml(contact.plusCode || 'N/A')}</p>
            </div>
        `;
    }

    createHoursSection(hours) {
        const hoursTable = hours.schedule ? Object.entries(hours.schedule)
            .map(([day, time]) => `
                <tr>
                    <td>${this.escapeHtml(day)}</td>
                    <td>${this.escapeHtml(time)}</td>
                </tr>
            `).join('') : '';

        return `
            <div class="detail-section">
                <h4>Hours</h4>
                <p>Current Status: ${this.escapeHtml(hours.currentStatus || 'N/A')}</p>
                <table class="hours-table">
                    ${hoursTable}
                </table>
            </div>
        `;
    }

    createReviewsSection(reviews) {
        if (!reviews || !reviews.summary) return '';

        const reviewStats = Object.entries(reviews.summary)
            .map(([stars, count]) => {
                const percentage = (count / Object.values(reviews.summary)
                    .reduce((a, b) => a + b, 0)) * 100;
                return `
                    <div class="review-stats">
                        <span>${stars} stars</span>
                        <div class="rating-bar">
                            <div class="rating-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                        <span>${count}</span>
                    </div>
                `;
            }).join('');

        return `
            <div class="detail-section">
                <h4>Reviews</h4>
                ${reviewStats}
                ${this.createTopicsSection(reviews.topics)}
            </div>
        `;
    }

    createTopicsSection(topics) {
        if (!topics || !topics.length) return '';

        return `
            <div class="topics-section">
                <h5>Popular Topics</h5>
                <div class="amenities-list">
                    ${topics.map(topic => `
                        <span class="amenity-tag">
                            ${this.escapeHtml(topic.name)} (${this.escapeHtml(topic.count)})
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    createAmenitiesSection(amenities) {
        if (!amenities || !amenities.length) return '';

        return `
            <div class="detail-section">
                <h4>Amenities</h4>
                <div class="amenities-list">
                    ${amenities.map(amenity => `
                        <span class="amenity-tag">${this.escapeHtml(amenity)}</span>
                    `).join('')}
                </div>
            </div>
        `;
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Initialize the UI when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ScraperUI();
});