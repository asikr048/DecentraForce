/**
 * Feedback/Testimonial System
 * Store in localStorage key: "feedbacks"
 */

const FEEDBACK_STORAGE_KEY = 'feedbacks';

/**
 * Get all feedbacks from localStorage
 * @returns {Array} Array of feedback objects
 */
function getAllFeedbacks() {
    try {
        const stored = localStorage.getItem(FEEDBACK_STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch (error) {
        console.error('Error reading feedbacks from localStorage:', error);
        return [];
    }
}

/**
 * Save feedbacks to localStorage
 * @param {Array} feedbacks - Array of feedback objects
 */
function saveFeedbacks(feedbacks) {
    try {
        localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(feedbacks));
    } catch (error) {
        console.error('Error saving feedbacks to localStorage:', error);
    }
}

/**
 * Add a new feedback
 * @param {Object} feedback - Feedback object with name, text, language, imageUrl
 * @returns {Object} The added feedback with generated id and timestamp
 */
function addFeedback(feedback) {
    const feedbacks = getAllFeedbacks();
    const newFeedback = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: feedback.name.trim(),
        text: feedback.text.trim(),
        language: feedback.language || 'English',
        imageUrl: feedback.imageUrl || getDefaultAvatar(feedback.name),
        createdAt: new Date().toISOString()
    };
    feedbacks.push(newFeedback);
    saveFeedbacks(feedbacks);
    return newFeedback;
}

/**
 * Update an existing feedback
 * @param {number} id - Feedback ID
 * @param {Object} updates - Object with fields to update
 * @returns {boolean} Success status
 */
function updateFeedback(id, updates) {
    const feedbacks = getAllFeedbacks();
    const index = feedbacks.findIndex(f => f.id == id);
    if (index === -1) return false;
    
    feedbacks[index] = {
        ...feedbacks[index],
        ...updates,
        name: updates.name ? updates.name.trim() : feedbacks[index].name,
        text: updates.text ? updates.text.trim() : feedbacks[index].text,
        language: updates.language || feedbacks[index].language,
        imageUrl: updates.imageUrl || feedbacks[index].imageUrl
    };
    
    saveFeedbacks(feedbacks);
    return true;
}

/**
 * Delete a feedback by ID
 * @param {number} id - Feedback ID
 * @returns {boolean} Success status
 */
function deleteFeedback(id) {
    const feedbacks = getAllFeedbacks();
    const newFeedbacks = feedbacks.filter(f => f.id != id);
    if (newFeedbacks.length === feedbacks.length) return false;
    saveFeedbacks(newFeedbacks);
    return true;
}

/**
 * Get default avatar URL based on name
 * @param {string} name - User's name
 * @returns {string} Avatar URL
 */
function getDefaultAvatar(name) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    const colors = ['7b5cff', '00e5ff', 'ff4d8d', '00e599', 'd4af37'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${color}&color=fff&size=128&bold=true`;
}

/**
 * Render feedbacks to a container
 * @param {string} containerSelector - CSS selector for container
 * @param {Array} feedbacks - Optional filtered feedbacks (defaults to all)
 */
function renderFeedbacks(containerSelector, feedbacks = null) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    const allFeedbacks = feedbacks || getAllFeedbacks();
    
    if (allFeedbacks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <h3>No feedback yet</h3>
                <p>Be the first to share your experience!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = allFeedbacks.map(feedback => `
        <div class="feedback-card" data-feedback-id="${feedback.id}">
            <div class="feedback-header">
                <div class="feedback-avatar">
                    <img src="${feedback.imageUrl}" alt="${feedback.name}" loading="lazy">
                </div>
                <div class="feedback-meta">
                    <h4 class="feedback-name">${escapeHtml(feedback.name)}</h4>
                    <div class="feedback-language">
                        <span class="language-badge ${feedback.language.toLowerCase()}">${feedback.language}</span>
                        <span class="feedback-date">${formatDate(feedback.createdAt)}</span>
                    </div>
                </div>
            </div>
            <div class="feedback-text">
                ${escapeHtml(feedback.text).replace(/\n/g, '<br>')}
            </div>
            ${containerSelector.includes('admin') ? `
                <div class="feedback-actions">
                    <button class="btn-edit" onclick="editFeedback(${feedback.id})">Edit</button>
                    <button class="btn-delete" onclick="deleteFeedbackUI(${feedback.id})">Delete</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

/**
 * Format date for display
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Initialize feedback system on homepage
 */
function initFeedbackSection() {
    const feedbacks = getAllFeedbacks();
    if (feedbacks.length > 0) {
        renderFeedbacks('#feedback-container', feedbacks);
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getAllFeedbacks,
        addFeedback,
        updateFeedback,
        deleteFeedback,
        renderFeedbacks,
        initFeedbackSection
    };
}