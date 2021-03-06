/* This Source Code Form is subject to the terms of the MIT license
 * If a copy of the MIT license was not distributed with this file, you can
 * obtain one at https://raw.github.com/mozilla/butter/master/LICENSE */

/**
 * Module: First-Run
 *
 * Determines whether or not a user should be shown a first-run dialog
 */
define( [ "localized", "dialog/dialog" ], function( Localized, Dialog ) {

  var __butterStorage = window.localStorage;

  return {
    init: function() {

      var dialog,
          overlayDiv,
          editor = document.querySelector( ".butter-editor-area" ),
          eventsEditorButton = document.querySelector( ".butter-editor-header-popcorn" ),
          searchInput = document.querySelector( ".add-media-input" );

      function onDialogClose() {
        // Remove Listeners
        dialog.unlisten( "close", onDialogClose );
        window.removeEventListener( "click", closeDialog, false );

        // Remove Classes
        eventsEditorButton.classList.remove( "overlay-highlight" );
        searchInput.classList.remove( "overlay-highlight" );
        document.body.classList.remove( "first-run" );

        // Remove Overlay
        editor.removeChild( overlayDiv );
      }

      function closeDialog() {
        dialog.close();
      }

      function setupFirstRun() {
        // Setup and append the first-run overlay
        overlayDiv = document.createElement( "div" );
        overlayDiv.classList.add( "butter-modal-overlay" );
        overlayDiv.classList.add( "butter-modal-overlay-dark-bg" );
        overlayDiv.classList.add( "fade-in" );
        editor.appendChild( overlayDiv );

        // Add Listener
        window.addEventListener( "click", closeDialog, false );

        // Add Classes
        searchInput.classList.add( "overlay-highlight" );
        document.body.classList.add( "first-run" );
      }

      try {
        var data = __butterStorage.getItem( "butter-first-run" );

        if ( !data || window.location.search.match( "forceFirstRun" ) ) {
          __butterStorage.setItem( "butter-first-run", true );
          setupFirstRun();
          dialog = Dialog.spawn( "first-run" );
          dialog.open( false );
          dialog.listen( "close", onDialogClose );
        }
      } catch( e ) {}
    }
  };
});
