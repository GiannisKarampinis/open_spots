////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                           END OF DEBUG UTILITIES                                               //      
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function watchThumbChanges(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const dump = () => {
        const ids = Array.from(container.querySelectorAll('.thumb-wrapper'))
            .map(t => t.dataset.id);

        console.log(`[WATCH ${containerId}]`, ids);
    };

    // Initial snapshot
    dump();

    const observer = new MutationObserver(() => {
        dump();
    });

    observer.observe(container, {
        childList: true,
        subtree: false
    });
}


// OK - CHECKED
function initImageModal(modalId) {
    // With the term modal we mean the full-screen overlay that shows the enlarged image
    // initImageModal returns a function that can be used to open the modal with a given image source
    const modal = document.getElementById(modalId);
    if (!modal) {
        return null;
    }

    const modalImg = modal.querySelector('img');
    const closeBtn = modal.querySelector('.close-btn');
    if (!modalImg || !closeBtn) {
        return null;
    }

    const hideModal = () => { // Helper to hide the modal and clear the image source
        modal.style.display = 'none';
        modalImg.src = '';
    };

    closeBtn.addEventListener('click', () => {
      hideModal();
    });

    modal.addEventListener('click', e => {
      if (e.target === modal) {
        hideModal();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        hideModal();
      }
    });


    return function openModal(src) {
        modal.style.display = 'flex';
        modalImg.src        = src;
    };
}



