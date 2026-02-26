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

    let minDate = null;
    let maxDate = null;

    if (targetTab === 'requestsTab') {
        // Only allow today and future dates
        minDate = new Date(); // today
    } else if (targetTab === 'historyTab') {
        // Only allow past dates
        maxDate = new Date();
        maxDate.setDate(maxDate.getDate() - 1); // yesterday
    }

    // Initialize Flatpickr once per input
    const dateRangePicker = flatpickr(dateInput, {
      mode:               'range',
      dateFormat:         'M j, Y',
      allowInput:         false,
      clickOpens:         false, // we open manually
      appendTo:           modalEl.querySelector('.modal-body'),
      monthSelectorType:  'dropdown',
      minDate:            minDate,
      maxDate:            maxDate,

      onChange: function (selectedDates) {
        // When Flatpickr gives us Date objects, they are in local time.
        // Converting via `toISOString()` would shift the day if UTC offset
        // moves it backwards (e.g. Greece is +2, so Feb 27 → Feb 26 UTC).
        // We only care about the calendar date itself, not the instant, so
        // format as YYYY-MM-DD according to the picker’s locale.
        const startDate = selectedDates[0] || null;
        const endDate   = selectedDates[1] || null;

        const start = startDate ? this.formatDate(startDate, 'Y-m-d') : null;
        const end   = endDate   ? this.formatDate(endDate, 'Y-m-d')   : null;

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

    // Wire up the clear button (now outside the modal, next to the input)
    const clearBtn = document.querySelector(`.clear-range-btn[data-target-tab="${targetTab}"]`);
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log(`[ACTION] Clearing range for tab "${targetTab}"`);
        
        // Properly clear the picker
        dateRangePicker.setDate(null, true);
        dateInput.value = '';
        
        console.log('[DEBUG] Range cleared - dateInput.value:', dateInput.value);
        console.log('[DEBUG] Flatpickr state:', dateRangePicker.selectedDates);
        
        // Dispatch event with null dates to trigger table reset
        document.dispatchEvent(new CustomEvent('dateRangeSelected', {
          detail: { start: null, end: null, targetTab }
        }));
      });
    }
  });

});
