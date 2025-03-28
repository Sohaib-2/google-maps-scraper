# Google Maps Scraper

A desktop application for scraping business information from Google Maps. This tool allows you to easily search for businesses by keyword and location, then extract detailed information including contact details, operating hours, ratings, reviews, and amenities.

> **Personal Project Note**: I created this tool for my personal use after experiencing difficulties finding comprehensive information about restaurants and other businesses in my area. This helped me collect and organize data for my own research and decision-making.


## Features

- **Simple Interface**: Easy-to-use UI for configuring scraping parameters
- **Detailed Data**: Extracts comprehensive business information
- **Customizable**: Set search terms, locations, and result count
- **Real-time Progress**: View scraping progress with estimated completion time
- **Export Options**: Save results as CSV, JSON, or Excel files
- **Headless Mode**: Run with or without visible browser window

## Data Extracted

- Basic information (name, rating, review count, category)
- Contact information (address, phone, website, plus code)
- Operating hours with current open/closed status
- Review statistics and popular topics
- Available amenities

## Installation

### Prerequisites
- Node.js (14.x or later)

### Setup
1. Clone this repository
```bash
git clone https://github.com/Sohaib-2/google-maps-scraper.git
cd google-maps-scraper
```

2. Install dependencies
```bash
npm install
```

3. Run the application
```bash
npm start
```

On first run, the application will automatically download Chromium if it cannot find an existing Chrome installation.

## Usage

1. Enter a search term (e.g., "restaurants", "hotels", "coffee shops")
2. Specify a location (city, country, etc.)
3. Set the number of results you want to scrape (5-120)
4. Choose whether to run in headless mode
5. Click "Start Scraping"
6. When complete, use the export button to save results

## Legal Disclaimer

This tool is provided for educational and research purposes only. I built it as a personal project to solve my own data collection needs when researching local businesses.