function setupFileInput(inputButtonId, previewId, openImageModal) {
    
    let newIndex = 0;
    
    const syncNewThumbIdsToDt = () => {
        const newThumbs = Array.from(preview.querySelectorAll('.thumb-wrapper[data-new="true"]')); // Collect only new thumbs in their DOM order (not the server ones, which don't have data-new="true")
        newThumbs.forEach((wrapper, i) => {
            wrapper.dataset.id = `new-${i}`; // Re-label them new-0..new-(n-1) in DOM order
        });
        newIndex = newThumbs.length; // Also set newIndex to next available number, so future adds don't collide

    };
    
    // Sets up the file input (Upload & Preview System) to show image previews and handle removals
    const input     = document.getElementById(inputButtonId);
    const preview   = document.getElementById(previewId);
    if (!input || !preview) return;

    const dt = new DataTransfer(); // Normally, input.files gets replaced on each selection, but we want to accumulate across selections.
                                   // DataTransfer is the standard way to create a mutable file list that we can keep appending to and removing from.
                                   // That's how we implemented the "append" behavior and also handle removals properly.

    const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`; // Helper: create a unique key for a file based on its name, size, and last modified time

    // Click on thumbnail to open modal. Event delegation: we listen once on the container instead of each thumb, 
    // and check if the click target is an image inside a thumb-wrapper.
    preview.addEventListener('click', (e) => {
        if (!openImageModal) return; // If modal isn't set up, do nothing on click
        const img = e.target.closest('.thumb-wrapper img');
        if (img) {
            openImageModal(img.src);
        }
    });

    // Add a thumbnail for a file
    const addThumb = (file, id) => {        
        const wrapper       = document.createElement('div');
        wrapper.className   = 'thumb-wrapper';
        wrapper.dataset.new = 'true';
        wrapper.dataset.id  = id;

        const img           = document.createElement('img');
        const objectUrl     = URL.createObjectURL(file);
        img.src             = objectUrl;
        img.width           = 80;
        wrapper.dataset.objectUrl = objectUrl; // store it so we can revoke later

        wrapper.appendChild(img);

        const btn           = document.createElement('button');
        btn.type            = 'button';
        btn.className       = 'remove-btn';
        btn.innerHTML       = '&times;';

        // Remove button handler: removes the thumbnail and updates the DataTransfer to exclude the removed file
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
           
            const url = wrapper.dataset.objectUrl;
            if (url) URL.revokeObjectURL(url);
            
            wrapper.remove(); // Remove thumbnail
                        
            // Remove file from DataTransfer
            const nextDt = new DataTransfer();
            for (const f of dt.files) {
                if (fileKey(f) !== fileKey(file)) nextDt.items.add(f);
            }

            // Copy back into dt (dt.items is live; easiest is 
            // to clear by recreating dt contents)
            // So we rebuild dt by removing all and re-adding.
            while (dt.items.length) dt.items.remove(0);
            for (const f of nextDt.files) dt.items.add(f);

            syncNewThumbIdsToDt(); // Update input file list

            input.files = dt.files; // This is what browser actually submits with the form

            markFirstAsProfile(previewId);

            const msg = preview.querySelector('.no-files-msg');
            if (msg && preview.querySelectorAll('.thumb-wrapper').length === 0) {
                msg.style.display = '';
            }
        });

        wrapper.appendChild(btn);
        preview.appendChild(wrapper);

        const msg = preview.querySelector('.no-files-msg');
        if (msg) msg.style.display = 'none';
    };



    input.addEventListener('change', (e) => {
        // When user selects files, browser puts them in e.target.files. 
        // We convert it to an array.
        const selected = Array.from(e.target.files || []);
        
        if (!selected.length) {
            return;
        }

        // Build a Set of existing file keys to prevent duplicates when user selects files multiple times
        const existing = new Set(Array.from(dt.files).map(fileKey));

        selected.forEach((file) => {
            const key = fileKey(file);
            if (existing.has(key)) return;

            dt.items.add(file);
            existing.add(key);

            // Unique id for this new file thumb
            const id = `new-${newIndex++}`;
            addThumb(file, id);
        });

        // Critical: overwrite input.files with accumulated dt.files. This is the
        // only way to ensure that all selected files across multiple selections 
        // are included in the form submission. Thus, this is the append trick.
        syncNewThumbIdsToDt();

        input.files = dt.files;

        markFirstAsProfile(previewId);
    });

    // Initial setup for existing server images: remove unapproved or deleted images, set up remove buttons
    preview.querySelectorAll('.thumb-wrapper').forEach(wrapper => {
        const isApproved = wrapper.dataset.approved === "true";
        const isDeleted  = wrapper.dataset.deleted === "true";

        if (!isApproved || isDeleted) {
            wrapper.remove();
            return;
        }

        const btn = wrapper.querySelector('.remove-btn');
        if (btn) btn.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            wrapper.remove();
            markFirstAsProfile(previewId);
        };
    });
}


// Makes the preview container reorderable using SortableJS
function setupReorderablePreview(containerId, hiddenInputName) {
    
    const container = document.getElementById(containerId);
    if (!container || typeof Sortable === 'undefined') return;
    
    const updateHiddenInput = () => {
        const orderedIds = Array.from(container.querySelectorAll('.thumb-wrapper'))
        .map(wrapper => wrapper.dataset.id)
        .filter(id => !!id);
        let input = container.parentElement.querySelector(`input[name="${hiddenInputName}"]`);
        if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = hiddenInputName;
            container.parentElement.appendChild(input);
        }
        input.value = orderedIds.join(',');
    };

    let lastOrder = [];

    new Sortable(container, {
        animation: 150,
        ghostClass: 'dragging',
        
        onEnd: () => {
            const current = Array.from(container.querySelectorAll('.thumb-wrapper'))
                .map(w => w.dataset.id);

            if (
                lastOrder.length &&
                current.length === lastOrder.length &&
                current.every((v, i) => v === lastOrder[i])
            ) {
                console.log("Order unchanged – skipping POST");
                return;
            }

            lastOrder = [...current];

            updateHiddenInput();
            markFirstAsProfile(containerId);

            const url = container.dataset.updateUrl;
            const csrfToken = container.dataset.csrfToken;
    
            postImageReorder(url, csrfToken, current);
        }

    });

    // Initial call
    updateHiddenInput();
}



function markFirstAsProfile(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const candidates = container.querySelectorAll('.thumb-wrapper, .sortable-thumb');
    if (!candidates.length) return;

    // Remove existing profile badges and class
    candidates.forEach(el => {
        el.classList.remove('profile');
        const label = el.querySelector('.profile-label');
        if (label) label.remove();
    });

    // Add profile marker to first thumb
    const first = candidates[0];
    first.classList.add('profile');

    const label = document.createElement('span');
    label.className = 'profile-label';
    label.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
             viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
             class="lucide lucide-chess-queen-icon lucide-chess-queen">
            <path d="M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>
            <path d="m12.474 5.943 1.567 5.34a1 1 0 0 0 1.75.328l2.616-3.402"/>
            <path d="m20 9-3 9"/>
            <path d="m5.594 8.209 2.615 3.403a1 1 0 0 0 1.75-.329l1.567-5.34"/>
            <path d="M7 18 4 9"/>
            <circle cx="12" cy="4" r="2"/>
            <circle cx="20" cy="7" r="2"/>
            <circle cx="4" cy="7" r="2"/>
        </svg>
        Profile
    `;
    first.appendChild(label);
}



