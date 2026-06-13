// src/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  en: {
    translation: {
      "Personal info": "Personal info",
      "Permissions": "Permissions",
      "Important dates": "Important dates",

      "Username": "Username",
      "Email": "Email",
      "Phone number": "Phone number",
      "Password": "Password",
      "Confirm password": "Confirm password",
      "User type": "User type",
      "New password": "New password",
      "Confirm new password": "Confirm new password",
      "Old password": "Old password",

      "Passwords do not match.": "Passwords do not match.",
      "Old password is incorrect.": "Old password is incorrect.",
      "The new passwords do not match.": "The new passwords do not match.",
      "Enter a valid phone number (7–15 digits, optional +).":
        "Enter a valid phone number (7–15 digits, optional +).",

      "Your Venue Dashboard": "Your Venue Dashboard",
      "Welcome, %(user.username)s — Your Venue Dashboard":
        "Welcome, %(user.username)s — Your Venue Dashboard",
      "You don't have any venues yet.": "You don't have any venues yet.",

      "Login": "Login",
      "Welcome Back": "Welcome Back",
      "Login with Google": "Login with Google",
      "or": "or",
      "Forgot your password?": "Forgot your password?",
      "Don't have an account?": "Don't have an account?",
      "Sign up": "Sign up",
      "Password recover": "Password recover",
      "Password Recovery": "Password Recovery",
      "Send Verification Code": "Send Verification Code",
      "Password reset": "Password reset",
      "Reset Your Password": "Reset Your Password",
      "Change Password": "Change Password",

      "Sign Up": "Sign Up",
      "Create Account": "Create Account",
      "Already have an account?": "Already have an account?",

      "Verify Email": "Verify Email",
      "Verify Your Email": "Verify Your Email",
      "Please enter the 6-digit code we sent to your email address.":
        "Please enter the 6-digit code we sent to your email address.",
      "Enter 6-digit code": "Enter 6-digit code",
      "Verify": "Verify",
      "Resend Code": "Resend Code",
      "Verification code expires in": "Verification code expires in",
      "seconds": "seconds",
      "Verification code has expired.": "Verification code has expired.",

      "Dashboard": "Dashboard",
      "View Dashboard": "View Dashboard",
      "Profile": "Profile",
      "Settings": "Settings",
      "Dark Mode": "Dark Mode",
      "Toggle dark mode": "Toggle dark mode",
      "Logout": "Logout",

      "My Reservations": "My Reservations",
      "Apply to Register a Venue": "Apply to Register a Venue",

      "Venue Dashboard": "Venue Dashboard",
      "Browse Venues": "Browse Venues",
      "Explore & Reserve Your Perfect Spot": "Explore & Reserve Your Perfect Spot",
      "All Venues": "All Venues",
      "Restaurants": "Restaurants",
      "Cafes": "Cafes",
      "Bars": "Bars",
      "Beach Bars": "Beach Bars",
      "Other": "Other",
      "All": "All",
      "Clear": "Clear",

      "Your Next Reservation": "Your Next Reservation",
      "Table": "Table",
      "Venues": "Venues",
      "No venues available.": "No venues available.",
      "Full Venues": "Full Venues",
      "No full venues available.": "No full venues available.",
      "Cafes & Bars": "Cafes & Bars",
      "No cafes or bars available.": "No cafes or bars available.",
      "No restaurants available.": "No restaurants available.",
      "No beach bars available.": "No beach bars available.",
      "Other Venues": "Other Venues",
      "No other venues available.": "No other venues available.",

      "About": "About",
      "Menu": "Menu",
      "Photos": "Photos",
      "Reviews": "Reviews",
      "This venue has not added a menu yet.": "This venue has not added a menu yet.",
      "No photos available.": "No photos available.",
      "No reviews yet.": "No reviews yet.",
      "Reserve a Table": "Reserve a Table",
      "Log in to reserve": "Log in to reserve",

      "Available": "Available",
      "Full": "Full",
      "Mark as Available": "Mark as Available",
      "Mark as Full": "Mark as Full",

      "Reservation Requests & Guest Arrivals": "Reservation Requests & Guest Arrivals",
      "Reservation History": "Reservation History",
      "Analytics": "Analytics",
      "Manage Venue": "Manage Venue",
      "Pending Reservation Requests": "Pending Reservation Requests",
      "Guest Arrivals & Cancellations": "Guest Arrivals & Cancellations",
      "Customer": "Customer",
      "Date": "Date",
      "Time": "Time",
      "Guests": "Guests",
      "Status": "Status",
      "Action": "Action",
      "Edit": "Edit",
      "Save": "Save",
      "Cancel": "Cancel",
      "Update": "Update",
      "Change": "Change",

      "Reservation at:": "Reservation at:",
      "Status:": "Status:",
      "Guests:": "Guests:",
      "No reservations found.": "No reservations found.",

      "Reservation Pending": "Reservation Pending",
      "Thank you for your booking request. Your reservation is currently pending and requires confirmation from the venue administrator.":
        "Thank you for your booking request. Your reservation is currently pending and requires confirmation from the venue administrator.",
      "You’ll receive a confirmation or update shortly via email.":
        "You’ll receive a confirmation or update shortly via email.",
      "Back to Venue List": "Back to Venue List",

      "Cancel Reservation": "Cancel Reservation",
      "Are you sure you want to cancel your reservation at":
        "Are you sure you want to cancel your reservation at",
      "Yes, Cancel": "Yes, Cancel",
      "No, go back": "No, go back",

      "Edit Reservation": "Edit Reservation",
      "Edit Reservation for": "Edit Reservation for",
      "Edit Reservation Status": "Edit Reservation Status",
      "Update Reservation Status": "Update Reservation Status",
      "Update Status for Reservation": "Update Status for Reservation",
      "Select new status:": "Select new status:",
      "Update Status": "Update Status",
      "Confirm Update": "Confirm Update",
      "Are you sure you want to update the reservation status?":
        "Are you sure you want to update the reservation status?",
      "Are you sure you want to update the arrival status?":
        "Are you sure you want to update the arrival status?",
      "Yes, Update": "Yes, Update",

      "Update Arrival Status": "Update Arrival Status",
      "Move to Requests": "Move to Requests",
      "Move back to Reservation Requests": "Move back to Reservation Requests",
      "Check this if you want to move this booking back to the Reservation Requests table.":
        "Check this if you want to move this booking back to the Reservation Requests table.",
      "Arrival status": "Arrival status",

      "Pending": "Pending",
      "Accepted": "Accepted",
      "Rejected": "Rejected",
      "Cancelled": "Cancelled",
      "Checked in": "Checked in",
      "No show": "No show",

      "Group by:": "Group by:",
      "Daily (Last 30 days)": "Daily (Last 30 days)",
      "Weekly (Last 12 weeks)": "Weekly (Last 12 weeks)",
      "Monthly (Last 12 months)": "Monthly (Last 12 months)",
      "Yearly (Last 3 years)": "Yearly (Last 3 years)",
      "Total Visits": "Total Visits",
      "Avg Daily Visits": "Avg Daily Visits",
      "Peak Daily Visits": "Peak Daily Visits",
      "Total Reservations": "Total Reservations",

      "Sensitive & Contact Information": "Sensitive & Contact Information",
      "Venue Name": "Venue Name",
      "Venue name": "Venue name",
      "Venue type": "Venue type",
      "Type": "Type",
      "Location": "Location",
      "Description": "Description",
      "Capacity": "Capacity",
      "Admin name": "Admin name",
      "Admin email": "Admin email",
      "Email:": "Email:",
      "Phone:": "Phone:",
      "Venue preview": "Venue preview",
      "Menu preview": "Menu preview",
      "No files selected": "No files selected",
      "Select Venue Images": "Select Venue Images",
      "Select Menu Images": "Select Menu Images",
      "Submit for Approval": "Submit for Approval",

      "Application Submitted": "Application Submitted",
      "Thank you!": "Thank you!",
      "Your application has been submitted. We will review it and contact you shortly.":
        "Your application has been submitted. We will review it and contact you shortly.",
      "Back to Venues": "Back to Venues",
      "Apply to Register Your Venue": "Apply to Register Your Venue",
      "Submit Application": "Submit Application",

      "Make a Reservation": "Make a Reservation",
      "Reserve at": "Reserve at",
      "Reserve": "Reserve",

      "Summary for %(request.user.username)s": "Summary for %(request.user.username)s",
      "Total Venues:": "Total Venues:",
      "Total Reservations:": "Total Reservations:",

      "Name": "Name",
      "Phone": "Phone",
      "Date:": "Date:",
      "Customer:": "Customer:",
      "Party Size:": "Party Size:",
      "Message": "Message"
    }
  },

  el: {
    translation: {
      "Personal info": "Προσωπικά στοιχεία",
      "Permissions": "Δικαιώματα",
      "Important dates": "Σημαντικές ημερομηνίες",

      "Username": "Όνομα χρήστη",
      "Email": "Email",
      "Phone number": "Αριθμός τηλεφώνου",
      "Password": "Κωδικός πρόσβασης",
      "Confirm password": "Επιβεβαίωση κωδικού πρόσβασης",
      "User type": "Είδος χρήστη",
      "New password": "Νέος κωδικός πρόσβασης",
      "Confirm new password": "Επιβεβαίωση νέου κωδικού πρόσβασης",
      "Old password": "Παλιός κωδικός πρόσβασης",

      "Passwords do not match.": "Οι κωδικοί πρόσβασης δεν ταιριάζουν.",
      "Old password is incorrect.": "Ο παλιός κωδικός πρόσβασης είναι λανθασμένος.",
      "The new passwords do not match.": "Οι νέοι κωδικοί πρόσβασης δεν ταιριάζουν.",
      "Enter a valid phone number (7–15 digits, optional +).":
        "Εισάγετε έγκυρο αριθμό τηλεφώνου (7–15 ψηφία, προαιρετικά +).",

      "Your Venue Dashboard": "Ο πίνακας ελέγχου του χώρου σας",
      "Welcome, %(user.username)s — Your Venue Dashboard":
        "Καλώς ορίσατε, %(user.username)s — Ο πίνακας ελέγχου του χώρου σας",
      "You don't have any venues yet.": "Δεν έχετε καταχωρήσει ακόμη χώρους.",

      "Login": "Σύνδεση",
      "Welcome Back": "Καλώς ήρθατε πίσω",
      "Login with Google": "Σύνδεση με Google",
      "or": "ή",
      "Forgot your password?": "Ξεχάσατε τον κωδικό σας;",
      "Don't have an account?": "Δεν έχετε λογαριασμό;",
      "Sign up": "Εγγραφή",
      "Password recover": "Ανάκτηση κωδικού πρόσβασης",
      "Password Recovery": "Ανάκτηση Κωδικού Πρόσβασης",
      "Send Verification Code": "Αποστολή Κωδικού Επαλήθευσης",
      "Password reset": "Επαναφορά κωδικού πρόσβασης",
      "Reset Your Password": "Επαναφέρετε τον κωδικό πρόσβασής σας",
      "Change Password": "Αλλαγή κωδικού πρόσβασης",

      "Sign Up": "Εγγραφή",
      "Create Account": "Δημιουργία λογαριασμού",
      "Already have an account?": "Έχετε ήδη λογαριασμό;",

      "Verify Email": "Επαλήθευση Email",
      "Verify Your Email": "Επαληθεύστε το Email σας",
      "Please enter the 6-digit code we sent to your email address.":
        "Παρακαλώ εισάγετε τον 6-ψήφιο κωδικό που στείλαμε στη διεύθυνση email σας.",
      "Enter 6-digit code": "Εισαγωγή 6-ψήφιου κωδικού",
      "Verify": "Επαλήθευση",
      "Resend Code": "Επαναποστολή κωδικού",
      "Verification code expires in": "Ο κωδικός επαλήθευσης λήγει σε",
      "seconds": "δευτερόλεπτα",
      "Verification code has expired.": "Ο κωδικός επαλήθευσης έχει λήξει.",

      "Dashboard": "Πίνακας Ελέγχου",
      "View Dashboard": "Πίνακας Ελέγχου",
      "Profile": "Προφίλ",
      "Settings": "Ρυθμίσεις",
      "Dark Mode": "Σκοτεινή λειτουργία",
      "Toggle dark mode": "Εναλλαγή σκοτεινής λειτουργίας",
      "Logout": "Αποσύνδεση",

      "My Reservations": "Οι Κρατήσεις Μου",
      "Apply to Register a Venue": "Αίτηση Καταχώρησης Χώρου",

      "Venue Dashboard": "Πίνακας Ελέγχου Χώρου",
      "Browse Venues": "Περιήγηση στους Χώρους",
      "Explore & Reserve Your Perfect Spot": "Ανακαλύψτε και κλείστε το ιδανικό σας μέρος",
      "All Venues": "Όλοι οι Χώροι",
      "Restaurants": "Εστιατόρια",
      "Cafes": "Καφετέριες",
      "Bars": "Μπαρ",
      "Beach Bars": "Μπαρ Παραλίας",
      "Other": "Άλλοι",
      "All": "Όλα",
      "Clear": "Εκκαθάριση",

      "Your Next Reservation": "Η επόμενή σας κράτηση",
      "Table": "Τραπέζι",
      "Venues": "Χώροι",
      "No venues available.": "Δεν υπάρχουν διαθέσιμοι χώροι.",
      "Full Venues": "Πλήρεις Χώροι",
      "No full venues available.": "Δεν υπάρχουν πλήρεις χώροι.",
      "Cafes & Bars": "Καφετέριες & Μπαρ",
      "No cafes or bars available.": "Δεν υπάρχουν διαθέσιμες καφετέριες ή μπαρ.",
      "No restaurants available.": "Δεν υπάρχουν διαθέσιμα εστιατόρια.",
      "No beach bars available.": "Δεν υπάρχουν διαθέσιμα μπαρ παραλίας.",
      "Other Venues": "Άλλοι Χώροι",
      "No other venues available.": "Δεν υπάρχουν άλλοι διαθέσιμοι χώροι.",

      "About": "Σχετικά",
      "Menu": "Μενού",
      "Photos": "Φωτογραφίες",
      "Reviews": "Αξιολογήσεις",
      "This venue has not added a menu yet.": "Δεν έχει προστεθεί ακόμη μενού για αυτόν τον χώρο.",
      "No photos available.": "Δεν υπάρχουν διαθέσιμες φωτογραφίες.",
      "No reviews yet.": "Δεν υπάρχουν ακόμη αξιολογήσεις.",
      "Reserve a Table": "Κάντε Κράτηση",
      "Log in to reserve": "Συνδεθείτε για να κάνετε κράτηση",

      "Available": "Διαθέσιμο",
      "Full": "Πλήρες",
      "Mark as Available": "Σήμανση ως διαθέσιμο",
      "Mark as Full": "Σήμανση ως πλήρες",

      "Reservation Requests & Guest Arrivals": "Αιτήματα Κρατήσεων & Αφίξεις Επισκεπτών",
      "Reservation History": "Ιστορικό Κρατήσεων",
      "Analytics": "Αναλυτικά Στοιχεία",
      "Manage Venue": "Διαχείριση Χώρου",
      "Pending Reservation Requests": "Αιτήματα Κρατήσεων σε Εκκρεμότητα",
      "Guest Arrivals & Cancellations": "Αφίξεις Επισκεπτών & Ακυρώσεις",
      "Customer": "Πελάτης",
      "Date": "Ημερομηνία",
      "Time": "Ώρα",
      "Guests": "Αριθμός ατόμων",
      "Status": "Κατάσταση",
      "Action": "Ενέργεια",
      "Edit": "Επεξεργασία",
      "Save": "Αποθήκευση",
      "Cancel": "Ακύρωση",
      "Update": "Ενημέρωση",
      "Change": "Αλλαγή",

      "Reservation at:": "Κράτηση στο:",
      "Status:": "Κατάσταση:",
      "Guests:": "Αριθμός ατόμων:",
      "No reservations found.": "Δεν βρέθηκαν κρατήσεις.",

      "Reservation Pending": "Κράτηση σε Εκκρεμότητα",
      "Thank you for your booking request. Your reservation is currently pending and requires confirmation from the venue administrator.":
        "Ευχαριστούμε για το αίτημα κράτησής σας. Η κράτησή σας είναι σε εκκρεμότητα και απαιτεί επιβεβαίωση από τον διαχειριστή του χώρου.",
      "You’ll receive a confirmation or update shortly via email.":
        "Θα λάβετε σύντομα επιβεβαίωση ή ενημέρωση μέσω email.",
      "Back to Venue List": "Επιστροφή στη λίστα χώρων",

      "Cancel Reservation": "Ακύρωση Κράτησης",
      "Are you sure you want to cancel your reservation at":
        "Είστε σίγουροι ότι θέλετε να ακυρώσετε την κράτησή σας στο",
      "Yes, Cancel": "Ναι, ακύρωση",
      "No, go back": "Όχι, επιστροφή",

      "Edit Reservation": "Επεξεργασία Κράτησης",
      "Edit Reservation for": "Επεξεργασία Κράτησης για",
      "Edit Reservation Status": "Επεξεργασία Κατάστασης Κράτησης",
      "Update Reservation Status": "Ενημέρωση Κατάστασης Κράτησης",
      "Update Status for Reservation": "Ενημέρωση Κατάστασης για την Κράτηση",
      "Select new status:": "Επιλέξτε νέα κατάσταση:",
      "Update Status": "Ενημέρωση Κατάστασης",
      "Confirm Update": "Επιβεβαίωση Ενημέρωσης",
      "Are you sure you want to update the reservation status?":
        "Είστε σίγουροι ότι θέλετε να ενημερώσετε την κατάσταση της κράτησης;",
      "Are you sure you want to update the arrival status?":
        "Είστε σίγουροι ότι θέλετε να ενημερώσετε την κατάσταση άφιξης;",
      "Yes, Update": "Ναι, ενημέρωση",

      "Update Arrival Status": "Ενημέρωση Κατάστασης Άφιξης",
      "Move to Requests": "Μεταφορά στα αιτήματα",
      "Move back to Reservation Requests": "Μεταφορά πίσω στα αιτήματα κρατήσεων",
      "Check this if you want to move this booking back to the Reservation Requests table.":
        "Επιλέξτε αυτό αν θέλετε να μεταφέρετε αυτήν την κράτηση πίσω στον πίνακα αιτημάτων κρατήσεων.",
      "Arrival status": "Κατάσταση άφιξης",

      "Pending": "Σε εκκρεμότητα",
      "Accepted": "Δεκτή",
      "Rejected": "Απορρίφθηκε",
      "Cancelled": "Ακυρωμένη",
      "Checked in": "Έγινε άφιξη",
      "No show": "Δεν εμφανίστηκε",

      "Group by:": "Ομαδοποίηση κατά:",
      "Daily (Last 30 days)": "Ημερήσια (Τελευταίες 30 ημέρες)",
      "Weekly (Last 12 weeks)": "Εβδομαδιαία (Τελευταίες 12 εβδομάδες)",
      "Monthly (Last 12 months)": "Μηνιαία (Τελευταίοι 12 μήνες)",
      "Yearly (Last 3 years)": "Ετήσια (Τελευταία 3 χρόνια)",
      "Total Visits": "Συνολικές Επισκέψεις",
      "Avg Daily Visits": "Μέσος Όρος Ημερήσιων Επισκέψεων",
      "Peak Daily Visits": "Υψηλότερη Ημερήσια Επισκεψιμότητα",
      "Total Reservations": "Συνολικές Κρατήσεις",

      "Sensitive & Contact Information": "Πληροφορίες επικοινωνίας και ευαίσθητο περιεχόμενο",
      "Venue Name": "Όνομα Χώρου",
      "Venue name": "Όνομα Χώρου",
      "Venue type": "Τύπος Χώρου",
      "Type": "Τύπος",
      "Location": "Τοποθεσία",
      "Description": "Περιγραφή",
      "Capacity": "Χωρητικότητα",
      "Admin name": "Όνομα Διαχειριστή",
      "Admin email": "Email Διαχειριστή",
      "Email:": "Email:",
      "Phone:": "Τηλέφωνο:",
      "Venue preview": "Προεπισκόπηση χώρου",
      "Menu preview": "Προεπισκόπηση μενού",
      "No files selected": "Δεν έχουν επιλεγεί αρχεία",
      "Select Venue Images": "Επιλογή εικόνων χώρου",
      "Select Menu Images": "Επιλογή εικόνων μενού",
      "Submit for Approval": "Υποβολή για έγκριση",

      "Application Submitted": "Η αίτηση υποβλήθηκε",
      "Thank you!": "Ευχαριστούμε!",
      "Your application has been submitted. We will review it and contact you shortly.":
        "Η αίτησή σας υποβλήθηκε. Θα την εξετάσουμε και θα επικοινωνήσουμε μαζί σας σύντομα.",
      "Back to Venues": "Επιστροφή στους χώρους",
      "Apply to Register Your Venue": "Αίτηση για να καταχωρήσετε τον χώρο σας",
      "Submit Application": "Υποβολή αίτησης",

      "Make a Reservation": "Κάντε κράτηση",
      "Reserve at": "Κράτηση στο",
      "Reserve": "Κράτηση",

      "Summary for %(request.user.username)s": "Σύνοψη για τον χρήστη %(request.user.username)s",
      "Total Venues:": "Σύνολο Χώρων:",
      "Total Reservations:": "Συνολικές Κρατήσεις:",

      "Name": "Όνομα",
      "Phone": "Τηλέφωνο",
      "Date:": "Ημερομηνία:",
      "Customer:": "Πελάτης:",
      "Party Size:": "Αριθμός ατόμων:",
      "Message": "Μήνυμα"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "el"],
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"]
    }
  });

export default i18n;
