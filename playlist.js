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
        
        // Validate date - must be today or future
        var selectedDate = new Date(dom.eventDateInput.value);
        var today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of day for comparison
        selectedDate.setHours(0, 0, 0, 0);
        
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

        var isAdmin = localStorage.getItem('isAdmin') === 'true';
        var originalUsername = document.getElementById('originalUsername').value;

        var playlistData = {
            action: isEdit ? 'edit' : 'add',
            date: dom.eventDateInput.value,
            location: dom.eventLocationInput.value,
            phoneNumber: dom.phoneNumberInput.value,
            brideZaffa: dom.brideZaffaInput.value,
            groomZaffa: dom.groomZaffaInput.value,
            songs: songs,
            notes: dom.notesInput.value,
            // If admin is editing, use original user's name. Otherwise use current user's name.
            username: (isAdmin && isEdit && originalUsername) ? originalUsername : currentUser,
            password: currentUserPassword
        };

        // Only include id for edit operations
        if (isEdit) {
            playlistData.id = playlistId;
        }

        // --- Optimistic UI Update ---
        // We will update the local state immediately with the data we are about to send.
        // The server response will confirm this change.
        if (isEdit) {
            // Optimistically update the existing playlist in the local array
            window.updateLocalPlaylist(playlistData);
        }

        // After preparing data, immediately reset and hide the form for a faster feel.
        const isFirstPlaylist = !isEdit && window.getAllPlaylists().length === 0;
        window.resetForm();

        window.postDataToSheet(playlistData)
            .then(function(result) {
                if (result.status === 'success' && result.data) {
                    // Update local state with the confirmed data from the server (especially for new items to get the ID)
                    window.updateLocalPlaylist(result.data);
                    
                    // After a successful save, check if it was the first playlist.
                    if (isFirstPlaylist) {
                       localStorage.setItem('firstPlaylistCreationTime', new Date().getTime());
                       if (window.triggerWelcomeConfetti) {
                          window.triggerWelcomeConfetti();
                       }
                    }
                } else {
                    // If the server fails, revert the optimistic update
                    window.showAlert(result.message || 'Failed to save data. Reverting changes.');
                    window.syncDataFromSheet(); // Force a full sync to get the correct state
                }
            })
            .catch(function(error) {
                console.error('Error saving playlist:', error);
                window.showAlert('حدث خطأ أثناء حفظ القائمة. سيتم إعادة تحميل البيانات.');
                window.syncDataFromSheet(); // Force a full sync on error
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
                        // --- Optimistic UI Update ---
                        // Immediately remove the card from the view.
                        const cardToRemove = document.querySelector(`.playlist-card[data-id="${playlistId}"]`);
                        if (cardToRemove) {
                            cardToRemove.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                            cardToRemove.style.opacity = '0';
                            cardToRemove.style.transform = 'scale(0.9)';
                            setTimeout(() => cardToRemove.remove(), 500);
                        }

                        // Send the delete request to the server in the background.
                        return window.postDataToSheet({ action: 'delete', id: playlistId });
                    }
                })
                .then(function(result) {
                    if (result && result.status !== 'success') {
                        // If deletion failed on the server, alert the user and refresh the data.
                        window.showAlert('فشل حذف القائمة من الخادم. سيتم إعادة تحميل البيانات.');
                        window.syncDataFromSheet();
                    } else if (result && result.status === 'success') {
                         // Successfully deleted from server, now remove from local cache.
                        window.removeLocalPlaylist(playlistId);
                    }
                })
                .catch(function(error) {
                    console.error('Error deleting playlist:', error);
                    window.showAlert('حدث خطأ أثناء حذف القائمة. سيتم إعادة تحميل البيانات.');
                    // On error, force a sync to get the correct state from the server.
                    window.syncDataFromSheet();
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