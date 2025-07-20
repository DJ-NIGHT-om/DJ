// Main script for browser compatibility
(function() {
    'use strict';
    
    // Register service worker for offline functionality
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('./sw.js')
                .then(function(registration) {
                    console.log('ServiceWorker registration successful');
                })
                .catch(function(error) {
                    console.log('ServiceWorker registration failed');
                });
        });
    }

    document.addEventListener('DOMContentLoaded', function() {
        // Check if user is logged in
        var currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        // Display current user
        var userDisplay = document.getElementById('current-user-display');
        if (userDisplay) {
            userDisplay.textContent = 'مرحباً، ' + currentUser;
        }

        // Logout functionality
        var logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function() {
                window.showConfirm('هل أنت متأكد من تسجيل الخروج؟')
                    .then(function(confirmed) {
                        if (confirmed) {
                            localStorage.removeItem('currentUser');
                            localStorage.removeItem('currentUserPassword');
                            localStorage.removeItem('archivedPlaylists');
                            window.location.href = 'login.html';
                        }
                    });
            });
        }

        // Check if the GAS_URL_ENDPOINT is configured
        if (!window.GAS_URL_ENDPOINT || window.GAS_URL_ENDPOINT === 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE' || window.GAS_URL_ENDPOINT.indexOf('https://script.google.com') !== 0) {
            window.showAlert('الرجاء اتباع التعليمات في ملف config.js وإضافة رابط Google Apps Script الصحيح.');
            window.showLoading(false);
            return;
        }

        var dom = window.getDOMElements();
        var allPlaylists = [];
        var syncInterval;

        // Start real-time synchronization
        startRealTimeSync();
        
        // Stop sync when page is hidden/unloaded
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                stopRealTimeSync();
            } else {
                startRealTimeSync();
            }
        });
        
        window.addEventListener('beforeunload', stopRealTimeSync);
    });
})();