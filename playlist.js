// Playlist-specific operations
(function() {
    'use strict';
    
    /**
     * Handles the form submission for adding or editing a playlist.
     * @param {Event} e - The form submit event.
     */
    function handleFormSubmit(e) {
        e.preventDefault();
        var currentUser = localStorage.getItem('currentUser');
        var currentUserPassword = localStorage.getItem('currentUserPassword');
        if (!currentUser || !currentUserPassword) return;

        var dom = window.getDOMElements();
        
        // Validate date is selected
        if (!dom.eventDateInput.value) {
            window.showAlert('يرجى اختيار تاريخ المناسبة.');
            return;
        }

        // Validate date - must be today or future
        var selectedDates = dom.eventDateInput._flatpickr.selectedDates;
        if (selectedDates.length === 0) {
             window.showAlert('يرجى اختيار تاريخ صالح.');
             return;
        }
        var selectedDate = selectedDates[0];
        
        var today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of day for comparison
        
        if (selectedDate < today) {
            window.showAlert('لا يمكن اختيار تاريخ في الماضي. يرجى اختيار تاريخ اليوم أو تاريخ مستقبلي.');
            return;
        }

        window.showLoading(true);

        var songInputs = dom.songsContainer.querySelectorAll('.song-input');
        var songs = [];
        for (var i = 0; i < songInputs.length; i++) {
            var songValue = songInputs[i].value.trim();
            if (songValue) {
                songs.push(songValue);
            }
        }
        
        var playlistId = dom.playlistIdInput.value;
        var isEdit = playlistId && playlistId.trim() !== '';

        // Check if this is the first playlist being added by this user
        const isFirstPlaylist = !isEdit && window.getAllPlaylists().length === 0;

        // Get the date from Flatpickr, convert it to YYYY-MM-DD for storage
        var dateToStore = new Date(selectedDates[0]);
        // Adjust for timezone offset to store the selected calendar day correctly
        dateToStore.setMinutes(dateToStore.getMinutes() - dateToStore.getTimezoneOffset());
        var dateStringForSheet = dateToStore.toISOString().split('T')[0];

        var playlistData = {
            action: isEdit ? 'edit' : 'add',
            date: dateStringForSheet,
            location: dom.eventLocationInput.value,
            phoneNumber: dom.phoneNumberInput.value,
            brideZaffa: dom.brideZaffaInput.value,
            groomZaffa: dom.groomZaffaInput.value,
            songs: songs,
            notes: dom.notesInput.value.trim(),
            username: currentUser,
            password: currentUserPassword
        };

        // Only include id for edit operations
        if (isEdit) {
            playlistData.id = playlistId;
        }

        window.postDataToSheet(playlistData)
            .then(function(result) {
                if (result.status === 'success') {
                    window.resetForm();
                    // Force immediate sync after save
                    return window.syncDataFromSheet().then(function() {
                        // After sync, check if it was the first playlist.
                        if (isFirstPlaylist && window.getAllPlaylists().length > 0) {
                           localStorage.setItem('firstPlaylistCreationTime', new Date().getTime());
                           if (window.triggerWelcomeConfetti) {
                              window.triggerWelcomeConfetti();
                           }
                        }
                    });
                } else {
                    throw new Error(result.message || 'Failed to save data.');
                }
            })
            .catch(function(error) {
                console.error('Error saving playlist:', error);
                window.showAlert('حدث خطأ أثناء حفظ القائمة.');
            })
            .finally(function() {
                window.showLoading(false);
            });
    }
    
    /**
     * Handles clicks on the edit and delete buttons within a playlist card.
     * @param {Event} e - The click event.
     */
    function handlePlaylistAction(e) {
        var card = e.target.closest('.playlist-card');
        if (!card) return;

        var playlistId = card.getAttribute('data-id');
        var isDeleteButton = e.target.closest('.delete-btn');
        var isEditButton = e.target.closest('.edit-btn');

        if (isDeleteButton) {
            window.showConfirm('هل أنت متأكد من حذف هذه القائمة؟')
                .then(function(confirmed) {
                    if (confirmed) {
                        window.showLoading(true);
                        return window.postDataToSheet({ action: 'delete', id: playlistId });
                    }
                })
                .then(function(result) {
                    if (result) {
                        // Force immediate sync after delete
                        return window.syncDataFromSheet();
                    }
                })
                .catch(function(error) {
                    console.error('Error deleting playlist:', error);
                    window.showAlert('حدث خطأ أثناء حذف القائمة.');
                })
                .finally(function() {
                    window.showLoading(false);
                });
        } else if (isEditButton) {
            var allPlaylists = window.getAllPlaylists();
            var playlist = null;
            for (var i = 0; i < allPlaylists.length; i++) {
                if (allPlaylists[i].id == playlistId) {
                    playlist = allPlaylists[i];
                    break;
                }
            }
            if (playlist) {
                window.populateEditForm(playlist);
            }
        } else if (!isDeleteButton && !isEditButton) {
            // Clicked on the card itself (not on action buttons)
            window.toggleSongHighlight(card);
        }
    }

    /**
     * Toggles highlighting of songs in a playlist card
     * @param {HTMLElement} card - The playlist card element
     */
    function toggleSongHighlight(card) {
        // Remove highlighting from all other cards first
        var allCards = document.querySelectorAll('.playlist-card');
        for (var i = 0; i < allCards.length; i++) {
            if (allCards[i] !== card) {
                allCards[i].classList.remove('selected');
                var songItems = allCards[i].querySelectorAll('.playlist-songs li');
                for (var j = 0; j < songItems.length; j++) {
                    songItems[j].classList.remove('song-highlighted');
                }
            }
        }

        // Toggle highlighting for the clicked card
        var isCurrentlySelected = card.classList.contains('selected');
        if (isCurrentlySelected) {
            card.classList.remove('selected');
            var songItems = card.querySelectorAll('.playlist-songs li');
            for (var k = 0; k < songItems.length; k++) {
                songItems[k].classList.remove('song-highlighted');
            }
        } else {
            card.classList.add('selected');
            var songItems = card.querySelectorAll('.playlist-songs li');
            for (var k = 0; k < songItems.length; k++) {
                songItems[k].classList.add('song-highlighted');
            }
            
            // Force reflow to ensure icon colors are applied immediately
            card.offsetHeight;
        }
    }

    // Make functions globally accessible
    window.handleFormSubmit = handleFormSubmit;
    window.handlePlaylistAction = handlePlaylistAction;
    window.toggleSongHighlight = toggleSongHighlight;
})();