class GPSTracker {
    constructor() {
        this.isTracking = false;
        this.watchId = null;
        this.trackingStartTime = null;
        this.currentSession = {
            points: [],
            distance: 0,
            duration: 0,
            avgSpeed: 0
        };
        this.settings = {
            updateInterval: 10000, // 10 seconds
            highAccuracy: true,
            maxAge: 30000, // 30 seconds
            timeout: 60000, // 60 seconds
            minimumDistance: 5 // 5 meters minimum movement
        };
        this.lastPosition = null;
        this.sessionTimer = null;
        
        // Event listeners
        this.onLocationUpdate = null;
        this.onTrackingStart = null;
        this.onTrackingStop = null;
        this.onError = null;
        
        this.init();
    }
    
    init() {
        // Check if geolocation is supported
        if (!navigator.geolocation) {
            this.showError('Geolocation is not supported by this browser');
            return;
        }
        
        // Load settings from localStorage
        this.loadSettings();
        
        // Check permission status
        this.checkPermission();
    }
    
    async checkPermission() {
        if ('permissions' in navigator) {
            try {
                const permission = await navigator.permissions.query({name: 'geolocation'});
                console.log('Geolocation permission:', permission.state);
                
                permission.addEventListener('change', () => {
                    console.log('Permission changed to:', permission.state);
                    this.updateStatusDisplay(permission.state);
                });
                
                this.updateStatusDisplay(permission.state);
            } catch (error) {
                console.warn('Permission API not supported:', error);
            }
        }
    }
    
    updateStatusDisplay(status) {
        const statusText = document.getElementById('status-text');
        const statusDot = document.getElementById('status-dot');
        
        if (!statusText || !statusDot) return;
        
        switch (status) {
            case 'granted':
                statusText.textContent = this.isTracking ? 'Tracking' : 'Ready';
                statusDot.style.backgroundColor = this.isTracking ? '#4CAF50' : '#2196F3';
                break;
            case 'denied':
                statusText.textContent = 'GPS Denied';
                statusDot.style.backgroundColor = '#F44336';
                break;
            case 'prompt':
                statusText.textContent = 'GPS Prompt';
                statusDot.style.backgroundColor = '#FF9800';
                break;
            default:
                statusText.textContent = 'Unknown';
                statusDot.style.backgroundColor = '#9E9E9E';
        }
    }
    
