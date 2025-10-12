document.addEventListener('DOMContentLoaded', function () {
  // Initialize all date range inputs (multiple tabs possible)
  document.querySelectorAll('.daterange-input').forEach((dateInput) => {
    const targetTab = dateInput.dataset.targetTab;
    const modalEl   = document.getElementById(`dateRangeModal-${targetTab}`);

    if (!modalEl || !dateInput) {
      console.error(`[ERROR] Date range modal or input not found for tab "${targetTab}"`);
      return;
    }

    const modalInstance = new bootstrap.Modal(modalEl);

    // Initialize Flatpickr once per input
    const dateRangePicker = flatpickr(dateInput, {
      mode:               'range',
      dateFormat:         'M j, Y',
      allowInput:         false,
      clickOpens:         false, // we open manually
      appendTo:           modalEl.querySelector('.modal-body'),
      monthSelectorType:  'dropdown',

      onChange: function (selectedDates) {
        const start = selectedDates[0] || null;
        const end   = selectedDates[1] || null;

        console.log(`[FLATPICKR] selectedDates → start: ${start}, end: ${end}`);

        document.dispatchEvent(new CustomEvent('dateRangeSelected', {
          detail: { start, end, targetTab }
        }));
      },

      onClose: function () {
        console.log(`[FLATPICKR] onClose fired → hiding modal for tab "${targetTab}"`);
        if (modalEl.classList.contains('show')) {
          modalInstance.hide();
          console.log('[ACTION] Bootstrap modal hidden (state reset)');
        }
      },
      onOpen: function(selectedDates, dateStr, instance) {
        // Match calendar width to input width dynamically
        const width = dateInput.offsetWidth;
        instance.calendarContainer.style.width = `${width}px`;
        instance.calendarContainer.style.minWidth = `${width}px`;
      },
      onReady: function (_, __, instance) {
        console.log(`[FLATPICKR] onReady fired → adding .custom-flatpickr class for tab "${targetTab}"`);
        instance.calendarContainer.classList.add('custom-flatpickr');
      }
    });

    // Helper to open modal + Flatpickr
    function openDateModal() {
      console.log(`[ACTION] Showing modalInstance for tab "${targetTab}"`);
      modalInstance.show();
    }

    // Input event listeners
    dateInput.addEventListener('mousedown', function (e) {
      console.log(`[EVENT] mousedown on dateInput for tab "${targetTab}"`);
      e.preventDefault(); // prevent immediate focus (avoids aria-hidden issues)
      openDateModal();
    });

    dateInput.addEventListener('keydown', function (e) {
      console.log(`[EVENT] keydown on dateInput for tab "${targetTab}": key="${e.key}"`);
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDateModal();
      }
    });

    // ARIA-safe: open Flatpickr only after modal fully visible
    modalEl.addEventListener('shown.bs.modal', function () {
      console.log(`[EVENT] shown.bs.modal for tab "${targetTab}"`);
      dateInput.focus(); // safe to focus now
      try {
        dateRangePicker.open();
        console.log('[ACTION] Flatpickr calendar opened');
      } catch (err) {
        console.warn('[WARN] Failed to open Flatpickr:', err);
      }
    });

    // Optional: blur input when modal hides
    modalEl.addEventListener('hidden.bs.modal', function () {
      console.log(`[EVENT] hidden.bs.modal for tab "${targetTab}"`);
      if (document.activeElement === dateInput) dateInput.blur();
      dateRangePicker.close(); // resets isOpen
      console.log('[ACTION] Flatpickr calendar closed');
    });
  });

});
