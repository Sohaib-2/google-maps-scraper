const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const XLSX = require('xlsx');
const MapsScraper = require('./scraper');

let mainWindow;
let scraper = null;
let scrapedResults = [];

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
    
    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

// Initialize app
app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
    if (scraper) {
        await scraper.cleanup();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Helper function to flatten nested object for CSV export
function flattenObject(obj, prefix = '') {
    return Object.keys(obj).reduce((acc, k) => {
        const pre = prefix.length ? prefix + '_' : '';
        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
            Object.assign(acc, flattenObject(obj[k], pre + k));
        } else {
            acc[pre + k] = Array.isArray(obj[k]) ? obj[k].join('; ') : obj[k];
        }
        return acc;
    }, {});
}

// Export functionality
async function exportResults(format, results) {
    try {
        const options = {
            title: 'Save Scraping Results',
            defaultPath: app.getPath('downloads'),
            filters: [
                { name: format.toUpperCase(), extensions: [format.toLowerCase()] }
            ]
        };

        const { filePath } = await dialog.showSaveDialog(mainWindow, options);
        
        if (!filePath) {
            return { success: false, message: 'Export cancelled' };
        }

        switch (format) {
            case 'csv': {
                const flattenedResults = results.map(result => flattenObject(result));
                const headers = Array.from(new Set(
                    flattenedResults.flatMap(obj => Object.keys(obj))
                ));
                
                const csv = [
                    headers.join(','),
                    ...flattenedResults.map(row => 
                        headers.map(header => 
                            JSON.stringify(row[header] || '')
                        ).join(',')
                    )
                ].join('\n');

                await fs.writeFile(filePath, csv, 'utf-8');
                break;
            }
            
            case 'json': {
                await fs.writeFile(filePath, JSON.stringify(results, null, 2), 'utf-8');
                break;
            }
            
            case 'excel': {
                const flattenedResults = results.map(result => flattenObject(result));
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(flattenedResults);
                XLSX.utils.book_append_sheet(wb, ws, 'Scraping Results');
                XLSX.writeFile(wb, filePath);
                break;
            }
            
            default:
                throw new Error('Unsupported export format');
        }

        return { 
            success: true, 
            message: `Results exported successfully to ${filePath}` 
        };
    } catch (error) {
        console.error('Export error:', error);
        return { 
            success: false, 
            message: `Export failed: ${error.message}` 
        };
    }
}

// IPC Handlers
ipcMain.on('start-scraping', async (event, data) => {
    try {
        const { searchTerm, location, resultCount, isHeadless } = data;
        
        // Create new scraper instance
        scraper = new MapsScraper({
            onProgress: (progress) => {
                event.reply('scraping-progress', progress);
            },
            onResult: (results) => {
                scrapedResults = results;
                event.reply('scraping-results', results);
            }
        });

        // Initialize browser with Chrome check/download
        try {
            event.reply('scraping-progress', {
                status: 'info',
                message: 'Initializing browser and checking Chrome installation...'
            });

            await scraper.initialize(isHeadless);
        } catch (error) {
            throw new Error(`Browser initialization failed: ${error.message}`);
        }
        
        event.reply('scraping-progress', {
            status: 'started',
            message: 'Starting scraping process...'
        });
        
        const results = await scraper.scrape(searchTerm, location, resultCount);
        scrapedResults = results;
        
        event.reply('scraping-complete', {
            message: 'Scraping completed successfully',
            results
        });

    } catch (error) {
        console.error('Scraping error:', error);
        event.reply('scraping-error', {
            message: error.message
        });
    } finally {
        if (scraper) {
            await scraper.cleanup();
            scraper = null;
        }
    }
});

ipcMain.on('stop-scraping', async (event) => {
    if (scraper) {
        await scraper.stop();
        await scraper.cleanup();
        scraper = null;
        event.reply('scraping-stopped', {
            message: 'Scraping process stopped by user'
        });
    }
});

ipcMain.on('export-results', async (event, { format }) => {
    const result = await exportResults(format, scrapedResults);
    event.reply('export-complete', result);
});