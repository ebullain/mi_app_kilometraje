class TimelineView {
    constructor() {
        this.container = null;
        this.currentDate = new Date();
        this.timelineData = [];
        this.places = [];
        this.isInitialized = false;
    }
    
    initialize() {
        this.container = document.getElementById('timeline-content');
        if (!this.container) {
            console.error('Timeline container not found');
            return;
        }
        
        this.isInitialized = true;
        console.log('Timeline view initialized');
    }
    
    async displayTimelineData(locations, date) {
        if (!this.isInitialized || !this.container) return;
        
        this.currentDate = date;
        this.timelineData = locations;
        
        // Clear existing content
        this.container.innerHTML = '';
        
        if (!locations || locations.length === 0) {
            this.displayEmptyState();
            return;
        }
        
        try {
            // Process locations into timeline events
            const timelineEvents = await this.processLocationData(locations);
            
            // Group events by time periods
            const groupedEvents = this.groupEventsByTime(timelineEvents);
            
            // Render timeline
            this.renderTimeline(groupedEvents);
            
        } catch (error) {
            console.error('Failed to display timeline data:', error);
            this.displayErrorState(error.message);
        }
    }
    
    displayEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📍</div>
                <h3>No location data for ${this.currentDate.toDateString()}</h3>
                <p>Start tracking to see your daily timeline!</p>
            </div>
        `;
    }
    
    displayErrorState(message) {
        this.container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">⚠️</div>
                <h3>Error loading timeline</h3>
                <p>${message}</p>
            </div>
        `;
    }
    
    async processLocationData(locations) {
        // Sort locations by timestamp
        const sortedLocations = locations.sort((a, b) => a.timestamp - b.timestamp);
        
        // Detect places and visits
        const places = await this.detectPlaces(sortedLocations);
        
        // Create timeline events
        const events = [];
        
        // Add movement events
        const movements = this.detectMovements(sortedLocations);
        events.push(...movements);
        
        // Add place visits
        const visits = this.detectPlaceVisits(sortedLocations, places);
        events.push(...visits);
        
        // Sort all events by time
        return events.sort((a, b) => a.timestamp - b.timestamp);
    }
    
    async detectPlaces(locations) {
        if (!window.dataStorage) return [];
        
        try {
            // Get known places from database
            const knownPlaces = await window.dataStorage.getPlaces();
            
            // Detect new places from location clusters
            const clusters = this.clusterLocationsByTime(locations);
            const detectedPlaces = [];
            
            clusters.forEach(cluster => {
                if (cluster.duration > 10 * 60 * 1000) { // Stayed for more than 10 minutes
                    const existingPlace = this.findNearbyPlace(knownPlaces, cluster.center, 100);
                    
                    if (existingPlace) {
                        detectedPlaces.push(existingPlace);
                    } else {
                        // Create new place
                        const newPlace = {
                            id: `temp_${Date.now()}`,
                            name: this.generatePlaceName(cluster.center),
                            latitude: cluster.center.latitude,
                            longitude: cluster.center.longitude,
                            category: 'unknown',
                            isTemporary: true
                        };
                        detectedPlaces.push(newPlace);
                    }
                }
            });
            
            return [...knownPlaces, ...detectedPlaces];
            
        } catch (error) {
            console.error('Failed to detect places:', error);
            return [];
        }
    }
    
    clusterLocationsByTime(locations) {
        const clusters = [];
        let currentCluster = null;
        const DISTANCE_THRESHOLD = 50; // meters
        const TIME_THRESHOLD = 10 * 60 * 1000; // 10 minutes
        
        locations.forEach(location => {
            if (!currentCluster) {
                currentCluster = {
                    center: location,
                    locations: [location],
                    startTime: location.timestamp,
                    endTime: location.timestamp,
                    duration: 0
                };
            } else {
                const distance = this.calculateDistance(
                    currentCluster.center.latitude,
                    currentCluster.center.longitude,
                    location.latitude,
                    location.longitude
                );
                
                const timeSinceLastPoint = location.timestamp - currentCluster.endTime;
                
                if (distance <= DISTANCE_THRESHOLD && timeSinceLastPoint <= TIME_THRESHOLD) {
                    // Add to current cluster
                    currentCluster.locations.push(location);
                    currentCluster.endTime = location.timestamp;
                    currentCluster.duration = currentCluster.endTime - currentCluster.startTime;
                    
                    // Update center (weighted average)
                    currentCluster.center = this.calculateClusterCenter(currentCluster.locations);
                } else {
                    // Save current cluster and start new one
                    if (currentCluster.locations.length > 1) {
                        clusters.push(currentCluster);
                    }
                    
                    currentCluster = {
                        center: location,
                        locations: [location],
                        startTime: location.timestamp,
                        endTime: location.timestamp,
                        duration: 0
                    };
                }
            }
        });
        
        // Add final cluster
        if (currentCluster && currentCluster.locations.length > 1) {
            clusters.push(currentCluster);
        }
        
        return clusters;
    }
    
    calculateClusterCenter(locations) {
        const totalLat = locations.reduce((sum, loc) => sum + loc.latitude, 0);
        const totalLng = locations.reduce((sum, loc) => sum + loc.longitude, 0);
        
        return {
            latitude: totalLat / locations.length,
            longitude: totalLng / locations.length
        };
    }
    
    findNearbyPlace(places, location, radius = 100) {
        return places.find(place => {
            const distance = this.calculateDistance(
                place.latitude,
                place.longitude,
                location.latitude,
                location.longitude
            );
            return distance <= radius;
        });
    }
    
    generatePlaceName(location) {
        // Generate a simple place name based on location
        const lat = location.latitude.toFixed(4);
        const lng = location.longitude.toFixed(4);
        return `Place at ${lat}, ${lng}`;
    }
    
    detectMovements(locations) {
        const movements = [];
        let currentMovement = null;
        const SPEED_THRESHOLD = 1; // km/h
        
        for (let i = 1; i < locations.length; i++) {
            const prev = locations[i - 1];
            const curr = locations[i];
            
            const distance = this.calculateDistance(
                prev.latitude, prev.longitude,
                curr.latitude, curr.longitude
            );
            
            const time = (curr.timestamp - prev.timestamp) / 1000; // seconds
            const speed = (distance / time) * 3.6; // km/h
            
            if (speed > SPEED_THRESHOLD) {
                if (!currentMovement) {
                    currentMovement = {
                        type: 'movement',
                        startTime: prev.timestamp,
                        endTime: curr.timestamp,
                        startLocation: prev,
                        endLocation: curr,
                        distance: distance,
                        duration: time * 1000,
                        averageSpeed: speed,
                        transportMode: this.detectTransportMode(speed)
                    };
                } else {
                    // Extend current movement
                    currentMovement.endTime = curr.timestamp;
                    currentMovement.endLocation = curr;
                    currentMovement.distance += distance;
                    currentMovement.duration = currentMovement.endTime - currentMovement.startTime;
                    currentMovement.averageSpeed = (currentMovement.distance / (currentMovement.duration / 1000)) * 3.6;
                }
            } else {
                // End current movement
                if (currentMovement && currentMovement.duration > 60000) { // More than 1 minute
                    currentMovement.timestamp = currentMovement.startTime;
                    movements.push(currentMovement);
                }
                currentMovement = null;
            }
        }
        
        // Add final movement
        if (currentMovement && currentMovement.duration > 60000) {
            currentMovement.timestamp = currentMovement.startTime;
            movements.push(currentMovement);
        }
        
        return movements;
    }
    
    detectTransportMode(speed) {
        if (speed < 5) return 'walking';
        if (speed < 25) return 'cycling';
        if (speed < 50) return 'driving';
        return 'fast-transport';
    }
    
    detectPlaceVisits(locations, places) {
        const visits = [];
        
        places.forEach(place => {
            const nearbyLocations = locations.filter(loc => {
                const distance = this.calculateDistance(
                    place.latitude, place.longitude,
                    loc.latitude, loc.longitude
                );
                return distance <= (place.radius || 100);
            });
            
            if (nearbyLocations.length > 0) {
                const sortedLocations = nearbyLocations.sort((a, b) => a.timestamp - b.timestamp);
                const arrivalTime = sortedLocations[0].timestamp;
                const departureTime = sortedLocations[sortedLocations.length - 1].timestamp;
                const duration = departureTime - arrivalTime;
                
                if (duration > 5 * 60 * 1000) { // Stayed for more than 5 minutes
                    visits.push({
                        type: 'place-visit',
                        timestamp: arrivalTime,
                        place: place,
                        arrivalTime: arrivalTime,
                        departureTime: departureTime,
                        duration: duration,
                        locationCount: nearbyLocations.length
                    });
                }
            }
        });
        
        return visits;
    }
    
    groupEventsByTime(events) {
        const groups = [];
        let currentGroup = null;
        const GROUP_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours
        
        events.forEach(event => {
            if (!currentGroup || event.timestamp - currentGroup.endTime > GROUP_INTERVAL) {
                currentGroup = {
                    startTime: event.timestamp,
                    endTime: event.timestamp,
                    events: [event]
                };
                groups.push(currentGroup);
            } else {
                currentGroup.events.push(event);
                currentGroup.endTime = Math.max(currentGroup.endTime, event.timestamp);
            }
        });
        
        return groups;
    }
    
    renderTimeline(groupedEvents) {
        if (groupedEvents.length === 0) {
            this.displayEmptyState();
            return;
        }
        
        const timelineHTML = `
            <div class="timeline">
                <div class="timeline-header">
                    <h3>📅 ${this.currentDate.toDateString()}</h3>
                    <div class="timeline-summary">
                        ${this.generateDaySummary(groupedEvents)}
                    </div>
                </div>
                <div class="timeline-events">
                    ${groupedEvents.map(group => this.renderTimeGroup(group)).join('')}
                </div>
            </div>
        `;
        
        this.container.innerHTML = timelineHTML;
    }
    
    generateDaySummary(groupedEvents) {
        const allEvents = groupedEvents.flatMap(group => group.events);
        
        const movements = allEvents.filter(event => event.type === 'movement');
        const visits = allEvents.filter(event => event.type === 'place-visit');
        
        const totalDistance = movements.reduce((sum, movement) => sum + movement.distance, 0);
        const totalMovementTime = movements.reduce((sum, movement) => sum + movement.duration, 0);
        const placesVisited = visits.length;
        
        return `
            <div class="summary-stats">
                <span class="stat">
                    <span class="stat-icon">🛣️</span>
                    ${(totalDistance / 1000).toFixed(1)} km
                </span>
                <span class="stat">
                    <span class="stat-icon">⏱️</span>
                    ${this.formatDuration(totalMovementTime)}
                </span>
                <span class="stat">
                    <span class="stat-icon">📍</span>
                    ${placesVisited} places
                </span>
            </div>
        `;
    }
    
    renderTimeGroup(group) {
        const startTime = new Date(group.startTime);
        const endTime = new Date(group.endTime);
        
        return `
            <div class="time-group">
                <div class="time-group-header">
                    <span class="time-range">
                        ${startTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                        ${endTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                </div>
                <div class="time-group-events">
                    ${group.events.map(event => this.renderEvent(event)).join('')}
                </div>
            </div>
        `;
    }
    
    renderEvent(event) {
        switch (event.type) {
            case 'movement':
                return this.renderMovementEvent(event);
            case 'place-visit':
                return this.renderPlaceVisitEvent(event);
            default:
                return '';
        }
    }
    
    renderMovementEvent(event) {
        const icon = this.getTransportIcon(event.transportMode);
        const distance = (event.distance / 1000).toFixed(2);
        const duration = this.formatDuration(event.duration);
        const speed = event.averageSpeed.toFixed(1);
        
        return `
            <div class="timeline-event movement-event">
                <div class="event-icon">${icon}</div>
                <div class="event-content">
                    <div class="event-title">
                        ${this.getTransportName(event.transportMode)} - ${distance} km
                    </div>
                    <div class="event-details">
                        <span class="event-time">
                            ${new Date(event.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        <span class="event-duration">${duration}</span>
                        <span class="event-speed">${speed} km/h avg</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderPlaceVisitEvent(event) {
        const duration = this.formatDuration(event.duration);
        const categoryIcon = this.getPlaceCategoryIcon(event.place.category);
        
        return `
            <div class="timeline-event place-event">
                <div class="event-icon">${categoryIcon}</div>
                <div class="event-content">
                    <div class="event-title">${event.place.name}</div>
                    <div class="event-details">
                        <span class="event-time">
                            ${new Date(event.arrivalTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                            ${new Date(event.departureTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        <span class="event-duration">${duration}</span>
                        <span class="event-category">${event.place.category}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    getTransportIcon(mode) {
        const icons = {
            'walking': '🚶',
            'cycling': '🚴',
            'driving': '🚗',
            'fast-transport': '🚄'
        };
        return icons[mode] || '🚶';
    }
    
    getTransportName(mode) {
        const names = {
            'walking': 'Walking',
            'cycling': 'Cycling',
            'driving': 'Driving',
            'fast-transport': 'Fast Transport'
        };
        return names[mode] || 'Movement';
    }
    
    getPlaceCategoryIcon(category) {
        const icons = {
            'home': '🏠',
            'work': '🏢',
            'restaurant': '🍽️',
            'shop': '🛒',
            'gym': '💪',
            'hospital': '🏥',
            'school': '🎓',
            'park': '🌳',
            'gas-station': '⛽',
            'unknown': '📍'
        };
        return icons[category] || '📍';
    }
    
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${seconds}s`;
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
}

// Add CSS styles for timeline
const timelineStyles = `
<style>
.timeline {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.timeline-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #f0f0f0;
}

.timeline-header h3 {
    margin: 0 0 0.5rem 0;
    color: #333;
}

.timeline-summary {
    margin-top: 1rem;
}

.summary-stats {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.stat {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: #f8f9fa;
    border-radius: 20px;
    font-size: 0.9rem;
    font-weight: 500;
}

.stat-icon {
    font-size: 1.1rem;
}

.time-group {
    margin-bottom: 1.5rem;
}

.time-group-header {
    margin-bottom: 0.75rem;
}

.time-range {
    font-weight: 600;
    color: #2196F3;
    font-size: 1rem;
}

.timeline-event {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    border-radius: 8px;
    transition: background-color 0.2s ease;
}

.timeline-event:hover {
    background: #f8f9fa;
}

.movement-event {
    border-left: 4px solid #2196F3;
}

.place-event {
    border-left: 4px solid #4CAF50;
}

.event-icon {
    font-size: 1.5rem;
    min-width: 24px;
    text-align: center;
}

.event-content {
    flex: 1;
}

.event-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: #333;
}

.event-details {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    font-size: 0.85rem;
    color: #666;
}

.event-time {
    font-weight: 500;
}

.empty-state, .error-state {
    text-align: center;
    padding: 3rem 1rem;
    color: #666;
}

.empty-icon, .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.empty-state h3, .error-state h3 {
    margin-bottom: 0.5rem;
    color: #333;
}

@media (max-width: 768px) {
    .summary-stats {
        justify-content: center;
    }
    
    .event-details {
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .timeline-event {
        padding: 0.5rem;
    }
}
</style>
`;

// Inject styles
if (!document.querySelector('#timeline-styles')) {
    const styleElement = document.createElement('div');
    styleElement.id = 'timeline-styles';
    styleElement.innerHTML = timelineStyles;
    document.head.appendChild(styleElement);
}

// Create global instance
window.timelineView = new TimelineView();