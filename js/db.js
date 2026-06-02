/**
 * Cattleitics - Database Module (db.js)
 * Provides seamless environment-aware storage with three modes:
 * 1. Supabase Cloud: When hosted online (authenticated users, farm-based cloud database)
 * 2. Local Server: When served via localhost Node.js (physical file sync)
 * 3. Offline IndexedDB: Fallback for file:// or no connectivity
 *
 * V2: Multi-user farm model. Data belongs to farms, not individual users.
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
        this.farmId = null;       // Active farm UUID
        this.farmRole = null;     // 'owner', 'admin', 'member'
        this.globalRole = null;   // 'user' or 'superadmin'
        this.mode = 'offline';    // 'supabase', 'server', 'offline'

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
                    console.log("Cattleitics: Local Node.js server detected.");
                    return this;
                }
            } catch (err) {
                console.warn("Local server not responding, checking Supabase...");
            }
        }

        // Mode 2: Supabase cloud
        if (window.supabase) {
            try {
                this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                const { data: { session } } = await this.supabase.auth.getSession();
                if (session) {
                    this.user = session.user;
                    this.mode = 'supabase';
                    this.storageMode = 'Cloud Sync (Supabase)';
                    await this._loadFarmContext();
                    console.log("Cattleitics: Authenticated. Farm:", this.farmId);
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
            request.onerror = (event) => reject(event.target.error);
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("Cattleitics: Offline browser storage active.");
                resolve(this);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('cattle')) {
                    const s = db.createObjectStore('cattle', { keyPath: 'tagId' });
                    s.createIndex('gender', 'gender', { unique: false });
                    s.createIndex('pasture', 'pasture', { unique: false });
                    s.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains('tasks')) {
                    const s = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                    s.createIndex('dueDate', 'dueDate', { unique: false });
                    s.createIndex('status', 'status', { unique: false });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // ==================== FARM CONTEXT ====================

    /**
     * Loads the user's active farm and role after authentication.
     */
    async _loadFarmContext() {
        // Get profile with active_farm_id and global_role
        const { data: profile, error } = await this.supabase
            .from('profiles')
            .select('active_farm_id, global_role')
            .eq('id', this.user.id)
            .single();

        if (error || !profile) {
            console.warn("Could not load profile:", error?.message);
            return;
        }

        this.globalRole = profile.global_role || 'user';
        this.farmId = profile.active_farm_id;

        // If no active farm, try to find one they're a member of
        if (!this.farmId) {
            const { data: memberships } = await this.supabase
                .from('farm_members')
                .select('farm_id, role')
                .eq('user_id', this.user.id)
                .limit(1);
            if (memberships && memberships.length > 0) {
                this.farmId = memberships[0].farm_id;
                this.farmRole = memberships[0].role;
                // Save as active
                await this.supabase.from('profiles')
                    .update({ active_farm_id: this.farmId })
                    .eq('id', this.user.id);
            }
        } else {
            // Get role for this farm
            const { data: membership } = await this.supabase
                .from('farm_members')
                .select('role')
                .eq('farm_id', this.farmId)
                .eq('user_id', this.user.id)
                .single();
            this.farmRole = membership?.role || (this.globalRole === 'superadmin' ? 'owner' : 'member');
        }
    }

    /**
     * Get list of farms the user belongs to.
     */
    async getUserFarms() {
        if (!this.supabase) return [];
        const { data, error } = await this.supabase
            .from('farm_members')
            .select('farm_id, role, farms(id, name, location)')
            .eq('user_id', this.user.id);
        if (error) return [];
        return data.map(m => ({ id: m.farms.id, name: m.farms.name, location: m.farms.location, role: m.role }));
    }

    /**
     * Switch active farm context.
     */
    async switchFarm(farmId) {
        this.farmId = farmId;
        await this.supabase.from('profiles')
            .update({ active_farm_id: farmId })
            .eq('id', this.user.id);
        // Reload role
        const { data: membership } = await this.supabase
            .from('farm_members')
            .select('role')
            .eq('farm_id', farmId)
            .eq('user_id', this.user.id)
            .single();
        this.farmRole = membership?.role || (this.globalRole === 'superadmin' ? 'owner' : 'member');
    }

    /**
     * Get members of the current farm.
     */
    async getFarmMembers() {
        if (!this.farmId) return [];
        const { data, error } = await this.supabase
            .from('farm_members_with_profiles')
            .select('*')
            .eq('farm_id', this.farmId);
        if (error) return [];
        return data.map(m => ({
            user_id: m.user_id,
            role: m.role,
            joined_at: m.joined_at,
            profiles: { farm_name: m.profile_farm_name, owner_name: m.profile_owner_name }
        }));
    }

    /**
     * Invite a user to the current farm by email.
     */
    async inviteFarmMember(userId, role = 'member') {
        if (!this.farmId) throw new Error("No active farm");
        const { error } = await this.supabase
            .from('farm_members')
            .insert({ farm_id: this.farmId, user_id: userId, role });
        if (error) throw error;
    }

    /**
     * Remove a member from the current farm.
     */
    async removeFarmMember(userId) {
        if (!this.farmId) throw new Error("No active farm");
        const { error } = await this.supabase
            .from('farm_members')
            .delete()
            .eq('farm_id', this.farmId)
            .eq('user_id', userId);
        if (error) throw error;
    }

    /**
     * Update farm details (name, location).
     */
    async updateFarm(updates) {
        if (!this.farmId) throw new Error("No active farm");
        const { error } = await this.supabase
            .from('farms')
            .update(updates)
            .eq('id', this.farmId);
        if (error) throw error;
    }

    /**
     * Check if user is superadmin.
     */
    isSuperAdmin() {
        return this.globalRole === 'superadmin';
    }

    /**
     * Check if user is farm admin/owner.
     */
    isFarmAdmin() {
        return this.globalRole === 'superadmin' || this.farmRole === 'owner' || this.farmRole === 'admin';
    }

    // ==================== AUTH METHODS ====================

    async signUp(email, password, farmName, fullName) {
        if (!this.supabase) throw new Error("Cloud mode not available");
        const { data, error } = await this.supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data.session) {
            this.user = data.session.user;
            this.mode = 'supabase';
            this.storageMode = 'Cloud Sync (Supabase)';

            // Update profile with full name
            if (this.user) {
                await this.supabase.from('profiles')
                    .update({ owner_name: fullName || '' })
                    .eq('id', this.user.id);
            }

            // Load farm context — the trigger may or may not have created a farm
            await this._loadFarmContext();

            // If a farm name was provided and no farm exists yet, create one
            if (farmName && !this.farmId) {
                const { data: newFarm, error: farmErr } = await this.supabase
                    .from('farms')
                    .insert({ name: farmName, created_by: this.user.id })
                    .select()
                    .single();
                if (!farmErr && newFarm) {
                    this.farmId = newFarm.id;
                    await this.supabase.from('farm_members')
                        .insert({ farm_id: newFarm.id, user_id: this.user.id, role: 'owner' });
                    await this.supabase.from('profiles')
                        .update({ active_farm_id: newFarm.id })
                        .eq('id', this.user.id);
                }
            } else if (farmName && this.farmId) {
                // Farm was auto-created by trigger, update its name
                await this.supabase.from('farms').update({ name: farmName }).eq('id', this.farmId);
            }
        } else if (data.user) {
            this.user = data.user;
            this.mode = 'supabase';
            this.storageMode = 'Cloud Sync (Supabase)';
        }
        return data;
    }

    async signIn(email, password) {
        if (!this.supabase) throw new Error("Cloud mode not available");
        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        this.user = data.user;
        this.mode = 'supabase';
        this.storageMode = 'Cloud Sync (Supabase)';
        await this._loadFarmContext();
        return data;
    }

    async signOut() {
        if (!this.supabase) return;
        await this.supabase.auth.signOut();
        this.user = null;
        this.farmId = null;
        this.farmRole = null;
        this.globalRole = null;
        this.mode = 'offline';
        this.storageMode = 'Offline Browser Mode';
    }

    getUser() { return this.user; }
    isAuthenticated() { return this.mode === 'supabase' && this.user !== null; }

    onAuthStateChange(callback) {
        if (!this.supabase) return;
        this.supabase.auth.onAuthStateChange(async (event, session) => {
            this.user = session?.user || null;
            if (this.user) {
                this.mode = 'supabase';
                this.storageMode = 'Cloud Sync (Supabase)';
                await this._loadFarmContext();
            }
            callback(event, session);
        });
    }

    // ==================== CATTLE METHODS ====================

    async getAllCattle() {
        if (this.mode === 'supabase') {
            if (!this.farmId) return [];
            const { data: cattleRows, error } = await this.supabase
                .from('cattle').select('*')
                .eq('farm_id', this.farmId)
                .order('created_at');
            if (error) throw error;

            const cattleIds = cattleRows.map(c => c.id);
            let historyRows = [];
            if (cattleIds.length > 0) {
                const { data: hData, error: hErr } = await this.supabase
                    .from('cattle_history').select('*')
                    .in('cattle_id', cattleIds)
                    .order('date');
                if (!hErr) historyRows = hData;
            }
            return cattleRows.map(row => this._dbRowToAppFormat(row, historyRows.filter(h => h.cattle_id === row.id)));
        }
        if (this.mode === 'server') {
            const r = await fetch('/api/data');
            if (!r.ok) throw new Error("Failed to load cattle from server");
            return await r.json();
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cattle'], 'readonly');
            const req = tx.objectStore('cattle').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getCow(tagId) {
        if (this.mode === 'supabase') {
            if (!this.farmId) return null;
            const { data: rows, error } = await this.supabase
                .from('cattle').select('*')
                .eq('farm_id', this.farmId)
                .eq('tag_id', tagId).limit(1);
            if (error) throw error;
            if (rows.length === 0) return null;
            const { data: history } = await this.supabase
                .from('cattle_history').select('*')
                .eq('cattle_id', rows[0].id).order('date');
            return this._dbRowToAppFormat(rows[0], history || []);
        }
        const cattle = await this.getAllCattle();
        return cattle.find(c => c.tagId === tagId) || null;
    }

    async saveCow(cowData) {
        if (this.mode === 'supabase') {
            if (!this.farmId) throw new Error("No active farm");
            const dbRow = this._appFormatToDbRow(cowData);
            const { data: upserted, error } = await this.supabase
                .from('cattle')
                .upsert(dbRow, { onConflict: 'farm_id,tag_id' })
                .select().single();
            if (error) throw error;

            // Sync history
            if (cowData.history && cowData.history.length > 0) {
                await this.supabase.from('cattle_history').delete().eq('cattle_id', upserted.id);
                const historyRows = cowData.history.map(h => ({
                    farm_id: this.farmId,
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
            const list = await this.getAllCattle();
            const idx = list.findIndex(c => c.tagId === cowData.tagId);
            if (idx > -1) list[idx] = cowData; else list.push(cowData);
            const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list) });
            if (!r.ok) throw new Error("Failed to save cow to server");
            return cowData;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cattle'], 'readwrite');
            const req = tx.objectStore('cattle').put(cowData);
            req.onsuccess = () => resolve(cowData);
            req.onerror = () => reject(req.error);
        });
    }

    async deleteCow(tagId) {
        if (this.mode === 'supabase') {
            if (!this.farmId) throw new Error("No active farm");
            const { error } = await this.supabase.from('cattle').delete()
                .eq('tag_id', tagId).eq('farm_id', this.farmId);
            if (error) throw error;
            return true;
        }
        if (this.mode === 'server') {
            const list = await this.getAllCattle();
            const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list.filter(c => c.tagId !== tagId)) });
            if (!r.ok) throw new Error("Failed to delete cow from server");
            return true;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cattle'], 'readwrite');
            const req = tx.objectStore('cattle').delete(tagId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async bulkSaveCattle(cattleList) {
        if (this.mode === 'supabase') {
            if (!this.farmId) throw new Error("No active farm");
            // Delete existing cattle for this farm
            await this.supabase.from('cattle').delete().eq('farm_id', this.farmId);
            for (const cow of cattleList) { await this.saveCow(cow); }
            return true;
        }
        if (this.mode === 'server') {
            const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cattleList) });
            if (!r.ok) throw new Error("Failed to bulk save cattle to server");
            return true;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cattle'], 'readwrite');
            const store = tx.objectStore('cattle');
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
            cattleList.forEach(cow => store.put(cow));
        });
    }

    async clearAllCattle() {
        if (this.mode === 'supabase') {
            if (!this.farmId) throw new Error("No active farm");
            const { error } = await this.supabase.from('cattle').delete().eq('farm_id', this.farmId);
            if (error) throw error;
            return true;
        }
        if (this.mode === 'server') {
            const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([]) });
            if (!r.ok) throw new Error("Failed to clear cattle");
            return true;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['cattle'], 'readwrite');
            const req = tx.objectStore('cattle').clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    // ==================== TASKS METHODS ====================

    async getAllTasks() {
        if (this.mode === 'supabase') {
            if (!this.farmId) return [];
            const { data, error } = await this.supabase.from('tasks').select('*')
                .eq('farm_id', this.farmId).order('created_at');
            if (error) throw error;
            return data.map(t => ({ id: t.id, title: t.title, description: t.description, dueDate: t.due_date, status: t.status, priority: t.priority, cattleTag: t.cattle_tag }));
        }
        if (this.mode === 'server') {
            const r = await fetch('/api/tasks');
            if (!r.ok) throw new Error("Failed to fetch tasks");
            return await r.json();
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['tasks'], 'readonly');
            const req = tx.objectStore('tasks').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async saveTask(taskData) {
        if (this.mode === 'supabase') {
            if (!this.farmId) throw new Error("No active farm");
            const row = { farm_id: this.farmId, title: taskData.title, description: taskData.description, due_date: taskData.dueDate, status: taskData.status || 'pending', priority: taskData.priority || 'medium', cattle_tag: taskData.cattleTag || null };
            if (taskData.id && typeof taskData.id === 'string' && taskData.id.includes('-')) {
                const { data, error } = await this.supabase.from('tasks').update(row).eq('id', taskData.id).select().single();
                if (error) throw error;
                taskData.id = data.id;
            } else {
                const { data, error } = await this.supabase.from('tasks').insert(row).select().single();
                if (error) throw error;
                taskData.id = data.id;
            }
            return taskData;
        }
        if (this.mode === 'server') {
            const list = await this.getAllTasks();
            if (taskData.id) { const i = list.findIndex(t => t.id === taskData.id); if (i > -1) list[i] = taskData; }
            else { taskData.id = Date.now(); list.push(taskData); }
            const r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list) });
            if (!r.ok) throw new Error("Failed to save task");
            return taskData;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['tasks'], 'readwrite');
            const req = tx.objectStore('tasks').put(taskData);
            req.onsuccess = (e) => { if (!taskData.id) taskData.id = e.target.result; resolve(taskData); };
            req.onerror = () => reject(req.error);
        });
    }

    async deleteTask(taskId) {
        if (this.mode === 'supabase') {
            const { error } = await this.supabase.from('tasks').delete().eq('id', taskId);
            if (error) throw error;
            return true;
        }
        if (this.mode === 'server') {
            const list = await this.getAllTasks();
            const r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(list.filter(t => t.id !== taskId)) });
            if (!r.ok) throw new Error("Failed to delete task");
            return true;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['tasks'], 'readwrite');
            const req = tx.objectStore('tasks').delete(taskId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    // ==================== PADDOCKS METHODS ====================

    async getAllPaddocks() {
        if (this.mode === 'supabase') {
            if (!this.farmId) return [];
            const { data, error } = await this.supabase.from('paddocks').select('*')
                .eq('farm_id', this.farmId);
            if (error) throw error;
            return data.map(p => ({ id: p.paddock_id, name: p.name, size: p.size, type: p.type, category: p.category, description: p.description, coordinates: p.coordinates }));
        }
        if (this.mode === 'server') {
            const r = await fetch('/api/paddocks');
            if (!r.ok) throw new Error("Failed to fetch paddocks");
            return await r.json();
        }
        const offline = await this.getSetting('paddocks');
        return offline || [];
    }

    async savePaddocks(paddocksList) {
        if (this.mode === 'supabase') {
            if (!this.farmId) throw new Error("No active farm");
            await this.supabase.from('paddocks').delete().eq('farm_id', this.farmId);
            if (paddocksList.length > 0) {
                const rows = paddocksList.map(p => ({ farm_id: this.farmId, paddock_id: p.id, name: p.name, size: p.size, type: p.type, category: p.category, description: p.description, coordinates: p.coordinates }));
                const { error } = await this.supabase.from('paddocks').insert(rows);
                if (error) throw error;
            }
            return true;
        }
        if (this.mode === 'server') {
            const r = await fetch('/api/paddocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paddocksList) });
            if (!r.ok) throw new Error("Failed to save paddocks");
            return true;
        }
        await this.saveSetting('paddocks', paddocksList);
        return true;
    }

    // ==================== SETTINGS METHODS ====================

    async saveSetting(key, value) {
        if (this.mode === 'supabase') {
            if (!this.farmId) throw new Error("No active farm");
            const { error } = await this.supabase.from('settings')
                .upsert({ farm_id: this.farmId, key, value }, { onConflict: 'farm_id,key' });
            if (error) throw error;
            return value;
        }
        if (this.mode === 'server') {
            const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
            if (!r.ok) throw new Error("Failed to save setting");
            return value;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['settings'], 'readwrite');
            const req = tx.objectStore('settings').put({ key, value });
            req.onsuccess = () => resolve(value);
            req.onerror = () => reject(req.error);
        });
    }

    async getSetting(key) {
        if (this.mode === 'supabase') {
            if (!this.farmId) return null;
            const { data, error } = await this.supabase.from('settings')
                .select('value').eq('farm_id', this.farmId).eq('key', key).limit(1);
            if (error) throw error;
            return data.length > 0 ? data[0].value : null;
        }
        if (this.mode === 'server') {
            const r = await fetch('/api/settings');
            if (!r.ok) throw new Error("Failed to get settings");
            const settings = await r.json();
            return settings[key] || null;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['settings'], 'readonly');
            const req = tx.objectStore('settings').get(key);
            req.onsuccess = () => resolve(req.result ? req.result.value : null);
            req.onerror = () => reject(req.error);
        });
    }

    // ==================== DATA FORMAT HELPERS ====================

    _dbRowToAppFormat(row, historyRows = []) {
        return {
            tagId: row.tag_id, name: row.name || '', breed: row.breed || 'Nguni',
            gender: row.gender || 'Cow', dob: row.dob || '', status: row.status || 'Active',
            pregnant: row.pregnant || false, expectedCalvingDate: row.expected_calving_date || null,
            inseminationMethod: row.insemination_method || null, dam: row.dam || '',
            sire: row.sire || '', pasture: row.pasture || '',
            purchasePrice: row.purchase_price, purchaseDate: row.purchase_date || '',
            supplier: row.supplier || '', salePrice: row.sale_price,
            saleDate: row.sale_date || null, buyer: row.buyer || null,
            image: row.image || '',
            history: historyRows.map(h => ({ id: h.id, date: h.date, type: h.type, description: h.description, performer: h.performer }))
        };
    }

    _appFormatToDbRow(cowData) {
        return {
            farm_id: this.farmId,
            tag_id: cowData.tagId, name: cowData.name || '', breed: cowData.breed || 'Nguni',
            gender: cowData.gender || 'Cow', dob: cowData.dob || '', status: cowData.status || 'Active',
            pregnant: cowData.pregnant || false, expected_calving_date: cowData.expectedCalvingDate || null,
            insemination_method: cowData.inseminationMethod || null, dam: cowData.dam || '',
            sire: cowData.sire || '', pasture: cowData.pasture || '',
            purchase_price: cowData.purchasePrice || null, purchase_date: cowData.purchaseDate || '',
            supplier: cowData.supplier || '', sale_price: cowData.salePrice || null,
            sale_date: cowData.saleDate || null, buyer: cowData.buyer || null,
            image: cowData.image || ''
        };
    }

    // ==================== EXPORT ====================

    async exportCSV() {
        const cattle = await this.getAllCattle();
        const headers = ['Tag ID','Name','Breed','Gender','Date of Birth','Status','Current Pasture','Is Pregnant','Expected Calving Date','Insemination Method','Dam Tag','Sire Tag','Purchase Date','Purchase Price (ZAR)','Supplier','Sale Date','Sale Price (ZAR)','Buyer'];
        let csv = headers.join(',') + '\n';
        cattle.forEach(c => {
            const row = [c.tagId, c.name, c.breed, c.gender, c.dob, c.status, c.pasture, c.pregnant ? 'TRUE' : 'FALSE', c.expectedCalvingDate || '', c.inseminationMethod || '', c.dam, c.sire, c.purchaseDate || '', c.purchasePrice || '', c.supplier || '', c.saleDate || '', c.salePrice || '', c.buyer || ''].map(v => { const s = String(v || ''); return s.includes(',') ? `"${s}"` : s; });
            csv += row.join(',') + '\n';
        });
        return csv;
    }

    // ==================== ADMIN METHODS (Superadmin only) ====================

    /**
     * Get all farms (superadmin only - RLS allows it).
     */
    async adminGetAllFarms() {
        if (!this.isSuperAdmin()) throw new Error("Not authorized");
        const { data, error } = await this.supabase.from('farms').select('*, farm_members(user_id, role)');
        if (error) throw error;
        return data;
    }

    /**
     * Access a specific farm as superadmin (switch context).
     */
    async adminAccessFarm(farmId) {
        if (!this.isSuperAdmin()) throw new Error("Not authorized");
        this.farmId = farmId;
        this.farmRole = 'owner';
        await this.supabase.from('profiles').update({ active_farm_id: farmId }).eq('id', this.user.id);
    }

    /**
     * Get all user profiles (superadmin only).
     */
    async adminGetAllUsers() {
        if (!this.isSuperAdmin()) throw new Error("Not authorized");
        const { data, error } = await this.supabase.from('profiles').select('*');
        if (error) throw error;
        return data;
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
                let width = img.width, height = img.height;
                if (width > height) { if (width > maxDimension) { height = Math.round((height * maxDimension) / width); width = maxDimension; } }
                else { if (height > maxDimension) { width = Math.round((width * maxDimension) / height); height = maxDimension; } }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}
