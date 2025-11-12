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
    this.matrixApiFallbackShown = false; // Only show fallback message once
    this.matrixApiAvailable = false; // Disabled: Matrix API requires premium Mapbox plan
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
   * Get driving distance and time between two addresses
   * @param {string} origin - Origin address
   * @param {string} destination - Destination address
   * @param {Date|string|null} departureTime - Optional departure time (currently ignored - not supported by plan)
   */
  async getDrivingDistance(origin, destination, departureTime = null) {
    const cacheKey = `${origin}|${destination}`;

    // Check cache
    if (this.distanceCache.has(cacheKey)) {
      return this.distanceCache.get(cacheKey);
    }

    try {
      // Geocode both addresses
      const originCoords = await this.geocodeAddress(origin);
      const destCoords = await this.geocodeAddress(destination);

      if (!originCoords || !destCoords) {
        throw new Error('Could not geocode addresses');
      }

      // Only try Matrix API if it's available (not disabled by previous 422 errors)
      if (this.matrixApiAvailable) {
        try {
          const matrixResult = await this.getDistanceMatrixWithTraffic(
            [originCoords],
            [destCoords],
            null
          );

          if (matrixResult && matrixResult.durations && matrixResult.durations[0]) {
            const durationSeconds = matrixResult.durations[0][0];
            const distanceMeters = matrixResult.distances ? matrixResult.distances[0][0] : durationSeconds * 13.41;

            const result = {
              distance: distanceMeters,
              duration: durationSeconds,
              durationMinutes: Math.round(durationSeconds / 60),
              distanceMiles: (distanceMeters * 0.000621371).toFixed(1),
              trafficAware: false
            };

            this.distanceCache.set(cacheKey, result);
            return result;
          }
        } catch (matrixError) {
          // Matrix API failed, disable it and fall back to Directions API
          if (!this.matrixApiFallbackShown) {
            console.info('ℹ️ Matrix API not available on your plan. Using Directions API for all routes.');
            this.matrixApiFallbackShown = true;
          }
          this.matrixApiAvailable = false; // Disable for future calls
        }
      }

      // Use Directions API (either as fallback or because Matrix API is disabled)
      const url = `${this.baseUrl}/directions/v5/mapbox/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?access_token=${this.accessToken}&geometries=geojson`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const result = {
          distance: route.distance,
          duration: route.duration,
          durationMinutes: Math.round(route.duration / 60),
          distanceMiles: (route.distance * 0.000621371).toFixed(1),
          trafficAware: false
        };

        this.distanceCache.set(cacheKey, result);
        return result;
      }

      throw new Error('No route found');
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
   * Get distance matrix using Mapbox Matrix API
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

      // Use basic driving profile (driving-traffic requires premium plan)
      const profile = 'driving';

      // Build sources and destinations indices
      const sources = origins.map((_, i) => i).join(';');
      const destinations_indices = destinations.map((_, i) => i + origins.length).join(';');

      let url = `${this.baseUrl}/directions-matrix/v1/mapbox/${profile}/${coordsString}?sources=${sources}&destinations=${destinations_indices}&access_token=${this.accessToken}`;

      const response = await fetch(url);

      if (!response.ok) {
        // If 422, Matrix API is not supported by this plan
        if (response.status === 422) {
          this.matrixApiAvailable = false;
          if (!this.matrixApiWarningShown) {
            console.warn(`⚠️ Matrix API not supported by your Mapbox plan (422). Using Directions API.`);
            this.matrixApiWarningShown = true;
          }
        } else if (!this.matrixApiWarningShown) {
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

    // If Matrix API is disabled, use individual calls directly
    if (!this.matrixApiAvailable) {
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
      this.matrixApiAvailable = false; // Disable Matrix API

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
   * Batch geocode multiple addresses efficiently
   * Uses parallel requests with chunking to geocode many addresses quickly
   * @param {Array<string>} addresses - Array of addresses to geocode
   * @param {number} chunkSize - Number of addresses to geocode in parallel (default: 10)
   * @returns {Object} Map of address -> {lng, lat}
   */
  async batchGeocode(addresses, chunkSize = 10) {
    console.log(`📍 Batch geocoding ${addresses.length} addresses (${chunkSize} at a time)...`);
    const startTime = performance.now();
    const results = {};
    const uniqueAddresses = [...new Set(addresses)]; // Remove duplicates

    // Check cache first for all addresses
    const uncachedAddresses = [];
    for (const address of uniqueAddresses) {
      if (this.geocodeCache.has(address)) {
        results[address] = this.geocodeCache.get(address);
      } else {
        uncachedAddresses.push(address);
      }
    }

    console.log(`✅ Found ${uniqueAddresses.length - uncachedAddresses.length} addresses in cache`);
    console.log(`🔄 Need to geocode ${uncachedAddresses.length} new addresses`);

    // Geocode uncached addresses in parallel chunks
    for (let i = 0; i < uncachedAddresses.length; i += chunkSize) {
      const chunk = uncachedAddresses.slice(i, i + chunkSize);

      // Geocode all addresses in this chunk in parallel
      const chunkResults = await Promise.all(
        chunk.map(async (address) => {
          const coords = await this.geocodeAddress(address);
          return { address, coords };
        })
      );

      // Store results
      chunkResults.forEach(({ address, coords }) => {
        if (coords) {
          results[address] = coords;
        }
      });

      // Progress update
      const progress = Math.min(i + chunkSize, uncachedAddresses.length);
      console.log(`📍 Geocoded ${progress}/${uncachedAddresses.length} addresses...`);
    }

    const duration = ((performance.now() - startTime) / 1000).toFixed(2);
    const avgTime = (duration * 1000 / uniqueAddresses.length).toFixed(0);
    console.log(`✅ Batch geocoding complete: ${uniqueAddresses.length} addresses in ${duration}s (${avgTime}ms avg per address)`);

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
