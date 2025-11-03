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

      // Validate departure time if provided
      let validDepartureTime = null;
      if (departureTime) {
        const now = new Date();
        const depTime = departureTime instanceof Date ? departureTime : new Date(departureTime);

        // Mapbox requires departure time to be in the future and within 12 hours
        const timeDiffMs = depTime.getTime() - now.getTime();
        const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

        // Only use traffic data if time is in the future and within 12 hours
        if (timeDiffMs > 0 && timeDiffHours <= 12) {
          validDepartureTime = depTime;
        } else if (timeDiffMs <= 0) {
          console.log(`⏰ Departure time ${depTime.toISOString()} is in the past, using current traffic`);
        } else {
          console.log(`⏰ Departure time ${depTime.toISOString()} is too far in future (${timeDiffHours.toFixed(1)}h), using current traffic`);
        }
      }

      // Build URL with optional departure time for traffic predictions
      let url = `${this.baseUrl}/directions/v5/mapbox/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?access_token=${this.accessToken}&geometries=geojson`;

      if (validDepartureTime) {
        const isoTime = validDepartureTime.toISOString();
        url += `&depart_at=${encodeURIComponent(isoTime)}`;
        console.log(`🚗 Calculating drive time with traffic for departure at ${isoTime}`);
      }

      const response = await fetch(url);

      // Handle specific error responses
      if (!response.ok) {
        if (response.status === 422) {
          console.warn(`⚠️ Mapbox rejected departure time, falling back to standard routing`);
          // Retry without departure time
          const fallbackUrl = `${this.baseUrl}/directions/v5/mapbox/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?access_token=${this.accessToken}&geometries=geojson`;
          const fallbackResponse = await fetch(fallbackUrl);
          const fallbackData = await fallbackResponse.json();

          if (fallbackData.routes && fallbackData.routes.length > 0) {
            const route = fallbackData.routes[0];
            return {
              distance: route.distance,
              duration: route.duration,
              durationMinutes: Math.round(route.duration / 60),
              distanceMiles: (route.distance * 0.000621371).toFixed(1),
              trafficAware: false
            };
          }
        }
        throw new Error(`Mapbox API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const result = {
          distance: route.distance, // meters
          duration: route.duration, // seconds (traffic-adjusted if departureTime provided)
          durationMinutes: Math.round(route.duration / 60),
          distanceMiles: (route.distance * 0.000621371).toFixed(1),
          trafficAware: !!validDepartureTime
        };

        // Cache the result (with shorter TTL for traffic-aware results)
        if (!departureTime) {
          this.distanceCache.set(cacheKey, result);
        }
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
   * Calculate distance matrix for multiple locations
   * Returns matrix[i][j] = time in minutes from location i to location j
   */
  async calculateDistanceMatrix(addresses) {
    const n = addresses.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));

    // Calculate all pairs
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const result = await this.getDrivingDistance(addresses[i], addresses[j]);
          matrix[i][j] = result.durationMinutes;
        }
      }
    }

    return matrix;
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
