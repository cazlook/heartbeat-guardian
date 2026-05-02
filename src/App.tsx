import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { MatchRevealProvider } from "@/components/MatchRevealProvider";
import Index from "./pages/Index.tsx";
import Debug from "./pages/Debug.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";
import Discovery from "./pages/Discovery.tsx";
import Matches from "./pages/Matches.tsx";
import Chat from "./pages/Chat.tsx";
import ProfileSetup from "./pages/ProfileSetup.tsx";
import NotFound from "./pages/NotFound.tsx";
import { InAppBanner } from "@/components/InAppBanner";
import { useInAppNotifications } from "@/hooks/useInAppNotifications";

const GlobalNotifications = () => {
  const { banner, dismissBanner } = useInAppNotifications();
  return <InAppBanner banner={banner} onDismiss={dismissBanner} />;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <MatchRevealProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/discovery" element={<ProtectedRoute><Discovery /></ProtectedRoute>} />
              <Route path="/matches" element={<ProtectedRoute><Matches /></ProtectedRoute>} />
              <Route path="/chat/:matchId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="/profile/setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
              <Route path="/debug" element={<ProtectedRoute><Debug /></ProtectedRoute>} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </MatchRevealProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
