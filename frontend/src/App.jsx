import './App.css'
import Layout from './layouts/Layout';

import { Routes, Route } from "react-router-dom";

import VenuesPage from './pages/VenuesPage';
import VenueDetailPage from './pages/VenueDetailPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ProfilePage from './pages/ProfilePage';
import VenueDashboardPage from './pages/VenueDashboardPage';
// import ApplyVenue from './pages/ApplyVenue';
// import Login from './pages/Login';
// import Signup from './pages/Signup';

export default function App() {
	return (
		<Routes>
			<Route element={<Layout />}>
				<Route path="/" element={<VenuesPage />} />
				<Route path="/venues/:venueId" element={<VenueDetailPage />} />
				<Route path="/venues/venue/:venueId" element={<VenueDetailPage />} />
				<Route path="/venues/dashboard/:venueId" element={<VenueDashboardPage />} />
				<Route path="/accounts/login" element={<LoginPage />} />
				<Route path="/accounts/signup" element={<SignupPage />} />
				<Route path="/accounts/verify-email" element={<VerifyEmailPage />} />
				<Route path="/accounts/profile" element={<ProfilePage />} />
				{/* <Route path="/venues/apply-venue" element={<ApplyVenue />} /> */}
			</Route>
		</Routes>
	)
}
