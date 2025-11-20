//////////////////////////////////////////////////////////////////////////////
// ---------- Modular Functions for Venue & Menu Images ----------
//////////////////////////////////////////////////////////////////////////////

// --------- Image Modal ----------
// OK - CHECKED
function initImageModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return null;

    const modalImg = modal.querySelector('img');
    const closeBtn = modal.querySelector('.close-btn');
    if (!modalImg || !closeBtn) return null;

    const hideModal = () => {
        modal.style.display = 'none';
        modalImg.src = '';
    };

    closeBtn.addEventListener('click', hideModal);
    modal.addEventListener('click', e => { if (e.target === modal) hideModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideModal(); });

    return function openModal(src) {
        modal.style.display = 'flex';
        modalImg.src = src;
    };
}

// --------- File Input & Thumbnail ----------
function setupFileInput(inputId, previewId, openImageModal) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    // Event delegation for modal
    preview.addEventListener('click', (e) => {
        const img = e.target.closest('.thumb-wrapper img');
        if (img) openImageModal(img.src);
    });

    function addThumbnail(fileOrUrl, isNew = true, existingId = null) {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumb-wrapper';
        if (isNew) wrapper.dataset.new = 'true';
        if (!isNew && existingId) wrapper.dataset.existing = 'true';
        if (existingId) wrapper.dataset.id = existingId;

        const img = document.createElement('img');
        img.src = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
        img.width = 80;
        wrapper.appendChild(img);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'remove-btn';
        btn.innerHTML = '&times;';
        btn.addEventListener('click', () => {
            wrapper.remove();
            if (isNew) {
                const dt = new DataTransfer();
                Array.from(input.files).filter(f => f !== fileOrUrl).forEach(f => dt.items.add(f));
                input.files = dt.files;
            }
        });
        wrapper.appendChild(btn);

        const msg = preview.querySelector('.no-files-msg');
        if (msg) msg.style.display = 'none';

        preview.appendChild(wrapper);
    }

    // Handle newly selected files
    input.addEventListener('change', (e) => {
        preview.querySelectorAll('.thumb-wrapper[data-new]').forEach(el => el.remove());
        Array.from(e.target.files).forEach(file => addThumbnail(file, true));
    });

    // Initialize existing thumbnails (remove buttons only)
    preview.querySelectorAll('.thumb-wrapper').forEach(wrapper => {
        const btn = wrapper.querySelector('.remove-btn');
        if (btn) btn.onclick = () => wrapper.remove();
    });

    return addThumbnail;
}

// --------- Collapsible Sections ----------
// OK - CHECKED
function setupCollapsibleSections() {
    document.querySelectorAll(".section-header").forEach(header => {
        const rawTarget = header.getAttribute("data-bs-target") || header.getAttribute("data-target") || header.dataset.bsTarget || header.dataset.target;
        if (!rawTarget) return;
        const target = document.querySelector(rawTarget);
        if (!target) return;

        const icon = header.querySelector(".toggle-icon");
        const initiallyShown = target.classList.contains("show");
        header.setAttribute("aria-expanded", initiallyShown ? "true" : "false");
        if (icon) icon.textContent = initiallyShown ? "▾" : "▸";

        if (initiallyShown) {
            target.style.maxHeight = target.scrollHeight + "px";
            requestAnimationFrame(() => target.style.maxHeight = "");
        } else {
            target.style.maxHeight = "0";
        }

        const collapse = () => {
            header.setAttribute("aria-expanded", "false");
            if (icon) icon.textContent = "▸";
            target.style.maxHeight = target.scrollHeight + "px";
            target.offsetHeight;
            target.style.transition = "max-height 220ms ease";
            target.style.maxHeight = "0";
            target.addEventListener("transitionend", () => {
                target.classList.remove("show");
                target.style.transition = "";
            }, { once: true });
        };

        const expand = () => {
            header.setAttribute("aria-expanded", "true");
            if (icon) icon.textContent = "▾";
            target.classList.add("show");
            target.style.maxHeight = "0";
            target.offsetHeight;
            target.style.transition = "max-height 220ms ease";
            target.style.maxHeight = target.scrollHeight + "px";
            target.addEventListener("transitionend", () => {
                target.style.transition = "";
                target.style.maxHeight = "";
            }, { once: true });
        };

        header.addEventListener("click", () => header.getAttribute("aria-expanded") === "true" ? collapse() : expand());
        header.addEventListener("keydown", e => { if (["Enter"," ","Space"].includes(e.key)) { e.preventDefault(); header.click(); } });
    });
}

