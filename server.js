/**
 * Glenthorpe Cattleitics - Local Native Server (server.js)
 * High-performance, zero-dependency Node.js HTTP server.
 * Handles static file serving, REST API routing, and bi-directional Excel CSV synchronization.
 * Includes dynamic farm paddock layouts configuration storage.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const CATTLE_JSON = path.join(DATA_DIR, 'cattle.json');
const CATTLE_CSV = path.join(DATA_DIR, 'cattle.csv');
const TASKS_JSON = path.join(DATA_DIR, 'tasks.json');
const SETTINGS_JSON = path.join(DATA_DIR, 'settings.json');
const PADDOCKS_JSON = path.join(DATA_DIR, 'paddocks.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_PADDOCKS = [
    { id: 'house_paddock', name: 'House Paddock', size: '5ha', type: 'Sweetveld', category: 'Homestead', description: 'Close to homestead, ideal for maternity and young calves.', coordinates: [[-33.3620, 26.5020], [-33.3620, 26.5040], [-33.3630, 26.5040], [-33.3630, 26.5020]] },
    { id: 'river_field', name: 'River Field', size: '12ha', type: 'Sourveld/Sweetveld mix', category: 'Riverine', description: 'Lush grass near the stream, good water access.', coordinates: [[-33.3630, 26.5020], [-33.3630, 26.5040], [-33.3645, 26.5040], [-33.3645, 26.5020]] },
    { id: 'ridge_pasture', name: 'Ridge Pasture', size: '18ha', type: 'Rocky sweetveld', category: 'Ridge', description: 'High ground, excellent drainage, used for general grazing.', coordinates: [[-33.3610, 26.5040], [-33.3610, 26.5065], [-33.3635, 26.5065], [-33.3635, 26.5040]] },
    { id: 'slope_paddock', name: 'Slope Paddock', size: '8ha', type: 'Wooded grass pasture', category: 'Wooded', description: 'Shaded areas, excellent during hot summer afternoons.', coordinates: [[-33.3635, 26.5040], [-33.3635, 26.5065], [-33.3655, 26.5065], [-33.3655, 26.5040]] }
];

// Seed default paddocks on server startup if not present
if (!fs.existsSync(PADDOCKS_JSON)) {
    fs.writeFileSync(PADDOCKS_JSON, JSON.stringify(DEFAULT_PADDOCKS, null, 2), 'utf8');
}

// MIME Types lookup
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.csv': 'text/csv',
    '.md': 'text/markdown'
};

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;

    // CORS Headers for api robustness
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ==================== API ROUTING ====================
    
    // 1. GET /api/data - Fetches cattle data, checking for Excel CSV updates
    if (pathname === '/api/data' && req.method === 'GET') {
        try {
            const data = syncCattleDatabase();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            console.error("API error reading cattle:", err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Failed to read cattle database" }));
        }
        return;
    }

    // 2. POST /api/save - Saves updated cattle list and regenerates CSV spreadsheet
    if (pathname === '/api/save' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const cattleList = JSON.parse(body);
                saveCattleDatabase(cattleList);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: cattleList.length }));
            } catch (err) {
                console.error("API error saving cattle:", err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Failed to save cattle data" }));
            }
        });
        return;
    }

    // 3. GET /api/tasks - Fetches task records
    if (pathname === '/api/tasks' && req.method === 'GET') {
        try {
            let tasks = [];
            if (fs.existsSync(TASKS_JSON)) {
                tasks = JSON.parse(fs.readFileSync(TASKS_JSON, 'utf8'));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(tasks));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Failed to read tasks" }));
        }
        return;
    }

    // 4. POST /api/tasks - Saves task list
    if (pathname === '/api/tasks' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const tasks = JSON.parse(body);
                fs.writeFileSync(TASKS_JSON, JSON.stringify(tasks, null, 2), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Failed to save tasks" }));
            }
        });
        return;
    }

    // 5. GET /api/settings - Fetches farm settings
    if (pathname === '/api/settings' && req.method === 'GET') {
        try {
            let settings = {};
            if (fs.existsSync(SETTINGS_JSON)) {
                settings = JSON.parse(fs.readFileSync(SETTINGS_JSON, 'utf8'));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(settings));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Failed to read settings" }));
        }
        return;
    }

    // 6. POST /api/settings - Saves settings key-value
    if (pathname === '/api/settings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                let currentSettings = {};
                if (fs.existsSync(SETTINGS_JSON)) {
                    currentSettings = JSON.parse(fs.readFileSync(SETTINGS_JSON, 'utf8'));
                }
                currentSettings[payload.key] = payload.value;
                fs.writeFileSync(SETTINGS_JSON, JSON.stringify(currentSettings, null, 2), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Failed to save settings" }));
            }
        });
        return;
    }

    // 7. GET /api/paddocks - Fetches pastures
    if (pathname === '/api/paddocks' && req.method === 'GET') {
        try {
            let paddocks = DEFAULT_PADDOCKS;
            if (fs.existsSync(PADDOCKS_JSON)) {
                paddocks = JSON.parse(fs.readFileSync(PADDOCKS_JSON, 'utf8'));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(paddocks));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Failed to read paddocks" }));
        }
        return;
    }

    // 8. POST /api/paddocks - Saves pastures
    if (pathname === '/api/paddocks' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const paddocks = JSON.parse(body);
                fs.writeFileSync(PADDOCKS_JSON, JSON.stringify(paddocks, null, 2), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Failed to save paddocks" }));
            }
        });
        return;
    }

    // 9. POST /api/shutdown - Synchronizes, saves database files, and terminates server process
    if (pathname === '/api/shutdown' && req.method === 'POST') {
        try {
            console.log("=======================================================");
            console.log("  SHUTDOWN REQUESTED: Saving and securing database...");
            
            // Sync database files physically
            const data = syncCattleDatabase();
            
            console.log(`  Synchronized ${data.length} stock profiles to cattle.json and cattle.csv.`);
            console.log("  Terminating Glenthorpe Cattleitics Node server process...");
            console.log("=======================================================");
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: "Server shutting down." }));
            
            // Delay exit slightly to allow response to reach the browser cleanly
            setTimeout(() => {
                process.exit(0);
            }, 500);
        } catch (err) {
            console.error("Shutdown error:", err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Failed to shutdown cleanly" }));
        }
        return;
    }

    // ==================== STATIC FILE SERVING ====================
    
    // Resolve home directory
    if (pathname === '/') pathname = '/index.html';

    const filePath = path.join(__dirname, pathname);
    
    // Security check: keep requests inside project root
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end("File not found");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

/**
 * Smart synchronization: Merges Excel CSV changes back into JSON if CSV is newer.
 */
