/**
 * Course Caching Module
 * Provides localStorage caching for courses to reduce database calls
 */

const CACHE_KEY = 'courses';
const CACHE_TIMESTAMP_KEY = 'courses_timestamp';
const CACHE_EXPIRY_MS = 3600000; // 1 hour

/**
 * Get courses from cache or fetch from API
 * @returns {Promise<Array>} Array of course objects
 */
export async function getCourses() {
  try {
    // Check cache first
    const cached = getCachedCourses();
    if (cached) {
      // Return cached data immediately
      console.log('Using cached courses');
      return cached;
    }
    
    // Fetch fresh data
    const response = await fetch('/api/_public/courses');
    if (!response.ok) throw new Error('Failed to fetch courses');
    
    const { courses } = await response.json();
    
    // Update cache
    cacheCourses(courses);
    
    return courses;
  } catch (error) {
    console.error('Error fetching courses:', error);
    
    // Fallback to cache even if expired
    const cached = getCachedCourses(true); // force get even if expired
    if (cached) {
      console.log('Using expired cache as fallback');
      return cached;
    }
    
    throw error;
  }
}

/**
 * Get cached courses if available and not expired
 * @param {boolean} force - Return cached data even if expired
 * @returns {Array|null} Cached courses or null
 */
function getCachedCourses(force = false) {
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    
    if (!cachedData || !timestamp) return null;
    
    const age = Date.now() - parseInt(timestamp, 10);
    
    if (!force && age > CACHE_EXPIRY_MS) {
      console.log('Cache expired, fetching fresh data');
      return null;
    }
    
    return JSON.parse(cachedData);
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
}

/**
 * Cache courses to localStorage
 * @param {Array} courses - Course data to cache
 */
function cacheCourses(courses) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(courses));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    console.log('Courses cached successfully');
  } catch (error) {
    console.error('Error caching courses:', error);
  }
}

/**
 * Clear the course cache
 */
export function clearCourseCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIMESTAMP_KEY);
  console.log('Course cache cleared');
}

/**
 * Force refresh courses from API and update cache
 * @returns {Promise<Array>} Fresh course data
 */
export async function refreshCourses() {
  try {
    const response = await fetch('/api/_public/courses');
    if (!response.ok) throw new Error('Failed to fetch courses');
    
    const { courses } = await response.json();
    cacheCourses(courses);
    
    return courses;
  } catch (error) {
    console.error('Error refreshing courses:', error);
    throw error;
  }
}

/**
 * Get cache status
 * @returns {Object} Cache status information
 */
export function getCacheStatus() {
  const cachedData = localStorage.getItem(CACHE_KEY);
  const timestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
  
  if (!cachedData || !timestamp) {
    return { hasCache: false, age: null, expired: true };
  }
  
  const age = Date.now() - parseInt(timestamp, 10);
  const expired = age > CACHE_EXPIRY_MS;
  
  return {
    hasCache: true,
    age,
    expired,
    ageFormatted: formatAge(age),
    itemCount: JSON.parse(cachedData).length
  };
}

/**
 * Format age in human readable format
 * @param {number} ms - Age in milliseconds
 * @returns {string} Formatted age
 */
function formatAge(ms) {
  if (ms < 60000) return `${Math.floor(ms / 1000)} seconds`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)} minutes`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)} hours`;
  return `${Math.floor(ms / 86400000)} days`;
}