class DataStorage {
    constructor() {
        this.dbName = 'GPSLifeTrackerDB';
        this.dbVersion = 1;
        this.db = null;
        this.ready = false;
        
        this.init();
    }
    
    async init() {
        try {
            await this.openDatabase();
            this.ready = true;
            console.log('DataStorage initialized successfully');
        } catch (error) {
            console.error('Failed to initialize DataStorage:', error);
        }
    }
    
    openDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB not supported'));
                return;
            }
            
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                reject(new Error('Database failed to open'));
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database opened successfully');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                console.log('Database upgrade needed');
                this.createObjectStores();
            };
        });
    }
    
    createObjectStores() {
        // Location points store
        if (!this.db.objectStoreNames.contains('locationPoints')) {
            const locationStore = this.db.createObjectStore('locationPoints', {
                keyPath: 'id',
                autoIncrement: true
            });
            
            locationStore.createIndex('timestamp', 'timestamp', { unique: false });
            locationStore.createIndex('date', 'date', { unique: false });
            locationStore.createIndex('sessionId', 'sessionId', { unique: false });
            console.log('Created locationPoints store');
        }
        
        // Sessions store
        if (!this.db.objectStoreNames.contains('sessions')) {
            const sessionStore = this.db.createObjectStore('sessions', {
                keyPath: 'id'
            });
            
            sessionStore.createIndex('startTime', 'startTime', { unique: false });
            sessionStore.createIndex('endTime', 'endTime', { unique: false });
            sessionStore.createIndex('date', 'date', { unique: false });
            console.log('Created sessions store');
        }
        
        // Places store
        if (!this.db.objectStoreNames.contains('places')) {
            const placesStore = this.db.createObjectStore('places', {
                keyPath: 'id',
                autoIncrement: true
            });
            
            placesStore.createIndex('name', 'name', { unique: false });
            placesStore.createIndex('category', 'category', { unique: false });
            placesStore.createIndex('visitCount', 'visitCount', { unique: false });
            console.log('Created places store');
        }
        
        // Settings store
        if (!this.db.objectStoreNames.contains('settings')) {
            const settingsStore = this.db.createObjectStore('settings', {
                keyPath: 'key'
            });
            console.log('Created settings store');
        }
    }
    
    async saveLocationPoint(location) {
        if (!this.ready) {
            console.warn('Database not ready');
            return;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['locationPoints'], 'readwrite');
            const store = transaction.objectStore('locationPoints');
            
            const locationData = {
                ...location,
                date: new Date(location.timestamp).toDateString(),
                sessionId: this.getCurrentSessionId()
            };
            
            const request = store.add(locationData);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to save location point'));
            };
        });
    }
    
    async saveSession(session) {
        if (!this.ready) {
            console.warn('Database not ready');
            return;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');
            
            const sessionData = {
                ...session,
                date: new Date(session.startTime).toDateString()
            };
            
            const request = store.add(sessionData);
            
            request.onsuccess = () => {
                console.log('Session saved with ID:', request.result);
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to save session'));
            };
        });
    }
    
    async getLocationsByDateRange(startDate, endDate) {
        if (!this.ready) return [];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['locationPoints'], 'readonly');
            const store = transaction.objectStore('locationPoints');
            const index = store.index('timestamp');
            
            const range = IDBKeyRange.bound(startDate.getTime(), endDate.getTime());
            const request = index.getAll(range);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to fetch locations'));
            };
        });
    }
    
    async getLocationsByDate(date) {
        if (!this.ready) return [];
        
        const dateString = date.toDateString();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['locationPoints'], 'readonly');
            const store = transaction.objectStore('locationPoints');
            const index = store.index('date');
            
            const request = index.getAll(dateString);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to fetch locations for date'));
            };
        });
    }
    
    async getSessionsByDateRange(startDate, endDate) {
        if (!this.ready) return [];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const index = store.index('startTime');
            
            const range = IDBKeyRange.bound(startDate.getTime(), endDate.getTime());
            const request = index.getAll(range);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to fetch sessions'));
            };
        });
    }
    
    async getAllSessions() {
        if (!this.ready) return [];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to fetch all sessions'));
            };
        });
    }
    
    async getRecentLocations(limit = 100) {
        if (!this.ready) return [];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['locationPoints'], 'readonly');
            const store = transaction.objectStore('locationPoints');
            const index = store.index('timestamp');
            
            const request = index.openCursor(null, 'prev');
            const results = [];
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            
            request.onerror = () => {
                reject(new Error('Failed to fetch recent locations'));
            };
        });
    }
    
    async getStatistics() {
        if (!this.ready) return null;
        
        try {
            const [sessions, locations] = await Promise.all([
                this.getAllSessions(),
                this.getAllLocations()
            ]);
            
            const totalDistance = sessions.reduce((sum, session) => sum + (session.distance || 0), 0);
            const totalDuration = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);
            const topSpeed = locations.reduce((max, location) => {
                const speed = location.speed ? location.speed * 3.6 : 0; // Convert to km/h
                return Math.max(max, speed);
            }, 0);
            
            const trackingDays = new Set(sessions.map(session => session.date)).size;
            
            return {
                totalDistance: totalDistance / 1000, // Convert to km
                totalDuration: totalDuration / 3600, // Convert to hours
                trackingDays,
                topSpeed,
                totalSessions: sessions.length,
                totalPoints: locations.length
            };
        } catch (error) {
            console.error('Failed to calculate statistics:', error);
            return null;
        }
    }
    
    async getAllLocations() {
        if (!this.ready) return [];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['locationPoints'], 'readonly');
            const store = transaction.objectStore('locationPoints');
            
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to fetch all locations'));
            };
        });
    }
    
    async savePlace(place) {
        if (!this.ready) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['places'], 'readwrite');
            const store = transaction.objectStore('places');
            
            const request = store.add(place);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to save place'));
            };
        });
    }
    
    async getPlaces() {
        if (!this.ready) return [];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['places'], 'readonly');
            const store = transaction.objectStore('places');
            
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to fetch places'));
            };
        });
    }
    
    async updatePlace(place) {
        if (!this.ready) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['places'], 'readwrite');
            const store = transaction.objectStore('places');
            
            const request = store.put(place);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(new Error('Failed to update place'));
            };
        });
    }
    
    async deletePlace(placeId) {
        if (!this.ready) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['places'], 'readwrite');
            const store = transaction.objectStore('places');
            
            const request = store.delete(placeId);
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                reject(new Error('Failed to delete place'));
            };
        });
    }
    
    async saveSetting(key, value) {
        if (!this.ready) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            
            const request = store.put({ key, value });
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = () => {
                reject(new Error('Failed to save setting'));
            };
        });
    }
    
    async getSetting(key, defaultValue = null) {
        if (!this.ready) return defaultValue;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            
            const request = store.get(key);
            
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.value : defaultValue);
            };
            
            request.onerror = () => {
                resolve(defaultValue);
            };
        });
    }
    
    async clearAllData() {
        if (!this.ready) return;
        
        const stores = ['locationPoints', 'sessions', 'places'];
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(stores, 'readwrite');
            
            let completed = 0;
            const total = stores.length;
            
            stores.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                
                request.onsuccess = () => {
                    completed++;
                    console.log(`Cleared ${storeName} store`);
                    
                    if (completed === total) {
                        resolve();
                    }
                };
                
                request.onerror = () => {
                    reject(new Error(`Failed to clear ${storeName} store`));
                };
            });
        });
    }
    
    async getStorageSize() {
        if (!this.ready) return { used: 0, quota: 0 };
        
        try {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const estimate = await navigator.storage.estimate();
                return {
                    used: estimate.usage || 0,
                    quota: estimate.quota || 0
                };
            }
        } catch (error) {
            console.warn('Storage API not supported:', error);
        }
        
        return { used: 0, quota: 0 };
    }
    
    async exportAllData() {
        if (!this.ready) return null;
        
        try {
            const [locations, sessions, places] = await Promise.all([
                this.getAllLocations(),
                this.getAllSessions(),
                this.getPlaces()
            ]);
            
            return {
                exportDate: new Date().toISOString(),
                version: '1.0',
                data: {
                    locations,
                    sessions,
                    places
                }
            };
        } catch (error) {
            console.error('Failed to export data:', error);
            return null;
        }
    }
    
    async importData(data) {
        if (!this.ready || !data || !data.data) return false;
        
        try {
            const { locations, sessions, places } = data.data;
            
            // Clear existing data
            await this.clearAllData();
            
            // Import locations
            if (locations && locations.length > 0) {
                for (const location of locations) {
                    await this.saveLocationPoint(location);
                }
            }
            
            // Import sessions
            if (sessions && sessions.length > 0) {
                for (const session of sessions) {
                    await this.saveSession(session);
                }
            }
            
            // Import places
            if (places && places.length > 0) {
                for (const place of places) {
                    await this.savePlace(place);
                }
            }
            
            console.log('Data imported successfully');
            return true;
        } catch (error) {
            console.error('Failed to import data:', error);
            return false;
        }
    }
    
    getCurrentSessionId() {
        return Date.now().toString();
    }
    
    // Utility method to format bytes
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Create global instance
window.dataStorage = new DataStorage();