function syncCattleDatabase() {
    let jsonCattle = [];
    if (fs.existsSync(CATTLE_JSON)) {
        try {
            jsonCattle = JSON.parse(fs.readFileSync(CATTLE_JSON, 'utf8'));
        } catch (e) {
            console.error("Malformed cattle.json file, reloading blank list.");
        }
    }

    // If CSV does not exist, write it immediately from the JSON list
    if (!fs.existsSync(CATTLE_CSV)) {
        if (jsonCattle.length > 0) {
            writeCSVSpreadsheet(jsonCattle);
        }
        return jsonCattle;
    }

    // Check modification times
    const jsonMtime = fs.existsSync(CATTLE_JSON) ? fs.statSync(CATTLE_JSON).mtimeMs : 0;
    const csvMtime = fs.statSync(CATTLE_CSV).mtimeMs;

    // If CSV is newer than JSON (user edited it in Excel!), merge the spreadsheet edits
    if (csvMtime > jsonMtime + 2000) { // Add small 2s buffer
        console.log("DETECTED: cattle.csv spreadsheet has been updated more recently than app records. Synchronizing Excel changes...");
        const csvCattle = parseCSVSpreadsheet();
        
        if (csvCattle.length > 0) {
            const mergedList = mergeCattleData(jsonCattle, csvCattle);
            // Save back to JSON and keep them locked
            fs.writeFileSync(CATTLE_JSON, JSON.stringify(mergedList, null, 2), 'utf8');
            // Update CSV timestamp so we don't trigger recursive loads
            fs.utimesSync(CATTLE_CSV, new Date(), new Date());
            return mergedList;
        }
    }

    return jsonCattle;
}

/**
 * Saves cattle list in JSON and exports the updated Excel CSV file.
 */
function saveCattleDatabase(cattleList) {
    fs.writeFileSync(CATTLE_JSON, JSON.stringify(cattleList, null, 2), 'utf8');
    writeCSVSpreadsheet(cattleList);
}

/**
 * Merges spreadsheets edits into core cattle database.
 */
function mergeCattleData(originalList, csvList) {
    const originalMap = new Map(originalList.map(c => [c.tagId, c]));
    
    const merged = csvList.map(csvCow => {
        const orig = originalMap.get(csvCow.tagId);
        
        if (orig) {
            return {
                ...orig,
                name: csvCow.name,
                breed: csvCow.breed,
                gender: csvCow.gender,
                dob: csvCow.dob,
                status: csvCow.status,
                pasture: csvCow.pasture,
                pregnant: csvCow.pregnant,
                expectedCalvingDate: csvCow.expectedCalvingDate,
                inseminationMethod: csvCow.inseminationMethod,
                dam: csvCow.dam,
                sire: csvCow.sire,
                purchaseDate: csvCow.purchaseDate,
                purchasePrice: csvCow.purchasePrice,
                supplier: csvCow.supplier,
                saleDate: csvCow.saleDate,
                salePrice: csvCow.salePrice,
                buyer: csvCow.buyer
            };
        } else {
            return {
                ...csvCow,
                image: null,
                history: [
                    { id: Date.now(), date: new Date().toISOString().split('T')[0], type: 'General', description: 'Cattle profile registered directly via Excel CSV editor.', performer: 'System' }
                ]
            };
        }
    });

    const csvTags = new Set(csvList.map(c => c.tagId));
    originalList.forEach(orig => {
        if (!csvTags.has(orig.tagId)) {
            merged.push(orig);
        }
    });

    return merged;
}

