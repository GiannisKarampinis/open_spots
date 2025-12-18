(function () {  // This file is reusable: it validates only forms that exist on the page.
  function attachSignupLikeValidation(formId, fieldNameMap = {}) {
    const form = document.getElementById(formId);
    if (!form) return;

    // helper to map "custom names" -> "canonical rule names"
    // e.g. admin_password1 -> password1
    const canonicalName = (name) => fieldNameMap[name] || name;

    function setFieldErrors(fieldName, messages) {
      const errorList = document.getElementById(fieldName + '-errors');
      if (!errorList) return;
      errorList.innerHTML = '';
      if (messages.length > 0) {
        messages.forEach(msg => {
          const li = document.createElement('li');
          li.textContent = msg;
          errorList.appendChild(li);
        });
      }
    }

    function validateField(field) {
      /*
        * Validate a single input/select field's value and return an array of error messages.
        * Checks specific rules depending on the field name (username, email, password1, password2).
        * @param {HTMLInputElement|HTMLSelectElement} field - The field to validate.
        * @returns {string[]} Array of validation error messages.
      */
      const name  = canonicalName(field.name);
      const val   = (field.value || '').trim();
      let errors  = [];

      if (name === 'username') {
        if (val.length < 3) errors.push("Username must be at least 3 characters.");
      }

      if (name === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(val)) errors.push("Please enter a valid email address.");
      }

      if (name === 'password1') {
        if (val.length < 8) errors.push("Your password must contain at least 8 characters.");
      }

      if (name === 'password2') {
        // IMPORTANT: find the "password1" field in THIS form, even if it has a different name
        const pw1Field  = Array.from(form.querySelectorAll('input')).find(i => canonicalName(i.name) === 'password1');
        const pw1       = (pw1Field?.value || '').trim();

        if (val !== pw1) errors.push("Passwords do not match.");
      }

      return errors;
    }

    form.querySelectorAll('input, select').forEach(input => {
      // Add real-time input validation listeners to each input and select field
      input.addEventListener('input', () => {
        const errors = validateField(input);
        setFieldErrors(input.name, errors);

        if (errors.length > 0) {
          input.setAttribute('aria-invalid', 'true');
          input.classList.remove('valid');
        } else {
          input.removeAttribute('aria-invalid');
          input.classList.add('valid');
        }
      });
    });

    
    
    form.addEventListener('submit', (e) => {
      /*
        * On form submit, validate all inputs and prevent submission if errors exist.
        * Also focuses and scrolls to the first invalid input for better user experience.
     */
      let formIsValid = true;

      form.querySelectorAll('input, select').forEach(input => {
        const errors = validateField(input);
        setFieldErrors(input.name, errors);

        if (errors.length > 0) {
          formIsValid = false;
          input.setAttribute('aria-invalid', 'true');
          input.classList.remove('valid');
        } else {
          input.removeAttribute('aria-invalid');
          input.classList.add('valid');
        }
      });

      if (!formIsValid) {
        e.preventDefault();
        const firstErrorInput = form.querySelector('input[aria-invalid="true"], select[aria-invalid="true"]');
        if (firstErrorInput) {
          firstErrorInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstErrorInput.focus();
        }
      }
    });

    /*
      * On page load, if server returned any field errors, focus and scroll to the first one.
     */
    const firstServerError = form.querySelector('.errorlist li');
    if (firstServerError) {
      const errorList = firstServerError.closest('.errorlist');
      const fieldInput = errorList?.previousElementSibling;
      if (fieldInput && fieldInput.focus) {
        fieldInput.focus();
        errorList.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // expose globally so templates can call it with different forms
  window.attachSignupLikeValidation = attachSignupLikeValidation;
})();