// --------- Sortable Image Sequence ----------
// OK - CHECKED
function setupSortableSequence(containerId) {
    const container = document.getElementById(containerId);
    if (!container || typeof Sortable === 'undefined') return;

    if (container._sortableInit) return;

    const sequenceInputId = 'image_sequence';
    let sequenceInput = document.getElementById(sequenceInputId);
    if (!sequenceInput) {
        sequenceInput = document.createElement('input');
        sequenceInput.type = 'hidden';
        sequenceInput.id = sequenceInputId;
        sequenceInput.name = 'image_sequence';
        container.parentNode.appendChild(sequenceInput);
    }

    const updateSequenceInput = () => {
        const ordered = Array.from(container.children)
            .map(c => c.dataset.id)
            .filter(Boolean);
        sequenceInput.value = ordered.join(',');
        return ordered;
    };

    const updateUrl = container.dataset.updateUrl;
    const csrfToken = container.dataset.csrf;

    const sendUpdatedOrderToServer = () => {
        const ordered = updateSequenceInput();
        if (!updateUrl) return;

        fetch(updateUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
            body: JSON.stringify({ sequence: ordered })
        })
        .then(r => r.json())
        .then(data => {
            if (data.status !== "success") console.error("Failed to update image order:", data);
        })
        .catch(err => console.error(err));
    };

    const updateProfileFrame = () => {
        const thumbs = container.querySelectorAll('.sortable-thumb');
        thumbs.forEach((thumb, index) => {
            if (index === 0) {
                thumb.classList.add('profile');
                if (!thumb.querySelector('.profile-label')) {
                    const label = document.createElement('span');
                    label.className = 'profile-label';
                    label.innerText = 'Profile';
                    thumb.appendChild(label);
                }
            } else {
                thumb.classList.remove('profile');
                const label = thumb.querySelector('.profile-label');
                if (label) label.remove();
            }
        });
    };

    new Sortable(container, {
        animation: 150,
        ghostClass: 'dragging',
        onEnd: () => {
            sendUpdatedOrderToServer();
            updateProfileFrame();
        }
    });

    container._sortableInit = true;
    updateSequenceInput();
    updateProfileFrame();

}



// --------- Form Submit Handler ----------
// setupFormSubmission: is designed to attach extra hidden inputs to a form before submission,
// capturing the current state of image sequences and visibility for venue and menu images.
// In submission this will result in a snapshot of the image order and visibility being sent to the server.
// OK - CHECKED
function setupFormSubmission(formSelector) {
    const form = document.querySelector(formSelector);
    if (!form) return;

    form.addEventListener('submit', () => {
        const container = document.getElementById('sortable-image-sequence');

        // Image sequence
        const orderedIds = Array.from(container.querySelectorAll('.sortable-thumb'))
            .map(el => el.dataset.id).filter(Boolean);
        const orderInput = document.createElement('input');
        orderInput.type = 'hidden';
        orderInput.name = 'image_sequence';
        orderInput.value = orderedIds.join(',');
        form.appendChild(orderInput);

        // Visible venue images
        const visibleVenue = Array.from(document.querySelectorAll('#venue-preview .thumb-wrapper[data-existing]'))
            .map(el => el.dataset.id);
        const visibleVenueInput = document.createElement('input');
        visibleVenueInput.type = 'hidden';
        visibleVenueInput.name = 'visible_venue_image_ids[]';
        visibleVenueInput.value = visibleVenue.join(',');
        form.appendChild(visibleVenueInput);

        // Visible menu images
        const visibleMenu = Array.from(document.querySelectorAll('#menu-preview .thumb-wrapper[data-existing]'))
            .map(el => el.dataset.id);
        const visibleMenuInput = document.createElement('input');
        visibleMenuInput.type = 'hidden';
        visibleMenuInput.name = 'visible_menu_image_ids[]';
        visibleMenuInput.value = visibleMenu.join(',');
        form.appendChild(visibleMenuInput);
    });
}

//////////////////////////////////////////////////////////////////////////////
// ---------- DOM Loaded Triggers ----------
//////////////////////////////////////////////////////////////////////////////
document.addEventListener("DOMContentLoaded", () => {
    const openImageModal = initImageModal('imageModal');

    // Setup file inputs with thumbnails & modal
    setupFileInput('venue_images', 'venue-preview', openImageModal);
    setupFileInput('menu_images', 'menu-preview', openImageModal);

    // Collapsible sections
    setupCollapsibleSections();

    // Sortable image sequence
    setupSortableSequence(
        'sortable-image-sequence',
        'image_sequence',
        "{% url 'update_image_order' venue.id %}",
        "{{ csrf_token }}"
    );

    // Form submission
    setupFormSubmission('form.venue-form-card');
});
