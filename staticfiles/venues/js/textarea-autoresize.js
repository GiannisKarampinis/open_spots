// textarea-autoresize.js
document.addEventListener('DOMContentLoaded', () => {

    // Auto-resize when typing
    document.addEventListener('input', function (e) {
        if (e.target.tagName.toLowerCase() === 'textarea') {
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
        }
    });

    // Resize on page load if pre-filled
    const textarea = document.getElementById('description');
    if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    // Detect tab switches and resize textarea if visible
    document.querySelectorAll('.tabs button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            setTimeout(() => {
                const textarea = document.querySelector(`#${tabId} textarea`);
                if (textarea && textarea.offsetParent !== null) {
                    textarea.style.height = 'auto';
                    textarea.style.height = textarea.scrollHeight + 'px';
                }
            }, 50);
        });
    });
});
