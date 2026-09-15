class MapView {
    constructor() {
        this.map = null;
        this.currentLocationMarker = null;
        this.routeLayer = null;
        this.heatmapLayer = null;
        this.locationMarkers = [];
        this.isInitialized = false;
        this.showRoute = true;
        this.showHeatmap = false;
        
        // Map configuration
        this.config = {
            defaultCenter: [40.7128, -74.0060], // New York City
            defaultZoom: 13,
            maxZoom: 18,
            minZoom: 3
        };
        
        // Layer groups
        this.layerGroups = {
            currentLocation: null,
            route: null,
            markers: null,
            heatmap: null
        };
    }
    
    async initialize(containerId) {
        try {
            if (this.isInitialized) {
                console.warn('Map already initialized');
                return;
            }
            
            console.log('Initializing map view...');
            
            const container = document.getElementById(containerId);
            if (!container) {
                throw new Error(`Map container with id '${containerId}' not found`);
            }
            
            // Initialize the map
            this.map = L.map(containerId, {
                center: this.config.defaultCenter,
                zoom: this.config.defaultZoom,
                maxZoom: this.config.maxZoom,
                minZoom: this.config.minZoom,
                zoomControl: true,
                attributionControl: true
            });
            
            // Add tile layer
            this.addTileLayer();
            
            // Initialize layer groups
            this.initializeLayerGroups();
            
            // Set up event handlers
            this.setupMapEvents();
            
            // Try to center on user's location
            await this.centerOnUserLocation();
            
            this.isInitialized = true;
            console.log('Map view initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize map view:', error);
            throw error;
        }
    }
    
    addTileLayer() {
        // Use OpenStreetMap tiles (free and reliable)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: this.config.maxZoom,
            crossOrigin: true
        }).addTo(this.map);
    }
    
    initializeLayerGroups() {
        this.layerGroups.currentLocation = L.layerGroup().addTo(this.map);
        this.layerGroups.route = L.layerGroup().addTo(this.map);
        this.layerGroups.markers = L.layerGroup().addTo(this.map);
        this.layerGroups.heatmap = L.layerGroup();
    }
    
    setupMapEvents() {
        this.map.on('click', (e) => this.handleMapClick(e));
        this.map.on('zoomend', () => this.handleZoomChange());
        this.map.on('moveend', () => this.handleMapMove());
    }
    
    async centerOnUserLocation() {
        try {
            if (window.gpsTracker) {
                const lastPosition = window.gpsTracker.getLastPosition();
                if (lastPosition) {
                    this.centerOnLocation(lastPosition.latitude, lastPosition.longitude);
                    return;
                }
            }
            
            // Try to get current location
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        this.centerOnLocation(latitude, longitude);
                    },
                    (error) => {
                        console.warn('Failed to get user location:', error);
                    },
                    { enableHighAccuracy: false, timeout: 10000 }
                );
            }
        } catch (error) {
            console.warn('Failed to center on user location:', error);
        }
    }
    
    centerOnLocation(lat, lng, zoom = 15) {
        if (!this.map) return;
        
        this.map.setView([lat, lng], zoom);
    }
    
    updateCurrentLocation(location) {
        if (!this.map) return;
        
        const { latitude, longitude, accuracy } = location;
        
        // Remove existing current location marker
        this.layerGroups.currentLocation.clearLayers();
        
        // Create current location marker
        const marker = L.circleMarker([latitude, longitude], {
            color: '#2196F3',
            fillColor: '#2196F3',
            fillOpacity: 0.8,
            radius: 8,
            weight: 2
        });
        
        // Add accuracy circle
        const accuracyCircle = L.circle([latitude, longitude], {
            color: '#2196F3',
            fillColor: '#2196F3',
            fillOpacity: 0.1,
            radius: accuracy,
            weight: 1
        });
        
        // Add to current location layer
        this.layerGroups.currentLocation.addLayer(marker);
        this.layerGroups.currentLocation.addLayer(accuracyCircle);
        
        // Add popup with location info
        const popupContent = this.createLocationPopup(location);
        marker.bindPopup(popupContent).openPopup();
        
        // Update route if tracking
        if (window.gpsTracker && window.gpsTracker.getTrackingStatus().isTracking) {
            this.updateRoute();
        }
        
        this.currentLocationMarker = marker;
    }
    
    createLocationPopup(location) {
        const time = new Date(location.timestamp).toLocaleTimeString();
        const speed = location.speed ? (location.speed * 3.6).toFixed(1) : '0';
        
        return `
            <div class="location-popup">
                <strong>Current Location</strong><br>
                <small>
                    Lat: ${location.latitude.toFixed(6)}<br>
                    Lng: ${location.longitude.toFixed(6)}<br>
                    Accuracy: ${Math.round(location.accuracy)} m<br>
                    Speed: ${speed} km/h<br>
                    Time: ${time}
                </small>
            </div>
        `;
    }
    
    displayLocations(locations) {
        if (!this.map || !locations || locations.length === 0) return;
        
        // Clear existing markers
        this.layerGroups.markers.clearLayers();
        
        // Group locations by proximity to reduce clutter
        const clusteredLocations = this.clusterLocations(locations);
        
        clusteredLocations.forEach(cluster => {
            const marker = this.createLocationMarker(cluster);
            this.layerGroups.markers.addLayer(marker);
        });
        
        // Update route display
        if (this.showRoute) {
            this.displayRoute(locations);
        }
        
        // Update heatmap if enabled
        if (this.showHeatmap) {
            this.displayHeatmap(locations);
        }
        
        // Fit map to show all locations
        if (locations.length > 0) {
            this.fitToLocations(locations);
        }
    }
    
    clusterLocations(locations, distance = 50) {
        // Simple clustering based on distance
        const clusters = [];
        const processed = new Set();
        
        locations.forEach((location, index) => {
            if (processed.has(index)) return;
            
            const cluster = {
                center: location,
                locations: [location],
                count: 1
            };
            
            // Find nearby locations
            locations.forEach((otherLocation, otherIndex) => {
                if (index === otherIndex || processed.has(otherIndex)) return;
                
                const dist = this.calculateDistance(
                    location.latitude, location.longitude,
                    otherLocation.latitude, otherLocation.longitude
                );
                
                if (dist <= distance) {
                    cluster.locations.push(otherLocation);
                    cluster.count++;
                    processed.add(otherIndex);
                }
            });
            
            clusters.push(cluster);
            processed.add(index);
        });
        
        return clusters;
    }
    
    createLocationMarker(cluster) {
        const { center, count } = cluster;
        const { latitude, longitude } = center;
        
        let marker;
        
        if (count > 1) {
            // Cluster marker
            marker = L.circleMarker([latitude, longitude], {
                color: '#FF5722',
                fillColor: '#FF5722',
                fillOpacity: 0.7,
                radius: Math.min(8 + Math.log(count) * 3, 20),
                weight: 2
            });
            
            // Add count label
            marker.bindTooltip(count.toString(), {
                permanent: true,
                direction: 'center',
                className: 'cluster-tooltip'
            });
        } else {
            // Single location marker
            marker = L.circleMarker([latitude, longitude], {
                color: '#4CAF50',
                fillColor: '#4CAF50',
                fillOpacity: 0.6,
                radius: 4,
                weight: 1
            });
        }
        
        // Add popup with location details
        const popupContent = this.createLocationClusterPopup(cluster);
        marker.bindPopup(popupContent);
        
        return marker;
    }
    
    createLocationClusterPopup(cluster) {
        const { center, count, locations } = cluster;
        const time = new Date(center.timestamp).toLocaleString();
        
        let content = `
            <div class="location-cluster-popup">
                <strong>${count > 1 ? `${count} Locations` : 'Location'}</strong><br>
                <small>
                    Lat: ${center.latitude.toFixed(6)}<br>
                    Lng: ${center.longitude.toFixed(6)}<br>
                    Time: ${time}
                </small>
        `;
        
        if (count > 1) {
            const timeRange = this.getTimeRange(locations);
            content += `<br><small>Time range: ${timeRange}</small>`;
        }
        
        content += '</div>';
        return content;
    }
    
    getTimeRange(locations) {
        const times = locations.map(loc => loc.timestamp);
        const earliest = new Date(Math.min(...times));
        const latest = new Date(Math.max(...times));
        
        if (earliest.toDateString() === latest.toDateString()) {
            return `${earliest.toLocaleTimeString()} - ${latest.toLocaleTimeString()}`;
        } else {
            return `${earliest.toLocaleDateString()} - ${latest.toLocaleDateString()}`;
        }
    }
    
    displayRoute(locations) {
        if (!this.map || !locations || locations.length < 2) return;
        
        // Clear existing route
        this.layerGroups.route.clearLayers();
        
        // Sort locations by timestamp
        const sortedLocations = locations.sort((a, b) => a.timestamp - b.timestamp);
        
        // Create polyline from locations
        const latLngs = sortedLocations.map(loc => [loc.latitude, loc.longitude]);
        
        const routeLine = L.polyline(latLngs, {
            color: '#2196F3',
            weight: 3,
            opacity: 0.7,
            smoothFactor: 1
        });
        
        this.layerGroups.route.addLayer(routeLine);
        
        // Add start and end markers
        if (sortedLocations.length > 0) {
            const start = sortedLocations[0];
            const end = sortedLocations[sortedLocations.length - 1];
            
            const startMarker = L.marker([start.latitude, start.longitude], {
                icon: this.createCustomIcon('🚩', '#4CAF50')
            }).bindPopup('Start: ' + new Date(start.timestamp).toLocaleString());
            
            const endMarker = L.marker([end.latitude, end.longitude], {
                icon: this.createCustomIcon('🏁', '#F44336')
            }).bindPopup('End: ' + new Date(end.timestamp).toLocaleString());
            
            this.layerGroups.route.addLayer(startMarker);
            this.layerGroups.route.addLayer(endMarker);
        }
        
        this.routeLayer = routeLine;
    }
    
    displayHeatmap(locations) {
        if (!this.map || !locations || locations.length === 0) return;
        
        // Clear existing heatmap
        this.layerGroups.heatmap.clearLayers();
        
        // Create heat data
        const heatData = locations.map(loc => [loc.latitude, loc.longitude, 1]);
        
        // Simple heatmap using circle overlays (since we're using vanilla Leaflet)
        locations.forEach(location => {
            const circle = L.circle([location.latitude, location.longitude], {
                color: '#FF5722',
                fillColor: '#FF5722',
                fillOpacity: 0.1,
                radius: 100,
                weight: 0
            });
            
            this.layerGroups.heatmap.addLayer(circle);
        });
    }
    
    createCustomIcon(emoji, color = '#2196F3') {
        return L.divIcon({
            html: `<div style="background-color: ${color}; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${emoji}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            className: 'custom-marker-icon'
        });
    }
    
    fitToLocations(locations) {
        if (!this.map || !locations || locations.length === 0) return;
        
        const latLngs = locations.map(loc => [loc.latitude, loc.longitude]);
        const bounds = L.latLngBounds(latLngs);
        
        if (bounds.isValid()) {
            this.map.fitBounds(bounds, { padding: [20, 20] });
        }
    }
    
    updateRoute() {
        if (!window.gpsTracker) return;
        
        const status = window.gpsTracker.getTrackingStatus();
        if (status.isTracking && status.session.points.length > 0) {
            this.displayRoute(status.session.points);
        }
    }
    
    toggleRouteDisplay() {
        this.showRoute = !this.showRoute;
        
        if (this.showRoute) {
            this.map.addLayer(this.layerGroups.route);
        } else {
            this.map.removeLayer(this.layerGroups.route);
        }
        
        // Update button state
        const btn = document.getElementById('toggle-route');
        if (btn) {
            btn.style.backgroundColor = this.showRoute ? '#2196F3' : 'white';
            btn.style.color = this.showRoute ? 'white' : '#333';
        }
    }
    
    toggleHeatmapDisplay() {
        this.showHeatmap = !this.showHeatmap;
        
        if (this.showHeatmap) {
            this.map.addLayer(this.layerGroups.heatmap);
            // Reload heatmap data
            if (window.dataStorage) {
                window.dataStorage.getRecentLocations(500).then(locations => {
                    this.displayHeatmap(locations);
                });
            }
        } else {
            this.map.removeLayer(this.layerGroups.heatmap);
        }
        
        // Update button state
        const btn = document.getElementById('toggle-heatmap');
        if (btn) {
            btn.style.backgroundColor = this.showHeatmap ? '#FF5722' : 'white';
            btn.style.color = this.showHeatmap ? 'white' : '#333';
        }
    }
    
    addMarker(lat, lng, title = '', options = {}) {
        if (!this.map) return;
        
        const marker = L.marker([lat, lng], options);
        
        if (title) {
            marker.bindPopup(title);
        }
        
        this.layerGroups.markers.addLayer(marker);
        return marker;
    }
    
    clearAllData() {
        if (!this.map) return;
        
        // Clear all layer groups except current location
        this.layerGroups.markers.clearLayers();
        this.layerGroups.route.clearLayers();
        this.layerGroups.heatmap.clearLayers();
        
        this.routeLayer = null;
        this.heatmapLayer = null;
        this.locationMarkers = [];
    }
    
    resize() {
        if (this.map) {
            // Force map to recalculate size
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    }
    
    handleMapClick(e) {
        const { lat, lng } = e.latlng;
        console.log('Map clicked:', lat, lng);
        
        // Add temporary marker on click
        const tempMarker = L.marker([lat, lng], {
            icon: this.createCustomIcon('📍', '#FF9800')
        }).bindPopup(`Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}`);
        
        this.layerGroups.markers.addLayer(tempMarker);
        
        // Remove after 5 seconds
        setTimeout(() => {
            this.layerGroups.markers.removeLayer(tempMarker);
        }, 5000);
    }
    
    handleZoomChange() {
        const zoom = this.map.getZoom();
        console.log('Map zoom changed:', zoom);
        
        // Adjust marker sizes based on zoom level
        this.adjustMarkerSizes(zoom);
    }
    
    handleMapMove() {
        const center = this.map.getCenter();
        console.log('Map moved:', center.lat, center.lng);
    }
    
    adjustMarkerSizes(zoom) {
        // Adjust marker visibility and size based on zoom level
        const layers = this.layerGroups.markers.getLayers();
        
        layers.forEach(layer => {
            if (layer instanceof L.CircleMarker) {
                const baseRadius = zoom < 10 ? 2 : zoom < 15 ? 4 : 6;
                layer.setRadius(baseRadius);
            }
        });
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
    
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
            this.isInitialized = false;
        }
    }
}

// Create global instance
window.mapView = new MapView();