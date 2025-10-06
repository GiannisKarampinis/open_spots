function initPreview(inputId, previewId, removeInputName) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);

    function createThumb(src, isNew=true, existingId=null) {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumb-wrapper';
        if (!isNew) wrapper.dataset.existing = "true";
        if (existingId) wrapper.dataset.id = existingId;

        const img = document.createElement('img');
        img.src = src;
        
        // Scale image height to preview container
        const previewHeight = preview.clientHeight;
        img.style.height = Math.min(100, previewHeight - 10) + 'px'; // max 100px or container height
        img.style.width = 'auto';
        img.style.borderRadius = '4px';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'remove-btn';
        btn.innerHTML = '&times;';
        btn.onclick = () => {
            if (!isNew) {
                wrapper.querySelector('input[type="hidden"]').disabled = false;
                wrapper.querySelector('input[type="hidden"]').value = wrapper.dataset.id;
            }
            wrapper.remove();
        };

        wrapper.appendChild(img);
        wrapper.appendChild(btn);

        if (!isNew) {
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = removeInputName;
            hidden.value = "";
            hidden.disabled = true;
            wrapper.appendChild(hidden);
        }

        preview.appendChild(wrapper);
    }


    // Handle new files selection
    input.addEventListener('change', () => {
        Array.from(input.files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            file.previewSrc = URL.createObjectURL(file);
            createThumb(file.previewSrc, true);
        });
    });

    // Add remove buttons for existing images
    preview.querySelectorAll('.thumb-wrapper[data-existing="true"]').forEach(wrapper => {
        wrapper.querySelector('.remove-btn').onclick = () => {
            wrapper.querySelector('input[type="hidden"]').disabled = false;
            wrapper.querySelector('input[type="hidden"]').value = wrapper.dataset.id;
            wrapper.remove();
        };
    });
}

// Initialize previews
initPreview('venue_images', 'venue-preview', 'remove_venue_images');
initPreview('menu_images', 'menu-preview', 'remove_menu_images');














// Modal logic
const modal = document.getElementById('imageModal');
const modalImg = modal.querySelector('img');
const closeBtn = modal.querySelector('.close-btn');

function openImageModal(src) {
    modal.style.display = 'flex';
    modalImg.src = src;
}

// Close modal
closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    modalImg.src = '';
});

// Also close modal on click outside the image
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
        modalImg.src = '';
    }
});

// Add click listener to thumbnails dynamically
function attachThumbnailClick(previewContainer) {
    previewContainer.querySelectorAll('img').forEach(img => {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => openImageModal(img.src));
    });
}

// Attach to existing thumbnails
attachThumbnailClick(document.getElementById('venue-preview'));
attachThumbnailClick(document.getElementById('menu-preview'));

// Attach dynamically to new thumbnails created by initPreview
const originalCreateThumb = window.createThumb;
window.createThumb = function(src, isNew=true, existingId=null) {
    originalCreateThumb(src, isNew, existingId);
    const preview = document.getElementById(isNew ? 'venue-preview' : 'menu-preview');
    attachThumbnailClick(preview);
};
