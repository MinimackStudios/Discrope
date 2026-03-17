import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../lib/stores/authStore";

type Props = {
  children: JSX.Element;
};

const ProtectedRoute = ({ children }: Props): JSX.Element => {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
};

export default ProtectedRoute;
