import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import LoginPage from "./pages/Login";
import MainPage from "./pages/App";
import JoinInvitePage from "./pages/JoinInvite";
import { useAuthStore } from "./lib/stores/authStore";
import ProtectedRoute from "./components/ProtectedRoute";

const AppRouter = (): JSX.Element => {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const loading = useAuthStore((s) => s.loading);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  if (loading) {
    return <div className="grid h-screen place-items-center bg-discord-dark5 text-discord-text">Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/invite/:inviteCode"
        element={<JoinInvitePage />}
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRouter;
