/**
 * Mapbox Service for Route Optimization
 * Handles geocoding and distance matrix calculations
 */

class MapboxService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.mapbox.com';
    this.geocodeCache = new Map();
    this.distanceCache = new Map();
    this.matrixApiWarningShown = false; // Only show Matrix API warning once
  }

  /**
   * Geocode an address to coordinates
   */
  async geocodeAddress(address) {
    // Check cache first
    if (this.geocodeCache.has(address)) {
      return this.geocodeCache.get(address);
    }

    try {
      const encodedAddress = encodeURIComponent(address);
      const url = `${this.baseUrl}/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${this.accessToken}&limit=1`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const coords = { lng, lat };

        // Cache the result
        this.geocodeCache.set(address, coords);
        return coords;
      }

      throw new Error('Address not found');
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Get driving distance and time between two addresses using Matrix API
   * @param {string} origin - Origin address
   * @param {string} destination - Destination address
   * @param {Date|string|null} departureTime - Optional departure time for traffic-aware routing (Date object or ISO 8601 string)
   */
  async getDrivingDistance(origin, destination, departureTime = null) {
    // Include departure time in cache key for traffic-aware caching
    const timeKey = departureTime ? `|${departureTime}` : '';
    const cacheKey = `${origin}|${destination}${timeKey}`;

    // Check cache - only use cached results if no specific departure time requested
    if (!departureTime && this.distanceCache.has(cacheKey)) {
      return this.distanceCache.get(cacheKey);
    }

    try {
      // Geocode both addresses
      const originCoords = await this.geocodeAddress(origin);
      const destCoords = await this.geocodeAddress(destination);

      if (!originCoords || !destCoords) {
        throw new Error('Could not geocode addresses');
      }

      // Use the Matrix API for better efficiency and traffic support
      const matrixResult = await this.getDistanceMatrixWithTraffic(
        [originCoords],
        [destCoords],
        departureTime
      );

      if (matrixResult && matrixResult.durations && matrixResult.durations[0]) {
        const durationSeconds = matrixResult.durations[0][0];
        const distanceMeters = matrixResult.distances ? matrixResult.distances[0][0] : durationSeconds * 13.41; // Estimate distance if not provided

        const result = {
          distance: distanceMeters,
          duration: durationSeconds,
          durationMinutes: Math.round(durationSeconds / 60),
          distanceMiles: (distanceMeters * 0.000621371).toFixed(1),
          trafficAware: false // Using driving-traffic profile for current traffic, but not future predictions
        };

        // Cache the result (shorter TTL since it includes traffic)
        this.distanceCache.set(cacheKey, result);
        return result;
      }

      throw new Error('No route found in matrix');
    } catch (error) {
      console.error('Distance calculation error:', error);
      // Return estimated values as fallback
      return {
        distance: 16000, // ~10 miles in meters
        duration: 1200, // 20 minutes
        durationMinutes: 20,
        distanceMiles: '10.0',
        trafficAware: false
      };
    }
  }

  /**
   * Get distance matrix with traffic using Mapbox Matrix API
   * @param {Array} origins - Array of coordinate objects {lng, lat}
   * @param {Array} destinations - Array of coordinate objects {lng, lat}
   * @param {Date|string|null} departureTime - Optional departure time (currently ignored - not supported by plan)
   * @returns {Object} Matrix result with durations and distances
   */
  async getDistanceMatrixWithTraffic(origins, destinations, departureTime = null) {
    try {
      // Combine all coordinates (Matrix API format: origins;destinations)
      const allCoords = [...origins, ...destinations];
      const coordsString = allCoords.map(c => `${c.lng},${c.lat}`).join(';');

      // Use driving-traffic profile for current traffic data
      const profile = 'driving-traffic';

      // Build sources and destinations indices
      const sources = origins.map((_, i) => i).join(';');
      const destinations_indices = destinations.map((_, i) => i + origins.length).join(';');

      // Note: depart_at parameter removed as it's not supported by current Mapbox plan
      // The driving-traffic profile still provides current traffic data
      let url = `${this.baseUrl}/directions-matrix/v1/mapbox/${profile}/${coordsString}?sources=${sources}&destinations=${destinations_indices}&access_token=${this.accessToken}`;

      const response = await fetch(url);

      if (!response.ok) {
        // If Matrix API fails, log once and continue
        if (!this.matrixApiWarningShown) {
          console.warn(`⚠️ Matrix API returned ${response.status}. Using fallback routing.`);
          this.matrixApiWarningShown = true;
        }
        throw new Error(`Matrix API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        durations: data.durations,
        distances: data.distances,
        sources: data.sources,
        destinations: data.destinations
      };
    } catch (error) {
      console.error('Matrix API error:', error);
      throw error;
    }
  }

  /**
   * Calculate distance matrix for multiple locations
   * Returns matrix[i][j] = time in minutes from location i to location j
   * @param {Array<string>} addresses - Array of addresses
   * @param {Date|string|null} departureTime - Optional departure time for traffic-aware routing
   */
  async calculateDistanceMatrix(addresses, departureTime = null) {
    const n = addresses.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));

    try {
      // Geocode all addresses first
      const coords = await Promise.all(
        addresses.map(addr => this.geocodeAddress(addr))
      );

      // Check if all addresses were geocoded successfully
      if (coords.some(c => !c)) {
        throw new Error('Failed to geocode some addresses');
      }

      // Use Matrix API to calculate all distances in one call
      const matrixResult = await this.getDistanceMatrixWithTraffic(
        coords,
        coords,
        departureTime
      );

      // Fill the matrix with results (convert seconds to minutes)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j && matrixResult.durations[i] && matrixResult.durations[i][j]) {
            matrix[i][j] = Math.round(matrixResult.durations[i][j] / 60);
          }
        }
      }

      return matrix;
    } catch (error) {
      console.error('Matrix calculation error, falling back to individual calls:', error);

      // Fallback to individual calls if Matrix API fails
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j) {
            const result = await this.getDrivingDistance(addresses[i], addresses[j], departureTime);
            matrix[i][j] = result.durationMinutes;
          }
        }
      }

      return matrix;
    }
  }

  /**
   * Batch geocode multiple addresses
   */
  async batchGeocode(addresses) {
    const results = {};

    for (const address of addresses) {
      const coords = await this.geocodeAddress(address);
      if (coords) {
        results[address] = coords;
      }
    }

    return results;
  }

  /**
   * Get optimized route order using Mapbox Optimization API
   */
  async getOptimizedRoute(waypoints, startLocation) {
    try {
      // Geocode all locations
      const startCoords = await this.geocodeAddress(startLocation);
      const waypointCoords = await Promise.all(
        waypoints.map(wp => this.geocodeAddress(wp))
      );

      if (!startCoords || waypointCoords.some(c => !c)) {
        throw new Error('Could not geocode all locations');
      }

      // Build coordinates string
      const coords = [startCoords, ...waypointCoords]
        .map(c => `${c.lng},${c.lat}`)
        .join(';');

      // Call Optimization API
      const url = `${this.baseUrl}/optimized-trips/v1/mapbox/driving/${coords}?access_token=${this.accessToken}&source=first&destination=first&roundtrip=false`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.trips && data.trips.length > 0) {
        const trip = data.trips[0];

        // Extract waypoint order
        const waypointOrder = trip.waypoints
          .filter(wp => wp.waypoint_index > 0) // Skip start location
          .map(wp => wp.waypoint_index - 1); // Adjust index

        return {
          order: waypointOrder,
          duration: trip.duration,
          distance: trip.distance,
          durationMinutes: Math.round(trip.duration / 60),
          distanceMiles: (trip.distance * 0.000621371).toFixed(1)
        };
      }

      throw new Error('Optimization failed');
    } catch (error) {
      console.error('Route optimization error:', error);
      // Return original order as fallback
      return {
        order: waypoints.map((_, i) => i),
        duration: 0,
        distance: 0,
        durationMinutes: 0,
        distanceMiles: '0'
      };
    }
  }

  /**
   * Clear caches
   */
  clearCache() {
    this.geocodeCache.clear();
    this.distanceCache.clear();
  }

  /**
   * Reset warning flags (useful for testing or after configuration changes)
   */
  resetWarnings() {
    this.matrixApiWarningShown = false;
    console.log('🔄 Warning flags have been reset.');
  }
}

// Create singleton instance
let mapboxServiceInstance = null;

export const initMapboxService = (accessToken) => {
  mapboxServiceInstance = new MapboxService(accessToken);
  return mapboxServiceInstance;
};

export const getMapboxService = () => {
  if (!mapboxServiceInstance) {
    // Get token from localStorage or use default
    const token = localStorage.getItem('mapboxToken') ||
                  import.meta.env.VITE_MAPBOX_TOKEN ||
                  'pk.eyJ1IjoiamJyYW5ub245NzIiLCJhIjoiY204NXN2Z2w2Mms4ODJrb2tvemV2ZnlicyJ9.84JYhRSUAF5_-vvdebw-TA';
    mapboxServiceInstance = new MapboxService(token);
  }
  return mapboxServiceInstance;
};

export default MapboxService;
