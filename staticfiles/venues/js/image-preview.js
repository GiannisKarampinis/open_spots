// With the term modal we mean the full-screen overlay that shows the enlarged image
// initImageModal returns a function that can be used to open the modal with a given image source
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

// Sets up the file input to show image previews and handle removals
function setupFileInput(inputId, previewId, openImageModal) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input || !preview) return;

    // Click on thumbnail to open modal
    preview.addEventListener('click', (e) => {
        const img = e.target.closest('.thumb-wrapper img');
        if (img) openImageModal(img.src);
    });


    input.addEventListener('change', (e) => {
        // Remove previously added new images
        preview.querySelectorAll('.thumb-wrapper[data-new]').forEach(el => el.remove());

        // Gets the selected files and create thumbnails
        const files = Array.from(e.target.files);
        files.forEach((file, index) => {
            // Wrapper div
            const wrapper       = document.createElement('div');
            wrapper.className   = 'thumb-wrapper';
            wrapper.dataset.new = 'true';
            wrapper.dataset.id  = `new-${index}`;

            // Image element
            const img   = document.createElement('img');
            img.src     = URL.createObjectURL(file);
            img.width   = 80;
            wrapper.appendChild(img);

            // Remove button
            const btn       = document.createElement('button');
            btn.type        = 'button';
            btn.className   = 'remove-btn';
            btn.innerHTML   = '&times;';
            // Remove file from input when clicked
            btn.addEventListener('click', () => {
                wrapper.remove();
                const dt = new DataTransfer();
                Array.from(input.files).filter(f => f !== file).forEach(f => dt.items.add(f));
                input.files = dt.files;
            });
            
            // Append button to wrapper and wrapper to preview
            wrapper.appendChild(btn)
            const msg = preview.querySelector('.no-files-msg');
            if (msg) msg.style.display = 'none';
            preview.appendChild(wrapper);

            markFirstAsProfile(previewId);
        });
    });

    // Initial setup: remove unapproved or deleted images, set up remove buttons
    preview.querySelectorAll('.thumb-wrapper').forEach(wrapper => {
        const isApproved = wrapper.dataset.approved === "true";
        const isDeleted  = wrapper.dataset.deleted === "true";

        if (!isApproved || isDeleted) {
            wrapper.remove();
            return;
        }

        const btn = wrapper.querySelector('.remove-btn');
        if (btn) btn.onclick = () => wrapper.remove();
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

    new Sortable(container, {
        animation: 150,
        ghostClass: 'dragging',
        
        onEnd: () => {
            updateHiddenInput();
            markFirstAsProfile(containerId);

            const input = container.parentElement.querySelector(`input[name="${hiddenInputName}"]`);
            const ids = input.value.split(',').filter(Boolean);
            const url = container.dataset.updateUrl;
            const csrfToken = container.dataset.csrfToken;

            postImageReorder(url, csrfToken, ids);
        }        
    });

    // Initial call
    updateHiddenInput();
}

function markFirstAsProfile(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Remove existing profile badges and class
    container.querySelectorAll('.thumb-wrapper, .sortable-thumb').forEach(el => {
        el.classList.remove('profile');
        const label = el.querySelector('.profile-label');
        if (label) label.remove();
    });

    // Add profile marker to first thumb
    const first = container.querySelector('.thumb-wrapper, .sortable-thumb');
    if (first) {
        first.classList.add('profile');
        const label = document.createElement('span');
        label.className = 'profile-label';
        label.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chess-queen-icon lucide-chess-queen"><path d="M4 20a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="m12.474 5.943 1.567 5.34a1 1 0 0 0 1.75.328l2.616-3.402"/><path d="m20 9-3 9"/><path d="m5.594 8.209 2.615 3.403a1 1 0 0 0 1.75-.329l1.567-5.34"/><path d="M7 18 4 9"/><circle cx="12" cy="4" r="2"/><circle cx="20" cy="7" r="2"/><circle cx="4" cy="7" r="2"/></svg> Profile`;
        first.appendChild(label);
    }
}

// Sets up collapsible sections with smooth height transitions
// function setupCollapsibleSections() {
//     document.querySelectorAll(".section-header").forEach(header => {
//         const rawTarget = header.getAttribute("data-bs-target")
//             || header.getAttribute("data-target")
//             || header.dataset.bsTarget
//             || header.dataset.target;

//         if (!rawTarget) return;
//         const target = document.querySelector(rawTarget);
//         if (!target) return;

//         const icon = header.querySelector(".toggle-icon");
//         const initiallyShown = target.classList.contains("show");
//         header.setAttribute("aria-expanded", initiallyShown ? "true" : "false");
//         if (icon) icon.textContent = initiallyShown ? "▾" : "▸";

//         if (initiallyShown) {
//             target.style.maxHeight = target.scrollHeight + "px";
//             requestAnimationFrame(() => target.style.maxHeight = "");
//         } else {
//             target.style.maxHeight = "0";
//         }

//         const collapse = () => {
//             header.setAttribute("aria-expanded", "false");
//             if (icon) icon.textContent = "▸";
//             target.style.maxHeight = target.scrollHeight + "px";
//             target.offsetHeight;
//             target.style.transition = "max-height 220ms ease";
//             target.style.maxHeight = "0";

//             target.addEventListener("transitionend", () => {
//                 target.classList.remove("show");
//                 target.style.transition = "";
//             }, { once: true });
//         };

//         const expand = () => {
//             header.setAttribute("aria-expanded", "true");
//             if (icon) icon.textContent = "▾";
//             target.classList.add("show");
//             target.style.maxHeight = "0";
//             target.offsetHeight;
//             target.style.transition = "max-height 220ms ease";
//             target.style.maxHeight = target.scrollHeight + "px";

//             target.addEventListener("transitionend", () => {
//                 target.style.transition = "";
//                 target.style.maxHeight = "";
//             }, { once: true });
//         };

//         header.addEventListener("click", () =>
//             header.getAttribute("aria-expanded") === "true" ? collapse() : expand()
//         );
//         header.addEventListener("keydown", e => {
//             if (["Enter", " ", "Space"].includes(e.key)) {
//                 e.preventDefault();
//                 header.click();
//             }
//         });
//     });
// }

function setupFormSubmission(formSelector) {
    const form = document.querySelector(formSelector);
    if (!form) return;

    form.addEventListener('submit', () => {
        const venuePreview = document.getElementById('venue-preview');
        const menuPreview = document.getElementById('menu-preview');

        const createInput = (name, values) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = values.join(',');
            form.appendChild(input);
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
        headers: {
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

document.addEventListener("DOMContentLoaded", () => {
    const openImageModal = initImageModal('imageModal');

    setupFileInput('venue_images', 'venue-preview', openImageModal);
    setupFileInput('menu_images', 'menu-preview', openImageModal);

    setupReorderablePreview('venue-preview', 'visible_venue_image_ids[]');
    setupReorderablePreview('menu-preview', 'visible_menu_image_ids[]');

    // setupCollapsibleSections();
    setupFormSubmission('form.venue-form-card');

    markFirstAsProfile('venue-preview');
    markFirstAsProfile('menu-preview');
});
