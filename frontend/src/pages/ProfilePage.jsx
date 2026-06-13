import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles/auth.css";

const editableFields = [
  ["firstname", "First name", "text"],
  ["lastname", "Last name", "text"],
  ["username", "Username", "text"],
  ["phone_number", "Phone number", "text"],
];

function authHeaders() {
  const token = localStorage.getItem("access") || localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    username: "",
    phone_number: "",
  });
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = authHeaders().Authorization;
    if (!token) {
      navigate("/accounts/login");
      return;
    }

    let cancelled = false;
    axios
      .get("/api/v1/accounts/profile/", {
        headers: authHeaders(),
        withCredentials: true,
      })
      .then((res) => {
        if (cancelled) return;
        setForm({
          firstname: res.data.firstname || "",
          lastname: res.data.lastname || "",
          username: res.data.username || "",
          phone_number: res.data.phone_number || "",
        });
        setEmail(res.data.email || "");
        localStorage.setItem("user", JSON.stringify(res.data));
        window.dispatchEvent(new Event("auth:changed"));
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("auth:changed"));
        navigate("/accounts/login");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await axios.patch("/api/v1/accounts/profile/", form, {
        headers: authHeaders(),
        withCredentials: true,
      });
      localStorage.setItem("user", JSON.stringify(res.data));
      window.dispatchEvent(new Event("auth:changed"));
      setMessageType("success");
      setMessage("Profile updated.");
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.detail || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Profile</h2>

      {message && <div className={`auth-message ${messageType}`}>{message}</div>}

      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="profile-email">Email</label>
          <input id="profile-email" type="email" value={email} disabled />
        </div>

        {editableFields.map(([name, label, type]) => (
          <div className="auth-field" key={name}>
            <label htmlFor={`profile-${name}`}>{label}</label>
            <input
              id={`profile-${name}`}
              name={name}
              type={type}
              value={form[name]}
              onChange={updateField}
              disabled={loading}
            />
          </div>
        ))}

        <button className="auth-submit" type="submit" disabled={loading || saving}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </div>
  );
}
