// --- Functions for rendering UI components ---
(function() {
    'use strict';

    /**
     * Creates an HTML element for a single playlist card.
     * @param {object} playlist - The playlist data object.
     * @param {boolean} isArchived - True if the card is for the archive page.
     * @returns {HTMLElement} The card element.
     */
    function createPlaylistCard(playlist, isArchived) {
        var songs = [];
        try {
            if (typeof playlist.songs === 'string' && playlist.songs.trim().startsWith('[')) {
                var parsedSongs = JSON.parse(playlist.songs);
                if (Array.isArray(parsedSongs)) songs = parsedSongs;
            }
        } catch (e) { console.error('Error parsing songs for display:', e); }

        var songsHtml = songs.length > 0 ?
            '<ol>' + songs.map(function(song) { return '<li>' + song + '</li>'; }).join('') + '</ol>' :
            '<p>لا يوجد أغاني إضافية.</p>';

        var eventDate = new Date(playlist.date);
        var dateString = !isNaN(eventDate.getTime()) ?
            eventDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) :
            'تاريخ غير محدد';
        
        var dayName = !isNaN(eventDate.getTime()) ? window.getArabicDayName(eventDate) : '';

        var actionsHtml = isArchived ?
            '<button class="action-btn delete-btn single-delete-btn"><i class="fas fa-trash-alt"></i> حذف من الأرشيف</button>' :
            '<button class="action-btn edit-btn"><i class="fas fa-edit"></i> تعديل</button>' +
            '<button class="action-btn delete-btn"><i class="fas fa-trash-alt"></i> حذف</button>';

        /* @tweakable Placeholder text for notes when empty */
        const emptyNotesText = "لا توجد ملاحظات.";
        var notesHtml = playlist.notes ?
            '<p>' + playlist.notes + '</p>' :
            '<p><em>' + emptyNotesText + '</em></p>';

        var card = document.createElement('div');
        card.className = 'playlist-card card';
        card.setAttribute('data-id', playlist.id);
        card.innerHTML =
            '<div class="playlist-card-header">' +
                '<h3><i class="fas fa-map-marker-alt icon"></i> ' + (playlist.location || 'مكان غير محدد') + '</h3>' +
                '<span><i class="fas fa-calendar-alt icon"></i> ' + dateString +
                (dayName ? ' <span class="day-name">' + dayName + '</span>' : '') + '</span>' +
            '</div>' +
            '<div class="playlist-card-info">' +
                '<p><i class="fas fa-phone icon"></i> <strong>رقم الهاتف:</strong> ' + (playlist.phoneNumber || 'غير محدد') + '</p>' +
                '<p><i class="fas fa-female icon"></i> <strong>زفة العروس:</strong> ' + (playlist.brideZaffa || 'غير محدد') + '</p>' +
                '<p><i class="fas fa-male icon"></i> <strong>زفة المعرس:</strong> ' + (playlist.groomZaffa || 'غير محدد') + '</p>' +
            '</div>' +
            '<div class="playlist-songs">' +
                '<h4><i class="fas fa-music icon"></i>' + (isArchived ? 'قائمة الأغاني:' : 'الأغاني المطلوبة :') + '</h4>' +
                songsHtml +
            '</div>' +
            '<div class="playlist-notes">' +
                '<h4><i class="fas fa-sticky-note icon"></i> ملاحظات:</h4>' +
                notesHtml +
            '</div>' +
            '<div class="playlist-actions">' + actionsHtml + '</div>';
        
        return card;
    }

    /**
     * Renders the list of playlist cards on the main page.
     * @param {HTMLElement} container - The element to render the cards into.
     * @param {Array} playlists - An array of playlist objects.
     */
    function renderPlaylists(container, playlists) {
        if (!container) return;
        
        container.innerHTML = '';
        if (!playlists || playlists.length === 0) {
            container.innerHTML = '<p class="card">لا توجد قوائم حالياً. انقر على زر الإنشاء لإضافة واحدة!</p>';
            return;
        }
        
        playlists.forEach(function(playlist) {
            var card = createPlaylistCard(playlist, false);
            container.appendChild(card);
        });
    }

    /**
     * Toggles highlighting of songs in a playlist card.
     * @param {HTMLElement} card - The playlist card element to highlight.
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
    window.createPlaylistCard = createPlaylistCard;
    window.renderPlaylists = renderPlaylists;
    window.toggleSongHighlight = toggleSongHighlight;

})();