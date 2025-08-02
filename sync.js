// Real-time sync functionality
(function() {
    'use strict';
    
    /* @tweakable The delay in milliseconds between each background data sync. (e.g., 3000 = 3 seconds) */
    const syncFrequency = 3000;
    var syncInterval;
    var allPlaylists = [];
    var allSheetData = []; // To store all data from the sheet for date checking
    var lastSyncTime = 0;

    /**
     * Syncs data from Google Sheets and updates both main page and archive (user-specific)
     */
    function syncDataFromSheet() {
        var currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return Promise.resolve();

        // Prevent excessive sync calls
        var now = Date.now();
        if (now - lastSyncTime < 1000) {
            return Promise.resolve();
        }
        lastSyncTime = now;

        return window.fetchPlaylistsFromSheet()
            .then(function(data) {
                allSheetData = data; // Store all fetched data

                // Filter data for current user only
                var userPlaylists = data.filter(function(playlist) {
                    return playlist.username === currentUser;
                });

                var today = new Date();
                today.setHours(0, 0, 0, 0); // Set to start of today for comparison

                var currentPlaylists = [];
                var playlistsToArchive = [];
                var localArchive = JSON.parse(localStorage.getItem('archivedPlaylists')) || [];
                var localArchiveIds = {};
                
                // Create a lookup for archived IDs
                for (var i = 0; i < localArchive.length; i++) {
                    localArchiveIds[localArchive[i].id.toString()] = true;
                }

                // Process fetched data (user-specific)
                for (var i = 0; i < userPlaylists.length; i++) {
                    var playlist = userPlaylists[i];
                    
                    // Skip credential-only entries (entries without actual playlist data)
                    if (!playlist.date || playlist.date.trim() === '') {
                        continue;
                    }
                    
                    var eventDate = new Date(playlist.date);
                    eventDate.setHours(0, 0, 0, 0); // Set to start of event date for comparison

                    if (!isNaN(eventDate.getTime()) && eventDate < today) {
                        // This should be archived (date is in the past)
                        if (!localArchiveIds[playlist.id.toString()]) {
                            playlistsToArchive.push(playlist);
                        } else {
                            // Update existing archived item
                            for (var j = 0; j < localArchive.length; j++) {
                                if (localArchive[j].id.toString() === playlist.id.toString()) {
                                    localArchive[j] = playlist;
                                    break;
                                }
                            }
                        }
                    } else {
                        // This should be on main page (date is today or in the future)
                        currentPlaylists.push(playlist);
                        
                        // If it was in archive but date changed, remove from archive
                        if (localArchiveIds[playlist.id.toString()]) {
                            localArchive = localArchive.filter(function(p) {
                                return p.id.toString() !== playlist.id.toString();
                            });
                        }
                    }
                }

                // Check for deleted items in Google Sheet and remove from archive
                var sheetIds = {};
                for (var i = 0; i < userPlaylists.length; i++) {
                    sheetIds[userPlaylists[i].id.toString()] = true;
                }
                localArchive = localArchive.filter(function(p) {
                    return sheetIds[p.id.toString()];
                });

                // Update local archive
                if (playlistsToArchive.length > 0) {
                    localArchive = localArchive.concat(playlistsToArchive);
                }
                localStorage.setItem('archivedPlaylists', JSON.stringify(localArchive));

                // Update main page display
                var previousCount = allPlaylists.length;
                allPlaylists = currentPlaylists.sort(function(a, b) {
                    return new Date(a.date) - new Date(b.date);
                });
                
                // Cache the latest active playlists for faster initial load
                localStorage.setItem('cachedPlaylists_' + currentUser, JSON.stringify(allPlaylists));
                
                // Only update UI if we're on the main page
                if (window.location.pathname.indexOf('index.html') !== -1 || window.location.pathname === '/') {
                    var dom = window.getDOMElements();
                    if (dom.playlistSection) {
                        window.renderPlaylists(dom.playlistSection, allPlaylists);
                    }
                    // Dispatch a custom event to notify other modules (like main.js) that data has been synced
                    window.dispatchEvent(new CustomEvent('datasync'));
                }

                // Trigger archive page update if it's open
                if (window.location.pathname.indexOf('user.html') !== -1) {
                    if (window.CustomEvent) {
                        window.dispatchEvent(new CustomEvent('archiveUpdate'));
                    } else {
                        // IE11 fallback
                        var event = document.createEvent('CustomEvent');
                        event.initCustomEvent('archiveUpdate', false, false, null);
                        window.dispatchEvent(event);
                    }
                }

                // Log sync activity for debugging
                console.log('Sync completed - Current playlists:', allPlaylists.length, 'Archived:', localArchive.length);
            })
            .catch(function(error) {
                console.error('Error syncing data:', error);
                // Don't show error to user for background sync
            })
            .finally(function() {
                // Ensure loading indicator is hidden after sync
                window.showLoading(false);
            });
    }

    /**
     * Starts the real-time sync interval
     */
    function startRealTimeSync() {
        // Clear any existing interval
        if (syncInterval) {
            clearInterval(syncInterval);
        }
        
        // Initial sync
        syncDataFromSheet();
        
        // Sync every N seconds for better responsiveness
        syncInterval = setInterval(syncDataFromSheet, syncFrequency);
    }

    /**
     * Stops the real-time sync interval
     */
    function stopRealTimeSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
        }
    }

    /**
     * Fetches playlists, separates current from archived, displays current ones,
     * and archives the old ones (user-specific).
     */
    function initializePage() {
        var currentUser = localStorage.getItem('currentUser');
        if (!currentUser) return;

        // 1. Load from local cache and display immediately for a fast UI response
        try {
            var cachedPlaylists = JSON.parse(localStorage.getItem('cachedPlaylists_' + currentUser)) || [];
            if (cachedPlaylists.length > 0) {
                allPlaylists = cachedPlaylists;
                var dom = window.getDOMElements();
                window.renderPlaylists(dom.playlistSection, allPlaylists);
                window.dispatchEvent(new CustomEvent('datasync'));
            } else {
                // Only show loading indicator if there's no cached data to display
                window.showLoading(true);
            }
        } catch (e) {
            console.error("Error loading cached playlists:", e);
            window.showLoading(true); // Show loading if cache fails
        }
        
        // 2. Start the sync process to fetch fresh data from the sheet in the background.
        // The sync function will handle rendering and hiding the loading indicator.
        syncDataFromSheet();
    }

    /**
     * Stores playlists in local storage and sends a request to delete them from the sheet.
     * @param {Array} playlistsToArchive - An array of playlist objects to archive.
     */
    function archivePlaylists(playlistsToArchive) {
        try {
            // Get current local archive
            var localArchive = JSON.parse(localStorage.getItem('archivedPlaylists')) || [];
            
            // Remove any existing entries with the same IDs to prevent duplicates
            var idsToArchive = [];
            for (var i = 0; i < playlistsToArchive.length; i++) {
                idsToArchive.push(playlistsToArchive[i].id.toString());
            }
            
            localArchive = localArchive.filter(function(p) {
                return idsToArchive.indexOf(p.id.toString()) === -1;
            });
            
            // Add new playlists to local archive
            var updatedArchive = localArchive.concat(playlistsToArchive);
            localStorage.setItem('archivedPlaylists', JSON.stringify(updatedArchive));
            
            // Send request to delete from sheet
            var idsToDelete = [];
            for (var i = 0; i < playlistsToArchive.length; i++) {
                idsToDelete.push(playlistsToArchive[i].id);
            }
            
            return window.postDataToSheet({ action: 'archive', ids: idsToDelete });
        } catch (error) {
            console.error('Error archiving playlists in Google Sheet:', error);
            window.showAlert('حدث خطأ أثناء أرشفة بعض القوائم. سيتم إعادة المحاولة في التحميل القادم.');
        }
    }

    function getAllPlaylists() {
        return allPlaylists;
    }

    function getAllSheetData() {
        return allSheetData;
    }

    // Make functions globally accessible
    window.syncDataFromSheet = syncDataFromSheet;
    window.startRealTimeSync = startRealTimeSync;
    window.stopRealTimeSync = stopRealTimeSync;
    window.initializePage = initializePage;
    window.archivePlaylists = archivePlaylists;
    window.getAllPlaylists = getAllPlaylists;
    window.getAllSheetData = getAllSheetData;
})();