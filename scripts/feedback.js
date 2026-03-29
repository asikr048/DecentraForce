/**
 * Feedback/Testimonial System
 * Store in localStorage key: "feedbacks"
 */

const FEEDBACK_STORAGE_KEY = 'feedbacks';
const MENTORS_STORAGE_KEY = 'mentors';
const COURSES_STORAGE_KEY = 'courses';

function getAllFeedbacks() {
    try {
        const stored = localStorage.getItem(FEEDBACK_STORAGE_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch (error) { return []; }
}

function saveFeedbacks(feedbacks) {
    try { localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(feedbacks)); } catch (e) {}
}

function addFeedback(feedback) {
    const feedbacks = getAllFeedbacks();
    const newFeedback = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name: feedback.name.trim(),
        text: feedback.text.trim(),
        language: feedback.language || 'English',
        rating: feedback.rating || 5,
        role: feedback.role || '',
        imageUrl: feedback.imageUrl || getDefaultAvatar(feedback.name),
        createdAt: feedback.createdAt || new Date().toISOString()
    };
    feedbacks.push(newFeedback);
    saveFeedbacks(feedbacks);
    return newFeedback;
}

function updateFeedback(id, updates) {
    const feedbacks = getAllFeedbacks();
    const index = feedbacks.findIndex(f => f.id == id);
    if (index === -1) return false;
    feedbacks[index] = { ...feedbacks[index], ...updates };
    saveFeedbacks(feedbacks);
    return true;
}

function deleteFeedback(id) {
    const feedbacks = getAllFeedbacks();
    const newFeedbacks = feedbacks.filter(f => f.id != id);
    if (newFeedbacks.length === feedbacks.length) return false;
    saveFeedbacks(newFeedbacks);
    return true;
}

