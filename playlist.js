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
        
        // Validate date - must be today or future based on app timezone
        var selectedDate = new Date(dom.eventDateInput.value);
        // This creates a date at midnight UTC, which is what we want for comparison
        var selectedDateUTC = new Date(selectedDate.getUTCFullYear(), selectedDate.getUTCMonth(), selectedDate.getUTCDate());
        var appToday = window.getAppToday();
        
        if (selectedDateUTC < appToday) {
            window.showAlert('لا يمكن اختيار تاريخ في الماضي. يرجى اختيار تاريخ اليوم أو تاريخ مستقبلي.');
            return;
        }

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

        var playlistData = {
            date: dom.eventDateInput.value,
            location: dom.eventLocationInput.value,
            phoneNumber: dom.phoneNumberInput.value,
            brideZaffa: dom.brideZaffaInput.value,
            groomZaffa: dom.groomZaffaInput.value,
            songs: songs,
            notes: dom.notesInput.value,
            username: currentUser,
            password: currentUserPassword
        };
        
        var playlists = window.getAllPlaylists();
        var oldPlaylists = JSON.parse(JSON.stringify(playlists)); // Deep copy for revert
        var newOrUpdatedPlaylist;

        // --- Optimistic Update ---
        if (isEdit) {
            playlistData.id = playlistId;
            let found = false;
            newOrUpdatedPlaylist = { ...playlistData };
            playlists = playlists.map(p => {
                if (p.id.toString() === playlistId.toString()) {
                    found = true;
                    return newOrUpdatedPlaylist;
                }
                return p;
            });
            if (!found) playlists.push(newOrUpdatedPlaylist);
        } else {
            playlistId = new Date().getTime().toString();
            playlistData.id = playlistId;
            newOrUpdatedPlaylist = { ...playlistData };
            playlists.push(newOrUpdatedPlaylist);
        }
        
        // Immediately update the UI
        window.updateLocalPlaylists(playlists);
        window.resetForm();

        // Show confetti for the first playlist
        if (isFirstPlaylist && window.getAllPlaylists().length > 0) {
           localStorage.setItem('firstPlaylistCreationTime', new Date().getTime());
           if (window.triggerWelcomeConfetti) {
              window.triggerWelcomeConfetti();
           }
           // Manually dispatch event since sync isn't called immediately
           window.dispatchEvent(new CustomEvent('datasync'));
        }
        
        // --- End Optimistic Update ---

        var apiPayload = {
            ...playlistData,
            action: isEdit ? 'edit' : 'add',
            songs: playlistData.songs, // Ensure songs are sent as an array
        };

        window.postDataToSheet(apiPayload)
            .then(function(result) {
                if (result.status === 'success') {
                    // Success! The optimistic update is now confirmed by the server.
                    // The background sync will eventually align everything perfectly.
                    console.log('Save successful.');
                } else {
                    throw new Error(result.message || 'Failed to save data.');
                }
            })
            .catch(function(error) {
                console.error('Error saving playlist, reverting UI:', error);
                window.showAlert('حدث خطأ أثناء حفظ القائمة. سيتم التراجع عن التغييرات.');
                // Revert UI to the state before the optimistic update
                window.updateLocalPlaylists(oldPlaylists);
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
            /* @tweakable The duration in milliseconds for the delete animation. Should match the CSS animation time. */
            const deleteAnimationDuration = 300;
            
            window.showConfirm('هل أنت متأكد من حذف هذه القائمة؟')
                .then(function(confirmed) {
                    if (confirmed) {
                        // --- Animate then Optimistically Update ---
                        var playlists = window.getAllPlaylists();
                        var oldPlaylists = JSON.parse(JSON.stringify(playlists)); // Deep copy for revert
                        
                        // 1. Add animation class
                        card.classList.add('deleting');
                        
                        // 2. After animation, update data and UI
                        setTimeout(() => {
                            var updatedPlaylists = playlists.filter(p => p.id.toString() !== playlistId.toString());
                            window.updateLocalPlaylists(updatedPlaylists);

                            // 3. Send delete request to server in the background
                            window.postDataToSheet({ action: 'delete', id: playlistId })
                                .then(function(result) {
                                    if (result && result.status === 'success') {
                                        console.log('Delete successful.');
                                    } else {
                                        throw new Error(result.message || 'Failed to delete playlist on server.');
                                    }
                                })
                                .catch(function(error) {
                                    console.error('Error deleting playlist, reverting UI:', error);
                                    window.showAlert('حدث خطأ أثناء حذف القائمة. سيتم استعادة القائمة.');
                                    // Revert UI to previous state
                                    window.updateLocalPlaylists(oldPlaylists);
                                });
                        }, deleteAnimationDuration);
                    }
                });
        } else if (isEditButton) {
            // Use all sheet data to find the playlist, ensuring we can edit items
            // that might be incorrectly filtered out from the main view.
            var allSheetData = window.getAllSheetData();
            var playlist = null;
            for (var i = 0; i < allSheetData.length; i++) {
                // Using '==' for loose type comparison between string attribute and potential number ID
                if (allSheetData[i].id == playlistId) {
                    playlist = allSheetData[i];
                    break;
                }
            }
            if (playlist) {
                window.populateEditForm(playlist);
            } else {
                console.error('Playlist with ID ' + playlistId + ' not found for editing.');
                window.showAlert('لم يتم العثور على القائمة للتعديل. قد تحتاج إلى تحديث الصفحة.');
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