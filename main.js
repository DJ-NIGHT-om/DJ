// Main application logic
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
        /* @tweakable Whether to disable the right-click context menu. */
        const disableContextMenu = true;
        if (disableContextMenu) {
            document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
            });
        }

        /* @tweakable The maximum year allowed for the event date. */
        const maxEventYear = 9999;
        
        /* @tweakable The required number of digits for the phone number. */
        const phoneNumberLength = 8;
        
        /* @tweakable The maximum width of the new/edit form. */
        const formMaxWidth = '500px';
        document.documentElement.style.setProperty('--form-max-width', formMaxWidth);

        /* @tweakable The maximum width of the alert/confirmation modal window. */
        const modalMaxWidth = "320px";
        /* @tweakable The font size for the alert/confirmation modal title. */
        const modalTitleFontSize = "1.4rem";
        /* @tweakable The font size for the alert/confirmation modal message text. */
        const modalMessageFontSize = "1.1rem";
        /* @tweakable The font weight for the alert/confirmation modal message text. */
        const modalMessageFontWeight = "bold";

        /* @tweakable The duration in minutes for which the first playlist message is shown after creation. */
        const firstPlaylistMessageDurationMinutes = 60;

        document.documentElement.style.setProperty('--modal-max-width', modalMaxWidth);
        document.documentElement.style.setProperty('--modal-title-font-size', modalTitleFontSize);
        document.documentElement.style.setProperty('--modal-message-font-size', modalMessageFontSize);
        document.documentElement.style.setProperty('--modal-message-font-weight', modalMessageFontWeight);

        /* @tweakable The gap between the location and date in the card header. */
        const cardHeaderGap = '1.5rem';
        document.documentElement.style.setProperty('--card-header-gap', cardHeaderGap);

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
            /* @tweakable Font size for the logout button text */
            const logoutFontSize = '1.1rem';
            /* @tweakable Font weight for the logout button text */
            const logoutFontWeight = 'bold';

            logoutBtn.style.fontSize = logoutFontSize;
            logoutBtn.style.fontWeight = logoutFontWeight;
            
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

        // Initialize Flatpickr
        if (dom.eventDateInput) {
             /* @tweakable The theme for the date picker calendar. See https://flatpickr.js.org/themes/ for options. */
            const datePickerTheme = 'material_blue';
            // Dynamically load theme
            const themeLink = document.createElement('link');
            themeLink.rel = 'stylesheet';
            themeLink.href = `https://npmcdn.com/flatpickr/dist/themes/${datePickerTheme}.css`;
            document.head.appendChild(themeLink);

            const fp = flatpickr(dom.eventDateInput, {
                dateFormat: "d/m/Y",
                /* @tweakable The locale for the date picker (e.g., 'ar' for Arabic). */
                locale: "ar",
                minDate: "today",
                onChange: function(selectedDates, dateStr, instance) {
                    if (selectedDates.length > 0) {
                        checkDateAvailability();
                        window.updateDayNameDisplay(selectedDates[0]);
                    } else {
                        // Handle date clearing
                        window.updateDayNameDisplay(null);
                        window.updateDateAvailabilityMessage(null);
                    }
                },
                onClose: function(selectedDates, dateStr, instance) {
                    // Re-validate when closed, in case a date was typed manually
                    if (selectedDates.length > 0) {
                        checkDateAvailability();
                    }
                }
            });
            // Store instance on the element for access from other modules
            dom.eventDateInput._flatpickr = fp;
        }

        /**
         * Checks if the selected date is in the past or already booked.
         */
        function checkDateAvailability() {
            var selectedDateValue = dom.eventDateInput.value;
            if (!selectedDateValue) {
                window.updateDateAvailabilityMessage(null);
                return;
            }

            var selectedDates = dom.eventDateInput._flatpickr.selectedDates;
            if (selectedDates.length === 0) {
                window.updateDateAvailabilityMessage(null);
                return;
            }
            var selectedDate = selectedDates[0];

            var today = new Date();
            today.setHours(0, 0, 0, 0); // Set to start of today for comparison

            if (selectedDate < today) {
                window.updateDateAvailabilityMessage('past');
                return;
            }
            
            var allSheetData = window.getAllSheetData() || [];
            var editingId = dom.playlistIdInput.value;
            var isBooked = false;

            // Use UTC methods to compare dates without timezone issues
            var selectedDateString = `${selectedDate.getUTCFullYear()}-${selectedDate.getUTCMonth()}-${selectedDate.getUTCDate()}`;

            for (var i = 0; i < allSheetData.length; i++) {
                var playlist = allSheetData[i];
                if (!playlist.date) continue;
                
                // Don't compare against itself when editing
                if (editingId && playlist.id.toString() === editingId.toString()) {
                    continue;
                }
                
                var playlistDate = new Date(playlist.date);
                var playlistDateString = `${playlistDate.getUTCFullYear()}-${playlistDate.getUTCMonth()}-${playlistDate.getUTCDate()}`;
                
                if (playlistDateString === selectedDateString) {
                    isBooked = true;
                    break;
                }
            }
            
            window.updateDateAvailabilityMessage(!isBooked);
        }

        /**
         * Shows or hides the message that appears after the first playlist is created for a specific duration.
         */
        function updateFirstPlaylistMessageVisibility() {
            const firstPlaylistMessage = document.getElementById('first-playlist-message');
            if (firstPlaylistMessage) {
                const creationTime = localStorage.getItem('firstPlaylistCreationTime');
                if (!creationTime) {
                    firstPlaylistMessage.classList.add('hidden');
                    return;
                }

                const currentTime = new Date().getTime();
                const timeElapsed = currentTime - parseInt(creationTime, 10);
                const durationMs = firstPlaylistMessageDurationMinutes * 60 * 1000;

                const shouldBeVisible = timeElapsed < durationMs;
                firstPlaylistMessage.classList.toggle('hidden', !shouldBeVisible);
            }
        }

        if (dom.phoneNumberInput) {
            dom.phoneNumberInput.maxLength = phoneNumberLength;
            dom.phoneNumberInput.pattern = `[0-9]{${phoneNumberLength}}`;
            dom.phoneNumberInput.title = `الرجاء إدخال ${phoneNumberLength} أرقام فقط`;
            dom.phoneNumberInput.addEventListener('input', function(e) {
                // Remove any non-digit characters
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
            });
        }

        // --- Event Listeners ---
        if (dom.showFormBtn) {
            dom.showFormBtn.addEventListener('click', function() {
                window.showForm(true);
            });
        }
        if (dom.cancelBtn) {
            dom.cancelBtn.addEventListener('click', window.resetForm);
        }
        if (dom.addSongBtn) {
            dom.addSongBtn.addEventListener('click', function() {
                window.requestAddSongField();
            });
        }
        if (dom.playlistForm) {
            dom.playlistForm.addEventListener('submit', window.handleFormSubmit);
        }
        if (dom.playlistSection) {
            dom.playlistSection.addEventListener('click', window.handlePlaylistAction);
        }

        // Add a listener to update the message visibility whenever data is synced
        window.addEventListener('datasync', updateFirstPlaylistMessageVisibility);

        // --- Initial Load ---
        window.initializePage();
        window.resetForm(); // Reset form initially to set it up correctly (e.g., add first song field)
        window.showForm(false); // Then hide it
        
        // Start real-time synchronization
        window.startRealTimeSync();
        
        // Enhanced visibility change handling
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                window.stopRealTimeSync();
            } else {
                // Force sync when page becomes visible again
                window.startRealTimeSync();
            }
        });
        
        // Enhanced beforeunload handling
        window.addEventListener('beforeunload', function() {
            window.stopRealTimeSync();
        });
        
        // Force sync on window focus
        window.addEventListener('focus', function() {
            window.syncDataFromSheet();
        });
    });
})();