function getDefaultAvatar(name) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    const colors = ['7b5cff','00e5ff','ff4d8d','00e599','d4af37','ff7b5c','5caaff'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${color}&color=fff&size=128&bold=true`;
}

function renderFeedbacks(containerSelector, feedbacks = null) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const allFeedbacks = feedbacks || getAllFeedbacks();
    if (allFeedbacks.length === 0) {
        container.innerHTML = `<div class="feedback-empty-state"><div style="font-size:3rem;margin-bottom:16px">💬</div><h3>No feedback yet</h3><p>Be the first to share your experience!</p></div>`;
        return;
    }
    container.innerHTML = allFeedbacks.map(feedback => {
        const r = feedback.rating || 5;
        const stars = '<span style="color:#fbbf24">' + '★'.repeat(r) + '</span><span style="color:#334">' + '☆'.repeat(5-r) + '</span>';
        const isAdmin = containerSelector.includes('admin') || containerSelector.includes('feedbacksList');
        return `
        <div class="feedback-card" data-feedback-id="${feedback.id}">
            <div class="feedback-quote-mark">"</div>
            <div class="feedback-body-text">${escapeHtml(feedback.text).replace(/\n/g,'<br>')}</div>
            <div class="feedback-rating">${stars}</div>
            <div class="feedback-author-row">
                <div class="feedback-avatar-img">
                    <img src="${feedback.imageUrl}" alt="${escapeHtml(feedback.name)}" loading="lazy" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(feedback.name.substring(0,2))}&background=7b5cff&color=fff&size=128&bold=true'">
                </div>
                <div class="feedback-author-info">
                    <h4 class="feedback-author-name">${escapeHtml(feedback.name)}</h4>
                    <div class="feedback-author-role">${escapeHtml(feedback.role || 'Web3 Learner')}</div>
                    <div class="feedback-meta-row">
                        <span class="lang-badge lang-${(feedback.language||'english').toLowerCase()}">${feedback.language||'English'}</span>
                        <span class="feedback-date-text">${formatDate(feedback.createdAt)}</span>
                    </div>
                </div>
            </div>
            ${isAdmin ? `<div class="feedback-admin-btns"><button class="fb-edit-btn" onclick="editFeedback(${feedback.id})">✏️ Edit</button><button class="fb-delete-btn" onclick="deleteFeedbackUI(${feedback.id})">🗑️ Delete</button></div>` : ''}
        </div>`;
    }).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays/7)} weeks ago`;
    return date.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function initDefaultFeedbacks() {
    const feedbacks = getAllFeedbacks();
    if (feedbacks.length > 0) return;
    const mock = [
        { name:"আহমেদ রহমান", text:"ডিসেন্ট্রাফোর্সের কোর্সগুলো সত্যিই অসাধারণ! ব্লকচেইন বেসিক থেকে স্মার্ট কন্ট্র্যাক্ট পর্যন্ত সব কিছু এত সুন্দরভাবে শেখানো হয়েছে। মেন্টরদের সাপোর্ট অতুলনীয়।", language:"Bangla", rating:5, role:"ব্লকচেইন ডেভেলপার", createdAt:new Date(Date.now()-2*86400000).toISOString() },
        { name:"Sarah Johnson", text:"This platform completely transformed my career! The Web3 curriculum is world-class and the mentors are incredibly supportive. I landed a job at a crypto startup within 3 months of completing the DeFi course.", language:"English", rating:5, role:"DeFi Protocol Engineer", createdAt:new Date(Date.now()-5*86400000).toISOString() },
        { name:"সুমাইয়া আক্তার", text:"বাংলায় ব্লকচেইন শেখার এত ভালো প্ল্যাটফর্ম আর দেখিনি। প্রতিটি কন্সেপ্ট এত সহজভাবে বোঝানো হয়েছে। এখন আমি নিজেই NFT মার্কেটপ্লেস তৈরি করতে পারি!", language:"Bangla", rating:5, role:"NFT আর্টিস্ট ও ডেভেলপার", createdAt:new Date(Date.now()-8*86400000).toISOString() },
        { name:"Marcus Williams", text:"The smart contract development course is outstanding. The hands-on projects taught me more in 6 weeks than I learned in a year of self-study. Highly recommend to anyone serious about Web3.", language:"English", rating:5, role:"Smart Contract Auditor", createdAt:new Date(Date.now()-12*86400000).toISOString() },
        { name:"রাকিব হাসান", text:"বাংলাদেশ থেকে ব্লকচেইন ডেভেলপার হওয়ার স্বপ্ন পূরণ করেছে ডিসেন্ট্রাফোর্স। মেন্টরদের গাইডেন্সে এখন ইন্টারন্যাশনাল প্রজেক্টে কাজ করছি।", language:"Bangla", rating:5, role:"Web3 ফ্রিল্যান্সার", createdAt:new Date(Date.now()-15*86400000).toISOString() },
        { name:"Priya Patel", text:"DecentraForce has the most comprehensive DeFi course I've ever taken. The yield farming strategies they teach are actually used by professionals. My portfolio grew 40% after applying these techniques.", language:"English", rating:5, role:"DeFi Investor & Analyst", createdAt:new Date(Date.now()-20*86400000).toISOString() },
        { name:"ফারহানা ইসলাম", text:"স্মার্ট কন্ট্র্যাক্ট কোর্সটি শেষ করার পরে আমার সম্পূর্ণ চিন্তাভাবনা বদলে গেছে। ডিসেন্ট্রালাইজড ফিনান্স সম্পর্কে এখন অনেক পরিষ্কার ধারণা আছে।", language:"Bangla", rating:4, role:"ফিনটেক বিশেষজ্ঞ", createdAt:new Date(Date.now()-25*86400000).toISOString() },
        { name:"James Chen", text:"As a traditional finance professional, the transition to Web3 felt daunting. DecentraForce made it seamless. The blockchain fundamentals course bridges traditional finance and DeFi perfectly.", language:"English", rating:5, role:"TradFi to DeFi Specialist", createdAt:new Date(Date.now()-30*86400000).toISOString() }
    ];
    mock.forEach(f => addFeedback(f));
}

