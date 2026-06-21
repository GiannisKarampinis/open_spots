import  React, { useEffect, useRef, useState } from "react";
import  { Link, useNavigate } from "react-router-dom";
import  { Outlet }  from "react-router-dom";
import  { clearStoredAuth, getAccessToken, getWithAuth, logoutSession, readStoredUser } from "../utils/auth";
import  "../styles/base.css";
import  { useTranslation } from "react-i18next";
import  i18n        from "../i18n.jsx";

// LOGO SVG COMPONENT

const LogoIcon = ({ width = 170, height = 44, color = "#ffffff", className }) => {
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 370.405 94.611"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        transform="matrix(0.16261747,0,0,0.16261747,-9.6107,-9.6107)"
        fill={color}
      >
        <g>
          <path d="M350,640.9c-76.1,0-147.7-9.6-201.7-27c-58.4-18.8-89.2-44.3-89.2-73.6c0-37.7,52.5-69.6,144-87.4c5.4-1.1,10.7,2.5,11.7,7.9s-2.5,10.7-7.9,11.7c-39.7,7.7-72.7,18.6-95.6,31.3C96.6,512,79,525,79,540.3c0,38.1,111.3,80.6,270.9,80.6s270.9-42.5,270.9-80.6c0-15.2-17.6-28.2-32.3-36.5c-22.8-12.8-55.9-23.6-95.5-31.3c-5.4-1.1-9-6.3-7.9-11.7c1.1-5.4,6.3-9,11.7-7.9c91.5,17.8,144,49.7,144,87.4c0,29.3-30.8,54.8-89.2,73.6C497.7,631.3,426.1,640.9,350,640.9z"/>
        </g>

        <g>
          <path d="M350,550.3c-2.7,0-5.2-1.1-7.1-2.9c-0.5-0.5-46.3-46.5-91.5-105.2c-61.5-80-92.7-144.5-92.7-191.9c0-105.5,85.8-191.2,191.2-191.2s191.2,85.8,191.2,191.2c0,47.4-31.2,111.9-92.7,191.9c-45.2,58.7-91,104.7-91.5,105.2C355.2,549.3,352.7,550.3,350,550.3z M350,79.1c-94.4,0-171.2,76.8-171.2,171.2c0,91.4,138.1,241.1,171.2,275.7c33.1-34.6,171.2-184.2,171.2-275.7C521.2,155.9,444.4,79.1,350,79.1z"/>
        </g>

        <g>
          <path d="M395.3,242.2c-5.5,0-10-4.5-10-10v-54.4c0-5.5,4.5-10,10-10s10,4.5,10,10v54.4C405.3,237.7,400.8,242.2,395.3,242.2z"/>
          <path d="M395.3,369.1c-15.5,0-28.1-12.6-28.1-28.1v-63.9c-15.7-4.4-27.2-18.8-27.2-35.8v-72.5c0-5.5,4.5-10,10-10s10,4.5,10,10v72.5c0,9.5,7.7,17.2,17.2,17.2c5.5,0,10,4.5,10,10V341c0,4.5,3.6,8.1,8.1,8.1s8.1-3.6,8.1-8.1v-72.5c0-5.5,4.5-10,10-10c9.5,0,17.2-7.7,17.2-17.2v-72.5c0-5.5,4.5-10,10-10s10,4.5,10,10v72.5c0,17-11.5,31.4-27.2,35.8V341C423.4,356.4,410.8,369.1,395.3,369.1z"/>
        </g>

        <g>
          <path d="M295.6,369.1c-15.5,0-28.1-12.6-28.1-28.1v-50.2l-15.2-15.2c-1.9-1.9-2.9-4.4-2.9-7.1v-36.2c0-37.5,17.5-55.6,32.1-64.1c15.7-9.2,31.6-9.3,32.2-9.3c5.5,0,10,4.5,10,10v172.2C323.8,356.4,311.1,369.1,295.6,369.1z M269.4,264.3l15.2,15.2c1.9,1.9,2.9,4.4,2.9,7.1V341c0,4.5,3.6,8.1,8.1,8.1s8.1-3.6,8.1-8.1V180.3c-3.8,1-8.3,2.7-12.8,5.3c-14.3,8.7-21.6,24.3-21.6,46.5L269.4,264.3z"/>
        </g>
      </g>

      <g
        transform="matrix(2.8109771323318022,0,0,2.8109771323318022,113.03231654351907,4.391337067167662)"
        fill={color}
      >
         <path d="M0.7 14.76 c0 -2.7 1.52 -5.52 4.86 -5.52 s4.86 2.82 4.86 5.52 s-1.52 5.52 -4.86 5.52 s-4.86 -2.82 -4.86 -5.52 z M2.52 14.76 c0 1.4 0.52 4 3.04 4 s3.04 -2.6 3.04 -4 s-0.52 -4 -3.04 -4 s-3.04 2.6 -3.04 4 z M13.96 15.26 c0 2.78 1.74 3.52 2.86 3.52 c1.92 0 2.82 -1.74 2.82 -4.04 c0 -1.34 -0.14 -3.92 -2.86 -3.92 c-2.54 0 -2.82 2.74 -2.82 4.44 z M12.28 24.14 l0 -14.6 l1.66 0 l0 1.48 l0.04 0 c0.42 -0.6 1.22 -1.78 3.12 -1.78 c2.78 0 4.36 2.28 4.36 5.22 c0 2.5 -1.04 5.84 -4.6 5.84 c-1.4 0 -2.32 -0.66 -2.78 -1.4 l-0.04 0 l0 5.24 l-1.76 0 z M30.66 16.72 l1.76 0 c-0.06 0.5 -0.54 1.98 -1.86 2.86 c-0.48 0.32 -1.16 0.72 -2.84 0.72 c-2.94 0 -4.68 -2.22 -4.68 -5.24 c0 -3.24 1.56 -5.82 5.02 -5.82 c3.02 0 4.5 2.4 4.5 6.1 l-7.64 0 c0 2.18 1.02 3.44 3.04 3.44 c1.66 0 2.64 -1.28 2.7 -2.06 z M24.92 13.94 l5.82 0 c-0.1 -1.62 -0.78 -3.12 -2.92 -3.12 c-1.62 0 -2.9 1.5 -2.9 3.12 z M43.18 12.88 l0 7.12 l-1.76 0 l0 -6.44 c0 -1.82 -0.52 -2.74 -2.24 -2.74 c-1 0 -2.76 0.64 -2.76 3.48 l0 5.7 l-1.76 0 l0 -10.46 l1.66 0 l0 1.48 l0.04 0 c0.38 -0.56 1.36 -1.78 3.16 -1.78 c1.62 0 3.66 0.66 3.66 3.64 z M53.42 12.52 l-1.7 0 c-0.02 -0.66 -0.26 -1.76 -2.48 -1.76 c-0.54 0 -2.08 0.18 -2.08 1.48 c0 0.86 0.54 1.06 1.9 1.4 l1.76 0.44 c2.18 0.54 2.94 1.34 2.94 2.76 c0 2.16 -1.78 3.46 -4.14 3.46 c-4.14 0 -4.44 -2.4 -4.5 -3.66 l1.7 0 c0.06 0.82 0.3 2.14 2.78 2.14 c1.26 0 2.4 -0.5 2.4 -1.66 c0 -0.84 -0.58 -1.12 -2.08 -1.5 l-2.04 -0.5 c-1.46 -0.36 -2.42 -1.1 -2.42 -2.54 c0 -2.3 1.9 -3.34 3.96 -3.34 c3.74 0 4 2.76 4 3.28 z M57.32 15.26 c0 2.78 1.74 3.52 2.86 3.52 c1.92 0 2.82 -1.74 2.82 -4.04 c0 -1.34 -0.14 -3.92 -2.86 -3.92 c-2.54 0 -2.82 2.74 -2.82 4.44 z M55.64 24.14 l0 -14.6 l1.66 0 l0 1.48 l0.04 0 c0.42 -0.6 1.22 -1.78 3.12 -1.78 c2.78 0 4.36 2.28 4.36 5.22 c0 2.5 -1.04 5.84 -4.6 5.84 c-1.4 0 -2.32 -0.66 -2.78 -1.4 l-0.04 0 l0 5.24 l-1.76 0 z M66.3 14.76 c0 -2.7 1.52 -5.52 4.86 -5.52 s4.86 2.82 4.86 5.52 s-1.52 5.52 -4.86 5.52 s-4.86 -2.82 -4.86 -5.52 z M68.12 14.76 c0 1.4 0.52 4 3.04 4 s3.04 -2.6 3.04 -4 s-0.52 -4 -3.04 -4 s-3.04 2.6 -3.04 4 z M81.86 11 l-1.68 0 l0 6.8 c0 0.82 0.7 0.82 1.06 0.82 l0.62 0 l0 1.38 c-0.64 0.06 -1.14 0.14 -1.32 0.14 c-1.74 0 -2.12 -0.98 -2.12 -2.24 l0 -6.9 l-1.42 0 l0 -1.46 l1.42 0 l0 -2.92 l1.76 0 l0 2.92 l1.68 0 l0 1.46 z M91.22 12.52 l-1.7 0 c-0.02 -0.66 -0.26 -1.76 -2.48 -1.76 c-0.54 0 -2.08 0.18 -2.08 1.48 c0 0.86 0.54 1.06 1.9 1.4 l1.76 0.44 c2.18 0.54 2.94 1.34 2.94 2.76 c0 2.16 -1.78 3.46 -4.14 3.46 c-4.14 0 -4.44 -2.4 -4.5 -3.66 l1.7 0 c0.06 0.82 0.3 2.14 2.78 2.14 c1.26 0 2.4 -0.5 2.4 -1.66 c0 -0.84 -0.58 -1.12 -2.08 -1.5 l-2.04 -0.5 c-1.46 -0.36 -2.42 -1.1 -2.42 -2.54 c0 -2.3 1.9 -3.34 3.96 -3.34 c3.74 0 4 2.76 4 3.28 z"/>
      </g>
    </svg>
  );
};


