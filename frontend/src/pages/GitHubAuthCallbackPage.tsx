import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { API_BASE } from "../lib/api";

export function GitHubAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const code = searchParams.get("code");

    if (!code) {
      navigate("/?auth_error=GitHub authentication failed.", { replace: true });
      return;
    }

    void fetch(`${API_BASE}/auth/github/exchange/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("GitHub authentication failed");
        return response.json();
      })
      .then(({ access, refresh }) => {
        login({ access, refresh });
        sessionStorage.setItem("justLoggedIn", "true");
        window.location.replace("/dashboard");
      })
      .catch(() => {
        navigate("/?auth_error=GitHub authentication failed.", {
          replace: true,
        });
      });
  }, [login, navigate, searchParams]);

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="rounded-2xl border-4 border-black bg-white px-8 py-6 text-center shadow-card-lg">
        <p className="text-lg font-black uppercase text-black">
          Finishing GitHub sign in...
        </p>
      </div>
    </div>
  );
}

export default GitHubAuthCallbackPage;
