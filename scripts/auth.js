
/**
 * Authentication utilities for DecentraForce
 * This script handles automatic login, session verification, and user state management
 */

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.isLoggedIn = false;
    this.init();
  }

  async init() {
    // Check if user is already logged in on page load
    await this.checkSession();
    
    // Update UI based on login state
    this.updateUI();
  }

  /**
   * Check if user has a valid session
   */
  async checkSession() {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'GET',
        credentials: 'include' // Important for cookies
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.loggedIn) {
          this.currentUser = data.user;
          this.isLoggedIn = true;
          console.log('User is logged in:', this.currentUser.username);
          return true;
        }
      }
    } catch (error) {
      console.error('Session check failed:', error);
    }
    
    this.currentUser = null;
    this.isLoggedIn = false;
    return false;
  }

  /**
   * Update UI elements based on login state
   */
  updateUI() {
    // Find login/logout buttons and user display elements
    const loginButtons = document.querySelectorAll('[data-auth="login"]');
    const logoutButtons = document.querySelectorAll('[data-auth="logout"]');
    const userDisplayElements = document.querySelectorAll('[data-auth="user"]');
    const protectedElements = document.querySelectorAll('[data-auth="protected"]');
    const registerButtons = document.querySelectorAll('[data-auth="register"]');

    if (this.isLoggedIn) {
      // User is logged in
      loginButtons.forEach(btn => btn.style.display = 'none');
      logoutButtons.forEach(btn => btn.style.display = 'inline-block');
      
      // Update user display elements
      userDisplayElements.forEach(el => {
        if (el.dataset.field === 'username') {
          el.textContent = this.currentUser.username;
        } else if (el.dataset.field === 'email') {
          el.textContent = this.currentUser.email;
        } else {
          el.textContent = this.currentUser.username;
        }
        el.style.display = 'inline-block';
      });

      // Show protected elements
      protectedElements.forEach(el => {
        el.style.display = 'block';
      });

      // Hide register buttons
      registerButtons.forEach(btn => btn.style.display = 'none');
    } else {
      // User is not logged in
      loginButtons.forEach(btn => btn.style.display = 'inline-block');
      logoutButtons.forEach(btn => btn.style.display = 'none');
      
      // Hide user display elements
      userDisplayElements.forEach(el => {
        el.style.display = 'none';
      });

      // Hide protected elements
      protectedElements.forEach(el => {
        el.style.display = 'none';
      });

      // Show register buttons
      registerButtons.forEach(btn => btn.style.display = 'inline-block');
    }
  }

  /**
   * Login with email or username
   */
  async login(identifier, password = null) {
    try {
      // Determine if identifier is email or username
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isEmail = emailRegex.test(identifier);
      
      const requestBody = isEmail ? { email: identifier } : { username: identifier };
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.currentUser = data.user;
        this.isLoggedIn = true;
        this.updateUI();
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Logout current user
   */
  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      this.currentUser = null;
      this.isLoggedIn = false;
      this.updateUI();
      
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: 'Logout failed' };
    }
  }

  /**
   * Register new user
   */
  async register(username, email) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email })
      });
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Get current user info
   */
  getUser() {
    return this.currentUser;
  }

  /**
   * Check if user is logged in
   */
  getIsLoggedIn() {
    return this.isLoggedIn;
  }
}

// Create global auth instance
window.auth = new AuthManager();

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // If auth wasn't already initialized, initialize it
  if (!window.auth) {
    window.auth = new AuthManager();
  }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthManager;
}