// MAIN LAYOUT COMPONENT

export default function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [user, setUser] = useState(null);
  const [ownedVenue, setOwnedVenue] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    const storedUser = readStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }

    let cancelled = false;
    const syncAuth = () => setUser(readStoredUser());
    window.addEventListener("auth:changed", syncAuth);
    window.addEventListener("storage", syncAuth);

    getWithAuth("/api/v1/accounts/profile/")
      .then((res) => {
        if (cancelled || !res) return;
        setUser(res.data);
        localStorage.setItem("user", JSON.stringify(res.data));
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredAuth();
        setUser(null);
      });

    return () => {
      cancelled = true;
      window.removeEventListener("auth:changed", syncAuth);
      window.removeEventListener("storage", syncAuth);
    };
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !user) {
      setOwnedVenue(null);
      return undefined;
    }

    let cancelled = false;
    getWithAuth("/api/v1/venues/owned/")
      .then((res) => {
        if (!cancelled && res) setOwnedVenue(res.data);
      })
      .catch(() => {
        if (!cancelled) setOwnedVenue(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    document.body.classList.toggle("dark-theme", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);
  
  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
    localStorage.setItem("i18nextLng", lang);
  };

  const logout = async () => {
    await logoutSession();
    setUser(null);
    setOwnedVenue(null);
    setMenuOpen(false);
    setSettingsOpen(false);
    navigate("/accounts/login");
  };

  const displayName = user?.full_name || user?.username || user?.email;

  return (
    <>
      <header>
        <Link to="/" className="logo-link">
          <LogoIcon className="logo" />
        </Link>

        <nav className="main-nav">
          
          <Link to="/venues/about" className="nav-link">{t("About")}</Link>
          <span className="separator">|</span>

          <select
            onChange  = {handleLanguageChange}
            value     = {i18n.language?.startsWith("el") ? "el" : "en"}
            className = "language-dropdown"
          >
            <option value="en">EN</option>
            <option value="el">GR</option>
          </select>

          {user ? (
            <>
            {ownedVenue && (
              <>
                <span className="separator">|</span>
                <Link to={`/venues/dashboard/${ownedVenue.id}`} className="dashboard-link">
                  {t("View Dashboard")}
                </Link>
              </>
            )}
            <div className="user-menu" ref={menuRef}>
              <button
                className="user-menu-btn"
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                {displayName}
                <span className={`triangle ${menuOpen ? "rotate" : ""}`}>▼</span>
              </button>

              <div className={`user-dropdown ${menuOpen ? "show" : ""}`} role="menu">
                <Link to="/accounts/profile" role="menuitem" onClick={() => setMenuOpen(false)}>
                  {t("Profile")}
                </Link>
                <Link to="/venues/my-reservations" role="menuitem" onClick={() => setMenuOpen(false)}>
                  {t("My Reservations")}
                </Link>

                <div className={`submenu ${settingsOpen ? "open" : ""}`}>
                  <button
                    className="submenu-btn"
                    type="button"
                    onClick={() => setSettingsOpen((current) => !current)}
                  >
                    {t("Settings")} <span className="triangle">▼</span>
                  </button>
                  <div className="submenu-content">
                    <div className="theme-toggle-container">
                      <span className="theme-label">{t("Dark Mode")}</span>
                      <label className="switch" aria-label={t("Toggle dark mode")}>
                        <input
                          type="checkbox"
                          checked={darkMode}
                          onChange={(event) => setDarkMode(event.target.checked)}
                        />
                        <span className="slider round" aria-hidden="true"></span>
                      </label>
                    </div>
                  </div>
                </div>

                <button className="logout-link" type="button" role="menuitem" onClick={logout}>
                  {t("Logout")}
                </button>
              </div>
            </div>
            </>
          ) : (
            <>
              <span className="separator">|</span>

              <Link to="/accounts/login" className="nav-link">{t("Login")}</Link>

              <span className="separator">|</span>

              <Link to="/accounts/signup" className="nav-link">{t("Sign Up")}</Link>
              <span className="separator">|</span>
              <Link to="/venues/apply-venue" className="nav-link">{t("List your venue")}</Link>
            </>
          )}
        </nav>
      </header>

      <main><Outlet /></main>

      <footer>© 2025 OpenSpots. All rights reserved.</footer>
    </>
  );
}