// SUBMIT FOR APPROBAL BUTTON
function setupFormSubmission(formSelector) {
    const form = document.querySelector(formSelector);
    if (!form) {
        return;
    }

    form.addEventListener('submit', (e) => {
        // e.preventDefault(); // <-- IMPORTANT: stops browser from leaving the page

        const venuePreview = document.getElementById('venue-preview');
        const menuPreview  = document.getElementById('menu-preview');

        const createInput = (name, values) => {
            let input = form.querySelector(`input[name="${name}"]`);
            if (!input) {
                input       = document.createElement('input');
                input.type  = 'hidden';
                input.name  = name;
                form.appendChild(input);
                
            }
            input.value = values.join(',');
        };

        if (venuePreview) {
            const venueIds = Array.from(venuePreview.querySelectorAll('.thumb-wrapper'))
                .map(el => el.dataset.id)
                .filter(Boolean);

            createInput('visible_venue_image_ids[]', venueIds);
        }

        if (menuPreview) {
            const menuIds = Array.from(menuPreview.querySelectorAll('.thumb-wrapper'))
                .map(el => el.dataset.id)
                .filter(Boolean);
            
            createInput('visible_menu_image_ids[]', menuIds);
        }

        markFirstAsProfile('venue-preview');
        markFirstAsProfile('menu-preview');        
    });
}



function postImageReorder(url, csrfToken, sequence) {
    if (!url || !csrfToken || !sequence.length) return;

    fetch(url, {
        method: "POST",
        headers: 
        {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken
        },
        body: JSON.stringify({ sequence })
    })
    .then(resp => resp.json())
    .then(data => {
        if (data.status !== "success") {
            console.warn("Failed to reorder images:", data);
        }
    })
    .catch(err => console.error("Reorder error:", err));
}



/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
document.addEventListener("DOMContentLoaded", () => {    // Standard practice. This waits for the DOM to be fully 
                                                         // loaded before trying to access elements or set up 
                                                         // event listeners.

    const openImageModal = initImageModal('imageModal'); // Image modal is the way, thumbnails open 
                                                         // the full-screen view when clicked. 
    if (!openImageModal) {
        console.warn("Image modal not found or not initialized. Thumbnails will not open in full-screen.");
    }

    // File Dialogs
    setupFileInput('venue_images', 'venue-preview', openImageModal);
    setupFileInput('menu_images',  'menu-preview',  openImageModal);

    setupReorderablePreview('venue-preview', 'visible_venue_image_ids[]');
    setupReorderablePreview('menu-preview', 'visible_menu_image_ids[]');

    setupFormSubmission('form.venue-form-card');

    markFirstAsProfile('venue-preview');
    markFirstAsProfile('menu-preview');

    watchThumbChanges("venue-preview");
    watchThumbChanges("menu-preview");

});
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////