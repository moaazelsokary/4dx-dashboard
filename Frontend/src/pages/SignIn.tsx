import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { dataCacheService } from "@/services/dataCacheService";
import { sharePointCacheService } from "@/services/sharePointCacheService";

const SignIn = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Mock authentication - departments must match environment configuration (lowercase)
  const mockUsers = {
    "CEO": { role: "CEO", departments: ["all"], password: "Life@2025" },
    "hr": { role: "department", departments: ["hr"], password: "Life@0000" },
    "it": { role: "department", departments: ["it"], password: "Life@0000" },
    "operations": { role: "department", departments: ["operations"], password: "Life@0000" },
    "communication": { role: "department", departments: ["communication"], password: "Life@0000" },
    "dfr": { role: "department", departments: ["dfr"], password: "Life@0000" },
    "case": { role: "department", departments: ["case"], password: "Life@0000" },
    "bdm": { role: "department", departments: ["bdm"], password: "Life@0000" },
    "security": { role: "department", departments: ["security"], password: "Life@0000" },
    "admin": { role: "CEO", departments: ["all"], password: "Life@2025" },
    "procurement": { role: "department", departments: ["procurement"], password: "Life@0000" },
    "offices": { role: "department", departments: ["offices"], password: "Life@0000" },
    "community": { role: "department", departments: ["community"], password: "Life@0000" },
    "volunteers": { role: "department", departments: ["volunteers"], password: "Life@0000" },
    "finance": { role: "department", departments: ["finance"], password: "Life@0000" },
    "administrative": { role: "department", departments: ["administrative"], password: "Life@0000" },
    "project": { role: "project", departments: ["project"], password: "Life@0000" }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate authentication delay
    setTimeout(async () => {
      if (mockUsers[username as keyof typeof mockUsers] && password === mockUsers[username as keyof typeof mockUsers].password) {
        const user = mockUsers[username as keyof typeof mockUsers];
        
        // Store user info in localStorage (in real app, use proper session management)
        localStorage.setItem("user", JSON.stringify({
          username,
          role: user.role,
          departments: user.departments
        }));

        // Start pre-loading both OneDrive and SharePoint data in background
        Promise.all([
          dataCacheService.preloadData(),
          sharePointCacheService.preloadData()
        ]).then(() => {
          console.log('✅ All data pre-loading completed');
        }).catch((error) => {
          console.error('❌ Data pre-loading failed:', error);
        });

        // Removed welcome toast - silent sign in

        // Redirect based on role
        if (user.role === "project") {
          navigate("/summary");
        } else if (user.role === "CEO") {
          navigate("/main-plan");
        } else if (user.role === "department") {
          navigate("/department-objectives");
        } else {
          navigate("/dashboard");
        }
      } else {
        toast({
          title: "Sign in failed",
          description: "Invalid username or password",
          variant: "destructive",
        });
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-5xl flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
        {/* Logo Area */}
        <div className="flex-1 flex flex-col items-center md:items-start justify-center">
            <img 
              src="/lovable-uploads/5e72745e-18ec-46d6-8375-e9912bdb8bdd.png" 
              alt="Life Makers Egypt" 
            className="w-40 h-40 md:w-64 md:h-64 object-contain mb-4 md:mb-0"
            />
          <div className="hidden md:block mt-6">
            <h1 className="text-4xl font-bold text-foreground mb-2">Strategic Plan 2026</h1>
          </div>
        </div>
        {/* Sign In Card */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
          <Card className="border-0 shadow-2xl w-full">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-semibold flex items-center justify-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Sign In
            </CardTitle>
            <CardDescription>
              Enter your credentials to access the 4DX insights
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                    className="pl-10"
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
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
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
