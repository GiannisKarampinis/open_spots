import "./App.css";
import Layout from "./layouts/Layout";
import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

const VenuesPage = lazy(() => import("./pages/VenuesPage"));
const VenueDetailPage = lazy(() => import("./pages/VenueDetailPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const VenueDashboardPage = lazy(() => import("./pages/VenueDashboardPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const PasswordRecoverPage = lazy(() => import("./pages/PasswordRecoverPage"));
const PasswordResetPage = lazy(() => import("./pages/PasswordResetPage"));
const ApplyVenuePage = lazy(() => import("./pages/ApplyVenuePage"));
const ReservationPendingPage = lazy(() => import("./pages/ReservationPendingPage"));
const MyReservationsPage = lazy(() => import("./pages/MyReservationsPage"));
const ReservationFormPage = lazy(() => import("./pages/ReservationFormPage"));
const ConfirmCancelPage = lazy(() => import("./pages/ConfirmCancelPage"));
const SocialLoginCompletePage = lazy(() => import("./pages/SocialLoginCompletePage"));

export default function App() {
  return (
    <>
      <Suspense fallback={<div role="status">Loading page...</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<VenuesPage />} />

            <Route path="/venues/:venueId" element={<VenueDetailPage />} />
            <Route path="/venues/venue/:venueId" element={<VenueDetailPage />} />
            <Route path="/venues/dashboard/:venueId" element={<VenueDashboardPage />} />

            <Route path="/venues/about" element={<AboutPage />} />
            <Route path="/venues/apply-venue" element={<ApplyVenuePage />} />

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
      </Suspense>
    </>
  );
}