    loadSettings() {
        const saved = localStorage.getItem('gps-tracker-settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.settings = { ...this.settings, ...settings };
            } catch (error) {
                console.warn('Failed to load settings:', error);
            }
        }
    }
    
    saveSettings() {
        localStorage.setItem('gps-tracker-settings', JSON.stringify(this.settings));
    }
    
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
        
        // Restart tracking if currently active to apply new settings
        if (this.isTracking) {
            this.stopTracking();
            setTimeout(() => this.startTracking(), 1000);
        }
    }
    
    startTracking() {
        if (this.isTracking) {
            console.warn('Tracking already active');
            return;
        }
        
        console.log('Starting GPS tracking...');
        
        const options = {
            enableHighAccuracy: this.settings.highAccuracy,
            timeout: this.settings.timeout,
            maximumAge: this.settings.maxAge
        };
        
        // Get initial position
        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log('Initial position obtained:', position);
                this.handleLocationUpdate(position);
                this.startWatching(options);
            },
            (error) => {
                console.error('Failed to get initial position:', error);
                this.handleLocationError(error);
            },
            options
        );
        
        this.isTracking = true;
        this.trackingStartTime = Date.now();
        this.currentSession = {
            points: [],
            distance: 0,
            duration: 0,
            avgSpeed: 0
        };
        
        // Start session timer
        this.startSessionTimer();
        
        // Update UI
        this.updateStatusDisplay('granted');
        
        // Call callback
        if (this.onTrackingStart) {
            this.onTrackingStart();
        }
        
        this.showNotification('GPS tracking started', 'success');
    }
    
    startWatching(options) {
        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.handleLocationUpdate(position),
            (error) => this.handleLocationError(error),
            options
        );
        
        console.log('Started watching position with ID:', this.watchId);
    }
    
    stopTracking() {
        if (!this.isTracking) {
            console.warn('Tracking not active');
            return;
        }
        
        console.log('Stopping GPS tracking...');
        
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }
        
        this.isTracking = false;
        
        // Calculate final session stats
        this.calculateSessionStats();
        
        // Save session to database
        this.saveSession();
        
        // Update UI
        this.updateStatusDisplay('granted');
        
        // Call callback
        if (this.onTrackingStop) {
            this.onTrackingStop(this.currentSession);
        }
        
        this.showNotification('GPS tracking stopped', 'success');
    }
    
    handleLocationUpdate(position) {
        const now = Date.now();
        const coords = position.coords;
        
        const locationData = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            altitude: coords.altitude,
            altitudeAccuracy: coords.altitudeAccuracy,
            heading: coords.heading,
            speed: coords.speed,
            timestamp: now
        };
        
        // Filter out inaccurate readings
        if (coords.accuracy > 100) {
            console.warn('Low accuracy reading ignored:', coords.accuracy, 'm');
            return;
        }
        
        // Check minimum distance moved
        if (this.lastPosition && this.settings.minimumDistance > 0) {
            const distance = this.calculateDistance(
                this.lastPosition.latitude,
                this.lastPosition.longitude,
                coords.latitude,
                coords.longitude
            );
            
            if (distance < this.settings.minimumDistance) {
                console.log('Movement too small, ignored:', distance, 'm');
                return;
            }
        }
        
        // Add to current session
        this.currentSession.points.push(locationData);
        
        // Calculate distance if we have a previous position
        if (this.lastPosition) {
            const segmentDistance = this.calculateDistance(
                this.lastPosition.latitude,
                this.lastPosition.longitude,
                coords.latitude,
                coords.longitude
            );
            this.currentSession.distance += segmentDistance;
        }
        
        this.lastPosition = locationData;
        
        // Update UI
        this.updateLocationDisplay(locationData);
        this.updateSessionDisplay();
        
        // Save to database
        if (window.dataStorage) {
            window.dataStorage.saveLocationPoint(locationData);
        }
        
        // Call callback
        if (this.onLocationUpdate) {
            this.onLocationUpdate(locationData);
        }
        
        console.log('Location updated:', coords.latitude, coords.longitude, 'Accuracy:', coords.accuracy);
    }
    
    handleLocationError(error) {
        let message = 'GPS Error: ';
        
        switch (error.code) {
            case error.PERMISSION_DENIED:
                message += 'Location access denied by user';
                this.updateStatusDisplay('denied');
                break;
            case error.POSITION_UNAVAILABLE:
                message += 'Location information unavailable';
                break;
            case error.TIMEOUT:
                message += 'Location request timed out';
                break;
            default:
                message += 'Unknown error occurred';
                break;
        }
        
        console.error(message, error);
        this.showError(message);
        
        // Call callback
        if (this.onError) {
            this.onError(error);
        }
    }
    
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;
        
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c; // Distance in meters
    }
    
    calculateSessionStats() {
        if (this.currentSession.points.length < 2) return;
        
        const totalTime = (Date.now() - this.trackingStartTime) / 1000; // seconds
        this.currentSession.duration = totalTime;
        
        // Calculate average speed (m/s to km/h)
        if (totalTime > 0) {
            this.currentSession.avgSpeed = (this.currentSession.distance / totalTime) * 3.6;
        }
    }
    
    startSessionTimer() {
        this.sessionTimer = setInterval(() => {
            this.updateSessionDisplay();
        }, 1000);
    }
    
    updateLocationDisplay(location) {
        const elements = {
            'current-lat': location.latitude.toFixed(6),
            'current-lng': location.longitude.toFixed(6),
            'current-accuracy': Math.round(location.accuracy) + ' m',
            'current-speed': location.speed ? (location.speed * 3.6).toFixed(1) + ' km/h' : '0 km/h',
            'current-time': new Date(location.timestamp).toLocaleTimeString()
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }
    
    updateSessionDisplay() {
        if (!this.isTracking) return;
        
        const duration = Math.floor((Date.now() - this.trackingStartTime) / 1000);
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = duration % 60;
        
        const elements = {
            'session-duration': `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
            'points-count': this.currentSession.points.length.toString(),
            'total-distance': (this.currentSession.distance / 1000).toFixed(2) + ' km',
            'avg-speed': this.currentSession.avgSpeed.toFixed(1) + ' km/h'
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    }
    
    async saveSession() {
        if (!window.dataStorage || this.currentSession.points.length === 0) return;
        
        try {
            const session = {
                id: Date.now().toString(),
                startTime: this.trackingStartTime,
                endTime: Date.now(),
                points: this.currentSession.points,
                distance: this.currentSession.distance,
                duration: this.currentSession.duration,
                avgSpeed: this.currentSession.avgSpeed,
                pointCount: this.currentSession.points.length
            };
            
            await window.dataStorage.saveSession(session);
            console.log('Session saved successfully');
        } catch (error) {
            console.error('Failed to save session:', error);
            this.showError('Failed to save tracking session');
        }
    }
    
    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => resolve(position),
                (error) => reject(error),
                {
                    enableHighAccuracy: this.settings.highAccuracy,
                    timeout: this.settings.timeout,
                    maximumAge: this.settings.maxAge
                }
            );
        });
    }
    
    exportData(format = 'gpx') {
        if (this.currentSession.points.length === 0) {
            this.showError('No tracking data to export');
            return;
        }
        
        let content = '';
        let filename = '';
        
        switch (format.toLowerCase()) {
            case 'gpx':
                content = this.generateGPX();
                filename = `gps_track_${new Date().toISOString().split('T')[0]}.gpx`;
                break;
            case 'csv':
                content = this.generateCSV();
                filename = `gps_track_${new Date().toISOString().split('T')[0]}.csv`;
                break;
            case 'json':
                content = JSON.stringify(this.currentSession, null, 2);
                filename = `gps_track_${new Date().toISOString().split('T')[0]}.json`;
                break;
            default:
                this.showError('Unsupported export format');
                return;
        }
        
        this.downloadFile(content, filename);
    }
    
    generateGPX() {
        const points = this.currentSession.points;
        const trackName = `GPS Track ${new Date().toLocaleDateString()}`;
        
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS Life Tracker" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${trackName}</name>
    <trkseg>`;
        
        points.forEach(point => {
            gpx += `
      <trkpt lat="${point.latitude}" lon="${point.longitude}">`;
            if (point.altitude !== null) {
                gpx += `
        <ele>${point.altitude}</ele>`;
            }
            gpx += `
        <time>${new Date(point.timestamp).toISOString()}</time>
      </trkpt>`;
        });
        
        gpx += `
    </trkseg>
  </trk>
</gpx>`;
        
        return gpx;
    }
    
    generateCSV() {
        const points = this.currentSession.points;
        let csv = 'timestamp,latitude,longitude,altitude,accuracy,speed,heading\n';
        
        points.forEach(point => {
            csv += `${new Date(point.timestamp).toISOString()},${point.latitude},${point.longitude},${point.altitude || ''},${point.accuracy},${point.speed || ''},${point.heading || ''}\n`;
        });
        
        return csv;
    }
    
    downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showNotification(`Exported ${filename}`, 'success');
    }
    
    showNotification(message, type = 'info') {
        if (window.notifications) {
            window.notifications.show(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
    
    showError(message) {
        this.showNotification(message, 'error');
    }
    
        async getMonthlyDistance(year = null, month = null) {
        try {
            if (!window.dataStorage) {
                console.warn('dataStorage no disponible para calcular distancia mensual');
                return { totalMeters: 0, totalKm: 0, sessions: 0, month: null, year: null };
            }

            const now = new Date();
            const targetYear = year !== null ? year : now.getFullYear();
            const targetMonth = month !== null ? month : now.getMonth(); // 0-11

            // Intentar obtener todas las sesiones
            let sessions = [];
            if (typeof window.dataStorage.getAllSessions === 'function') {
                sessions = await window.dataStorage.getAllSessions();
            } else if (typeof window.dataStorage.getSessions === 'function') {
                sessions = await window.dataStorage.getSessions();
            } else {
                console.warn('No existe método para obtener sesiones en dataStorage');
                return { totalMeters: 0, totalKm: 0, sessions: 0, month: targetMonth + 1, year: targetYear };
            }

            if (!Array.isArray(sessions)) {
                console.warn('Las sesiones no son un array:', sessions);
                return { totalMeters: 0, totalKm: 0, sessions: 0, month: targetMonth + 1, year: targetYear };
            }

            // Filtrar sesiones del mes/año objetivo
            const monthlySessions = sessions.filter(session => {
                const ts = session.startTime || session.timestamp || session.id;
                if (!ts) return false;
                const d = new Date(Number(ts) || ts);
                return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
            });

            // Sumar distancias (vienen en metros)
            const totalMeters = monthlySessions.reduce((sum, s) => {
                const dist = Number(s.distance) || 0;
                return sum + dist;
            }, 0);

            const result = {
                totalMeters: totalMeters,
                totalKm: totalMeters / 1000,
                sessions: monthlySessions.length,
                month: targetMonth + 1,
                year: targetYear
            };

            console.log('📊 Distancia mensual calculada:', result);
            return result;

        } catch (error) {
            console.error('Error calculando distancia mensual:', error);
            return { totalMeters: 0, totalKm: 0, sessions: 0, month: null, year: null };
        }
    }

    async getCurrentMonthDistance() {
        return await this.getMonthlyDistance();
    }

    // Public API
    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            session: this.currentSession,
            settings: this.settings
        };
    }
    
    getLastPosition() {
        return this.lastPosition;
    }
    
    getSettings() {
        return { ...this.settings };
    }
}

// Create global instance
window.gpsTracker = new GPSTracker();