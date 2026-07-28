import "./App.css";
import Layout from "./layouts/Layout";

import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import VenuesPage from "./pages/VenuesPage";
import VenueDetailPage from "./pages/VenueDetailPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ProfilePage from "./pages/ProfilePage";
import VenueDashboardPage from "./pages/VenueDashboardPage";
import AboutPage from "./pages/AboutPage";
import PasswordRecoverPage from "./pages/PasswordRecoverPage";
import PasswordResetPage from "./pages/PasswordResetPage";
import ApplyVenuePage from "./pages/ApplyVenuePage";
import ApplicationSubmittedPage from "./pages/ApplicationSubmittedPage";
import ReservationPendingPage from "./pages/ReservationPendingPage";
import MyReservationsPage from "./pages/MyReservationsPage";
import ReservationFormPage from "./pages/ReservationFormPage";
import ConfirmCancelPage from "./pages/ConfirmCancelPage";
import SocialLoginCompletePage from "./pages/SocialLoginCompletePage";

function RememberLastPage() {
  const location = useLocation();

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;

    const isAuthPage =
      path.startsWith("/accounts/login") ||
      path.startsWith("/accounts/signup") ||
      path.startsWith("/accounts/password-recover") ||
      path.startsWith("/accounts/reset-password") ||
      path.startsWith("/accounts/verify-email") ||
      path.startsWith("/accounts/social-login-complete");

    if (!isAuthPage) {
      sessionStorage.setItem("redirectAfterLogin", path);
    }
  }, [location]);

  return null;
}

export default function App() {
  return (
    <>
      <RememberLastPage />

      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<VenuesPage />} />

          <Route path="/venues/:venueId" element={<VenueDetailPage />} />
          <Route path="/venues/venue/:venueId" element={<VenueDetailPage />} />
          <Route path="/venues/dashboard/:venueId" element={<VenueDashboardPage />} />

          <Route path="/venues/about" element={<AboutPage />} />
          <Route path="/venues/apply-venue" element={<ApplyVenuePage />} />
          <Route
            path="/venues/application-submitted"
            element={<ApplicationSubmittedPage />}
          />

          <Route path="/venues/reservation-pending" element={<ReservationPendingPage />} />
          <Route path="/venues/my-reservations" element={<MyReservationsPage />} />
          <Route
            path="/venues/book/:venueId"
            element={<ReservationFormPage mode="create" />}
          />
          <Route
            path="/venues/reservations/:reservationId/edit"
            element={<ReservationFormPage mode="edit" />}
          />
          <Route
            path="/venues/reservation/:reservationId/cancel"
            element={<ConfirmCancelPage />}
          />

          <Route path="/accounts/login" element={<LoginPage />} />
          <Route path="/accounts/signup" element={<SignupPage />} />
          <Route path="/accounts/verify-email" element={<VerifyEmailPage />} />
          <Route path="/accounts/profile" element={<ProfilePage />} />
          <Route
            path="/accounts/social-login-complete"
            element={<SocialLoginCompletePage />}
          />

          <Route path="/accounts/password-recover" element={<PasswordRecoverPage />} />
          <Route path="/accounts/password-recover/" element={<PasswordRecoverPage />} />
          <Route path="/accounts/reset-password" element={<PasswordResetPage />} />
          <Route path="/accounts/reset-password/" element={<PasswordResetPage />} />
        </Route>
      </Routes>
    </>
  );
}