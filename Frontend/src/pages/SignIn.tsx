import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { dataCacheService } from "@/services/dataCacheService";
import { sharePointCacheService } from "@/services/sharePointCacheService";
import { signIn } from "@/services/authService";
import OptimizedImage from "@/components/ui/OptimizedImage";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

const SignIn = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Use database authentication service
      const result = await signIn(username, password);

      if (result.success && result.user) {
        // Start pre-loading both OneDrive and SharePoint data in background
        Promise.all([
          dataCacheService.preloadData(),
          sharePointCacheService.preloadData()
        ]).then(() => {
          console.log('✅ All data pre-loading completed');
        }).catch((error) => {
          console.error('❌ Data pre-loading failed:', error);
        });

        // Redirect based on role
        if (result.user.role === "project") {
          navigate("/summary");
        } else if (result.user.role === "CEO") {
          navigate("/main-plan");
        } else if (result.user.role === "department") {
          navigate("/department-objectives");
        } else {
          navigate("/dashboard");
        }
      } else {
        toast({
          title: "Sign in failed",
          description: result.error || "Invalid username or password",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Sign in error:', error);
      toast({
        title: "Sign in failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-background via-primary/5 to-accent/5 flex items-center justify-center p-3 pt-16 sm:p-4 sm:pt-4">
      {/* Mobile-safe placement for theme switch without affecting desktop layout */}
      <div className="absolute z-10 top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1 shadow-sm">
        <ThemeToggle />
        <span className="text-[11px] sm:text-xs font-medium text-muted-foreground leading-none">
          {mounted && resolvedTheme === "dark" ? "Dark Mode" : "Light Mode"}
        </span>
      </div>
      {/* Keep desktop row, tighten and stack naturally on small screens */}
      <div className="w-full max-w-5xl flex flex-col md:flex-row items-center justify-center gap-6 sm:gap-8 md:gap-16">
        {/* Logo Area */}
        <div className="flex-1 w-full flex flex-col items-center justify-center text-center">
            <OptimizedImage 
              src="/lovable-uploads/5e72745e-18ec-46d6-8375-e9912bdb8bdd.png" 
              alt="Life Makers Egypt" 
              className="w-32 h-32 max-[480px]:w-36 max-[480px]:h-36 sm:w-40 sm:h-40 md:w-64 md:h-64 max-w-full h-auto object-contain mb-2 sm:mb-4 md:mb-0"
              sizes="(max-width: 768px) 160px, 256px"
            />
          <div className="hidden md:block mt-4 md:mt-6">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-relaxed break-words mb-2">Strategic Plan 2026</h1>
          </div>
        </div>
        {/* Sign In Card */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
          <Card className="border-0 shadow-2xl w-full max-w-full">
          <CardHeader className="space-y-1 text-center p-5 sm:p-6">
            <CardTitle className="text-xl sm:text-2xl font-semibold flex items-center justify-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Sign In
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Enter your credentials to access the 4DX insights
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 sm:p-6 sm:pt-0">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 min-h-[44px]"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-[44px]"
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
            {/*
            <div className="mt-6 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium text-muted-foreground mb-2">Demo Credentials:</p>
              <div className="text-xs space-y-1 text-muted-foreground">
                  <p><strong>CEO:</strong> CEO / Life@2025</p>
                  <p><strong>Departments:</strong> hr, it, operations, communication, dfr, case, bdm, security, admin, procurement, offices, community / Life@0000</p>
              </div>
            </div>
            */}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
