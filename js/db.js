/**
 * Glenthorpe Cattleitics - IndexedDB and Server Dual-Sync Module (db.js)
 * Provides seamless environment-aware storage.
 * - Served via localhost: Uses local Node.js API to read/write physical files.
 * - Run standalone via file:/// or cloud: Falls back to fully secure offline IndexedDB.
 */

class CattleiticsDB {
    constructor() {
        this.dbName = 'CattleiticsDB';
        this.dbVersion = 1;
        this.db = null;
        
        // Environment Detection
        this.isServerMode = window.location.protocol.startsWith('http') && 
                            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        this.storageMode = this.isServerMode ? 'Local Server File Sync' : 'Offline Browser Mode';
    }

    /**
     * Initializes storage. 
     * Contacts local server if available, otherwise initiates browser IndexedDB.
     */
    async init() {
        console.log(`Cattleitics initializing in [${this.storageMode}]...`);
        
        if (this.isServerMode) {
            // Verify server connectivity
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    console.log("Local Node.js server found. Direct file syncing activated.");
                    return this;
                }
            } catch (err) {
                console.warn("Local server connection failed. Falling back to offline browser database.");
                this.isServerMode = false;
                this.storageMode = 'Offline Browser Mode';
            }
        }

        // Initialize IndexedDB fallback
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("IndexedDB initialization error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("IndexedDB initialized successfully as local storage.");
                resolve(this);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Cattle Store
                if (!db.objectStoreNames.contains('cattle')) {
                    const cattleStore = db.createObjectStore('cattle', { keyPath: 'tagId' });
                    cattleStore.createIndex('gender', 'gender', { unique: false });
                    cattleStore.createIndex('pasture', 'pasture', { unique: false });
                    cattleStore.createIndex('status', 'status', { unique: false });
                }

                // Health/Farm Tasks Store
                if (!db.objectStoreNames.contains('tasks')) {
                    const tasksStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                    tasksStore.createIndex('dueDate', 'dueDate', { unique: false });
                    tasksStore.createIndex('status', 'status', { unique: false });
                }

                // Settings Store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * Retrieves all cattle.
     */
    async getAllCattle() {
        if (this.isServerMode) {
            const response = await fetch('/api/data');
            if (!response.ok) throw new Error("Failed to load cattle from server");
            return await response.json();
        }

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
        const cattle = await this.getAllCattle();
        return cattle.find(c => c.tagId === tagId) || null;
    }

    /**
     * Adds or updates a cow profile.
     */
    async saveCow(cowData) {
        if (this.isServerMode) {
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
        if (this.isServerMode) {
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
        if (this.isServerMode) {
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

            cattleList.forEach(cow => {
                store.put(cow);
            });
        });
    }

    /**
     * Wipes all cattle records.
     */
    async clearAllCattle() {
        if (this.isServerMode) {
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

    /**
     * Retrieves all scheduled tasks.
     */
    async getAllTasks() {
        if (this.isServerMode) {
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
        if (this.isServerMode) {
            const currentList = await this.getAllTasks();
            
            if (taskData.id) {
                const index = currentList.findIndex(t => t.id === taskData.id);
                if (index > -1) currentList[index] = taskData;
            } else {
                taskData.id = Date.now(); // Generate ID
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
                if (!taskData.id) {
                    taskData.id = event.target.result;
                }
                resolve(taskData);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Deletes a task.
     */
    async deleteTask(taskId) {
        if (this.isServerMode) {
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

    /**
     * Retrieves all pastures/paddocks.
     */
    async getAllPaddocks() {
        if (this.isServerMode) {
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
        if (this.isServerMode) {
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

    /**
     * Saves generic setting.
     */
    async saveSetting(key, value) {
        if (this.isServerMode) {
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
        if (this.isServerMode) {
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
