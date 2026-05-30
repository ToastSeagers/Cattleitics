/**
 * Glenthorpe Cattleitics - Database Module (db.js)
 * Provides seamless environment-aware storage with three modes:
 * 1. Supabase Cloud: When hosted online (authenticated users, cloud database)
 * 2. Local Server: When served via localhost Node.js (physical file sync)
 * 3. Offline IndexedDB: Fallback for file:// or no connectivity
 */

// Supabase Configuration
const SUPABASE_URL = 'https://pgerylvrwlyhviptwtym.supabase.co';
const SUPABASE_KEY = 'sb_publishable_s-Ckau-hOE1wxEbQaiTziw_URHdCODa';

class CattleiticsDB {
    constructor() {
        this.dbName = 'CattleiticsDB';
        this.dbVersion = 2;
        this.db = null;
        this.supabase = null;
        this.user = null;
        this.mode = 'offline'; // 'supabase', 'server', 'offline'

        // Environment Detection
        this.isLocalServer = window.location.protocol.startsWith('http') &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    }

    /**
     * Initializes storage based on environment.
     */
    async init() {
        // Mode 1: Local development server
        if (this.isLocalServer) {
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    this.mode = 'server';
                    this.storageMode = 'Local Server File Sync';
                    console.log("Cattleitics: Local Node.js server detected. File sync active.");
                    return this;
                }
            } catch (err) {
                console.warn("Local server not responding, checking Supabase...");
            }
        }

        // Mode 2: Supabase cloud (when hosted online or local server unavailable)
        if (window.supabase) {
            try {
                this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                const { data: { session } } = await this.supabase.auth.getSession();
                if (session) {
                    this.user = session.user;
                    this.mode = 'supabase';
                    this.storageMode = 'Cloud Sync (Supabase)';
                    console.log("Cattleitics: Authenticated. Cloud sync active.");
                    return this;
                }
            } catch (err) {
                console.warn("Supabase connection failed:", err.message);
            }
        }

        // Mode 3: Offline IndexedDB fallback
        this.mode = 'offline';
        this.storageMode = 'Offline Browser Mode';
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("Cattleitics: Offline browser storage active.");
                resolve(this);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('cattle')) {
                    const cattleStore = db.createObjectStore('cattle', { keyPath: 'tagId' });
                    cattleStore.createIndex('gender', 'gender', { unique: false });
                    cattleStore.createIndex('pasture', 'pasture', { unique: false });
                    cattleStore.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains('tasks')) {
                    const tasksStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                    tasksStore.createIndex('dueDate', 'dueDate', { unique: false });
                    tasksStore.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // ==================== AUTH METHODS ====================

    /**
     * Sign up a new farmer account.
     */
    async signUp(email, password, farmName) {
        if (!this.supabase) throw new Error("Cloud mode not available");
        const { data, error } = await this.supabase.auth.signUp({ email, password });
        if (error) throw error;

        // Update profile with farm name
        if (data.user && farmName) {
            await this.supabase.from('profiles').update({ farm_name: farmName }).eq('id', data.user.id);
        }

        this.user = data.user;
        this.mode = 'supabase';
        this.storageMode = 'Cloud Sync (Supabase)';
        return data;
    }

    /**
     * Sign in an existing farmer.
     */
    async signIn(email, password) {
        if (!this.supabase) throw new Error("Cloud mode not available");
        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        this.user = data.user;
        this.mode = 'supabase';
        this.storageMode = 'Cloud Sync (Supabase)';
        return data;
    }

    /**
     * Sign out the current user.
     */
    async signOut() {
        if (!this.supabase) return;
        await this.supabase.auth.signOut();
        this.user = null;
        this.mode = 'offline';
        this.storageMode = 'Offline Browser Mode';
    }

    /**
     * Get current authenticated user.
     */
    getUser() {
        return this.user;
    }

    /**
     * Check if user is authenticated (for cloud mode).
     */
    isAuthenticated() {
        return this.mode === 'supabase' && this.user !== null;
    }

    /**
     * Listen for auth state changes.
     */
    onAuthStateChange(callback) {
        if (!this.supabase) return;
        this.supabase.auth.onAuthStateChange((event, session) => {
            this.user = session?.user || null;
            if (this.user) {
                this.mode = 'supabase';
                this.storageMode = 'Cloud Sync (Supabase)';
            }
            callback(event, session);
        });
    }

    // ==================== CATTLE METHODS ====================

    /**
     * Retrieves all cattle.
     */
    async getAllCattle() {
        if (this.mode === 'supabase') {
            const { data: cattleRows, error } = await this.supabase
                .from('cattle')
                .select('*')
                .order('created_at');
            if (error) throw error;

            // Fetch history for all cattle
            const cattleIds = cattleRows.map(c => c.id);
            let historyRows = [];
            if (cattleIds.length > 0) {
                const { data: hData, error: hErr } = await this.supabase
                    .from('cattle_history')
                    .select('*')
                    .in('cattle_id', cattleIds)
                    .order('date');
                if (!hErr) historyRows = hData;
            }

            // Map to app format
            return cattleRows.map(row => this._dbRowToAppFormat(row, historyRows.filter(h => h.cattle_id === row.id)));
        }

        if (this.mode === 'server') {
            const response = await fetch('/api/data');
            if (!response.ok) throw new Error("Failed to load cattle from server");
            return await response.json();
        }

        // Offline
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cattle'], 'readonly');
            const store = transaction.objectStore('cattle');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Retrieve a single cow profile by Tag ID.
     */
    async getCow(tagId) {
        if (this.mode === 'supabase') {
            const { data: rows, error } = await this.supabase
                .from('cattle')
                .select('*')
                .eq('tag_id', tagId)
                .limit(1);
            if (error) throw error;
            if (rows.length === 0) return null;

            const { data: history } = await this.supabase
                .from('cattle_history')
                .select('*')
                .eq('cattle_id', rows[0].id)
                .order('date');

            return this._dbRowToAppFormat(rows[0], history || []);
        }

        const cattle = await this.getAllCattle();
        return cattle.find(c => c.tagId === tagId) || null;
    }

    /**
     * Adds or updates a cow profile.
     */
    async saveCow(cowData) {
        if (this.mode === 'supabase') {
            const dbRow = this._appFormatToDbRow(cowData);

            // Upsert cattle record
            const { data: upserted, error } = await this.supabase
                .from('cattle')
                .upsert(dbRow, { onConflict: 'user_id,tag_id' })
                .select()
                .single();
            if (error) throw error;

            // Sync history: delete existing and re-insert
            if (cowData.history && cowData.history.length > 0) {
                await this.supabase.from('cattle_history').delete().eq('cattle_id', upserted.id);

                const historyRows = cowData.history.map(h => ({
                    user_id: this.user.id,
                    cattle_id: upserted.id,
                    date: h.date || '',
                    type: h.type || 'General',
                    description: h.description || '',
                    performer: h.performer || ''
                }));
                await this.supabase.from('cattle_history').insert(historyRows);
            }

            return cowData;
        }

        if (this.mode === 'server') {
            const currentList = await this.getAllCattle();
            const index = currentList.findIndex(c => c.tagId === cowData.tagId);
            if (index > -1) {
                currentList[index] = cowData;
            } else {
                currentList.push(cowData);
            }
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentList)
            });
            if (!response.ok) throw new Error("Failed to save cow to server files");
            return cowData;
        }

        // Offline
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cattle'], 'readwrite');
            const store = transaction.objectStore('cattle');
            const request = store.put(cowData);
            request.onsuccess = () => resolve(cowData);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Deletes a cow record.
     */
    async deleteCow(tagId) {
        if (this.mode === 'supabase') {
            const { error } = await this.supabase
                .from('cattle')
                .delete()
                .eq('tag_id', tagId)
                .eq('user_id', this.user.id);
            if (error) throw error;
            return true;
        }

        if (this.mode === 'server') {
            const currentList = await this.getAllCattle();
            const filteredList = currentList.filter(c => c.tagId !== tagId);
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filteredList)
            });
            if (!response.ok) throw new Error("Failed to delete cow from server files");
            return true;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cattle'], 'readwrite');
            const store = transaction.objectStore('cattle');
            const request = store.delete(tagId);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Bulk overwrite cattle records.
     */
    async bulkSaveCattle(cattleList) {
        if (this.mode === 'supabase') {
            // Delete all existing cattle for this user, then re-insert
            await this.supabase.from('cattle').delete().eq('user_id', this.user.id);

            for (const cow of cattleList) {
                await this.saveCow(cow);
            }
            return true;
        }

        if (this.mode === 'server') {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cattleList)
            });
            if (!response.ok) throw new Error("Failed to bulk save cattle to server");
            return true;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cattle'], 'readwrite');
            const store = transaction.objectStore('cattle');
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
            cattleList.forEach(cow => store.put(cow));
        });
    }

    /**
     * Wipes all cattle records.
     */
    async clearAllCattle() {
        if (this.mode === 'supabase') {
            const { error } = await this.supabase
                .from('cattle')
                .delete()
                .eq('user_id', this.user.id);
            if (error) throw error;
            return true;
        }

        if (this.mode === 'server') {
            const response = await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([])
            });
            if (!response.ok) throw new Error("Failed to clear cattle from server");
            return true;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['cattle'], 'readwrite');
            const store = transaction.objectStore('cattle');
            const request = store.clear();
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== TASKS METHODS ====================

    /**
     * Retrieves all scheduled tasks.
     */
    async getAllTasks() {
        if (this.mode === 'supabase') {
            const { data, error } = await this.supabase
                .from('tasks')
                .select('*')
                .order('created_at');
            if (error) throw error;
            return data.map(t => ({
                id: t.id,
                title: t.title,
                description: t.description,
                dueDate: t.due_date,
                status: t.status,
                priority: t.priority,
                cattleTag: t.cattle_tag
            }));
        }

        if (this.mode === 'server') {
            const response = await fetch('/api/tasks');
            if (!response.ok) throw new Error("Failed to fetch tasks from server");
            return await response.json();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readonly');
            const store = transaction.objectStore('tasks');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save/Create a task.
     */
    async saveTask(taskData) {
        if (this.mode === 'supabase') {
            const row = {
                user_id: this.user.id,
                title: taskData.title,
                description: taskData.description,
                due_date: taskData.dueDate,
                status: taskData.status || 'pending',
                priority: taskData.priority || 'medium',
                cattle_tag: taskData.cattleTag || null
            };

            if (taskData.id && typeof taskData.id === 'string' && taskData.id.includes('-')) {
                // Existing UUID - update
                const { data, error } = await this.supabase
                    .from('tasks')
                    .update(row)
                    .eq('id', taskData.id)
                    .select()
                    .single();
                if (error) throw error;
                taskData.id = data.id;
            } else {
                // New task - insert
                const { data, error } = await this.supabase
                    .from('tasks')
                    .insert(row)
                    .select()
                    .single();
                if (error) throw error;
                taskData.id = data.id;
            }
            return taskData;
        }

        if (this.mode === 'server') {
            const currentList = await this.getAllTasks();
            if (taskData.id) {
                const index = currentList.findIndex(t => t.id === taskData.id);
                if (index > -1) currentList[index] = taskData;
            } else {
                taskData.id = Date.now();
                currentList.push(taskData);
            }
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentList)
            });
            if (!response.ok) throw new Error("Failed to save task to server files");
            return taskData;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.put(taskData);
            request.onsuccess = (event) => {
                if (!taskData.id) taskData.id = event.target.result;
                resolve(taskData);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Deletes a task.
     */
    async deleteTask(taskId) {
        if (this.mode === 'supabase') {
            const { error } = await this.supabase
                .from('tasks')
                .delete()
                .eq('id', taskId);
            if (error) throw error;
            return true;
        }

        if (this.mode === 'server') {
            const currentList = await this.getAllTasks();
            const filteredList = currentList.filter(t => t.id !== taskId);
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filteredList)
            });
            if (!response.ok) throw new Error("Failed to delete task from server files");
            return true;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['tasks'], 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = store.delete(taskId);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== PADDOCKS METHODS ====================

    /**
     * Retrieves all pastures/paddocks.
     */
    async getAllPaddocks() {
        if (this.mode === 'supabase') {
            const { data, error } = await this.supabase
                .from('paddocks')
                .select('*');
            if (error) throw error;
            return data.map(p => ({
                id: p.paddock_id,
                name: p.name,
                size: p.size,
                type: p.type,
                category: p.category,
                description: p.description,
                coordinates: p.coordinates
            }));
        }

        if (this.mode === 'server') {
            const response = await fetch('/api/paddocks');
            if (!response.ok) throw new Error("Failed to fetch paddocks from server");
            return await response.json();
        }

        const offlinePaddocks = await this.getSetting('paddocks');
        return offlinePaddocks || [];
    }

    /**
     * Overwrites all pastures/paddocks.
     */
    async savePaddocks(paddocksList) {
        if (this.mode === 'supabase') {
            // Delete existing and re-insert
            await this.supabase.from('paddocks').delete().eq('user_id', this.user.id);

            if (paddocksList.length > 0) {
                const rows = paddocksList.map(p => ({
                    user_id: this.user.id,
                    paddock_id: p.id,
                    name: p.name,
                    size: p.size,
                    type: p.type,
                    category: p.category,
                    description: p.description,
                    coordinates: p.coordinates
                }));
                const { error } = await this.supabase.from('paddocks').insert(rows);
                if (error) throw error;
            }
            return true;
        }

        if (this.mode === 'server') {
            const response = await fetch('/api/paddocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(paddocksList)
            });
            if (!response.ok) throw new Error("Failed to save paddocks to server");
            return true;
        }

        await this.saveSetting('paddocks', paddocksList);
        return true;
    }

    // ==================== SETTINGS METHODS ====================

    /**
     * Saves generic setting.
     */
    async saveSetting(key, value) {
        if (this.mode === 'supabase') {
            const { error } = await this.supabase
                .from('settings')
                .upsert({ user_id: this.user.id, key, value }, { onConflict: 'user_id,key' });
            if (error) throw error;
            return value;
        }

        if (this.mode === 'server') {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value })
            });
            if (!response.ok) throw new Error("Failed to save setting to server");
            return value;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });
            request.onsuccess = () => resolve(value);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Retrieves setting value.
     */
    async getSetting(key) {
        if (this.mode === 'supabase') {
            const { data, error } = await this.supabase
                .from('settings')
                .select('value')
                .eq('key', key)
                .limit(1);
            if (error) throw error;
            return data.length > 0 ? data[0].value : null;
        }

        if (this.mode === 'server') {
            const response = await fetch('/api/settings');
            if (!response.ok) throw new Error("Failed to get settings from server");
            const settings = await response.json();
            return settings[key] || null;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }

    // ==================== DATA FORMAT HELPERS ====================

    /**
     * Converts a Supabase database row to the app's internal format.
     */
    _dbRowToAppFormat(row, historyRows = []) {
        return {
            tagId: row.tag_id,
            name: row.name || '',
            breed: row.breed || 'Nguni',
            gender: row.gender || 'Cow',
            dob: row.dob || '',
            status: row.status || 'Active',
            pregnant: row.pregnant || false,
            expectedCalvingDate: row.expected_calving_date || null,
            inseminationMethod: row.insemination_method || null,
            dam: row.dam || '',
            sire: row.sire || '',
            pasture: row.pasture || '',
            purchasePrice: row.purchase_price,
            purchaseDate: row.purchase_date || '',
            supplier: row.supplier || '',
            salePrice: row.sale_price,
            saleDate: row.sale_date || null,
            buyer: row.buyer || null,
            image: row.image || '',
            history: historyRows.map(h => ({
                id: h.id,
                date: h.date,
                type: h.type,
                description: h.description,
                performer: h.performer
            }))
        };
    }

    /**
     * Converts app format to Supabase database row.
     */
    _appFormatToDbRow(cowData) {
        return {
            user_id: this.user.id,
            tag_id: cowData.tagId,
            name: cowData.name || '',
            breed: cowData.breed || 'Nguni',
            gender: cowData.gender || 'Cow',
            dob: cowData.dob || '',
            status: cowData.status || 'Active',
            pregnant: cowData.pregnant || false,
            expected_calving_date: cowData.expectedCalvingDate || null,
            insemination_method: cowData.inseminationMethod || null,
            dam: cowData.dam || '',
            sire: cowData.sire || '',
            pasture: cowData.pasture || '',
            purchase_price: cowData.purchasePrice || null,
            purchase_date: cowData.purchaseDate || '',
            supplier: cowData.supplier || '',
            sale_price: cowData.salePrice || null,
            sale_date: cowData.saleDate || null,
            buyer: cowData.buyer || null,
            image: cowData.image || ''
        };
    }

    // ==================== EXPORT METHODS ====================

    /**
     * Export all cattle data as CSV string (for download).
     */
    async exportCSV() {
        const cattle = await this.getAllCattle();
        const headers = [
            'Tag ID', 'Name', 'Breed', 'Gender', 'Date of Birth', 'Status',
            'Current Pasture', 'Is Pregnant', 'Expected Calving Date',
            'Insemination Method', 'Dam Tag', 'Sire Tag', 'Purchase Date',
            'Purchase Price (ZAR)', 'Supplier', 'Sale Date', 'Sale Price (ZAR)', 'Buyer'
        ];

        let csv = headers.join(',') + '\n';
        cattle.forEach(c => {
            const row = [
                c.tagId, c.name, c.breed, c.gender, c.dob, c.status, c.pasture,
                c.pregnant ? 'TRUE' : 'FALSE', c.expectedCalvingDate || '',
                c.inseminationMethod || '', c.dam, c.sire, c.purchaseDate || '',
                c.purchasePrice || '', c.supplier || '', c.saleDate || '',
                c.salePrice || '', c.buyer || ''
            ].map(v => {
                const s = String(v || '');
                return s.includes(',') ? `"${s}"` : s;
            });
            csv += row.join(',') + '\n';
        });
        return csv;
    }
}

/**
 * Image Compression Utility
 */
function compressImage(file, maxDimension = 600, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxDimension) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    }
                } else {
                    if (height > maxDimension) {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}
