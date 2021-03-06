/* This Source Code Form is subject to the terms of the MIT license
 * If a copy of the MIT license was not distributed with this file, you can
 * obtain one at https://raw.github.com/mozilla/butter/master/LICENSE */

define( [ "localized", "util/lang", "util/uri", "util/xhr", "util/keys", "util/mediatypes", "editor/editor",
 "util/time", "util/dragndrop", "analytics", "l10n!/layouts/media-editor.html", "json!/api/butterconfig" ],
  function( Localized, LangUtils, URI, XHR, KeysUtils, MediaUtils, Editor, Time, DragNDrop, analytics, EDITOR_LAYOUT, CONFIG ) {

  var _parentElement =  LangUtils.domFragment( EDITOR_LAYOUT, ".media-editor" ),
      _addMediaPanel = _parentElement.querySelector( ".add-media-panel" ),

      _searchInput = _addMediaPanel.querySelector( ".add-media-input" ),
      _addBtn = _addMediaPanel.querySelector( ".add-media-btn" ),
      _errorMessage = _parentElement.querySelector( ".media-error-message" ),
      _loadingSpinner = _parentElement.querySelector( ".media-loading-spinner" ),

      _oldValue,
      _galleryPanel = _parentElement.querySelector( ".media-gallery" ),
      _galleryList = _galleryPanel.querySelector( "#project-items" ),
      _GALLERYITEM = LangUtils.domFragment( EDITOR_LAYOUT, ".media-gallery-item.gallery-video" ),
      _pagingContainer = _parentElement.querySelector( ".paging-container" ),

      _clipTabs = {
        project: _parentElement.querySelector( ".media-tab" ),
        YouTube: _parentElement.querySelector( ".youtube-tab" ),
        SoundCloud: _parentElement.querySelector( ".soundcloud-tab" ),
        Flickr: _parentElement.querySelector( ".flickr-tab" ),
        Giphy: _parentElement.querySelector( ".giphy-tab" )
      },
      _itemContainers = {
        project: _galleryList,
        YouTube: _galleryPanel.querySelector( "#YouTube-items" ),
        SoundCloud: _galleryPanel.querySelector( "#SoundCloud-items" ),
        Flickr: _galleryPanel.querySelector( "#Flickr-items" ),
        Giphy: _galleryPanel.querySelector( "#Giphy-items" )
      },
      _currentContainer = _itemContainers.project,
      _currentTab = _clipTabs.project,

      _butter,
      _media,
      _mediaLoadTimeout,
      _cancelSpinner,
      _LIMIT = CONFIG.sync_limit,
      MEDIA_LOAD_TIMEOUT = 10000,
      _this,
      TRANSITION_TIME = 2000,
      _photoTypes = [
        "Giphy",
        "Flickr",
        "Image"
      ];

  function resetInput() {
    _searchInput.value = "";

    clearTimeout( _mediaLoadTimeout );
    clearTimeout( _cancelSpinner );
    _searchInput.classList.remove( "error" );
    _addMediaPanel.classList.remove( "invalid-field" );
    _errorMessage.classList.add( "hidden" );
    _loadingSpinner.classList.add( "hidden" );

    _addBtn.classList.add( "hidden" );
  }

  function onDenied( error, preventFieldHightlight ) {
    clearTimeout( _cancelSpinner );
    clearTimeout( _mediaLoadTimeout );
    _errorMessage.innerHTML = error;
    _loadingSpinner.classList.add( "hidden" );
    if ( !preventFieldHightlight ) {
      _addMediaPanel.classList.add( "invalid-field" );
    }
    setTimeout( function() {
      _errorMessage.classList.remove( "hidden" );
    }, 300 );
  }

  function dragNDrop( element, popcornOptions ) {
    DragNDrop.helper( element, {
      pluginOptions: popcornOptions,
      start: function() {
        for ( var i = 0, l = _butter.targets.length; i < l; ++i ) {
          _butter.targets[ i ].iframeDiv.style.display = "block";
        }
      },
      stop: function() {
        _butter.currentMedia.pause();
        for ( var i = 0, l = _butter.targets.length; i < l; ++i ) {
          _butter.targets[ i ].iframeDiv.style.display = "none";
        }
      }
    });
  }

  function addPhotoEvent( popcornOptions ) {
    _butter.deselectAllTrackEvents();
    _butter.generateSafeTrackEvent({
      type: "image",
      popcornOptions: popcornOptions
    });
  }

  function addPhotos( data, options ) {
    var el = options.element || LangUtils.domFragment( EDITOR_LAYOUT, ".media-gallery-item.gallery-photo" ),
        deleteBtn = el.querySelector( ".mg-delete-btn" ),
        thumbnailBtn = el.querySelector( ".mg-thumbnail" ),
        thumbnailImg = document.createElement( "img" ),
        thumbnailSrc = data.thumbnail,
        iconSource = "/resources/icons/",
        source = data.source;

    thumbnailBtn.addEventListener( "mouseover", function() {
      thumbnailImg.src = source;
    });

    thumbnailBtn.addEventListener( "mouseout", function() {
      thumbnailImg.src = thumbnailSrc;
    });

    dragNDrop( thumbnailBtn, { src: source } );

    thumbnailBtn.setAttribute( "data-popcorn-plugin-type", "image" );
    thumbnailBtn.setAttribute( "data-butter-draggable-type", "plugin" );

    el.querySelector( ".mg-title" ).innerHTML = data.title;

    if ( data.type === "Flickr" ) {
      iconSource += "flickr-black.png";
    } else if ( data.type === "Giphy" ) {
      iconSource += "giphy.png";
    } else {
      data.type = "Image";
      el.querySelector( ".mg-type > img" ).classList.add( "butter-hidden" );
      el.querySelector( ".mg-type-text" ).classList.remove( "photo" );
    }

    el.querySelector( ".mg-type > img" ).src = iconSource;
    el.querySelector( ".mg-type-text" ).innerHTML = data.type;
    thumbnailBtn.appendChild( thumbnailImg );
    thumbnailImg.src = thumbnailSrc;

    if ( options.remove ) {
      deleteBtn.addEventListener( "click", function() {

        thumbnailBtn.removeEventListener( "click", addEvent, false );
        options.container.removeChild( el );
        _this.scrollbar.update();
        delete _media.clipData[ source ];
        _butter.dispatch( "mediaclipremoved" );
      }, false );
    } else {
      el.removeChild( deleteBtn );
    }

    options.callback = options.callback || addPhotoEvent;

    function addEvent() {
      analytics.event( "Track Event Added", {
        label: "clicked"
      });
      var popcornOptions = {
            src: source,
            start: _butter.currentTime,
            title: data.title
          };

      options.callback( popcornOptions, data );
    }

    thumbnailBtn.addEventListener( "click", addEvent, false );

    options.container.insertBefore( el, options.container.firstChild );

    if ( _this.scrollbar ) {
      _this.scrollbar.update();
    }
    resetInput();
  }

  function addMediaEvent( popcornOptions ) {
    _butter.deselectAllTrackEvents();
    _butter.generateSafeTrackEvent({
      type: "sequencer",
      popcornOptions: popcornOptions
    });
  }

  function addMedia( data, options ) {
    var el = options.element || _GALLERYITEM.cloneNode( true ),
        container = options.container,
        deleteBtn = el.querySelector( ".mg-delete-btn" ),
        thumbnailBtn = el.querySelector( ".mg-thumbnail" ),
        thumbnailImg,
        thumbnailSrc = data.thumbnail,
        source = data.source;

    data.duration = ( +data.duration );

    dragNDrop( thumbnailBtn, {
      source: source,
      fallback: data.fallback,
      denied: data.denied,
      end: data.duration,
      from: data.from || 0,
      title: data.title,
      type: data.type,
      thumbnailSrc: thumbnailSrc,
      duration: data.duration,
      linkback: data.linkback,
      contentType: data.contentType,
      hidden: data.hidden
    });

    thumbnailBtn.setAttribute( "data-popcorn-plugin-type", "sequencer" );
    thumbnailBtn.setAttribute( "data-butter-draggable-type", "plugin" );

    if ( options.remove ) {
      deleteBtn.addEventListener( "click", function() {

        thumbnailBtn.removeEventListener( "click", addEvent, false );
        container.removeChild( el );
        _this.scrollbar.update();
        delete _media.clipData[ source ];
        _butter.dispatch( "mediaclipremoved" );
      }, false );
    } else {
      el.removeChild( deleteBtn );
    }

    _loadingSpinner.classList.add( "hidden" );

    el.querySelector( ".mg-title" ).innerHTML = data.title;
    el.querySelector( ".mg-type" ).classList.add( data.type.toLowerCase() + "-icon" );
    el.querySelector( ".mg-type-text" ).innerHTML = data.type;
    el.querySelector( ".mg-duration" ).innerHTML = Time.toTimecode( data.duration, 0 );
    if ( data.type === "HTML5" ) {
      if ( typeof data.thumbnail === "object" ) {
        thumbnailSrc = URI.makeUnique( data.source ).toString();
      }
      thumbnailImg = document.createElement( "video" );
    } else {
      thumbnailImg = document.createElement( "img" );
    }
    thumbnailBtn.appendChild( thumbnailImg );
    if ( thumbnailSrc ) {
      thumbnailImg.classList.add( "media-thumbnail" );
      thumbnailImg.src = thumbnailSrc;
    }

    el.classList.add( "mg-" + data.type.toLowerCase() );

    function addEvent() {
      analytics.event( "Track Event Added", {
        label: "clicked"
      });
      var start = _butter.currentTime,
          end = start + data.duration,
          popcornOptions = {
            source: data.source,
            fallback: data.fallback,
            denied: data.denied,
            start: start,
            end: end,
            type: data.type,
            thumbnailSrc: thumbnailSrc,
            from: data.from || 0,
            title: data.title,
            duration: data.duration,
            linkback: data.linkback,
            contentType: data.contentType,
            hidden: data.hidden || false
          };

      options.callback = options.callback || addMediaEvent;
      options.callback( popcornOptions, data );
    }

    thumbnailBtn.addEventListener( "click", addEvent, false );

    options.container.insertBefore( el, options.container.firstChild );

    if ( _this.scrollbar ) {
      _this.scrollbar.update();
    }
    resetInput();
  }

  function onSuccess( data ) {
    var el = _GALLERYITEM.cloneNode( true ),
        source = data.source;

    if ( !_media.clipData[ source ] ) {
      _media.clipData[ source ] = data;
      _butter.dispatch( "mediaclipadded" );

      el.classList.add( "new" );

      setTimeout(function() {
        el.classList.remove( "new" );
      }, TRANSITION_TIME );
      if ( data.type === "image" ) {
        el = LangUtils.domFragment( EDITOR_LAYOUT, ".media-gallery-item.gallery-photo" );
        el.classList.remove( "gallery-item-grid" );
        addPhotos( data, {
          container: _galleryList,
          element: el,
          remove: true
        });
      } else {
        addMedia( data, {
          element: el,
          container: _galleryList,
          remove: true
        });
      }
    } else {
      onDenied( Localized.get( "Your gallery already has that media added to it" ) );
    }
  }

  function addMediaToGallery( url ) {
    var data = {};

    // Don't trigger with empty inputs
    if ( !url ) {
      return;
    }

    var checkUrl = URI.parse( url );

    if ( !checkUrl.protocol ) {
      url = window.location.protocol + "//" + url;
    }
    data.source = url;
    data.type = "sequencer";
    _mediaLoadTimeout = setTimeout( function() {
      _errorMessage.innerHTML = Localized.get( "Your media source is taking too long to load" );
      _errorMessage.classList.remove( "hidden" );
      _addMediaPanel.classList.add( "invalid-field" );
    }, MEDIA_LOAD_TIMEOUT );
    MediaUtils.getMetaData( data.source, onSuccess, function() {
      clearTimeout( _cancelSpinner );
      clearTimeout( _mediaLoadTimeout );
      _loadingSpinner.classList.add( "hidden" );
      pagingSearchCallback( _itemContainers.project, 1 );
    });
  }

  function onFocus() {
    _oldValue = _searchInput.value;
  }

  function onInput() {
    if ( _searchInput.value ) {
      _addBtn.classList.remove( "hidden" );
    } else {
      _addBtn.classList.add( "hidden" );
    }
    clearTimeout( _cancelSpinner );
    clearTimeout( _mediaLoadTimeout );
    _addMediaPanel.classList.remove( "invalid-field" );
    _loadingSpinner.classList.add( "hidden" );
    _errorMessage.classList.add( "hidden" );
  }

  function onEnter( e ) {
    if ( e.keyCode === KeysUtils.ENTER ) {
      e.preventDefault();
      onAddMediaClick();
    }
  }

  function formatSource( value ) {
    if ( !value ) {
      return "";
    }

    var split = value.split( "?" ),
        querystring = split[ 1 ];

    value = split[ 0 ].trim();

    return querystring ? value + "?" + querystring : value;
  }

  function onAddMediaClick() {
    // transitionend event is not reliable and not cross browser supported.
    _cancelSpinner = setTimeout( function() {
      _loadingSpinner.classList.remove( "hidden" );
    }, 300 );
    _addBtn.classList.add( "hidden" );
    _searchInput.value = formatSource( _searchInput.value );
    addMediaToGallery( _searchInput.value, onDenied );
  }

  function addPhotoCallback( popcornOptions, data ) {
    var source = data.source,
        element;

    // We want to add images from searching/accounts to that project's gallery
    if ( !_media.clipData[ source ] ) {
      _media.clipData[ source ] = data;
      _butter.dispatch( "mediaclipadded" );
      element = LangUtils.domFragment( EDITOR_LAYOUT, ".media-gallery-item.gallery-photo" );
      element.classList.remove( "gallery-item-grid" );
      addPhotos( data, {
        container: _galleryList,
        element: element,
        remove: true
      });
    }

    addPhotoEvent( popcornOptions );
  }

  function addMediaCallback( popcornOptions, data ) {
    if ( !_media.clipData[ data.source ] ) {
      _media.clipData[ data.source ] = data;
      _butter.dispatch( "mediaclipadded" );
      addMedia( data, {
        container: _galleryList,
        remove: true
      });
    }

    addMediaEvent( popcornOptions );
  }

  function clearSearchContainers( clearAll ) {
    if ( clearAll ) {
      for ( var key in _itemContainers ) {
        if ( _itemContainers.hasOwnProperty( key ) && key !== "project" ) {
          _itemContainers[ key ].innerHTML = "";
        }
      }
    } else {
      _currentContainer.innerHTML = "";
    }
  }

  function pagingSearchCallback( container, page ) {
    var search,
        id = container.id,
        value = _searchInput.value,
        query,
        tab,
        loadingLi = document.createElement( "li" );

    search = id.substring( 0, id.indexOf( "-items" ) );
    search = search === "project" ? "all" : search;

    if ( search === "all" ) {
      // If we aren't the "My Media" tab, don't default it to the YouTube container
      if ( _currentContainer !== _itemContainers.project ) {
        container = _currentContainer;
        tab = _clipTabs[ _currentContainer.dataset.container ];
      } else {
        container = _itemContainers.YouTube;
        tab = _clipTabs.YouTube;
      }
    } else {
      container = _itemContainers[ search ];
      tab = _clipTabs[ search ];
    }

    toggleContainers( tab );

    value = value || container.dataset.query;
    value = value ? value.trim() : "";
    _searchInput.value = value;

    if ( !value ) {
      return onDenied( Localized.get( "Your search contained no results!" ) );
    }

    query = value;

    // Hashtags will break URLs
    if ( value.charAt( 0 ) === "#" ) {
      query = value.substring( 1 );
    }

    query = encodeURIComponent( query );
    clearSearchContainers( search === "all" );
    loadingLi.innerHTML = "<span class=\"media-loading-spinner butter-spinner media-gallery-loading\" ></span>";
    container.appendChild( loadingLi );
    container.classList.remove( "butter-hidden" );

    XHR.get( "/api/webmaker/search/" + search + "?page=" + page + "&q=" + query, function( data ) {
      _currentContainer.innerHTML = "";

      if ( data.status === "okay" ) {
        if ( data.results && data.results.length && data.total ) {
          var service,
              tabWithResults = false;

          for ( var k = 0; k < data.results.length; k++ ) {
            if ( data.results[ k ] ) {
              service = data.results[ k ];

              _itemContainers[ service.service ].setAttribute( "data-total", service.total );
              _itemContainers[ service.service ].setAttribute( "data-page", page );
              _itemContainers[ service.service ].setAttribute( "data-query", decodeURIComponent( query ) );

              // Ensure container/tab is only enabled when it had results
              if ( service.results.length ) {

                // If we are the first index in the data and have results we already
                // have the correct tab selected
                if ( k === 0 ) {
                  tabWithResults = true;
                }

                // If previous indexes in the data didn't have results, check if so and
                // change the selected tab to the first one with returned data
                if ( !tabWithResults ) {
                  toggleContainers( _clipTabs[ service.service ] );
                  tabWithResults = true;
                }

                for ( var j = 0; j < service.results.length; j++ ) {
                  if ( service.service !== "Flickr" && service.service !== "Giphy" ) {
                    addMedia( service.results[ j ], {
                      container: _itemContainers[ service.service ],
                      callback: addMediaCallback
                    });
                  } else {
                    addPhotos( service.results[ j ], {
                      container: _itemContainers[ service.service ],
                      callback: addPhotoCallback
                    });
                  }
                }

                addToggleListener( _clipTabs[ service.service ] );
              } else {
                removeToggleListener( _clipTabs[ service.service ] );
              }
            } else {
              removeToggleListener( _clipTabs[ service.service ] );
            }
          }

          pagination( _currentContainer, pagingSearchCallback );
          resetInput();
        } else {
          // We had no results found so disable all containers and focus the "My Media" tab.
          removeToggleListener( _clipTabs.YouTube );
          removeToggleListener( _clipTabs.SoundCloud );
          removeToggleListener( _clipTabs.Flickr );
          removeToggleListener( _clipTabs.Giphy );
          toggleContainers( _clipTabs.project );
          onDenied( Localized.get( "Your search contained no results!" ) );
        }

        _this.scrollbar.update();
      } else {
        onDenied( Localized.get( "An error occured when making your request!" ), true );
      }
    });
  }

  var pagination = function( container, callback ) {

    // Ensure page and toal are always an integer. IE: 2 and not "2"
    var page = parseInt( container.dataset.page, 10 ),
        total = parseInt( container.dataset.total, 10 );

    _parentElement.classList.add( "no-paging" );

    if ( !total ) {
      return;
    }

    var ul = _pagingContainer.querySelector( "ul" ),
        li,
        MAX_NUMS = 5,
        totalPages = total ? Math.ceil( total / _LIMIT ) : 0,
        set = Math.floor( ( page - 1 ) / MAX_NUMS ),
        startPage = set * MAX_NUMS + 1,
        endPage = Math.min( ( set * MAX_NUMS ) + MAX_NUMS, totalPages ),
        nextBtn = document.createElement( "li" ),
        prevBtn = document.createElement( "li" ),
        html = document.querySelector( "html" );


    if ( html.dir === "ltr") {
      prevBtn.innerHTML = "<span class=\"icon-chevron-left\"></span>";
      nextBtn.innerHTML = "<span class=\"icon-chevron-right\"></span>";
    } else {
      prevBtn.innerHTML = "<span class=\"icon-chevron-right\"></span>";
      nextBtn.innerHTML = "<span class=\"icon-chevron-left\"></span>";
    }

    ul.innerHTML = "";

    // Show previous?
    if ( page > 1 ) {
      prevBtn.addEventListener( "click", function() {
        callback( container, page - 1 );
      }, false );
      ul.appendChild( prevBtn );
    }

    function pageClick( e ) {
      var nextPage = e.target.getAttribute( "data-page" );

      // Ensure page is always an integer. IE: 2 and not "2"
      nextPage = parseInt( nextPage, 10 );

      callback( container, nextPage );
    }

    // Iterate over all pages;
    for ( var i = startPage; i <= endPage; i++ ) {
      li = document.createElement( "li" );
      li.innerHTML = i;
      li.setAttribute( "data-page", i );

      if ( i === page ) {
        li.classList.add( "active" );
      }
      // If we only have one page, don't add a listener to trigger another page.
      if ( total > _LIMIT ) {
        li.addEventListener( "click", pageClick, false );
      }

      ul.appendChild( li );
    }

    if ( totalPages > endPage ) {
      var ellipsis = document.createElement( "li" );
      li = document.createElement( "li" );
      li.innerHTML = totalPages;

      li.addEventListener( "click", function() {
        callback( container, totalPages );
      }, false );

      ellipsis.classList.add( "ellipsis" );
      ul.appendChild( ellipsis );
      ul.appendChild( li );
    }

    if ( page < totalPages ) {
      nextBtn.addEventListener( "click", function() {
        callback( container, page + 1 );
      }, false );
      ul.appendChild( nextBtn );
    }

    _parentElement.classList.remove( "no-paging" );
  };

  function toggleContainers( currentTab ) {
    var previousTab = _currentTab,
        currentContainer,
        container;

    if ( currentTab.nodeName === "SPAN" || currentTab.nodeName === "IMG" ) {
      currentTab = currentTab.parentNode;
    }

    currentContainer = currentTab.dataset.container,
    container = _itemContainers[ currentContainer ];

    _currentContainer = container;
    _currentTab = currentTab;

    // Unhighlight previous tab and hide clip container
    previousTab.classList.remove( "butter-active" );
    _itemContainers[ previousTab.dataset.container ].classList.add( "butter-hidden" );

    currentTab.classList.add( "butter-active" );
    container.classList.remove( "butter-hidden" );

    pagination( container, pagingSearchCallback );
    resetInput();
    _this.scrollbar.update();
  }

  function toggleListener( e ) {
    toggleContainers( e.target );
  }

  function addToggleListener( element ) {
    // We are making the tab active, remove the visual class showing it's inactive
    element.classList.remove( "butter-disabled" );
    element.addEventListener( "mouseup", toggleListener );
  }

  function removeToggleListener( element ) {
    // We are making the tab inactive, add the visual class showing it's inactive
    element.classList.add( "butter-disabled" );
    element.removeEventListener( "mouseup", toggleListener );
  }

  function setup() {
    _searchInput.addEventListener( "focus", onFocus, false );
    _searchInput.addEventListener( "input", onInput, false );
    _searchInput.addEventListener( "keydown", onEnter, false );

    _addBtn.addEventListener( "click", onAddMediaClick );
  }

  Editor.register( "media-editor", null, function( rootElement, butter ) {
    rootElement = _parentElement;
    _this = this;
    _butter = butter;
    _media = _butter.currentMedia;

    // We keep track of clips that are in the media gallery for a project once it is saved
    // and every time after it is saved.
    var clips = _media.clipData,
        clip,
        element;

    for ( var key in clips ) {
      if ( clips.hasOwnProperty( key ) ) {
        clip = clips[ key ];
        if ( typeof clip === "object" ) {
          clip.source = formatSource( clip.source );

          if ( _photoTypes.indexOf( clip.type ) === -1 ) {
            addMedia( clip, {
              container: _galleryList,
              remove: true
            });
          } else {
            element = LangUtils.domFragment( EDITOR_LAYOUT, ".media-gallery-item.gallery-photo" );
            element.classList.remove( "gallery-item-grid" );
            addPhotos( clip, {
              container: _galleryList,
              element: element,
              remove: true
            });
          }
        } else if ( typeof clip === "string" ) {
          // Load projects saved with just the url the old way.
          // Remove it too, so future saves don't come through here.
          delete clips[ key ];
          clip = formatSource( clip );
          // Fire an onSuccess so a new, updated clip is added to clipData.
          MediaUtils.getMetaData( clip, onSuccess );
        }
      }
    }

    addToggleListener( _clipTabs.project );

    setup();

    Editor.BaseEditor.extend( _this, butter, rootElement, {
      open: function() {},
      close: function() {}
    });

  }, true );
});