/**
 * Regenerates the physical CSV spreadsheet inside `./data/cattle.csv`.
 */
function writeCSVSpreadsheet(cattleList) {
    const headers = [
        'Tag ID', 'Name', 'Breed', 'Gender', 'Date of Birth', 'Status', 'Current Pasture', 
        'Is Pregnant (TRUE/FALSE)', 'Expected Calving Date', 'Insemination Method', 
        'Dam Tag', 'Sire Tag', 'Purchase Date', 'Purchase Price (ZAR)', 'Supplier',
        'Sale Date', 'Sale Price (ZAR)', 'Buyer'
    ];

    let content = headers.join(',') + '\r\n';

    cattleList.forEach(c => {
        const row = [
            escapeCSV(c.tagId),
            escapeCSV(c.name || ''),
            escapeCSV(c.breed),
            escapeCSV(c.gender),
            escapeCSV(c.dob),
            escapeCSV(c.status),
            escapeCSV(c.pasture),
            c.pregnant ? 'TRUE' : 'FALSE',
            escapeCSV(c.expectedCalvingDate || ''),
            escapeCSV(c.inseminationMethod || ''),
            escapeCSV(c.dam || ''),
            escapeCSV(c.sire || ''),
            escapeCSV(c.purchaseDate || ''),
            c.purchasePrice || 0,
            escapeCSV(c.supplier || ''),
            escapeCSV(c.saleDate || ''),
            c.salePrice || '',
            escapeCSV(c.buyer || '')
        ];
        content += row.join(',') + '\r\n';
    });

    fs.writeFileSync(CATTLE_CSV, content, 'utf8');
}

/**
 * Parses the physical CSV spreadsheet inside `./data/cattle.csv`.
 */
function parseCSVSpreadsheet() {
    const results = [];
    if (!fs.existsSync(CATTLE_CSV)) return results;

    const content = fs.readFileSync(CATTLE_CSV, 'utf8');
    const lines = content.split(/\r?\n/);
    
    if (lines.length < 2) return results;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseCSVRow(line);
        if (cols.length < 6) continue;

        const tagId = cols[0].toUpperCase().trim();
        if (!tagId) continue;

        results.push({
            tagId: tagId,
            name: cols[1] || '',
            breed: cols[2] || 'Nguni',
            gender: cols[3] || 'Cow',
            dob: cols[4] || '',
            status: cols[5] || 'Active',
            pasture: cols[6] || 'house_paddock',
            pregnant: cols[7] ? cols[7].toUpperCase() === 'TRUE' : false,
            expectedCalvingDate: cols[8] || null,
            inseminationMethod: cols[9] || null,
            dam: cols[10] || '',
            sire: cols[11] || '',
            purchaseDate: cols[12] || null,
            purchasePrice: Number(cols[13]) || 0,
            supplier: cols[14] || null,
            saleDate: cols[15] || null,
            salePrice: cols[16] ? Number(cols[16]) : null,
            buyer: cols[17] || null
        });
    }

    return results;
}

/**
 * Helper to escape CSV columns.
 */
function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        str = str.replace(/"/g, '""');
        return `"${str}"`;
    }
    return str;
}

/**
 * Robust CSV parser that handles quotes and nested commas correctly.
 */
function parseCSVRow(text) {
    let p = '', c = '', r = [];
    let q = false;
    for (let i = 0; i < text.length; i++) {
        c = text[i];
        if (c === '"') {
            q = !q;
        } else if (c === ',' && !q) {
            r.push(p);
            p = '';
        } else {
            p += c;
        }
    }
    r.push(p);
    return r;
}

// Start Server
server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  Glenthorpe Cattleitics Node server running locally!`);
    console.log(`  Access the app at: http://localhost:${PORT}`);
    console.log(`  Database files are secured in: ./data/`);
    console.log(`  - Excel Spreadsheet: ./data/cattle.csv`);
    console.log(`  - Raw Database: ./data/cattle.json`);
    console.log(`  - Farm Pastures: ./data/paddocks.json`);
    console.log(`=======================================================`);
});