function initDefaultMentors() {
    try {
        const existing = localStorage.getItem(MENTORS_STORAGE_KEY);
        if (existing && JSON.parse(existing).length > 0) return;
    } catch(e) {}
    const mock = [
        { id:1001, name:"রিফাত করিম", nameEn:"Rifat Karim", title:"Senior Blockchain Architect", bio:"10+ বছরের অভিজ্ঞতা সহ ব্লকচেইন ও DeFi বিশেষজ্ঞ। Ethereum Foundation কন্ট্রিবিউটর।", imageUrl:"https://ui-avatars.com/api/?name=RK&background=7b5cff&color=fff&size=128&bold=true", twitter:"#", linkedin:"#", github:"#" },
        { id:1002, name:"Samira Hossain", nameEn:"Samira Hossain", title:"Web3 Frontend Developer", bio:"React ও Solidity বিশেষজ্ঞ। 50+ dApp তৈরির অভিজ্ঞতা সহ top DeFi প্রোটোকলে কাজ করেছেন।", imageUrl:"https://ui-avatars.com/api/?name=SH&background=ff4d8d&color=fff&size=128&bold=true", twitter:"#", linkedin:"#", github:"#" },
        { id:1003, name:"তানভীর মাহমুদ", nameEn:"Tanvir Mahmud", title:"Smart Contract Security Expert", bio:"Solidity অডিটর হিসেবে ৩০০+ মিলিয়ন ডলারের স্মার্ট কন্ট্র্যাক্ট সিকিউরিটি রিভিউ করেছেন।", imageUrl:"https://ui-avatars.com/api/?name=TM&background=00e599&color=fff&size=128&bold=true", twitter:"#", linkedin:"#", github:"#" },
        { id:1004, name:"Alex Rodriguez", nameEn:"Alex Rodriguez", title:"DeFi Protocol Engineer", bio:"Uniswap ও Aave contributor. DeFi yield strategies ও liquidity management বিশেষজ্ঞ।", imageUrl:"https://ui-avatars.com/api/?name=AR&background=fbbf24&color=fff&size=128&bold=true", twitter:"#", linkedin:"#", github:"#" },
        { id:1005, name:"নাজমুল হুদা", nameEn:"Nazmul Huda", title:"NFT & Metaverse Strategist", bio:"বাংলাদেশের প্রথম NFT মার্কেটপ্লেস প্রতিষ্ঠাতা। ডিজিটাল আর্ট ও Web3 গেমিং বিশেষজ্ঞ।", imageUrl:"https://ui-avatars.com/api/?name=NH&background=00e5ff&color=fff&size=128&bold=true", twitter:"#", linkedin:"#", github:"#" },
        { id:1006, name:"Priya Nair", nameEn:"Priya Nair", title:"Crypto Economics Researcher", bio:"MIT-trained economist specializing in tokenomics, DAO governance, and decentralized finance systems.", imageUrl:"https://ui-avatars.com/api/?name=PN&background=ff7b5c&color=fff&size=128&bold=true", twitter:"#", linkedin:"#", github:"#" }
    ];
    localStorage.setItem(MENTORS_STORAGE_KEY, JSON.stringify(mock));
}

function initDefaultCourses() {
    try {
        const existing = localStorage.getItem(COURSES_STORAGE_KEY);
        if (existing && JSON.parse(existing).length > 0) return;
    } catch(e) {}
    const mock = [
        { id:2001, title:"Blockchain Fundamentals & Web3 Intro", description:"Grasp the core concepts of distributed ledgers, consensus mechanisms, and the decentralized web.", modules:"Blockchain,Distributed Systems,Consensus", price:2200, status:"active", rating:4.9, reviews:2100, badge:"🔥 Bestseller", level:"Beginner", whatsapp:"#" },
        { id:2002, title:"Smart Contract Development with Solidity", description:"Write, test, and deploy secure Ethereum smart contracts from scratch to production.", modules:"Solidity,Ethereum,Smart Contracts", price:2800, status:"active", rating:4.8, reviews:1600, badge:"⚡ New", level:"Intermediate", whatsapp:"#" },
        { id:2003, title:"NFT Creation, Minting & Marketplace", description:"Create and launch your own NFT collection with royalties, metadata, and marketplace listings.", modules:"NFT,IPFS,Marketplace", price:1800, status:"active", rating:4.7, reviews:980, badge:"🎨 Popular", level:"Beginner", whatsapp:"#" },
        { id:2004, title:"DeFi Protocols & Yield Strategy Mastery", description:"Deep dive into liquidity pools, AMMs, lending protocols, and advanced yield farming strategies.", modules:"DeFi,Uniswap,Yield Farming", price:3200, status:"active", rating:4.9, reviews:1200, badge:"📈 Trending", level:"Advanced", whatsapp:"#" },
        { id:2005, title:"Web3 Full Stack Development", description:"Build complete dApps with React, ethers.js, and Hardhat. Deploy on mainnet and testnets.", modules:"React,ethers.js,Hardhat,Web3", price:3500, status:"active", rating:4.8, reviews:890, badge:"⭐ Featured", level:"Intermediate", whatsapp:"#" },
        { id:2006, title:"বাংলায় ব্লকচেইন পরিচিতি (Free)", description:"সম্পূর্ণ বাংলায় ব্লকচেইন প্রযুক্তির বেসিক ধারণা। একেবারে নতুনদের জন্য আদর্শ।", modules:"ব্লকচেইন,ক্রিপ্টো,Web3", price:0, status:"active", rating:5.0, reviews:3400, badge:"🆓 Free", level:"Beginner", whatsapp:"#" }
    ];
    localStorage.setItem(COURSES_STORAGE_KEY, JSON.stringify(mock));
}

function initFeedbackSection() {
    initDefaultFeedbacks();
    initDefaultMentors();
    initDefaultCourses();
    const feedbacks = getAllFeedbacks();
    if (feedbacks.length > 0) {
        renderFeedbacks('#feedback-container', feedbacks);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getAllFeedbacks, addFeedback, updateFeedback, deleteFeedback, renderFeedbacks, initFeedbackSection, initDefaultFeedbacks, initDefaultMentors, initDefaultCourses };
}
